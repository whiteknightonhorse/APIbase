import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  OpenAlexWorksResponse,
  OpenAlexAuthorsResponse,
  OpenAlexWork,
  OpenAlexWorksSearchOutput,
  OpenAlexAuthorsSearchOutput,
  OpenAlexWorkDetailOutput,
} from './types';

const OPENALEX_BASE = 'https://api.openalex.org';
// Polite pool contact — a descriptive User-Agent with a mailto contact gets
// priority rate limits (self-reported by OpenAlex; no API key involved),
// same practice already used by the crossref adapter for the same reason.
const USER_AGENT = 'APIbase/1.0 (https://apibase.pro; mailto:infocitysms@gmail.com)';
const WORKS_SELECT =
  'id,doi,title,display_name,publication_year,cited_by_count,open_access,authorships,primary_topic';

/**
 * OpenAlex REST API adapter (UC-674).
 *
 * Supported tools:
 *   openalex.works_search   -> /works?search=...    scholarly work search (250M+ works)
 *   openalex.authors_search -> /authors?search=...  researcher/author search (90M+ authors)
 *   openalex.get_work       -> /works/{id}          full work detail by OpenAlex ID or DOI
 *
 * Auth: None. Fully open, no API key. A descriptive User-Agent with a mailto
 * contact opts into the "polite pool" for priority rate limits (self-reported
 * by OpenAlex, not a registered quota). CC0 metadata.
 * Docs: https://docs.openalex.org
 */
export class OpenAlexAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'openalex', baseUrl: OPENALEX_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    };

    switch (req.toolId) {
      case 'openalex.works_search': {
        const query = String(params.query || '').trim();
        if (!query) {
          throw this.invalidInput(req.toolId, 'query is required');
        }
        const perPage = Math.min(Math.max(Number(params.per_page) || 10, 1), 25);
        const qs = new URLSearchParams();
        qs.set('search', query);
        qs.set('per_page', String(perPage));
        qs.set('select', WORKS_SELECT);
        return { url: `${OPENALEX_BASE}/works?${qs.toString()}`, method: 'GET', headers };
      }

      case 'openalex.authors_search': {
        const query = String(params.query || '').trim();
        if (!query) {
          throw this.invalidInput(req.toolId, 'query is required');
        }
        const perPage = Math.min(Math.max(Number(params.per_page) || 10, 1), 25);
        const qs = new URLSearchParams();
        qs.set('search', query);
        qs.set('per_page', String(perPage));
        return { url: `${OPENALEX_BASE}/authors?${qs.toString()}`, method: 'GET', headers };
      }

      case 'openalex.get_work': {
        const rawId = String(params.id || '').trim();
        if (!rawId) {
          throw this.invalidInput(req.toolId, 'id is required (OpenAlex work ID or DOI)');
        }
        const id = this.normalizeWorkId(rawId);
        return {
          url: `${OPENALEX_BASE}/works/${encodeURIComponent(id)}`,
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
      case 'openalex.works_search':
        return this.parseWorksSearch(raw.body as OpenAlexWorksResponse);
      case 'openalex.authors_search':
        return this.parseAuthorsSearch(raw.body as OpenAlexAuthorsResponse);
      case 'openalex.get_work':
        return this.parseWorkDetail(raw.body as OpenAlexWork);
      default:
        return raw.body;
    }
  }

  /**
   * Accept a raw OpenAlex ID (W1234...), a full OpenAlex URL, a bare DOI
   * (10.xxx/yyy), or a doi.org URL — OpenAlex's /works/{id} endpoint accepts
   * any of these forms directly except a bare DOI, which needs a `doi:`
   * prefix to disambiguate from an OpenAlex ID.
   */
  private normalizeWorkId(id: string): string {
    if (id.startsWith('10.')) {
      return `doi:${id}`;
    }
    return id;
  }

  private parseWorksSearch(data: OpenAlexWorksResponse): OpenAlexWorksSearchOutput {
    return {
      total: data.meta?.count ?? 0,
      results: (data.results ?? []).map((w) => ({
        id: w.id,
        doi: w.doi ?? null,
        title: w.title ?? w.display_name ?? '',
        publication_year: w.publication_year ?? null,
        authors: (w.authorships ?? [])
          .map((a) => a.author?.display_name)
          .filter((n): n is string => Boolean(n)),
        is_oa: w.open_access?.is_oa ?? false,
        oa_status: w.open_access?.oa_status ?? null,
        cited_by_count: w.cited_by_count ?? 0,
        primary_topic: w.primary_topic?.display_name ?? null,
      })),
    };
  }

  private parseAuthorsSearch(data: OpenAlexAuthorsResponse): OpenAlexAuthorsSearchOutput {
    return {
      total: data.meta?.count ?? 0,
      results: (data.results ?? []).map((a) => ({
        id: a.id,
        orcid: a.orcid ?? null,
        display_name: a.display_name ?? '',
        works_count: a.works_count ?? 0,
        cited_by_count: a.cited_by_count ?? 0,
        h_index: a.summary_stats?.h_index ?? null,
        last_known_institution: a.last_known_institutions?.[0]?.display_name ?? null,
        country_code: a.last_known_institutions?.[0]?.country_code ?? null,
      })),
    };
  }

  private parseWorkDetail(w: OpenAlexWork): OpenAlexWorkDetailOutput {
    return {
      id: w.id,
      doi: w.doi ?? null,
      title: w.title ?? w.display_name ?? '',
      publication_year: w.publication_year ?? null,
      publication_date: w.publication_date ?? null,
      type: w.type ?? null,
      authors: (w.authorships ?? []).map((a) => ({
        name: a.author?.display_name ?? '',
        orcid: a.author?.orcid ?? null,
        institutions: (a.institutions ?? [])
          .map((i) => i.display_name)
          .filter((n): n is string => Boolean(n)),
      })),
      is_oa: w.open_access?.is_oa ?? false,
      oa_status: w.open_access?.oa_status ?? null,
      oa_url: w.open_access?.oa_url ?? null,
      landing_page_url: w.primary_location?.landing_page_url ?? null,
      pdf_url: w.primary_location?.pdf_url ?? null,
      cited_by_count: w.cited_by_count ?? 0,
      referenced_works_count: w.referenced_works_count ?? 0,
      primary_topic: w.primary_topic?.display_name ?? null,
      abstract: this.reconstructAbstract(w.abstract_inverted_index),
    };
  }

  /**
   * OpenAlex stores abstracts as an inverted index (word -> positions) to
   * respect publisher copyright on full-text reproduction. Rebuild plain
   * text from it; truncate defensively since some abstracts run long.
   */
  private reconstructAbstract(index: Record<string, number[]> | null | undefined): string | null {
    if (!index) return null;
    const positions: { word: string; pos: number }[] = [];
    for (const [word, positionsForWord] of Object.entries(index)) {
      for (const pos of positionsForWord) {
        positions.push({ word, pos });
      }
    }
    if (positions.length === 0) return null;
    positions.sort((a, b) => a.pos - b.pos);
    return positions
      .map((p) => p.word)
      .join(' ')
      .slice(0, 2000);
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
