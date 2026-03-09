import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  AsterExchangeInfoResponse,
  AsterTicker24hrResponse,
  AsterDepthResponse,
  AsterKlinesResponse,
} from './types';

const API_BASE = 'https://fapi.asterdex.com';

/**
 * AsterDEX adapter (UC-020, §10.2 Level 1).
 *
 * Binance-compatible REST API. Public endpoints only (Phase 1).
 *
 * Supported tools (Phase 1 — read-only, no API key):
 *   aster.exchange_info  → GET /fapi/v1/exchangeInfo
 *   aster.market_data    → GET /fapi/v1/ticker/24hr
 *   aster.order_book     → GET /fapi/v1/depth
 *   aster.klines         → GET /fapi/v1/klines
 *
 * Phase 2 (requires HMAC auth):
 *   aster.place_order, aster.positions, aster.account
 */
export class AsterDexAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'asterdex',
      baseUrl: API_BASE,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'aster.exchange_info':
        return this.buildExchangeInfoRequest(params);
      case 'aster.market_data':
        return this.buildMarketDataRequest(params);
      case 'aster.order_book':
        return this.buildOrderBookRequest(params);
      case 'aster.klines':
        return this.buildKlinesRequest(params);
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
      case 'aster.exchange_info': {
        const data = body as AsterExchangeInfoResponse;
        if (!data.symbols || !Array.isArray(data.symbols)) {
          throw new Error('Missing symbols in exchange info');
        }
        return data;
      }
      case 'aster.market_data': {
        const data = body as AsterTicker24hrResponse;
        if (typeof data !== 'object' || data === null) {
          throw new Error('Expected object/array from ticker');
        }
        return data;
      }
      case 'aster.order_book': {
        const data = body as AsterDepthResponse;
        if (!data.bids || !data.asks) {
          throw new Error('Missing bids/asks in depth response');
        }
        return data;
      }
      case 'aster.klines': {
        const data = body as AsterKlinesResponse;
        if (!Array.isArray(data)) {
          throw new Error('Expected array from klines');
        }
        return data;
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders — all GET with query params
  // ---------------------------------------------------------------------------

  private buildExchangeInfoRequest(_params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    return {
      url: `${API_BASE}/fapi/v1/exchangeInfo`,
      method: 'GET',
      headers: {},
    };
  }

  private buildMarketDataRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const qs = new URLSearchParams();
    if (params.symbol) qs.set('symbol', params.symbol as string);

    const query = qs.toString();
    return {
      url: `${API_BASE}/fapi/v1/ticker/24hr${query ? `?${query}` : ''}`,
      method: 'GET',
      headers: {},
    };
  }

  private buildOrderBookRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const symbol = params.symbol as string;
    const limit = params.limit ?? 20;

    const qs = new URLSearchParams({
      symbol,
      limit: String(limit),
    });

    return {
      url: `${API_BASE}/fapi/v1/depth?${qs.toString()}`,
      method: 'GET',
      headers: {},
    };
  }

  private buildKlinesRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const symbol = params.symbol as string;
    const interval = (params.interval as string) || '1h';
    const limit = params.limit ?? 100;

    const qs = new URLSearchParams({
      symbol,
      interval,
      limit: String(limit),
    });
    if (params.start_time) qs.set('startTime', String(params.start_time));
    if (params.end_time) qs.set('endTime', String(params.end_time));

    return {
      url: `${API_BASE}/fapi/v1/klines?${qs.toString()}`,
      method: 'GET',
      headers: {},
    };
  }
}
