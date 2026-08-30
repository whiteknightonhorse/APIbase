import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
  PROVIDER_BACKOFF_BASE_MS,
} from '../../types/provider';
import type {
  GlobalHealthCovidIndexRow,
  GlobalHealthCovidEpidemiologyRow,
  GlobalHealthCovidHospitalizationsRow,
  GlobalHealthCovidVaccinationsRow,
  GlobalHealthCovidLocationHistoryRow,
} from './types';

const BASE = 'https://storage.googleapis.com/covid19-open-data/v3';
const INDEX_URL = `${BASE}/index.csv`;
const HEADERS = {
  Accept: 'text/csv, text/plain, */*',
  'User-Agent': 'APIbase/1.0 (https://apibase.pro; public-health data aggregation)',
};

/** location_key: 2-letter country code, or "{country}_{subregion}[_{locality}]" for subnational levels. */
const LOCATION_KEY_RE = /^[A-Z0-9]{2,3}(_[A-Z0-9]{1,8}){0,2}$/;

type LatestDataset = 'epidemiology' | 'hospitalizations' | 'vaccinations';

const LATEST_URLS: Record<LatestDataset, string> = {
  epidemiology: `${BASE}/latest/epidemiology.csv`,
  hospitalizations: `${BASE}/latest/hospitalizations.csv`,
  vaccinations: `${BASE}/latest/vaccinations.csv`,
};

/** Fields projected from the raw 700+ column location history CSV — see class doc below. */
const HISTORY_FIELDS = [
  'date',
  'new_confirmed',
  'new_deceased',
  'cumulative_confirmed',
  'cumulative_deceased',
  'new_hospitalized_patients',
  'current_hospitalized_patients',
  'new_persons_vaccinated',
  'cumulative_persons_vaccinated',
  'new_persons_fully_vaccinated',
  'cumulative_persons_fully_vaccinated',
  'population',
] as const;

const FROZEN_NOTE =
  'Historical data only — Google discontinued real-time updates to the "COVID-19 Open Data" ' +
  'dataset on September 15, 2022. Data remains available without interruption but will not ' +
  'receive further updates (no data after ~2022-09).';

/**
 * Google "COVID-19 Open Data" adapter (UC-639).
 *
 * Tools (read-only, no auth required — CC BY license per the project README's Licensing
 * section, resale/commercial reuse permitted with attribution, same class as ECDC UC-625):
 *   global-health-covid.location_search    → search/list locations from v3/index.csv
 *   global-health-covid.latest_snapshot     → latest known row for one location from one of
 *                                             v3/latest/{epidemiology,hospitalizations,vaccinations}.csv
 *   global-health-covid.location_history    → full daily time series for one location, PROJECTED
 *                                             down from the raw v3/location/{key}.csv (700+ columns,
 *                                             including demographic/policy/search-trends covariates
 *                                             that are NEVER exposed) to the 12 curated fields in
 *                                             HISTORY_FIELDS above.
 *
 * FROZEN DATASET: the upstream repo (GoogleCloudPlatform/covid-19-open-data) stopped real-time
 * updates on 2022-09-15 — this is historical-only data, mirroring the already-live ecdc-surveillance
 * adapter (UC-625). Long cache_ttl in tool_provider_config.yaml is appropriate (data will not change).
 *
 * All responses are static CSV files (no query API), so every call fetches the relevant full file
 * then filters server-side — the OFAC/ecdc-surveillance "fetch-full-then-filter" pattern. Because
 * responses are text/csv (not JSON), buildRequest/parseResponse are unused stubs and all logic
 * lives in call(), the same shape as the bank-of-england and gebco/meteostat adapters.
 */
