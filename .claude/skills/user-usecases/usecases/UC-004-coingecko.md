# UC-004: CoinGecko

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-004 |
| **Provider** | CoinGecko (coingecko.com) |
| **Category** | Finance / Crypto Market Data |
| **Date Added** | 2026-03-07 |
| **Status** | Reference |
| **Client** | APIbase (platform-level integration) |

---

## 1. Client Input Data

Интеграция на уровне платформы — APIbase подключает CoinGecko как upstream-провайдер:

```
Тип данных:          Значение:
──────────────────────────────────────────────────────────
CoinGecko API Key    Demo key (бесплатный, для базового доступа)
CoinGecko Pro Key    Pro/Analyst key (для расширенных лимитов)
x402 Wallet          USDC wallet на Base/Solana (для pay-per-call)
```

### Sufficiency Assessment

| Data provided | What it enables | Sufficient? |
|---------------|----------------|-------------|
| Demo API Key (free) | 30 req/min, 10,000 req/month. Basic market data: prices, market cap, trending, history. | **Yes** — для MVP и небольшой нагрузки |
| Pro API Key ($129+/mo) | 500 req/min, 500K+ req/month. Full dataset: DEX data, OHLCV, NFTs, derivatives. | **Yes** — для production нагрузки |
| x402 USDC Wallet | Pay-per-call $0.01/req без лимитов и подписки. Оплата на Base или Solana. | **Yes** — для burst-нагрузок и автономных агентов |

**Verdict:** CoinGecko предлагает **три модели доступа**: бесплатный ключ (MVP), платный план (production), x402 pay-per-call (автономные агенты). APIbase использует **гибридную стратегию**: основной трафик через Pro ключ, burst/overflow через x402.

---

## 2. Provider API Analysis

### API Architecture

CoinGecko — крупнейший агрегатор криптовалютных данных: 14,000+ монет, 1,100+ бирж, 90+ блокчейнов.

| Service | Base URL | Auth | Description |
|---------|----------|------|-------------|
| **CoinGecko API v3** | `https://api.coingecko.com/api/v3` | API Key (header) | Market data, prices, coins, exchanges |
| **CoinGecko Pro API** | `https://pro-api.coingecko.com/api/v3` | Pro API Key (header) | Extended limits + premium endpoints |
| **GeckoTerminal API** | `https://api.geckoterminal.com/api/v2` | No auth (free) | On-chain DEX data: pools, trades, OHLCV |
| **x402 Endpoints** | `https://x402.coingecko.com/api/v3` | x402 USDC payment | Pay-per-call, no key required |

### Key Endpoints

#### Simple — Prices (No Auth / API Key)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/simple/price` | GET | Current price for multiple coins in multiple currencies |
| `/simple/token_price/{platform}` | GET | Token price by contract address |
| `/simple/supported_vs_currencies` | GET | List of supported fiat/crypto currencies |

#### Coins — Market Data

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/coins/list` | GET | Full list of coins (14,000+ items) |
| `/coins/markets` | GET | Top coins with market cap, volume, price change |
| `/coins/{id}` | GET | Detailed coin data: description, links, community |
| `/coins/{id}/market_chart` | GET | Historical price, market cap, volume (time series) |
| `/coins/{id}/market_chart/range` | GET | Historical data for custom date range |
| `/coins/{id}/ohlc` | GET | OHLCV candlestick data (1/7/14/30/90/180/365 days) |
| `/coins/{id}/tickers` | GET | Exchange tickers (CEX + DEX) |

#### Discovery & Trending

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/search/trending` | GET | Top-7 trending coins (last 24h search volume) |
| `/search` | GET | Search coins, exchanges, categories by query |
| `/coins/categories` | GET | Category list with market data (DeFi, Gaming, AI, etc.) |
| `/coins/categories/list` | GET | Simple category list |

#### Global Market

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/global` | GET | Total market cap, BTC dominance, active coins count |
| `/global/decentralized_finance_defi` | GET | DeFi market overview |

#### Exchanges

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/exchanges` | GET | Top exchanges by trust score and volume |
| `/exchanges/{id}` | GET | Exchange details |
| `/exchanges/{id}/tickers` | GET | Exchange trading pairs |

#### NFTs (Pro Only)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/nfts/list` | GET | Supported NFT collections |
| `/nfts/{id}` | GET | NFT collection data: floor price, volume, market cap |
| `/nfts/{id}/market_chart` | GET | NFT collection price history |

