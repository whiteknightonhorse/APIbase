# UC-020: AsterDex (Decentralized Perpetual Futures Exchange)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-020 |
| **Provider** | AsterDex / Aster (DEX on BNB Chain + ETH/SOL/ARB). Perpetual futures (up to 1001x) + Spot. Aster Code Builder Program for platform integration. |
| **Category** | DeFi / Decentralized Trading / Perpetual Futures |
| **Date Added** | 2026-03-07 |
| **Status** | Reference |
| **Client** | APIbase (platform-level integration via Aster Code Builder Program) |
| **Referral** | `https://www.asterdex.com/en/referral/tlRYkq` |

---

## RESEARCH REPORT: UC-020 AsterDex / DeFi Perpetual Futures Trading

---

# Phase 1: Platform Overview

## 1.1 What Is AsterDex?

AsterDex (rebranded as **Aster**) is a next-generation decentralized exchange (DEX) focused on **perpetual futures** trading. Formed in late 2024 from the merger of:
- **Astherus** — multi-asset liquidity and yield protocol
- **APX Finance** — decentralized perpetuals protocol (formerly ApolloX)

Backed by **YZi Labs** (rebranded Binance Labs). Advised by **CZ (Changpeng Zhao)**.

## 1.2 Core Products

| Product | Type | Leverage | Description |
|---------|------|----------|-------------|
| **Perpetual Pro** | Order book-based perps | Up to 100x | Professional-grade, advanced order types |
| **1001x (Simple)** | Oracle-based perps | Up to 1001x | Simplified, high-leverage mode |
| **Spot** | Standard spot trading | N/A | Basic spot pairs |
| **AsterEarn** | Yield products | N/A | asBNB, asBTC, asUSDF yield-bearing assets |
| **Hidden Orders** | Dark pool | — | Decentralized dark pool, prevents front-running |
| **Shield Mode** | Privacy trading | High | Private trading with high leverage |
| **Stock Perps (RWA)** | Synthetic stocks | — | Synthetic stock perpetuals |

## 1.3 Supported Chains

| Chain | Status |
|-------|--------|
| **BNB Chain** | Primary (Smart contracts deployed) |
| **Ethereum** | Supported |
| **Solana** | Supported |
| **Arbitrum** | Supported |
| **Aster Chain** | Proprietary L1, launching Q1 2026 |

## 1.4 Platform Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| Lifetime Trading Volume | $500B+ | Self-reported |
| TVL | ~$655M | Peaked ~$2B post-TGE, stabilized |
| Users | 2M+ | Pre-TGE |
| Trading Pairs (Perps) | ~45 symbols | |
| Trading Pairs (Spot) | 8 pairs, 6 coins | |
| Fees | 0.02% maker / 0.05% taker | Down to 0% for top VIP tiers |

## 1.5 Token

| Detail | Value |
|--------|-------|
| Token | $ASTER |
| TGE | September 17, 2025 |
| ATH | $2.42 (2,700% from $0.08) |
| FDV | $7B+ (as of Nov 2025) |
| Tokenomics | 53.5% Airdrop, 30% Ecosystem, remainder Treasury/Team |

## 1.6 Security

- Audited by **PeckShield**
- Non-custodial architecture
- Smart contracts described as open source
- Diamond Pattern (EIP-2535) for upgradeability

### RISK: Volume Integrity Controversy

**DefiLlama delisted Aster's perpetual futures volume data** in October 2025 due to data integrity concerns. Analysis showed trading volumes mirrored Binance perpetuals with ~1:1 correlation, raising wash trading suspicions. Later re-listed, but controversy unresolved. CEO attributed the pattern to "airdrop farming."

---

# Phase 2: API Analysis

## 2.1 REST API

| Detail | Value |
|--------|-------|
| **Base URL** | `https://fapi.asterdex.com` |
| **Format** | JSON |
| **Authentication** | HMAC SHA256 signature + `X-MBX-APIKEY` header |
| **Max API Keys** | 30 per account |
| **IP Whitelisting** | Supported |
| **Rate Limits** | 2,400 request weight/min; 1,200 orders/min |
| **Ban Policy** | HTTP 429 = rate limited; HTTP 418 = IP ban (2min–3 days) |

### Public Endpoints (No Auth)

| Endpoint | Description |
|----------|-------------|
| `GET /fapi/v1/ping` | Connectivity test |
| `GET /fapi/v1/time` | Server time |
| `GET /fapi/v1/exchangeInfo` | Exchange & symbol info |
| `GET /fapi/v1/depth` | Order book depth |
| `GET /fapi/v1/klines` | Candlestick/OHLCV data |
| `GET /fapi/v1/ticker/24hr` | 24h price statistics |
| `GET /fapi/v1/ticker/price` | Latest price |
| `GET /fapi/v1/premiumIndex` | Mark price & funding rate |

