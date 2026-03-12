# APIbase MCP Client

MCP client for [APIbase.pro](https://apibase.pro) — connect AI agents to 56+ tools (flights, prediction markets, weather, and more) via the Model Context Protocol.

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

## Authentication

Three modes (in priority order):

1. **CLI argument**: `npx apibase-mcp-client ak_live_YOUR_KEY`
2. **Environment variable**: `APIBASE_API_KEY=ak_live_YOUR_KEY`
3. **Auto-register**: omit the key — APIbase creates one automatically on first request

## Available Tools

56+ tools across categories:

- **Flights**: search, price, status (Amadeus, Sabre)
- **Prediction Markets**: Polymarket events, prices, orderbooks
- **Trading**: Hyperliquid, AsterDEX market data
- **Weather**: current, forecast, alerts (OpenWeatherMap)
- **And more** — new providers added regularly

Use `tools/list` to discover all available tools.

## How It Works

Stdio-to-HTTP bridge: translates MCP stdio transport (used by Claude Desktop, Cursor, etc.) to Streamable HTTP transport (used by APIbase server). No tool re-registration — pure transport proxy.

## Links

- [APIbase.pro](https://apibase.pro)
- [GitHub](https://github.com/whiteknightonhorse/APIbase)
- [MCP Protocol](https://modelcontextprotocol.io)
