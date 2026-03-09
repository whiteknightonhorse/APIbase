# UC-021: Hyperliquid (Decentralized Perpetual Futures Exchange — #1 DEX)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-021 |
| **Provider** | Hyperliquid — #1 DEX by perp volume. Own L1 (HyperBFT), 200K orders/sec, zero gas. 100+ perp markets, spot (HIP-1), vaults, HIP-3 builder perps. |
| **Category** | DeFi / Decentralized Trading / Perpetual Futures |
| **Date Added** | 2026-03-07 |
| **Status** | Reference |
| **Client** | APIbase (platform-level integration via Builder Codes) |
| **Referral** | `https://app.hyperliquid.xyz/join/CRYPTOREFERENCE` |
| **API Wallet** | `0xc98dDC93e5d97Be00306a305F53BE802c6EdeAbB` |

---

## RESEARCH REPORT: UC-021 Hyperliquid / #1 DeFi Perpetual Futures Exchange

---

# Phase 1: Platform Overview

## 1.1 What Is Hyperliquid?

Hyperliquid is a **fully on-chain order book DEX** operating on its **own proprietary Layer-1 blockchain** (Hyperliquid L1). It is the **#1 decentralized exchange by perpetual futures volume**, holding ~70-80% of the perp DEX market. NOT an AMM — uses a central limit order book (CLOB), providing a CEX-grade trading experience in DeFi.

### Architecture

| Feature | Detail |
|---------|--------|
| **Blockchain** | Hyperliquid L1 (proprietary) |
| **Consensus** | HyperBFT (derived from HotStuff BFT) |
| **Throughput** | 200,000 orders/second |
| **Finality** | Sub-second |
| **Gas Fees** | **Zero** — no gas fees for transactions |
| **EVM Compatibility** | HyperEVM (added early 2025) |

## 1.2 Products

| Product | Status | Details |
|---------|--------|---------|
| **Perpetual Futures** | Live | 100+ markets, up to 50x leverage |
| **Spot Trading** | Live | HIP-1 tokens with on-chain order books |
| **Vaults** | Live | HLP (~$380M TVL, ~6.93% APR) + user vaults |
| **HIP-1 Tokens** | Live | Native fungible token standard |
| **HIP-2 (Hyperliquidity)** | Live | Automated on-chain market making |
| **HIP-3 (Builder Perps)** | Live (2026) | Permissionless perpetual market deployment |
| **HyperEVM** | Live | EVM-compatible smart contract layer |
| **Borrow/Lend** | Live | On-chain lending markets |

## 1.3 Metrics (March 2026)