#### GeckoTerminal — On-chain DEX Data (Free, No Auth)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/networks` | GET | Supported blockchain networks (90+) |
| `/networks/{network}/dexes` | GET | DEXes on a network |
| `/networks/{network}/pools` | GET | Top pools on a network |
| `/networks/{network}/pools/{address}` | GET | Specific pool data |
| `/networks/{network}/tokens/{address}` | GET | On-chain token data |
| `/networks/{network}/tokens/{address}/pools` | GET | Pools containing a token |
| `/networks/{network}/pools/{address}/ohlcv/{timeframe}` | GET | DEX pool OHLCV candles |
| `/search/pools` | GET | Search pools across all networks |

### Authentication Model

**Три уровня доступа:**

```
1. Demo (Free):
   Header: x-cg-demo-api-key: YOUR_KEY
   Limits: 30 req/min, 10,000 req/month
   Endpoints: ~30 основных (prices, markets, charts, trending)

2. Pro/Analyst ($129+/mo):
   Header: x-cg-pro-api-key: YOUR_KEY
   Limits: 500+ req/min, 500K+ req/month
   Endpoints: All (~70+), включая NFTs, derivatives, OHLCV

3. x402 Pay-Per-Call:
   Payment: $0.01 USDC per request (Base or Solana)
   Limits: No rate limits, no subscription
   Endpoints: Selected high-value endpoints
   Auth: x402 payment header (no API key needed)
```

### Rate Limits

| Plan | Rate Limit | Monthly Calls | Cost |
|------|-----------|---------------|------|
| Demo (Free) | 30 req/min | 10,000 | $0 |
| Analyst | 500 req/min | 500,000 | $129/mo |
| Lite | 500 req/min | 2,000,000 | $499/mo |
| Pro | 1,000 req/min | Custom | ~$999/mo |
| Enterprise | Custom | Custom | Custom |
| x402 | No limit | No limit | $0.01/req |

### Official SDKs & Integrations

- Python: `pycoingecko` (community)
- Node.js: `coingecko-api` (community)
- Official: REST API only (no official SDK)
- MCP: No official MCP server (opportunity for APIbase!)
- x402: Via Coinbase CDP Facilitator
- Docs: `docs.coingecko.com`

---

## 3. APIbase Wrapper Design

### Level 1: Protocol Adapter

```
What the adapter does:
──────────────────────────────────────────────────────────────
• Unifies 4 CoinGecko services → single APIbase endpoint
  apibase.pro/api/v1/coingecko/...

• Intelligent upstream routing:
  /coingecko/prices       → api.coingecko.com (Pro Key)
  /coingecko/trending     → api.coingecko.com (Pro Key)
  /coingecko/dex/pools    → api.geckoterminal.com (free, no key)
  /coingecko/nfts         → pro-api.coingecko.com (Pro Key)

• x402 overflow strategy:
  - Primary: Pro API Key (500 req/min baseline)
  - Overflow: x402 endpoints when Pro rate limit approached
  - Cost optimization: cache hits avoid both Pro quota and x402 costs

• Caching strategy:
  - Coin list: 24h TTL (changes rarely)
  - Market prices: 30 sec TTL (CoinGecko updates every 30-60 sec)
  - Market chart (1d+): 5 min TTL
  - Trending: 5 min TTL
  - OHLCV: 5 min TTL
  - Categories: 1h TTL
  - Global stats: 60 sec TTL
  - DEX pool data: 15 sec TTL (fast-changing on-chain)

• Rate limit management:
  - Per-agent quota (fraction of Pro plan limits)
  - Smart batching: combine multiple /simple/price calls
  - Request deduplication: same coin/timeframe within TTL → cache
  - 429 handling: failover Pro → x402 → queue

• Error normalization:
  CoinGecko errors → APIbase standard format
  {"error": "coingecko_rate_limited", "retry_after": 30}
  {"error": "coingecko_coin_not_found", "message": "..."}
```

### Level 2: Semantic Normalizer

**Domain model: `crypto-market-data`**

```json
// === CoinGecko original (coins/markets response) ===
{
  "id": "bitcoin",
  "symbol": "btc",
  "name": "Bitcoin",
  "image": "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
  "current_price": 97500.00,
  "market_cap": 1932000000000,
  "market_cap_rank": 1,
  "fully_diluted_valuation": 2047500000000,
  "total_volume": 45200000000,
  "high_24h": 98200.00,
  "low_24h": 96100.00,
  "price_change_24h": 1400.00,
  "price_change_percentage_24h": 1.45,
  "circulating_supply": 19820000,
  "total_supply": 21000000,
  "ath": 108000.00,
  "ath_date": "2025-12-17T14:30:00.000Z",
  "atl": 67.81,
  "sparkline_in_7d": {"price": [95000, 95500, ...]},
  "last_updated": "2026-03-07T14:30:00.000Z"
}

// === APIbase normalized (crypto-market-data schema) ===
{
  "provider": "coingecko",
  "provider_id": "bitcoin",
  "asset_id": "apibase_cg_bitcoin",
  "symbol": "BTC",
  "name": "Bitcoin",
  "type": "cryptocurrency",
  "price_usd": 97500.00,
  "market_cap_usd": 1932000000000,
  "rank": 1,
  "volume_24h_usd": 45200000000,
  "price_change": {
    "1h": null,
    "24h_pct": 1.45,
    "24h_usd": 1400.00,
    "7d_pct": null
  },
  "range_24h": {
    "high": 98200.00,
    "low": 96100.00
  },
  "supply": {
    "circulating": 19820000,
    "total": 21000000,
    "max": 21000000
  },
  "ath": {
    "price_usd": 108000.00,
    "date": "2025-12-17T14:30:00.000Z"
  },
  "sparkline_7d": [95000, 95500, ...],
  "logo_url": "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
  "last_updated": "2026-03-07T14:30:00Z"
}
```

