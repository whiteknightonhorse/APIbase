import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  SimplePriceResponse,
  MarketCoin,
  CoinDetail,
  MarketChartResponse,
  TrendingResponse,
  GlobalResponse,
  SearchResponse,
  GtPoolsResponse,
  GtTokenResponse,
} from './types';

/**
 * CoinGecko + GeckoTerminal adapter (UC-004).
 *
 * Supported tools (Phase 1):
 *   crypto.get_price       → GET /simple/price
 *   coingecko.get_market   → GET /coins/markets
 *   crypto.coin_detail     → GET /coins/{id}
 *   crypto.price_history   → GET /coins/{id}/market_chart
 *   crypto.trending        → GET /search/trending
 *   crypto.global          → GET /global
 *   crypto.search          → GET /search
 *   crypto.dex_pools       → GET /search/pools (GeckoTerminal)
 *   crypto.token_by_address→ GET /networks/{network}/tokens/{address} (GeckoTerminal)
 *
 * Auth: x-cg-demo-api-key header (CoinGecko Demo plan).
 * GeckoTerminal endpoints are free and require no auth.
 */
export class CoinGeckoAdapter extends BaseAdapter {
  private readonly apiKey: string;
  private static readonly COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
  private static readonly GECKOTERMINAL_BASE = 'https://api.geckoterminal.com/api/v2';

