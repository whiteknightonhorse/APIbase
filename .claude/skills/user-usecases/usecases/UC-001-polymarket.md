# UC-001: Polymarket

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-001 |
| **Provider** | Polymarket (polymarket.com) |
| **Category** | Predictions / Analytics |
| **Date Added** | 2026-03-07 |
| **Status** | Reference |
| **Client** | Alpush (Polymarket Developer) |

---

## 1. Client Input Data

Client (Alpush) предоставил APIbase:

```
Тип данных:          Значение:
──────────────────────────────────────────────────────────
Profile              Alpush (Developer, polymarket.com)
Wallet Address       0x228d6704ae66cb7ed07a1e5d4d51a8e385777abb
Builder API Key #1   019c6ff4-86ee-7725-b85d-80fd1aab3d38 (Active)
Builder API Key #2   019c6ff4-c375-77c5-9b84-8ec82123df08 (Active)
Builder API Key #3   019c7468-929f-7602-b7fa-bc2561f08fe9 (Active)
Registration Date    18.02.2026
Confirmed            No
```

### Sufficiency Assessment

| Data provided | What it enables | Sufficient? |
|---------------|----------------|-------------|
| 3x Builder API Keys | Attribution of all trading volume to Alpush's app. Builder leaderboard. Gasless transactions via relayer. | **Yes** — for read-only API + trade attribution |
| Wallet Address | Public identifier for on-chain verification | **Yes** |
| CLOB credentials (apiKey, secret, passphrase) | Placing/canceling orders on behalf of end users | **Not provided** — needed for full trading API |

**Verdict:** Provided data is **sufficient for MVP** (read-only market data + trade attribution covering ~80% of agent use cases). For full trading API, CLOB credentials are additionally required.

---

## 2. Provider API Analysis

### API Architecture

Polymarket operates 4 separate API services on Polygon blockchain (Chain ID: 137):

| Service | Base URL | Auth | Description |
|---------|----------|------|-------------|
| **Gamma API** | `https://gamma-api.polymarket.com` | No | Market data, events, search |
| **CLOB API** | `https://clob.polymarket.com` | Partial (read=no, trade=yes) | Order book, prices, trading |
| **Data API** | `https://data-api.polymarket.com` | No | Positions, analytics, leaderboard |
| **WebSocket** | `wss://ws-subscriptions-clob.polymarket.com/ws/` | Partial | Real-time price/orderbook/trade updates |

### Key Endpoints

#### Gamma API (Market Data — No Auth)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/events` | GET | List events with filtering and pagination |
| `/events/{id}` | GET | Specific event details |
| `/markets` | GET | List markets with filtering |
| `/markets/{id}` | GET | Single market details |
| `/public-search` | GET | Search across events, markets, profiles |
| `/tags` | GET | Ranked tags and categories |
| `/series` | GET | Grouped events (series) |

#### CLOB API — Public (No Auth)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/book` | GET | Order book for a market |
| `/books` | GET | Order books for multiple markets |
| `/price` | GET | Current price for a token |
| `/prices` | GET | Prices for multiple tokens |
| `/midpoint` | GET | Midpoint price |
| `/midpoints` | GET | Midpoints for multiple tokens |
| `/prices-history` | GET | Historical price data |
| `/tick-size` | GET | Tick size for a market |
| `/spread` | GET | Spread for a market |

#### CLOB API — Authenticated (L2 required)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/order` | POST | Place a single order (GTC) |
| `/orders` | POST | Place batch orders (up to 15/request) |
| `/order` | DELETE | Cancel a single order |
| `/orders` | DELETE | Cancel multiple orders (up to 3000) |
| `/cancel-all` | DELETE | Cancel all open orders |
| `/open-orders` | GET | Retrieve open orders |
| `/trades` | GET | Trade history |
| `/balance-allowance` | GET | Check balance/allowance |

#### Data API (Analytics — No Auth)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/activity` | GET | On-chain activity (trade, split, merge, redeem) |
| `/positions` | GET | Current user positions |
| `/closed-positions` | GET | Closed positions |
| `/trades` | GET | Trade history |
| `/leaderboard` | GET | Leaderboard rankings |
| `/profiles` | GET | Public profile data |

### Authentication Model

**Two-tier system:**

