import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  FederalRegisterSearchResponse,
  FederalRegisterDocumentDetail,
  FederalRegisterAgenciesResponse,
  FederalRegisterPublicInspectionResponse,
} from './types';

const FEDERALREGISTER_BASE = 'https://www.federalregister.gov';

/**
 * Federal Register API adapter (UC-605).
 *
 * Supported tools (read-only):
 *   federalregister.search             → GET /api/v1/documents.json
 *   federalregister.document           → GET /api/v1/documents/{document_number}.json
 *   federalregister.agencies           → GET /api/v1/agencies.json (filtered client-side)
 *   federalregister.public_inspection  → GET /api/v1/public-inspection-documents/current.json
 *
 * Auth: None (US Government open data, public domain — GPO/NARA).
 */
export class FederalRegisterAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'federalregister',
      baseUrl: FEDERALREGISTER_BASE,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'federalregister.search':
        return this.buildSearchRequest(params, headers);
      case 'federalregister.document':
        return this.buildDocumentRequest(params, headers);
      case 'federalregister.agencies':
        return this.buildAgenciesRequest(headers);
      case 'federalregister.public_inspection':
        return this.buildPublicInspectionRequest(headers);
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
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'federalregister.search': {
        const data = raw.body as unknown as FederalRegisterSearchResponse;
        // Upstream ignores per_page=1 and falls back to its default page size (20) —
        // slice defensively so the caller always gets exactly what they asked for.
        const perPage = Math.min(Math.max(Number(params.per_page ?? 20), 1), 100);
        return {
          count: data.count,
          total_pages: data.total_pages,
          has_more: data.next_page_url !== null,
          results: (data.results ?? []).slice(0, perPage).map((d) => ({
            document_number: d.document_number,
            title: d.title,
            type: d.type,
            abstract: d.abstract,
            publication_date: d.publication_date,
            agencies: (d.agencies ?? []).map((a) => a.name),
            html_url: d.html_url,
            pdf_url: d.pdf_url,
          })),
        };
      }
      case 'federalregister.document': {
        const d = raw.body as unknown as FederalRegisterDocumentDetail;
        return {
          document_number: d.document_number,
          title: d.title,
          type: d.type,
          abstract: d.abstract,
          action: d.action,
          dates: d.dates,
          agencies: (d.agencies ?? []).map((a) => a.name),
          citation: d.citation,
          docket_ids: d.docket_ids,
          cfr_references: (d.cfr_references ?? []).map((c) => `${c.title} CFR ${c.part}`),
          effective_on: d.effective_on,
          comments_close_on: d.comments_close_on,
          comment_url: d.comment_url,
          significant: d.significant,
          publication_date: d.publication_date,
          html_url: d.html_url,
          pdf_url: d.pdf_url,
          full_text_xml_url: d.full_text_xml_url,
        };
      }
      case 'federalregister.agencies': {
        const all = raw.body as unknown as FederalRegisterAgenciesResponse;
        const query = (params.query as string | undefined)?.toLowerCase().trim();
        const max = Math.min(Math.max(Number(params.max ?? 20), 1), 50);
        const filtered = query
          ? all.filter(
              (a) =>
                a.name.toLowerCase().includes(query) ||
                (a.short_name ?? '').toLowerCase().includes(query),
            )
          : all;
        return {
          count: filtered.length,
          agencies: filtered.slice(0, max).map((a) => ({
            id: a.id,
            name: a.name,
            short_name: a.short_name,
            slug: a.slug,
            parent_id: a.parent_id,
            url: a.url,
          })),
        };
      }
      case 'federalregister.public_inspection': {
        const data = raw.body as unknown as FederalRegisterPublicInspectionResponse;
        const agencyFilter = (params.agency as string | undefined)?.toLowerCase().trim();
        const max = Math.min(Math.max(Number(params.max ?? 20), 1), 100);
        let results = data.results ?? [];
        if (agencyFilter) {
          results = results.filter((d) =>
            (d.agencies ?? []).some((a) => a.name.toLowerCase().includes(agencyFilter)),
          );
        }
        return {
          count: results.length,
          documents: results.slice(0, max).map((d) => ({
            document_number: d.document_number,
            title: d.title,
            type: d.type,
            filing_type: d.filing_type,
            filed_at: d.filed_at,
            publication_date: d.publication_date,
            agencies: (d.agencies ?? []).map((a) => a.name),
            html_url: d.html_url,
            pdf_url: d.pdf_url,
          })),
        };
      }
      default:
        return raw.body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.term) qs.set('conditions[term]', String(params.term));
    if (params.agency_slug) qs.append('conditions[agencies][]', String(params.agency_slug));
    if (params.type) qs.append('conditions[type][]', String(params.type));
    if (params.publication_date_gte) {
      qs.set('conditions[publication_date][gte]', String(params.publication_date_gte));
    }
    if (params.publication_date_lte) {
      qs.set('conditions[publication_date][lte]', String(params.publication_date_lte));
    }
    qs.set('order', params.order ? String(params.order) : 'newest');
    qs.set('per_page', params.per_page ? String(params.per_page) : '20');
    if (params.page) qs.set('page', String(params.page));

    return {
      url: `${this.baseUrl}/api/v1/documents.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildDocumentRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const documentNumber = encodeURIComponent(String(params.document_number ?? ''));
    return {
      url: `${this.baseUrl}/api/v1/documents/${documentNumber}.json`,
      method: 'GET',
      headers,
    };
  }

  private buildAgenciesRequest(headers: Record<string, string>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    return {
      url: `${this.baseUrl}/api/v1/agencies.json`,
      method: 'GET',
      headers,
    };
  }

  private buildPublicInspectionRequest(headers: Record<string, string>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    return {
      url: `${this.baseUrl}/api/v1/public-inspection-documents/current.json`,
      method: 'GET',
      headers,
    };
  }
}
