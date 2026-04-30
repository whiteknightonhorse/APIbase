import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * US Library of Congress adapter (UC-409).
 * 415K+ digitized historical items via the website's JSON mode (?fo=json).
 * Public domain by US Statute (17 USC §105). No auth.
 */
export class LocAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'loc', baseUrl: 'https://www.loc.gov', maxResponseBytes: 2_000_000 });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'loc.search': {
        const qs = new URLSearchParams();
        qs.set('fo', 'json');
        qs.set('q', String(p.query));
        qs.set('c', String(Math.max(1, Math.min(50, Number(p.limit ?? 20)))));
        if (p.format) qs.set('fa', `online-format:${p.format}`);
        if (p.collection) qs.set('fa', `partof:${p.collection}`);
        if (p.page !== undefined) qs.set('sp', String(p.page));
        return { url: `${this.baseUrl}/search/?${qs.toString()}`, method: 'GET', headers };
      }
      case 'loc.item': {
        const id = String(p.item_id).replace(/^https?:\/\/(www\.)?loc\.gov\//, '');
        return { url: `${this.baseUrl}/${id}/?fo=json`, method: 'GET', headers };
      }
      case 'loc.collections': {
        const qs = new URLSearchParams();
        qs.set('fo', 'json');
        qs.set('c', String(Math.max(1, Math.min(50, Number(p.limit ?? 20)))));
        return { url: `${this.baseUrl}/collections/?${qs.toString()}`, method: 'GET', headers };
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
    const body = raw.body as Record<string, unknown>;

    switch (req.toolId) {
      case 'loc.search': {
        const results = (body.results as Array<Record<string, unknown>>) ?? [];
        const pagination = (body.pagination as Record<string, unknown>) ?? {};
        return {
          total: pagination.of ?? results.length,
          page: pagination.current,
          total_pages: pagination.total,
          results: results.slice(0, 50).map((r) => ({
            id: r.id,
            title: r.title,
            description: typeof r.description === 'string' ? r.description : undefined,
            date: r.date,
            contributors: r.contributor,
            languages: r.language,
            subjects: r.subject,
            online_format: r.online_format,
            url: r.url,
            image_url: Array.isArray(r.image_url) ? r.image_url[0] : r.image_url,
            access_restricted: r.access_restricted,
          })),
        };
      }
      case 'loc.item': {
        const item = (body.item as Record<string, unknown>) ?? {};
        const resources = (body.resources as Array<Record<string, unknown>>) ?? [];
        return {
          id: item.id,
          title: item.title,
          description: item.description,
          date: item.date,
          contributors: item.contributor_names ?? item.contributor,
          subjects: item.subject_headings ?? item.subjects,
          languages: item.language,
          online_format: item.online_format,
          rights: item.rights,
          url: item.url,
          access_restricted: item.access_restricted,
          resources: resources.slice(0, 20).map((r) => ({
            url: r.url,
            mime_type: r.mime_type,
            caption: r.caption,
          })),
        };
      }
      case 'loc.collections': {
        const results = (body.results as Array<Record<string, unknown>>) ?? [];
        return {
          total: results.length,
          collections: results.slice(0, 50).map((c) => ({
            id: c.id,
            title: c.title,
            description: c.description,
            url: c.url,
            count: c.count,
            image_url: Array.isArray(c.image_url) ? c.image_url[0] : c.image_url,
          })),
        };
      }
      default:
        return body;
    }
  }
}