- **L1 (Private Key):** EIP-712 signed messages. For creating API credentials.
  - Headers: `POLY_ADDRESS`, `POLY_SIGNATURE`, `POLY_TIMESTAMP`, `POLY_NONCE`
- **L2 (API Key):** HMAC-SHA256 with derived credentials (apiKey, secret, passphrase).
  - Headers: `POLY_ADDRESS`, `POLY_SIGNATURE`, `POLY_TIMESTAMP`, `POLY_API_KEY`, `POLY_PASSPHRASE`

**Builder API Keys** (what client provided) — separate credential type:
- Order attribution (tracking which app generated volume)
- Gasless transaction capabilities via relayer
- Builder leaderboard placement

### Rate Limits

| Service / Endpoint | Limit |
|---------------------|-------|
| CLOB General | 9,000 req / 10 sec |
| `GET /book` | 1,500 req / 10 sec |
| `GET /price` | 1,500 req / 10 sec |
| `POST /order` | 3,500 req / 10 sec (burst), 36,000 / 10 min (sustained) |
| `DELETE /order` | 3,000 req / 10 sec (burst), 30,000 / 10 min (sustained) |
| Gamma General | 4,000 req / 10 sec |
| `GET /events` | 500 req / 10 sec |
| `GET /markets` | 300 req / 10 sec |
| `GET /public-search` | 350 req / 10 sec |
| Data API General | 1,000 req / 10 sec |
| `GET /trades` | 200 req / 10 sec |
| `GET /positions` | 150 req / 10 sec |
| Relayer `/submit` | 25 req / min |

### Official SDKs

- TypeScript: `@polymarket/clob-client` (npm)
- Python: `py-clob-client` (pip)
- Docs: `docs.polymarket.com`

---

## 3. APIbase Wrapper Design

### Level 1: Protocol Adapter

```
What the adapter does:
──────────────────────────────────────────────────────────────
• Unifies 4 Polymarket services → single APIbase endpoint
  apibase.pro/api/v1/polymarket/...

• Request routing:
  /polymarket/events     → gamma-api.polymarket.com/events
  /polymarket/prices     → clob.polymarket.com/prices
  /polymarket/positions  → data-api.polymarket.com/positions

• Rate limit management:
  - Per-agent quota (fraction of Polymarket's global limits)
  - Request queuing when approaching limits
  - 429 handling with automatic retry + exponential backoff

• Caching strategy:
  - Market list: 30 sec TTL (changes rarely)
  - Prices: 2 sec TTL (near-real-time)
  - Order book: 1 sec TTL (fast-changing)
  - Historical data: 5 min TTL (static)
  - Events metadata: 60 sec TTL

• Error normalization:
  Polymarket errors → APIbase standard error format
  {"error": "polymarket_rate_limited", "message": "...", "retry_after": 2}
```

### Level 2: Semantic Normalizer

**Domain model: `prediction-market`**

```json
// === Polymarket original (market object) ===
{
  "id": "0x1234...",
  "question": "Will Bitcoin hit $100k in 2026?",
  "outcomes": ["Yes", "No"],
  "outcomePrices": ["0.73", "0.27"],
  "volume": "5432100.50",
  "volume24hr": "234500.00",
  "openInterest": "1200000.00",
  "bestBid": "0.72",
  "bestAsk": "0.74",
  "status": "active",
  "marketType": "binary",
  "tickSize": "0.01",
  "negRisk": false,
  "tokenIds": ["98765...", "43210..."],
  "conditionId": "0xabcd...",
  "endDate": "2026-12-31T23:59:59Z"
}

// === APIbase normalized (prediction-market schema) ===
{
  "provider": "polymarket",
  "provider_id": "0x1234...",
  "market_id": "apibase_pm_0x1234",
  "question": "Will Bitcoin hit $100k in 2026?",
  "type": "binary",
  "status": "active",
  "outcomes": [
    {
      "label": "Yes",
      "probability": 0.73,
      "price": 0.73,
      "best_bid": 0.72,
      "best_ask": 0.74
    },
    {
      "label": "No",
      "probability": 0.27,
      "price": 0.27,
      "best_bid": 0.26,
      "best_ask": 0.28
    }
  ],
  "volume_usd": 5432100.50,
  "volume_24h_usd": 234500.00,
  "open_interest_usd": 1200000.00,
  "end_date": "2026-12-31T23:59:59Z",
  "source_url": "https://polymarket.com/event/...",
  "tick_size": 0.01,
  "last_updated": "2026-03-07T14:30:00Z"
}
```

