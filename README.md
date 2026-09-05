# APIbase.pro — The API Hub for AI Agents

Production MCP server: one endpoint gives AI agents access to 1345 tools from 383 providers, pay-per-call via x402 (USDC on Base) or MPP (USDC on Tempo).

[![Security Audit](https://github.com/whiteknightonhorse/APIbase/actions/workflows/security.yml/badge.svg)](https://github.com/whiteknightonhorse/APIbase/actions/workflows/security.yml)
[![Deploy](https://github.com/whiteknightonhorse/APIbase/actions/workflows/deploy.yml/badge.svg)](https://github.com/whiteknightonhorse/APIbase/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-Listed-blue)](https://registry.modelcontextprotocol.io)
[![Smithery](https://img.shields.io/badge/Smithery-Live-brightgreen)](https://smithery.ai/servers/apibase-pro/api-hub)
[![MPPScan](https://img.shields.io/badge/MPPScan-Listed-purple)](https://www.mppscan.com/server/2ce70c5f97be51cfcabe13aad9b5f4beae6dc77be586357e04db17644729303d)

---

## Quick Start

```json
{
  "mcpServers": {
    "apibase": { "url": "https://apibase.pro/mcp" }
  }
}
```

That's the Claude Desktop config. Cursor, Windsurf, OpenAI Agents SDK, LangChain, Google ADK, CrewAI, Microsoft Copilot Studio, and plain REST: **[apibase.pro/connect](https://apibase.pro/connect)**.

---

## For AI Agents

- **[llms.txt](https://apibase.pro/llms.txt)** — concise LLM context
- **[ai.txt](https://apibase.pro/ai.txt)** — plain-text agent discovery
- **[mcp.json](https://apibase.pro/.well-known/mcp.json)** — MCP server metadata
- **[openapi.json](https://apibase.pro/.well-known/openapi.json)** — OpenAPI 3.1 spec
- **[api-catalog](https://apibase.pro/.well-known/api-catalog)** — RFC 9727 discovery linkset

---

## Integrations & Registries

**[Full framework guides →](https://apibase.pro/frameworks)**

Registry listings: [Smithery](https://smithery.ai/servers/apibase-pro/api-hub) · [Glama](https://glama.ai/mcp/servers/whiteknightonhorse/APIbase) · [MCP Registry](https://registry.modelcontextprotocol.io) (`io.github.whiteknightonhorse/apibase`) · [PulseMCP](https://pulsemcp.com) · [MPPScan](https://www.mppscan.com)

---

## Self-Hosting

```bash
git clone https://github.com/whiteknightonhorse/APIbase.git && cd APIbase
cp .env.example .env   # set POSTGRES_PASSWORD, X402_PAYMENT_ADDRESS, provider keys
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Full prerequisites, verification steps, and config reference: [`docs/self-hosting.md`](docs/self-hosting.md).

---

## Architecture

Single Node.js/TypeScript API server, PostgreSQL as the append-only financial source of truth, Redis for cache/rate-limiting only, multi-container Docker stack on one Hetzner server. Every tool call runs the same multi-stage pipeline (escrow-first, idempotent, fail-closed, content-moderated) — dual-rail payments (self-hosted x402 facilitator + MPP), error-code contract, and full container/pipeline detail (exact counts, live): [`docs/architecture.md`](docs/architecture.md).

## License

[MIT](LICENSE)
