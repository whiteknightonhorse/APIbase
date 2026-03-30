import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import { stripHtml } from '../../utils/strip-html';

/**
 * CourtListener adapter (UC-084).
 * US case law — court opinions, dockets, oral arguments.
 * Auth: None for search. Free, 5K req/hr.
 */
export class CourtListenerAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'courtlistener', baseUrl: 'https://www.courtlistener.com/api/rest/v4' });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const h: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'courtlistener.search': {
        const qs = new URLSearchParams();
        if (p.query) qs.set('q', String(p.query));
        qs.set('type', String(p.type ?? 'o'));
        if (p.court) qs.set('court', String(p.court));
        if (p.filed_after) qs.set('filed_after', String(p.filed_after));
        if (p.filed_before) qs.set('filed_before', String(p.filed_before));
        qs.set('page_size', String(Math.min(Number(p.limit ?? 10), 20)));
        if (p.order_by) qs.set('order_by', String(p.order_by));
        return { url: `${this.baseUrl}/search/?${qs}`, method: 'GET', headers: h };
      }
      case 'courtlistener.opinion': {
        return {
          url: `${this.baseUrl}/opinions/${String(p.opinion_id)}/`,
          method: 'GET',
          headers: h,
        };
      }
      case 'courtlistener.dockets': {
        const qs = new URLSearchParams();
        if (p.query) qs.set('q', String(p.query));
        qs.set('type', 'r');
        if (p.court) qs.set('court', String(p.court));
        qs.set('page_size', String(Math.min(Number(p.limit ?? 10), 20)));
        return { url: `${this.baseUrl}/search/?${qs}`, method: 'GET', headers: h };
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
    if (req.toolId === 'courtlistener.opinion') {
      const d = body as Record<string, unknown>;
      const text = stripHtml(String(d.plain_text ?? d.html ?? '')).slice(0, 5000);
      return {
        id: d.id,
        author: d.author_str,
        type: d.type,
        date_created: d.date_created,
        download_url: d.download_url,
        text: text || null,
      };
    }
    // search + dockets
    const results = (body.results ?? []) as Array<Record<string, unknown>>;
    return {
      total: body.count ?? 0,
      results: results.map((r) => ({
        case_name: r.caseName,
        court: r.court,
        date_filed: r.dateFiled,
        docket_number: r.docketNumber,
        status: r.status,
        snippet: r.snippet ? stripHtml(String(r.snippet)).slice(0, 300) : null,
        absolute_url: r.absolute_url ? `https://www.courtlistener.com${r.absolute_url}` : null,
      })),
    };
  }
}
