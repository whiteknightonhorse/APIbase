import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  HyperliquidMetaResponse,
  HyperliquidAllMidsResponse,
  HyperliquidL2BookResponse,
  HyperliquidCandleResponse,
  HyperliquidClearinghouseState,
  HyperliquidVaultDetails,
} from './types';

const API_BASE = 'https://api.hyperliquid.xyz';

/**
 * Hyperliquid adapter (UC-021, §10.2 Level 1).
 *
 * All requests are POST to /info with JSON body { type: "..." }.
 *
 * Supported tools (Phase 1 — read-only, no wallet required):
 *   hyperliquid.market_data  → meta + allMids
 *   hyperliquid.order_book   → l2Book
 *   hyperliquid.klines       → candleSnapshot
 *   hyperliquid.positions    → clearinghouseState (requires user address)
 *   hyperliquid.account      → clearinghouseState (requires user address)
 *   hyperliquid.vault        → vaultDetails
 */
export class HyperliquidAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'hyperliquid',
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
      case 'hyperliquid.market_data':
        return this.buildMarketDataRequest(params);
      case 'hyperliquid.order_book':
        return this.buildOrderBookRequest(params);
      case 'hyperliquid.klines':
        return this.buildKlinesRequest(params);
      case 'hyperliquid.positions':
        return this.buildPositionsRequest(params);
      case 'hyperliquid.account':
        return this.buildAccountRequest(params);
      case 'hyperliquid.vault':
        return this.buildVaultRequest(params);
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
      case 'hyperliquid.market_data': {
        // Returns combined meta + allMids if called via the merged request,
        // or either meta or allMids individually
        if (typeof body !== 'object' || body === null) {
          throw new Error('Expected object from Hyperliquid market data');
        }
        return body;
      }
      case 'hyperliquid.order_book': {
        const data = body as HyperliquidL2BookResponse;
        if (!data.levels || !Array.isArray(data.levels)) {
          throw new Error('Missing levels in order book response');
        }
        return data;
      }
      case 'hyperliquid.klines': {
        const data = body as HyperliquidCandleResponse;
        if (!Array.isArray(data)) {
          throw new Error('Expected array from candle snapshot');
        }
        return data;
      }
      case 'hyperliquid.positions':
      case 'hyperliquid.account': {
        const data = body as HyperliquidClearinghouseState;
        if (!data.marginSummary) {
          throw new Error('Missing marginSummary in clearinghouse state');
        }
        return data;
      }
      case 'hyperliquid.vault': {
        const data = body as HyperliquidVaultDetails;
        if (!data.name && !data.vaultAddress) {
          throw new Error('Missing vault details');
        }
        return data;
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders — all POST to /info
  // ---------------------------------------------------------------------------

  private buildMarketDataRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
  } {
    // If coin specified, get allMids. Otherwise get meta (all markets).
    const coin = params.coin as string | undefined;
    const requestType = coin ? 'allMids' : 'meta';

    return {
      url: `${API_BASE}/info`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: requestType }),
    };
  }

  private buildOrderBookRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
  } {
    const coin = params.coin as string;
    const nSigFigs = params.n_sig_figs ?? 5;
    const mantissa = params.mantissa;

    const reqBody: Record<string, unknown> = {
      type: 'l2Book',
      coin,
      nSigFigs,
    };
    if (mantissa !== undefined) {
      reqBody.mantissa = mantissa;
    }

    return {
      url: `${API_BASE}/info`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    };
  }

  private buildKlinesRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
  } {
    const coin = params.coin as string;
    const interval = (params.interval as string) || '1h';
    const endTime = (params.end_time as number) || Date.now();
    const startTime = (params.start_time as number) || endTime - 24 * 60 * 60 * 1000;

    return {
      url: `${API_BASE}/info`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'candleSnapshot',
        req: { coin, interval, startTime, endTime },
      }),
    };
  }

  private buildPositionsRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
  } {
    const user = params.user as string;

    return {
      url: `${API_BASE}/info`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clearinghouseState', user }),
    };
  }

  private buildAccountRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
  } {
    const user = params.user as string;

    return {
      url: `${API_BASE}/info`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clearinghouseState', user }),
    };
  }

  private buildVaultRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
  } {
    const vaultAddress = params.vault_address as string;

    return {
      url: `${API_BASE}/info`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'vaultDetails', vaultAddress }),
    };
  }
}
