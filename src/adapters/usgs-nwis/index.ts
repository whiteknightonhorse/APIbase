import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  NwisJsonResponse,
  NwisTimeSeries,
  DailyValuesOutput,
  AnnualStatsOutput,
  BasinConditionsOutput,
  SiteInfoOutput,
} from './types';

const NWIS_BASE = 'https://waterservices.usgs.gov/nwis';

/**
 * USGS NWIS Streamflow adapter (UC-557).
 *
 * Historical daily values, annual statistics, HUC basin conditions, and
 * detailed gauge site metadata from USGS National Water Information System.
 * US Gov public domain, no auth, unlimited.
 *
 * Complements UC-369 usgs-water (real-time IV + site search).
 */
export class UsgsNwisAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'usgs-nwis', baseUrl: NWIS_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'nwis.daily_values':
        return this.buildDailyValuesRequest(params);
      case 'nwis.annual_stats':
        return this.buildAnnualStatsRequest(params);
      case 'nwis.basin_conditions':
        return this.buildBasinConditionsRequest(params);
      case 'nwis.site_info':
        return this.buildSiteInfoRequest(params);
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

  private buildDailyValuesRequest(params: Record<string, unknown>) {
    const qp = new URLSearchParams();
    qp.set('format', 'json');
    qp.set('sites', String(params.site_no));
    qp.set('parameterCd', String(params.parameter_cd ?? '00060'));
    if (params.start_date) qp.set('startDT', String(params.start_date));
    if (params.end_date) qp.set('endDT', String(params.end_date));
    if (!params.start_date && !params.end_date) qp.set('period', 'P30D');
    return {
      url: `${NWIS_BASE}/dv/?${qp.toString()}`,
      method: 'GET',
      headers: { Accept: 'application/json' },
    };
  }

  private buildAnnualStatsRequest(params: Record<string, unknown>) {
    const qp = new URLSearchParams();
    qp.set('format', 'rdb');
    qp.set('sites', String(params.site_no));
    qp.set('statReportType', 'annual');
    qp.set('statType', 'mean');
    qp.set('parameterCd', '00060');
    return {
      url: `${NWIS_BASE}/stat/?${qp.toString()}`,
      method: 'GET',
      headers: { Accept: 'text/plain' },
    };
  }

  private buildBasinConditionsRequest(params: Record<string, unknown>) {
    const qp = new URLSearchParams();
    qp.set('format', 'json');
    qp.set('huc', String(params.huc_code));
    qp.set('parameterCd', '00060');
    qp.set('period', String(params.period ?? 'PT2H'));
    qp.set('siteType', 'ST');
    qp.set('siteStatus', 'active');
    return {
      url: `${NWIS_BASE}/iv/?${qp.toString()}`,
      method: 'GET',
      headers: { Accept: 'application/json' },
    };
  }

  private buildSiteInfoRequest(params: Record<string, unknown>) {
    const qp = new URLSearchParams();
    qp.set('format', 'rdb');
    qp.set('sites', String(params.site_no));
    qp.set('siteOutput', 'expanded');
    return {
      url: `${NWIS_BASE}/site/?${qp.toString()}`,
      method: 'GET',
      headers: { Accept: 'text/plain' },
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'nwis.daily_values':
        return this.parseDailyValues(raw.body as NwisJsonResponse);
      case 'nwis.annual_stats':
        return this.parseAnnualStats(typeof raw.body === 'string' ? raw.body : String(raw.body));
      case 'nwis.basin_conditions': {
        const params = req.params as Record<string, unknown>;
        return this.parseBasinConditions(
          raw.body as NwisJsonResponse,
          String(params.huc_code ?? ''),
        );
      }
      case 'nwis.site_info':
        return this.parseSiteInfo(typeof raw.body === 'string' ? raw.body : String(raw.body));
      default:
        return raw.body;
    }
  }

  private parseDailyValues(body: NwisJsonResponse): DailyValuesOutput {
    const ts: NwisTimeSeries[] = body?.value?.timeSeries ?? [];
    if (!ts.length) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'No time series data found for this site / parameter combination',
        provider: this.provider,
        durationMs: 0,
      };
    }
    const series = ts[0];
    const sourceInfo = series.sourceInfo;
    const siteNo = sourceInfo.siteCode[0]?.value ?? '';
    const stationName = sourceInfo.siteName ?? '';
    const variable = series.variable;
    const paramName = variable.variableDescription ?? variable.variableName;
    const unit = variable.unit?.unitCode ?? 'ft3/s';
    const noData = variable.noDataValue ?? -999999;
    const rawVals = series.values[0]?.value ?? [];

    const values = rawVals.map((v) => {
      const numVal = parseFloat(v.value);
      return {
        date: v.dateTime.split('T')[0],
        value_cfs: numVal === noData || isNaN(numVal) ? null : numVal,
        qualifier: v.qualifiers?.[0] ?? '',
      };
    });

    return {
      site_no: siteNo,
      station_name: stationName,
      parameter: paramName,
      unit,
      period_start: values[0]?.date ?? '',
      period_end: values[values.length - 1]?.date ?? '',
      count: values.length,
      values,
    };
  }

  private parseAnnualStats(rdb: string): AnnualStatsOutput {
    const lines = rdb.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
    const headerIdx = lines.findIndex((l) => l.startsWith('agency_cd'));
    if (headerIdx === -1) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'No annual statistics data found for this site',
        provider: this.provider,
        durationMs: 0,
      };
    }
    const headers = lines[headerIdx].split('\t');
    const idx = (name: string) => headers.indexOf(name);

    // Extract site info from comment block
    let siteNo = '';
    let stationName = '';
    for (const line of rdb.split('\n')) {
      if (line.includes('# USGS')) {
        const m = line.match(/#\s+USGS\s+(\d+)\s+(.+)/);
        if (m) {
          siteNo = m[1].trim();
          stationName = m[2].trim();
        }
      }
    }

    // Skip header + format row, parse data rows
    const dataLines = lines.slice(headerIdx + 2);
    const years: Array<{ year: number; mean_flow_cfs: number | null }> = dataLines
      .filter((l) => l.trim() && !l.startsWith('5s') && !l.startsWith('agency_cd'))
      .map((l) => {
        const cols = l.split('\t');
        const yearStr = cols[idx('year_nu')];
        const meanStr = cols[idx('mean_va')];
        const year = parseInt(yearStr, 10);
        const meanVal = parseFloat(meanStr);
        return {
          year: isNaN(year) ? 0 : year,
          mean_flow_cfs: isNaN(meanVal) ? null : meanVal,
        };
      })
      .filter((r) => r.year > 0);

    const validYears = years.map((r) => r.year).filter((y) => y > 0);
    return {
      site_no: siteNo,
      station_name: stationName,
      parameter: 'Discharge, cubic feet per second (annual means)',
      record_count: years.length,
      min_year: validYears.length ? Math.min(...validYears) : null,
      max_year: validYears.length ? Math.max(...validYears) : null,
      years,
    };
  }

  private parseBasinConditions(body: NwisJsonResponse, hucCode: string): BasinConditionsOutput {
    const ts: NwisTimeSeries[] = body?.value?.timeSeries ?? [];
    const readings = ts
      .map((series) => {
        const sourceInfo = series.sourceInfo;
        const siteNo = sourceInfo.siteCode[0]?.value ?? '';
        const stationName = sourceInfo.siteName ?? '';
        const loc = sourceInfo.geoLocation?.geogLocation;
        const rawVals = series.values[0]?.value ?? [];
        const noData = series.variable?.noDataValue ?? -999999;
        if (!rawVals.length) return null;
        const latest = rawVals[rawVals.length - 1];
        const numVal = parseFloat(latest.value);
        return {
          site_no: siteNo,
          station_name: stationName,
          latitude: loc?.latitude ?? 0,
          longitude: loc?.longitude ?? 0,
          streamflow_cfs: numVal === noData || isNaN(numVal) ? null : numVal,
          datetime: latest.dateTime,
          qualifier: latest.qualifiers?.[0] ?? '',
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    return {
      huc_code: hucCode,
      sites_found: ts.length,
      sites_with_data: readings.length,
      readings,
    };
  }

  private parseSiteInfo(rdb: string): SiteInfoOutput {
    const lines = rdb.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
    const headerIdx = lines.findIndex((l) => l.startsWith('agency_cd'));
    if (headerIdx === -1) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'Site not found or no expanded site metadata available',
        provider: this.provider,
        durationMs: 0,
      };
    }
    const headers = lines[headerIdx].split('\t');
    const idx = (name: string) => headers.indexOf(name);
    const dataLine = lines[headerIdx + 2];
    if (!dataLine) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'No site data row returned from NWIS site service',
        provider: this.provider,
        durationMs: 0,
      };
    }
    const cols = dataLine.split('\t');
    const getNum = (col: string) => {
      const v = parseFloat(cols[idx(col)]);
      return isNaN(v) ? null : v;
    };
    const getStr = (col: string) => (cols[idx(col)] ?? '').trim();

    return {
      site_no: getStr('site_no'),
      station_name: getStr('station_nm'),
      site_type: getStr('site_tp_cd'),
      latitude: getNum('dec_lat_va') ?? 0,
      longitude: getNum('dec_long_va') ?? 0,
      altitude_ft: getNum('alt_va'),
      altitude_accuracy: getNum('alt_acy_va'),
      altitude_datum: getStr('alt_datum_cd'),
      huc_code: getStr('huc_cd'),
      drainage_area_sqmi: getNum('drain_area_va'),
      state_cd: getStr('state_cd'),
      county_cd: getStr('county_cd'),
      timezone: getStr('tz_cd'),
      agency: getStr('agency_cd'),
    };
  }
}
