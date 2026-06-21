import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { EonetEventsResponse, EonetCategoriesResponse, EonetLayersResponse } from './types';

/**
 * NASA EONET v3 adapter (UC-477).
 *
 * Supported tools (read-only):
 *   eonet.events         → GET /api/v3/events
 *   eonet.event_detail   → GET /api/v3/events/{id}
 *   eonet.categories     → GET /api/v3/categories
 *   eonet.layers         → GET /api/v3/layers/{categoryId}
 *
 * Auth: None (US Government open data, public domain)
 * Rate limits: No documented limits
 */
export class EonetAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'eonet',
      baseUrl: 'https://eonet.gsfc.nasa.gov/api/v3',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase.pro/1.0 (apibase.pro; contact@apibase.pro)',
    };

    switch (req.toolId) {
      case 'eonet.events':
        return this.buildEventsRequest(params, headers);
      case 'eonet.event_detail':
        return this.buildEventDetailRequest(params, headers);
      case 'eonet.categories':
        return this.buildCategoriesRequest(headers);
      case 'eonet.layers':
        return this.buildLayersRequest(params, headers);
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
      case 'eonet.events': {
        const data = body as EonetEventsResponse;
        if (!Array.isArray(data.events)) {
          throw new Error('Missing events array in EONET events response');
        }
        return {
          title: data.title,
          description: data.description,
          events: data.events,
          count: data.events.length,
        };
      }
      case 'eonet.event_detail': {
        const data = body as EonetEventsResponse['events'][0];
        if (!data.id) {
          throw new Error('Missing id in EONET event detail response');
        }
        return data;
      }
      case 'eonet.categories': {
        const data = body as EonetCategoriesResponse;
        if (!Array.isArray(data.categories)) {
          throw new Error('Missing categories array in EONET categories response');
        }
        return {
          title: data.title,
          categories: data.categories,
          count: data.categories.length,
        };
      }
      case 'eonet.layers': {
        const data = body as EonetLayersResponse;
        if (!Array.isArray(data.categories)) {
          throw new Error('Missing categories array in EONET layers response');
        }
        return {
          title: data.title,
          categories: data.categories,
        };
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildEventsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.source) qs.set('source', String(params.source));
    if (params.status) qs.set('status', String(params.status));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.days) qs.set('days', String(params.days));
    if (params.start) qs.set('start', String(params.start));
    if (params.end) qs.set('end', String(params.end));
    if (params.category) qs.set('category', String(params.category));
    if (params.bbox) qs.set('bbox', String(params.bbox));

    const query = qs.toString();
    return {
      url: `${this.baseUrl}/events${query ? `?${query}` : ''}`,
      method: 'GET',
      headers,
    };
  }

  private buildEventDetailRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const id = encodeURIComponent(String(params.id));
    return {
      url: `${this.baseUrl}/events/${id}`,
      method: 'GET',
      headers,
    };
  }

  private buildCategoriesRequest(headers: Record<string, string>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    return {
      url: `${this.baseUrl}/categories`,
      method: 'GET',
      headers,
    };
  }

  private buildLayersRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const categoryId = encodeURIComponent(String(params.category_id));
    return {
      url: `${this.baseUrl}/layers/${categoryId}`,
      method: 'GET',
      headers,
    };
  }
}
