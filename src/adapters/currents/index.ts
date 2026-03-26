import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * Currents API adapter (UC-210).
 *
 * Supported tools:
 *   currents.latest     → GET /v1/latest-news
 *   currents.search     → GET /v1/search
 *   currents.categories → GET /v1/available/categories
 *
 * Auth: query param apiKey. 20 req/day free.
 */
export class CurrentsAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'currents',
      baseUrl: 'https://api.currentsapi.services/v1',
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
      case 'currents.latest': {
        const qs = new URLSearchParams();
        qs.set('apiKey', this.apiKey);
        if (params.language) qs.set('language', String(params.language));
        if (params.country) qs.set('country', String(params.country));
        if (params.category) qs.set('category', String(params.category));
        qs.set('page_size', String(params.page_size ?? 10));
        return { url: `${this.baseUrl}/latest-news?${qs.toString()}`, method: 'GET', headers };
      }

      case 'currents.search': {
        const qs = new URLSearchParams();
        qs.set('apiKey', this.apiKey);
        qs.set('keywords', String(params.keywords || ''));
        if (params.language) qs.set('language', String(params.language));
        if (params.country) qs.set('country', String(params.country));
        if (params.start_date) qs.set('start_date', String(params.start_date));
        if (params.end_date) qs.set('end_date', String(params.end_date));
        qs.set('page_size', String(params.page_size ?? 10));
        return { url: `${this.baseUrl}/search?${qs.toString()}`, method: 'GET', headers };
      }

      case 'currents.categories': {
        return { url: `${this.baseUrl}/available/categories?apiKey=${this.apiKey}`, method: 'GET', headers };
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
    const body = raw.body as Record<string, unknown>;

    switch (req.toolId) {
      case 'currents.latest':
      case 'currents.search': {
        const news = (body.news as Array<Record<string, unknown>>) ?? [];
        return {
          status: body.status,
          total: news.length,
          articles: news.map((a) => ({
            id: a.id,
            title: a.title,
            description: a.description,
            url: a.url,
            author: a.author,
            image: a.image,
            language: a.language,
            categories: a.category,
            published: a.published,
          })),
        };
      }

      case 'currents.categories':
        return { categories: body.categories };

      default:
        return body;
    }
  }
}
