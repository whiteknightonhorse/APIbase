# APIbase.pro — The API Hub for AI Agents

> Search flights, find restaurants, discover events, browse movies, compare prices, track status, trade prediction markets — all via MCP.
> One endpoint. 88 tools. 14 providers. Pay per call.

**[Live Platform](https://apibase.pro)** | **[Tool Catalog](https://apibase.pro/api/v1/tools)** | **[MCP Endpoint](https://apibase.pro/mcp)** | **[Health](https://apibase.pro/health/ready)**

---

## What is APIbase?

Production MCP server — universal API hub for AI agents. 88 tools across travel, places, events, entertainment, health, finance, weather, and more. Search flights (Amadeus, Sabre GDS), find restaurants and places (Foursquare), discover events and concerts (Ticketmaster), browse movies and TV shows (TMDB), look up nutrition data and drug safety (USDA, OpenFDA, NIH), get exchange rates, economic indicators, and treasury data (ECB, FRED, World Bank, US Treasury), trade prediction markets (Polymarket), track crypto, check weather — with more providers shipping regularly. One endpoint, pay per call via x402 USDC micropayments. Auto-registration, zero setup. Covers the most popular API categories agents actually need: travel, local services, events, entertainment, health, financial data, e-commerce, and marketing.

**Built for AI agents, not humans.** Every tool is designed for autonomous discovery, authentication, and invocation via the [Model Context Protocol](https://modelcontextprotocol.io).

<a href="https://glama.ai/mcp/servers/whiteknightonhorse/APIbase">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/whiteknightonhorse/APIbase/badge?v=2" alt="APIbase MCP server" />
</a>

### Why agents use APIbase

- **One MCP endpoint** — `https://apibase.pro/mcp` connects to 14 providers
- **Real-time flight search** — Amadeus + Sabre GDS, 500+ airlines, real prices
- **Places & restaurants** — Foursquare Places API, 100M+ places in 190+ countries
- **Pay per call** — x402 micropayments (USDC), no subscriptions, no minimums
- **Auto-registration** — agents get API keys instantly, zero human setup
- **Production-grade** — 13-stage pipeline, escrow payments, idempotent operations

---

## Quick Start (30 seconds)

### For Claude Desktop / Cursor / Windsurf

**Option A** — Direct connection (Streamable HTTP):

```json
{
  "mcpServers": {
    "apibase": {
      "url": "https://apibase.pro/mcp"
    }
  }
}
```

**Option B** — Via npm package (stdio bridge):

```json
{
  "mcpServers": {
    "apibase": {
      "command": "npx",
      "args": ["-y", "apibase-mcp-client"]
    }
  }
}
```

### For any MCP-compatible agent

```
MCP Endpoint:   https://apibase.pro/mcp
Tool Catalog:   https://apibase.pro/api/v1/tools
Discovery:      https://apibase.pro/.well-known/mcp.json
```

### Register and get your API key

```http
POST /api/v1/agents/register
Content-Type: application/json

{"agent_name": "my-agent", "agent_version": "1.0.0"}
```

Returns `api_key` (`ak_live_...`) and `agent_id`. Store the key securely — it is shown once.

### Call tools via MCP

Connect to `https://apibase.pro/mcp` using the MCP protocol (Streamable HTTP transport).
Authenticate with `Authorization: Bearer ak_live_...`.

All tool calls follow the MCP `tools/call` method.

### Call tools via REST

```http
POST /api/v1/tools/{tool_id}/call
Authorization: Bearer ak_live_...
Content-Type: application/json

{"param1": "value1", "param2": "value2"}
```

---

## Flight Search Example

Ask your AI agent:

> "Find the cheapest flights from New York to London next week"

The agent calls `amadeus.flight_search` and gets real-time prices from 500+ airlines:

```json
{
  "origin": "JFK",
  "destination": "LHR",
  "departure_date": "2026-03-20",
  "adults": 1,
  "travel_class": "ECONOMY",
  "max_results": 5,
  "currency": "USD"
}
```

Returns itineraries with prices, airlines, stops, duration, baggage info — ready for the agent to compare and present.

## Restaurant Search Example

Ask your AI agent:

> "Find the best restaurants near me in Bangkok"

The agent calls `foursquare.place_search` and gets results from 100M+ places worldwide:

```json
{
  "query": "restaurant",
  "near": "Bangkok,Thailand",
  "sort": "rating",
  "limit": 5,
  "open_now": true
}
```

Returns places with names, ratings, categories, distance, hours, price tier, and contact info.

---

## Available Tools (88)

### Finance / Banking / Financial Intelligence (6 tools)

Currency exchange rates, macroeconomic indicators, and banking utilities. 6 free open-data APIs: fawazahmed0 (200+ currencies), Frankfurter/ECB (~33 official fiat), FRED (816K+ US economic series), World Bank (16K+ global indicators), US Treasury Fiscal Data, and OpenIBAN (IBAN validation). All $0 upstream cost.

| Tool | Description | Price |
|------|-------------|-------|
| `finance.exchange_rates` | Exchange rates for 200+ fiat and crypto currencies | $0.002 |
| `finance.ecb_rates` | Official ECB reference rates for ~33 fiat currencies | $0.002 |
| `finance.economic_indicator` | FRED data — GDP, CPI, unemployment, interest rates | $0.005 |
| `finance.country_data` | World Bank data — GDP, population, inflation for 200+ countries | $0.005 |
| `finance.treasury_data` | US Treasury — interest rates, national debt, gold reserves | $0.003 |
| `finance.validate_iban` | Validate IBAN and get bank data (BIC, name, city) | $0.001 |

### Health & Nutrition — Government Data APIs (7 tools)

Free government health databases: USDA FoodData Central (350K+ foods, 150 nutrients), OpenFDA (drug adverse events, food recalls, drug labels), and NIH DSLD (200K+ supplement labels). All CC0/public domain.

| Tool | Description | Price |
|------|-------------|-------|
| `health.food_search` | Search 350K+ foods in the USDA database | $0.002 |
| `health.food_details` | Detailed nutrition data — up to 150 nutrients per food | $0.003 |
| `health.drug_events` | FDA FAERS drug adverse event reports | $0.003 |
| `health.food_recalls` | FDA food enforcement and recall reports | $0.002 |
| `health.drug_labels` | Drug labeling: indications, dosage, warnings, interactions | $0.003 |
| `health.supplement_search` | Search 200K+ dietary supplement labels (NIH DSLD) | $0.002 |
| `health.supplement_details` | Full supplement label: ingredients, amounts, daily values | $0.003 |

### Ticketmaster — Events & Entertainment (7 tools)

Discover concerts, sports, theatre, and festivals across 26+ countries. Real-time event data with pricing, venues, and ticket availability.

| Tool | Description | Price |
|------|-------------|-------|
| `ticketmaster.events_search` | Search events by keyword, city, date, or category | $0.003 |
| `ticketmaster.event_details` | Full event details: dates, venues, prices, images | $0.005 |
| `ticketmaster.events_nearby` | Find events near geographic coordinates | $0.003 |
| `ticketmaster.artist_events` | Find events by artist or performer name | $0.005 |
| `ticketmaster.venue_events` | Get upcoming events at a specific venue | $0.003 |
| `ticketmaster.events_trending` | Get trending and popular events | $0.003 |
| `ticketmaster.events_categories` | Get all event classification categories | $0.001 |

### TMDB — Movies & TV Discovery (7 tools)

The world's largest community-maintained entertainment database. 1M+ movies, 218K+ TV shows, 39 languages. Search, discover, get details, find streaming options.

| Tool | Description | Price |
|------|-------------|-------|
| `tmdb.movie_search` | Search movies, TV shows, and people by name | $0.002 |
| `tmdb.movie_details` | Full movie details: cast, crew, trailers, streaming, budget | $0.005 |
| `tmdb.movie_discover` | Discover movies or TV by genre, year, rating, language | $0.005 |
| `tmdb.movie_trending` | Trending movies, TV shows, or people (daily/weekly) | $0.002 |
| `tmdb.movie_similar` | Movie recommendations based on a movie | $0.003 |
| `tmdb.movie_person` | Search actors/directors or get full filmography | $0.003 |
| `tmdb.movie_where_to_watch` | Find streaming, rental, and purchase options by country | $0.003 |

### Foursquare — Places & Restaurant Discovery (5 tools)

Search restaurants, hotels, cafes, attractions worldwide. 100M+ places in 190+ countries with ratings, tips, and photos.

| Tool | Description | Price |
|------|-------------|-------|
| `foursquare.place_search` | Search places by query, location, category, with filtering | $0.025 |
| `foursquare.place_details` | Full details: hours, rating, price, contact, categories | $0.025 |
| `foursquare.place_tips` | User tips and reviews for a place | $0.030 |
| `foursquare.place_photos` | Venue photos with size and classification options | $0.030 |
| `foursquare.autocomplete` | Autocomplete suggestions for places and addresses | $0.020 |

### Amadeus — Flight Search & Travel Data (7 tools)

Real-time flight data from the world's largest GDS. Search flights across 500+ airlines, check live status, find airports.

| Tool | Description | Price |
|------|-------------|-------|
| `amadeus.flight_search` | Real-time flight offers with prices, airlines, stops, duration | $0.035 |
| `amadeus.flight_price` | Confirm final pricing for a flight offer | $0.020 |
| `amadeus.flight_status` | Real-time flight status — delays, cancellations, gates | $0.005 |
| `amadeus.airport_search` | Airport/city search by keyword or IATA code | $0.003 |
| `amadeus.airport_nearest` | Nearest airports by geographic coordinates | $0.003 |
| `amadeus.airport_routes` | All direct destinations from an airport | $0.003 |
| `amadeus.airline_lookup` | Airline details by IATA or ICAO code | $0.002 |

### Sabre GDS — Flight Search & Travel Data (4 tools)

Alternative flight search via Sabre Global Distribution System. Cross-reference prices with Amadeus for best deals.

| Tool | Description | Price |
|------|-------------|-------|
| `sabre.search_flights` | Real-time flight offers with prices between airports | $0.010 |
| `sabre.destination_finder` | Cheapest flight destinations from an origin airport | $0.005 |
| `sabre.airline_lookup` | Airline details by IATA or ICAO code | $0.002 |
| `sabre.travel_themes` | Travel theme categories (beach, skiing, romantic, etc.) | $0.002 |

### Polymarket — Prediction Markets (11 tools)

Search, analyze, and trade on prediction markets. Real-time odds, order books, and trading via CLOB.

| Tool | Description | Price |
|------|-------------|-------|
| `polymarket.search` | Search prediction markets | $0.0005 |
| `polymarket.market_detail` | Market details with probabilities | $0.0005 |
| `polymarket.prices` | Midpoint price for a token | $0.0005 |
| `polymarket.price_history` | Historical price data | $0.0005 |
| `polymarket.get_orderbook` | Order book depth | $0.0005 |
| `polymarket.trending` | Trending markets by volume | $0.0005 |
| `polymarket.place_order` | Place a limit order (GTC/GTD/FOK) | $0.001 |
| `polymarket.cancel_order` | Cancel an open order | $0.001 |
| `polymarket.open_orders` | Get open orders | $0.0005 |
| `polymarket.trade_history` | Trade history | $0.0005 |
| `polymarket.balance` | Balance and allowance | $0.0005 |

### Hyperliquid — DeFi Perpetuals (6 tools)

On-chain perpetual futures exchange. Market data, order books, positions, and account info.

| Tool | Description | Price |
|------|-------------|-------|
| `hyperliquid.market_data` | Market data and funding rates | $0.002 |
| `hyperliquid.order_book` | Order book depth | $0.003 |
| `hyperliquid.klines` | Candlestick / OHLCV data | $0.003 |
| `hyperliquid.positions` | User positions | $0.005 |
| `hyperliquid.account` | Account summary | $0.005 |
| `hyperliquid.vault` | Vault details | $0.005 |

### AsterDEX — DeFi Perpetuals (4 tools)

Decentralized perpetual exchange on Asterism. Market data, order books, and candlestick charts.

| Tool | Description | Price |
|------|-------------|-------|
| `aster.exchange_info` | Exchange info and trading pairs | $0.001 |
| `aster.market_data` | Market data and 24h stats | $0.002 |
| `aster.order_book` | Order book depth | $0.003 |
| `aster.klines` | Candlestick / OHLCV data | $0.003 |

### CoinGecko — Crypto Market Data (9 tools)

Real-time and historical crypto data for 10,000+ coins. Prices, market overviews, trending assets, and DEX pool data via GeckoTerminal.

| Tool | Description | Price |
|------|-------------|-------|
| `crypto.get_price` | Real-time prices for any cryptocurrency | $0.001 |
| `coingecko.get_market` | Market overview with sorting and filtering | $0.001 |
| `crypto.coin_detail` | Detailed coin info (market data, community, dev stats) | $0.002 |
| `crypto.price_history` | Historical price charts (up to 365 days) | $0.002 |
| `crypto.trending` | Currently trending coins on CoinGecko | $0.001 |
| `crypto.global` | Global crypto market statistics | $0.001 |
| `crypto.search` | Search coins, exchanges, and categories | $0.001 |
| `crypto.dex_pools` | DEX liquidity pools via GeckoTerminal | $0.001 |
| `crypto.token_by_address` | Token info by contract address via GeckoTerminal | $0.001 |

---

## Payment

| Field | Value |
|-------|-------|
| Protocol | **x402** (HTTP 402 Payment Required) |
| Token | USDC on Base |
| Address | `0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480` |

No subscriptions. No minimums. Pay only for what you use.

## Authentication

| Method | Header | Format |
|--------|--------|--------|
| API Key | `Authorization` | `Bearer ak_live_<32hex>` |
| x402 Payment | `X-Payment` | Base64-encoded payment receipt |

## Response Format

All responses include:
- `X-Request-ID` header for tracing
- JSON body with tool-specific `data` field
- Standard error codes on failure

## Rate Limits

- Per-agent, per-tool token bucket
- Global tier limits: free (20 req/s), paid (100 req/s)
- `429` with `Retry-After` header on limit exceeded
- Redis-backed, fail-closed

## Error Codes

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `validation_error` | Invalid parameters |
| 401 | `unauthorized` | Missing or invalid API key |
| 402 | `payment_required` | x402 payment needed |
| 404 | `not_found` | Tool or resource not found |
| 406 | `not_acceptable` | Wrong Accept header (use `application/json`) |
| 429 | `rate_limited` | Rate limit exceeded |
| 500 | `internal_error` | Server error |
| 502 | `bad_gateway` | Provider unavailable |
| 503 | `service_unavailable` | System not ready |

## MCP Discovery

```json
GET /.well-known/mcp.json

{
  "name": "APIbase",
  "protocol": "MCP",
  "version": "1.0",
  "mcp_endpoint": "https://apibase.pro/mcp",
  "authentication": "x402"
}
```

## Integrations

Connect APIbase to any AI platform:

| Platform | Config location | Setup |
|----------|----------------|-------|
| **Claude Desktop** | `claude_desktop_config.json` | `"url": "https://apibase.pro/mcp"` |
| **Cursor** | `.cursor/mcp.json` | `"url": "https://apibase.pro/mcp"` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | `"serverUrl": "https://apibase.pro/mcp"` |
| **VS Code** | `.vscode/settings.json` | `"url": "https://apibase.pro/mcp"` |
| **Continue.dev** | `~/.continue/config.json` | Streamable HTTP transport |
| **OpenAI GPT** | GPT Editor > Actions | Import `https://apibase.pro/.well-known/openapi.json` |
| **OpenClaw** | `~/.openclaw/openclaw.json` | `"url": "https://apibase.pro/mcp"` |
| **MCP.so** | [mcp.so/server/apibase](https://mcp.so/server/apibase----universal-api-hub-for-ai-agents/whiteknightonhorse) | Listed in directory |

<details>
<summary>Claude Desktop / Cursor</summary>

```json
{
  "mcpServers": {
    "apibase": {
      "url": "https://apibase.pro/mcp"
    }
  }
}
```
</details>

<details>
<summary>Windsurf</summary>

```json
{
  "mcpServers": {
    "apibase": {
      "serverUrl": "https://apibase.pro/mcp"
    }
  }
}
```
</details>

<details>
<summary>VS Code (Copilot)</summary>

```json
{
  "mcp": {
    "servers": {
      "apibase": {
        "type": "http",
        "url": "https://apibase.pro/mcp"
      }
    }
  }
}
```
</details>

<details>
<summary>Continue.dev</summary>

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "streamable-http",
          "url": "https://apibase.pro/mcp"
        }
      }
    ]
  }
}
```
</details>

<details>
<summary>OpenAI GPT Actions</summary>

1. Go to GPT Editor > Actions tab
2. Click "Import from URL"
3. Enter: `https://apibase.pro/.well-known/openapi.json`
4. Set Authentication: API Key, Header `Authorization`, prefix `Bearer`
5. Save — all tools auto-discovered from spec
</details>

<details>
<summary>OpenClaw</summary>

Add to `~/.openclaw/openclaw.json`:

```json
{
  "provider": {
    "mcpServers": {
      "apibase": {
        "url": "https://apibase.pro/mcp"
      }
    }
  }
}
```

Or via CLI:
```bash
openclaw config set provider.mcpServers.apibase.url "https://apibase.pro/mcp"
```
</details>

---

## Architecture

- **13-stage pipeline**: AUTH → IDEMPOTENCY → SCHEMA_VALIDATION → CACHE → RATE_LIMIT → ESCROW → PROVIDER_CALL → LEDGER → RESPONSE
- **Fail-closed**: Redis down = reject all requests, no silent degradation
- **Idempotent**: same request + same key = same result, no double charges
- **Observable**: Prometheus metrics, Grafana dashboards, structured logging

## Self-Hosting

```bash
git clone https://github.com/whiteknightonhorse/APIbase.git
cp .env.example .env    # configure secrets
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Requires: Docker, PostgreSQL 16, Redis 7.2, Node.js 20.

16 containers: API, Worker, Outbox, PostgreSQL, Redis, Nginx, Prometheus, Grafana, Loki, Promtail, Alertmanager, and exporters.

## License

[MIT](LICENSE)