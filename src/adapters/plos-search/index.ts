import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { PlosSearchResponse, PlosDoc } from './types';

const PLOS_SEARCH_BASE = 'https://api.plos.org';
const SEARCH_FIELDS = 'id,title,journal,article_type,publication_date,author,abstract,subject';
const MAX_ROWS = 50;

/**
 * PLOS Search API adapter (UC-609).
 *
 * Supported tools (read-only):
 *   plos-search.search          → GET /search?q=...&fq=journal:...&rows=...&sort=...
 *   plos-search.article_detail  → GET /search?q=id:{doi}
 *
 * Auth: None (Public Library of Science, open-access CC-BY corpus,
 * api.plos.org — Solr-backed search over PLOS ONE/Biology/Medicine/
 * Genetics/Computational Biology/Pathogens/NTD/Global Public Health/
 * Digital Health/Climate/Mental Health/Water/Sustainability journals).
 */
export class PlosSearchAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'plos-search',
      baseUrl: PLOS_SEARCH_BASE,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'plos-search.search':
        return this.buildSearchRequest(params, headers);
      case 'plos-search.article_detail':
        return this.buildDetailRequest(params, headers);
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
    const data = raw.body as unknown as PlosSearchResponse;
    const docs = data.response?.docs ?? [];

    switch (req.toolId) {
      case 'plos-search.search': {
        return {
          total_found: data.response?.numFound ?? 0,
          count: docs.length,
          articles: docs.map((d) => this.condenseArticle(d)),
        };
      }
      case 'plos-search.article_detail': {
        const doc = docs[0];
        if (!doc) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 404,
            message: 'No article found for the given DOI',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return this.condenseArticle(doc);
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
    qs.set('q', String(params.query ?? ''));
    qs.set('fl', SEARCH_FIELDS);

    if (params.journal) {
      qs.set('fq', `journal:"${String(params.journal)}"`);
    }

    const rows = Math.min(Math.max(1, Number(params.max_results) || 10), MAX_ROWS);
    qs.set('rows', String(rows));

    if (params.sort === 'date_desc') {
      qs.set('sort', 'publication_date desc');
    } else if (params.sort === 'date_asc') {
      qs.set('sort', 'publication_date asc');
    }

    return {
      url: `${this.baseUrl}/search?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildDetailRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const doi = String(params.doi ?? '');
    const qs = new URLSearchParams();
    qs.set('q', `id:"${doi}"`);
    qs.set('fl', SEARCH_FIELDS);
    qs.set('rows', '1');

    return {
      url: `${this.baseUrl}/search?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // Response shaping
  // ---------------------------------------------------------------------------

  private condenseArticle(d: PlosDoc) {
    return {
      doi: d.id,
      title: d.title ?? null,
      journal: d.journal ?? null,
      article_type: d.article_type ?? null,
      publication_date: d.publication_date ?? null,
      authors: d.author ?? [],
      abstract: d.abstract?.[0] ?? null,
      subjects: d.subject ?? [],
    };
  }
}
