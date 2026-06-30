import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  BeaNipaResponse,
  BeaNipaDataRow,
  BeaItaResponse,
  BeaItaDataRow,
  BeaRegionalResponse,
  BeaRegionalDataRow,
  BeaGdpIndustryResponse,
  BeaGdpIndustryDataRow,
} from './types';

/**
 * Bureau of Economic Analysis (BEA) API adapter (UC-545).
 *
 * Supported tools:
 *   bea.gdp             → NIPA T10101  — Real GDP growth (% change, quarterly/annual)
 *   bea.personal_income → NIPA T20100  — Personal income and outlays
 *   bea.trade_balance   → ITA dataset  — International trade balance (goods/services)
 *   bea.state_gdp       → Regional CAGDP2 — State-level GDP (thousands of dollars)
 *   bea.industry_gdp    → GDPbyIndustry TableID=1 — Value added by industry (billions)
 *
 * Auth: api_key query param (PROVIDER_KEY_BEA). Free, unlimited (US Gov open data).
 * Base: https://apps.bea.gov/api/data
 */
export class BeaAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'bea', baseUrl: 'https://apps.bea.gov' });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };
    const base = `${this.baseUrl}/api/data`;

    switch (req.toolId) {
      case 'bea.gdp':
        return this.buildNipaRequest(base, 'T10101', p, headers);

      case 'bea.personal_income':
        return this.buildNipaRequest(base, 'T20100', p, headers);

      case 'bea.trade_balance': {
        const indicator = encodeURIComponent((p.indicator as string | undefined) ?? 'BalGdsServ');
        const area = encodeURIComponent(
          (p.area_or_country as string | undefined) ?? 'AllCountries',
        );
        const freq = encodeURIComponent((p.frequency as string | undefined) ?? 'A');
        const year = encodeURIComponent((p.year as string | undefined) ?? 'LAST5');
        const url =
          `${base}?UserID=${encodeURIComponent(this.apiKey)}` +
          `&method=GetData&DataSetName=ITA` +
          `&Indicator=${indicator}&AreaOrCountry=${area}` +
          `&Frequency=${freq}&Year=${year}&ResultFormat=JSON`;
        return { url, method: 'GET', headers };
      }

      case 'bea.state_gdp': {
        const geoFips = encodeURIComponent((p.geo_fips as string | undefined) ?? 'STATE');
        const year = encodeURIComponent((p.year as string | undefined) ?? 'LAST5');
        const lineCode = encodeURIComponent(String((p.line_code as number | undefined) ?? 1));
        const url =
          `${base}?UserID=${encodeURIComponent(this.apiKey)}` +
          `&method=GetData&DataSetName=Regional` +
          `&TableName=CAGDP2&LineCode=${lineCode}&GeoFips=${geoFips}` +
          `&Year=${year}&ResultFormat=JSON`;
        return { url, method: 'GET', headers };
      }

      case 'bea.industry_gdp': {
        const industry = encodeURIComponent((p.industry as string | undefined) ?? 'ALL');
        const freq = encodeURIComponent((p.frequency as string | undefined) ?? 'A');
        const year = encodeURIComponent((p.year as string | undefined) ?? 'LAST5');
        const url =
          `${base}?UserID=${encodeURIComponent(this.apiKey)}` +
          `&method=GetData&DataSetName=GDPbyIndustry` +
          `&TableID=1&Industry=${industry}&Frequency=${freq}` +
          `&Year=${year}&ResultFormat=JSON`;
        return { url, method: 'GET', headers };
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

  private buildNipaRequest(
    base: string,
    tableName: string,
    p: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const freq = encodeURIComponent((p.frequency as string | undefined) ?? 'A');
    const year = encodeURIComponent((p.year as string | undefined) ?? 'LAST5');
    const url =
      `${base}?UserID=${encodeURIComponent(this.apiKey)}` +
      `&method=GetData&DataSetName=NIPA` +
      `&TableName=${tableName}&Frequency=${freq}` +
      `&Year=${year}&ResultFormat=JSON`;
    return { url, method: 'GET', headers };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'bea.gdp':
        return this.parseNipa(raw, 'T10101', 'Real GDP growth (% change, annual rate)');

      case 'bea.personal_income':
        return this.parseNipa(raw, 'T20100', 'Personal income and outlays (millions of dollars)');

      case 'bea.trade_balance':
        return this.parseIta(raw);

      case 'bea.state_gdp':
        return this.parseRegional(raw);

      case 'bea.industry_gdp':
        return this.parseGdpIndustry(raw);

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

  private parseNipa(raw: ProviderRawResponse, tableName: string, description: string): unknown {
    const body = raw.body as BeaNipaResponse;
    const bea = body?.BEAAPI;
    if (bea?.Error) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: `BEA API error ${bea.Error.APIErrorCode}: ${bea.Error.APIErrorDescription}`,
        provider: this.provider,
        toolId: tableName,
        durationMs: 0,
      };
    }
    const results = bea?.Results;
    const rows: BeaNipaDataRow[] = Array.isArray(results?.Data)
      ? (results?.Data as BeaNipaDataRow[])
      : results?.Data
        ? [results.Data as unknown as BeaNipaDataRow]
        : [];

    return {
      table: tableName,
      description,
      updated: results?.UTCProductionTime ?? null,
      count: rows.length,
      data: rows.map((r) => ({
        series_code: r.SeriesCode,
        line: r.LineNumber,
        description: r.LineDescription,
        period: r.TimePeriod,
        metric: r.METRIC_NAME,
        unit: r.CL_UNIT,
        value: r.DataValue,
      })),
    };
  }

  private parseIta(raw: ProviderRawResponse): unknown {
    const body = raw.body as BeaItaResponse;
    const bea = body?.BEAAPI;
    if (bea?.Error) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: `BEA API error ${bea.Error.APIErrorCode}: ${bea.Error.APIErrorDescription}`,
        provider: this.provider,
        toolId: 'bea.trade_balance',
        durationMs: 0,
      };
    }
    const rawData = bea?.Results?.Data;
    const rows: BeaItaDataRow[] = Array.isArray(rawData) ? rawData : rawData ? [rawData] : [];
    return {
      dataset: 'ITA',
      description: 'US International Transactions (current account)',
      count: rows.length,
      data: rows.map((r) => ({
        indicator: r.Indicator,
        area_or_country: r.AreaOrCountry,
        frequency: r.Frequency,
        time_series: r.TimeSeriesDescription,
        period: r.TimePeriod,
        unit: r.CL_UNIT,
        unit_mult: r.UNIT_MULT,
        value: r.DataValue,
      })),
    };
  }

  private parseRegional(raw: ProviderRawResponse): unknown {
    const body = raw.body as BeaRegionalResponse;
    const bea = body?.BEAAPI;
    if (bea?.Error) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: `BEA API error ${bea.Error.APIErrorCode}: ${bea.Error.APIErrorDescription}`,
        provider: this.provider,
        toolId: 'bea.state_gdp',
        durationMs: 0,
      };
    }
    const rawData = bea?.Results?.Data;
    const rows: BeaRegionalDataRow[] = Array.isArray(rawData) ? rawData : rawData ? [rawData] : [];
    return {
      dataset: 'Regional',
      table: 'CAGDP2',
      description: 'Real GDP by state (thousands of dollars)',
      count: rows.length,
      data: rows.map((r) => ({
        geo_fips: r.GeoFips,
        geo_name: r.GeoName,
        period: r.TimePeriod,
        unit: r.CL_UNIT,
        unit_mult: r.UNIT_MULT,
        value: r.DataValue,
      })),
    };
  }

  private parseGdpIndustry(raw: ProviderRawResponse): unknown {
    const body = raw.body as BeaGdpIndustryResponse;
    const bea = body?.BEAAPI;
    if (bea?.Error) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: `BEA API error ${bea.Error.APIErrorCode}: ${bea.Error.APIErrorDescription}`,
        provider: this.provider,
        toolId: 'bea.industry_gdp',
        durationMs: 0,
      };
    }
    const resultsRaw = bea?.Results;
    const resultItem = Array.isArray(resultsRaw) ? resultsRaw[0] : resultsRaw;
    const rows: BeaGdpIndustryDataRow[] = Array.isArray(resultItem?.Data)
      ? (resultItem?.Data as BeaGdpIndustryDataRow[])
      : resultItem?.Data
        ? [resultItem.Data as unknown as BeaGdpIndustryDataRow]
        : [];

    return {
      dataset: 'GDPbyIndustry',
      table_id: 1,
      description: 'Value added by industry (billions of dollars)',
      updated: resultItem?.UTCProductionTime ?? null,
      count: rows.length,
      data: rows.map((r) => ({
        industry_code: r.Industry,
        industry_name: r.IndustrYDescription,
        frequency: r.Frequency,
        period: r.Year,
        value: r.DataValue,
        unit: 'Billions of dollars',
      })),
    };
  }
}
