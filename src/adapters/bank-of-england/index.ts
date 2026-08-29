import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
  PROVIDER_BACKOFF_BASE_MS,
} from '../../types/provider';

const IADB_BASE = 'https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp';
const IADB_HEADERS = {
  Accept: 'application/csv, text/plain, */*',
  'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Frequency = 'daily' | 'monthly';

interface SeriesDef {
  code: string;
  label: string;
  frequency: Frequency;
  unit: string;
  defaultLastN: number;
  maxLastN: number;
}

/**
 * Bank of England Statistical Interactive Database ("IADB") series wrapped as tools (UC-633).
 * Reproduction of data in the Database is licensed under the UK Open Government Licence v3.0
 * (confirmed at bankofengland.co.uk/legal, "Bank of England Database" section) — free and
 * flexible reuse including commercial. Exchange-rate series are explicitly EXCLUDED from that
 * licence (reproduced under third-party licence) so this adapter deliberately covers only the
 * Bank's own compiled monetary/lending statistics, never any XUDL* FX series.
 */
const SERIES: Record<string, SeriesDef> = {
  'bank-of-england.bank_rate': {
    code: 'IUDBEDR',
    label: 'Official Bank Rate (Bank of England policy rate)',
    frequency: 'daily',
    unit: 'percent per annum',
    defaultLastN: 90,
    maxLastN: 1825,
  },
  'bank-of-england.sonia_rate': {
    code: 'IUDSOIA',
    label: 'SONIA (Sterling Overnight Index Average)',
    frequency: 'daily',
    unit: 'percent per annum',
    defaultLastN: 90,
    maxLastN: 1825,
  },
  'bank-of-england.money_supply_m4': {
    code: 'LPMVQJW',
    label:
      "M4 money supply — 12-month growth rate of monetary financial institutions' sterling M4 liabilities to the private sector, seasonally adjusted",
    frequency: 'monthly',
    unit: 'percent',
    defaultLastN: 24,
    maxLastN: 120,
  },
  'bank-of-england.mortgage_rate_2y_fixed': {
    code: 'IUMBV34',
    label:
      '2-year fixed-rate mortgage at 75% loan-to-value, monthly average quoted rate to households',
    frequency: 'monthly',
    unit: 'percent per annum',
    defaultLastN: 24,
    maxLastN: 120,
  },
};

export class BankOfEnglandAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'bank-of-england', baseUrl: IADB_BASE });
  }

  // All logic lives in call() — buildRequest/parseResponse are required stubs
  // because the IADB endpoint returns CSV, not JSON (same pattern as gebco/meteostat).
  protected buildRequest(_req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    throw new Error('BankOfEnglandAdapter.buildRequest() should not be called directly');
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    return raw.body;
  }

  override async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const start = performance.now();
    const series = SERIES[req.toolId];
    if (!series) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unsupported tool: ${req.toolId}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const params = req.params as Record<string, unknown>;
    const lastN = clampLastN(params.last_n, series);
    const dateFrom = computeDateFrom(series.frequency, lastN);

    const qs = new URLSearchParams({
      'csv.x': 'yes',
      Datefrom: dateFrom,
      Dateto: 'now',
      SeriesCodes: series.code,
      CSVF: 'TN',
      UsingCodes: 'Y',
      VPD: 'Y',
      VFD: 'N',
    });

    const csvText = await this.fetchCsv(`${IADB_BASE}?${qs.toString()}`, req);
    const observations = parseCsv(csvText);
    const latest = observations.length > 0 ? observations[observations.length - 1] : null;

    const body = {
      series_code: series.code,
      label: series.label,
      frequency: series.frequency,
      unit: series.unit,
      date_from: dateFrom,
      count: observations.length,
      observations,
      latest,
    };

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
          headers: IADB_HEADERS,
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (response.status >= 500) {
          throw {
            code: ProviderErrorCode.UNAVAILABLE,
            httpStatus: 502,
            message: `Bank of England IADB returned ${response.status}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        if (response.status === 429) {
          throw {
            code: ProviderErrorCode.RATE_LIMIT,
            httpStatus: 429,
            message: 'Bank of England IADB rate limit exceeded',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        if (response.status >= 400) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: `Bank of England IADB rejected the request (HTTP ${response.status})`,
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

function clampLastN(value: unknown, series: SeriesDef): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) {
    return series.defaultLastN;
  }
  return Math.min(Math.floor(n), series.maxLastN);
}

/** Formats a "Datefrom" value in the DD/Mon/YYYY format the IADB endpoint expects. */
function computeDateFrom(frequency: Frequency, lastN: number): string {
  const date = new Date();
  if (frequency === 'daily') {
    date.setUTCDate(date.getUTCDate() - lastN);
  } else {
    date.setUTCMonth(date.getUTCMonth() - lastN);
  }
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/** Parses IADB CSV of the form "DATE,<code>\n02 Jan 2020,0.75\n...". */
function parseCsv(csvText: string): Array<{ date: string; value: number }> {
  const lines = csvText.trim().split('\n').filter(Boolean);
  const observations: Array<{ date: string; value: number }> = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 2) continue;
    const isoDate = parseIadbDate(parts[0].trim());
    const value = Number(parts[1].trim());
    if (isoDate && Number.isFinite(value)) {
      observations.push({ date: isoDate, value });
    }
  }

  return observations;
}

/** Converts "02 Jan 2020" → "2020-01-02". Returns null on unrecognized format. */
function parseIadbDate(text: string): string | null {
  const match = text.match(/^(\d{2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!match) return null;
  const [, day, monthAbbr, year] = match;
  const monthIndex = MONTHS.indexOf(monthAbbr as (typeof MONTHS)[number]);
  if (monthIndex === -1) return null;
  const month = String(monthIndex + 1).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
