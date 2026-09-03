import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  S2PaperSearchResponse,
  S2AuthorSearchResponse,
  S2Paper,
  S2PapersSearchOutput,
  S2AuthorsSearchOutput,
  S2PaperDetailOutput,
} from './types';

const S2_BASE = 'https://api.semanticscholar.org/graph/v1';
const SEARCH_FIELDS = 'title,year,venue,authors,externalIds,citationCount,openAccessPdf';
const DETAIL_FIELDS =
  'title,abstract,tldr,year,venue,authors,externalIds,citationCount,referenceCount,' +
  'fieldsOfStudy,openAccessPdf';

/**
 * Semantic Scholar Graph API adapter (UC-675).
 *
 * Supported tools:
 *   semanticscholar.papers_search  -> /paper/search    scholarly paper search (200M+ papers)
 *   semanticscholar.authors_search -> /author/search    researcher/author search
 *   semanticscholar.get_paper      -> /paper/{id}       full paper detail by S2 ID, DOI, or ArXiv ID
 *
 * Auth: None. Public endpoints are open to unauthenticated callers, shared
 * 1000 req/s pool across all anonymous users per Semantic Scholar's own docs
 * (https://www.semanticscholar.org/product/api — "Do I need an API Key?").
 * Data is a mix of licenses per-paper; API responses themselves carry no
 * blanket redistribution restriction for metadata (titles/abstracts/counts).
 * Docs: https://api.semanticscholar.org/api-docs/graph
 */
export class SemanticScholarAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'semanticscholar', baseUrl: S2_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'semanticscholar.papers_search': {
        const query = String(params.query || '').trim();
        if (!query) {
          throw this.invalidInput(req.toolId, 'query is required');
        }
        const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 25);
        const qs = new URLSearchParams();
        qs.set('query', query);
        qs.set('limit', String(limit));
        qs.set('fields', SEARCH_FIELDS);
        return { url: `${S2_BASE}/paper/search?${qs.toString()}`, method: 'GET', headers };
      }

      case 'semanticscholar.authors_search': {
        const query = String(params.query || '').trim();
        if (!query) {
          throw this.invalidInput(req.toolId, 'query is required');
        }
        const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 25);
        const qs = new URLSearchParams();
        qs.set('query', query);
        qs.set('limit', String(limit));
        qs.set('fields', 'name,affiliations,paperCount,citationCount,hIndex');
        return { url: `${S2_BASE}/author/search?${qs.toString()}`, method: 'GET', headers };
      }

      case 'semanticscholar.get_paper': {
        const rawId = String(params.paper_id || '').trim();
        if (!rawId) {
          throw this.invalidInput(
            req.toolId,
            'paper_id is required (Semantic Scholar paper ID, DOI, or ArXiv ID)',
          );
        }
        const id = this.normalizePaperId(rawId);
        const qs = new URLSearchParams();
        qs.set('fields', DETAIL_FIELDS);
        return {
          url: `${S2_BASE}/paper/${encodeURIComponent(id)}?${qs.toString()}`,
          method: 'GET',
          headers,
        };
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
    switch (req.toolId) {
      case 'semanticscholar.papers_search':
        return this.parsePapersSearch(raw.body as S2PaperSearchResponse);
      case 'semanticscholar.authors_search':
        return this.parseAuthorsSearch(raw.body as S2AuthorSearchResponse);
      case 'semanticscholar.get_paper':
        return this.parsePaperDetail(raw.body as S2Paper);
      default:
        return raw.body;
    }
  }

  /**
   * Semantic Scholar's /paper/{id} endpoint accepts a bare S2 paper ID
   * (40-char sha), or a prefixed external ID (DOI:..., ARXIV:..., PMID:...,
   * CorpusID:..., MAG:..., ACL:..., URL:...). A bare DOI (starts with
   * "10.") needs the "DOI:" prefix added to disambiguate; anything already
   * prefixed or a bare S2 ID is passed through unchanged.
   */
  private normalizePaperId(id: string): string {
    if (id.startsWith('10.')) {
      return `DOI:${id}`;
    }
    return id;
  }

  private parsePapersSearch(data: S2PaperSearchResponse): S2PapersSearchOutput {
    return {
      total: data.total ?? 0,
      results: (data.data ?? []).map((p) => ({
        paper_id: p.paperId,
        doi: p.externalIds?.DOI ?? null,
        title: p.title ?? '',
        year: p.year ?? null,
        venue: p.venue ?? null,
        authors: (p.authors ?? []).map((a) => a.name).filter((n): n is string => Boolean(n)),
        citation_count: p.citationCount ?? 0,
        is_open_access: Boolean(p.openAccessPdf?.url),
        open_access_pdf_url: p.openAccessPdf?.url ?? null,
      })),
    };
  }

  private parseAuthorsSearch(data: S2AuthorSearchResponse): S2AuthorsSearchOutput {
    return {
      total: data.total ?? 0,
      results: (data.data ?? []).map((a) => ({
        author_id: a.authorId,
        name: a.name ?? '',
        affiliations: a.affiliations ?? [],
        paper_count: a.paperCount ?? 0,
        citation_count: a.citationCount ?? 0,
        h_index: a.hIndex ?? null,
      })),
    };
  }

  private parsePaperDetail(p: S2Paper): S2PaperDetailOutput {
    return {
      paper_id: p.paperId,
      doi: p.externalIds?.DOI ?? null,
      arxiv_id: p.externalIds?.ArXiv ?? null,
      pubmed_id: p.externalIds?.PubMed ?? null,
      title: p.title ?? '',
      abstract: p.abstract ?? null,
      tldr: p.tldr?.text ?? null,
      year: p.year ?? null,
      venue: p.venue ?? null,
      fields_of_study: p.fieldsOfStudy ?? [],
      authors: (p.authors ?? []).map((a) => ({
        author_id: a.authorId ?? null,
        name: a.name ?? '',
      })),
      citation_count: p.citationCount ?? 0,
      reference_count: p.referenceCount ?? 0,
      is_open_access: Boolean(p.openAccessPdf?.url),
      open_access_pdf_url: p.openAccessPdf?.url ?? null,
    };
  }

  private invalidInput(toolId: string, message: string): never {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message,
      provider: this.provider,
      toolId,
      durationMs: 0,
    };
  }
}
