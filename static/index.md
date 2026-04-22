# APIbase.pro

> The API Hub for AI Agents — 502 API tools from 158+ providers via one MCP endpoint.

## What this is

APIbase aggregates 502 production API tools from 158+ providers into a single
Model Context Protocol (MCP) endpoint. Any AI agent can discover, call, and pay
for tools through one entry point — no provider-by-provider signup, no API-key
juggling, no per-provider billing.

- **MCP endpoint:** `POST https://apibase.pro/mcp` (Streamable HTTP)
- **Tool catalog:** `GET https://apibase.pro/api/v1/tools` (all 502 tools with JSON schemas)
- **OpenAPI 3.1 spec:** `GET https://apibase.pro/.well-known/openapi.json`
- **Health:** `GET https://apibase.pro/health/ready`

## Quick start for agents

1. **Connect** — POST to `/mcp` using any MCP-compatible client (Claude Desktop,
   Cursor, Windsurf, OpenAI SDK, LangChain, CrewAI, Google ADK, Copilot Studio).
2. **Discover** — call the `discover_tools` prompt with a `category` or `task`
   argument. Instead of loading all 502 tool schemas into context, fetch only
   the tools relevant to the current agent goal.
3. **Call** — `tools/call` with any tool name. The 13-stage pipeline handles
   authentication, idempotency, schema validation, caching, rate limiting,
   escrow, the provider call, ledger write, and the response.

## Authentication

- Auto-registration: the first request creates agent credentials automatically.
- API key format: `ak_live_<32 hex>` in `Authorization: Bearer <key>`.
- Alternative: `Authorization: Payment <base64url>` (MPP) or `X-PAYMENT: <base64>` (x402).

## Payments

Two payment rails are supported in parallel — agents pick the one that matches
their wallet.

| Rail | Standard | Token | Network | Header |
|---|---|---|---|---|
| x402 | HTTP 402 (Coinbase) | USDC | Base mainnet | `X-PAYMENT` |
| MPP | Machine Payments Protocol (Stripe/Tempo) | USDC.e | Tempo mainnet | `Authorization: Payment` |

Tool prices: **$0.001–$0.035 per call**, depending on upstream cost.

Full payment metadata: <https://apibase.pro/.well-known/x402-payment.json>

## Tool categories (21)

travel, weather, finance, crypto, search, news, location, health,
entertainment, education, jobs, space, social, legal, business,
developer, media, infrastructure, messaging, marketing, world.

## Discovery artifacts

- MCP manifest: <https://apibase.pro/.well-known/mcp.json>
- A2A Agent Card: <https://apibase.pro/.well-known/agent.json>
- MCP server card (full tool list): <https://apibase.pro/.well-known/mcp/server-card.json>
- AI capabilities: <https://apibase.pro/.well-known/ai-capabilities.json>
- API Catalog (RFC 9727): <https://apibase.pro/.well-known/api-catalog>
- Agent Skills index: <https://apibase.pro/.well-known/agent-skills/index.json>
- KYA policy: <https://apibase.pro/.well-known/kya-policy.json>
- OpenAPI 3.1: <https://apibase.pro/.well-known/openapi.json>
- Human-readable agent guide: <https://apibase.pro/ai.txt>
- LLM guide: <https://apibase.pro/llms.txt>
- Sitemap: <https://apibase.pro/sitemap.xml>

## Source & contact

- GitHub: <https://github.com/whiteknightonhorse/APIbase>
- Status: 16/16 production containers healthy
- Region: Hetzner (EU)
