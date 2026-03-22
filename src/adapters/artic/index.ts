import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

const IIIF_BASE = 'https://www.artic.edu/iiif/2';

export class ArticAdapter extends BaseAdapter {
  constructor() {
    super({ timeout: 10_000, maxRetries: 2, maxResponseSize: 512_000 });
  }

  buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const base = 'https://api.artic.edu/api/v1';

    switch (req.toolId) {
      case 'artic.search': {
        const qs = new URLSearchParams();
        qs.set('q', String(params.q ?? ''));
        qs.set('limit', String(params.limit ?? 10));
        qs.set('fields', 'id,title,artist_display,date_display,medium_display,dimensions,image_id,category_titles,style_title,classification_title,is_public_domain');
        if (params.page) qs.set('page', String(params.page));
        return { url: `${base}/artworks/search?${qs}`, method: 'GET', headers: { 'User-Agent': 'APIbase/1.0' } };
      }

      case 'artic.artwork': {
        const id = String(params.id ?? '');
        return {
          url: `${base}/artworks/${id}?fields=id,title,artist_display,date_display,medium_display,dimensions,credit_line,image_id,category_titles,style_title,classification_title,is_public_domain,place_of_origin,artwork_type_title,department_title,provenance_text,publication_history,exhibition_history`,
          method: 'GET',
          headers: { 'User-Agent': 'APIbase/1.0' },
        };
      }

      case 'artic.artist': {
        const qs = new URLSearchParams();
        qs.set('q', String(params.q ?? ''));
        qs.set('limit', String(params.limit ?? 10));
        qs.set('fields', 'id,title,birth_date,death_date,description,is_artist');
        return { url: `${base}/agents/search?${qs}`, method: 'GET', headers: { 'User-Agent': 'APIbase/1.0' } };
      }

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  parseResponse(raw: ProviderRawResponse, req: ProviderRequest): ProviderRawResponse {
    const body =
      typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;

    if (body?.error) {
      return { ...raw, status: 502, body: { error: body.error } };
    }

    if (req.toolId === 'artic.search') {
      const items = (body.data ?? []).map((a: Record<string, unknown>) => ({
        id: a.id,
        title: a.title,
        artist: a.artist_display,
        date: a.date_display,
        medium: a.medium_display,
        dimensions: a.dimensions,
        categories: a.category_titles,
        style: a.style_title,
        classification: a.classification_title,
        public_domain: a.is_public_domain,
        image_url: a.image_id ? `${IIIF_BASE}/${a.image_id}/full/843,/0/default.jpg` : null,
      }));
      return {
        ...raw,
        body: {
          artworks: items,
          total: body.pagination?.total ?? 0,
          page: body.pagination?.current_page ?? 1,
          count: items.length,
        },
      };
    }

    if (req.toolId === 'artic.artwork') {
      const a = body.data ?? {};
      return {
        ...raw,
        body: {
          id: a.id,
          title: a.title,
          artist: a.artist_display,
          date: a.date_display,
          medium: a.medium_display,
          dimensions: a.dimensions,
          credit_line: a.credit_line,
          place_of_origin: a.place_of_origin,
          artwork_type: a.artwork_type_title,
          department: a.department_title,
          categories: a.category_titles,
          style: a.style_title,
          classification: a.classification_title,
          public_domain: a.is_public_domain,
          image_url: a.image_id ? `${IIIF_BASE}/${a.image_id}/full/843,/0/default.jpg` : null,
          provenance: a.provenance_text ? String(a.provenance_text).slice(0, 1000) : null,
        },
      };
    }

    if (req.toolId === 'artic.artist') {
      const items = (body.data ?? []).map((a: Record<string, unknown>) => ({
        id: a.id,
        name: a.title,
        birth_date: a.birth_date,
        death_date: a.death_date,
        description: a.description ? String(a.description).slice(0, 500) : null,
        is_artist: a.is_artist,
      }));
      return { ...raw, body: { artists: items, total: body.pagination?.total ?? 0, count: items.length } };
    }

    return raw;
  }
}
