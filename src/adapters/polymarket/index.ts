import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  GammaSearchResponse,
  GammaMarket,
  GammaMarketsResponse,
  ClobOrderbookResponse,
  ClobPriceHistoryResponse,
  DataLeaderboardResponse,
} from './types';

// ---------------------------------------------------------------------------
// Base URLs for Polymarket services
// ---------------------------------------------------------------------------

const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const CLOB_BASE = 'https://clob.polymarket.com';
const DATA_BASE = 'https://data-api.polymarket.com';

/**
 * Polymarket adapter (UC-001, §10.2 Level 1).
 *
 * Supported tools (Phase 1 — read-only):
 *   polymarket.search         → Gamma API /public-search
 *   polymarket.market_detail  → Gamma API /markets/{id}
 *   polymarket.prices         → CLOB API  /prices
 *   polymarket.get_orderbook  → CLOB API  /book
 *   polymarket.price_history  → CLOB API  /prices-history
 *   polymarket.trending       → Gamma API /markets (sorted)
 *   polymarket.leaderboard    → Data API  /leaderboard
 *
 * Auth: no auth required for read-only endpoints.
 */
export class PolymarketAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'polymarket',
      baseUrl: GAMMA_BASE,
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
      case 'polymarket.search':
        return this.buildSearchRequest(params);
      case 'polymarket.market_detail':
        return this.buildMarketDetailRequest(params);
      case 'polymarket.prices':
        return this.buildPricesRequest(params);
      case 'polymarket.get_orderbook':
        return this.buildOrderbookRequest(params);
      case 'polymarket.price_history':
        return this.buildPriceHistoryRequest(params);
      case 'polymarket.trending':
        return this.buildTrendingRequest(params);
      case 'polymarket.leaderboard':
        return this.buildLeaderboardRequest(params);
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
      case 'polymarket.search': {
        const data = body as GammaSearchResponse;
        if (!Array.isArray(data)) {
          throw new Error('Expected array from Gamma search');
        }
        return data;
      }
      case 'polymarket.market_detail': {
        const data = body as GammaMarket;
        if (!data.id || !data.question) {
          throw new Error('Missing required fields in market detail');
        }
        return data;
      }
      case 'polymarket.prices': {
        if (typeof body !== 'object' || body === null) {
          throw new Error('Expected object from CLOB prices');
        }
        return body;
      }
      case 'polymarket.get_orderbook': {
        const data = body as ClobOrderbookResponse;
        if (!data.bids || !data.asks) {
          throw new Error('Missing bids/asks in orderbook');
        }
        return data;
      }
      case 'polymarket.price_history': {
        const data = body as ClobPriceHistoryResponse;
        if (!data.history) {
          throw new Error('Missing history in price history');
        }
        return data;
      }
      case 'polymarket.trending': {
        const data = body as GammaMarketsResponse;
        if (!Array.isArray(data)) {
          throw new Error('Expected array from Gamma markets');
        }
        return data;
      }
      case 'polymarket.leaderboard': {
        const data = body as DataLeaderboardResponse;
        if (!Array.isArray(data)) {
          throw new Error('Expected array from leaderboard');
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

  private buildSearchRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const qs = new URLSearchParams();
    qs.set('query', params.query as string);
    if (params.category) qs.set('category', params.category as string);
    if (params.status && params.status !== 'all')
      qs.set('active', params.status === 'active' ? 'true' : 'false');
    if (params.sort_by) qs.set('sort_by', mapSortParam(params.sort_by as string));
    qs.set('limit', String(params.limit ?? 10));

    return {
      url: `${GAMMA_BASE}/public-search?${qs.toString()}`,
      method: 'GET',
      headers: {},
    };
  }

  private buildMarketDetailRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const marketId = encodeURIComponent(params.market_id as string);

    return {
      url: `${GAMMA_BASE}/markets/${marketId}`,
      method: 'GET',
      headers: {},
    };
  }

  private buildPricesRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const marketIds = params.market_ids as string[];
    const qs = new URLSearchParams();
    for (const id of marketIds) {
      qs.append('token_id', id);
    }

    return {
      url: `${CLOB_BASE}/prices?${qs.toString()}`,
      method: 'GET',
      headers: {},
    };
  }

  private buildOrderbookRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const marketId = params.market_id as string;
    const qs = new URLSearchParams({ token_id: marketId });

    return {
      url: `${CLOB_BASE}/book?${qs.toString()}`,
      method: 'GET',
      headers: {},
    };
  }

  private buildPriceHistoryRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const marketId = params.market_id as string;
    const interval = (params.interval as string) || '1d';
    const days = (params.days as number) || 30;
    const startTs = Math.floor(Date.now() / 1000) - days * 86400;

    const qs = new URLSearchParams({
      market: marketId,
      interval,
      startTs: startTs.toString(),
    });

    return {
      url: `${CLOB_BASE}/prices-history?${qs.toString()}`,
      method: 'GET',
      headers: {},
    };
  }

  private buildTrendingRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const qs = new URLSearchParams();
    const sortBy = (params.sort_by as string) || 'volume_24h';
    qs.set('order', mapTrendingSort(sortBy));
    qs.set('ascending', 'false');
    qs.set('active', 'true');
    if (params.category) qs.set('tag', params.category as string);
    qs.set('limit', String(params.limit ?? 10));

    return {
      url: `${GAMMA_BASE}/markets?${qs.toString()}`,
      method: 'GET',
      headers: {},
    };
  }

  private buildLeaderboardRequest(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const sortBy = (params.sort_by as string) || 'profit';
    const period = (params.period as string) || '7d';
    const limit = params.limit ?? 20;

    const qs = new URLSearchParams({
      sort_by: sortBy,
      period,
      limit: String(limit),
    });

    return {
      url: `${DATA_BASE}/leaderboard?${qs.toString()}`,
      method: 'GET',
      headers: {},
    };
  }
}

// ---------------------------------------------------------------------------
// Sort parameter mapping (agent terms → Gamma API terms)
// ---------------------------------------------------------------------------

function mapSortParam(sortBy: string): string {
  switch (sortBy) {
    case 'volume':
      return 'volume';
    case 'newest':
      return 'createdAt';
    case 'ending_soon':
      return 'endDate';
    case 'probability_high':
      return 'outcomePrices';
    case 'probability_low':
      return 'outcomePrices';
    default:
      return 'volume';
  }
}

function mapTrendingSort(sortBy: string): string {
  switch (sortBy) {
    case 'volume_24h':
      return 'volume24hr';
    case 'newest':
      return 'createdAt';
    case 'biggest_move':
      return 'volume24hr';
    case 'ending_soon':
      return 'endDate';
    default:
      return 'volume24hr';
  }
}
