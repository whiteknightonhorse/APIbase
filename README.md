# APIbase.pro — The API Hub for AI Agents

One MCP + REST endpoint to 1383 tools from 400 providers. No signup, no subscription, no API key to start — pay per call in USDC (x402 on Base or MPP on Tempo).

[![Security Audit](https://github.com/whiteknightonhorse/APIbase/actions/workflows/security.yml/badge.svg)](https://github.com/whiteknightonhorse/APIbase/actions/workflows/security.yml)
[![Deploy](https://github.com/whiteknightonhorse/APIbase/actions/workflows/deploy.yml/badge.svg)](https://github.com/whiteknightonhorse/APIbase/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-Listed-blue)](https://registry.modelcontextprotocol.io)
[![Smithery](https://img.shields.io/badge/Smithery-Live-brightgreen)](https://smithery.ai/servers/apibase-pro/api-hub)
[![MPPScan](https://img.shields.io/badge/MPPScan-Listed-purple)](https://www.mppscan.com/server/2ce70c5f97be51cfcabe13aad9b5f4beae6dc77be586357e04db17644729303d)

Latest release: see the tag that equals package.json `version`; release notes in docs/releases/.

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
- **MCP protocol versions** — 2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05, 2024-10-07 (Streamable HTTP on `/mcp`); revision 2026-07-28 is not served yet (the released SDK does not support it). Current list: `protocolVersions` in mcp.json
- **[openapi.json](https://apibase.pro/.well-known/openapi.json)** — OpenAPI 3.1 spec
- **[api-catalog](https://apibase.pro/.well-known/api-catalog)** — RFC 9727 discovery linkset
- **[Roadmap](docs/ROADMAP.md)** — planned/shipped changes that affect what an agent can do or see

---

## For Merchants — Integrator

AI payment for merchants: a merchant gets its own MCP storefront, and a buyer's agent gets a quote and pays in USDC (x402 on Base, MPP on Tempo) straight to the merchant wallet. Non-custodial; fee 0% during the pilot.

- **[Overview](https://apibase.pro/integrator)** — what it is and how to connect
- **[Agent guide](https://apibase.pro/integrator/agent-guide)** — step-by-step connection for a merchant's agent
- **[WooCommerce plugin](https://apibase.pro/integrator/platforms/woocommerce)** — catalog sync and paid-order webhook
- **[Demo shop](https://apibase.pro/m/apibase-demo)** — a live storefront
- **[Integrator guide](https://apibase.pro/integrator/docs)** (source: static/integrator/docs.md); operator notes: docs/integrator.md

---

## For paying agents: what protects your money

- **Fixed price before payment** — the 402 response states the exact amount and recipient; see [payments](docs/payments.md).
- **Payment identifier / idempotency** — persist the id and signed payload before you send, re-send after a crash: [agent guide](https://apibase.pro/integrator/agent-guide#before-you-send-a-payment-write-the-intent-down).
- **Public receipts** — `https://apibase.pro/r/<id>.json`, see [receipts](docs/payments.md#public-receipts-a-ga-01). Attest one on GenLayer at `https://apibase.pro/attest/?r=<id>`: contract [`0x1bD4C0EBC9b365905d4EBC84b944d861499afe6E`](https://scan.bradbury.genlayer.com/address/0x1bD4C0EBC9b365905d4EBC84b944d861499afe6E) on Bradbury Phase 2 (chain 4221, test network), client library `genlayer-js` 2.0.0-rc.2.
- **Several agents, one budget** — [buyers](https://apibase.pro/integrator/buyers).
- **Tool definition fingerprint** — [discover-tools](https://apibase.pro/.well-known/agent-skills/discover-tools.md) and `/api/v1/tools/manifest`.

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

Single Node.js/TypeScript API server, PostgreSQL as the append-only financial source of truth, Redis for cache/rate-limiting only, multi-container Docker stack on one Hetzner server. Every tool call runs the same multi-stage pipeline (escrow-first, idempotent, content-moderated, fail-closed on payment, cache and rate limit; the idempotency stage fails open on Redis errors) — dual-rail payments (self-hosted x402 facilitator + MPP), error-code contract, and full container/pipeline detail (exact counts, live): [`docs/architecture.md`](docs/architecture.md).

## License

[MIT](LICENSE)
