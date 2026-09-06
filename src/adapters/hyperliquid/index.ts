import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
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
          this.invalidResponse(req, 'Expected object from Hyperliquid market data');
        }
        return body;
      }
      case 'hyperliquid.order_book': {
        // T-09b: `body` can itself be `null` (Hyperliquid returning a bare
        // JSON `null`) — `data.levels` on a null `data` throws a raw,
        // unclassified TypeError ("Cannot read properties of null (reading
        // 'levels')") BEFORE the `!data.levels` guard even runs, since the
        // guard reads `data.levels` too. Checking `!data` first, and raising
        // through invalidResponse() rather than a plain `throw new Error`,
        // keeps this in the same classified ProviderError shape every other
        // adapter's "malformed response" branch uses (provider/code/
        // httpStatus set) instead of an unclassified Error the pipeline can
        // only default-guess a message for.
        const data = body as HyperliquidL2BookResponse | null;
        if (!data || !Array.isArray(data.levels)) {
          this.invalidResponse(req, 'Missing levels in order book response');
        }
        return data;
      }
      case 'hyperliquid.klines': {
        const data = body as HyperliquidCandleResponse | null;
        if (!Array.isArray(data)) {
          this.invalidResponse(req, 'Expected array from candle snapshot');
        }
        return data;
      }
      case 'hyperliquid.positions':
      case 'hyperliquid.account': {
        const data = body as HyperliquidClearinghouseState | null;
        if (!data || !data.marginSummary) {
          this.invalidResponse(req, 'Missing marginSummary in clearinghouse state');
        }
        return data;
      }
      case 'hyperliquid.vault': {
        const data = body as HyperliquidVaultDetails | null;
        if (!data || (!data.name && !data.vaultAddress)) {
          this.invalidResponse(req, 'Missing vault details');
        }
        return data;
      }
      default:
        return body;
    }
  }

  /**
   * T-09b: every "upstream returned a 2xx but the body doesn't have the
   * shape we expect" case funnels through here instead of a bare
   * `throw new Error(...)` — the latter has no `.provider`/`.code`/
   * `.httpStatus`, so provider-call.stage.ts can only default-guess a 502
   * with a generic message, and the passive health signal (recordProbeResult
   * in provider-call.stage.ts) can't classify it at all. Marked `never` so
   * TypeScript still narrows `data` as non-null after a guard clause calls
   * this instead of `return`/`throw` directly.
   */
  private invalidResponse(req: ProviderRequest, message: string): never {
    throw {
      code: ProviderErrorCode.INVALID_RESPONSE,
      httpStatus: 502,
      message,
      provider: this.provider,
      toolId: req.toolId,
      durationMs: 0,
    };
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