**Domain model: `dex-pool` (GeckoTerminal)**

```json
// === GeckoTerminal original ===
{
  "id": "eth_0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
  "type": "pool",
  "attributes": {
    "name": "USDC / WETH",
    "base_token_price_usd": "3450.12",
    "quote_token_price_usd": "1.00",
    "fdv_usd": "415000000000",
    "reserve_in_usd": "245000000",
    "pool_created_at": "2021-05-05T...",
    "price_change_percentage": {"h1": "0.5", "h24": "2.1"},
    "transactions": {"h1": {"buys": 120, "sells": 95}},
    "volume_usd": {"h1": "5400000", "h24": "89000000"}
  }
}

// === APIbase normalized (dex-pool schema) ===
{
  "provider": "coingecko_terminal",
  "pool_id": "apibase_gt_eth_0x88e6...",
  "network": "ethereum",
  "dex": "uniswap_v3",
  "pair": "USDC/WETH",
  "base_token": {"symbol": "WETH", "price_usd": 3450.12},
  "quote_token": {"symbol": "USDC", "price_usd": 1.00},
  "liquidity_usd": 245000000,
  "volume_24h_usd": 89000000,
  "price_change_24h_pct": 2.1,
  "transactions_24h": {"buys": 2880, "sells": 2280},
  "created_at": "2021-05-05T...",
  "last_updated": "2026-03-07T14:30:00Z"
}
```

### Level 3: x402 Payment Bridge

```
Уникальная модель: APIbase как x402 ↔ x402 мост
──────────────────────────────────────────────────────────────

CoinGecko — один из первых провайдеров с нативной x402-поддержкой.
APIbase выстраивает двустороннюю x402 модель:

Downstream (Agent → APIbase):
  Agent платит APIbase через x402: $0.002/req (read), $0.005/req (heavy)

Upstream (APIbase → CoinGecko):
  Основной путь: Pro API Key (предоплаченный план, ~$0.0003/req)
  Overflow путь: CoinGecko x402 ($0.01/req USDC на Base)

Маржа APIbase:
  Pro Key path:  $0.002 − $0.0003 = $0.0017 маржа (85%)
  x402 path:     $0.005 − $0.01   = −$0.005 (убыточно!)

  → Стратегия: максимизировать Pro Key трафик (85% маржа),
    использовать x402 overflow только как гарантию SLA,
    повышать цену для x402 burst: $0.015/req

Key rotation:
  - Pro Key #1 — primary (500 req/min)
  - Demo Key — fallback для некритичных запросов
  - x402 wallet — overflow при пиковых нагрузках
```

---

## 4. MCP Tool Definitions

### Tool: crypto-price

```json
{
  "name": "crypto-price",
  "description": "Get current price for one or more cryptocurrencies. Supports 14,000+ coins. Returns price in USD and optionally in other currencies (EUR, BTC, ETH). Includes 24h change, volume, and market cap.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "coins": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Coin IDs or symbols, e.g. ['bitcoin', 'ethereum', 'solana'] or ['BTC', 'ETH', 'SOL']",
        "maxItems": 50
      },
      "vs_currencies": {
        "type": "array",
        "items": {"type": "string"},
        "default": ["usd"],
        "description": "Currencies to show price in, e.g. ['usd', 'eur', 'btc']"
      },
      "include_24h_change": {
        "type": "boolean",
        "default": true,
        "description": "Include 24h price change percentage"
      },
      "include_market_cap": {
        "type": "boolean",
        "default": false,
        "description": "Include market capitalization"
      },
      "include_volume": {
        "type": "boolean",
        "default": false,
        "description": "Include 24h trading volume"
      }
    },
    "required": ["coins"]
  }
}
```

### Tool: crypto-market-overview