| Metric | Value |
|--------|-------|
| **Monthly Trading Volume** | ~$200–260 billion |
| **Cumulative All-Time Volume** | $4+ trillion |
| **Total Value Locked (TVL)** | ~$4.32 billion |
| **Monthly Active Addresses** | 314,000+ |
| **2025 Annual Revenue** | $844 million |
| **Market Share (Perp DEXs)** | ~70–80% (#1) |
| **Open Interest** | ~$9.5 billion |

## 1.4 HYPE Token (March 2026)

| Metric | Value |
|--------|-------|
| **Price** | ~$30.58 |
| **Market Cap** | ~$7.35 billion |
| **FDV** | ~$29.69 billion |
| **Total Supply** | 1 billion HYPE |
| **Circulating** | ~240 million HYPE |
| **CoinGecko Rank** | #16 |

## 1.5 Competitive Position

| Metric | Hyperliquid | AsterDex (UC-020) | dYdX | GMX |
|--------|-------------|-------------------|------|-----|
| **Volume Share** | ~28.2% (#1) | ~15.5% (#2) | ~5% | ~3% |
| **Open Interest** | $5.6B | $1.9B | <$1B | <$1B |
| **Monthly Volume** | $200-260B | Lower | <$50B | <$30B |
| **TVL** | $4.32B | $655M | <$500M | <$500M |
| **Market Cap** | $7.35B | ~$1B | ~$1B | ~$300M |
| **Own Chain** | Yes (L1) | No (BNB Chain) | Yes (Cosmos) | No (Arbitrum) |

Hyperliquid is the **undisputed #1 DEX** — it flipped Coinbase's notional volume for 2025.

---

# Phase 2: API Analysis

## 2.1 REST API

| Detail | Value |
|--------|-------|
| **Mainnet** | `https://api.hyperliquid.xyz` |
| **Testnet** | `https://api.hyperliquid-testnet.xyz` |
| **Format** | JSON, POST-only |
| **Auth** | EIP-712 wallet signatures (no traditional API keys) |
| **API Wallets** | Up to 4 per account (1 unnamed + 3 named) |
| **Security** | API wallets cannot withdraw — trade-only delegation |

### Info Endpoint (`POST /info`)

| Query Type | Description |
|------------|-------------|
| `meta` / `spotMeta` | Market metadata (perps/spot) |
| `allMids` | Mid prices for all coins |
| `l2Book` | Order book snapshot (up to 20 levels) |
| `candleSnapshot` | OHLCV candles (1m to 1M intervals) |
| `clearinghouseState` | User perps positions & margin |
| `spotClearinghouseState` | User spot balances |
| `openOrders` / `frontendOpenOrders` | Active orders |
| `userFills` / `userFillsByTime` | Trade history (up to 2000 fills) |
| `historicalOrders` | Recent historical orders |
| `orderStatus` | Individual order status |
| `vaultDetails` | Vault information & performance |
| `userVaultEquities` | User vault positions |
| `referral` | Referral stats & reward history |
| `userFees` | Fee schedule & discounts |
| `maxBuilderFee` | Check builder fee approval |
| `approvedBuilders` | List approved builders |
| `portfolio` | Account value & PnL history |
| `userRateLimit` | Rate limit usage |
| `borrowLendUserState` / `borrowLendReserveState` | Lending data |
| `delegations` / `delegatorSummary` | Staking info |

### Exchange Endpoint (`POST /exchange`)

| Action | Description |
|--------|-------------|
| **Order placement** | Limit, market, IOC, ALO, GTC, trigger/stop |
| **Order cancellation** | By order ID or client order ID |
| **Order modification** | Single or batch |
| **TWAP orders** | Time-weighted execution |
| **Schedule cancel** | Dead man's switch |
| **Update leverage** | Cross or isolated |
| **Update isolated margin** | Add/remove margin |
| **Vault deposit/withdraw** | Programmatic vault management |
| **Transfer** | Internal, cross-account, withdrawal |
| **Approve builder fee** | Authorize builder to charge fee |
| **Approve API wallet** | Delegate trading rights |
| **Staking operations** | Delegate, undelegate HYPE |

## 2.2 WebSocket API

| Detail | Value |
|--------|-------|
| **Mainnet** | `wss://api.hyperliquid.xyz/ws` |
| **Testnet** | `wss://api.hyperliquid-testnet.xyz/ws` |
| **Max connections** | 10 per IP |
| **Max subscriptions** | 1,000 total |
| **Messages/minute** | 2,000 across all connections |

### Subscription Types

| Stream | Description |
|--------|-------------|
| `trades` | Real-time trades per coin |
| `l2Book` | Order book streaming |
| `candle` | Candlestick streaming (multiple intervals) |
| `allMids` | All mid prices streaming |
| `userEvents` | User account events |
| `userFills` | User fill streaming |
| `orderUpdates` | Order status updates |
| `userFundings` | Funding rate events |
| `userNonFundingLedger` | Non-funding ledger events |

## 2.3 Rate Limits

**REST (per IP):**
- 1,200 weight per minute aggregate
- Base weight: 1 + floor(batch_length / 40)
- Info endpoints: weight 2-60 depending on type

**Per-Address (order rate limiting):**
- 1 request per 1 USDC traded cumulatively
- Initial buffer: 10,000 requests
- Open order limit: 1,000 (scales to 5,000 with volume)

## 2.4 Authentication

Hyperliquid uses **wallet-based authentication** with EIP-712 signatures:
1. Private key signs all exchange requests
2. **API Wallets** created at [app.hyperliquid.xyz/API](https://app.hyperliquid.xyz/API)
3. API wallets trade on behalf of main account WITHOUT withdrawal permissions
4. Every request includes `nonce` (timestamp ms) + `signature`
5. User's API wallet address: `0xc98dDC93e5d97Be00306a305F53BE802c6EdeAbB`

## 2.5 SDKs

| SDK | Type | Source |
|-----|------|--------|
| **hyperliquid-python-sdk** | Official | [PyPI](https://pypi.org/project/hyperliquid-python-sdk/) v0.22.0 |
| **hyperliquid-rust-sdk** | Official | [GitHub](https://github.com/hyperliquid-dex/hyperliquid-rust-sdk) |
| **CCXT** | Community | Python, JS, PHP, C#, Go — standard exchange API |
| **@nktkas/hyperliquid** | Community | TypeScript |
| **HyperLiquid.Net** | Community | C# |

## 2.6 Existing MCP Servers

| MCP Server | Features | Status |
|------------|----------|--------|
| [edkdev/hyperliquid-mcp](https://github.com/edkdev/hyperliquid-mcp) | Trading interface | Active |
| [kukapay/hyperliquid-info-mcp](https://github.com/kukapay/hyperliquid-info-mcp) | Read-only data/analytics | Active |
| [6rz6/HYPERLIQUID-MCP-Server](https://lobehub.com/mcp/6rz6-hyperliquid-mcp-server) | Full trading + data | Active |

**Key insight:** Multiple MCP servers exist, but NONE combine builder code attribution + referral stacking + vault management + cross-UC enrichment. APIbase's differentiation is the unified, monetized integration layer.

---

# Phase 3: Builder Codes — THE KEY MECHANISM

## 3.1 CORRECTION: UC-020 Was Wrong About Hyperliquid

UC-020 stated: *"Hyperliquid — No formal broker API. No referral embedding in API calls."*

**THIS WAS INCORRECT.** Hyperliquid has a **fully functional, permissionless, on-chain Builder Code system** that is arguably **more powerful and more permissionless** than AsterDex's "Aster Code" program.

## 3.2 How Builder Codes Work

### Step 1: Become a Builder (Permissionless)
- Minimum **100 USDC** in perps account
- **No application process** — fully permissionless
- Compare to AsterDex: requires 100 ASTER tokens + formal application

### Step 2: User Approves Builder Fee (One-Time)
- User calls `ApproveBuilderFee` signed by **main wallet** (not API wallet)
- Sets maximum fee the builder can charge
- Max 10 active builder approvals per user
- User can revoke at any time

```python
# Python SDK example
exchange.approve_builder_fee(
    "0xc98dDC93e5d97Be00306a305F53BE802c6EdeAbB",  # APIbase builder address
    "0.05%"  # Max 5 basis points
)
```

### Step 3: Include Builder Code in Every Order
- Add `builder` parameter to order placement
- Format: `{"b": "0xBuilderAddress", "f": fee_in_tenths_of_bps}`
- `f=50` means 5 basis points (0.05%) of order notional

```python
# Place order with builder code
result = exchange.order(
    "BTC",
    is_buy=True,
    sz=0.001,
    limit_px=30000,
    order_type={"limit": {"tif": "Gtc"}},
    builder={"b": "0xc98dDC93e5d97Be00306a305F53BE802c6EdeAbB", "f": 50}
)
```

### Step 4: Collect Fees
- **100% of builder fee goes to builder** — no protocol cut
- Fees claimable via referral reward claim process
- Historical fills available as compressed CSV: `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{address}/{YYYYMMDD}.csv.lz4`

## 3.3 Builder Fee Caps

| Market Type | Max Builder Fee |
|-------------|----------------|
| **Perpetuals** | 0.1% (10 bps) on both sides |
| **Spot** | 1% (100 bps) on sell side only |

## 3.4 Ecosystem Revenue Data — Builder Codes Are MASSIVE

| Metric | Value |
|--------|-------|
| **Total Builder Code Revenue (All Builders)** | **$40+ million** |
| **% Daily Users via Third-Party Frontends** | **40%** |
| **PVP.Trade Lifetime Revenue** | **$7.2 million** |
| **Phantom Wallet Daily Revenue** | **~$100K/day** |
| **Revenue at $10M/day volume, 5 bps** | **$5,000/day = $1.8M/year** |

## 3.5 Builder Codes vs. AsterDex Aster Code

| Feature | **Hyperliquid Builder Codes** | AsterDex Aster Code |
|---------|-------------------------------|---------------------|
| **Permission** | Permissionless (100 USDC) | Requires application |
| **Fee to Builder** | **100%** (no protocol cut) | Via partnership terms |
| **Attribution** | On-chain, per-order | API-level tracking |
| **Max Fee** | 0.1% perps, 1% spot | Not publicly documented |
| **User Approval** | Main wallet signature | Main wallet signature |
| **Platform Volume** | $200-260B/mo | Much lower |
| **Revenue Proof** | $40M+ ecosystem revenue | Not publicly available |

## 3.6 Dual Revenue: Referral + Builder (STACKING)

| Mechanism | How | Revenue |
|-----------|-----|---------|
| **Referral** (`CRYPTOREFERENCE`) | User joins via link → tracked permanently | **10% of user's fees** for first $1B volume |
| **Builder Code** (`0xc98d...`) | `builder` param in every order | **Custom fee up to 0.1%**, 100% to builder |

**CRITICAL: These STACK.** A user who:
1. Joined via `CRYPTOREFERENCE` referral link, AND
2. Trades through APIbase with builder code

...generates revenue from BOTH mechanisms simultaneously. No cannibalization.

---

# Phase 4: Hyperliquid Vaults — Additional Revenue

## 4.1 What Are Vaults?

Managed trading accounts where a Vault Leader trades with pooled funds.

| Type | Description | Key Metrics |
|------|-------------|-------------|
| **HLP** | Protocol vault providing exchange liquidity | ~$380M TVL, ~6.93% APR |
| **User Vaults** | Created by any user | 24h deposit lockup |
| **HyperEVM Vaults** | EIP-4626 compatible | Advanced customization |

## 4.2 Vault Leader Economics

- Minimum deposit: **100 USDC**
- Leader maintains ≥5% of vault total value
- Leader earns **10% of profits** on withdrawals
- Full API management: deposit, withdraw, trade via `vaultAddress` parameter

## 4.3 APIbase Vault Strategy

APIbase could create and manage vaults as an **additional revenue stream**:
- Create strategy vaults (e.g., "BTC Momentum", "ETH Mean Reversion")
- AI agents execute trades within vault
- Earn 10% of profits + builder fees on vault trades
- Users deposit via API without leaving APIbase interface

---

# Phase 5: HIP-3 Builder-Deployed Perpetuals (2026)

## 5.1 What Is HIP-3?

**Anyone staking 1 million HYPE (~$30.6M)** can deploy permissionless perpetual markets.

| Metric | Value |
|--------|-------|
| **Daily HIP-3 Volume** | $1.4-1.5 billion |
| **Open Interest** | $790 million |
| **Deployer Fee Share** | 0-300% of base fee |
| **Growth Mode** | 90% protocol fee reduction |

## 5.2 Relevance for APIbase

While the 1M HYPE stake is currently too high for APIbase, the HIP-3 ecosystem creates additional trading markets that APIbase can route orders to via builder codes. More markets = more trading opportunities = more builder fee revenue.

---

# Phase 6: Terms of Service Analysis

## 6.1 ToS Key Clauses

**Source:** [app.hyperliquid.xyz/terms](https://app.hyperliquid.xyz/terms) (Updated January 26, 2025)

### Geographic Restrictions

| Restricted | Jurisdictions |
|------------|---------------|
| **Fully Restricted** | **United States** (all residents, citizens, entities), **Ontario** (Canada) |
| **Sanctioned** | Russia, North Korea, Iran, Cuba, Syria, Russian-occupied Ukraine |
| **Available** | **180+ countries** without KYC |

### KYC Requirements

- **No KYC** for regular trading — fully permissionless
- KYC/KYB only for validator delegation program
- Connect via crypto wallet only

### Commercial Use / API Restrictions

- API trading clearly supported and encouraged (official SDKs, builder codes)
- Builder codes are a formalized mechanism for third-party platform integration
- No explicit prohibition on commercial use or building platforms on top
- **More permissionless than AsterDex** — no application process for builders

### ToS Restriction on Automation

- *"Location masking technologies"* prohibited (Section 3.1.5)
- API trading is explicitly supported (contradicts any anti-bot clause)
- Builder codes exist specifically for third-party platforms

## 6.2 ToS Verdict

| Aspect | Status | Notes |
|--------|--------|-------|
| Commercial use | **CLEARED** | Builder codes = formal platform integration |
| Automated trading | **CLEARED** | Official SDKs, CCXT, builder codes |
| Proxy/intermediary | **CLEARED** | Permissionless, no application |
| Geographic | **RESTRICTED** | US, Ontario, sanctioned countries |
| Fee earning | **CLEARED** | 100% builder fee to builder |
| Vault management | **CLEARED** | API-managed vaults supported |

**Overall: CONDITIONAL** — Fully viable via permissionless Builder Codes. Same geo-restrictions as AsterDex (UC-020). Standard DEX risk profile.

---

# Phase 7: Scoring (12-Parameter Matrix, Max = 245)

| Parameter (×weight) | Score | Weighted | Justification |
|---------------------|-------|----------|---------------|
| Free/Price (×5) | 5 | 25 | Free API, zero gas, 100 USDC minimum only |
| Coverage (×4) | 5 | 20 | 100+ perps, spot, vaults, HIP-3, borrow/lend |
| API Quality (×3) | 5 | 15 | Comprehensive REST+WS, official Python/Rust SDKs, CCXT |
| Affiliate/Revenue (×5) | 5 | 25 | Builder codes (100% to builder!) + referral 10% STACKING |
| Agent Utility (×5) | 5 | 25 | Full trading, vaults, TWAP, market data, lending |
| ToS Compatibility (×5) | 3 | 15 | Permissionless builders, but US/Ontario blocked |
| MCP Ecosystem (×3) | 4 | 12 | 3+ existing MCP servers, active dev ecosystem |
| Unique Features (×4) | 5 | 20 | Own L1, zero gas, 200K ops/sec, vaults, HIP-3 |
| New Pattern Potential (×5) | 4 | 20 | Extends P20 (DEX Builder), adds vault management |
| Cache Potential (×3) | 3 | 9 | Market data cacheable (short TTL), positions real-time |
| Cross-UC Synergy (×4) | 4 | 16 | UC-004, UC-020, UC-016 |
| Market Position (×3) | 5 | 15 | **#1 DEX**, $200B+/mo, HYPE #16, $844M revenue |
| **TOTAL** | | **217** | |

**Score: 217/245** — highest among DEX candidates, higher than AsterDex (207).

---

# Phase 8: MCP Tool Definitions (7 Tools)

## Tool 1: `hyperliquid_market_data`

```json
{
  "name": "hyperliquid_market_data",
  "description": "Get real-time market data from Hyperliquid, the #1 DEX by volume. Returns mid prices, 24h stats, funding rates, open interest for all 100+ perpetual markets and spot tokens. Supports individual or full market queries.",
  "parameters": {
    "type": "object",
    "properties": {
      "symbol": {
        "type": "string",
        "description": "Trading pair (e.g., 'BTC', 'ETH', 'SOL'). Omit for all markets."
      },
      "data_type": {
        "type": "string",
        "enum": ["all_mids", "meta", "funding_rates", "open_interest", "spot_meta"],
        "default": "all_mids"
      }
    }
  },
  "x402_price_usd": 0.002,
  "cache_ttl_seconds": 5,
  "upstream_source": "Hyperliquid L1 API (api.hyperliquid.xyz)"
}
```

## Tool 2: `hyperliquid_order_book`

```json
{
  "name": "hyperliquid_order_book",
  "description": "Get order book depth for a Hyperliquid market. Returns bids and asks up to 20 levels. Zero-gas L1 means full order book is on-chain with sub-second updates.",
  "parameters": {
    "type": "object",
    "properties": {
      "symbol": {
        "type": "string",
        "description": "Market symbol (e.g., 'BTC', 'ETH')"
      },
      "depth": {
        "type": "integer",
        "default": 20,
        "description": "Number of price levels (max 20)"
      }
    },
    "required": ["symbol"]
  },
  "x402_price_usd": 0.003,
  "cache_ttl_seconds": 3,
  "upstream_source": "Hyperliquid L1 API"
}
```

## Tool 3: `hyperliquid_klines`

```json
{
  "name": "hyperliquid_klines",
  "description": "Get candlestick/OHLCV chart data for any Hyperliquid market. Supports intervals from 1 minute to 1 month. Returns open, high, low, close, volume per candle.",
  "parameters": {
    "type": "object",
    "properties": {
      "symbol": {
        "type": "string",
        "description": "Market symbol (e.g., 'BTC')"
      },
      "interval": {
        "type": "string",
        "enum": ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "8h", "12h", "1d", "3d", "1w", "1M"],
        "default": "1h"
      },
      "limit": {
        "type": "integer",
        "default": 100,
        "description": "Number of candles"
      }
    },
    "required": ["symbol"]
  },
  "x402_price_usd": 0.003,
  "cache_ttl_seconds": 15,
  "upstream_source": "Hyperliquid L1 API"
}
```

## Tool 4: `hyperliquid_trade`

```json
{
  "name": "hyperliquid_trade",
  "description": "Place a trade on Hyperliquid (#1 DEX). Supports limit, market, stop/trigger, and TWAP orders across 100+ perpetual markets and spot tokens. Builder code attribution is automatic — all trades earn builder fees for APIbase. Zero gas fees.",
  "parameters": {
    "type": "object",
    "properties": {
      "symbol": {
        "type": "string",
        "description": "Market symbol (e.g., 'BTC', 'ETH', 'SOL')"
      },
      "side": {
        "type": "string",
        "enum": ["buy", "sell"]
      },
      "size": {
        "type": "number",
        "description": "Order size in base asset"
      },
      "order_type": {
        "type": "string",
        "enum": ["market", "limit", "stop_market", "stop_limit", "twap"],
        "default": "market"
      },
      "price": {
        "type": "number",
        "description": "Limit price (required for limit/stop_limit)"
      },
      "trigger_price": {
        "type": "number",
        "description": "Trigger price (for stop orders)"
      },
      "leverage": {
        "type": "integer",
        "description": "Leverage (1-50x for perps)"
      },
      "reduce_only": {
        "type": "boolean",
        "default": false
      },
      "time_in_force": {
        "type": "string",
        "enum": ["GTC", "IOC", "ALO"],
        "default": "GTC"
      },
      "market_type": {
        "type": "string",
        "enum": ["perp", "spot"],
        "default": "perp"
      }
    },
    "required": ["symbol", "side", "size"]
  },
  "x402_price_usd": 0.01,
  "cache_ttl_seconds": 0,
  "upstream_source": "Hyperliquid L1 API (builder code: 0xc98dDC93e5d97Be00306a305F53BE802c6EdeAbB)"
}
```

## Tool 5: `hyperliquid_positions`

```json
{
  "name": "hyperliquid_positions",
  "description": "Get current open positions, margin state, and unrealized PnL on Hyperliquid. Returns entry price, mark price, liquidation price, leverage, funding payments, and margin details for all open positions.",
  "parameters": {
    "type": "object",
    "properties": {
      "address": {
        "type": "string",
        "description": "Wallet address to query (user's main or API wallet)"
      },
      "include_spot": {
        "type": "boolean",
        "default": false,
        "description": "Include spot token balances"
      }
    },
    "required": ["address"]
  },
  "x402_price_usd": 0.005,
  "cache_ttl_seconds": 5,
  "upstream_source": "Hyperliquid L1 API (authenticated)"
}
```

## Tool 6: `hyperliquid_account`

```json
{
  "name": "hyperliquid_account",
  "description": "Get Hyperliquid account information: balances, portfolio value, PnL history, trade fills, fee schedule, and open orders. Also returns referral stats and builder code status.",
  "parameters": {
    "type": "object",
    "properties": {
      "address": {
        "type": "string",
        "description": "Wallet address"
      },
      "info_type": {
        "type": "string",
        "enum": ["portfolio", "fills", "orders", "fees", "referral", "rate_limit"],
        "default": "portfolio"
      },
      "limit": {
        "type": "integer",
        "default": 50,
        "description": "Number of records (for fills/orders)"
      }
    },
    "required": ["address"]
  },
  "x402_price_usd": 0.005,
  "cache_ttl_seconds": 10,
  "upstream_source": "Hyperliquid L1 API (authenticated)"
}
```

## Tool 7: `hyperliquid_vault`

```json
{
  "name": "hyperliquid_vault",
  "description": "Interact with Hyperliquid Vaults — managed trading accounts. View vault details, performance, depositor equity, APR history. Also supports deposit/withdraw operations for vaults.",
  "parameters": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["details", "list_vaults", "user_equity", "deposit", "withdraw"],
        "default": "details"
      },
      "vault_address": {
        "type": "string",
        "description": "Vault address (required for details/deposit/withdraw)"
      },
      "amount": {
        "type": "number",
        "description": "USDC amount (for deposit/withdraw)"
      }
    }
  },
  "x402_price_usd": 0.005,
  "cache_ttl_seconds": 60,
  "upstream_source": "Hyperliquid L1 API"
}
```

---

# Phase 9: AI Instructions for Agents

```yaml
api_name: "APIbase Hyperliquid Trading"
version: "1.0"
base_url: "https://api.apibase.pro/v1/hyperliquid"
auth: "x402 USDC micropayment per call"

instructions: |
  You have access to 7 Hyperliquid tools for the #1 DEX by volume.
  Hyperliquid operates on its own L1 with zero gas fees and sub-second finality.

  MARKET DATA (public, no wallet needed):
  - hyperliquid_market_data: Prices, funding rates, open interest (100+ markets)
  - hyperliquid_order_book: Order book depth (up to 20 levels)
  - hyperliquid_klines: OHLCV chart data (1m to 1M intervals)

  TRADING (requires user's wallet authorization):
  - hyperliquid_trade: Place orders (market, limit, stop, TWAP) with builder attribution
  - hyperliquid_positions: Open positions, PnL, liquidation prices
  - hyperliquid_account: Balances, fills, fees, portfolio history

  VAULTS:
  - hyperliquid_vault: View vault details, performance, deposit/withdraw

  CRITICAL: TRADING WARNINGS
  1. Perpetual futures are HIGH RISK. Always warn about leverage risk.
  2. Max leverage is 50x — smaller than AsterDex but still very dangerous.
  3. NEVER place orders without explicit user confirmation.
  4. ALWAYS show estimated liquidation price before confirming.
  5. Zero gas fees mean orders execute instantly — no "cancel window".

  GEOGRAPHIC RESTRICTIONS:
  - Hyperliquid is NOT available in: USA, Ontario (Canada), and sanctioned countries.
  - If user location suggests a restricted jurisdiction, inform them and refuse trading.

  HYPERLIQUID vs ASTERDEX (UC-020):
  - Hyperliquid: #1 DEX, 10x more volume, own L1, zero gas
  - AsterDex: #2 DEX, BNB Chain, up to 1001x leverage
  - Both have builder codes — let user choose based on preference
  - For maximum liquidity: recommend Hyperliquid
  - For extreme leverage: mention AsterDex (with strong warnings)

  USAGE PATTERNS:
  1. "What's BTC on Hyperliquid?" → hyperliquid_market_data(symbol="BTC")
  2. "Show me SOL 4h chart" → hyperliquid_klines(symbol="SOL", interval="4h")
  3. "Long ETH 10x" → market_data → order_book → confirm → hyperliquid_trade
  4. "Check my positions" → hyperliquid_positions
  5. "What vaults are available?" → hyperliquid_vault(action="list_vaults")
  6. "Deposit into HLP vault" → hyperliquid_vault(action="deposit")

  CROSS-UC ENRICHMENT:
  - UC-004 (CoinGecko): broader market context
  - UC-006 (News): trading-relevant news
  - UC-016 (Finance): macro indicators
  - UC-020 (AsterDex): alternative DEX for comparison
```

---

# Phase 10: Revenue Model

## 10.1 Revenue Streams

### Stream 1: Builder Code Revenue (PRIMARY)

| Metric | Phase 1 (Mo 1-6) | Phase 2 (Mo 7-12) | Phase 3 (Mo 13-24) |
|--------|-------------------|--------------------|--------------------|
| Monthly Volume via APIbase | $1M | $20M | $200M |
| Builder Fee Rate | 5 bps (0.05%) | 5 bps | 4 bps (0.04%) |
| **Builder Revenue** | **$500** | **$10,000** | **$80,000** |

**Context:** PVP.Trade earns $7.2M from builder codes. Phantom Wallet earns ~$100K/day. These demonstrate the revenue ceiling is very high.

### Stream 2: Referral Revenue (`CRYPTOREFERENCE`)

| Metric | Phase 1 | Phase 2 | Phase 3 |
|--------|---------|---------|---------|
| Referred Users (cumulative) | 100 | 1,000 | 10,000 |
| Avg Monthly Volume/User | $50K | $50K | $50K |
| Referral % | 10% of fees | 10% | 10% |
| Base Fee (0.035% avg) | 0.035% | 0.035% | 0.035% |
| **Referral Revenue** | **$175** | **$1,750** | **$17,500** |

### Stream 3: x402 Micropayments

| Tool | x402 Price | Calls/Mo (P1) | Calls/Mo (P3) | Rev/Mo (P1) | Rev/Mo (P3) |
|------|-----------|---------------|---------------|-------------|-------------|
| hyperliquid_market_data | $0.002 | 30,000 | 1,000,000 | $60 | $2,000 |
| hyperliquid_order_book | $0.003 | 10,000 | 200,000 | $30 | $600 |
| hyperliquid_klines | $0.003 | 15,000 | 300,000 | $45 | $900 |
| hyperliquid_trade | $0.01 | 3,000 | 100,000 | $30 | $1,000 |
| hyperliquid_positions | $0.005 | 8,000 | 200,000 | $40 | $1,000 |
| hyperliquid_account | $0.005 | 5,000 | 100,000 | $25 | $500 |
| hyperliquid_vault | $0.005 | 2,000 | 50,000 | $10 | $250 |
| **Totals** | | **73,000** | **1,950,000** | **$240** | **$6,250** |

### Stream 4: Vault Leader Profits (Phase 2+)

| Metric | Phase 2 | Phase 3 |
|--------|---------|---------|
| APIbase-Managed Vault TVL | $100K | $1M |
| Avg Monthly Return | 5% | 5% |
| Leader Share (10% of profits) | $500 | $5,000 |

### Stream 5: Cross-UC Enrichment

| Integration | Rev/Mo (P1) | Rev/Mo (P3) |
|-------------|-------------|-------------|
| UC-004 CoinGecko context | $30 | $800 |
| UC-006 News trading signals | $20 | $500 |
| UC-020 AsterDex arbitrage | $10 | $300 |
| UC-016 Finance macro | $10 | $200 |
| **Total Cross-UC** | **$70** | **$1,800** |

## 10.2 Phase Projections

| Metric | Phase 1 (Mo 1-6) | Phase 2 (Mo 7-12) | Phase 3 (Mo 13-24) |
|--------|-------------------|--------------------|--------------------|
| Builder Code Revenue | $500 | $10,000 | $80,000 |
| Referral Revenue | $175 | $1,750 | $17,500 |
| x402 API Revenue | $240 | $2,000 | $6,250 |
| Vault Leader Profits | $0 | $500 | $5,000 |
| Cross-UC Revenue | $70 | $500 | $1,800 |
| **Total Monthly Revenue** | **$985** | **$14,750** | **$110,550** |
| Upstream Cost | ~$0 | ~$0 | ~$0 |
| **Margin %** | **~100%** | **~100%** | **~100%** |
| **Break-Even** | **Month 1** | | |

**KEY INSIGHT:** Hyperliquid has the **highest revenue potential of any UC** at Phase 3 ($110K/mo), driven by builder code revenue on the #1 DEX by volume. Compare: UC-013 Real Estate peaks at $58.5K, UC-015 Jobs at $30.5K. Hyperliquid's $200B+/mo volume creates a massive revenue ceiling.

---

# Phase 11: Cross-UC Synergy

```
              UC-021 Hyperliquid (#1 DEX)
                        │
         ┌──────────────┼──────────────────┐
         │              │                  │
  ┌──────▼──────┐ ┌─────▼──────┐ ┌─────────▼────────┐
  │  UC-004     │ │  UC-020    │ │    UC-016         │
  │  CoinGecko  │ │  AsterDex  │ │    Finance        │
  │             │ │            │ │                   │
  │ Market data │ │ Cross-DEX  │ │ Macro indicators  │
  │ enrichment  │ │ arbitrage  │ │ for trading       │
  │ + trending  │ │ + compare  │ │ decisions         │
  └─────────────┘ └────────────┘ └───────────────────┘
         │              │                  │
  ┌──────▼──────┐ ┌─────▼──────┐
  │  UC-006     │ │  UC-001    │
  │  News       │ │  Polymarket│
  │             │ │            │
  │ Breaking    │ │ Prediction │
  │ crypto news │ │ markets    │
  │ → signals   │ │ context    │
  └─────────────┘ └────────────┘
```

### Cross-DEX Arbitrage (UC-020 + UC-021)

APIbase uniquely has BOTH AsterDex and Hyperliquid integrated. This enables:
- **Price comparison** between DEXes for the same asset
- **Arbitrage detection** — funding rate differences, price discrepancies
- **Routing optimization** — send trade to DEX with better price/liquidity
- Agent scenario: *"Where's BTC cheaper, Hyperliquid or AsterDex?"*

---

# Phase 12: Risk Analysis

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **US restriction** | Revenue ceiling | High | Geo-fence, focus on 180+ available countries |
| **Volume concentration** | If Hyperliquid volume drops | Low | Diversified with AsterDex (UC-020) |
| **Builder fee race to bottom** | Competitors undercut fees | Medium | Focus on value-add (cross-UC, vault management, AI intelligence) |
| **User approval friction** | Main wallet signature required for builder fee | Medium | Smooth onboarding UX, one-time approval |
| **Agent trading liability** | AI executing trades → user losses | High | Mandatory confirmation, conservative defaults, position limits |
| **Regulatory risk** | DEX regulation changes | Medium | Non-custodial = lower regulatory exposure |
| **L1 risk** | Hyperliquid L1 outage/exploit | Low | Sub-second finality, HyperBFT proven in production |

---

# Phase 13: Pattern P20 Extension — Dual DEX Strategy

UC-021 extends Pattern P20 (DEX Builder/Broker Integration) from UC-020:

### P20 Extension: Multi-DEX Builder Strategy

With both AsterDex (UC-020) and Hyperliquid (UC-021), APIbase becomes a **multi-DEX trading layer**:

1. **Cross-DEX routing** — send order to DEX with best price/liquidity
2. **Funding rate arbitrage** — different rates on different DEXes
3. **Risk diversification** — if one DEX has issues, route to the other
4. **Feature complementarity** — Hyperliquid for volume/liquidity, AsterDex for 1001x leverage
5. **Combined builder revenue** — earn builder fees on both platforms

### Revenue Formula (Dual DEX)

```
Total Revenue = Σ(builder_fees_per_DEX × volume_per_DEX)
              + Σ(referral_commission × referred_user_fees)
              + (x402_micropayments × API_calls)
              + (vault_profits × leader_share)
              + (cross_DEX_arbitrage × arb_volume)
```

---

# Executive Summary

UC-021 (Hyperliquid / #1 DEX by Volume) is **the highest-revenue-potential UC in the entire portfolio**.

1. **Builder Codes** — permissionless, on-chain, 100% fee to builder. No application needed. $40M+ ecosystem revenue proves the model.
2. **Referral stacking** — `CRYPTOREFERENCE` earns 10% of user fees, STACKS with builder codes.
3. **#1 DEX** — $200-260B/mo volume, $4.32B TVL, $844M 2025 revenue. 10x larger than AsterDex.
4. **$0 upstream cost** — zero gas L1, free API, 100 USDC minimum.
5. **Vault management** — additional 10% profit share revenue stream.
6. **Revenue:** $985/mo (Phase 1) → **$110,550/mo (Phase 3)** at ~100% margin.
7. **Score: 217/245** — highest DEX score (AsterDex: 207).

**Correction:** UC-020 incorrectly stated Hyperliquid has "No formal broker API." This was wrong. Hyperliquid's Builder Codes are **more powerful** than AsterDex's Aster Code: permissionless, 100% fee to builder, and on the #1 DEX by volume.

**Critical path:** Fund API wallet (`0xc98dDC93e5d97Be00306a305F53BE802c6EdeAbB`) with 100+ USDC on Hyperliquid perps. Test builder code flow on testnet. Implement `ApproveBuilderFee` in user onboarding.

---

## Sources

- [Hyperliquid API Documentation](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api)
- [Builder Codes Documentation](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes)
- [Referrals Documentation](https://hyperliquid.gitbook.io/hyperliquid-docs/referrals)
- [Fees Documentation](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees)
- [Rate Limits](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits)
- [Exchange Endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)
- [Info Endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)
- [Vaults](https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/vaults)
- [HIP-1 Native Token Standard](https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-1-native-token-standard)
- [HIP-3 Builder-Deployed Perpetuals](https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-3-builder-deployed-perpetuals)
- [Python SDK](https://pypi.org/project/hyperliquid-python-sdk/)
- [Python SDK Builder Fee Example](https://github.com/hyperliquid-dex/hyperliquid-python-sdk/blob/master/examples/basic_builder_fee.py)
- [Builder Codes Revenue Analysis (Dwellir)](https://www.dwellir.com/blog/hyperliquid-builder-codes)
- [Builder Revenue Dashboard (Allium)](https://hyperliquid.allium.so/builder-revenue)
- [Builder Code Revenue $10M+ (Phemex)](https://phemex.com/news/article/hyperliquid-builder-code-revenue-surpasses-10-million-milestone_12325)
- [Terms of Service](https://app.hyperliquid.xyz/terms)
- [Hyperliquid $844M Revenue (BlockEden)](https://blockeden.xyz/blog/2026/01/10/hyperliquid-revenue-dominance-onchain-trading-solana/)
- [HYPE Token (CoinGecko)](https://www.coingecko.com/en/coins/hyperliquid)
- [Hyperliquid TVL (DefiLlama)](https://defillama.com/protocol/hyperliquid)
- [Hyperliquid MCP Server](https://github.com/edkdev/hyperliquid-mcp)
- [Aster vs Hyperliquid (Coin Bureau)](https://coinbureau.com/analysis/aster-vs-hyperliquid)
