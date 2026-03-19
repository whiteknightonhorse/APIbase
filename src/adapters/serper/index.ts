import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  SerperSearchResponse,
  SerperNewsResponse,
  SerperImagesResponse,
  SerperShoppingResponse,
} from './types';

/**
 * Serper.dev adapter (UC-067).
 *
 * Supported tools (read-only):
 *   serper.web_search      → POST /search
 *   serper.news_search     → POST /news
 *   serper.image_search    → POST /images
 *   serper.shopping_search → POST /shopping
 *
 * Auth: X-API-KEY header.
 * Free tier: 2,500 one-time queries. PAYG $0.001/call.
 */
export class SerperAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'serper',
      baseUrl: 'https://google.serper.dev',
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
      'X-API-KEY': this.apiKey,
      'Content-Type': 'application/json',
    };

    const bodyObj: Record<string, unknown> = {
      q: params.q,
    };
    if (params.gl) bodyObj.gl = params.gl;
    if (params.hl) bodyObj.hl = params.hl;
    if (params.num) bodyObj.num = params.num;
    if (params.page) bodyObj.page = params.page;
    if (params.tbs) bodyObj.tbs = params.tbs;

    let endpoint: string;
    switch (req.toolId) {
      case 'serper.web_search':
        endpoint = '/search';
        break;
      case 'serper.news_search':
        endpoint = '/news';
        break;
      case 'serper.image_search':
        endpoint = '/images';
        break;
      case 'serper.shopping_search':
        endpoint = '/shopping';
        break;
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

    return {
      url: `${this.baseUrl}${endpoint}`,
      method: 'POST',
      headers,
      body: JSON.stringify(bodyObj),
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'serper.web_search':
        return this.parseWebSearch(raw);
      case 'serper.news_search':
        return this.parseNewsSearch(raw);
      case 'serper.image_search':
        return this.parseImageSearch(raw);
      case 'serper.shopping_search':
        return this.parseShoppingSearch(raw);
      default:
        return raw.body;
    }
  }

  private parseWebSearch(raw: ProviderRawResponse): unknown {
    const body = raw.body as unknown as SerperSearchResponse;
    return {
      results: (body.organic ?? []).map((r) => ({
        title: r.title,
        link: r.link,
        snippet: r.snippet,
        position: r.position,
      })),
      knowledge_graph: body.knowledgeGraph
        ? {
            title: body.knowledgeGraph.title,
            type: body.knowledgeGraph.type,
            description: body.knowledgeGraph.description,
            website: body.knowledgeGraph.website,
            attributes: body.knowledgeGraph.attributes,
          }
        : null,
      answer_box: body.answerBox?.answer ?? body.answerBox?.snippet ?? null,
      people_also_ask: (body.peopleAlsoAsk ?? []).map((p) => ({
        question: p.question,
        snippet: p.snippet,
        link: p.link,
      })),
      related_searches: (body.relatedSearches ?? []).map((r) => r.query),
    };
  }

  private parseNewsSearch(raw: ProviderRawResponse): unknown {
    const body = raw.body as unknown as SerperNewsResponse;
    return {
      articles: (body.news ?? []).map((n) => ({
        title: n.title,
        link: n.link,
        snippet: n.snippet,
        source: n.source,
        date: n.date,
        image: n.imageUrl ?? null,
      })),
    };
  }

  private parseImageSearch(raw: ProviderRawResponse): unknown {
    const body = raw.body as unknown as SerperImagesResponse;
    return {
      images: (body.images ?? []).map((i) => ({
        title: i.title,
        image_url: i.imageUrl,
        thumbnail_url: i.thumbnailUrl,
        source: i.domain,
        link: i.link,
        width: i.imageWidth,
        height: i.imageHeight,
      })),
    };
  }

  private parseShoppingSearch(raw: ProviderRawResponse): unknown {
    const body = raw.body as unknown as SerperShoppingResponse;
    return {
      products: (body.shopping ?? []).map((s) => ({
        title: s.title,
        price: s.price,
        source: s.source,
        link: s.link,
        image: s.imageUrl ?? null,
        rating: s.rating ?? null,
        rating_count: s.ratingCount ?? null,
        delivery: s.delivery ?? null,
      })),
    };
  }
}
