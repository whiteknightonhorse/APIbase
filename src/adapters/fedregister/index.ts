import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse, ProviderErrorCode } from '../../types/provider';

/**
 * Federal Register adapter (UC-083).
 * US federal rules, proposed rules, executive orders.
 * Auth: None required. Public domain.
 */
export class FedRegisterAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'fedregister', baseUrl: 'https://www.federalregister.gov/api/v1' });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const h: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'fedregister.search': {
        const qs = new URLSearchParams();
        if (p.query) qs.set('conditions[term]', String(p.query));
        if (p.document_type) qs.set('conditions[type][]', String(p.document_type));
        if (p.agency) qs.set('conditions[agencies][]', String(p.agency));
        if (p.published_after) qs.set('conditions[publication_date][gte]', String(p.published_after));
        qs.set('per_page', String(Math.min(Number(p.limit ?? 10), 20)));
        qs.set('order', String(p.sort ?? 'newest'));
        return { url: `${this.baseUrl}/documents.json?${qs}`, method: 'GET', headers: h };
      }
      case 'fedregister.document': {
        return { url: `${this.baseUrl}/documents/${String(p.document_number)}.json`, method: 'GET', headers: h };
      }
      case 'fedregister.recent': {
        const qs = new URLSearchParams();
        qs.set('per_page', String(Math.min(Number(p.limit ?? 10), 20)));
        qs.set('order', 'newest');
        if (p.document_type) qs.set('conditions[type][]', String(p.document_type));
        return { url: `${this.baseUrl}/documents.json?${qs}`, method: 'GET', headers: h };
      }
      default:
        throw { code: ProviderErrorCode.INVALID_RESPONSE, httpStatus: 502, message: `Unsupported: ${req.toolId}`, provider: this.provider, toolId: req.toolId, durationMs: 0 };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;
    if (req.toolId === 'fedregister.document') {
      const d = body as Record<string, unknown>;
      return { document_number: d.document_number, title: d.title, type: d.type, abstract: d.abstract, publication_date: d.publication_date, agencies: (d.agencies as Array<Record<string, unknown>> ?? []).map(a => a.name), pdf_url: d.pdf_url, html_url: d.html_url, effective_date: d.effective_on, comment_end_date: d.comments_close_on };
    }
    // search + recent
    const results = (body.results ?? []) as Array<Record<string, unknown>>;
    return {
      total: body.count ?? 0,
      documents: results.map((d) => ({
        document_number: d.document_number, title: d.title, type: d.type, abstract: (d.abstract as string)?.slice(0, 300) ?? null, publication_date: d.publication_date, agencies: (d.agencies as Array<Record<string, unknown>> ?? []).map(a => a.name), pdf_url: d.pdf_url, html_url: d.html_url,
      })),
    };
  }
}