### Level 3: Builder Key Injector

```
For every trading request through APIbase:
──────────────────────────────────────────────────────────────
1. Agent sends trade request to APIbase
2. APIbase injects Alpush's Builder API Key into request headers
3. Order is submitted to Polymarket CLOB with Builder attribution
4. Polymarket attributes the trading volume to "Alpush"
5. Alpush earns Builder rewards from Polymarket
6. APIbase logs the transaction and charges API usage fee

Builder Key rotation:
- Key #1 (019c6ff4-86ee...) — primary, used for all requests
- Key #2 (019c6ff4-c375...) — failover if Key #1 is rate-limited
- Key #3 (019c7468-929f...) — failover if Key #2 is rate-limited
```

---

## 4. MCP Tool Definitions

### Tool: polymarket-search

```json
{
  "name": "polymarket-search",
  "description": "Search prediction markets on Polymarket. Find markets about politics, crypto, sports, economics, geopolitics and more. Returns current probabilities, trading volume, and market details.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Natural language search query, e.g. 'Bitcoin price 2026' or 'US presidential election'"
      },
      "category": {
        "type": "string",
        "enum": ["politics", "crypto", "sports", "finance", "science", "culture", "geopolitics", "iran", "economics"],
        "description": "Filter by category (optional)"
      },
      "status": {
        "type": "string",
        "enum": ["active", "resolved", "all"],
        "default": "active",
        "description": "Market status filter"
      },
      "sort_by": {
        "type": "string",
        "enum": ["volume", "newest", "ending_soon", "probability_high", "probability_low"],
        "default": "volume",
        "description": "Sort order"
      },
      "limit": {
        "type": "integer",
        "default": 10,
        "maximum": 100,
        "description": "Number of results"
      }
    },
    "required": ["query"]
  }
}
```

### Tool: polymarket-market-detail

```json
{
  "name": "polymarket-market-detail",
  "description": "Get detailed information about a specific Polymarket prediction market including current probability, volume, order book depth, and historical price data.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "market_id": {
        "type": "string",
        "description": "Market ID from polymarket-search results"
      },
      "include_orderbook": {
        "type": "boolean",
        "default": false,
        "description": "Include order book depth data"
      },
      "include_history": {
        "type": "boolean",
        "default": false,
        "description": "Include price history (last 30 days)"
      }
    },
    "required": ["market_id"]
  }
}
```

### Tool: polymarket-prices

```json
{
  "name": "polymarket-prices",
  "description": "Get current prices (probabilities) for one or more Polymarket markets. Prices represent implied probabilities: 0.73 = 73% chance.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "market_ids": {
        "type": "array",
        "items": {"type": "string"},
        "description": "List of market IDs to get prices for",
        "maxItems": 50
      }
    },
    "required": ["market_ids"]
  }
}
```

### Tool: polymarket-price-history

```json
{
  "name": "polymarket-price-history",
  "description": "Get historical price data for a Polymarket market. Useful for analyzing trends, identifying momentum, and understanding how probabilities have changed over time.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "market_id": {
        "type": "string",
        "description": "Market ID"
      },
      "interval": {
        "type": "string",
        "enum": ["1h", "4h", "1d", "1w"],
        "default": "1d",
        "description": "Candle interval"
      },
      "days": {
        "type": "integer",
        "default": 30,
        "maximum": 365,
        "description": "Number of days of history"
      }
    },
    "required": ["market_id"]
  }
}
```

### Tool: polymarket-orderbook

```json
{
  "name": "polymarket-orderbook",
  "description": "Get the order book for a Polymarket market. Shows bid/ask depth and spread. Useful for assessing market liquidity before placing large orders.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "market_id": {
        "type": "string",
        "description": "Market ID"
      },
      "depth": {
        "type": "integer",
        "default": 10,
        "maximum": 50,
        "description": "Order book depth (number of price levels)"
      }
    },
    "required": ["market_id"]
  }
}
```

### Tool: polymarket-trending

