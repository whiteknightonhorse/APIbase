/**
 * CoinGecko API response types (UC-004).
 *
 * Two API hosts:
 *   - CoinGecko: api.coingecko.com/api/v3 (7 tools, requires x-cg-demo-api-key)
 *   - GeckoTerminal: api.geckoterminal.com/api/v2 (2 tools, free, no auth)
 */

// ---------------------------------------------------------------------------
// Simple Price (crypto.get_price)
// ---------------------------------------------------------------------------

/** Map of coin_id → { currency → price, optional change/cap/vol fields }. */
export type SimplePriceResponse = Record<
  string,
  Record<string, number>
>;

// ---------------------------------------------------------------------------
// Markets (coingecko.get_market)
// ---------------------------------------------------------------------------

export interface MarketCoin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number | null;
  market_cap: number | null;
  market_cap_rank: number | null;
  fully_diluted_valuation: number | null;
  total_volume: number | null;
  high_24h: number | null;
  low_24h: number | null;
  price_change_24h: number | null;
  price_change_percentage_24h: number | null;
  circulating_supply: number | null;
  total_supply: number | null;
  max_supply: number | null;
  ath: number | null;
  ath_change_percentage: number | null;
  ath_date: string | null;
  atl: number | null;
  atl_change_percentage: number | null;
  atl_date: string | null;
  last_updated: string | null;
  sparkline_in_7d?: { price: number[] };
}

// ---------------------------------------------------------------------------
// Coin Detail (crypto.coin_detail)
// ---------------------------------------------------------------------------

export interface CoinDetail {
  id: string;
  symbol: string;
  name: string;
  web_slug: string;
  categories: string[];
  description?: { en?: string };
  links?: Record<string, unknown>;
  image?: { thumb?: string; small?: string; large?: string };
  market_cap_rank: number | null;
  market_data?: {
    current_price?: Record<string, number>;
    market_cap?: Record<string, number>;
    total_volume?: Record<string, number>;
    price_change_percentage_24h?: number | null;
    price_change_percentage_7d?: number | null;
    price_change_percentage_30d?: number | null;
    circulating_supply?: number | null;
    total_supply?: number | null;
    max_supply?: number | null;
  };
  community_data?: Record<string, unknown>;
  developer_data?: Record<string, unknown>;
  last_updated: string;
}

// ---------------------------------------------------------------------------
// Price History / Market Chart (crypto.price_history)
// ---------------------------------------------------------------------------

export interface MarketChartResponse {
  prices: [number, number][];
  market_caps: [number, number][];
  total_volumes: [number, number][];
}

// ---------------------------------------------------------------------------
// Trending (crypto.trending)
// ---------------------------------------------------------------------------

export interface TrendingCoinItem {
  id: string;
  coin_id: number;
  name: string;
  symbol: string;
  market_cap_rank: number | null;
  thumb: string;
  small: string;
  large: string;
  slug: string;
  price_btc: number;
  score: number;
  data?: Record<string, unknown>;
}

export interface TrendingResponse {
  coins: { item: TrendingCoinItem }[];
  nfts?: unknown[];
  categories?: unknown[];
}

// ---------------------------------------------------------------------------
// Global (crypto.global)
// ---------------------------------------------------------------------------

export interface GlobalData {
  active_cryptocurrencies: number;
  upcoming_icos: number;
  ongoing_icos: number;
  ended_icos: number;
  markets: number;
  total_market_cap: Record<string, number>;
  total_volume: Record<string, number>;
  market_cap_percentage: Record<string, number>;
  market_cap_change_percentage_24h_usd: number;
  updated_at: number;
}

export interface GlobalResponse {
  data: GlobalData;
}

// ---------------------------------------------------------------------------
// Search (crypto.search)
// ---------------------------------------------------------------------------

export interface SearchCoin {
  id: string;
  name: string;
  api_symbol: string;
  symbol: string;
  market_cap_rank: number | null;
  thumb: string;
  large: string;
}

export interface SearchResponse {
  coins: SearchCoin[];
  exchanges: { id: string; name: string; market_type: string }[];
  categories: { id: number; name: string }[];
  nfts: { id: string; name: string; symbol: string }[];
}

// ---------------------------------------------------------------------------
// GeckoTerminal: DEX Pools (crypto.dex_pools)
// ---------------------------------------------------------------------------

export interface GtPoolAttributes {
  name: string;
  address: string;
  base_token_price_usd: string | null;
  quote_token_price_usd: string | null;
  fdv_usd: string | null;
  market_cap_usd: string | null;
  reserve_in_usd: string | null;
  pool_created_at: string | null;
  volume_usd: Record<string, string | null>;
  price_change_percentage: Record<string, string | null>;
  transactions: Record<string, Record<string, number | null>>;
}

export interface GtPool {
  id: string;
  type: string;
  attributes: GtPoolAttributes;
  relationships?: Record<string, unknown>;
}

export interface GtPoolsResponse {
  data: GtPool[];
}

// ---------------------------------------------------------------------------
// GeckoTerminal: Token by Address (crypto.token_by_address)
// ---------------------------------------------------------------------------

export interface GtTokenAttributes {
  name: string;
  symbol: string;
  address: string;
  decimals: number;
  total_supply: string | null;
  coingecko_coin_id: string | null;
  price_usd: string | null;
  fdv_usd: string | null;
  total_reserve_in_usd: string | null;
  volume_usd: Record<string, string | null>;
  market_cap_usd: string | null;
}

export interface GtToken {
  id: string;
  type: string;
  attributes: GtTokenAttributes;
}

export interface GtTokenResponse {
  data: GtToken;
}
