import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  UnescoDataResponse,
  UnescoGeoUnitsResponse,
  UnescoGeoUnitType,
  UnescoIndicatorDefinitionsResponse,
  UnescoTheme,
} from './types';

const THEMES = new Set<UnescoTheme>([
  'EDUCATION',
  'SCIENCE_TECHNOLOGY_INNOVATION',
  'CULTURE',
  'DEMOGRAPHIC_SOCIOECONOMIC',
]);
const GEO_UNIT_TYPES = new Set<UnescoGeoUnitType>(['NATIONAL', 'REGIONAL']);

const DEFAULT_SEARCH_LIMIT = 50;
const MAX_SEARCH_LIMIT = 200;
const MAX_INDICATOR_CODES = 2;

/**
 * UNESCO Institute for Statistics (UIS) Data API adapter (UC-673).
 *
 * Supported tools:
 *   unesco-data.indicator_search -> GET /api/public/definitions/indicators
 *     Full catalog of ~5,063 education/science/culture/demographic indicator
 *     codes has no server-side name/theme filter, so this adapter fetches
 *     the whole list and filters + caps it client-side before returning.
 *   unesco-data.geounit_list -> GET /api/public/definitions/geounits
 *     Small (462-row) catalog of country/region codes used by get_data.
 *   unesco-data.get_data -> GET /api/public/data/indicators
 *     Actual time-series values for 1-2 indicator codes, optionally sliced
 *     by geo unit and year range. Always call indicator_search first to
 *     find a valid code, and geounit_list to find a valid geo_unit code.
 *
 * Auth: none. Data: UNESCO Institute for Statistics (api.uis.unesco.org),
 * CC BY-SA 4.0 (verified live at https://databrowser.uis.unesco.org/
 * terms-and-conditions) — commercial reuse and redistribution permitted
 * with attribution and share-alike; the UIS may not be represented as
 * endorsing derivative use. No documented rate limits found.
 */
export class UnescoDataAdapter extends BaseAdapter {
  private static readonly UIS_BASE = 'https://api.uis.unesco.org';

