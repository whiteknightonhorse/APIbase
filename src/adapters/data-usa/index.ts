import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  DataUsaCube,
  DataUsaCubesResponse,
  DataUsaDataResponse,
  DataUsaMembersResponse,
} from './types';

function toCubeSummary(c: DataUsaCube) {
  return {
    cube: c.name,
    topic: c.annotations?.topic ?? null,
    subtopic: c.annotations?.subtopic ?? null,
    dataset_name: c.annotations?.dataset_name ?? null,
    source_name: c.annotations?.source_name ?? null,
    dimensions: (c.dimensions ?? []).map((d) => d.name),
    measures: (c.measures ?? []).map((m) => m.name),
  };
}

function toCubeDetail(c: DataUsaCube) {
  return {
    cube: c.name,
    topic: c.annotations?.topic ?? null,
    subtopic: c.annotations?.subtopic ?? null,
    dataset_name: c.annotations?.dataset_name ?? null,
    dataset_link: c.annotations?.dataset_link ?? null,
    source_name: c.annotations?.source_name ?? null,
    source_description: c.annotations?.source_description ?? null,
    dimensions: (c.dimensions ?? []).map((d) => ({
      dimension: d.name,
      levels: (d.hierarchies ?? []).flatMap((h) => h.levels.map((l) => l.name)),
    })),
    measures: (c.measures ?? []).map((m) => ({ measure: m.name, aggregator: m.aggregator })),
  };
}

/**
 * Data USA adapter (UC-737).
 * Tesseract OLAP server backing https://datausa.io — free, no-auth access to
 * US public data (Census/ACS, BLS, IPEDS, and more), browsable as "cubes"
 * with dimension drilldowns and measures. No documented rate limit.
 * https://datausa.io/about/api/
 */
export class DataUsaAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'data-usa',
      baseUrl: 'https://api.datausa.io/tesseract',
      maxResponseBytes: 5_000_000,
    });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'data-usa.query': {
        const drilldowns = Array.isArray(p.drilldowns) ? p.drilldowns : [p.drilldowns];
        const measures = Array.isArray(p.measures) ? p.measures : [p.measures];
        const qs = new URLSearchParams();
        qs.set('cube', String(p.cube ?? ''));
        qs.set('drilldowns', drilldowns.filter(Boolean).join(','));
        qs.set('measures', measures.filter(Boolean).join(','));
        if (p.include) qs.set('include', String(p.include));
        if (p.sort) qs.set('sort', String(p.sort));
        const limit = Math.max(1, Math.min(1000, Number(p.limit ?? 100)));
        const offset = Math.max(0, Number(p.offset ?? 0));
        qs.set('limit', `${limit},${offset}`);
        return {
          url: `${this.baseUrl}/data.jsonrecords?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      case 'data-usa.cubes': {
        if (p.cube) {
          return {
            url: `${this.baseUrl}/cubes/${encodeURIComponent(String(p.cube))}`,
            method: 'GET',
            headers,
          };
        }
        return {
          url: `${this.baseUrl}/cubes`,
          method: 'GET',
          headers,
        };
      }
      case 'data-usa.members': {
        const qs = new URLSearchParams();
        qs.set('cube', String(p.cube ?? ''));
        qs.set('level', String(p.level ?? ''));
        if (p.search) qs.set('search', String(p.search));
        if (p.limit) qs.set('limit', String(Math.max(1, Math.min(1000, Number(p.limit)))));
        return {
          url: `${this.baseUrl}/members?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'data-usa.query': {
        const body = raw.body as DataUsaDataResponse;
        return {
          dataset: body.annotations?.dataset_name ?? null,
          source: body.annotations?.source_name ?? null,
          source_link: body.annotations?.dataset_link ?? null,
          total: body.page?.total ?? body.data?.length ?? 0,
          limit: body.page?.limit ?? 0,
          offset: body.page?.offset ?? 0,
          columns: body.columns ?? [],
          data: body.data ?? [],
        };
      }
      case 'data-usa.cubes': {
        const p = req.params as Record<string, unknown>;
        if (p.cube) {
          return toCubeDetail(raw.body as DataUsaCube);
        }
        const body = raw.body as DataUsaCubesResponse;
        let cubes = (body.cubes ?? []).map(toCubeSummary);
        const topic = typeof p.topic === 'string' ? p.topic.toLowerCase() : undefined;
        const search = typeof p.search === 'string' ? p.search.toLowerCase() : undefined;
        if (topic) {
          cubes = cubes.filter((c) => (c.topic ?? '').toLowerCase().includes(topic));
        }
        if (search) {
          cubes = cubes.filter(
            (c) =>
              c.cube.toLowerCase().includes(search) ||
              (c.dataset_name ?? '').toLowerCase().includes(search),
          );
        }
        const limit = Math.max(1, Math.min(200, Number(p.limit ?? 50)));
        return { total: cubes.length, cubes: cubes.slice(0, limit) };
      }
      case 'data-usa.members': {
        const body = raw.body as DataUsaMembersResponse;
        const members = (body.members ?? []).filter((m) => m.key !== '');
        return { level: body.name, total: members.length, members };
      }
      default:
        return raw.body;
    }
  }
}
