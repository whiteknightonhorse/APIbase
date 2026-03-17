import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { UpcLookupResponse, UpcSearchResponse } from './types';

/**
 * UPCitemdb adapter (UC-041).
 *
 * Supported tools (Phase 1, read-only):
 *   upc.lookup → GET /prod/trial/lookup
 *   upc.search → GET /prod/trial/search
 *
 * Auth: None (free trial tier, 100 req/day, 6 req/min).
 */
export class UpcItemDbAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'upcitemdb',
      baseUrl: 'https://api.upcitemdb.com',
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
    };

    switch (req.toolId) {
      case 'upc.lookup':
        return this.buildLookupRequest(params, headers);
      case 'upc.search':
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
    const body = raw.body as Record<string, unknown>;

    if (body.code !== 'OK') {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `UPCitemdb returned code: ${body.code}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    switch (req.toolId) {
      case 'upc.lookup': {
        const data = body as unknown as UpcLookupResponse;
        return {
          total: data.total,
          items: (data.items ?? []).map(item => ({
            upc: item.upc,
            ean: item.ean,
            title: item.title,
            description: item.description ? item.description.slice(0, 500) : '',
            brand: item.brand,
            model: item.model,
            color: item.color,
            size: item.size,
            dimension: item.dimension,
            weight: item.weight,
            category: item.category,
            lowest_recorded_price: item.lowest_recorded_price,
            highest_recorded_price: item.highest_recorded_price,
            images: (item.images ?? []).slice(0, 5),
            offers: (item.offers ?? []).slice(0, 10).map(o => ({
              merchant: o.merchant,
              title: o.title,
              price: o.price,
              currency: o.currency,
              condition: o.condition,
              availability: o.availability,
            })),
            asin: item.asin,
          })),
        };
      }
      case 'upc.search': {
        const data = body as unknown as UpcSearchResponse;
        return {
          total: data.total,
          offset: data.offset,
          items: (data.items ?? []).map(item => ({
            upc: item.upc,
            ean: item.ean,
            title: item.title,
            brand: item.brand,
            model: item.model,
            category: item.category,
            lowest_recorded_price: item.lowest_recorded_price,
            highest_recorded_price: item.highest_recorded_price,
            images: (item.images ?? []).slice(0, 3),
            asin: item.asin,
          })),
        };
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildLookupRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('upc', String(params.upc));

    return {
      url: `${this.baseUrl}/prod/trial/lookup?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    qs.set('s', String(params.query));
    qs.set('match_mode', String(params.match_mode ?? 0));
    qs.set('type', String(params.type ?? 'product'));
    if (params.offset) qs.set('offset', String(params.offset));

    return {
      url: `${this.baseUrl}/prod/trial/search?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }
}
