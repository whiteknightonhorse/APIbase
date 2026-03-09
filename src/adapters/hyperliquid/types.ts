/**
 * Raw Hyperliquid API response types (UC-021).
 *
 * Single endpoint: POST https://api.hyperliquid.xyz/info
 * All requests are JSON POST with { type: "..." } body.
 */

// ---------------------------------------------------------------------------
// /info { type: "meta" } — Market metadata
// ---------------------------------------------------------------------------

export interface HyperliquidAssetMeta {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated?: boolean;
}

export interface HyperliquidMetaResponse {
  universe: HyperliquidAssetMeta[];
}

// ---------------------------------------------------------------------------
// /info { type: "allMids" } — Mid prices for all assets
// ---------------------------------------------------------------------------

export type HyperliquidAllMidsResponse = Record<string, string>;

// ---------------------------------------------------------------------------
// /info { type: "l2Book" } — Order book
// ---------------------------------------------------------------------------

export interface HyperliquidL2Level {
  px: string;
  sz: string;
  n: number;
}

export interface HyperliquidL2BookResponse {
  coin: string;
  levels: [HyperliquidL2Level[], HyperliquidL2Level[]];
  time: number;
}

// ---------------------------------------------------------------------------
// /info { type: "candleSnapshot" } — Klines / candles
// ---------------------------------------------------------------------------

export interface HyperliquidCandle {
  t: number;    // open timestamp ms
  T: number;    // close timestamp ms
  s: string;    // symbol
  i: string;    // interval
  o: string;    // open
  c: string;    // close
  h: string;    // high
  l: string;    // low
  v: string;    // volume
  n: number;    // number of trades
}

export type HyperliquidCandleResponse = HyperliquidCandle[];

// ---------------------------------------------------------------------------
// /info { type: "clearinghouseState" } — Account / positions
// ---------------------------------------------------------------------------

export interface HyperliquidPosition {
  coin: string;
  szi: string;
  leverage: { type: string; value: number };
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  liquidationPx: string | null;
  marginUsed: string;
  maxLeverage: number;
}

export interface HyperliquidMarginSummary {
  accountValue: string;
  totalNtlPos: string;
  totalRawUsd: string;
  totalMarginUsed: string;
}

export interface HyperliquidClearinghouseState {
  assetPositions: { position: HyperliquidPosition }[];
  crossMarginSummary: HyperliquidMarginSummary;
  marginSummary: HyperliquidMarginSummary;
  withdrawable: string;
}

// ---------------------------------------------------------------------------
// /info { type: "vaultDetails" } — Vault information
// ---------------------------------------------------------------------------

export interface HyperliquidVaultDetails {
  name: string;
  vaultAddress: string;
  leader: string;
  tvl: string;
  maxDistributable: string;
  apr: number;
  followerState: unknown;
  portfolio: unknown[];
}
