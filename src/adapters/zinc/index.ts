import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  ZincSearchResponse,
  ZincProductDetailsResponse,
  ZincOffersResponse,
  ZincReviewsResponse,
} from './types';

/**
 * Zinc E-commerce API adapter (UC-025).
 *
 * Supported tools (Phase 1, read-only):
 *   zinc.product_search  → GET /v1/search
 *   zinc.product_details → GET /v1/products/{product_id}
 *   zinc.product_offers  → GET /v1/products/{product_id}/offers
 *   zinc.product_reviews → GET /v1/products/{product_id}/reviews
 *
 * Auth: Basic Auth (API key as username, empty password).
 * Upstream cost: $0.01/call.
 */
export class ZincAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'zinc',
      baseUrl: 'https://api.zinc.io/v1',
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
      Authorization: `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'zinc.product_search':
        return this.buildSearchRequest(params, headers);
      case 'zinc.product_details':
        return this.buildDetailsRequest(params, headers);
      case 'zinc.product_offers':
        return this.buildOffersRequest(params, headers);
      case 'zinc.product_reviews':
        return this.buildReviewsRequest(params, headers);
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
      case 'zinc.product_search': {
        const data = body as ZincSearchResponse;
        if (!data.results) {
          return { status: 'completed', results: [] };
        }
        return data;
      }
      case 'zinc.product_details': {
        const data = body as ZincProductDetailsResponse;
        if (!data.product_id && !data.title) {
          throw new Error('Missing required fields in product details response');
        }
        return data;
      }
      case 'zinc.product_offers': {
        const data = body as ZincOffersResponse;
        if (!data.offers) {
          return { ...data, offers: [] };
        }
        return data;
      }
      case 'zinc.product_reviews': {
        const data = body as ZincReviewsResponse;
        if (!data.reviews) {
          return { ...data, reviews: [] };
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

  private buildSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();

    qs.set('search', String(params.query));
    if (params.retailer) qs.set('retailer', String(params.retailer));
    if (params.page) qs.set('page', String(params.page));

    return {
      url: `${this.baseUrl}/search?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildDetailsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const productId = String(params.product_id);
    const qs = new URLSearchParams();

    if (params.retailer) qs.set('retailer', String(params.retailer));

    const query = qs.toString();
    const suffix = query ? `?${query}` : '';

    return {
      url: `${this.baseUrl}/products/${encodeURIComponent(productId)}${suffix}`,
      method: 'GET',
      headers,
    };
  }

  private buildOffersRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const productId = String(params.product_id);
    const qs = new URLSearchParams();

    if (params.retailer) qs.set('retailer', String(params.retailer));

    const query = qs.toString();
    const suffix = query ? `?${query}` : '';

    return {
      url: `${this.baseUrl}/products/${encodeURIComponent(productId)}/offers${suffix}`,
      method: 'GET',
      headers,
    };
  }

  private buildReviewsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const productId = String(params.product_id);
    const qs = new URLSearchParams();

    if (params.retailer) qs.set('retailer', String(params.retailer));
    if (params.page) qs.set('page', String(params.page));

    const query = qs.toString();
    const suffix = query ? `?${query}` : '';

    return {
      url: `${this.baseUrl}/products/${encodeURIComponent(productId)}/reviews${suffix}`,
      method: 'GET',
      headers,
    };
  }
}