```json
{
  "name": "polymarket-trending",
  "description": "Get trending and popular prediction markets on Polymarket. Sorted by 24h volume, new markets, or biggest probability changes.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sort_by": {
        "type": "string",
        "enum": ["volume_24h", "newest", "biggest_move", "ending_soon"],
        "default": "volume_24h",
        "description": "How to rank trending markets"
      },
      "category": {
        "type": "string",
        "enum": ["politics", "crypto", "sports", "finance", "science", "culture", "geopolitics"],
        "description": "Filter by category (optional)"
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

### Tool: polymarket-leaderboard

```json
{
  "name": "polymarket-leaderboard",
  "description": "Get the Polymarket trading leaderboard. Shows top traders by profit, volume, or number of markets traded.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sort_by": {
        "type": "string",
        "enum": ["profit", "volume", "markets_traded"],
        "default": "profit"
      },
      "period": {
        "type": "string",
        "enum": ["24h", "7d", "30d", "all_time"],
        "default": "7d"
      },
      "limit": {
        "type": "integer",
        "default": 20,
        "maximum": 100
      }
    },
    "required": []
  }
}
```

### Tool: polymarket-place-order (Requires KYA Verified + CLOB credentials)

```json
{
  "name": "polymarket-place-order",
  "description": "Place a limit order on a Polymarket prediction market. Requires KYA Verified level and CLOB credentials. All orders are attributed to the Builder Key for volume tracking.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "market_id": {
        "type": "string",
        "description": "Market ID to trade"
      },
      "outcome": {
        "type": "string",
        "enum": ["Yes", "No"],
        "description": "Which outcome to buy"
      },
      "side": {
        "type": "string",
        "enum": ["buy", "sell"],
        "description": "Buy or sell"
      },
      "price": {
        "type": "number",
        "minimum": 0.01,
        "maximum": 0.99,
        "description": "Limit price (0.01-0.99, represents probability)"
      },
      "amount_usd": {
        "type": "number",
        "minimum": 1,
        "description": "Order size in USD"
      }
    },
    "required": ["market_id", "outcome", "side", "price", "amount_usd"]
  }
}
```

---

## 5. AI Instructions

```markdown
# Polymarket API via APIbase — AI Agent Instructions

## When to Use
- User asks about probability of any event (politics, crypto, sports, etc.)
- User wants to know "what does the market think about..."
- User needs predictions or forecasts based on crowd wisdom
- User wants to analyze prediction market trends
- User asks about betting odds or prediction market data

## Key Concept
Polymarket is a prediction market. Prices = implied probabilities.
Price 0.73 means the market estimates 73% probability of that outcome.
For binary markets (Yes/No), prices always sum to ~1.00.

## Recommended Call Chains

### "What's the probability of X?"
1. `polymarket-search` (query="X") → find relevant markets
2. Return probability from results

### "Analyze the trend for X"
1. `polymarket-search` (query="X") → find market
2. `polymarket-price-history` (market_id, interval="1d", days=30) → get trend
3. Analyze and describe the trend

### "Is it a good bet to buy Yes on X?"
1. `polymarket-search` (query="X") → find market
2. `polymarket-market-detail` (market_id, include_orderbook=true) → get depth
3. `polymarket-price-history` (market_id) → get trend
4. Analyze: current price, trend direction, liquidity depth, spread

### "What's trending in prediction markets?"
1. `polymarket-trending` (sort_by="volume_24h") → top markets
2. Optionally: `polymarket-trending` (sort_by="biggest_move") → biggest movers

### "Place a bet on X"
1. `polymarket-search` (query="X") → find market
2. `polymarket-market-detail` (include_orderbook=true) → check liquidity
3. `polymarket-place-order` (market_id, outcome, side, price, amount)
   ⚠️ Requires KYA Verified + CLOB credentials
   ⚠️ Confirm with user before placing order

## Response Formatting
- Always show probability as percentage: "73%" not "0.73"
- Include 24h volume to indicate market liquidity/reliability
- For trends: "↑ +5% over 7 days" or "↓ -3% over 24h"
- Note the number of traders for context ("2,400 traders")
- Always caveat: "This is market sentiment, not a guaranteed outcome"

## Limitations
- Polymarket data is market-driven, not factual — markets can be wrong
- Low-volume markets (<$10k) may have unreliable probabilities
- Prices can be manipulated in illiquid markets
- Trading operations require additional credentials and KYA verification
- Historical data may have gaps during low-activity periods

