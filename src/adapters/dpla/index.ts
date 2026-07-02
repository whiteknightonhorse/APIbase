import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { DplaSearchResponse, DplaItem } from './types';

/**
 * DPLA adapter (UC-574) — Digital Public Library of America, 50M+ digitized items
 * from US libraries, archives, and museums. CC0/open access via api.dp.la/v2.
 * Requires free API key (PROVIDER_KEY_DPLA).
 */
export class DplaAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'dpla', baseUrl: 'https://api.dp.la/v2' });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'dpla.items.search': {
        const qs = new URLSearchParams({ api_key: this.apiKey });
        if (p.q) qs.set('q', String(p.q));
        if (p.type) qs.set('sourceResource.type', String(p.type));
        if (p.date_begin) qs.set('sourceResource.date.begin', String(p.date_begin));
        if (p.date_end) qs.set('sourceResource.date.end', String(p.date_end));
        if (p.state) qs.set('sourceResource.spatial.state', String(p.state));
        if (p.provider) qs.set('provider.name', String(p.provider));
        const page = Math.max(1, Number(p.page ?? 1));
        const pageSize = Math.max(1, Math.min(50, Number(p.page_size ?? 10)));
        qs.set('page', String(page));
        qs.set('page_size', String(pageSize));
        qs.set('facets', 'provider.name,sourceResource.type,sourceResource.subject.name');
        qs.set('facet_size', '5');
        return { url: `${this.baseUrl}/items?${qs.toString()}`, method: 'GET', headers };
      }
      case 'dpla.items.detail': {
        const id = encodeURIComponent(String(p.item_id));
        const qs = new URLSearchParams({ api_key: this.apiKey });
        return { url: `${this.baseUrl}/items/${id}?${qs.toString()}`, method: 'GET', headers };
      }
      case 'dpla.items.by_subject': {
        const qs = new URLSearchParams({ api_key: this.apiKey });
        qs.set('sourceResource.subject.name', String(p.subject));
        if (p.type) qs.set('sourceResource.type', String(p.type));
        const page = Math.max(1, Number(p.page ?? 1));
        const pageSize = Math.max(1, Math.min(50, Number(p.page_size ?? 10)));
        qs.set('page', String(page));
        qs.set('page_size', String(pageSize));
        return { url: `${this.baseUrl}/items?${qs.toString()}`, method: 'GET', headers };
      }
      case 'dpla.items.facets': {
        const qs = new URLSearchParams({ api_key: this.apiKey });
        if (p.q) qs.set('q', String(p.q));
        const facetSize = Math.max(1, Math.min(50, Number(p.facet_size ?? 10)));
        qs.set('page_size', '0');
        qs.set(
          'facets',
          'provider.name,sourceResource.type,sourceResource.subject.name,sourceResource.spatial.state',
        );
        qs.set('facet_size', String(facetSize));
        return { url: `${this.baseUrl}/items?${qs.toString()}`, method: 'GET', headers };
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
    const body = raw.body as DplaSearchResponse;

    switch (req.toolId) {
      case 'dpla.items.search': {
        const docs = body.docs ?? [];
        return {
          total: body.count ?? 0,
          page: Number((req.params as Record<string, unknown>).page ?? 1),
          page_size: docs.length,
          items: docs.map(simplifyItem),
          facets: simplifyFacets(body.facets),
        };
      }
      case 'dpla.items.detail': {
        const docs = body.docs ?? [];
        if (docs.length === 0) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: 'Item not found',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        return simplifyItem(docs[0]);
      }
      case 'dpla.items.by_subject': {
        const docs = body.docs ?? [];
        return {
          total: body.count ?? 0,
          page: Number((req.params as Record<string, unknown>).page ?? 1),
          page_size: docs.length,
          items: docs.map(simplifyItem),
        };
      }
      case 'dpla.items.facets': {
        return {
          total: body.count ?? 0,
          facets: simplifyFacets(body.facets),
        };
      }
      default:
        return body;
    }
  }
}

function simplifyItem(doc: DplaItem): unknown {
  const sr = doc.sourceResource ?? {};
  return {
    id: doc.id,
    title: Array.isArray(sr.title) ? (sr.title[0] ?? null) : (sr.title ?? null),
    creator: sr.creator ?? null,
    date: sr.date?.[0]?.displayDate ?? sr.date?.[0]?.begin ?? null,
    type: sr.type ?? null,
    format: sr.format ?? null,
    description: sr.description?.[0] ?? null,
    subject: sr.subject?.map((s) => s.name) ?? null,
    language: sr.language?.map((l) => l.name ?? l.iso639_3).filter(Boolean) ?? null,
    rights: doc.rights ?? null,
    rights_category: doc.rightsCategory ?? null,
    provider:
      typeof doc.provider === 'object' ? (doc.provider?.name ?? null) : (doc.provider ?? null),
    data_provider:
      typeof doc.dataProvider === 'object'
        ? (doc.dataProvider?.name ?? null)
        : (doc.dataProvider ?? null),
    url: doc.isShownAt ?? null,
    thumbnail: doc.object ?? null,
  };
}

function simplifyFacets(
  facets?: Record<string, { terms?: Array<{ term: string; count: number }> }>,
): Record<string, Array<{ term: string; count: number }>> {
  if (!facets) return {};
  const out: Record<string, Array<{ term: string; count: number }>> = {};
  for (const [key, val] of Object.entries(facets)) {
    const shortKey = key.replace('sourceResource.', '').replace('.name', '');
    out[shortKey] = (val.terms ?? []).map((t) => ({ term: t.term, count: t.count }));
  }
  return out;
}
