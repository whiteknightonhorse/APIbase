import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse, ProviderErrorCode } from '../../types/provider';

/**
 * Regulations.gov adapter (UC-082).
 * US federal regulatory documents, dockets, comments.
 * Auth: DEMO_KEY (free, 1K req/hr). No signup needed.
 */
export class RegulationsAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'regulations', baseUrl: 'https://api.regulations.gov/v4' });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const h: Record<string, string> = { Accept: 'application/json', 'X-Api-Key': 'DEMO_KEY' };

    switch (req.toolId) {
      case 'regulations.search': {
        const qs = new URLSearchParams();
        qs.set('api_key', 'DEMO_KEY');
        if (p.query) qs.set('filter[searchTerm]', String(p.query));
        if (p.document_type) qs.set('filter[documentType]', String(p.document_type));
        if (p.agency) qs.set('filter[agencyId]', String(p.agency));
        if (p.posted_after) qs.set('filter[postedDate][ge]', String(p.posted_after));
        qs.set('page[size]', String(Math.max(5, Math.min(Number(p.limit ?? 10), 25))));
        if (p.sort) qs.set('sort', String(p.sort));
        return { url: `${this.baseUrl}/documents?${qs}`, method: 'GET', headers: h };
      }
      case 'regulations.document': {
        return { url: `${this.baseUrl}/documents/${String(p.document_id)}?api_key=DEMO_KEY`, method: 'GET', headers: h };
      }
      default:
        throw { code: ProviderErrorCode.INVALID_RESPONSE, httpStatus: 502, message: `Unsupported: ${req.toolId}`, provider: this.provider, toolId: req.toolId, durationMs: 0 };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;
    if (req.toolId === 'regulations.search') {
      const data = (body.data ?? []) as Array<Record<string, unknown>>;
      const meta = (body.meta ?? {}) as Record<string, unknown>;
      return {
        total: meta.totalElements ?? 0,
        documents: data.map((d) => {
          const a = (d.attributes ?? {}) as Record<string, unknown>;
          return { id: d.id, title: a.title, document_type: a.documentType, agency: a.agencyId, posted_date: a.postedDate, comment_end_date: a.commentEndDate, docket_id: a.docketId };
        }),
      };
    }
    // document detail
    const d = (body.data ?? body) as Record<string, unknown>;
    const a = ((d as Record<string, unknown>).attributes ?? d) as Record<string, unknown>;
    return { id: d.id, title: a.title, document_type: a.documentType, agency: a.agencyId, posted_date: a.postedDate, abstract: a.summary ?? a.abstractText, docket_id: a.docketId, comment_count: a.numberOfCommentsReceived, url: a.fileUrl ?? a.objectId };
  }
}
