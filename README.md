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

### Polymarket — Prediction Markets (12 tools)

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

Trading tools use the `@polymarket/clob-client` SDK with Builder attribution for revenue.

### Hyperliquid — DeFi Perpetuals (6 tools)

| Tool | Description | Price |
|------|-------------|-------|
| `hyperliquid.market_data` | Market data and funding rates | $0.002 |
| `hyperliquid.order_book` | Order book depth | $0.003 |
| `hyperliquid.klines` | Candlestick / OHLCV data | $0.003 |
| `hyperliquid.positions` | User positions | $0.005 |
| `hyperliquid.account` | Account summary | $0.005 |
| `hyperliquid.vault` | Vault details | $0.005 |

### AsterDEX — DeFi Perpetuals (4 tools)

| Tool | Description | Price |
|------|-------------|-------|
| `aster.exchange_info` | Exchange info and trading pairs | $0.001 |
| `aster.market_data` | Market data and 24h stats | $0.002 |
| `aster.order_book` | Order book depth | $0.003 |
| `aster.klines` | Candlestick / OHLCV data | $0.003 |

## Payment

Protocol: **x402** (HTTP 402 Payment Required)
Token: USDC on Base
Address: `0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480`

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