```json
{
  "name": "crypto-market-overview",
  "description": "Get top cryptocurrencies ranked by market cap. Returns comprehensive market data: price, volume, market cap, supply, price changes, sparkline. Perfect for market dashboards and portfolio analysis.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "category": {
        "type": "string",
        "description": "Filter by category: 'defi', 'layer-1', 'layer-2', 'gaming', 'ai', 'meme', 'stablecoins', etc. Omit for all.",
        "enum": ["defi", "layer-1", "layer-2", "gaming", "ai-big-data", "meme-token", "stablecoins", "nft", "exchange-based-tokens", "real-world-assets"]
      },
      "sort_by": {
        "type": "string",
        "enum": ["market_cap_desc", "market_cap_asc", "volume_desc", "price_desc", "price_change_24h_desc"],
        "default": "market_cap_desc",
        "description": "Sort order"
      },
      "limit": {
        "type": "integer",
        "default": 20,
        "maximum": 250,
        "description": "Number of results"
      },
      "include_sparkline": {
        "type": "boolean",
        "default": false,
        "description": "Include 7-day sparkline price data"
      }
    },
    "required": []
  }
}
```

### Tool: crypto-coin-detail

```json
{
  "name": "crypto-coin-detail",
  "description": "Get comprehensive details about a specific cryptocurrency: description, links, developer activity, community stats, market data. Useful for deep research on a coin.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "coin_id": {
        "type": "string",
        "description": "Coin ID from crypto-price or crypto-market-overview results, e.g. 'bitcoin', 'ethereum'"
      },
      "include_description": {
        "type": "boolean",
        "default": true,
        "description": "Include project description and links"
      },
      "include_developer": {
        "type": "boolean",
        "default": false,
        "description": "Include developer activity (GitHub stats)"
      },
      "include_community": {
        "type": "boolean",
        "default": false,
        "description": "Include community stats (Twitter, Reddit, Telegram)"
      }
    },
    "required": ["coin_id"]
  }
}
```

### Tool: crypto-price-history

```json
{
  "name": "crypto-price-history",
  "description": "Get historical price, market cap, and volume data for a cryptocurrency. Returns time-series data for charting and trend analysis. Supports OHLCV candlestick format.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "coin_id": {
        "type": "string",
        "description": "Coin ID, e.g. 'bitcoin'"
      },
      "days": {
        "type": "integer",
        "default": 30,
        "maximum": 365,
        "description": "Number of days of history (1, 7, 14, 30, 90, 180, 365, max)"
      },
      "interval": {
        "type": "string",
        "enum": ["5m", "hourly", "daily"],
        "default": "daily",
        "description": "Data interval. 5m available for 1 day, hourly for 1-90 days."
      },
      "format": {
        "type": "string",
        "enum": ["timeseries", "ohlcv"],
        "default": "timeseries",
        "description": "Response format: timeseries (price points) or ohlcv (candlesticks)"
      }
    },
    "required": ["coin_id"]
  }
}
```

### Tool: crypto-trending

```json
{
  "name": "crypto-trending",
  "description": "Get trending cryptocurrencies — most searched coins in the last 24 hours on CoinGecko. Great for discovering momentum plays, new narratives, and market sentiment shifts.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "include_nfts": {
        "type": "boolean",
        "default": false,
        "description": "Also include trending NFT collections"
      },
      "include_categories": {
        "type": "boolean",
        "default": false,
        "description": "Also include trending categories (e.g. AI, DeFi, Memes)"
      }
    },
    "required": []
  }
}
```

### Tool: crypto-global

```json
{
  "name": "crypto-global",
  "description": "Get global cryptocurrency market statistics: total market cap, total volume, BTC/ETH dominance, number of active coins, DeFi market cap, and market cap change 24h.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "include_defi": {
        "type": "boolean",
        "default": false,
        "description": "Include DeFi-specific global stats"
      }
    },
    "required": []
  }
}
```

### Tool: crypto-dex-pools

```json
{
  "name": "crypto-dex-pools",
  "description": "Search and analyze DEX liquidity pools across 90+ blockchains. Get pool liquidity, volume, price, and trading activity. Powered by GeckoTerminal on-chain data.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search query: token symbol, pair name, or contract address"
      },
      "network": {
        "type": "string",
        "description": "Filter by blockchain: 'ethereum', 'bsc', 'polygon', 'arbitrum', 'solana', 'base', 'avalanche', etc.",
        "enum": ["ethereum", "bsc", "polygon", "arbitrum", "solana", "base", "avalanche", "optimism"]
      },
      "sort_by": {
        "type": "string",
        "enum": ["volume_24h", "liquidity", "price_change_24h", "transactions_24h"],
        "default": "volume_24h"
      },
      "limit": {
        "type": "integer",
        "default": 10,
        "maximum": 50
      }
    },
    "required": []
  }
}
```

### Tool: crypto-token-by-address

