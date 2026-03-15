import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  DiffbotProductResponse,
  DiffbotArticleResponse,
  DiffbotAnalyzeResponse,
  DiffbotSearchResponse,
} from './types';

/**
 * Diffbot AI Extraction adapter (UC-026).
 *
 * Supported tools (Phase 1, read-only):
 *   diffbot.product_extract → GET /v3/product?token=&url=
 *   diffbot.page_analyze    → GET /v3/analyze?token=&url=
 *   diffbot.article_extract → GET /v3/article?token=&url=
 *   diffbot.search          → GET /v3/search?token=&query=
 *
 * Auth: query param token=API_KEY.
 * Free tier: 10,000 credits/month.
 */
export class DiffbotAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'diffbot',
      baseUrl: 'https://api.diffbot.com',
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
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'diffbot.product_extract':
        return this.buildProductRequest(params, headers);
      case 'diffbot.page_analyze':
        return this.buildAnalyzeRequest(params, headers);
      case 'diffbot.article_extract':
        return this.buildArticleRequest(params, headers);
      case 'diffbot.search':
        return this.buildSearchRequest(params, headers);
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
    const body = raw.body;

    switch (req.toolId) {
      case 'diffbot.product_extract': {
        const data = body as DiffbotProductResponse;
        if (!data.objects) {
          return { ...data, objects: [] };
        }
        return data;
      }
      case 'diffbot.article_extract': {
        const data = body as DiffbotArticleResponse;
        if (!data.objects) {
          return { ...data, objects: [] };
        }
        return data;
      }
      case 'diffbot.page_analyze': {
        const data = body as DiffbotAnalyzeResponse;
        if (!data.objects) {
          return { ...data, objects: [] };
        }
        return data;
      }
      case 'diffbot.search': {
        const data = body as DiffbotSearchResponse;
        if (!data.data) {
          return { ...data, data: [] };
        }
        return data;
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildProductRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('token', this.apiKey);
    qs.set('url', String(params.url));
    if (params.discussion !== undefined) qs.set('discussion', String(params.discussion));
    if (params.timeout) qs.set('timeout', String(params.timeout));

    return {
      url: `${this.baseUrl}/v3/product?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildAnalyzeRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('token', this.apiKey);
    qs.set('url', String(params.url));
    if (params.mode) qs.set('mode', String(params.mode));
    if (params.fallback) qs.set('fallback', String(params.fallback));
    if (params.timeout) qs.set('timeout', String(params.timeout));

    return {
      url: `${this.baseUrl}/v3/analyze?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildArticleRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('token', this.apiKey);
    qs.set('url', String(params.url));
    if (params.paging !== undefined) qs.set('paging', String(params.paging));
    if (params.maxTags) qs.set('maxTags', String(params.maxTags));
    if (params.timeout) qs.set('timeout', String(params.timeout));

    return {
      url: `${this.baseUrl}/v3/article?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('token', this.apiKey);
    qs.set('query', String(params.query));
    if (params.type) qs.set('type', String(params.type));
    if (params.size) qs.set('size', String(params.size));
    if (params.from) qs.set('from', String(params.from));

    return {
      url: `${this.baseUrl}/v3/search?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }
}
