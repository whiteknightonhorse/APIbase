# APIbase.pro — The API Hub for AI Agents

> One MCP endpoint. 300 tools. 84 providers. Pay per call with x402 (USDC on Base) or MPP (USDC on Tempo).

**[Live Platform](https://apibase.pro)** | **[Tool Catalog](https://apibase.pro/api/v1/tools)** | **[MCP Endpoint](https://apibase.pro/mcp)** | **[Health](https://apibase.pro/health/ready)** | **[Dashboard](https://apibase.pro/dashboard)**

<a href="https://glama.ai/mcp/servers/whiteknightonhorse/APIbase">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/whiteknightonhorse/APIbase/badge?v=2" alt="APIbase MCP server" />
</a>

---

## What is APIbase?

Production MCP server that gives AI agents access to 300 real-world API tools through a single endpoint. Agents connect once to `https://apibase.pro/mcp` and can search flights, get stock quotes, translate text, check weather alerts, generate images, send emails, look up holidays, shorten URLs, detect fires by satellite, decode VINs, look up food products — and 200+ more tools across 30+ categories.

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

## Tool Categories (300 tools, 84 providers)

| Category | Tools | Providers | Examples |
|----------|-------|-----------|----------|
| **Web Search** | 9 | Serper, Tavily, Exa | Google search, AI search, semantic search |
| **News & Events** | 7 | NewsData, GDELT, Mastodon | Global news (65 langs), crypto news, trending |
| **Social** | 3 | Bluesky | Search posts, profiles, feeds (AT Protocol) |
| **Travel & Flights** | 17 | Amadeus, Sabre, Aviasales | Flight search, pricing, status, airports |
| **Finance & Stocks** | 16 | Finnhub, CoinGecko, ECB, FRED | Stock quotes, OHLCV, FX rates, economic data |
| **Company Data** | 8 | SEC EDGAR, Companies House, GLEIF | US filings + UK registry + global LEI (200+ countries) |
| **Currency Conversion** | 2 | ExchangeRate-API | 160+ currencies, real-time conversion |
| **Tax & VAT** | 3 | VATcomply | EU VAT validation, rates, ECB exchange rates |
| **Maps & Geo** | 7 | Geoapify | Geocode, routing, POI search, isochrone |
| **Address (US/CA)** | 2 | Geocodio | Geocode, reverse geocode, USPS-standard |
| **Real Estate** | 4 | Walk Score, US Real Estate | Walkability, property listings, details |
| **Entertainment** | 24 | TMDB, Ticketmaster, RAWG, IGDB, Jikan | Movies, events, games, anime |
| **Art & Culture** | 5 | Europeana, ARTIC | 50M+ EU objects + 120K Chicago artworks |
| **Stock Media** | 3 | Pexels | Free stock photos & videos, commercial use |
| **Music** | 7 | MusicBrainz, ListenBrainz, RadioBrowser | Artists, albums, radio stations |
| **Podcasts** | 4 | PodcastIndex | Search 4M+ podcasts, trending, episodes |
| **Health & Nutrition** | 7 | USDA, OpenFDA, NIH | Food data, drug safety, supplements |
| **Clinical Trials** | 3 | ClinicalTrials.gov | 577K+ trials, drug research, recruiting |
| **Nutrition Database** | 2 | FatSecret | 2.3M+ foods, calories, macros, vitamins |
| **Education & Research** | 7 | OpenAlex, arXiv, PubMed, CrossRef | Papers, colleges, DOI lookup |
| **Jobs & Career** | 6 | BLS, ESCO, CareerJet | Salary data, occupations, job listings |
| **Legal & Regulatory** | 8 | Regulations.gov, Federal Register, CourtListener | US regulations, court opinions, executive orders |
| **Air Quality** | 2 | IQAir AirVisual | AQI, pollutants (PM2.5/O3), 30K+ stations |
| **Weather & Earth** | 3 | NWS, NASA FIRMS | US weather alerts, satellite fire detection |
| **Space & Astronomy** | 9 | NASA, JPL | APOD, asteroids, fireballs, solar flares |
| **Translation** | 3 | Langbly | 90+ languages, language detection |
| **Sports** | 4 | API-Sports | Football (2000+ leagues), basketball (NBA) |
| **Holidays & Calendar** | 3 | Nager.Date, Calendarific | 230+ countries, national/religious/observance |
| **Image Generation** | 1 | Stability AI | Stable Diffusion, 16 style presets |
| **OCR** | 1 | OCR.space | Text from images/PDFs, 20+ languages |
| **Speech-to-Text** | 3 | AssemblyAI | Transcribe audio, 99 languages, diarization |
| **PDF & Documents** | 6 | API2PDF, ConvertAPI | HTML/URL to PDF, DOCX↔PDF, 200+ formats |
| **Email & SMS** | 4 | Resend, Twilio | Send emails, SMS, phone lookup |
| **Messaging** | 5 | Telegram | Send messages, photos, documents via bot |
| **URL Shortener** | 2 | Short.io | Custom branded short links + stats |
| **SSL & Domain** | 5 | WhoisXML, ssl-checker.io | WHOIS, DNS, SSL cert check |
| **Barcode & QR** | 4 | QRServer, UPCitemdb | Generate/read QR, barcode lookup |
| **Business Intel** | 1 | Hunter.io | Company emails, enrichment, 50M+ domains |
| **E-commerce** | 8 | Zinc, Diffbot | Product search, web extraction |
| **AI Marketing** | 7 | AIPush | AI-optimized pages, visibility scores |
| **World Clock** | 3 | TimeAPI.io | Timezone conversion, 597 IANA zones |
| **Screenshots** | 1 | ApiFlash | Chrome-based URL capture |
| **Domain Registration** | 5 | NameSilo | Check, buy, manage domains (.com $21) |
| **Infrastructure** | 6 | Cloudflare | DNS management, CDN cache, traffic analytics |
| **Browser** | 4 | Browserbase | Managed browser sessions, screenshots, scraping |
| **Earthquakes** | 3 | USGS | Global seismic data, real-time feeds |
| **IP Intelligence** | 2 | ipapi.is | Geolocation, VPN/proxy detection |
| **Vehicle Data** | 3 | NHTSA, Auto.dev | VIN decoder (US + global 100+ countries) |
| **Country Data** | 2 | REST Countries | Country search, ISO code lookup |
| **Food Products** | 2 | Open Food Facts | Barcode lookup, product search (3M+ products) |
| **Test Data** | 1 | RandomUser.me | Random user profiles for testing |
| **Crypto & DeFi** | 26 | CoinGecko, Polymarket, Hyperliquid | Prices, prediction markets, perpetuals |

**Full tool catalog with schemas:** [`https://apibase.pro/api/v1/tools`](https://apibase.pro/api/v1/tools)

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

**Note:** When `mppx` retries with `Authorization: Payment`, it replaces the original `Bearer` header. To preserve agent identity, also send your API key via `X-API-Key` header — the server accepts both.

---

## Error Codes

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `validation_error` | Invalid parameters (check schema) |
| 401 | `unauthorized` | Missing or invalid API key |
| 402 | `payment_required` | x402 or MPP payment needed |
| 404 | `not_found` | Tool or resource not found |
| 429 | `rate_limited` | Rate limit exceeded (check `Retry-After`) |
| 502 | `bad_gateway` | Provider unavailable |
| 503 | `service_unavailable` | System not ready |

---

## MCP Discovery

```
GET /.well-known/mcp.json → MCP server metadata
GET /api/v1/tools → Full tool catalog with schemas (all 300 in one response)
GET /health/ready → System health check
```

---

## Integrations

| Platform | Config |
|----------|--------|
| **Claude Desktop** | `"url": "https://apibase.pro/mcp"` |
| **Cursor** | `"url": "https://apibase.pro/mcp"` |
| **Windsurf** | `"serverUrl": "https://apibase.pro/mcp"` |
| **VS Code Copilot** | `"type": "http", "url": "https://apibase.pro/mcp"` |
| **Continue.dev** | Streamable HTTP: `https://apibase.pro/mcp` |
| **OpenAI GPT** | Import `https://apibase.pro/.well-known/openapi.json` |
| **Smithery** | [smithery.ai/servers/apibase-pro/api-hub](https://smithery.ai/servers/apibase-pro/api-hub) |
| **Glama** | [glama.ai/mcp/servers/whiteknightonhorse/APIbase](https://glama.ai/mcp/servers/whiteknightonhorse/APIbase) |
| **MCP Registry** | `io.github.whiteknightonhorse/apibase` |

---

## Architecture

- **16 Docker containers**: API, Worker, Outbox, PostgreSQL, Redis, Nginx, Prometheus, Grafana, Loki, Promtail, Alertmanager, exporters
- **Single Hetzner server** with automated health checks, graceful shutdown, and 27 Prometheus alert rules
- **PostgreSQL** = source of truth for financial data (append-only ledger)
- **Redis** = cache, rate limiting, single-flight deduplication
- **Fail-closed**: any infrastructure failure = reject requests, never pass through

## Self-Hosting

```bash
git clone https://github.com/whiteknightonhorse/APIbase.git
cp .env.example .env    # configure secrets
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## License

[MIT](LICENSE)
