import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  BLSRawResponse,
  BLSDataRecord,
  BLSSeriesOutput,
  BLSMultiSeriesOutput,
  BLSCpiOutput,
  BLSUnemploymentOutput,
  BLSPayrollsOutput,
} from './types';

const BLS_BASE = 'https://api.bls.gov/publicAPI/v2';

// CPI-U series IDs by item category
const CPI_SERIES: Record<string, { id: string; label: string }> = {
  all: { id: 'CUUR0000SA0', label: 'All Items' },
  food: { id: 'CUUR0000SAF1', label: 'Food' },
  energy: { id: 'CUUR0000SA0E', label: 'Energy' },
  shelter: { id: 'CUUR0000SEHA', label: 'Shelter' },
  core: { id: 'CUUR0000SA0L1E', label: 'All Items Less Food and Energy (Core CPI)' },
};

// Unemployment series IDs by measure
const UNEMPLOYMENT_SERIES: Record<string, { id: string; label: string; unit: string }> = {
  rate: { id: 'LNS14000000', label: 'Unemployment Rate', unit: 'percent' },
  participation: { id: 'LNS11300000', label: 'Labor Force Participation Rate', unit: 'percent' },
  employment_ratio: { id: 'LNS12300000', label: 'Employment-Population Ratio', unit: 'percent' },
  long_term: { id: 'LNS13025703', label: 'Long-term Unemployed (27+ weeks)', unit: 'thousands' },
};

// Nonfarm payroll series IDs by industry
const PAYROLL_SERIES: Record<string, { id: string; label: string }> = {
  total: { id: 'CES0000000001', label: 'Total Nonfarm' },
  private: { id: 'CES0500000001', label: 'Total Private' },
  manufacturing: { id: 'CES3000000001', label: 'Manufacturing' },
  construction: { id: 'CES2000000001', label: 'Construction' },
  professional: { id: 'CES6000000001', label: 'Professional and Business Services' },
  healthcare: { id: 'CES6562000001', label: 'Healthcare and Social Assistance' },
  retail: { id: 'CES4200000001', label: 'Retail Trade' },
  finance: { id: 'CES5500000001', label: 'Financial Activities' },
};

/**
 * BLS Public Data API v2 adapter (UC-509).
 *
 * Macroeconomic time series: CPI inflation, unemployment, nonfarm payrolls,
 * and generic series lookup. US Bureau of Labor Statistics, US Gov public domain.
 * Free with registration key (500 req/day, 50 series/request, 10 years/query).
 *
 * All tools POST to /timeseries/data/ with registrationkey for full tier access.
 */