## Pricing via APIbase
- Read operations (search, prices, history): Free tier (1000 req/month)
- Read operations above free tier: $0.0005 per request (x402)
- Trade operations: $0.001 per order (x402)
- WebSocket real-time: $0.01/hour connected (x402)
```

---

## 6. Publication

### APIbase.pro Catalog Entry

```
URL: apibase.pro/catalog/predictions/polymarket/
──────────────────────────────────────────────────────────────
Provider:       Polymarket
Website:        polymarket.com
Category:       Predictions / Analytics
Subcategories:  Politics, Crypto, Sports, Finance, Geopolitics

Status:         Active ✅
MCP Tools:      8 tools (search, market-detail, prices, price-history,
                orderbook, trending, leaderboard, place-order)
Formats:        MCP Tool Definition, OpenAPI 3.1, A2A Agent Card

Pricing:
  Read (free tier):    1000 req/month
  Read (paid):         $0.0005/req via x402
  Trade:               $0.001/order via x402

Authentication:  OAuth 2.1 via APIbase (agent registration required)
Data freshness:  Prices: 2 sec | Markets: 30 sec | History: 5 min
Rate limits:     Per-agent, based on KYA level
Auto-sync:       Daily (market list), real-time (prices)
```

### GitHub Public Entry

```
github.com/apibase-pro/apibase/apis/predictions/polymarket/
│
├── README.md
│   # Polymarket — Prediction Markets API
│   Polymarket is the world's largest prediction market platform.
│   Through APIbase, AI agents can search markets, get real-time
│   probabilities, analyze trends, and execute trades.
│
│   ## Available Tools
│   - polymarket-search: Search prediction markets
│   - polymarket-market-detail: Get market details
│   - polymarket-prices: Current probabilities
│   - polymarket-price-history: Historical trends
│   - polymarket-orderbook: Order book depth
│   - polymarket-trending: Trending markets
│   - polymarket-leaderboard: Top traders
│   - polymarket-place-order: Execute trades (requires verification)
│
│   ## Quick Start
│   POST apibase.pro/api/v1/discover {"query": "prediction markets"}
│
│   ## Categories
│   Politics, Crypto, Sports, Finance, Science, Culture, Geopolitics
│
├── capabilities.json
│   {
│     "provider": "polymarket",
│     "category": "predictions",
│     "tools_count": 8,
│     "read_auth_required": false,
│     "trade_auth_required": true,
│     "x402_enabled": true,
│     "real_time": true,
│     "websocket": true
│   }
│
└── examples.md
    # Examples
    ## Search for Bitcoin markets
    POST /api/v1/polymarket/search {"query": "Bitcoin 100k"}

    ## Get trending markets
    GET /api/v1/polymarket/trending?sort_by=volume_24h&limit=5

    ## Get price history
    GET /api/v1/polymarket/price-history?market_id=...&interval=1d&days=30
```

**Not published on GitHub:** Builder API keys, wrapper implementation, caching logic, rate limit distribution algorithm.

---

## 7. Traffic Flow Diagram

### Read Request (search/prices/analytics)

```
AI Agent                    APIbase.pro                     Polymarket
    │                           │                               │
    │── polymarket-search ─────→│                               │
    │   query="Bitcoin 100k"    │                               │
    │   Accept: application/json│                               │
    │   Authorization: Bearer...│                               │
    │                           │── Verify agent (OAuth 2.1) ──→│ (internal)
    │                           │── Check rate limit ──────────→│ (internal)
    │                           │── Check cache ───────────────→│ (internal)
    │                           │                               │
    │                           │   [cache miss]                │
    │                           │                               │
    │                           │── GET /public-search ────────→│
    │                           │   ?query=Bitcoin+100k          │ gamma-api
    │                           │←── 200 OK [Polymarket JSON] ──│
    │                           │                               │
    │                           │   [normalize → APIbase schema]│
    │                           │   [cache result, TTL=30s]     │
    │                           │   [log: agent_id, endpoint,   │
    │                           │    latency, cache_hit=false]  │
    │                           │                               │
    │←── 200 OK ────────────────│                               │
    │   [{                      │                               │
    │     provider: "polymarket",│                              │
    │     question: "Will BTC...",│                             │
    │     probability: 0.73,    │                               │
    │     volume_24h: 234500    │                               │
    │   }, ...]                 │                               │
