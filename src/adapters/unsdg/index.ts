import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  UnsdgGoal,
  UnsdgTarget,
  UnsdgIndicator,
  UnsdgGeoArea,
  UnsdgDataPage,
  UnsdgDataRecord,
} from './types';

const API_BASE = 'https://unstats.un.org/sdgs/UNSDGAPIV5/v1';

/**
 * UN Sustainable Development Goals (SDG) adapter (UC-457).
 *
 * Supported tools (read-only):
 *   unsdg.goals.list          — All 17 SDG goals with titles and descriptions
 *   unsdg.targets.list        — All 169 SDG targets (optional goal filter)
 *   unsdg.indicators.list     — All 231 indicators with tier and series codes
 *   unsdg.data.query          — Query time-series data by series code (+ optional country/year)
 *   unsdg.geo.countries       — All 460 countries and regions with UN M49 geo codes
 *
 * Auth: None (UN Statistics Division, public domain, open access).
 * API: https://unstats.un.org/sdgs/UNSDGAPIV5/v1
 */
export class UnsdgAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'unsdg', baseUrl: API_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase.pro/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'unsdg.goals.list':
        return { url: `${API_BASE}/sdg/Goal/List`, method: 'GET', headers };

      case 'unsdg.targets.list': {
        const qs = new URLSearchParams();
        if (p.goal) qs.set('goal', String(p.goal));
        const query = qs.toString();
        return {
          url: `${API_BASE}/sdg/Target/List${query ? '?' + query : ''}`,
          method: 'GET',
          headers,
        };
      }

      case 'unsdg.indicators.list': {
        const qs = new URLSearchParams();
        if (p.goal) qs.set('goal', String(p.goal));
        if (p.target) qs.set('target', encodeURIComponent(String(p.target)));
        const query = qs.toString();
        return {
          url: `${API_BASE}/sdg/Indicator/List${query ? '?' + query : ''}`,
          method: 'GET',
          headers,
        };
      }

      case 'unsdg.data.query': {
        const qs = new URLSearchParams();
        qs.set('seriesCode', encodeURIComponent(String(p.series_code)));
        if (p.geo_area_code) qs.set('geoAreaCode', String(p.geo_area_code));
        if (p.start_year) qs.set('timePeriodStart', String(p.start_year));
        if (p.end_year) qs.set('timePeriodEnd', String(p.end_year));
        const limit = Math.min(Number(p.limit ?? 50), 200);
        qs.set('pageSize', String(limit));
        qs.set('page', '1');
        return { url: `${API_BASE}/sdg/Series/Data?${qs.toString()}`, method: 'GET', headers };
      }

      case 'unsdg.geo.countries':
        return { url: `${API_BASE}/sdg/GeoArea/List`, method: 'GET', headers };

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
      case 'unsdg.goals.list':
        return this.parseGoals(raw.body);
      case 'unsdg.targets.list':
        return this.parseTargets(raw.body);
      case 'unsdg.indicators.list':
        return this.parseIndicators(raw.body);
      case 'unsdg.data.query':
        return this.parseData(raw.body);
      case 'unsdg.geo.countries':
        return this.parseGeoAreas(raw.body);
      default:
        return raw.body;
    }
  }

  private parseGoals(body: unknown): { goals: UnsdgGoal[]; total: number } {
    const items = body as UnsdgGoal[];
    if (!Array.isArray(items)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unexpected goals response: ${JSON.stringify(body).slice(0, 200)}`,
        provider: this.provider,
        durationMs: 0,
      };
    }
    return {
      goals: items.map((g) => ({
        code: g.code,
        title: g.title,
        description: g.description,
        uri: g.uri,
      })),
      total: items.length,
    };
  }

  private parseTargets(body: unknown): { targets: UnsdgTarget[]; total: number } {
    const items = body as UnsdgTarget[];
    if (!Array.isArray(items)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unexpected targets response: ${JSON.stringify(body).slice(0, 200)}`,
        provider: this.provider,
        durationMs: 0,
      };
    }
    return {
      targets: items.map((t) => ({
        goal: t.goal,
        code: t.code,
        title: t.title,
        description: t.description,
        uri: t.uri,
      })),
      total: items.length,
    };
  }

  private parseIndicators(body: unknown): {
    indicators: Array<Omit<UnsdgIndicator, 'series'> & { series_codes: string[] }>;
    total: number;
  } {
    const items = body as UnsdgIndicator[];
    if (!Array.isArray(items)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unexpected indicators response: ${JSON.stringify(body).slice(0, 200)}`,
        provider: this.provider,
        durationMs: 0,
      };
    }
    return {
      indicators: items.map((ind) => ({
        goal: ind.goal,
        target: ind.target,
        code: ind.code,
        description: ind.description,
        tier: ind.tier,
        uri: ind.uri,
        series_codes: (ind.series ?? []).map((s) => s.code),
      })),
      total: items.length,
    };
  }

  private parseData(body: unknown): {
    total: number;
    page: number;
    pages: number;
    records: Array<{
      series: string;
      series_description: string;
      geo_area_code: string;
      geo_area_name: string;
      year: number;
      value: string;
      source: string | null;
      dimensions: Record<string, string>;
    }>;
  } {
    const page = body as UnsdgDataPage;
    if (!page || typeof page !== 'object' || !('data' in page)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unexpected data response: ${JSON.stringify(body).slice(0, 200)}`,
        provider: this.provider,
        durationMs: 0,
      };
    }
    return {
      total: page.totalElements,
      page: page.pageNumber,
      pages: page.totalPages,
      records: (page.data ?? []).map((r: UnsdgDataRecord) => ({
        series: r.series,
        series_description: r.seriesDescription,
        geo_area_code: r.geoAreaCode,
        geo_area_name: r.geoAreaName,
        year: r.timePeriodStart,
        value: r.value,
        source: r.source ?? null,
        dimensions: r.dimensions ?? {},
      })),
    };
  }

  private parseGeoAreas(body: unknown): { geo_areas: UnsdgGeoArea[]; total: number } {
    const items = body as UnsdgGeoArea[];
    if (!Array.isArray(items)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unexpected geo_areas response: ${JSON.stringify(body).slice(0, 200)}`,
        provider: this.provider,
        durationMs: 0,
      };
    }
    return {
      geo_areas: items.map((g) => ({
        geoAreaCode: g.geoAreaCode,
        geoAreaName: g.geoAreaName,
      })),
      total: items.length,
    };
  }
}