export class GlobalHealthCovidAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'global-health-covid',
      baseUrl: BASE,
      timeoutMs: 15_000,
      maxResponseBytes: 3_500_000,
    });
  }

  protected buildRequest(_req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    throw new Error('GlobalHealthCovidAdapter.buildRequest() should not be called directly');
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    return raw.body;
  }

  override async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const start = performance.now();
    const params = (req.params ?? {}) as Record<string, unknown>;

    let body: unknown;
    switch (req.toolId) {
      case 'global-health-covid.location_search': {
        const csv = await this.fetchCsv(INDEX_URL, req);
        body = parseLocationSearch(csv, params);
        break;
      }
      case 'global-health-covid.latest_snapshot': {
        const dataset = String(params.dataset ?? '') as LatestDataset;
        const url = LATEST_URLS[dataset];
        if (!url) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: `Invalid dataset "${String(params.dataset)}" — must be one of: epidemiology, hospitalizations, vaccinations`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        const locationKey = validateLocationKey(params.location_key, req, this.provider);
        const csv = await this.fetchCsv(url, req);
        body = parseLatestSnapshot(csv, dataset, locationKey);
        break;
      }
      case 'global-health-covid.location_history': {
        const locationKey = validateLocationKey(params.location_key, req, this.provider);
        const url = `${BASE}/location/${encodeURIComponent(locationKey)}.csv`;
        const csv = await this.fetchCsv(url, req);
        body = parseLocationHistory(csv, params);
        break;
      }
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }

    return {
      status: 200,
      headers: {},
      body,
      durationMs: Math.round(performance.now() - start),
      byteLength: JSON.stringify(body).length,
    };
  }

  private async fetchCsv(url: string, req: ProviderRequest): Promise<string> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(PROVIDER_BACKOFF_BASE_MS * Math.pow(2, attempt - 1));
      }

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: HEADERS,
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (response.status === 404) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: `Unknown location_key — no data file found at ${url}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        if (response.status >= 500) {
          throw {
            code: ProviderErrorCode.UNAVAILABLE,
            httpStatus: 502,
            message: `Google COVID-19 Open Data bucket returned ${response.status}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        if (response.status === 429) {
          throw {
            code: ProviderErrorCode.RATE_LIMIT,
            httpStatus: 429,
            message: 'Google COVID-19 Open Data bucket rate limit exceeded',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        if (response.status >= 400) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: `Google COVID-19 Open Data bucket rejected the request (HTTP ${response.status})`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }

        return await response.text();
      } catch (error) {
        const err = error as { code?: string };
        lastError = error;
        if (err.code === ProviderErrorCode.UNAVAILABLE) {
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateLocationKey(value: unknown, req: ProviderRequest, provider: string): string {
  const key = String(value ?? '').toUpperCase();
  if (!LOCATION_KEY_RE.test(key)) {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message:
        `Invalid location_key "${String(value)}" — expected format like "US", "US_CA", or ` +
        'a value discovered via global-health-covid.location_search.',
      provider,
      toolId: req.toolId,
      durationMs: 0,
    };
  }
  return key;
}

/** Minimal CSV parser — no quoted-comma fields are present in this dataset (verified against live data). */
function parseCsv(csvText: string): Record<string, string>[] {
  const lines = csvText.split('\n');
  if (lines.length === 0) return [];
  const header = lines[0].trim().split(',');
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = line.split(',');
    const row: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      row[header[c]] = (cells[c] ?? '').trim();
    }
    rows.push(row);
  }
  return rows;
}

