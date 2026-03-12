# APIbase.pro — The API Hub for AI Agents

> Search flights, compare prices, track status, trade prediction markets — all via MCP.
> One endpoint. 33 tools. 5 providers. Pay per call.

**[Live Platform](https://apibase.pro)** | **[Tool Catalog](https://apibase.pro/api/v1/tools)** | **[MCP Endpoint](https://apibase.pro/mcp)** | **[Health](https://apibase.pro/health/ready)**

---

## What is APIbase?

APIbase is a production MCP server that gives AI agents instant access to real-world APIs — flight search, prediction markets, DeFi trading, and more. No SDK installation, no API key juggling, no rate limit management. Connect once, use 33 tools.

**Built for AI agents, not humans.** Every tool is designed for autonomous discovery, authentication, and invocation via the [Model Context Protocol](https://modelcontextprotocol.io).

<a href="https://glama.ai/mcp/servers/whiteknightonhorse/APIbase">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/whiteknightonhorse/APIbase/badge?v=2" alt="APIbase MCP server" />
</a>

### Why agents use APIbase

- **One MCP endpoint** — `https://apibase.pro/mcp` connects to 5 providers
- **Real-time flight search** — Amadeus + Sabre GDS, 500+ airlines, real prices
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

---

## Available Tools (33)

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