```json
{
  "name": "crypto-token-by-address",
  "description": "Look up a token by its smart contract address on any supported blockchain. Useful for identifying unknown tokens, checking prices of new or low-cap tokens not yet listed by name.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "contract_address": {
        "type": "string",
        "description": "Token contract address, e.g. '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' for USDC on Ethereum"
      },
      "network": {
        "type": "string",
        "default": "ethereum",
        "description": "Blockchain network the token is deployed on",
        "enum": ["ethereum", "bsc", "polygon", "arbitrum", "solana", "base", "avalanche", "optimism"]
      }
    },
    "required": ["contract_address"]
  }
}
```

### Tool: crypto-search

```json
{
  "name": "crypto-search",
  "description": "Search across all cryptocurrencies, exchanges, and categories. Fuzzy matching on names and symbols. Use this to find the correct coin ID before calling other tools.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search query: coin name, symbol, or keyword. E.g. 'solana', 'SOL', 'artificial intelligence'"
      }
    },
    "required": ["query"]
  }
}
```

---

## 5. AI Instructions

```markdown
# CoinGecko Crypto Market Data via APIbase — AI Agent Instructions

## When to Use
- User asks about cryptocurrency prices ("What's the price of Bitcoin?")
- User wants market overview ("Top 10 coins by market cap")
- User asks about trends ("What's trending in crypto?")
- User needs historical data ("Bitcoin price last 30 days")
- User researches a specific coin ("Tell me about Solana")
- User asks about DeFi/DEX data ("Top Uniswap pools")
- User needs global market stats ("Total crypto market cap")
- User provides a contract address and wants to identify a token

## Key Concepts
- Market Cap = Price × Circulating Supply (primary ranking metric)
- BTC Dominance = Bitcoin's share of total market cap (macro indicator)
- 24h Volume = trading activity (high = liquid, low = risky)
- ATH = All-Time High (how far from peak)
- Trending = most searched on CoinGecko (early momentum signal)
- DEX pools = on-chain liquidity (GeckoTerminal data)

## Recommended Call Chains

### "What's the price of X?"
1. `crypto-price` (coins=["X"]) → instant answer
   If coin not found: `crypto-search` (query="X") → get ID → retry

### "Top coins / Market overview"
1. `crypto-market-overview` (limit=10, sort_by="market_cap_desc")
2. Optionally add `crypto-global` for macro context

### "What's trending in crypto?"
1. `crypto-trending` (include_categories=true)
2. For deeper analysis: `crypto-price` on top trending coins

### "Research coin X"
1. `crypto-search` (query="X") → find coin ID
2. `crypto-coin-detail` (coin_id, include_developer=true, include_community=true)
3. `crypto-price-history` (coin_id, days=90) → trend analysis
4. Synthesize: description + market data + trend

### "Analyze DeFi / DEX activity"
1. `crypto-dex-pools` (network="ethereum", sort_by="volume_24h")
2. For specific pair: `crypto-dex-pools` (query="WETH/USDC")

### "What's this token at 0x...?"
1. `crypto-token-by-address` (contract_address, network)
2. If found: `crypto-coin-detail` for full data

### "Is the market bullish or bearish?"
1. `crypto-global` → total market cap trend, BTC dominance
2. `crypto-market-overview` (limit=20) → check price_change_24h
3. `crypto-trending` → what narratives are hot
4. Synthesize with context

## Response Formatting
- Always show prices with proper formatting: "$97,500" not "97500"
- Show percentage changes with color context: "↑ +5.2%" or "↓ −3.1%"
- Include market cap rank for context: "Bitcoin (#1)"
- For large numbers use abbreviations: "$1.93T" not "$1,932,000,000,000"
- Note data freshness: CoinGecko updates every 30-60 seconds
- For unknown/micro-cap tokens: warn about low liquidity and high risk
- Always caveat: "Cryptocurrency data is for informational purposes only, not financial advice"

## Limitations
- CoinGecko data has 30-60 second delay (not real-time)
- Free tier: 30 req/min, 10K/month (may hit limits under heavy use)
- Some endpoints (NFTs, derivatives) require Pro plan
- OHLCV data granularity depends on timeframe
- Trending list is search-based (not price/volume based)
- DEX data (GeckoTerminal) may miss very new or small pools
- Token prices can be manipulated in low-liquidity markets

## Pricing via APIbase
- Read operations (prices, markets, trending): $0.002/req via x402
- Heavy operations (history, OHLCV, coin detail): $0.005/req via x402
- DEX pool data: $0.003/req via x402
- Bulk price queries (50+ coins): $0.01/req via x402
- Free tier: 500 req/month (basic prices only)
```

---

## 6. Publication

### APIbase.pro Catalog Entry

