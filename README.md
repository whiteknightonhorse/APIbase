# APIbase.pro

The API Hub for AI Agents. One endpoint, all tools.

## Agent Quick Start

```
MCP Endpoint:   https://apibase.pro/mcp
Tool Catalog:   https://apibase.pro/api/v1/tools
Health:         https://apibase.pro/health/ready
Discovery:      https://apibase.pro/.well-known/mcp.json
```

### 1. Discover Tools

```http
GET /api/v1/tools
Accept: application/json
```

Returns all available tools with IDs, parameters, pricing, and cache TTLs.

### 2. Register Agent

```http
POST /api/v1/agents/register
Content-Type: application/json
Accept: application/json

{"agent_name": "my-agent", "agent_version": "1.0.0"}
```

Returns `api_key` (`ak_live_...`) and `agent_id`. Store the key securely — it is shown once.

### 3. Call Tools via MCP

Connect to `https://apibase.pro/mcp` using the MCP protocol (SSE transport).
Authenticate with `Authorization: Bearer ak_live_...`.

All tool calls follow the MCP `tools/call` method.

### 4. Call Tools via REST

```http
GET /api/v1/tools/{tool_id}?param1=value1&param2=value2
Authorization: Bearer ak_live_...
Accept: application/json
```

## Available Tools

| Provider | Tools | Category | Auth Required |
|----------|-------|----------|---------------|
| Polymarket | `polymarket.search`, `polymarket.market_detail`, `polymarket.prices`, `polymarket.price_history`, `polymarket.get_orderbook`, `polymarket.trending`, `polymarket.leaderboard` | Predictions | No (read-only) |
| Hyperliquid | `hyperliquid.market_data`, `hyperliquid.order_book`, `hyperliquid.klines`, `hyperliquid.positions`, `hyperliquid.account`, `hyperliquid.vault` | DeFi/Perps | No (read-only) |
| AsterDEX | `aster.exchange_info`, `aster.market_data`, `aster.order_book`, `aster.klines` | DeFi/Perps | No (read-only) |
| OpenWeatherMap | `weather.get_current`, `weather.get_forecast`, `weather.get_alerts`, `weather.get_history`, `weather.air_quality`, `weather.geocode`, `weather.compare` | Weather | API key |
| CoinGecko | `crypto.get_price`, `crypto.coin_detail`, `crypto.price_history`, `crypto.trending`, `crypto.global`, `crypto.dex_pools`, `crypto.search` | Crypto | API key |

## Payment

Protocol: **x402** (HTTP 402 Payment Required)
Token: USDC on Base
Address: `0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480`

Free-tier tools (Polymarket, Hyperliquid, AsterDEX public endpoints) do not require payment.

## Authentication

| Method | Header | Format |
|--------|--------|--------|
| API Key | `Authorization` | `Bearer ak_live_<32hex>` |
| x402 Payment | `X-Payment` | Base64-encoded payment receipt |

Unauthenticated requests to `/mcp` return `401`.

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

## Self-Hosting

```bash
git clone https://github.com/whiteknightonhorse/APIbase.git
cp .env.example .env    # configure secrets
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Requires: Docker, PostgreSQL 16, Redis 7.2, Node.js 20.

## License

Proprietary. All rights reserved.