  constructor(apiKey: string) {
    super({
      provider: 'coingecko',
      baseUrl: CoinGeckoAdapter.COINGECKO_BASE,
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

    switch (req.toolId) {
      case 'crypto.get_price':
        return this.buildGetPrice(params);
      case 'coingecko.get_market':
        return this.buildGetMarket(params);
      case 'crypto.coin_detail':
        return this.buildCoinDetail(params);
      case 'crypto.price_history':
        return this.buildPriceHistory(params);
      case 'crypto.trending':
        return this.buildTrending();
      case 'crypto.global':
        return this.buildGlobal(params);
      case 'crypto.search':
        return this.buildSearch(params);
      case 'crypto.dex_pools':
        return this.buildDexPools(params);
      case 'crypto.token_by_address':
        return this.buildTokenByAddress(params);
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
      case 'crypto.get_price': {
        const data = body as SimplePriceResponse;
        if (typeof data !== 'object' || data === null) {
          throw new Error('Invalid price response');
        }
        return data;
      }
      case 'coingecko.get_market': {
        const data = body as MarketCoin[];
        if (!Array.isArray(data)) {
          throw new Error('Expected array in market response');
        }
        return data;
      }
      case 'crypto.coin_detail': {
        const data = body as CoinDetail;
        if (!data.id || !data.symbol) {
          throw new Error('Missing required fields in coin detail response');
        }
        return data;
      }
      case 'crypto.price_history': {
        const data = body as MarketChartResponse;
        if (!data.prices || !Array.isArray(data.prices)) {
          throw new Error('Missing prices in market chart response');
        }
        return data;
      }
      case 'crypto.trending': {
        const data = body as TrendingResponse;
        if (!data.coins || !Array.isArray(data.coins)) {
          throw new Error('Missing coins in trending response');
        }
        return data;
      }
      case 'crypto.global': {
        const data = body as GlobalResponse;
        if (!data.data) {
          throw new Error('Missing data in global response');
        }
        return data;
      }
      case 'crypto.search': {
        const data = body as SearchResponse;
        if (!data.coins) {
          throw new Error('Missing coins in search response');
        }
        return data;
      }
      case 'crypto.dex_pools': {
        const data = body as GtPoolsResponse;
        if (!data.data || !Array.isArray(data.data)) {
          throw new Error('Missing data in DEX pools response');
        }
        return data;
      }
      case 'crypto.token_by_address': {
        const data = body as GtTokenResponse;
        if (!data.data) {
          throw new Error('Missing data in token response');
        }
        return data;
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // CoinGecko request helpers (common headers)
  // ---------------------------------------------------------------------------

  private cgHeaders(): Record<string, string> {
    return {
      'x-cg-demo-api-key': this.apiKey,
      Accept: 'application/json',
    };
  }

  private gtHeaders(): Record<string, string> {
    return {
      Accept: 'application/json',
    };
  }

  // ---------------------------------------------------------------------------
  // Request builders — CoinGecko (7 tools)
  // ---------------------------------------------------------------------------

  private buildGetPrice(params: Record<string, unknown>): {
    url: string; method: string; headers: Record<string, string>;
  } {
    const qs = new URLSearchParams();
    const coins = params.coins as string[];
    qs.set('ids', coins.join(','));

    const vsCurrencies = (params.vs_currencies as string[] | undefined) ?? ['usd'];
    qs.set('vs_currencies', vsCurrencies.join(','));

    if (params.include_24h_change) qs.set('include_24hr_change', 'true');
    if (params.include_market_cap) qs.set('include_market_cap', 'true');
    if (params.include_volume) qs.set('include_24hr_vol', 'true');

    return {
      url: `${CoinGeckoAdapter.COINGECKO_BASE}/simple/price?${qs.toString()}`,
      method: 'GET',
      headers: this.cgHeaders(),
    };
  }

  private buildGetMarket(params: Record<string, unknown>): {
    url: string; method: string; headers: Record<string, string>;
  } {
    const qs = new URLSearchParams();
    qs.set('vs_currency', 'usd');
    qs.set('order', String(params.sort_by ?? 'market_cap_desc'));
    qs.set('per_page', String(params.limit ?? 100));
    qs.set('page', '1');

    if (params.category) qs.set('category', String(params.category));
    if (params.include_sparkline) qs.set('sparkline', 'true');

    return {
      url: `${CoinGeckoAdapter.COINGECKO_BASE}/coins/markets?${qs.toString()}`,
      method: 'GET',
      headers: this.cgHeaders(),
    };
  }

  private buildCoinDetail(params: Record<string, unknown>): {
    url: string; method: string; headers: Record<string, string>;
  } {
    const coinId = String(params.coin_id);
    const qs = new URLSearchParams();
    qs.set('localization', 'false');
    qs.set('tickers', 'false');

    if (params.include_description === false) qs.set('description', 'false');
    if (params.include_developer) qs.set('developer_data', 'true');
    if (params.include_community) qs.set('community_data', 'true');

    return {
      url: `${CoinGeckoAdapter.COINGECKO_BASE}/coins/${encodeURIComponent(coinId)}?${qs.toString()}`,
      method: 'GET',
      headers: this.cgHeaders(),
    };
  }

  private buildPriceHistory(params: Record<string, unknown>): {
    url: string; method: string; headers: Record<string, string>;
  } {
    const coinId = String(params.coin_id);
    const qs = new URLSearchParams();
    qs.set('vs_currency', 'usd');
    qs.set('days', String(params.days ?? 7));

    if (params.interval) qs.set('interval', String(params.interval));

    return {
      url: `${CoinGeckoAdapter.COINGECKO_BASE}/coins/${encodeURIComponent(coinId)}/market_chart?${qs.toString()}`,
      method: 'GET',
      headers: this.cgHeaders(),
    };
  }

  private buildTrending(): {
    url: string; method: string; headers: Record<string, string>;
  } {
    return {
      url: `${CoinGeckoAdapter.COINGECKO_BASE}/search/trending`,
      method: 'GET',
      headers: this.cgHeaders(),
    };
  }

  private buildGlobal(params: Record<string, unknown>): {
    url: string; method: string; headers: Record<string, string>;
  } {
    const endpoint = params.include_defi ? '/global/decentralized_finance_defi' : '/global';
    return {
      url: `${CoinGeckoAdapter.COINGECKO_BASE}${endpoint}`,
      method: 'GET',
      headers: this.cgHeaders(),
    };
  }

  private buildSearch(params: Record<string, unknown>): {
    url: string; method: string; headers: Record<string, string>;
  } {
    const qs = new URLSearchParams();
    qs.set('query', String(params.query));

    return {
      url: `${CoinGeckoAdapter.COINGECKO_BASE}/search?${qs.toString()}`,
      method: 'GET',
      headers: this.cgHeaders(),
    };
  }

  // ---------------------------------------------------------------------------
  // Request builders — GeckoTerminal (2 tools, no auth)
  // ---------------------------------------------------------------------------

  private buildDexPools(params: Record<string, unknown>): {
    url: string; method: string; headers: Record<string, string>;
  } {
    const qs = new URLSearchParams();
    if (params.query) qs.set('query', String(params.query));
    if (params.network) qs.set('network', String(params.network));
    if (params.limit) qs.set('page[size]', String(params.limit));

    return {
      url: `${CoinGeckoAdapter.GECKOTERMINAL_BASE}/search/pools?${qs.toString()}`,
      method: 'GET',
      headers: this.gtHeaders(),
    };
  }

  private buildTokenByAddress(params: Record<string, unknown>): {
    url: string; method: string; headers: Record<string, string>;
  } {
    const network = String(params.network ?? 'ethereum');
    const address = String(params.contract_address);

    return {
      url: `${CoinGeckoAdapter.GECKOTERMINAL_BASE}/networks/${encodeURIComponent(network)}/tokens/${encodeURIComponent(address)}`,
      method: 'GET',
      headers: this.gtHeaders(),
    };
  }
}
