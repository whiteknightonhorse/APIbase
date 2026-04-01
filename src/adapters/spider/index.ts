import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  SpiderScrapeResult,
  SpiderSearchItem,
  SpiderScrapeOutput,
  SpiderSearchOutput,
} from './types';

/**
 * Spider.cloud adapter (UC-274).
 *
 * Supported tools:
 *   spider.scrape → POST /v1/scrape
 *   spider.search → POST /v1/search
 *
 * Auth: Bearer token (sk-...). PAYG credits, no subscription.
 * Cheapest web scraper with markdown output.
 */
export class SpiderAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'spider',
      baseUrl: 'https://api.spider.cloud/v1',
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
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'spider.scrape': {
        const body: Record<string, unknown> = {
          url: String(params.url),
          return_format: String(params.format || 'markdown'),
        };
        if (params.readability !== undefined) body.readability = Boolean(params.readability);
        if (params.wait_for) body.wait_for = Number(params.wait_for);
        return {
          url: `${this.baseUrl}/scrape`,
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        };
      }

      case 'spider.search': {
        const body: Record<string, unknown> = {
          search: String(params.query),
          limit: Math.min(Number(params.limit) || 5, 20),
          return_format: 'markdown',
        };
        return {
          url: `${this.baseUrl}/search`,
          method: 'POST',
          headers,
          body: JSON.stringify(body),
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
    const body = raw.body as unknown;

    switch (req.toolId) {
      case 'spider.scrape':
        return this.parseScrape(body);
      case 'spider.search':
        return this.parseSearch(body);
      default:
        return body;
    }
  }

  private parseScrape(body: unknown): SpiderScrapeOutput {
    // Response is array of results for single URL
    const results = Array.isArray(body) ? body : [body];
    const r = (results[0] ?? {}) as SpiderScrapeResult;
    return {
      url: r.url ?? '',
      content: (r.content ?? '').slice(0, 50_000), // Cap at 50KB
      status: r.status ?? 0,
      duration_ms: r.duration_elasped_ms ?? 0,
    };
  }

  private parseSearch(body: unknown): SpiderSearchOutput {
    const data = (body as Record<string, unknown>) ?? {};
    const items = (data.content ?? []) as SpiderSearchItem[];
    return {
      results: items.map((item) => ({
        title: item.title ?? '',
        description: item.description ?? '',
        url: item.url ?? '',
      })),
      count: items.length,
    };
  }
}
