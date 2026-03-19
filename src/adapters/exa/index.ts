import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { ExaSearchResponse, ExaContentsResponse } from './types';

/**
 * Exa semantic search adapter (UC-069).
 *
 * Supported tools (read-only):
 *   exa.search       → POST /search
 *   exa.contents     → POST /contents
 *   exa.find_similar → POST /findSimilar
 *
 * Auth: x-api-key header.
 * Free tier: 1,000 req/month. PAYG $7/1K search, $1/1K contents.
 */
export class ExaAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'exa',
      baseUrl: 'https://api.exa.ai',
      timeoutMs: 15_000,
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
    };

    switch (req.toolId) {
      case 'exa.search':
        return this.buildSearchRequest(params, headers);
      case 'exa.contents':
        return this.buildContentsRequest(params, headers);
      case 'exa.find_similar':
        return this.buildFindSimilarRequest(params, headers);
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
      case 'exa.search':
      case 'exa.find_similar':
        return this.parseSearchResponse(raw);
      case 'exa.contents':
        return this.parseContentsResponse(raw);
      default:
        return raw.body;
    }
  }

  private buildSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const body: Record<string, unknown> = {
      query: params.query,
      type: params.type ?? 'auto',
      numResults: Math.min(Number(params.num_results ?? 10), 25),
    };
    if (params.include_domains) body.includeDomains = params.include_domains;
    if (params.exclude_domains) body.excludeDomains = params.exclude_domains;
    if (params.start_published_date) body.startPublishedDate = params.start_published_date;
    if (params.end_published_date) body.endPublishedDate = params.end_published_date;
    if (params.category) body.category = params.category;

    const contents: Record<string, unknown> = {};
    if (params.include_text) contents.text = { maxCharacters: 10000 };
    if (params.include_highlights !== false) contents.highlights = { maxCharacters: 2000 };
    if (Object.keys(contents).length > 0) body.contents = contents;

    return { url: `${this.baseUrl}/search`, method: 'POST', headers, body: JSON.stringify(body) };
  }

  private buildContentsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const body: Record<string, unknown> = {
      urls: params.urls,
      text: { maxCharacters: 10000 },
    };

    return { url: `${this.baseUrl}/contents`, method: 'POST', headers, body: JSON.stringify(body) };
  }

  private buildFindSimilarRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const body: Record<string, unknown> = {
      url: params.url,
      numResults: Math.min(Number(params.num_results ?? 10), 25),
      excludeSourceDomain: params.exclude_source_domain ?? true,
    };
    if (params.start_published_date) body.startPublishedDate = params.start_published_date;

    const contents: Record<string, unknown> = {};
    if (params.include_text) contents.text = { maxCharacters: 10000 };
    contents.highlights = { maxCharacters: 2000 };
    body.contents = contents;

    return { url: `${this.baseUrl}/findSimilar`, method: 'POST', headers, body: JSON.stringify(body) };
  }

  private parseSearchResponse(raw: ProviderRawResponse): unknown {
    const body = raw.body as unknown as ExaSearchResponse;
    return {
      results: (body.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        score: r.score,
        published_date: r.publishedDate ?? null,
        author: r.author ?? null,
        highlights: r.highlights ?? [],
        text: r.text ? r.text.slice(0, 5000) : null,
      })),
    };
  }

  private parseContentsResponse(raw: ProviderRawResponse): unknown {
    const body = raw.body as unknown as ExaContentsResponse;
    return {
      results: (body.results ?? []).map((r) => ({
        url: r.url,
        title: r.title ?? null,
        author: r.author ?? null,
        published_date: r.publishedDate ?? null,
        text: r.text ? r.text.slice(0, 5000) : null,
      })),
    };
  }
}
