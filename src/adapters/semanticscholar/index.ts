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

const S2_MIN_INTERVAL_MS = 1100;
const S2_MAX_QUEUE_WAIT_MS = 5000;
const S2_RATE_LIMIT_RETRIES = 2;
const S2_BACKOFF_BASE_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
 * Auth: key optional via PROVIDER_KEY_SEMANTICSCHOLAR, sent as x-api-key;
 * introductory limit 1 req/s per key (application form, 2026-11-04). A
 * process-wide 1 req/s gate plus exponential backoff on 429 live in this
 * adapter. Without a key the shared anonymous pool applies.
 * Data is a mix of licenses per-paper; API responses themselves carry no
 * blanket redistribution restriction for metadata (titles/abstracts/counts).
 * Docs: https://api.semanticscholar.org/api-docs/graph
 */
export class SemanticScholarAdapter extends BaseAdapter {
  private readonly apiKey: string;
  private nextSlotAt = 0;

  constructor(apiKey: string) {
    super({ provider: 'semanticscholar', baseUrl: S2_BASE });
    this.apiKey = apiKey;
  }

  /** Reserve the next 1 req/s slot; throws RATE_LIMIT when the local queue is too long. */
  private async acquireSlot(toolId: string): Promise<void> {
    const now = Date.now();
    const startAt = Math.max(now, this.nextSlotAt);
    const wait = startAt - now;
    if (wait > S2_MAX_QUEUE_WAIT_MS) {
      throw {
        code: ProviderErrorCode.RATE_LIMIT,
        httpStatus: 429,
        retryAfter: Math.ceil(wait / 1000),
        message: 'semanticscholar local 1 req/s queue is full',
        provider: this.provider,
        toolId,
        durationMs: 0,
      };
    }
    this.nextSlotAt = startAt + S2_MIN_INTERVAL_MS;
    if (wait > 0) await sleep(wait);
  }

  override async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    for (let attempt = 0; ; attempt++) {
      await this.acquireSlot(req.toolId);
      try {
        return await super.call(req);
      } catch (e) {
        const code = (e as { code?: unknown } | null)?.code;
        if (code !== ProviderErrorCode.RATE_LIMIT || attempt >= S2_RATE_LIMIT_RETRIES) throw e;
        await sleep(S2_BACKOFF_BASE_MS * 2 ** attempt);
      }
    }
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.apiKey.length > 0) headers['x-api-key'] = this.apiKey;

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