function toNumberOrNull(v: string | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function meta(): { source: string; license: string; data_range: string } {
  return {
    source: 'Google "COVID-19 Open Data" (GoogleCloudPlatform/covid-19-open-data), CC BY',
    license: 'CC BY — attribution required, commercial reuse permitted',
    data_range: FROZEN_NOTE,
  };
}

function parseLocationSearch(csvText: string, params: Record<string, unknown>): unknown {
  const rows = parseCsv(csvText) as unknown as GlobalHealthCovidIndexRow[];
  const query = params.query ? String(params.query).toLowerCase() : '';
  const countryCode = params.country_code ? String(params.country_code).toUpperCase() : '';
  const aggLevel = params.aggregation_level !== undefined ? String(params.aggregation_level) : '';

  const filtered = rows.filter((r) => {
    if (countryCode && (r.country_code ?? '').toUpperCase() !== countryCode) return false;
    if (aggLevel && (r.aggregation_level ?? '') !== aggLevel) return false;
    if (query) {
      const haystack = [r.country_name, r.subregion1_name, r.subregion2_name, r.locality_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const LIMIT = 50;
  return {
    locations: filtered.slice(0, LIMIT).map((r) => ({
      location_key: r.location_key,
      country_code: r.country_code || null,
      country_name: r.country_name || null,
      subregion1_name: r.subregion1_name || null,
      subregion2_name: r.subregion2_name || null,
      locality_name: r.locality_name || null,
      aggregation_level: r.aggregation_level ?? null,
    })),
    total_matches: filtered.length,
    truncated: filtered.length > LIMIT,
    note:
      filtered.length > LIMIT
        ? `Showing first ${LIMIT} of ${filtered.length} matches — narrow with query/country_code/aggregation_level.`
        : undefined,
    ...meta(),
  };
}

function parseLatestSnapshot(
  csvText: string,
  dataset: LatestDataset,
  locationKey: string,
): unknown {
  const rows = parseCsv(csvText);
  const row = rows.find((r) => r.location_key === locationKey);

  if (!row) {
    return {
      location_key: locationKey,
      dataset,
      found: false,
      data: null,
      note: `No ${dataset} data available for location_key "${locationKey}" — this location may not be covered by this dataset.`,
      ...meta(),
    };
  }

  let data: Record<string, unknown>;
  if (dataset === 'epidemiology') {
    const r = row as unknown as GlobalHealthCovidEpidemiologyRow;
    data = {
      date: r.date,
      new_confirmed: toNumberOrNull(r.new_confirmed),
      new_deceased: toNumberOrNull(r.new_deceased),
      new_recovered: toNumberOrNull(r.new_recovered),
      new_tested: toNumberOrNull(r.new_tested),
      cumulative_confirmed: toNumberOrNull(r.cumulative_confirmed),
      cumulative_deceased: toNumberOrNull(r.cumulative_deceased),
      cumulative_recovered: toNumberOrNull(r.cumulative_recovered),
      cumulative_tested: toNumberOrNull(r.cumulative_tested),
    };
  } else if (dataset === 'hospitalizations') {
    const r = row as unknown as GlobalHealthCovidHospitalizationsRow;
    data = {
      date: r.date,
      new_hospitalized_patients: toNumberOrNull(r.new_hospitalized_patients),
      cumulative_hospitalized_patients: toNumberOrNull(r.cumulative_hospitalized_patients),
      current_hospitalized_patients: toNumberOrNull(r.current_hospitalized_patients),
      new_intensive_care_patients: toNumberOrNull(r.new_intensive_care_patients),
      cumulative_intensive_care_patients: toNumberOrNull(r.cumulative_intensive_care_patients),
      current_intensive_care_patients: toNumberOrNull(r.current_intensive_care_patients),
      new_ventilator_patients: toNumberOrNull(r.new_ventilator_patients),
      cumulative_ventilator_patients: toNumberOrNull(r.cumulative_ventilator_patients),
      current_ventilator_patients: toNumberOrNull(r.current_ventilator_patients),
    };
  } else {
    const r = row as unknown as GlobalHealthCovidVaccinationsRow;
    data = {
      date: r.date,
      new_persons_vaccinated: toNumberOrNull(r.new_persons_vaccinated),
      cumulative_persons_vaccinated: toNumberOrNull(r.cumulative_persons_vaccinated),
      new_persons_fully_vaccinated: toNumberOrNull(r.new_persons_fully_vaccinated),
      cumulative_persons_fully_vaccinated: toNumberOrNull(r.cumulative_persons_fully_vaccinated),
      new_vaccine_doses_administered: toNumberOrNull(r.new_vaccine_doses_administered),
      cumulative_vaccine_doses_administered: toNumberOrNull(
        r.cumulative_vaccine_doses_administered,
      ),
    };
  }

  return {
    location_key: locationKey,
    dataset,
    found: true,
    data,
    ...meta(),
  };
}

function parseLocationHistory(csvText: string, params: Record<string, unknown>): unknown {
  const rows = parseCsv(csvText) as unknown as GlobalHealthCovidLocationHistoryRow[];
  const startDate = params.start_date ? String(params.start_date) : '';
  const endDate = params.end_date ? String(params.end_date) : '';

  const days = rows
    .filter((r) => {
      // Skip pre-pandemic padding rows with no case/death signal at all.
      const hasSignal =
        (r.new_confirmed !== undefined && r.new_confirmed !== '') ||
        (r.new_deceased !== undefined && r.new_deceased !== '') ||
        (r.cumulative_confirmed !== undefined && r.cumulative_confirmed !== '');
      if (!hasSignal) return false;
      if (startDate && r.date < startDate) return false;
      if (endDate && r.date > endDate) return false;
      return true;
    })
    .map((r) => ({
      date: r.date,
      new_confirmed: toNumberOrNull(r.new_confirmed),
      new_deceased: toNumberOrNull(r.new_deceased),
      cumulative_confirmed: toNumberOrNull(r.cumulative_confirmed),
      cumulative_deceased: toNumberOrNull(r.cumulative_deceased),
      new_hospitalized_patients: toNumberOrNull(r.new_hospitalized_patients),
      current_hospitalized_patients: toNumberOrNull(r.current_hospitalized_patients),
      new_persons_vaccinated: toNumberOrNull(r.new_persons_vaccinated),
      cumulative_persons_vaccinated: toNumberOrNull(r.cumulative_persons_vaccinated),
      new_persons_fully_vaccinated: toNumberOrNull(r.new_persons_fully_vaccinated),
      cumulative_persons_fully_vaccinated: toNumberOrNull(r.cumulative_persons_fully_vaccinated),
      population: toNumberOrNull(r.population),
    }));

  return {
    location_key: rows[0]?.location_key ?? String(params.location_key ?? '').toUpperCase(),
    fields: HISTORY_FIELDS,
    days,
    count: days.length,
    ...meta(),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