```
URL: apibase.pro/catalog/finance/coingecko/
──────────────────────────────────────────────────────────────
Provider:       CoinGecko
Website:        coingecko.com
Category:       Finance / Crypto Market Data
Subcategories:  Prices, Market Cap, DeFi, DEX, NFTs, Trending

Status:         Active ✅
MCP Tools:      9 tools (crypto-price, market-overview, coin-detail,
                price-history, trending, global, dex-pools,
                token-by-address, search)
Formats:        MCP Tool Definition, OpenAPI 3.1, A2A Agent Card

Pricing:
  Read (free tier):    500 req/month
  Read (paid):         $0.002/req via x402
  Heavy queries:       $0.005/req via x402
  DEX data:            $0.003/req via x402

Authentication:  OAuth 2.1 via APIbase (agent registration required)
Data freshness:  Prices: 30-60 sec | Charts: 5 min | DEX: 15 sec
Rate limits:     Per-agent, based on KYA level
Auto-sync:       Coin list: daily | Prices: 30 sec | Trending: 5 min
Coverage:        14,000+ coins, 1,100+ exchanges, 90+ blockchains
```

### GitHub Public Entry

```
github.com/apibase-pro/apibase/apis/finance/coingecko/
│
├── README.md
│   # CoinGecko — Crypto Market Data API
│   CoinGecko is the world's largest independent cryptocurrency
│   data aggregator. Through APIbase, AI agents can access prices,
│   market data, trending coins, on-chain DEX data, and more.
│
│   ## Available Tools
│   - crypto-price: Current prices for 14,000+ cryptocurrencies
│   - crypto-market-overview: Top coins by market cap
│   - crypto-coin-detail: Deep research on any coin
│   - crypto-price-history: Historical price/volume/market cap
│   - crypto-trending: Most searched coins (last 24h)
│   - crypto-global: Global market statistics
│   - crypto-dex-pools: On-chain DEX pool data (90+ chains)
│   - crypto-token-by-address: Identify tokens by contract
│   - crypto-search: Find coins by name or symbol
│
│   ## Quick Start
│   POST apibase.pro/api/v1/discover {"query": "crypto prices"}
│
│   ## Data Coverage
│   14,000+ coins, 1,100+ exchanges, 90+ blockchains
│   CEX + DEX data, NFTs, categories, trending
│
├── capabilities.json
│   {
│     "provider": "coingecko",
│     "category": "finance",
│     "subcategory": "crypto-market-data",
│     "tools_count": 9,
│     "read_auth_required": false,
│     "trade_auth_required": false,
│     "x402_enabled": true,
│     "x402_upstream": true,
│     "real_time": false,
│     "data_delay": "30-60 seconds",
│     "coverage": {
│       "coins": 14000,
│       "exchanges": 1100,
│       "blockchains": 90
│     }
│   }
│
└── examples.md
    # Examples
    ## Get Bitcoin price
    POST /api/v1/coingecko/price {"coins": ["bitcoin"], "vs_currencies": ["usd"]}

    ## Top 10 coins by market cap
    GET /api/v1/coingecko/markets?sort_by=market_cap_desc&limit=10

    ## Trending coins
    GET /api/v1/coingecko/trending

    ## Historical price (30 days)
    GET /api/v1/coingecko/history?coin_id=ethereum&days=30&interval=daily

    ## Search DEX pools
    GET /api/v1/coingecko/dex/pools?network=ethereum&query=WETH/USDC
```

**Not published on GitHub:** API keys, Pro plan credentials, x402 wallet private key, caching algorithms, rate limit distribution logic, upstream routing strategy.

---

## 7. Traffic Flow Diagram

### Standard Read Request (prices/markets)

```
AI Agent                    APIbase.pro                     CoinGecko
    │                           │                               │
    │── crypto-price ──────────→│                               │
    │   coins=["bitcoin","eth"] │                               │
    │   Authorization: Bearer...│                               │
    │                           │── Verify agent (OAuth 2.1) ──→│ (internal)
    │                           │── Check rate limit ──────────→│ (internal)
    │                           │── Check cache ───────────────→│ (internal)
    │                           │                               │
    │                           │   [cache miss — 30s TTL]      │
    │                           │                               │
    │                           │── GET /simple/price ─────────→│
    │                           │   ?ids=bitcoin,ethereum        │ api.coingecko.com
    │                           │   &vs_currencies=usd           │
    │                           │   Header: x-cg-pro-api-key     │
    │                           │←── 200 OK [CoinGecko JSON] ──│
    │                           │                               │
    │                           │   [normalize → APIbase schema]│
    │                           │   [cache result, TTL=30s]     │
    │                           │   [charge x402: $0.002]       │
    │                           │                               │
    │←── 200 OK ────────────────│                               │
    │   [{                      │                               │
    │     provider: "coingecko",│                               │
    │     symbol: "BTC",        │                               │
    │     price_usd: 97500.00,  │                               │
    │     change_24h: +1.45%    │                               │
    │   }, ...]                 │                               │
```

