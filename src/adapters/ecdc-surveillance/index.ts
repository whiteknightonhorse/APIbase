import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { EcdcCaseDeathRow, EcdcTestingRow, EcdcHospitalIcuRow } from './types';

const CASE_DEATH_URL = 'https://opendata.ecdc.europa.eu/covid19/nationalcasedeath/json/';
const TESTING_URL = 'https://opendata.ecdc.europa.eu/covid19/testing/json/';
const HOSPITAL_ICU_URL = 'https://opendata.ecdc.europa.eu/covid19/hospitalicuadmissionrates/json/';

/** Data range for every dataset below — ECDC discontinued routine COVID-19 surveillance reporting. */
const DATA_RANGE_NOTE =
  'Historical data only (2020-W01 through 2023-W47). ECDC discontinued routine COVID-19 ' +
  'surveillance reporting in December 2023 — this dataset is frozen and will not receive new weeks.';

/**
 * ECDC COVID-19 Surveillance adapter (UC-625).
 *
 * Tools (read-only, no auth required — CC BY 4.0, resale permitted per
 * ecdc.europa.eu/en/ecdc-intellectual-property-notices):
 *   ecdc-surveillance.cases_deaths  → weekly cases/deaths by country (nationalcasedeath)
 *   ecdc-surveillance.testing_rate  → weekly testing/positivity rate by country (testing)
 *   ecdc-surveillance.hospital_icu  → hospital/ICU occupancy + admission rates (hospitalicuadmissionrates)
 *
 * The upstream has NO query API — each endpoint is a static full-history JSON dump
 * (largest is ~5.6MB), so maxResponseBytes is raised and every call fetches the
 * full file then filters server-side by country/year_week, mirroring the OFAC adapter's
 * fetch-full-then-filter pattern. Datasets are frozen (Last-Modified: 2023-12-01) — long
 * cache_ttl in tool_provider_config.yaml is appropriate.
 */
export class EcdcSurveillanceAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'ecdc-surveillance',
      baseUrl: 'https://opendata.ecdc.europa.eu',
      timeoutMs: 15_000,
      maxResponseBytes: 6_500_000,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const headers: Record<string, string> = {
      'User-Agent': 'APIbase/1.0 (https://apibase.pro; public-health data aggregation)',
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'ecdc-surveillance.cases_deaths':
        return { url: CASE_DEATH_URL, method: 'GET', headers };

      case 'ecdc-surveillance.testing_rate':
        return { url: TESTING_URL, method: 'GET', headers };

      case 'ecdc-surveillance.hospital_icu':
        return { url: HOSPITAL_ICU_URL, method: 'GET', headers };

      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unknown ECDC Surveillance tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const p = (req.params ?? {}) as Record<string, unknown>;

    switch (req.toolId) {
      case 'ecdc-surveillance.cases_deaths':
        return parseCasesDeaths(raw.body, p);

      case 'ecdc-surveillance.testing_rate':
        return parseTestingRate(raw.body, p);

      case 'ecdc-surveillance.hospital_icu':
        return parseHospitalIcu(raw.body, p);

      default:
        return raw.body;
    }
  }
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function matchesCountry(row: { country: string; country_code?: string }, filter: string): boolean {
  const f = filter.toLowerCase();
  return row.country.toLowerCase() === f || (row.country_code ?? '').toLowerCase() === f;
}

function clampLimit(limit: unknown, max: number, dflt: number): number {
  return Math.max(1, Math.min(max, Number(limit ?? dflt)));
}

function parseCasesDeaths(body: unknown, params: Record<string, unknown>): unknown {
  const rows = Array.isArray(body) ? (body as EcdcCaseDeathRow[]) : [];
  const country = params.country ? String(params.country) : '';
  const indicator = params.indicator ? String(params.indicator).toLowerCase() : '';
  const yearWeek = params.year_week ? String(params.year_week) : '';
  const limit = clampLimit(params.limit, 500, 100);

  if (!country) {
    return {
      records: [],
      count: 0,
      note: 'Provide a country name or ISO3 country_code (e.g. "Austria" or "AUT") to filter results.',
      ...meta(),
    };
  }

  const filtered = rows.filter((r) => {
    if (!matchesCountry(r, country)) return false;
    if (indicator && r.indicator.toLowerCase() !== indicator) return false;
    if (yearWeek && r.year_week !== yearWeek) return false;
    return true;
  });

  return {
    records: filtered.slice(0, limit),
    count: Math.min(filtered.length, limit),
    total_matched: filtered.length,
    ...meta(),
  };
}

function parseTestingRate(body: unknown, params: Record<string, unknown>): unknown {
  const rows = Array.isArray(body) ? (body as EcdcTestingRow[]) : [];
  const country = params.country ? String(params.country) : '';
  const yearWeek = params.year_week ? String(params.year_week) : '';
  const limit = clampLimit(params.limit, 500, 100);

  if (!country) {
    return {
      records: [],
      count: 0,
      note: 'Provide a country name or ISO2 country_code (e.g. "Austria" or "AT") to filter results.',
      ...meta(),
    };
  }

  const filtered = rows.filter((r) => {
    if (!matchesCountry(r, country)) return false;
    if (yearWeek && r.year_week !== yearWeek) return false;
    return true;
  });

  return {
    records: filtered.slice(0, limit),
    count: Math.min(filtered.length, limit),
    total_matched: filtered.length,
    ...meta(),
  };
}

function parseHospitalIcu(body: unknown, params: Record<string, unknown>): unknown {
  const rows = Array.isArray(body) ? (body as EcdcHospitalIcuRow[]) : [];
  const country = params.country ? String(params.country) : '';
  const indicator = params.indicator ? String(params.indicator) : '';
  const limit = clampLimit(params.limit, 500, 100);

  if (!country) {
    return {
      records: [],
      count: 0,
      note:
        'Provide a country name (e.g. "Germany") to filter results. Optional indicator: ' +
        '"Daily hospital occupancy", "Daily ICU occupancy", "Weekly new hospital admissions per 100k", ' +
        '"Weekly new ICU admissions per 100k".',
      ...meta(),
    };
  }

  const filtered = rows.filter((r) => {
    if (r.country.toLowerCase() !== country.toLowerCase()) return false;
    if (indicator && r.indicator.toLowerCase() !== indicator.toLowerCase()) return false;
    return true;
  });

  return {
    records: filtered.slice(0, limit),
    count: Math.min(filtered.length, limit),
    total_matched: filtered.length,
    ...meta(),
  };
}

function meta(): { source: string; data_range: string } {
  return {
    source: 'ECDC (European Centre for Disease Prevention and Control), TESSy COVID-19, CC BY 4.0',
    data_range: DATA_RANGE_NOTE,
  };
}