### Authenticated Endpoints (TRADE/USER_DATA)

| Endpoint | Description |
|----------|-------------|
| `POST /fapi/v1/order` | Place order |
| `DELETE /fapi/v1/order` | Cancel order |
| `GET /fapi/v1/openOrders` | Open orders |
| `GET /fapi/v4/account` | Account info |
| `GET /fapi/v2/positionRisk` | Position details |
| `GET /fapi/v1/userTrades` | Trade history |
| `GET /fapi/v1/income` | Income/PnL history |

### Aster Code / Builder Endpoints (v3) — CRITICAL

| Endpoint | Description |
|----------|-------------|
| `POST /fapi/v3/approveAgent` | Authorize API Wallet/Agent |
| `POST /fapi/v3/approveBuilder` | Authorize Builder with fee parameters |
| `POST /fapi/v3/order` | Place order with builder attribution |
| `DELETE /agent` | Revoke Agent authorization |
| `DELETE /builder` | Revoke Builder authorization |

## 2.2 WebSocket API

| Detail | Value |
|--------|-------|
| **Base URL** | `wss://fstream.asterdex.com` |
| **Max streams/connection** | 200 |
| **Connection validity** | 24 hours (auto-disconnect) |
| **Ping interval** | Server pings every 5 min |
| **Rate limit** | 10 incoming messages/second |

Streams: ticker, trade, depth, klines, mark price, funding rate, order book ticker.

## 2.3 Smart Contract Direct Access (1001x/Simple)

| Method | Purpose |
|--------|---------|
| `openMarketTrade` | Open market position |
| `createLimitOrder` | Create limit order |
| `closeTrade(bytes32 tradeHash)` | Close position |
| `addMargin` | Add margin to position |
| `updateTradeTpAndSl` | Update TP/SL |
| `cancelLimitOrder` | Cancel limit order |

**Key:** The `OpenDataInput` struct includes a `broker` parameter (uint256) — enables referral/builder attribution at the smart contract level.

**Main Contract (BSC):** `0x1b6F2d3844C6ae7D56ceb3C3643b9060ba28FEb0`

## 2.4 SDKs & Documentation

