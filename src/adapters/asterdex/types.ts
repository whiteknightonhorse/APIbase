/**
 * Raw AsterDEX API response types (UC-020).
 *
 * Binance-compatible REST API: https://fapi.asterdex.com
 * Public endpoints require no authentication.
 */

// ---------------------------------------------------------------------------
// GET /fapi/v1/exchangeInfo — Exchange information
// ---------------------------------------------------------------------------

export interface AsterSymbolFilter {
  filterType: string;
  [key: string]: unknown;
}

export interface AsterSymbol {
  symbol: string;
  pair: string;
  contractType: string;
  deliveryDate: number;
  onboardDate: number;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  marginAsset: string;
  pricePrecision: number;
  quantityPrecision: number;
  baseAssetPrecision: number;
  quotePrecision: number;
  filters: AsterSymbolFilter[];
  orderTypes: string[];
  timeInForce: string[];
}

export interface AsterExchangeInfoResponse {
  timezone: string;
  serverTime: number;
  symbols: AsterSymbol[];
}

// ---------------------------------------------------------------------------
// GET /fapi/v1/ticker/24hr — 24h ticker statistics
// ---------------------------------------------------------------------------

export interface AsterTicker24hr {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  lastPrice: string;
  lastQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  count: number;
}

export type AsterTicker24hrResponse = AsterTicker24hr | AsterTicker24hr[];

// ---------------------------------------------------------------------------
// GET /fapi/v1/depth — Order book
// ---------------------------------------------------------------------------

export interface AsterDepthResponse {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
}

// ---------------------------------------------------------------------------
// GET /fapi/v1/klines — Kline/Candlestick data
// ---------------------------------------------------------------------------

/** Each kline is an array: [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, ...] */
export type AsterKline = (string | number)[];

export type AsterKlinesResponse = AsterKline[];
