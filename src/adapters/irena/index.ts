import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
  PROVIDER_BACKOFF_BASE_MS,
} from '../../types/provider';
import { logger } from '../../config/logger';
import type {
  PxWebTableRef,
  PxWebQueryResponse,
  IrenaCapacityOutput,
  IrenaGenerationOutput,
  IrenaRegionCapacityOutput,
  IrenaShareOutput,
  CapacityRow,
  GenerationRow,
  RegionCapacityRow,
  ShareRow,
} from './types';

const PXWEB_BASE = 'https://pxweb.irena.org/api/v1/en/IRENASTAT';
const POWER_PATH = 'Power%20Capacity%20and%20Generation';
const IRENA_HEADERS: Record<string, string> = {
  'User-Agent': 'APIbase.pro/1.0 (data@apibase.pro)',
  Accept: 'application/json',
  'Content-Type': 'application/json',
};
const SOURCE = 'IRENA, IRENASTAT — International Renewable Energy Agency';

// --- Capacity (Country) technology index map ---
const CAP_COUNTRY_TECH: Record<string, string> = {
  'Total renewable energy': '0',
  'Solar energy': '1',
  'Solar photovoltaic': '2',
  'Solar thermal energy': '3',
  'Wind energy': '4',
  'Onshore wind energy': '5',
  'Offshore wind energy': '6',
  'Renewable hydropower': '7',
  'Mixed hydropower': '8',
  'Marine energy': '9',
  Bioenergy: '10',
  'Solid biofuels': '11',
  'Liquid biofuels': '12',
  'Gas biofuels': '13',
  'Renewable waste': '14',
  'Geothermal energy': '15',
  'Total non-renewable energy': '16',
  'Fossil fuels': '17',
  Coal: '18',
  Oil: '19',
  'Natural gas': '20',
  'Nuclear energy': '21',
  'Non-renewable waste': '22',
  'Pumped hydro': '25',
};
const CAP_COUNTRY_TECH_INV: Record<string, string> = Object.fromEntries(
  Object.entries(CAP_COUNTRY_TECH).map(([k, v]) => [v, k]),
);

// --- Generation (Country) technology index map ---
const GEN_COUNTRY_TECH: Record<string, string> = {
  'Total renewable': '0',
  'Solar photovoltaic': '1',
  'Solar thermal energy': '2',
  'Onshore wind energy': '3',
  'Offshore wind energy': '4',
  'Renewable hydropower': '5',
  'Mixed Hydro Plants': '6',
  'Marine energy': '7',
  'Solid biofuels': '8',
  'Liquid biofuels': '9',
  Biogas: '10',
  'Renewable municipal waste': '11',
  'Geothermal energy': '12',
  'Total non-renewable': '13',
  'Coal and peat': '14',
  Oil: '15',
  'Natural gas': '16',
  Nuclear: '18',
  'Pumped storage': '19',
};
const GEN_COUNTRY_TECH_INV: Record<string, string> = Object.fromEntries(
  Object.entries(GEN_COUNTRY_TECH).map(([k, v]) => [v, k]),
);

// --- Capacity (Region) technology index map ---
const CAP_REGION_TECH: Record<string, string> = {
  'Total renewable energy': '0',
  'Solar energy': '1',
  'Wind energy': '2',
  'Renewable hydropower': '3',
  'Pumped hydro': '4',
  'Marine energy': '5',
  Bioenergy: '6',
  'Geothermal energy': '7',
  'Total non-renewable energy': '8',
  'Fossil fuels': '9',
  'Nuclear energy': '10',
  'Other non-renewable energy': '11',
};
const CAP_REGION_TECH_INV: Record<string, string> = Object.fromEntries(
  Object.entries(CAP_REGION_TECH).map(([k, v]) => [v, k]),
);

// --- Region codes (for capacity_region tool) ---
const REGION_CODES: Record<string, string> = {
  World: 'GLO',
  Africa: 'RAF',
  Asia: 'RAS',
  'Central America and the Caribbean': 'RCC',
  Eurasia: 'REA',
  Europe: 'RER',
  'Middle East': 'RME',
  'North America': 'RNA',
  Oceania: 'ROC',
  'South America': 'RSA',
};
const REGION_CODES_INV: Record<string, string> = Object.fromEntries(
  Object.entries(REGION_CODES).map(([k, v]) => [v, k]),
);

// --- Grid connection codes ---
const GRID_CODES: Record<string, string> = { OnGrid: '0', OffGrid: '1' };
const GRID_CODES_INV: Record<string, string> = { '0': 'OnGrid', '1': 'OffGrid' };

// Module-level cache for table filenames (fetched once per process lifetime)
let tablePathCache: Record<string, string> | null = null;
let tablePathPromise: Promise<Record<string, string>> | null = null;

