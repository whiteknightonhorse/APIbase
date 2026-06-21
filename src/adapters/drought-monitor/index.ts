import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  DroughtNationalRecord,
  DroughtDsciRecord,
  DroughtCountyRecord,
  DroughtWeeksRecord,
} from './types';

/**
 * US Drought Monitor data services adapter (UC-482).
 *
 * Supported tools (read-only):
 *   drought.national_stats  → GET /api/USStatistics/GetDroughtSeverityStatisticsByArea
 *                             GET /api/USStatistics/GetDroughtSeverityStatisticsByAreaPercent
 *   drought.dsci            → GET /api/USStatistics/GetDSCI
 *   drought.county_stats    → GET /api/CountyStatistics/GetDroughtSeverityStatisticsByArea
 *   drought.weeks_in_drought→ GET /api/ConsecutiveNonConsecutiveStatistics/...
 *
 * Auth: None (NOAA/USDA/UNL public domain, US Government open data).
 * Date format: M/D/YYYY (no zero-padding, slash-separated).
 * Data frequency: Weekly (Tuesdays), max date range = 1 year per query.
 */
export class DroughtMonitorAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'drought-monitor',
      baseUrl: 'https://usdmdataservices.unl.edu',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'drought.national_stats':
        return this.buildNationalStatsRequest(params, headers);
      case 'drought.dsci':
        return this.buildDsciRequest(params, headers);
      case 'drought.county_stats':
        return this.buildCountyStatsRequest(params, headers);
      case 'drought.weeks_in_drought':
        return this.buildWeeksRequest(params, headers);
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
    const body = raw.body as unknown;

    switch (req.toolId) {
      case 'drought.national_stats':
        return this.parseNationalStats(
          body as DroughtNationalRecord[],
          req.params as Record<string, unknown>,
        );
      case 'drought.dsci':
        return this.parseDsci(body as DroughtDsciRecord[]);
      case 'drought.county_stats':
        return this.parseCountyStats(body as DroughtCountyRecord[]);
      case 'drought.weeks_in_drought':
        return this.parseWeeks(body as DroughtWeeksRecord[], req.params as Record<string, unknown>);
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Date helpers
  // ---------------------------------------------------------------------------

  /** Convert YYYY-MM-DD to M/D/YYYY (USDM required format). */
  private toApiDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${parseInt(m, 10)}/${parseInt(d, 10)}/${y}`;
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildNationalStatsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const startdate = this.toApiDate(String(params.start_date ?? '2024-01-01'));
    const enddate = this.toApiDate(String(params.end_date ?? '2024-01-08'));
    const statisticsType = params.statistics_type === 'categorical' ? '2' : '1';
    const metric = String(params.metric ?? 'area');
    const fn =
      metric === 'percent'
        ? 'GetDroughtSeverityStatisticsByAreaPercent'
        : 'GetDroughtSeverityStatisticsByArea';

    const qs = new URLSearchParams({
      aoi: 'us',
      startdate,
      enddate,
      statisticsType,
    });

    return {
      url: `${this.baseUrl}/api/USStatistics/${fn}?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildDsciRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const startdate = this.toApiDate(String(params.start_date ?? '2024-01-01'));
    const enddate = this.toApiDate(String(params.end_date ?? '2024-01-08'));

    const qs = new URLSearchParams({
      aoi: 'us',
      startdate,
      enddate,
      statisticsType: '1',
    });

    return {
      url: `${this.baseUrl}/api/USStatistics/GetDSCI?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildCountyStatsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const startdate = this.toApiDate(String(params.start_date ?? '2024-01-01'));
    const enddate = this.toApiDate(String(params.end_date ?? '2024-01-08'));
    const statisticsType = params.statistics_type === 'categorical' ? '2' : '1';
    const aoi = String(params.aoi);

    const qs = new URLSearchParams({
      aoi,
      startdate,
      enddate,
      statisticsType,
    });

    return {
      url: `${this.baseUrl}/api/CountyStatistics/GetDroughtSeverityStatisticsByArea?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildWeeksRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const startdate = this.toApiDate(String(params.start_date ?? '2023-01-01'));
    const enddate = this.toApiDate(String(params.end_date ?? '2024-01-01'));
    const state = params.state ? String(params.state) : '';
    const dx = String(params.drought_level ?? '0');
    const minimumweeks = String(params.min_weeks ?? '4');
    const consecutive = params.consecutive === true;

    const fn = consecutive ? 'GetConsecutiveWeeksCounty' : 'GetNonConsecutiveStatisticsCounty';

    const qs = new URLSearchParams({ dx, minimumweeks, startdate, enddate });
    if (state) qs.set('aoi', state);

    return {
      url: `${this.baseUrl}/api/ConsecutiveNonConsecutiveStatistics/${fn}?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // Response parsers
  // ---------------------------------------------------------------------------

  private parseNationalStats(
    records: DroughtNationalRecord[],
    params: Record<string, unknown>,
  ): unknown {
    const metric = String(params.metric ?? 'area');
    const unit = metric === 'percent' ? 'percent' : 'sq_miles';

    return {
      unit,
      statistics_type: params.statistics_type === 'categorical' ? 'categorical' : 'cumulative',
      note:
        metric === 'percent'
          ? 'Percentages of total US land area by drought severity level'
          : 'Square miles by drought severity level (D0=Abnormally Dry, D4=Exceptional Drought)',
      weekly_maps: records.map((r) => ({
        map_date: r.mapDate?.split('T')[0] ?? null,
        area_of_interest: r.areaOfInterest,
        no_drought: r.none,
        d0_abnormally_dry: r.d0,
        d1_moderate_drought: r.d1,
        d2_severe_drought: r.d2,
        d3_extreme_drought: r.d3,
        d4_exceptional_drought: r.d4,
        week_start: r.validStart?.split('T')[0] ?? null,
        week_end: r.validEnd?.split('T')[0] ?? null,
      })),
      count: records.length,
    };
  }

  private parseDsci(records: DroughtDsciRecord[]): unknown {
    return {
      note: 'Drought Severity and Coverage Index: 0=no drought, 500=100% in D4 Exceptional Drought. Calculated as sum of (D0%×1 + D1%×2 + D2%×3 + D3%×4 + D4%×5).',
      dsci_scores: records.map((r) => ({
        area: r.name,
        map_date: r.mapDate?.split('T')[0] ?? null,
        dsci: r.dsci,
        severity:
          r.dsci === 0
            ? 'none'
            : r.dsci < 100
              ? 'low'
              : r.dsci < 200
                ? 'moderate'
                : r.dsci < 300
                  ? 'severe'
                  : r.dsci < 400
                    ? 'extreme'
                    : 'exceptional',
      })),
      count: records.length,
    };
  }

  private parseCountyStats(records: DroughtCountyRecord[]): unknown {
    return {
      note: 'Square miles by drought severity level per county. D0=Abnormally Dry, D1=Moderate, D2=Severe, D3=Extreme, D4=Exceptional Drought.',
      weekly_maps: records.map((r) => ({
        map_date: r.mapDate?.split('T')[0] ?? null,
        fips: r.fips,
        county: r.county,
        state: r.state,
        no_drought_sq_miles: r.none,
        d0_sq_miles: r.d0,
        d1_sq_miles: r.d1,
        d2_sq_miles: r.d2,
        d3_sq_miles: r.d3,
        d4_sq_miles: r.d4,
        week_start: r.validStart?.split('T')[0] ?? null,
        week_end: r.validEnd?.split('T')[0] ?? null,
        statistics_type: r.statisticFormatID === 2 ? 'categorical' : 'cumulative',
      })),
      count: records.length,
    };
  }

  private parseWeeks(records: DroughtWeeksRecord[], params: Record<string, unknown>): unknown {
    const consecutive = params.consecutive === true;
    const weekField = consecutive ? 'consecutive_weeks' : 'non_consecutive_weeks';

    return {
      note: consecutive
        ? 'Counties with the specified number of consecutive weeks at or above the drought threshold.'
        : 'Counties with the specified number of total (non-consecutive) weeks at or above the drought threshold.',
      drought_level: params.drought_level ?? 0,
      min_weeks: params.min_weeks ?? 4,
      counties: records.map((r) => ({
        fips: r.fips,
        county: r.county,
        state: r.state,
        [weekField]: consecutive ? r.consecutiveWeeks : r.nonConsecutiveWeeks,
      })),
      count: records.length,
    };
  }
}