| Resource | URL |
|----------|-----|
| API Docs | [docs.asterdex.com/product/aster-perpetuals/api](https://docs.asterdex.com/product/aster-perpetuals/api/api-documentation) |
| GitHub API Docs | [github.com/asterdex/api-docs](https://github.com/asterdex/api-docs) (81 stars, 28 forks) |
| Aster Code Docs | [asterdex.github.io/aster-api-website/asterCode/integration-flow/](https://asterdex.github.io/aster-api-website/asterCode/integration-flow/) |
| TypeScript SDK | `asterdex-sdk` on npm (100+ methods) |
| Node.js Client | `asterdex-api` on npm |
| Python Demo | `v3-demo/tx.py` in GitHub repo |
| Go Demo | `v3-demo/main.go` in GitHub repo |

## 2.5 Existing MCP Server

| Detail | Value |
|--------|-------|
| Repository | [github.com/solenyaresearch0000/asterdex-mcp](https://github.com/solenyaresearch0000/asterdex-mcp) |
| Tools | 9 market data tools (order book, OHLCV, funding rates, tickers) |
| Scope | **Read-only** — no order execution |
| License | MIT |
| Status | Single-commit, no active maintenance |

---

# Phase 3: Aster Code Builder Program — Integration Mechanism

## 3.1 What Is Aster Code?

**Aster Code** is a formal broker/builder ecosystem that enables third-party platforms to:
1. Route trades through their own interface
2. Earn builder fees on every executed trade
3. Programmatically attribute trades via API and smart contracts

This is **architecturally equivalent** to Shippo's Platform API (UC-019) — a program designed specifically for intermediaries.

## 3.2 Builder Registration Flow

```
1. APIbase registers with Web3 wallet as Builder
2. Deposit 100 ASTER tokens in perps account (maintenance requirement)
3. Develop custom interface using Aster API v3
4. Users trade through APIbase interface
5. Builder fees earned on every executed trade
6. Fees claimable daily from builder center
```

## 3.3 Technical Integration Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      AI Agent (MCP Client)                   │
│            "Open 10x long BTC position on Aster"             │
└──────────────────────┬──────────────────────────────────────┘
                       │ x402 USDC micropayment
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   APIbase MCP Server                         │
│            Aster Code Builder (wallet authorized)            │
│                                                              │
│  Step 1: User → approveAgent (APIbase API wallet)           │
│  Step 2: User → approveBuilder (APIbase + maxFeeRate)       │
│  Step 3: Agent → POST /fapi/v3/order                        │
│          with builder=APIbase_address, feeRate=X             │
│  Step 4: Trade executes → builder fee recorded              │
│  Step 5: APIbase claims fees daily                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│               AsterDex (Aster Code Program)                  │
│                                                              │
│   REST API: fapi.asterdex.com                               │
│   WebSocket: fstream.asterdex.com                           │
│   Smart Contracts: 0x1b6F...28FEb0 (BSC)                   │
│                                                              │
│   Revenue: builder fee per trade + referral 5-10%            │
└─────────────────────────────────────────────────────────────┘
```

## 3.4 Dual Revenue: Referral + Builder

| Mechanism | How | Revenue |
|-----------|-----|---------|
| **Standard Referral** | Link `https://www.asterdex.com/en/referral/tlRYkq` | 5-10% of referee's trading fees |
| **Aster Code Builder** | API v3 with `builder` parameter | Builder fee on every trade |
| **Tier 1 Referral** | Invitees' reward points (Rh) | 10% of invitees' points |
| **Tier 2 Referral** | Invitees' referrals trade | 5% of Tier 2 fees |
| **VIP Referrals** | From VIP 1+ referees | 30% from VIP 1; 10% from VIP 2+ |

**Key insight:** APIbase uses BOTH mechanisms:
1. **Referral link** (`tlRYkq`) for user onboarding → 5-10% ongoing fees
2. **Aster Code Builder** for API-routed trades → builder fee per trade
3. These stack — referral commission + builder fee on same user's trades

---

# Phase 4: Competitive Landscape

## 4.1 DEX Comparison

| Feature | **AsterDex** | Hyperliquid | dYdX | GMX | Jupiter Perps |
|---------|-------------|-------------|------|-----|---------------|
| **Type** | Order book + Oracle | Order book | Order book | AMM/GLP | AMM |
| **Max Leverage** | **1001x** (Simple) / 100x (Pro) | 50x | 50x | 100x | 100x |
| **Chain** | BNB + ETH + SOL + ARB | Hyperliquid L1 | dYdX Chain | Arbitrum + Avalanche | Solana |
| **Fees** | 0.02%/0.05% | 0.02-0.05% | 0.01%/0.05% | 0.05-0.07% | 0.06-0.1% |
| **Builder/Broker Program** | **Yes (Aster Code)** | No | No | No | No |
| **Referral API** | **Yes (v3 endpoints)** | Limited | Limited | No | No |
| **Yield Collateral** | **Yes (asBNB, asBTC)** | No | No | No | No |
| **Privacy Mode** | **Yes (Shield)** | No | No | No | No |
| **Backing** | CZ / YZi Labs | Independent | a16z, Paradigm | Independent | Solana ecosystem |
| **Volume** | $500B+ (disputed) | ~$1T+ | ~$500B+ | ~$200B+ | ~$300B+ |

### Why AsterDex Over Competitors

1. **Aster Code** — ONLY DEX with a formal Builder/Broker API program. Competitors have no equivalent.
2. **Programmatic referral attribution** at both API (v3 `builder` parameter) and smart contract (`broker` parameter) levels
3. **Multi-chain** from launch (BNB, ETH, SOL, ARB)
4. **Yield-bearing collateral** — earn yield while trading (unique)
5. **Official API documentation** with SDKs (TypeScript, Node.js, Python, Go)

### Why NOT Alternatives

| DEX | Why Not |
|-----|---------|
| Hyperliquid | No formal broker/builder API. No referral embedding in API calls. |
| dYdX | No builder program. API doesn't support broker attribution. |
| GMX | AMM model, no builder program, no API referral mechanism. |
| Jupiter Perps | Solana-only, no builder program. |
| Drift Protocol | No formal broker API for third parties. |

**Conclusion:** AsterDex is the **only DEX with infrastructure designed for APIbase's model** — a builder/broker program with API-level trade attribution and fee earning.

---

# Phase 5: Terms of Service Analysis

## 5.1 ToS Key Clauses

**Source:** [docs.asterdex.com/about-us/aster-terms-and-conditions](https://docs.asterdex.com/about-us/aster-terms-and-conditions)

### Geographic Restrictions (CRITICAL)

**Prohibited jurisdictions:** USA, Canada, UK, China, North Korea, Russia, Ukraine, Cuba, Iran, Venezuela, Syria, and any jurisdiction under comprehensive economic sanctions by UN/EU/UK/US.

**Impact for APIbase:** Major markets (US, UK, CA) are excluded. However:
- Remaining global market is still large (EU excluding UK, Asia excluding China, LATAM, Middle East, Africa)
- APIbase can geo-fence the Aster tools to exclude prohibited jurisdictions
- This is standard for most DEXes (Hyperliquid, dYdX also exclude these jurisdictions)

### Automated Access Clause

> *"Users cannot use any automated means, including bots, scrapers, or spiders, to access or use the Services without our express permission."*

**Analysis:** This clause **conflicts with** the existence of:
- Public REST API with 2,400 req/min limit
- Official API documentation and SDKs
- Aster Code Builder Program (explicitly designed for third-party platform integration)
- `POST /fapi/v3/approveAgent` endpoint (authorizes API wallets)

**Verdict:** The Aster Code Builder Program IS the "express permission" mechanism. Registering as a Builder and using v3 API endpoints constitutes authorized automated access. The ToS clause targets unauthorized scraping/botting, not legitimate API/Builder usage.

### IP and License

- All IP belongs to Aster
- Reverse engineering prohibited
- Standard for DEX platforms

## 5.2 ToS Verdict

| Aspect | Status | Notes |
|--------|--------|-------|
| Commercial use | **CLEARED** (via Aster Code) | Builder program = commercial license |
| Automated access | **CLEARED** (via Aster Code) | Builder registration = "express permission" |
| Proxy/intermediary | **CLEARED** (via Aster Code) | Builder program designed for intermediaries |
| Geographic | **RESTRICTED** | US, UK, CA, CN, RU + sanctioned countries |
| Fee earning | **CLEARED** | Builder fees + referral = revenue model |

**Overall Verdict: CONDITIONAL** — Fully viable through Aster Code Builder Program. Geographic restrictions require geo-fencing. Standard DEX risk profile.

---

# Phase 6: Scoring (12-Parameter Matrix, Max = 245)

| Parameter (×weight) | Score | Weighted | Justification |
|---------------------|-------|----------|---------------|
| Free/Price (×5) | 4 | 20 | Free API, 100 ASTER deposit (~$200), no subscription |
| Coverage (×4) | 4 | 16 | 45 perp pairs, spot, multi-chain, but niche (DEX only) |
| API Quality (×3) | 5 | 15 | Comprehensive REST + WS, v3 builder endpoints, SDKs |
| Affiliate/Revenue (×5) | 5 | 25 | Aster Code builder fees + referral 5-10% + VIP tiers |
| Agent Utility (×5) | 5 | 25 | Full trading: orders, positions, PnL, market data |
| ToS Compatibility (×5) | 3 | 15 | Builder program = permission, but geo-restrictions |
| MCP Ecosystem (×3) | 3 | 9 | Existing MCP server (data-only), our extension adds trading |
| Unique Features (×4) | 5 | 20 | 1001x leverage, yield collateral, hidden orders, privacy |
| New Pattern Potential (×5) | 5 | 25 | First DEX integration, on-chain trading, builder program |
| Cache Potential (×3) | 3 | 9 | Market data cacheable (short TTL), positions real-time |
| Cross-UC Synergy (×4) | 4 | 16 | UC-004 CoinGecko (market data), UC-016 Finance (DeFi) |
| Market Position (×3) | 4 | 12 | CZ-backed, $655M TVL, growing but controversial |
| **TOTAL** | | **207** | |

---

# Phase 7: MCP Tool Definitions (7 Tools)

## Tool 1: `aster_market_data`

```json
{
  "name": "aster_market_data",
  "description": "Get real-time market data from AsterDex perpetual futures exchange. Returns 24h stats, prices, volume, open interest, and funding rates for all trading pairs. Supports individual pair lookup or full market overview.",
  "parameters": {
    "type": "object",
    "properties": {
      "symbol": {
        "type": "string",
        "description": "Trading pair symbol (e.g., 'BTCUSDT', 'ETHUSDT'). Omit for all pairs."
      },
      "data_type": {
        "type": "string",
        "enum": ["ticker_24h", "price", "funding_rate", "open_interest", "mark_price"],
        "default": "ticker_24h"
      }
    }
  },
  "x402_price_usd": 0.002,
  "cache_ttl_seconds": 10,
  "upstream_source": "AsterDex REST API (fapi.asterdex.com)"
}
```

## Tool 2: `aster_order_book`

```json
{
  "name": "aster_order_book",
  "description": "Get order book depth for an AsterDex perpetual futures pair. Returns bids and asks at specified depth. Useful for analyzing liquidity, spread, and support/resistance levels before placing trades.",
  "parameters": {
    "type": "object",
    "properties": {
      "symbol": {
        "type": "string",
        "description": "Trading pair (e.g., 'BTCUSDT')"
      },
      "depth": {
        "type": "integer",
        "enum": [5, 10, 20, 50, 100, 500, 1000],
        "default": 20,
        "description": "Number of price levels"
      }
    },
    "required": ["symbol"]
  },
  "x402_price_usd": 0.003,
  "cache_ttl_seconds": 5,
  "upstream_source": "AsterDex REST API"
}
```

## Tool 3: `aster_klines`

```json
{
  "name": "aster_klines",
  "description": "Get candlestick/OHLCV chart data for an AsterDex perpetual futures pair. Returns open, high, low, close, volume for specified timeframe. Supports intervals from 1 minute to 1 month.",
  "parameters": {
    "type": "object",
    "properties": {
      "symbol": {
        "type": "string",
        "description": "Trading pair (e.g., 'BTCUSDT')"
      },
      "interval": {
        "type": "string",
        "enum": ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"],
        "default": "1h"
      },
      "limit": {
        "type": "integer",
        "default": 100,
        "description": "Number of candles (max 1500)"
      }
    },
    "required": ["symbol"]
  },
  "x402_price_usd": 0.003,
  "cache_ttl_seconds": 30,
  "upstream_source": "AsterDex REST API"
}
```

## Tool 4: `aster_place_order`

```json
{
  "name": "aster_place_order",
  "description": "Place a trade on AsterDex perpetual futures exchange via Aster Code Builder program. Supports market, limit, stop-market, stop-limit, and trailing stop orders. Requires user's pre-authorized API wallet. Builder attribution is automatic — all trades earn builder fees for APIbase.",
  "parameters": {
    "type": "object",
    "properties": {
      "symbol": {
        "type": "string",
        "description": "Trading pair (e.g., 'BTCUSDT')"
      },
      "side": {
        "type": "string",
        "enum": ["BUY", "SELL"]
      },
      "type": {
        "type": "string",
        "enum": ["MARKET", "LIMIT", "STOP_MARKET", "STOP_LIMIT", "TRAILING_STOP_MARKET"],
        "default": "MARKET"
      },
      "quantity": {
        "type": "number",
        "description": "Order quantity in base asset"
      },
      "price": {
        "type": "number",
        "description": "Limit price (required for LIMIT and STOP_LIMIT)"
      },
      "stop_price": {
        "type": "number",
        "description": "Stop/trigger price (for STOP orders)"
      },
      "leverage": {
        "type": "integer",
        "description": "Leverage multiplier (1-100 for Pro, 1-1001 for Simple)"
      },
      "reduce_only": {
        "type": "boolean",
        "default": false,
        "description": "If true, order only reduces position"
      },
      "time_in_force": {
        "type": "string",
        "enum": ["GTC", "IOC", "FOK", "GTX"],
        "default": "GTC"
      }
    },
    "required": ["symbol", "side", "quantity"]
  },
  "x402_price_usd": 0.01,
  "cache_ttl_seconds": 0,
  "upstream_source": "AsterDex REST API v3 (Aster Code Builder)"
}
```

## Tool 5: `aster_positions`

```json
{
  "name": "aster_positions",
  "description": "Get current open positions on AsterDex. Returns entry price, mark price, unrealized PnL, liquidation price, leverage, and margin details for all open positions or a specific symbol.",
  "parameters": {
    "type": "object",
    "properties": {
      "symbol": {
        "type": "string",
        "description": "Trading pair (e.g., 'BTCUSDT'). Omit for all positions."
      }
    }
  },
  "x402_price_usd": 0.005,
  "cache_ttl_seconds": 5,
  "upstream_source": "AsterDex REST API (authenticated)"
}
```

## Tool 6: `aster_account`

```json
{
  "name": "aster_account",
  "description": "Get AsterDex account information including balances, total unrealized PnL, available margin, maintenance margin ratio, and trade history. Also returns recent income/PnL records.",
  "parameters": {
    "type": "object",
    "properties": {
      "info_type": {
        "type": "string",
        "enum": ["balance", "account", "trades", "income"],
        "default": "account"
      },
      "symbol": {
        "type": "string",
        "description": "Filter by symbol (for trades/income)"
      },
      "limit": {
        "type": "integer",
        "default": 50,
        "description": "Number of records (for trades/income)"
      }
    }
  },
  "x402_price_usd": 0.005,
  "cache_ttl_seconds": 10,
  "upstream_source": "AsterDex REST API (authenticated)"
}
```

## Tool 7: `aster_exchange_info`

```json
{
  "name": "aster_exchange_info",
  "description": "Get AsterDex exchange information including all available trading pairs, leverage limits, price/quantity precision, order types, margin modes, and maintenance margin rates. Essential for validating order parameters before placing trades.",
  "parameters": {
    "type": "object",
    "properties": {
      "symbol": {
        "type": "string",
        "description": "Specific symbol to query (e.g., 'BTCUSDT'). Omit for all symbols."
      }
    }
  },
  "x402_price_usd": 0.001,
  "cache_ttl_seconds": 3600,
  "upstream_source": "AsterDex REST API (public)"
}
```

---

# Phase 8: AI Instructions for Agents

```yaml
api_name: "APIbase AsterDex Trading"
version: "1.0"
base_url: "https://api.apibase.pro/v1/aster"
auth: "x402 USDC micropayment per call"

instructions: |
  You have access to 7 AsterDex perpetual futures trading tools covering
  market data, charting, order execution, and account management.

  MARKET DATA (public, no wallet needed):
  - aster_market_data: Real-time prices, 24h stats, funding rates, open interest
  - aster_order_book: Order book depth (bids/asks) for liquidity analysis
  - aster_klines: Candlestick/OHLCV chart data (1m to 1M intervals)
  - aster_exchange_info: Available pairs, leverage limits, trading rules

  TRADING (requires user's pre-authorized wallet):
  - aster_place_order: Execute trades (market, limit, stop, trailing stop)
  - aster_positions: View open positions with PnL and liquidation prices
  - aster_account: Balances, margin, trade history, income

  CRITICAL: TRADING WARNINGS
  1. Perpetual futures are HIGH RISK. Always warn users about leverage risk.
  2. 1001x leverage can liquidate positions within 0.1% price movement.
  3. NEVER place orders without explicit user confirmation.
  4. ALWAYS show estimated liquidation price before confirming.
  5. Recommend starting with low leverage (2-5x) for new users.

  GEOGRAPHIC RESTRICTIONS:
  - AsterDex is NOT available in: USA, UK, Canada, China, Russia, and
    other sanctioned jurisdictions.
  - If user location suggests a restricted jurisdiction, inform them
    and do not proceed with trading operations.

  USAGE PATTERNS:
  1. "What's BTC price on Aster?" → aster_market_data(symbol="BTCUSDT")
  2. "Show me ETH 4h chart" → aster_klines(symbol="ETHUSDT", interval="4h")
  3. "Long BTC 10x" → aster_exchange_info → aster_market_data → confirm with user → aster_place_order
  4. "Check my positions" → aster_positions
  5. "What's the funding rate?" → aster_market_data(data_type="funding_rate")
  6. "How much liquidity on SOL?" → aster_order_book(symbol="SOLUSDT")

  TRADE EXECUTION FLOW:
  Step 1: aster_exchange_info — validate symbol exists, check leverage limits
  Step 2: aster_market_data — get current price, check 24h volume
  Step 3: aster_order_book — assess liquidity at intended size
  Step 4: Present trade details to user (entry, leverage, est. liquidation)
  Step 5: Wait for explicit confirmation
  Step 6: aster_place_order — execute
  Step 7: aster_positions — verify position opened correctly

  CROSS-UC ENRICHMENT:
  - Combine with UC-004 (CoinGecko) for broader market context
  - Combine with UC-016 (Finance) for macro economic context
  - Combine with UC-006 (News) for trading-relevant news
```

---

# Phase 9: Revenue Model

## 9.1 Revenue Streams

### Stream 1: Aster Code Builder Fees

| Metric | Phase 1 (Mo 1-6) | Phase 2 (Mo 7-12) | Phase 3 (Mo 13-24) |
|--------|-------------------|--------------------|--------------------|
| Monthly Trading Volume via APIbase | $500K | $5M | $50M |
| Builder Fee Rate (avg) | 0.01% | 0.01% | 0.01% |
| **Builder Fee Revenue** | **$50** | **$500** | **$5,000** |

### Stream 2: Referral Commission

| Metric | Phase 1 | Phase 2 | Phase 3 |
|--------|---------|---------|---------|
| Referred Users (cumulative) | 50 | 500 | 5,000 |
| Avg Monthly Trading per User | $10K | $10K | $10K |
| Referral % | 5-10% of fees (avg 7.5%) | 7.5% | 7.5% |
| Trading Fee (0.05% taker) | 0.05% | 0.05% | 0.05% |
| **Referral Revenue** | **$19** | **$188** | **$1,875** |

### Stream 3: x402 Micropayments

| Tool | x402 Price | Calls/Mo (P1) | Calls/Mo (P3) | Rev/Mo (P1) | Rev/Mo (P3) |
|------|-----------|---------------|---------------|-------------|-------------|
| aster_market_data | $0.002 | 20,000 | 500,000 | $40 | $1,000 |
| aster_order_book | $0.003 | 5,000 | 100,000 | $15 | $300 |
| aster_klines | $0.003 | 10,000 | 200,000 | $30 | $600 |
| aster_place_order | $0.01 | 2,000 | 50,000 | $20 | $500 |
| aster_positions | $0.005 | 5,000 | 100,000 | $25 | $500 |
| aster_account | $0.005 | 3,000 | 50,000 | $15 | $250 |
| aster_exchange_info | $0.001 | 2,000 | 20,000 | $2 | $20 |
| **Totals** | | **47,000** | **1,020,000** | **$147** | **$3,170** |

### Stream 4: Cross-UC Trading Enrichment

| Integration | Description | Rev/Mo (P1) | Rev/Mo (P3) |
|-------------|-------------|-------------|-------------|
| UC-004 CoinGecko | Market context before trade | $20 | $500 |
| UC-006 News | Trading-relevant news alerts | $10 | $300 |
| UC-016 Finance | Macro data for trading decisions | $10 | $200 |
| **Total Cross-UC** | | **$40** | **$1,000** |

## 9.2 Phase Projections

| Metric | Phase 1 (Mo 1-6) | Phase 2 (Mo 7-12) | Phase 3 (Mo 13-24) |
|--------|-------------------|--------------------|--------------------|
| Builder Fee Revenue | $50 | $500 | $5,000 |
| Referral Revenue | $19 | $188 | $1,875 |
| x402 API Revenue | $147 | $1,000 | $3,170 |
| Cross-UC Revenue | $40 | $300 | $1,000 |
| **Total Monthly Revenue** | **$256** | **$1,988** | **$11,045** |
| Upstream Cost | ~$0 | ~$0 | ~$0 |
| 100 ASTER Deposit | ~$200 (one-time) | — | — |
| **Monthly Margin** | **$256** | **$1,988** | **$11,045** |
| **Margin %** | **~100%** | **~100%** | **~100%** |
| **Break-Even** | **Month 1** | | |

**Key insight:** Upstream cost = $0 (DEX API is free, on-chain). 100 ASTER deposit is one-time (~$200). Revenue is PURE MARGIN — builder fees + referral + x402. This is the highest-margin UC alongside UC-001, UC-002, UC-008, UC-010, UC-011, UC-015, UC-016.

---

# Phase 10: Cross-UC Synergy

```
                  UC-020 AsterDex Trading
                          │
           ┌──────────────┼──────────────────┐
           │              │                  │
    ┌──────▼──────┐ ┌─────▼──────┐ ┌─────────▼────────┐
    │  UC-004     │ │  UC-006    │ │    UC-016         │
    │  CoinGecko  │ │  News      │ │    Finance        │
    │             │ │            │ │                   │
    │ Market data │ │ Breaking   │ │ Macro indicators  │
    │ enrichment  │ │ news →     │ │ → trading context │
    │ for trading │ │ trade      │ │ (rates, forex)    │
    │ decisions   │ │ signals    │ │                   │
    └─────────────┘ └────────────┘ └───────────────────┘
```

### Key Cross-UC Integrations

| UC Partner | Integration | Agent Scenario |
|------------|-------------|----------------|
| **UC-004 CoinGecko** | BTC/ETH market cap, dominance, trending | "Is now a good time to long BTC?" → CoinGecko context + Aster trade |
| **UC-006 NewsAPI** | Breaking crypto news | "Any news that might affect ETH?" → News → informed trading decision |
| **UC-016 Finance** | Interest rates, macro data | "How do Fed rates affect crypto?" → macro context before trade |
| **UC-001 Polymarket** | Prediction markets | "What's the market prediction for crypto regulation?" → Polymarket + trading |

---

# Phase 11: Risk Analysis

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Wash trading controversy** | Reputational — associating APIbase with disputed volume claims | Medium | Clearly label as DEX integration, don't cite volume claims, let trading quality speak for itself |
| **Geographic restrictions** | Revenue ceiling — US/UK/CA excluded | High | Geo-fence tools, focus on permitted jurisdictions (EU, Asia, LATAM, MENA), disclose restrictions in AI instructions |
| **Regulatory risk** | 1001x leverage may attract regulatory scrutiny | Medium | Default to conservative leverage suggestions (2-5x), require explicit user confirmation for high leverage |
| **Smart contract risk** | Potential vulnerabilities despite PeckShield audit | Low-Medium | Non-custodial architecture limits exposure to trade execution only |
| **ASTER token volatility** | 100 ASTER deposit value fluctuation | Low | ~$200 one-time deposit, manageable |
| **Platform longevity** | DEX ecosystem is competitive, projects may pivot/decline | Medium | Non-custodial = no lock-in, easy to add alternative DEXes later |
| **Agent trading liability** | AI agent executing trades = potential for user losses | High | Strong confirmation flows, leverage warnings, position size limits, "paper trading" mode |

### Risk Mitigations Built Into AI Instructions

1. **Mandatory confirmation before every trade** — agent NEVER auto-executes
2. **Leverage warnings** — explicit liquidation price shown before confirmation
3. **Geographic check** — refuse trading operations for restricted jurisdictions
4. **Position size limits** — recommend max 5% of portfolio per trade
5. **Default low leverage** — suggest 2-5x unless user specifically requests higher

---

# Phase 12: Pattern P20 — DEX Builder/Broker Integration

## Core Strategy

**P20: DEX Builder/Broker Integration** — Integrate with decentralized exchanges that offer formal builder/broker programs, earning revenue through three stacked mechanisms: builder fees per trade, referral commission, and x402 micropayments for API access. Zero upstream cost (DEX APIs are free/on-chain). Non-custodial = no asset handling liability.

## Sub-Patterns

### P20a: Stacked Revenue (Builder + Referral + x402)
Three independent revenue streams on same user:
1. **x402** for API access (market data, order execution)
2. **Builder fee** on every trade routed through APIbase
3. **Referral commission** (5-10%) on all trading fees

These STACK — same user generates all three. No cannibalization.

### P20b: Non-Custodial Trading Proxy
APIbase routes trades but never holds user funds. Non-custodial architecture means:
- No custody license required
- No asset handling liability
- User signs transactions with own wallet
- APIbase earns fees without touching assets

### P20c: Market Data as Loss Leader
Public market data tools (aster_market_data, aster_klines, aster_order_book) priced cheaply ($0.001-0.003) to attract trading agents. Real revenue from trade execution (builder fees + referral). Data tools create the "trading context" that leads to order execution.

### P20d: Geo-Fenced Compliance
Geographic restrictions (US, UK, CA excluded) require geo-fencing at the MCP tool level. First pattern with built-in geographic compliance checks.

## Key Innovation

P20 is the **first DEX integration pattern** and the **first pattern with trading/execution capability** (UC-019 had shipping actions, but P20 has financial execution). Combined with P19's physical-world actions, APIbase now bridges **information → physical actions → financial execution**.

---

# Executive Summary

UC-020 (AsterDex / DeFi Perpetual Futures Trading) is viable via the **Aster Code Builder Program**:

1. **Aster Code Builder** — formal broker program designed for platforms. APIbase registers as Builder, deposits 100 ASTER (~$200), earns builder fees on every trade.
2. **Referral stacking** — referral link (`tlRYkq`) provides 5-10% ongoing commission ON TOP OF builder fees.
3. **Comprehensive API** — REST + WebSocket, 45+ perp pairs, market/limit/stop orders, full account management.
4. **$0 upstream cost** — DEX API is free. Only cost: 100 ASTER one-time deposit.
5. **~100% margin** — all revenue (builder fees + referral + x402) is pure margin.

**Revenue:** $256/mo (Phase 1) → $11,045/mo (Phase 3) at ~100% margin.

**Pattern P20** ("DEX Builder/Broker Integration") — first DEX integration, stacked revenue (builder + referral + x402), non-custodial trading proxy.

**Risks:** Geographic restrictions (US/UK/CA excluded), wash trading controversy, regulatory risk from 1001x leverage, agent trading liability. All mitigated via geo-fencing, conservative defaults, mandatory trade confirmations.

**Critical path:** Register as Aster Code Builder (100 ASTER deposit), set up API wallet, implement geo-fencing for restricted jurisdictions.

---

## Sources

- [Aster Official Docs](https://docs.asterdex.com/)
- [Aster API Documentation](https://docs.asterdex.com/product/aster-perpetuals/api/api-documentation)
- [Aster Code Builder Program](https://docs.asterdex.com/product/aster-perpetuals/aster-code)
- [Aster Code Integration Flow](https://asterdex.github.io/aster-api-website/asterCode/integration-flow/)
- [Aster Smart Contracts](https://docs.asterdex.com/overview/what-is-aster/our-smart-contracts)
- [Aster Terms & Conditions](https://docs.asterdex.com/about-us/aster-terms-and-conditions)
- [GitHub API Docs](https://github.com/asterdex/api-docs)
- [AsterDex MCP Server](https://github.com/solenyaresearch0000/asterdex-mcp)
- [Aster Referral Program](https://docs.asterdex.com/product/aster-perpetual-pro/referral-program)
- [DefiLlama Delisting (CoinTelegraph)](https://cointelegraph.com/news/defillama-delist-aster-perp-data-integrity)
- [asterdex-sdk (npm)](https://libraries.io/npm/asterdex-sdk)
- [CryptoNews Aster DEX Review 2026](https://cryptonews.com/reviews/aster-dex-review/)