```

### Trade Request (place order — requires CLOB credentials)

```
AI Agent                    APIbase.pro                     Polymarket
    │                           │                               │
    │── polymarket-place-order─→│                               │
    │   market_id="0x1234..."   │                               │
    │   outcome="Yes"           │                               │
    │   price=0.73, amount=$50  │                               │
    │                           │── Verify KYA level ≥ Verified │ (internal)
    │                           │── Check spending limits ──────│ (internal)
    │                           │── Check: amount < threshold?──│ (internal)
    │                           │                               │
    │                           │   [amount $50 < $100 threshold│
    │                           │    → auto-approve]            │
    │                           │                               │
    │                           │── POST /order ───────────────→│
    │                           │   Headers:                    │ clob API
    │                           │     POLY_API_KEY: [CLOB key]  │
    │                           │     POLY_PASSPHRASE: [...]    │
    │                           │     Builder-Key: 019c6ff4-... │ ← Alpush's key
    │                           │                               │
    │                           │←── 200 OK {order_id: "..."} ─│
    │                           │                               │
    │                           │   [log: trade, amount, fees]  │
    │                           │   [charge x402: $0.001]       │
    │                           │   [attribute to Builder]      │
    │                           │                               │
    │←── 200 OK ────────────────│                               │
    │   {                       │                               │
    │     status: "placed",     │                               │
    │     order_id: "...",      │                               │
    │     outcome: "Yes",       │                               │
    │     price: 0.73,          │                               │
    │     amount: 50,           │                               │
    │     fee: 0.001            │                               │
    │   }                       │                               │
```

---

## 8. Monetization Model

| Revenue Stream | Mechanism | Expected per Month |
|---------------|-----------|-------------------|
| **API Usage Fee (read)** | $0.0005/req after free tier of 1000 req/month | $50–500 (early stage) |
| **API Usage Fee (trade)** | $0.001 per trade order via x402 | $10–100 (early stage) |
| **Builder Rewards** | Polymarket pays Builder rewards to Alpush based on attributed volume. APIbase revenue share agreement with Alpush (e.g., 70/30). | Variable |
| **Premium data** | Real-time WebSocket feeds, $0.01/hour | $20–200 |

**Total expected (year 1):** $100–1000/month from Polymarket integration alone.

**Scaling potential:** As agent adoption grows, prediction market data becomes high-value (agents making financial decisions, risk assessments, planning). Volume could 10-100x.

---

## 9. Lessons Learned

### What works well about this integration

1. **Builder Keys = natural referral model.** Polymarket already has a Builder program that attributes volume to apps. This maps perfectly to APIbase's referral architecture — no custom tracking needed.

2. **Mostly public API = low barrier.** ~80% of Polymarket endpoints don't require authentication. AIbase can provide massive value (search, prices, analytics) with just the client's Builder Keys. Trading adds value but isn't required for MVP.

3. **High agent demand.** Prediction market data is exactly what AI agents need for: answering probability questions, risk assessment, market sentiment analysis, financial planning.

4. **Clean API architecture.** Polymarket has 4 well-documented services with OpenAPI-like structure. Makes wrapper generation straightforward for Claude Code MAX.

### Challenges identified

1. **CLOB credentials gap.** For full trading API, need separate CLOB credentials beyond Builder Keys. This means the client must provide additional secrets. APIbase needs secure vault storage.

2. **Rate limit distribution.** Polymarket's limits are global per IP/key. When multiple agents share APIbase's access, need fair distribution. Solved by per-agent quotas based on KYA level.

3. **Price volatility of data.** Prediction market prices change rapidly. Cache TTL must be very short (1-2 sec for prices) to avoid serving stale probabilities that could lead to bad agent decisions.

4. **Blockchain dependency.** Polymarket runs on Polygon. If Polygon has issues (congestion, outage), trading endpoints fail. APIbase should detect and communicate this to agents gracefully.

### Pattern: Builder Key Integration

This integration establishes a **reusable pattern** for other platforms with builder/affiliate programs:
- Platform has a developer/builder program with API keys for attribution
- Read-only access is free and unauthenticated
- Write operations require additional credentials
- Revenue sharing between APIbase and the client (Builder Key owner)

This pattern likely applies to: Uniswap, 1inch, Jupiter, Aave, and other DeFi protocols with referral/builder programs.