export class BlsMacroAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'bls-macro', baseUrl: BLS_BASE });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const now = new Date().getFullYear();

    switch (req.toolId) {
      case 'bls-macro.series': {
        const rawIds = String(params.series_ids ?? '');
        const seriesIds = rawIds
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
          .slice(0, 5);
        if (seriesIds.length === 0) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: 'series_ids is required — provide comma-separated BLS series ID(s)',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        const startYear = String(params.start_year ?? now - 2);
        const endYear = String(params.end_year ?? now);
        return this.buildPostRequest({
          seriesid: seriesIds,
          startyear: startYear,
          endyear: endYear,
        });
      }

      case 'bls-macro.cpi': {
        const item = String(params.item ?? 'all').toLowerCase();
        const config = CPI_SERIES[item] ?? CPI_SERIES['all'];
        const startYear = String(params.start_year ?? now - 4);
        const endYear = String(params.end_year ?? now);
        return this.buildPostRequest({
          seriesid: [config.id],
          startyear: startYear,
          endyear: endYear,
        });
      }

      case 'bls-macro.unemployment': {
        const measure = String(params.measure ?? 'rate').toLowerCase();
        const config = UNEMPLOYMENT_SERIES[measure] ?? UNEMPLOYMENT_SERIES['rate'];
        const startYear = String(params.start_year ?? now - 4);
        const endYear = String(params.end_year ?? now);
        return this.buildPostRequest({
          seriesid: [config.id],
          startyear: startYear,
          endyear: endYear,
        });
      }

      case 'bls-macro.payrolls': {
        const industry = String(params.industry ?? 'total').toLowerCase();
        const config = PAYROLL_SERIES[industry] ?? PAYROLL_SERIES['total'];
        const startYear = String(params.start_year ?? now - 4);
        const endYear = String(params.end_year ?? now);
        return this.buildPostRequest({
          seriesid: [config.id],
          startyear: startYear,
          endyear: endYear,
        });
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
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as BLSRawResponse;
    const params = req.params as Record<string, unknown>;
    const now = new Date().getFullYear();

    if (body.status !== 'REQUEST_SUCCEEDED') {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `BLS API error: ${body.message?.join('; ') ?? body.status}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const seriesList = body.Results?.series ?? [];

    switch (req.toolId) {
      case 'bls-macro.series': {
        const startYear = Number(params.start_year ?? now - 2);
        const endYear = Number(params.end_year ?? now);
        const series = seriesList.map<BLSSeriesOutput>((s) => {
          const records = this.parseRecords(s.data);
          const latest = records[0];
          return {
            series_id: s.seriesID,
            latest_value: latest?.value ?? 0,
            latest_period: latest ? `${latest.year} ${latest.period_name}` : '',
            records,
          };
        });
        const out: BLSMultiSeriesOutput = {
          series,
          start_year: startYear,
          end_year: endYear,
          source: 'U.S. Bureau of Labor Statistics (BLS)',
        };
        return out;
      }

      case 'bls-macro.cpi': {
        const item = String(params.item ?? 'all').toLowerCase();
        const config = CPI_SERIES[item] ?? CPI_SERIES['all'];
        const s = seriesList[0];
        if (!s) return this.emptySeriesError(config.id);
        const records = this.parseRecords(s.data);
        const latest = records[0];
        const prev12 = records.find(
          (r) => r.year === (latest ? latest.year - 1 : 0) && r.period === latest?.period,
        );
        const yoy =
          latest && prev12 && prev12.value !== 0
            ? Number(((latest.value / prev12.value - 1) * 100).toFixed(2))
            : null;
        const out: BLSCpiOutput = {
          item: config.label,
          series_id: config.id,
          latest_value: latest?.value ?? 0,
          latest_period: latest ? `${latest.year} ${latest.period_name}` : '',
          year_over_year_pct: yoy,
          records,
          source: 'U.S. Bureau of Labor Statistics — Consumer Price Index (CPI-U)',
        };
        return out;
      }

      case 'bls-macro.unemployment': {
        const measure = String(params.measure ?? 'rate').toLowerCase();
        const config = UNEMPLOYMENT_SERIES[measure] ?? UNEMPLOYMENT_SERIES['rate'];
        const s = seriesList[0];
        if (!s) return this.emptySeriesError(config.id);
        const records = this.parseRecords(s.data);
        const latest = records[0];
        const out: BLSUnemploymentOutput = {
          measure: config.label,
          series_id: config.id,
          latest_value: latest?.value ?? 0,
          latest_period: latest ? `${latest.year} ${latest.period_name}` : '',
          records,
          source: 'U.S. Bureau of Labor Statistics — Current Population Survey (CPS)',
        };
        return out;
      }

      case 'bls-macro.payrolls': {
        const industry = String(params.industry ?? 'total').toLowerCase();
        const config = PAYROLL_SERIES[industry] ?? PAYROLL_SERIES['total'];
        const s = seriesList[0];
        if (!s) return this.emptySeriesError(config.id);
        const records = this.parseRecords(s.data);
        const latest = records[0];
        const out: BLSPayrollsOutput = {
          industry: config.label,
          series_id: config.id,
          latest_value_thousands: latest?.value ?? 0,
          latest_period: latest ? `${latest.year} ${latest.period_name}` : '',
          records,
          source: 'U.S. Bureau of Labor Statistics — Current Employment Statistics (CES)',
        };
        return out;
      }

      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildPostRequest(payload: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
  } {
    const body: Record<string, unknown> = { ...payload };
    if (this.apiKey) body.registrationkey = this.apiKey;
    return {
      url: `${BLS_BASE}/timeseries/data/`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    };
  }

  private parseRecords(
    data: Array<{ year: string; period: string; periodName: string; value: string }>,
  ): BLSDataRecord[] {
    return data
      .map((d) => ({
        year: Number(d.year),
        period: d.period,
        period_name: d.periodName,
        value: parseFloat(d.value),
      }))
      .sort((a, b) => b.year - a.year || b.period.localeCompare(a.period));
  }

  private emptySeriesError(seriesId: string): Record<string, unknown> {
    return {
      series_id: seriesId,
      latest_value: 0,
      latest_period: '',
      records: [],
      source: 'U.S. Bureau of Labor Statistics',
    };
  }
}
