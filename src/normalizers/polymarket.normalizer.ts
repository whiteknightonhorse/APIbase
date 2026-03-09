import { BaseNormalizer } from './base.normalizer';
import type { ProviderRawResponse, ProviderNormalizedResponse } from '../types/provider';
import type {
  GammaMarket,
  GammaSearchResponse,
  GammaMarketsResponse,
  ClobOrderbookResponse,
  ClobPriceHistoryResponse,
  DataLeaderboardResponse,
} from '../adapters/polymarket/types';

/**
 * Polymarket normalizer (UC-001, §10.2 Level 2, §12.147).
 *
 * Maps Gamma/CLOB/Data API responses → canonical prediction market model.
 */
export class PolymarketNormalizer extends BaseNormalizer {
  constructor() {
    super('polymarket');
  }

  protected normalize(raw: ProviderRawResponse, toolId: string): ProviderNormalizedResponse {
    switch (toolId) {
      case 'polymarket.search':
        return this.normalizeSearch(raw.body as GammaSearchResponse);
      case 'polymarket.market_detail':
        return this.normalizeMarketDetail(raw.body as GammaMarket);
      case 'polymarket.prices':
        return this.normalizePrices(raw.body as Record<string, string>);
      case 'polymarket.get_orderbook':
        return this.normalizeOrderbook(raw.body as ClobOrderbookResponse);
      case 'polymarket.price_history':
        return this.normalizePriceHistory(raw.body as ClobPriceHistoryResponse);
      case 'polymarket.trending':
        return this.normalizeTrending(raw.body as GammaMarketsResponse);
      case 'polymarket.leaderboard':
        return this.normalizeLeaderboard(raw.body as DataLeaderboardResponse);
      default:
        throw new Error(`Unsupported tool: ${toolId}`);
    }
  }

  // ---------------------------------------------------------------------------
  // polymarket.search / polymarket.trending
  // ---------------------------------------------------------------------------

  private normalizeSearch(markets: GammaSearchResponse): ProviderNormalizedResponse {
    return {
      data: markets.map((m) => normalizeMarket(m)),
      metadata: { provider: 'polymarket', count: markets.length },
    };
  }

  private normalizeTrending(markets: GammaMarketsResponse): ProviderNormalizedResponse {
    return {
      data: markets.map((m) => normalizeMarket(m)),
      metadata: { provider: 'polymarket', count: markets.length },
    };
  }

  // ---------------------------------------------------------------------------
  // polymarket.market_detail
  // ---------------------------------------------------------------------------

  private normalizeMarketDetail(market: GammaMarket): ProviderNormalizedResponse {
    return {
      data: normalizeMarket(market),
      metadata: { provider: 'polymarket' },
    };
  }

  // ---------------------------------------------------------------------------
  // polymarket.prices
  // ---------------------------------------------------------------------------

  private normalizePrices(prices: Record<string, string>): ProviderNormalizedResponse {
    const entries = Object.entries(prices).map(([tokenId, price]) => ({
      market_id: tokenId,
      price: parseFloat(price),
      probability: parseFloat(price),
    }));

    return {
      data: entries,
      metadata: { provider: 'polymarket', count: entries.length },
    };
  }

  // ---------------------------------------------------------------------------
  // polymarket.get_orderbook
  // ---------------------------------------------------------------------------

  private normalizeOrderbook(book: ClobOrderbookResponse): ProviderNormalizedResponse {
    const bids = book.bids.map((level) => ({
      price: parseFloat(level.price),
      size: parseFloat(level.size),
    }));
    const asks = book.asks.map((level) => ({
      price: parseFloat(level.price),
      size: parseFloat(level.size),
    }));

    const bestBid = bids.length > 0 ? bids[0].price : 0;
    const bestAsk = asks.length > 0 ? asks[0].price : 0;

    return {
      data: {
        market_id: book.asset_id,
        bids,
        asks,
        spread: bestAsk > 0 && bestBid > 0 ? round4(bestAsk - bestBid) : null,
        mid: bestAsk > 0 && bestBid > 0 ? round4((bestAsk + bestBid) / 2) : null,
      },
      metadata: { provider: 'polymarket' },
    };
  }

  // ---------------------------------------------------------------------------
  // polymarket.price_history
  // ---------------------------------------------------------------------------

  private normalizePriceHistory(history: ClobPriceHistoryResponse): ProviderNormalizedResponse {
    const candles = history.history.map((point) => ({
      timestamp: new Date(point.t * 1000).toISOString(),
      price: parseFloat(point.p),
    }));

    return {
      data: { candles },
      metadata: { provider: 'polymarket', points: candles.length },
    };
  }

  // ---------------------------------------------------------------------------
  // polymarket.leaderboard
  // ---------------------------------------------------------------------------

  private normalizeLeaderboard(entries: DataLeaderboardResponse): ProviderNormalizedResponse {
    const normalized = entries.map((entry) => ({
      rank: entry.rank,
      address: entry.address,
      profit_usd: entry.profit,
      volume_usd: entry.volume,
      markets_traded: entry.marketsTraded,
    }));

    return {
      data: { entries: normalized },
      metadata: { provider: 'polymarket', count: normalized.length },
    };
  }
}

// ---------------------------------------------------------------------------
// Market normalization (shared between search, trending, market_detail)
// ---------------------------------------------------------------------------

function normalizeMarket(m: GammaMarket): Record<string, unknown> {
  const outcomeLabels = parseJsonArray(m.outcomes);
  const outcomePrices = parseJsonArray(m.outcomePrices);

  const outcomes = outcomeLabels.map((label, i) => {
    const price = i < outcomePrices.length ? parseFloat(outcomePrices[i]) : 0;
    return {
      label,
      probability: price,
      price,
      best_bid: i === 0 && m.bestBid != null ? m.bestBid : null,
      best_ask: i === 0 && m.bestAsk != null ? m.bestAsk : null,
    };
  });

  const status = m.closed ? 'resolved' : m.active ? 'active' : 'inactive';

  return {
    provider: 'polymarket',
    provider_id: m.id,
    market_id: `apibase_pm_${m.id}`,
    question: m.question,
    type: m.marketType || 'binary',
    status,
    outcomes,
    volume_usd: parseFloat(m.volume) || 0,
    volume_24h_usd: parseFloat(m.volume24hr) || 0,
    open_interest_usd: m.openInterest ? parseFloat(m.openInterest) : null,
    end_date: m.endDate || null,
    source_url: m.slug ? `https://polymarket.com/event/${m.slug}` : null,
    tick_size: m.tickSize ? parseFloat(m.tickSize) : 0.01,
    last_updated: new Date().toISOString(),
  };
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