export class IrenaAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'irena', baseUrl: PXWEB_BASE, timeoutMs: 12_000 });
  }

  // Override call() to handle multi-step async flow
  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const start = performance.now();
    const params = req.params as Record<string, unknown>;

    const paths = await this.getTablePaths(req, start);
    let body: unknown;

    switch (req.toolId) {
      case 'irena.capacity_country':
        body = await this.queryCapacityCountry(params, paths, req, start);
        break;
      case 'irena.generation_country':
        body = await this.queryGenerationCountry(params, paths, req, start);
        break;
      case 'irena.capacity_region':
        body = await this.queryCapacityRegion(params, paths, req, start);
        break;
      case 'irena.share_renewables':
        body = await this.queryShareRenewables(params, paths, req, start);
        break;
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

    const durationMs = Math.round(performance.now() - start);
    logger.info(
      { provider: this.provider, tool_id: req.toolId, duration_ms: durationMs },
      'IRENA PX-Web query completed',
    );

    return {
      status: 200,
      headers: {},
      body,
      durationMs,
      byteLength: Buffer.byteLength(JSON.stringify(body), 'utf8'),
    };
  }

  // Required by abstract base — never called directly
  protected buildRequest(_req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    throw new Error('IrenaAdapter.buildRequest() should not be called directly');
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    return raw.body;
  }

  // -----------------------------------------------------------------------
  // Table path discovery (cached)
  // -----------------------------------------------------------------------

  private async getTablePaths(
    req: ProviderRequest,
    start: number,
  ): Promise<Record<string, string>> {
    if (tablePathCache) return tablePathCache;
    if (!tablePathPromise) {
      tablePathPromise = this.fetchTablePaths(req, start);
    }
    tablePathCache = await tablePathPromise;
    return tablePathCache;
  }

  private async fetchTablePaths(
    req: ProviderRequest,
    start: number,
  ): Promise<Record<string, string>> {
    const listing = await this.fetchJson<Array<PxWebTableRef>>(
      `${PXWEB_BASE}/${POWER_PATH}/`,
      req,
      start,
    );

    const find = (pattern: RegExp): string => {
      const match = listing
        .filter((t) => pattern.test(t.id))
        .sort((a, b) => b.id.localeCompare(a.id))[0];
      return match ? encodeURIComponent(match.id) : '';
    };

    return {
      capacity_country: find(/Country_ELECCAP/),
      generation_country: find(/Country_ELECGEN/),
      capacity_region: find(/Region_ELECCAP/),
      share_renewables: find(/RE-SHARE/),
    };
  }

  // -----------------------------------------------------------------------
  // Tool implementations
  // -----------------------------------------------------------------------

  private async queryCapacityCountry(
    params: Record<string, unknown>,
    paths: Record<string, string>,
    req: ProviderRequest,
    start: number,
  ): Promise<IrenaCapacityOutput> {
    const country = String(params.country ?? '').toUpperCase();
    const technology = String(params.technology ?? 'Total renewable energy');
    const yearFrom = Math.max(2000, Math.min(2025, Number(params.year_from ?? 2020)));
    const yearTo = Math.max(yearFrom, Math.min(2025, Number(params.year_to ?? 2025)));
    const gridStr = String(params.grid_connection ?? 'OnGrid');

    const techIdx = CAP_COUNTRY_TECH[technology];
    if (!techIdx) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: `Unknown technology: "${technology}". Valid: ${Object.keys(CAP_COUNTRY_TECH).join(', ')}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: Math.round(performance.now() - start),
      };
    }
    const gridIdx = GRID_CODES[gridStr] ?? '0';
    const yearIdxs = this.yearRange(yearFrom, yearTo);

    const url = `${PXWEB_BASE}/${POWER_PATH}/${paths.capacity_country}`;
    const payload = {
      query: [
        { code: 'Country/area', selection: { filter: 'item', values: [country] } },
        { code: 'Technology', selection: { filter: 'item', values: [techIdx] } },
        { code: 'Grid connection', selection: { filter: 'item', values: [gridIdx] } },
        { code: 'Year', selection: { filter: 'item', values: yearIdxs } },
      ],
      response: { format: 'json' },
    };

    const resp = await this.postJson<PxWebQueryResponse>(url, payload, req, start);

    const data: CapacityRow[] = resp.data.map((row) => ({
      country: row.key[0],
      technology: CAP_COUNTRY_TECH_INV[row.key[1]] ?? row.key[1],
      grid_connection: GRID_CODES_INV[row.key[2]] ?? row.key[2],
      year: 2000 + parseInt(row.key[3], 10),
      capacity_mw: row.values[0] === '-' || row.values[0] === '' ? null : parseFloat(row.values[0]),
    }));

    return { source: SOURCE, unit: 'MW', data };
  }

  private async queryGenerationCountry(
    params: Record<string, unknown>,
    paths: Record<string, string>,
    req: ProviderRequest,
    start: number,
  ): Promise<IrenaGenerationOutput> {
    const country = String(params.country ?? '').toUpperCase();
    const technology = String(params.technology ?? 'Total renewable');
    const yearFrom = Math.max(2000, Math.min(2024, Number(params.year_from ?? 2020)));
    const yearTo = Math.max(yearFrom, Math.min(2024, Number(params.year_to ?? 2024)));
    const gridStr = String(params.grid_connection ?? 'OnGrid');

    const techIdx = GEN_COUNTRY_TECH[technology];
    if (!techIdx) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: `Unknown technology: "${technology}". Valid: ${Object.keys(GEN_COUNTRY_TECH).join(', ')}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: Math.round(performance.now() - start),
      };
    }

    // Generation grid: 0=On-grid, 1=Off-grid, 2=All
    const genGridMap: Record<string, string> = { OnGrid: '0', OffGrid: '1', All: '2' };
    const gridIdx = genGridMap[gridStr] ?? '0';
    const yearIdxs = this.yearRange(yearFrom, yearTo);

    const url = `${PXWEB_BASE}/${POWER_PATH}/${paths.generation_country}`;
    const payload = {
      query: [
        { code: 'Country/area', selection: { filter: 'item', values: [country] } },
        { code: 'Technology', selection: { filter: 'item', values: [techIdx] } },
        { code: 'Grid connection', selection: { filter: 'item', values: [gridIdx] } },
        { code: 'Year', selection: { filter: 'item', values: yearIdxs } },
        // Data Type has exactly one value; must be selected explicitly
        { code: 'Data Type', selection: { filter: 'item', values: ['0'] } },
      ],
      response: { format: 'json' },
    };

    const resp = await this.postJson<PxWebQueryResponse>(url, payload, req, start);

    const data: GenerationRow[] = resp.data.map((row) => ({
      country: row.key[0],
      technology: GEN_COUNTRY_TECH_INV[row.key[1]] ?? row.key[1],
      grid_connection: { '0': 'OnGrid', '1': 'OffGrid', '2': 'All' }[row.key[3]] ?? row.key[3],
      year: 2000 + parseInt(row.key[4], 10),
      generation_gwh:
        row.values[0] === '-' || row.values[0] === '' ? null : parseFloat(row.values[0]),
    }));

    return { source: SOURCE, unit: 'GWh', data };
  }

  private async queryCapacityRegion(
    params: Record<string, unknown>,
    paths: Record<string, string>,
    req: ProviderRequest,
    start: number,
  ): Promise<IrenaRegionCapacityOutput> {
    const regionInput = String(params.region ?? 'World');
    const technology = String(params.technology ?? 'Total renewable energy');
    const yearFrom = Math.max(2000, Math.min(2025, Number(params.year_from ?? 2020)));
    const yearTo = Math.max(yearFrom, Math.min(2025, Number(params.year_to ?? 2025)));
    const gridStr = String(params.grid_connection ?? 'OnGrid');

    // Resolve region code (accept both name and code)
    const regionCode = REGION_CODES[regionInput] ?? regionInput.toUpperCase();
    if (!Object.values(REGION_CODES).includes(regionCode)) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: `Unknown region: "${regionInput}". Valid: ${Object.keys(REGION_CODES).join(', ')}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: Math.round(performance.now() - start),
      };
    }

    const techIdx = CAP_REGION_TECH[technology];
    if (!techIdx) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: `Unknown technology: "${technology}". Valid: ${Object.keys(CAP_REGION_TECH).join(', ')}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: Math.round(performance.now() - start),
      };
    }
    const gridIdx = GRID_CODES[gridStr] ?? '0';
    const yearIdxs = this.yearRange(yearFrom, yearTo);

    const url = `${PXWEB_BASE}/${POWER_PATH}/${paths.capacity_region}`;
    const payload = {
      query: [
        { code: 'Region', selection: { filter: 'item', values: [regionCode] } },
        { code: 'Technology', selection: { filter: 'item', values: [techIdx] } },
        { code: 'Grid connection', selection: { filter: 'item', values: [gridIdx] } },
        { code: 'Year', selection: { filter: 'item', values: yearIdxs } },
      ],
      response: { format: 'json' },
    };

    const resp = await this.postJson<PxWebQueryResponse>(url, payload, req, start);

    const data: RegionCapacityRow[] = resp.data.map((row) => ({
      region: REGION_CODES_INV[row.key[0]] ?? row.key[0],
      technology: CAP_REGION_TECH_INV[row.key[1]] ?? row.key[1],
      grid_connection: GRID_CODES_INV[row.key[2]] ?? row.key[2],
      year: 2000 + parseInt(row.key[3], 10),
      capacity_mw: row.values[0] === '-' || row.values[0] === '' ? null : parseFloat(row.values[0]),
    }));

    return { source: SOURCE, unit: 'MW', data };
  }

  private async queryShareRenewables(
    params: Record<string, unknown>,
    paths: Record<string, string>,
    req: ProviderRequest,
    start: number,
  ): Promise<IrenaShareOutput> {
    const locationInput = String(params.country_or_region ?? 'World');
    // Resolve to code: if it's a region name, convert; else treat as ISO3
    const locationCode = REGION_CODES[locationInput] ?? locationInput.toUpperCase();
    const indicator = String(params.indicator ?? 'generation');
    const yearFrom = Math.max(2000, Math.min(2025, Number(params.year_from ?? 2020)));
    const yearTo = Math.max(yearFrom, Math.min(2025, Number(params.year_to ?? 2025)));

    // Indicator: 0 = generation share, 1 = capacity share
    const indicatorMap: Record<string, string> = { generation: '0', capacity: '1' };
    const indicatorIdx = indicatorMap[indicator.toLowerCase()];
    if (!indicatorIdx) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: `Unknown indicator: "${indicator}". Valid: generation, capacity`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: Math.round(performance.now() - start),
      };
    }
    const yearIdxs = this.yearRange(yearFrom, yearTo);

    const url = `${PXWEB_BASE}/${POWER_PATH}/${paths.share_renewables}`;
    const payload = {
      query: [
        { code: 'Region/country/area', selection: { filter: 'item', values: [locationCode] } },
        { code: 'Indicator', selection: { filter: 'item', values: [indicatorIdx] } },
        { code: 'Year', selection: { filter: 'item', values: yearIdxs } },
      ],
      response: { format: 'json' },
    };

    const resp = await this.postJson<PxWebQueryResponse>(url, payload, req, start);

    const indicatorTexts: Record<string, string> = {
      '0': 'RE share of electricity generation (%)',
      '1': 'RE share of electricity capacity (%)',
    };

    const data: ShareRow[] = resp.data.map((row) => ({
      country_or_region: row.key[0],
      indicator: indicatorTexts[row.key[1]] ?? row.key[1],
      year: 2000 + parseInt(row.key[2], 10),
      share_pct: row.values[0] === '-' || row.values[0] === '' ? null : parseFloat(row.values[0]),
    }));

    return { source: SOURCE, unit: '%', data };
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private yearRange(from: number, to: number): string[] {
    const result: string[] = [];
    for (let y = from; y <= to; y++) {
      result.push(String(y - 2000));
    }
    return result;
  }

  private async fetchJson<T>(url: string, req: ProviderRequest, start: number): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await sleep(PROVIDER_BACKOFF_BASE_MS * Math.pow(2, attempt - 1));
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: IRENA_HEADERS,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        return await this.handleResponse<T>(response, req, start);
      } catch (error) {
        lastError = error;
        if (!isRetryable(error)) throw error;
      }
    }
    throw lastError;
  }

  private async postJson<T>(
    url: string,
    body: unknown,
    req: ProviderRequest,
    start: number,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await sleep(PROVIDER_BACKOFF_BASE_MS * Math.pow(2, attempt - 1));
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: IRENA_HEADERS,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        return await this.handleResponse<T>(response, req, start);
      } catch (error) {
        lastError = error;
        if (!isRetryable(error)) throw error;
      }
    }
    throw lastError;
  }

  private async handleResponse<T>(
    response: Response,
    req: ProviderRequest,
    start: number,
  ): Promise<T> {
    if (response.status === 429) {
      throw {
        code: ProviderErrorCode.RATE_LIMIT,
        httpStatus: 429,
        message: 'IRENA API rate limit exceeded',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: Math.round(performance.now() - start),
      };
    }
    if (response.status >= 500) {
      throw {
        code: ProviderErrorCode.UNAVAILABLE,
        httpStatus: 502,
        message: `IRENA API returned ${response.status}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: Math.round(performance.now() - start),
      };
    }
    if (response.status >= 400) {
      const detail = await response.text().catch(() => '');
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: `IRENA API error ${response.status}: ${detail.slice(0, 300)}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: Math.round(performance.now() - start),
      };
    }
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > this.maxResponseBytes) {
      throw {
        code: ProviderErrorCode.RESPONSE_TOO_LARGE,
        httpStatus: 502,
        message: 'IRENA response exceeded size limit',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: Math.round(performance.now() - start),
      };
    }
    return JSON.parse(text) as T;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: unknown): boolean {
  const e = error as { code?: string; name?: string };
  return (
    e.code === ProviderErrorCode.UNAVAILABLE ||
    e.code === ProviderErrorCode.TIMEOUT ||
    e.name === 'TimeoutError' ||
    e.name === 'AbortError'
  );
}
