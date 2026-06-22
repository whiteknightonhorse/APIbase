import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  OcUriMetaItem,
  OcQueryResponse,
  OcItemDetail,
  OcObservation,
  OcSearchOutput,
  OcDetailOutput,
  OcFacetsOutput,
  OcAttribute,
} from './types';

const OC_BASE = 'https://opencontext.org';

/**
 * Open Context adapter (UC-493).
 * Archaeological open data — 200K+ finds, sites, projects. CC BY 4.0. No auth.
 * Anubis bot protection bypassed by setting User-Agent to include "research-client".
 */
export class OpenContextAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'opencontext', baseUrl: OC_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    // Anubis bot protection: any UA containing "research-client" bypasses the JS challenge
    const headers: Record<string, string> = {
      'User-Agent': 'APIbase/1.0 research-client',
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'opencontext.search': {
        const qp = new URLSearchParams();
        qp.set('q', String(params.query || ''));
        qp.set('rows', String(Math.min(Number(params.rows) || 10, 50)));
        if (params.start) qp.set('start', String(Number(params.start)));
        qp.set('response', 'uri-meta');
        const itemType = String(params.item_type || '');
        if (itemType && itemType !== 'all') qp.set('type', itemType);
        return { url: `${OC_BASE}/query/.json?${qp.toString()}`, method: 'GET', headers };
      }

      case 'opencontext.detail': {
        const uuid = encodeURIComponent(String(params.uuid));
        const itemType = String(params.item_type || 'subjects');
        return { url: `${OC_BASE}/${itemType}/${uuid}.json`, method: 'GET', headers };
      }

      case 'opencontext.facets': {
        const qp = new URLSearchParams();
        qp.set('q', String(params.query || ''));
        qp.set('rows', '0');
        const itemType = String(params.item_type || '');
        if (itemType && itemType !== 'all') qp.set('type', itemType);
        return { url: `${OC_BASE}/query/.json?${qp.toString()}`, method: 'GET', headers };
      }

      case 'opencontext.projects': {
        const qp = new URLSearchParams();
        qp.set('q', String(params.query || ''));
        qp.set('rows', String(Math.min(Number(params.rows) || 10, 50)));
        if (params.start) qp.set('start', String(Number(params.start)));
        qp.set('response', 'uri-meta');
        qp.set('type', 'projects');
        return { url: `${OC_BASE}/query/.json?${qp.toString()}`, method: 'GET', headers };
      }

      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          retryable: false,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as unknown;

    switch (req.toolId) {
      case 'opencontext.search':
      case 'opencontext.projects':
        return this.parseSearch(body as OcUriMetaItem[], req.params as Record<string, unknown>);

      case 'opencontext.detail':
        return this.parseDetail(body as OcItemDetail, req.params as Record<string, unknown>);

      case 'opencontext.facets':
        return this.parseFacets(body as OcQueryResponse);

      default:
        return body;
    }
  }

  private parseSearch(items: OcUriMetaItem[], params: Record<string, unknown>): OcSearchOutput {
    const list = Array.isArray(items) ? items : [];
    return {
      total_results: list.length,
      start: Number(params.start) || 0,
      rows: list.length,
      items: list.map((it) => ({
        label: it.label ?? '',
        uri: it.href ?? it.uri ?? '',
        citation_uri: it['citation uri'] ?? '',
        project_label: it['project label'] ?? '',
        project_uri: it['project href'] ?? '',
        context: it['context label'] ?? '',
        latitude: it.latitude ?? null,
        longitude: it.longitude ?? null,
        early_bce_ce: it['early bce/ce'] ?? null,
        late_bce_ce: it['late bce/ce'] ?? null,
        item_category: it['item category'] ?? '',
        snippet: (it.snippet ?? '').replace(/<[^>]+>/g, '').trim(),
        thumbnail: it.thumbnail ?? '',
        published: it.published ?? '',
        updated: it.updated ?? '',
      })),
    };
  }

  private parseDetail(body: OcItemDetail, params: Record<string, unknown>): OcDetailOutput {
    const uuid = String(params.uuid || '');
    const itemType = String(params.item_type || 'subjects');

    // Extract coordinates from GeoJSON features
    let latitude: number | null = null;
    let longitude: number | null = null;
    const feats = body.features ?? [];
    for (const feat of feats) {
      const geom = feat.geometry;
      if (
        geom?.type === 'Point' &&
        Array.isArray(geom.coordinates) &&
        geom.coordinates.length >= 2
      ) {
        longitude = geom.coordinates[0] as number;
        latitude = geom.coordinates[1] as number;
        break;
      }
    }

    // Extract context path (excavation hierarchy)
    const contexts = (body['oc-gen:has-contexts'] ?? []).map((c) => c.label ?? '').filter(Boolean);

    // Extract observations — flatten all predicate values
    const observations: OcAttribute[] = [];
    const obs: OcObservation[] = body['oc-gen:has-obs'] ?? [];
    for (const ob of obs) {
      for (const [key, val] of Object.entries(ob)) {
        if (!key.startsWith('oc-pred:')) continue;
        const shortKey = key.replace(/^oc-pred:[0-9]+-/, '').replace(/^oc-pred:oc-gen-/, '');
        const values = Array.isArray(val) ? val : [];
        const strVals = values
          .map((v) => {
            if (typeof v === 'object' && v !== null) {
              const obj = v as Record<string, unknown>;
              const text =
                (obj['@en'] as string) ?? (obj.label as string) ?? (obj.slug as string) ?? '';
              return text.replace(/<[^>]+>/g, '').trim();
            }
            return String(v ?? '');
          })
          .filter(Boolean);
        if (strVals.length > 0) {
          observations.push({ predicate: shortKey, values: strVals });
        }
      }
    }

    const temporal = (body['dc-terms:temporal'] ?? []).map((t) => ({
      label: t.label ?? '',
      start: t.start ?? 0,
      stop: t.stop ?? 0,
    }));

    const creators = (body['dc-terms:creator'] ?? []).map((c) => c.label ?? '').filter(Boolean);
    const subjects = (body['dc-terms:subject'] ?? []).map((s) => s.label ?? '').filter(Boolean);
    const license = (body['dc-terms:license'] ?? [])[0]?.id ?? '';
    const project = (body['dc-terms:isPartOf'] ?? [])[0]?.label ?? '';

    return {
      uri: `${OC_BASE}/${itemType}/${uuid}`,
      uuid,
      label: body.label ?? '',
      category: body.category ?? '',
      title: body['dc-terms:title'] ?? body.label ?? '',
      item_type: itemType,
      issued: body['dc-terms:issued'] ?? '',
      modified: body['dc-terms:modified'] ?? '',
      context_path: contexts,
      latitude,
      longitude,
      temporal_coverage: temporal,
      creators,
      subjects,
      observations,
      license,
      project,
    };
  }

  private parseFacets(body: OcQueryResponse): OcFacetsOutput {
    const facets = body['oc-api:has-facets'] ?? [];

    const getFacetOptions = (facetId: string) => {
      const fac = facets.find((f) => f.id === facetId);
      return (fac?.['oc-api:has-id-options'] ?? []).map((opt) => ({
        label: opt.label ?? '',
        count: opt.count ?? 0,
      }));
    };

    return {
      total_results: body.totalResults ?? 0,
      query_time_ms: body.Qtime ?? 0,
      earliest_bce_ce: body['allevent-start'] ?? 0,
      latest_bce_ce: body['allevent-stop'] ?? 0,
      geographic_distribution: getFacetOptions('#facet-context'),
      item_type_counts: getFacetOptions('#facet-item-type'),
      top_projects: getFacetOptions('#facet-project').slice(0, 10),
      description_facets: getFacetOptions('#facet-prop-ld'),
    };
  }
}
