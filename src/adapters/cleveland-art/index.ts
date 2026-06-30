import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  CmaArtwork,
  CmaArtworkSearchOutput,
  CmaArtworkDetailOutput,
  CmaCreator,
  CmaCreatorSearchOutput,
  CmaExhibition,
  CmaExhibitionSearchOutput,
} from './types';

const CMA_BASE = 'https://openaccess-api.clevelandart.org/api';

export class ClevelandArtAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'clevelandart', baseUrl: CMA_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'clevelandart.artwork_search': {
        const qp = new URLSearchParams();
        if (params.query) qp.set('q', String(params.query));
        if (params.type) qp.set('type', String(params.type));
        if (params.department) qp.set('department', String(params.department));
        if (params.has_image) qp.set('has_image', '1');
        qp.set('limit', String(Math.min(Number(params.limit) || 10, 50)));
        qp.set('skip', String(Math.max(Number(params.skip) || 0, 0)));
        return { url: `${CMA_BASE}/artworks/?${qp.toString()}`, method: 'GET', headers };
      }

      case 'clevelandart.artwork_detail': {
        const id = encodeURIComponent(String(params.artwork_id));
        return { url: `${CMA_BASE}/artworks/${id}`, method: 'GET', headers };
      }

      case 'clevelandart.creator_search': {
        const qp = new URLSearchParams();
        if (params.query) qp.set('q', String(params.query));
        if (params.nationality) qp.set('nationality', String(params.nationality));
        qp.set('limit', String(Math.min(Number(params.limit) || 10, 50)));
        qp.set('skip', String(Math.max(Number(params.skip) || 0, 0)));
        return { url: `${CMA_BASE}/creators/?${qp.toString()}`, method: 'GET', headers };
      }

      case 'clevelandart.exhibition_search': {
        const qp = new URLSearchParams();
        if (params.query) qp.set('q', String(params.query));
        if (params.is_venue_cma) qp.set('is_venue_cma', '1');
        qp.set('limit', String(Math.min(Number(params.limit) || 10, 50)));
        qp.set('skip', String(Math.max(Number(params.skip) || 0, 0)));
        return { url: `${CMA_BASE}/exhibitions/?${qp.toString()}`, method: 'GET', headers };
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
    const body = raw.body as Record<string, unknown>;

    switch (req.toolId) {
      case 'clevelandart.artwork_search':
        return this.parseArtworkSearch(body);
      case 'clevelandart.artwork_detail':
        return this.parseArtworkDetail(body);
      case 'clevelandart.creator_search':
        return this.parseCreatorSearch(body);
      case 'clevelandart.exhibition_search':
        return this.parseExhibitionSearch(body);
      default:
        return body;
    }
  }

  private parseArtworkSearch(body: Record<string, unknown>): CmaArtworkSearchOutput {
    const info = body.info as Record<string, unknown>;
    const data = (body.data ?? []) as CmaArtwork[];
    return {
      total: Number(info?.total ?? data.length),
      results: data.map((a) => ({
        id: Number(a.id),
        accession_number: String(a.accession_number ?? ''),
        title: String(a.title ?? ''),
        type: String(a.type ?? ''),
        department: String(a.department ?? ''),
        creation_date: a.creation_date ?? null,
        culture: String(a.culture ?? ''),
        technique: String(a.technique ?? ''),
        creators: (a.creators ?? []).map((c) => String(c.description ?? '')),
        image_url: a.images?.web?.url ?? null,
        url: String(a.url ?? ''),
        is_highlight: Boolean(a.is_highlight),
      })),
    };
  }

  private parseArtworkDetail(body: Record<string, unknown>): CmaArtworkDetailOutput {
    const a = (body.data ?? body) as CmaArtwork;
    const imgs = a.images ?? {};
    return {
      id: Number(a.id),
      accession_number: String(a.accession_number ?? ''),
      title: String(a.title ?? ''),
      tombstone: String(a.tombstone ?? ''),
      type: String(a.type ?? ''),
      department: String(a.department ?? ''),
      collection: String(a.collection ?? ''),
      creation_date: a.creation_date ?? null,
      culture: String(a.culture ?? ''),
      technique: String(a.technique ?? ''),
      measurements: a.measurements ?? null,
      description: a.description ?? null,
      creditline: a.creditline ?? null,
      copyright: a.copyright ?? null,
      current_location: a.current_location ?? null,
      is_highlight: Boolean(a.is_highlight),
      on_loan: Boolean(a.on_loan),
      creators: (a.creators ?? []).map((c) => ({
        id: Number(c.id),
        description: String(c.description ?? ''),
        role: String(c.role ?? ''),
        birth_year: c.birth_year ?? null,
        death_year: c.death_year ?? null,
      })),
      images: {
        web: (imgs as Record<string, { url?: string }>)['web']?.url ?? null,
        print: (imgs as Record<string, { url?: string }>)['print']?.url ?? null,
        full: (imgs as Record<string, { url?: string }>)['full']?.url ?? null,
      },
      url: String(a.url ?? ''),
      share_license_status: String(a.share_license_status ?? ''),
    };
  }

  private parseCreatorSearch(body: Record<string, unknown>): CmaCreatorSearchOutput {
    const info = body.info as Record<string, unknown>;
    const data = (body.data ?? []) as CmaCreator[];
    return {
      total: Number(info?.total ?? data.length),
      results: data.map((c) => ({
        id: Number(c.id),
        name: String(c.name ?? ''),
        nationality: String(c.nationality ?? ''),
        description: String(c.description ?? ''),
        birth_year: c.birth_year ?? null,
        death_year: c.death_year ?? null,
        artwork_count: Array.isArray(c.artworks) ? c.artworks.length : 0,
      })),
    };
  }

  private parseExhibitionSearch(body: Record<string, unknown>): CmaExhibitionSearchOutput {
    const info = body.info as Record<string, unknown>;
    const data = (body.data ?? []) as CmaExhibition[];
    return {
      total: Number(info?.total ?? data.length),
      results: data.map((e) => ({
        id: Number(e.id),
        title: String(e.title ?? ''),
        organizer: String(e.organizer ?? ''),
        opening_date: e.opening_date ?? null,
        closing_date: e.closing_date ?? null,
        venues: (e.venues ?? []).map((v) => ({
          name: String(v.name ?? ''),
          start_date: v.start_date ?? null,
          end_date: v.end_date ?? null,
        })),
        is_venue_cma: Boolean(e.is_venue_cma),
      })),
    };
  }
}