  constructor() {
    super({
      provider: 'unesco-data',
      baseUrl: UnescoDataAdapter.UIS_BASE,
      // Unfiltered definitions/indicators measured ~1.9MB live (no
      // server-side filter exists) and a single-indicator, all-countries,
      // full-history get_data pull measured ~1.4MB live — both comfortably
      // under this raised ceiling. Same class of override as ilostat/eia.
      maxResponseBytes: 3_000_000,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    switch (req.toolId) {
      case 'unesco-data.indicator_search':
        return {
          url: `${UnescoDataAdapter.UIS_BASE}/api/public/definitions/indicators`,
          method: 'GET',
          headers: this.uisHeaders(),
        };
      case 'unesco-data.geounit_list':
        return {
          url: `${UnescoDataAdapter.UIS_BASE}/api/public/definitions/geounits`,
          method: 'GET',
          headers: this.uisHeaders(),
        };
      case 'unesco-data.get_data':
        return this.buildGetData(params);
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
    const params = (req.params ?? {}) as Record<string, unknown>;
    switch (req.toolId) {
      case 'unesco-data.indicator_search':
        return this.filterIndicators(raw, req, params);
      case 'unesco-data.geounit_list':
        return this.filterGeoUnits(raw, req, params);
      case 'unesco-data.get_data': {
        const data = raw.body as UnescoDataResponse;
        if (!data || typeof data !== 'object' || !Array.isArray(data.records)) {
          throw this.badShape(req.toolId, raw.durationMs, 'records');
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

  private uisHeaders(): Record<string, string> {
    return { Accept: 'application/json' };
  }

  private buildGetData(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const indicators = this.toStringArray(params.indicator);
    if (indicators.length === 0) {
      throw this.invalidInput('indicator is required (see unesco-data.indicator_search)');
    }
    if (indicators.length > MAX_INDICATOR_CODES) {
      throw this.invalidInput(
        `indicator accepts at most ${MAX_INDICATOR_CODES} codes per call — narrow with ` +
          'geo_unit/start/end or make separate calls',
      );
    }

    const qs = new URLSearchParams();
    for (const code of indicators) qs.append('indicator', code);

    for (const geoUnit of this.toStringArray(params.geo_unit)) {
      qs.append('geoUnit', geoUnit);
    }

    const geoUnitType = params.geo_unit_type;
    if (geoUnitType !== undefined && geoUnitType !== null && String(geoUnitType).trim() !== '') {
      const type = String(geoUnitType).trim().toUpperCase();
      if (!GEO_UNIT_TYPES.has(type as UnescoGeoUnitType)) {
        throw this.invalidInput('geo_unit_type must be one of: NATIONAL, REGIONAL');
      }
      qs.set('geoUnitType', type);
    }

    const start = this.toYear(params.start, 'start');
    if (start !== undefined) qs.set('start', String(start));
    const end = this.toYear(params.end, 'end');
    if (end !== undefined) qs.set('end', String(end));

    if (typeof params.footnotes === 'boolean') {
      qs.set('footnotes', String(params.footnotes));
    }
    if (typeof params.indicator_metadata === 'boolean') {
      qs.set('indicatorMetadata', String(params.indicator_metadata));
    }

    return {
      url: `${UnescoDataAdapter.UIS_BASE}/api/public/data/indicators?${qs.toString()}`,
      method: 'GET',
      headers: this.uisHeaders(),
    };
  }

  // ---------------------------------------------------------------------------
  // Response filtering (client-side — upstream has no name/theme search param)
  // ---------------------------------------------------------------------------

  private filterIndicators(
    raw: ProviderRawResponse,
    req: ProviderRequest,
    params: Record<string, unknown>,
  ): unknown {
    const data = raw.body as UnescoIndicatorDefinitionsResponse;
    if (!Array.isArray(data)) {
      throw this.badShape(req.toolId, raw.durationMs, 'indicator array');
    }

    let theme: UnescoTheme | undefined;
    if (params.theme !== undefined && params.theme !== null && String(params.theme).trim() !== '') {
      const candidate = String(params.theme).trim().toUpperCase() as UnescoTheme;
      if (!THEMES.has(candidate)) {
        throw this.invalidInput(
          'theme must be one of: EDUCATION, SCIENCE_TECHNOLOGY_INNOVATION, CULTURE, ' +
            'DEMOGRAPHIC_SOCIOECONOMIC',
        );
      }
      theme = candidate;
    }

    const query =
      params.query !== undefined && params.query !== null && String(params.query).trim() !== ''
        ? String(params.query).trim().toLowerCase()
        : undefined;

    const limitRaw = params.limit;
    let limit = DEFAULT_SEARCH_LIMIT;
    if (limitRaw !== undefined && limitRaw !== null) {
      const parsed = Number(limitRaw);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw this.invalidInput('limit must be a positive number');
      }
      limit = Math.min(Math.trunc(parsed), MAX_SEARCH_LIMIT);
    }

    const matched = data.filter((indicator) => {
      if (theme && indicator.theme !== theme) return false;
      if (
        query &&
        !indicator.name.toLowerCase().includes(query) &&
        !indicator.indicatorCode.toLowerCase().includes(query)
      ) {
        return false;
      }
      return true;
    });

    return {
      total_matched: matched.length,
      returned: Math.min(matched.length, limit),
      indicators: matched.slice(0, limit),
    };
  }

  private filterGeoUnits(
    raw: ProviderRawResponse,
    req: ProviderRequest,
    params: Record<string, unknown>,
  ): unknown {
    const data = raw.body as UnescoGeoUnitsResponse;
    if (!Array.isArray(data)) {
      throw this.badShape(req.toolId, raw.durationMs, 'geounit array');
    }

    let type: UnescoGeoUnitType | undefined;
    if (params.type !== undefined && params.type !== null && String(params.type).trim() !== '') {
      const candidate = String(params.type).trim().toUpperCase() as UnescoGeoUnitType;
      if (!GEO_UNIT_TYPES.has(candidate)) {
        throw this.invalidInput('type must be one of: NATIONAL, REGIONAL');
      }
      type = candidate;
    }

    const query =
      params.query !== undefined && params.query !== null && String(params.query).trim() !== ''
        ? String(params.query).trim().toLowerCase()
        : undefined;

    const matched = data.filter((geoUnit) => {
      if (type && geoUnit.type !== type) return false;
      if (query && !geoUnit.name.toLowerCase().includes(query)) return false;
      return true;
    });

    return { returned: matched.length, geounits: matched };
  }

  // ---------------------------------------------------------------------------
  // Param helpers
  // ---------------------------------------------------------------------------

  /** Accepts a string (comma-separated), an array of strings, or undefined. */
  private toStringArray(value: unknown): string[] {
    if (value === undefined || value === null) return [];
    const items = Array.isArray(value) ? value : String(value).split(',');
    return items.map((item) => String(item).trim()).filter((item) => item.length > 0);
  }

  private toYear(value: unknown, field: string): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      throw this.invalidInput(`${field} must be an integer year, e.g. 2020`);
    }
    return parsed;
  }

  private badShape(toolId: string, durationMs: number, expectedKey: string): never {
    throw {
      code: ProviderErrorCode.INVALID_RESPONSE,
      httpStatus: 502,
      message: `UNESCO UIS Data API: expected response with ${expectedKey}`,
      provider: this.provider,
      toolId,
      durationMs,
    };
  }

  private invalidInput(message: string): never {
    throw {
      code: ProviderErrorCode.INVALID_RESPONSE,
      httpStatus: 502,
      message: `unesco-data: ${message}`,
      provider: this.provider,
      toolId: 'unesco-data',
      durationMs: 0,
    };
  }
}
