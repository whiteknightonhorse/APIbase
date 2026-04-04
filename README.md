# APIbase.pro — The API Hub for AI Agents

> One MCP endpoint. 443 tools. 134 providers. Pay per call with x402 (USDC on Base) or MPP (USDC on Tempo).

**[Live Platform](https://apibase.pro)** | **[Tool Catalog](https://apibase.pro/api/v1/tools)** | **[MCP Endpoint](https://apibase.pro/mcp)** | **[Frameworks](https://apibase.pro/frameworks)** | **[Dashboard](https://apibase.pro/dashboard)**

[![Security Audit](https://github.com/whiteknightonhorse/APIbase/actions/workflows/security.yml/badge.svg)](https://github.com/whiteknightonhorse/APIbase/actions/workflows/security.yml)
[![Deploy](https://github.com/whiteknightonhorse/APIbase/actions/workflows/deploy.yml/badge.svg)](https://github.com/whiteknightonhorse/APIbase/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-v1.0.2-blue)](https://registry.modelcontextprotocol.io)
[![Smithery](https://img.shields.io/badge/Smithery-Live-brightgreen)](https://smithery.ai/servers/apibase-pro/api-hub)
[![MPPScan](https://img.shields.io/badge/MPPScan-Listed-purple)](https://www.mppscan.com/server/2ce70c5f97be51cfcabe13aad9b5f4beae6dc77be586357e04db17644729303d)

<a href="https://glama.ai/mcp/servers/whiteknightonhorse/APIbase">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/whiteknightonhorse/APIbase/badge?v=2" alt="APIbase MCP server" />
</a>

---

## Product Demo

https://github.com/user-attachments/assets/9e598d61-b2d0-486c-bd34-f0cb0354d09c

> 12-slide walkthrough: connect → discover tools → 13-stage pipeline → dual-rail payments → analytics. [Full interactive version →](https://apibase.pro/video/)

---

## What is APIbase?

Production MCP server that gives AI agents access to 443 real-world API tools through a single endpoint. Agents connect once to `https://apibase.pro/mcp` and can search flights, get stock quotes, translate text, check weather alerts, generate images, send emails, look up holidays, shorten URLs, detect fires by satellite, decode VINs, look up chemical compounds, find EV chargers, batch multiple calls, track usage analytics — and 250+ more tools across 30+ categories.

**Built for AI agents, not humans.** Auto-registration, zero setup, pay-per-call via x402 USDC micropayments on Base or MPP (Machine Payments Protocol) on Tempo.

---

## Quick Start (30 seconds)

### Claude Desktop / Cursor / Windsurf

```json
{
  "mcpServers": {
    "apibase": {
      "url": "https://apibase.pro/mcp"
    }
  }
}
```

### Multi-server setup (recommended)

Combine APIbase (real-world APIs) with Playwright (browser) and Context7 (docs):

```json
{
  "mcpServers": {
    "apibase": { "url": "https://apibase.pro/mcp" },
    "playwright": { "command": "npx", "args": ["-y", "@playwright/mcp"] },
    "context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp"] }
  }
}
```

### Via npm (stdio bridge)

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

### REST API

```bash
# Register and get API key
curl -X POST https://apibase.pro/api/v1/agents/register \
  -H "Content-Type: application/json" \
  -d '{"agent_name": "my-agent", "agent_version": "1.0.0"}'

# Call any tool
curl -X POST https://apibase.pro/api/v1/tools/finnhub.quote/call \
  -H "Authorization: Bearer ak_live_..." \
  -H "Content-Type: application/json" \
  -d '{"symbol": "AAPL"}'
```

---

## Tool Categories (443 tools, 134 providers)

| Category | Tools | Providers | Examples |
|----------|-------|-----------|----------|
| **Web Search** | 11 | Serper, Tavily, Exa, Spider.cloud | Google search, AI search, semantic search, web scraping |
| **News & Events** | 10 | NewsData, GDELT, Mastodon, Currents API | Global news (65 langs), crypto news, trending |
| **Social** | 7 | Bluesky, TwitterAPI.io | Search posts, profiles, feeds (AT Protocol, X/Twitter) |
| **Travel & Flights** | 17 | Amadeus, Sabre, Aviasales | Flight search, pricing, status, airports |
| **Finance & Stocks** | 16 | Finnhub, CoinGecko, ECB, FRED | Stock quotes, OHLCV, FX rates, economic data |
| **Banking Data** | 6 | FDIC BankFind, IBANAPI | US bank financials, branch locations, institution search, IBAN validation |
| **Company Data** | 8 | SEC EDGAR, Companies House, GLEIF | US filings + UK registry + global LEI (200+ countries) |
| **Currency Conversion** | 2 | ExchangeRate-API | 160+ currencies, real-time conversion |
| **Tax & VAT** | 3 | VATcomply | EU VAT validation, rates, ECB exchange rates |
| **Maps & Geo** | 7 | Geoapify | Geocode, routing, POI search, isochrone |
| **Address (US/CA)** | 2 | Geocodio | Geocode, reverse geocode, USPS-standard |
| **Real Estate** | 4 | Walk Score, US Real Estate | Walkability, property listings, details |
| **Entertainment** | 24 | TMDB, Ticketmaster, RAWG, IGDB, Jikan | Movies, events, games, anime |
| **Art & Culture** | 5 | Europeana, ARTIC | 50M+ EU objects + 120K Chicago artworks |
| **Stock Media** | 3 | Pexels | Free stock photos & videos, commercial use |
| **Music** | 9 | MusicBrainz, ListenBrainz, RadioBrowser, AudD | Artists, albums, radio, song recognition, lyrics |
| **Podcasts** | 7 | PodcastIndex, Listen Notes | Search 4M+ podcasts, 186M+ episodes, best by genre |
| **Health & Nutrition** | 7 | USDA, OpenFDA, NIH | Food data, drug safety, supplements |
| **Chemistry & Biology** | 16 | PubChem, RCSB PDB, NCI CACTUS, Materials Project | 100M+ compounds, 220K+ proteins, 150K+ materials, chemical ID converter |
| **EV Charging** | 3 | Open Charge Map | 300K+ charging stations worldwide, connectors, power levels |
| **Fraud Detection** | 4 | IPQualityScore | IP/email/URL/phone fraud scoring, VPN/proxy/bot detection |
| **Disease Data** | 7 | disease.sh, WHO GHO | COVID/Influenza global disease statistics, WHO global health data |
| **Clinical Trials** | 3 | ClinicalTrials.gov | 577K+ trials, drug research, recruiting |
| **Nutrition Database** | 2 | FatSecret | 2.3M+ foods, calories, macros, vitamins |
| **Education & Research** | 7 | OpenAlex, arXiv, PubMed, CrossRef | Papers, colleges, DOI lookup |
| **Jobs & Career** | 20 | Adzuna, TheirStack, Jooble, Reed, Remotive, Arbeitnow, BLS, ESCO | Global job search, UK/EU/remote, salary data, tech stack analysis |
| **Legal & Regulatory** | 8 | Regulations.gov, Federal Register, CourtListener | US regulations, court opinions, executive orders |
| **Air Quality** | 2 | IQAir AirVisual | AQI, pollutants (PM2.5/O3), 30K+ stations |
| **Weather** | 10 | WeatherAPI.com, NWS, NOAA, NASA FIRMS | Current/forecast, hourly, observations, astronomy, alerts, fire detection |
| **Space & Astronomy** | 9 | NASA, JPL | APOD, asteroids, fireballs, solar flares |
| **Translation** | 3 | Langbly | 90+ languages, language detection |
| **Sports** | 7 | API-Sports, BallDontLie | Football (2000+ leagues), NBA, NFL |
| **Holidays & Calendar** | 3 | Nager.Date, Calendarific | 230+ countries, national/religious/observance |
| **Image Generation** | 1 | Stability AI | Stable Diffusion, 16 style presets |
| **OCR** | 1 | OCR.space | Text from images/PDFs, 20+ languages |
| **Speech-to-Text** | 3 | AssemblyAI | Transcribe audio, 99 languages, diarization |
| **PDF & Documents** | 6 | API2PDF, ConvertAPI | HTML/URL to PDF, DOCX↔PDF, 200+ formats |
| **Email & SMS** | 4 | Resend, Twilio | Send emails, SMS, phone lookup |
| **Messaging** | 5 | Telegram | Send messages, photos, documents via bot |
| **URL Shortener** | 2 | Short.io | Custom branded short links + stats |
| **SSL & Domain** | 10 | WhoisXML, ssl-checker.io, ThreatIntel | WHOIS, DNS, SSL, domain reputation, malware check |
| **Barcode & QR** | 4 | QRServer, UPCitemdb | Generate/read QR, barcode lookup |
| **Business Intel** | 1 | Hunter.io | Company emails, enrichment, 50M+ domains |
| **E-commerce** | 12 | Zinc, Canopy API, Diffbot, Zyte | Product search, Amazon (12 marketplaces), web extraction |
| **Memes & Fun** | 2 | Imgflip | 100K+ meme templates, generate captioned meme images |
| **AI Marketing** | 7 | AIPush | AI-optimized pages, visibility scores |
| **World Clock** | 3 | TimeAPI.io | Timezone conversion, 597 IANA zones |
| **Screenshots** | 1 | ApiFlash | Chrome-based URL capture |
| **Domain Registration** | 5 | NameSilo | Check, buy, manage domains (.com $21) |
| **Infrastructure** | 6 | Cloudflare | DNS management, CDN cache, traffic analytics |
| **Browser** | 4 | Browserbase | Managed browser sessions, screenshots, scraping |
| **Earthquakes** | 3 | USGS | Global seismic data, real-time feeds |
| **Disasters** | 3 | GDACS | UN global disaster alerts (earthquakes, floods, hurricanes, volcanoes) |
| **IP Intelligence** | 2 | ipapi.is | Geolocation, VPN/proxy detection |
| **Vehicle Data** | 9 | NHTSA, Auto.dev, MarketCheck | VIN decoder, recalls, safety ratings, car listings, market data |
| **Country Data** | 2 | REST Countries | Country search, ISO code lookup |
| **Food Products** | 2 | Open Food Facts | Barcode lookup, product search (3M+ products) |
| **Test Data** | 1 | RandomUser.me | Random user profiles for testing |
| **Crypto & DeFi** | 26 | CoinGecko, Polymarket, Hyperliquid | Prices, prediction markets, perpetuals |
| **Logistics** | 7 | 17TRACK, DHL, ShipEngine | Multi-carrier tracking, shipping rates, address validation |
| **Postal Codes** | 4 | Zippopotam.us, Postcodes.io | Global postal lookup (60+ countries), UK postcodes |
| **Platform** | 6 | APIbase (internal) | Usage analytics, tool quality index, batch calls |

**Full tool catalog with schemas:** [`https://apibase.pro/api/v1/tools`](https://apibase.pro/api/v1/tools)

---

## Platform Features

### Usage Analytics (Free)

Track your API usage — total calls, cost, cache hit rate, latency, and per-tool breakdown.

```bash
# Usage summary
curl -X POST https://apibase.pro/api/v1/tools/account.usage/call \
  -H "Authorization: Bearer ak_live_..." \
  -d '{"period": "7d"}'

# Per-tool breakdown
curl -X POST https://apibase.pro/api/v1/tools/account.tools/call \
  -H "Authorization: Bearer ak_live_..." \
  -d '{"sort": "cost", "limit": 10}'

# Time series (hourly/daily buckets)
curl -X POST https://apibase.pro/api/v1/tools/account.timeseries/call \
  -H "Authorization: Bearer ak_live_..." \
  -d '{"period": "30d", "granularity": "day"}'
```

### Tool Quality Index (Free)

Check tool reliability before calling — uptime, p50/p95 latency, error rate. Updated every 10 minutes.

```bash
# Quality metrics for a specific tool
curl -X POST https://apibase.pro/api/v1/tools/platform.tool_quality/call \
  -H "Authorization: Bearer ak_live_..." \
  -d '{"tool_id": "crypto.get_price"}'

# Rankings — find the most reliable tools
curl -X POST https://apibase.pro/api/v1/tools/platform.tool_rankings/call \
  -H "Authorization: Bearer ak_live_..." \
  -d '{"sort": "uptime", "limit": 20}'
```

### Batch API (Free wrapper)

Execute up to 20 tool calls in parallel with a single request. Each sub-call runs the full pipeline independently. You pay only for individual tool calls.

```bash
# Via MCP tool
curl -X POST https://apibase.pro/api/v1/tools/platform.call_batch/call \
  -H "Authorization: Bearer ak_live_..." \
  -d '{"calls": [
    {"tool_id": "crypto.get_price", "params": {"coin": "bitcoin"}},
    {"tool_id": "finance.exchange_rates", "params": {"from": "USD", "to": "EUR"}},
    {"tool_id": "country.by_code", "params": {"code": "US"}}
  ]}'

# Via REST endpoint
curl -X POST https://apibase.pro/api/v1/tools/call_batch \
  -H "Authorization: Bearer ak_live_..." \
  -d '{"calls": [...], "max_parallel": 10}'
```

### Predictive Pre-fetching

When an agent calls a tool, the platform can automatically pre-fetch related data into cache. For example, a flight search pre-fetches exchange rates for the destination currency — so when the agent asks for rates next, it's an instant cache hit.

- Fire-and-forget: does not slow down the original response
- Controlled by `PREFETCH_ENABLED` env var (disabled by default)
- Rules: flight search → exchange rates, real estate → walk score, geocode → country data

---

## How Payment Works

APIbase supports **dual payment rails** — agents can pay using either protocol:

### x402 (USDC on Base)

| Field | Value |
|-------|-------|
| Protocol | **x402** (HTTP 402 Payment Required) |
| Token | USDC on Base |
| Wallet | `0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480` |
| Price range | $0.001 – $1.00 per call |

### MPP (Machine Payments Protocol)

| Field | Value |
|-------|-------|
| Protocol | **MPP** (IETF draft-ryan-httpauth-payment) |
| Token | USDC on Tempo (chain 4217) |
| Wallet | `0x183fFa1335EB66858EebCb86F651f70632821f8d` |
| USDC contract | `0x20C000000000000000000000b9537d11c60E8b50` |
| SDK | `mppx` (npm) |
| Agent setup | [wallet.tempo.xyz](https://wallet.tempo.xyz) — one link, connected |
| Discovery | [mpp.dev/services](https://mpp.dev/services) |
| Price range | $0.001 – $1.00 per call |

No subscriptions. No minimums. Agent pays only for successful calls. Failed provider calls are auto-refunded.

### 13-Stage Pipeline

Every tool call passes through:

```
AUTH → IDEMPOTENCY → CONTENT_NEG → SCHEMA_VALIDATION → TOOL_STATUS →
CACHE → RATE_LIMIT → ESCROW → PROVIDER_CALL →
ESCROW_FINALIZE → LEDGER_WRITE → CACHE_SET → RESPONSE
```

- **Escrow-first**: USDC locked before provider call, refunded on failure
- **Idempotent**: same request + same key = same result, no double charges
- **Cache**: per-tool TTL (5s for stock prices, 7 days for walkability scores)
- **Fail-closed**: Redis down = reject all, no silent degradation

---

## Authentication

| Method | Header | Format |
|--------|--------|--------|
| API Key | `Authorization` | `Bearer ak_live_<32hex>` |
| x402 Payment | `X-Payment` | Base64 payment receipt |
| MPP Payment | `Authorization` | `Payment <credential>` (via `mppx` SDK) |

Auto-registration: agents get API keys instantly on first request. No forms, no approval.

### MPP Payment Flow (important for agent developers)

MPP uses a **challenge–credential–receipt** cycle. You MUST follow the full flow:

```
1. Agent → POST /api/v1/tools/{tool}/call (with Authorization: Bearer <key>)
2. Server → 402 + WWW-Authenticate: Payment id="...", method="tempo", request="..."
3. Agent signs payment on Tempo → retries with Authorization: Payment <credential>
4. Server verifies on-chain → 200 + Payment-Receipt header + tool result
```

**Critical:** Each 402 challenge is unique (HMAC-bound to the request URL, amount, and timestamp). You cannot reuse a credential from one challenge on a different endpoint or after expiry. The `mppx` SDK handles this automatically.

**Using mppx SDK (recommended):**

```typescript
import { Mppx, tempo } from 'mppx/client'

// mppx auto-handles the full 402 → pay → retry cycle
const mppx = Mppx.create({
  methods: [tempo({ account: myTempoWallet })],
})

// This single call handles: request → 402 → sign → pay → retry → 200
const response = await fetch('https://apibase.pro/api/v1/tools/nasa.apod/call', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ak_live_<your_key>',  // API key for agent identity
    'X-API-Key': 'ak_live_<your_key>',             // Preserved when mppx replaces Authorization
  },
  body: JSON.stringify({}),
})
```

**Using Tempo CLI:**

```bash
curl -fsSL https://tempo.xyz/install | bash
tempo wallet login
tempo request https://apibase.pro/api/v1/tools/nasa.apod/call -X POST --json '{}'
```

**Using AgentCash (one command):**

```bash
# Try any tool instantly
npx agentcash try https://apibase.pro

# Add all APIbase tools to your agent
npx agentcash add https://apibase.pro
```

**Note:** When `mppx` retries with `Authorization: Payment`, it replaces the original `Bearer` header. To preserve agent identity, also send your API key via `X-API-Key` header — the server accepts both.

---

## Error Codes (Agent-Friendly)

Every error response includes machine-readable recovery hints:

```json
{
  "error": "rate_limit_exceeded",
  "error_code": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests",
  "request_id": "abc123",
  "suggested_action": "retry_after_delay",
  "documentation_url": "https://apibase.pro/frameworks#rest",
  "retry_after": 15
}
```

| HTTP | Code | `suggested_action` |
|------|------|--------------------|
| 400 | `bad_request` / `schema_validation_failed` | `fix_request` |
| 401 | `unauthorized` | `fix_request` |
| 402 | `payment_required` | `add_payment` |
| 404 | `not_found` | `use_different_tool` |
| 429 | `rate_limit_exceeded` | `retry_after_delay` |
| 502 | `bad_gateway` | `retry_after_delay` |
| 503 | `service_unavailable` | `retry_after_delay` |

---

## MCP Discovery

```
GET  /.well-known/mcp.json              → MCP server metadata (transport, capabilities, tools count)
GET  /.well-known/mcp/server-card.json  → Full tool catalog with schemas (Smithery)
GET  /.well-known/ai-capabilities.json  → AI capabilities manifest (21 categories)
GET  /.well-known/agent.json            → A2A agent card (protocol, auth, payment)
GET  /.well-known/x402-payment.json     → Payment config (network, facilitators, dual-rail)
GET  /.well-known/openapi.json          → OpenAPI 3.1 spec (with x-payment-info)
GET  /ai.txt                            → Plain text AI agent discovery
GET  /llms.txt                          → Concise LLM context
GET  /api/v1/tools                      → Live tool catalog (all 443 tools, JSON schemas)
GET  /health/ready                      → System health check
POST /mcp  prompts/get discover_tools   → Browse tools by category or task (progressive disclosure)
GET  /frameworks                        → Integration guides for 9 frameworks
```

**Progressive disclosure:** Instead of loading all 443 tool schemas into context, agents can call the `discover_tools` prompt to find relevant tools first:
- `discover_tools` (no args) → 21 categories with tool counts
- `discover_tools category="travel"` → 17 travel tools
- `discover_tools task="check earthquake near Tokyo"` → matching tools ranked by relevance

**Tool composition hints:** Task-based search results include related tool suggestions:
```
- amadeus.flights.search: Search for real-time flight offers...
  → Related: amadeus.flight_price (Confirm exact pricing), finance.exchange_rates (Convert to local currency)
```

---

## Integrations

Every framework connects to one endpoint: `https://apibase.pro/mcp`

| Platform | Config | Docs |
|----------|--------|------|
| **Claude Desktop / Code** | `"url": "https://apibase.pro/mcp"` | 3 lines JSON |
| **Cursor IDE** | `.cursor/mcp.json` → same URL | 3 lines JSON |
| **Windsurf (Codeium)** | `"serverUrl": "https://apibase.pro/mcp"` | 3 lines JSON |
| **OpenAI Agents SDK** | `MCPServerStreamableHTTP(url=...)` | Python + TS |
| **LangChain / LangGraph** | `MultiServerMCPClient({"apibase": {...}})` | Python |
| **Google ADK** | `McpToolset(StreamableHTTPConnectionParams(...))` | Python |
| **CrewAI** | `mcp_servers=["https://apibase.pro/mcp"]` | 1 line |
| **Microsoft Copilot Studio** | UI: Actions → Add MCP Server | Enterprise |

**[Full framework guides with code examples →](https://apibase.pro/frameworks)**

### Registry Listings

| Registry | Link |
|----------|------|
| **Smithery** | [smithery.ai/servers/apibase-pro/api-hub](https://smithery.ai/servers/apibase-pro/api-hub) |
| **Glama** | [glama.ai/mcp/servers/whiteknightonhorse/APIbase](https://glama.ai/mcp/servers/whiteknightonhorse/APIbase) |
| **MCP Registry** | `io.github.whiteknightonhorse/apibase` |
| **PulseMCP** | [pulsemcp.com](https://pulsemcp.com) (auto-synced) |
| **MPPScan** | [mppscan.com](https://www.mppscan.com) |

---

## Architecture

- **16 Docker containers**: API, Worker, Outbox, PostgreSQL, Redis, Nginx, Prometheus, Grafana, Loki, Promtail, Alertmanager, exporters
- **Single Hetzner server** with automated health checks, graceful shutdown, and 27 Prometheus alert rules
- **PostgreSQL** = source of truth for financial data (append-only ledger)
- **Redis** = cache, rate limiting, single-flight deduplication
- **Fail-closed**: any infrastructure failure = reject requests, never pass through

## Self-Hosting

### Prerequisites

- Docker 24.0+ with Compose v2.0+
- 8GB+ RAM (16 containers)
- Ports: 8880 (Nginx), 3000 (API), 5432 (Postgres), 6379 (Redis) — all internal

### Quick Start

```bash
git clone https://github.com/whiteknightonhorse/APIbase.git
cd APIbase
cp .env.example .env    # edit: set POSTGRES_PASSWORD, X402_PAYMENT_ADDRESS, provider keys
docker compose build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Verify

```bash
# Health check (Nginx on 8880)
curl http://localhost:8880/health/ready

# Check all 16 containers
docker compose ps

# View API logs
docker compose logs api --tail 20
```

See `.env.example` for all configuration options. Never commit `.env` to git.

## License

[MIT](LICENSE)
