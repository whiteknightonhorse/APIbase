import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { TavilySearchResponse, TavilyExtractResult } from './types';

/**
 * Tavily AI Search adapter (UC-068).
 *
 * Supported tools (read-only):
 *   tavily.search  → POST /search
 *   tavily.extract → POST /extract
 *
 * Auth: api_key in JSON body (not header).
 * Free tier: 1,000 credits/month. PAYG $0.008/credit overage.
 */
export class TavilyAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'tavily',
      baseUrl: 'https://api.tavily.com',
      timeoutMs: 15_000, // Tavily can take 2-5s for deep search
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
      'Content-Type': 'application/json',
    };

    switch (req.toolId) {
      case 'tavily.search':
        return this.buildSearchRequest(params, headers);
      case 'tavily.extract':
        return this.buildExtractRequest(params, headers);
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
      case 'tavily.search':
        return this.parseSearchResponse(raw);
      case 'tavily.extract':
        return this.parseExtractResponse(raw);
      default:
        return raw.body;
    }
  }

  private buildSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const body: Record<string, unknown> = {
      api_key: this.apiKey,
      query: params.query,
      search_depth: params.search_depth ?? 'basic',
      include_answer: params.include_answer ?? true,
      include_raw_content: false,
      max_results: Math.min(Number(params.max_results ?? 5), 20),
    };
    if (params.include_domains) body.include_domains = params.include_domains;
    if (params.exclude_domains) body.exclude_domains = params.exclude_domains;
    if (params.days) body.days = params.days;

    return { url: `${this.baseUrl}/search`, method: 'POST', headers, body: JSON.stringify(body) };
  }

  private buildExtractRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const body: Record<string, unknown> = {
      api_key: this.apiKey,
      urls: params.urls,
    };

    return { url: `${this.baseUrl}/extract`, method: 'POST', headers, body: JSON.stringify(body) };
  }

  private parseSearchResponse(raw: ProviderRawResponse): unknown {
    const body = raw.body as unknown as TavilySearchResponse;
    return {
      answer: body.answer ?? null,
      results: (body.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
        published_date: r.published_date ?? null,
      })),
      response_time: body.response_time,
    };
  }

  private parseExtractResponse(raw: ProviderRawResponse): unknown {
    const body = raw.body as unknown as TavilyExtractResult;
    return {
      results: (body.results ?? []).map((r) => ({
        url: r.url,
        title: r.title ?? null,
        content: r.content?.slice(0, 5000),
        author: r.author ?? null,
        published_date: r.published_date ?? null,
      })),
      failed: body.failed_results ?? [],
    };
  }
}