### x402 Overflow Request (high load)

```
AI Agent                    APIbase.pro                     CoinGecko
    │                           │                               │
    │── crypto-dex-pools ──────→│                               │
    │   network="solana"        │                               │
    │                           │── Verify agent ──────────────→│ (internal)
    │                           │── Check Pro Key rate limit ──→│ (internal)
    │                           │                               │
    │                           │   [Pro Key at 95% capacity!]  │
    │                           │   [Switch to x402 upstream]   │
    │                           │                               │
    │                           │── GET /networks/solana/pools─→│
    │                           │   Payment: x402 USDC $0.01    │ x402.coingecko.com
    │                           │   Network: Base               │
    │                           │←── 200 OK [Pool data] ───────│
    │                           │                               │
    │                           │   [normalize → dex-pool schema│
    │                           │   [cache result, TTL=15s]     │
    │                           │   [charge agent: $0.015]      │
    │                           │   [net margin: $0.005]        │
    │                           │                               │
    │←── 200 OK ────────────────│                               │
    │   [{                      │                               │
    │     pair: "SOL/USDC",     │                               │
    │     dex: "raydium",       │                               │
    │     liquidity: $45M,      │                               │
    │     volume_24h: $120M     │                               │
    │   }, ...]                 │                               │
```

### GeckoTerminal Request (free, no key needed)

```
AI Agent                    APIbase.pro                GeckoTerminal
    │                           │                           │
    │── crypto-dex-pools ──────→│                           │
    │   query="PEPE/WETH"       │                           │
    │                           │── Check cache ──────────→│ (internal)
    │                           │                           │
    │                           │   [cache miss]            │
    │                           │                           │
    │                           │── GET /search/pools ─────→│
    │                           │   ?query=PEPE+WETH         │ api.geckoterminal.com
    │                           │   (no auth needed!)        │ (FREE)
    │                           │←── 200 OK ───────────────│
    │                           │                           │
    │                           │   [normalize + cache]     │
    │                           │   [charge agent: $0.003]  │
    │                           │   [upstream cost: $0.00]  │
    │                           │   [100% margin!]          │
    │                           │                           │
    │←── 200 OK ────────────────│                           │
```

---

## 8. Monetization Model

| Revenue Stream | Mechanism | Expected per Month |
|---------------|-----------|-------------------|
| **API Usage Fee (read, cached)** | $0.002/req via x402. High cache hit rate (30s TTL) reduces upstream costs. | $200–2,000 |
| **API Usage Fee (heavy queries)** | $0.005/req for history/OHLCV/detail. These consume more upstream quota. | $100–1,000 |
| **DEX data (GeckoTerminal)** | $0.003/req. Upstream is FREE → 100% margin. | $50–500 |
| **x402 overflow margin** | Agent pays $0.015/req during peaks. CoinGecko x402 costs $0.01. | $20–200 |
| **Free tier overage** | 500 free → paid after. Conversion expected ~15%. | Included above |

### Cost Structure

| Cost Item | Monthly | Notes |
|-----------|---------|-------|
| CoinGecko Analyst Plan | $129 | 500 req/min, 500K/month base |
| x402 overflow budget | $50–200 | Only when Pro Key near limit |
| GeckoTerminal | $0 | Free, no auth |
| **Total upstream cost** | **$179–329** | |
| **Expected revenue** | **$370–3,700** | |
| **Net margin** | **$191–3,371** | **52–91% margin** |

### Revenue Comparison Across All Use Cases

| UC | Provider | Revenue Model | Revenue/month | Upstream Cost | Margin |
|----|----------|--------------|--------------|---------------|--------|
| UC-001 | Polymarket | API fees + Builder rewards | $100–1,000 | $0 (free API) | ~100% |
| UC-002 | Aviasales | Affiliate 40% RevShare + API fees | $200–2,000 | $0 (free API) | ~100% |
| UC-003 | Food Delivery | CPA + API fees + Affiliate | $500–5,000 | MealMe plan ~$200 | 60–96% |
| **UC-004** | **CoinGecko** | **x402 fees + DEX margin** | **$370–3,700** | **$179–329** | **52–91%** |

**Key insight:** UC-004 — первый юзкейс с **ненулевой стоимостью upstream**. CoinGecko Pro план стоит $129/мес. Это создаёт новый паттерн: **API Plan Arbitrage** — APIbase покупает подписку и перепродаёт per-call доступ с маржой 52–91%.

---

## 9. Lessons Learned

### What works well about this integration

