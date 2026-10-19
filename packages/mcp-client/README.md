# APIbase MCP Client

MCP client for [APIbase.pro](https://apibase.pro) — connect AI agents to APIbase's live tool catalog (counts: https://apibase.pro/llms.txt) via the Model Context Protocol. Dual-rail payments: x402 (USDC on Base) + MPP (USDC.e on Tempo/Stripe).

Available as two identical packages:

| Package | Install |
|---------|---------|
| `@apibase11/mcp-client` | `npx -y @apibase11/mcp-client` |
| `apibase-mcp-client` | `npx -y apibase-mcp-client` |

## Quick Start

```bash
npx -y apibase-mcp-client
```

## Usage

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apibase": {
      "command": "npx",
      "args": ["-y", "@apibase11/mcp-client"]
    }
  }
}
```

With API key:

```json
{
  "mcpServers": {
    "apibase": {
      "command": "npx",
      "args": ["-y", "@apibase11/mcp-client", "ak_live_YOUR_KEY"]
    }
  }
}
```

Or via environment variable:

```json
{
  "mcpServers": {
    "apibase": {
      "command": "npx",
      "args": ["-y", "@apibase11/mcp-client"],
      "env": {
        "APIBASE_API_KEY": "ak_live_YOUR_KEY"
      }
    }
  }
}
```

### Cursor / Windsurf / VS Code

Same config pattern — add to your MCP settings:

```json
{
  "command": "npx",
  "args": ["-y", "apibase-mcp-client"]
}
```

### Streamable HTTP (no client needed)

Most modern MCP clients support remote servers directly:

```json
{
  "mcpServers": {
    "apibase": {
      "url": "https://apibase.pro/mcp"
    }
  }
}
```

## Authentication

Three modes (in priority order):

1. **CLI argument**: `npx apibase-mcp-client ak_live_YOUR_KEY`
2. **Environment variable**: `APIBASE_API_KEY=ak_live_YOUR_KEY`
3. **Auto-register**: omit the key — APIbase creates one automatically on first request

## Payment

APIbase supports **dual-rail payments** — agents can pay using either protocol:

| Protocol | Network | Token | How |
|----------|---------|-------|-----|
| **x402** | Base | USDC | `X-Payment` header, or `params._meta["x402/payment"]` (x402 MCP transport v2) |
| **MPP** | Tempo (Stripe) | USDC | `Authorization: Payment` or `Payment-Authorization: Payment` header |

A paid MCP tool call without payment returns `isError: true` with the payment requirements in `_meta["x402/payment-required"]` (the same object as the HTTP 402 body); after a settled call the result `_meta["x402/payment-response"]` holds the receipt. A payment in both the header and `_meta` with different payloads is a 400. Header users change nothing.

Free tools work without payment. Paid tools return HTTP 402 with payment instructions for both protocols. Use [mppx](https://www.npmjs.com/package/mppx) SDK or [Tempo CLI](https://tempo.xyz) for automatic payment handling.

x402 clients on `@x402/fetch` >= 2.23 refuse amounts above $1 by default (`spendControls`); tools priced above $1 need `spendControls: false` or an explicit cap.

```bash
# AgentCash — one-command setup
npx agentcash add https://apibase.pro
```

## Available Tools

Live catalog by category (counts: https://apibase.pro/llms.txt):

- **Travel**: flights, hotels, airports (Amadeus, Sabre, Aviasales)
- **Finance**: stocks, forex, economic data (Finnhub, ECB, FRED)
- **Crypto**: prices, markets, DEX, prediction markets (CoinGecko, Polymarket, Hyperliquid)
- **Search**: web, news, semantic, AI (Serper, Tavily, Exa)
- **Health**: nutrition, drugs, clinical trials (USDA, OpenFDA, ClinicalTrials.gov)
- **Maps**: geocoding, routing, walkability (Geoapify, Walk Score)
- **Entertainment**: movies, games, anime, music (TMDB, RAWG, IGDB, Jikan)
- **Legal**: regulations, court opinions, SEC filings (Regulations.gov, CourtListener, EDGAR)
- **Infrastructure**: DNS, domains, browser sessions (Cloudflare, NameSilo, Browserbase)
- **And more** — education, jobs, space, weather, messaging, AI tools

Use `tools/list` to discover all available tools.

## How It Works

Stdio-to-HTTP bridge: translates MCP stdio transport (used by Claude Desktop, Cursor, etc.) to Streamable HTTP transport (used by APIbase server). No tool re-registration — pure transport proxy.

## Links

- [APIbase.pro](https://apibase.pro)
- [Dashboard](https://apibase.pro/dashboard)
- [Tool Catalog](https://apibase.pro/api/v1/tools)
- [GitHub](https://github.com/whiteknightonhorse/APIbase)
- [MPPScan](https://www.mppscan.com/server/2ce70c5f97be51cfcabe13aad9b5f4beae6dc77be586357e04db17644729303d)
- [MCP Protocol](https://modelcontextprotocol.io)
