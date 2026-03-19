import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { NewsDataResponse, NewsDataSourcesResponse } from './types';

/**
 * NewsData.io adapter (UC-070).
 *
 * Supported tools (read-only):
 *   news.latest  → GET /latest
 *   news.crypto  → GET /crypto
 *   news.sources → GET /sources
 *
 * Auth: apikey query parameter.
 * Free tier: 200 credits/day (~6K/month), commercial OK.
 */
export class NewsDataAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'newsdata',
      baseUrl: 'https://newsdata.io/api/1',
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'news.latest':
        return this.buildLatestRequest(params, headers);
      case 'news.crypto':
        return this.buildCryptoRequest(params, headers);
      case 'news.sources':
        return this.buildSourcesRequest(params, headers);
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
      case 'news.latest':
      case 'news.crypto':
        return this.parseArticlesResponse(raw);
      case 'news.sources':
        return this.parseSourcesResponse(raw);
      default:
        return raw.body;
    }
  }

  private buildLatestRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('apikey', this.apiKey);
    if (params.q) qs.set('q', String(params.q));
    if (params.country) qs.set('country', String(params.country));
    if (params.category) qs.set('category', String(params.category));
    if (params.language) qs.set('language', String(params.language));
    if (params.domain) qs.set('domain', String(params.domain));
    if (params.timeframe) qs.set('timeframe', String(params.timeframe));
    qs.set('size', String(Math.min(Number(params.size ?? 10), 50)));

    return { url: `${this.baseUrl}/latest?${qs.toString()}`, method: 'GET', headers };
  }

  private buildCryptoRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('apikey', this.apiKey);
    if (params.q) qs.set('q', String(params.q));
    if (params.language) qs.set('language', String(params.language));
    if (params.coin) qs.set('coin', String(params.coin));
    qs.set('size', String(Math.min(Number(params.size ?? 10), 50)));

    return { url: `${this.baseUrl}/crypto?${qs.toString()}`, method: 'GET', headers };
  }

  private buildSourcesRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('apikey', this.apiKey);
    if (params.country) qs.set('country', String(params.country));
    if (params.language) qs.set('language', String(params.language));
    if (params.category) qs.set('category', String(params.category));

    return { url: `${this.baseUrl}/sources?${qs.toString()}`, method: 'GET', headers };
  }

  private parseArticlesResponse(raw: ProviderRawResponse): unknown {
    const body = raw.body as unknown as NewsDataResponse;
    return {
      total: body.totalResults,
      articles: (body.results ?? []).map((a) => ({
        title: a.title,
        link: a.link,
        description: a.description,
        source: a.source_name,
        source_url: a.source_url,
        published: a.pubDate,
        language: a.language,
        country: a.country,
        category: a.category,
        image: a.image_url,
        creator: a.creator,
        keywords: a.keywords,
        sentiment: a.sentiment,
      })),
      next_page: body.nextPage ?? null,
    };
  }

  private parseSourcesResponse(raw: ProviderRawResponse): unknown {
    const body = raw.body as unknown as NewsDataSourcesResponse;
    return {
      count: (body.results ?? []).length,
      sources: (body.results ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        url: s.url,
        category: s.category,
        language: s.language,
        country: s.country,
      })),
    };
  }
}
