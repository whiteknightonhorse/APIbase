import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  EstatDashboardGetDataResponse,
  EstatDashboardIndicatorInfoResponse,
  EstatDashboardRegionInfoResponse,
} from './types';

const LANGS = new Set(['JP', 'EN']);

/**
 * e-Stat Statistics Dashboard (dashboard.e-stat.go.jp) API adapter (UC-671).
 *
 * Supported tools:
 *   estat-japan-dashboard.get_data       -> GET /api/1.0/Json/getData
 *     Time-series statistical values for one or more indicator codes,
 *     optionally sliced by region and time range.
 *   estat-japan-dashboard.indicator_info -> GET /api/1.0/Json/getIndicatorInfo
 *     Metadata (name, unit, source survey, valid date range, cycle) for one
 *     indicator code. Call BEFORE get_data to confirm units/cycle.
 *   estat-japan-dashboard.region_info    -> GET /api/1.0/Json/getRegionInfo
 *     Metadata for one region code, or (region_code omitted) the full
 *     Japan+world region code catalog (~620KB, under the 1MB fetch cap) —
 *     use this to discover region codes for get_data.
 *
 * Auth: none. Run by Japan's Ministry of Internal Affairs and Communications
 * (総務省統計局). Content is licensed under Japan's Public Data License
 * v1.0 (PDL1.0, https://dashboard.e-stat.go.jp/static/terms) — attribution
 * required, commercial and non-commercial reuse (incl. via an API-backed
 * service) explicitly permitted.
 *
 * IMPORTANT (verified live before writing): getIndicatorInfo and
 * getRegionInfo only recognize Lang + {IndicatorCode|RegionCode} as query
 * params — any other/unknown param (including attempted keyword filters)
 * makes the upstream return a 404 HTML error page, not JSON. getData
 * likewise 404s (HTML) when IndicatorCode is missing or a time param is
 * malformed — the base adapter already classifies non-JSON/4xx upstream
 * bodies as INPUT_REJECTED (422), so no special-casing is needed here.
 * The unfiltered getIndicatorInfo catalog is ~6.8MB (far over the 1MB
 * fetch cap) so, unlike region_info, indicator_info always requires a code.
 */
export class EstatJapanDashboardAdapter extends BaseAdapter {
  private static readonly ESTAT_BASE = 'https://dashboard.e-stat.go.jp/api/1.0/Json';