1. **x402-to-x402 bridge = идеальный fit.** CoinGecko — один из первых провайдеров с нативной x402 поддержкой. APIbase может выстроить полностью автономную цепочку: Agent → x402 → APIbase → x402 → CoinGecko. Ни одного человека в процессе.

2. **GeckoTerminal = бесплатный бонус.** On-chain DEX данные доступны совершенно бесплатно через GeckoTerminal API без авторизации. APIbase получает 100% маржу на этих запросах. Это уникальное преимущество перед прямым CoinGecko API.

3. **Massive scope.** 14,000+ монет, 1,100+ бирж, 90+ блокчейнов — CoinGecko покрывает практически весь крипто-рынок. Один API на APIbase заменяет десятки мелких интеграций.

4. **Natural AI agent demand.** Крипто-данные — один из top-3 запросов AI агентов (вместе с погодой и новостями). Агенты CoinGecko видят на 30% больше engagement по данным самого CoinGecko.

5. **No trading complexity.** В отличие от Binance или 1inch, CoinGecko — чисто read-only. Нет проблем с кошельками, подписями, AML/KYC, money transmission.

### Challenges identified

1. **Upstream cost ≠ $0.** В отличие от UC-001/UC-002/UC-003, CoinGecko Pro стоит $129+/мес. APIbase должен генерировать достаточно трафика чтобы покрыть фиксированные расходы. Break-even: ~65K запросов/мес при $0.002/req.

2. **x402 overflow убыточен.** CoinGecko x402 стоит $0.01/req — дороже чем Pro Key per-request cost (~$0.0003). APIbase должен минимизировать x402 overflow и выставлять premium цену ($0.015+) за burst трафик.

3. **Data delay 30-60 sec.** CoinGecko обновляется каждые 30-60 сек, что недостаточно для HFT или арбитражных ботов. APIbase должен чётко коммуницировать это ограничение агентам.

4. **CoinGecko — потенциальный конкурент.** CoinGecko сам активно работает с AI-агентами и x402. Если CoinGecko создаст свой MCP сервер, APIbase потеряет часть ценности. Защита: multi-provider aggregation (CoinGecko + CoinMarketCap + on-chain data).

5. **ToS considerations.** CoinGecko ToS запрещает "redistributing" данных. APIbase wrapper должен быть позиционирован как "value-added service" (нормализация, кеширование, MCP), а не raw data redistribution.

### Pattern: x402 Upstream Bridge

Этот юзкейс устанавливает **новый паттерн** — wrapping x402-native провайдера:

```
Паттерн: x402 Upstream Bridge
──────────────────────────────────────────────────────────
Условия применения:
  • Upstream провайдер поддерживает x402 (pay-per-call)
  • У провайдера есть и подписочная модель (API key)

Стратегия APIbase:
  1. Основной трафик → через подписку (низкая per-call cost)
  2. Overflow/burst → через x402 (без лимитов, но дороже)
  3. Downstream billing = фиксированная цена per-call
  4. Margin = downstream price − weighted upstream cost

Применимо к:
  • CoinGecko (confirmed x402 support)
  • Future x402-enabled APIs (по мере роста экосистемы)
  • Любой API с hybrid pricing (subscription + per-call)
```

### Pattern: Free Upstream Bonus (GeckoTerminal)

```
Паттерн: Free Upstream Bonus
──────────────────────────────────────────────────────────
Условия применения:
  • Upstream провайдер предоставляет часть данных бесплатно
  • Бесплатные данные ценны для конечных агентов

Стратегия APIbase:
  1. Маршрутизировать запросы к бесплатным endpoint'ам
  2. Биллить downstream агентов стандартную цену
  3. 100% маржа на бесплатных upstream данных
  4. Пользователь не знает (и ему не нужно знать) об источнике

Применимо к:
  • GeckoTerminal (DEX data — free, no auth)
  • Binance public market data (free, no API key)
  • Public blockchain RPCs
  • Любые бесплатные API с ценными данными
```

### Unique aspects of UC-004 vs previous use cases

| Aspect | UC-001 | UC-002 | UC-003 | **UC-004** |
|--------|--------|--------|--------|---------|
| Upstream cost | $0 | $0 | ~$200 | **$129–329** |
| x402 upstream | No | No | No | **Yes (first!)** |
| Free data bonus | No | No | No | **Yes (GeckoTerminal)** |
| Provider as competitor | No | No | No | **Yes (CoinGecko AI)** |
| MCP server exists | No | No | No | **No (opportunity!)** |
| Data scope | 30+ endpoints | 8 services | Multi-provider | **14K coins, 90 chains** |
| Read-only | Mostly | Yes | No (ordering) | **Yes (100%)** |
| Primary revenue | API fees | Affiliate | CPA + mixed | **Per-call margin** |