  constructor() {
    super({
      provider: 'estat-japan-dashboard',
      baseUrl: EstatJapanDashboardAdapter.ESTAT_BASE,
      // Unfiltered getRegionInfo (JP) measured ~877KB live — comfortably under
      // this raised ceiling but with headroom over the 1MB default in case the
      // catalog grows. Same class of override as eurostat/statbel/oecd-stats.
      maxResponseBytes: 1_500_000,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    switch (req.toolId) {
      case 'estat-japan-dashboard.get_data':
        return this.buildGetData(params);
      case 'estat-japan-dashboard.indicator_info':
        return this.buildIndicatorInfo(params);
      case 'estat-japan-dashboard.region_info':
        return this.buildRegionInfo(params);
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
    switch (req.toolId) {
      case 'estat-japan-dashboard.get_data': {
        const data = raw.body as EstatDashboardGetDataResponse;
        if (!data || typeof data !== 'object' || !data.GET_STATS) {
          throw this.badShape(req.toolId, raw.durationMs, 'GET_STATS');
        }
        return data;
      }
      case 'estat-japan-dashboard.indicator_info': {
        const data = raw.body as EstatDashboardIndicatorInfoResponse;
        if (!data || typeof data !== 'object' || !data.GET_META_INDICATOR_INF) {
          throw this.badShape(req.toolId, raw.durationMs, 'GET_META_INDICATOR_INF');
        }
        return data;
      }
      case 'estat-japan-dashboard.region_info': {
        const data = raw.body as EstatDashboardRegionInfoResponse;
        if (!data || typeof data !== 'object' || !data.GET_META_REGION_INF) {
          throw this.badShape(req.toolId, raw.durationMs, 'GET_META_REGION_INF');
        }
        return data;
      }
      default:
        return raw.body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private estatHeaders(): Record<string, string> {
    return { Accept: 'application/json' };
  }

  private resolveLang(params: Record<string, unknown>): string {
    const raw = params.lang;
    if (raw === undefined || raw === null || raw === '') return 'EN';
    const lang = String(raw).toUpperCase();
    if (!LANGS.has(lang)) {
      throw this.invalidInput('lang must be one of: JP, EN');
    }
    return lang;
  }

  private buildGetData(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const indicatorCode = String(params.indicator_code ?? '').trim();
    if (!indicatorCode) {
      throw this.invalidInput(
        'indicator_code is required (see estat-japan-dashboard.indicator_info)',
      );
    }

    const qs = new URLSearchParams();
    qs.set('Lang', this.resolveLang(params));
    qs.set('IndicatorCode', indicatorCode);

    const regionCode = params.region_code;
    if (regionCode !== undefined && regionCode !== null && String(regionCode).trim() !== '') {
      qs.set('RegionCode', String(regionCode).trim());
    }
    const timeFrom = params.time_from;
    if (timeFrom !== undefined && timeFrom !== null && String(timeFrom).trim() !== '') {
      qs.set('TimeFrom', String(timeFrom).trim());
    }
    const timeTo = params.time_to;
    if (timeTo !== undefined && timeTo !== null && String(timeTo).trim() !== '') {
      qs.set('TimeTo', String(timeTo).trim());
    }
    const cycle = params.cycle;
    if (cycle !== undefined && cycle !== null && String(cycle).trim() !== '') {
      qs.set('Cycle', String(cycle).trim());
    }

    return {
      url: `${EstatJapanDashboardAdapter.ESTAT_BASE}/getData?${qs.toString()}`,
      method: 'GET',
      headers: this.estatHeaders(),
    };
  }

  private buildIndicatorInfo(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const indicatorCode = String(params.indicator_code ?? '').trim();
    if (!indicatorCode) {
      throw this.invalidInput('indicator_code is required');
    }

    const qs = new URLSearchParams();
    qs.set('Lang', this.resolveLang(params));
    qs.set('IndicatorCode', indicatorCode);

    return {
      url: `${EstatJapanDashboardAdapter.ESTAT_BASE}/getIndicatorInfo?${qs.toString()}`,
      method: 'GET',
      headers: this.estatHeaders(),
    };
  }

  private buildRegionInfo(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const qs = new URLSearchParams();
    qs.set('Lang', this.resolveLang(params));

    const regionCode = params.region_code;
    if (regionCode !== undefined && regionCode !== null && String(regionCode).trim() !== '') {
      qs.set('RegionCode', String(regionCode).trim());
    }
    // region_code omitted → full catalog (bounded by maxResponseBytes above)

    return {
      url: `${EstatJapanDashboardAdapter.ESTAT_BASE}/getRegionInfo?${qs.toString()}`,
      method: 'GET',
      headers: this.estatHeaders(),
    };
  }

  private badShape(toolId: string, durationMs: number, expectedKey: string): never {
    throw {
      code: ProviderErrorCode.INVALID_RESPONSE,
      httpStatus: 502,
      message: `e-Stat Statistics Dashboard: expected response with ${expectedKey} key`,
      provider: this.provider,
      toolId,
      durationMs,
    };
  }

  private invalidInput(message: string): never {
    throw {
      code: ProviderErrorCode.INVALID_RESPONSE,
      httpStatus: 502,
      message: `estat-japan-dashboard: ${message}`,
      provider: this.provider,
      toolId: 'estat-japan-dashboard',
      durationMs: 0,
    };
  }
}
