---
name: onboard-provider
description: "Full workflow for onboarding a new API provider into APIbase. Creates adapter, schemas, registers tools, seeds DB, builds, deploys, and verifies. Give this skill the provider name and credentials to get a fully integrated provider on apibase.pro."
user-invocable: true
argument-hint: "<provider-name>"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Agent
---

# APIbase — Provider Onboarding Workflow

Complete step-by-step workflow for integrating a new API provider into APIbase.
When invoked, follow ALL steps in order. Do NOT skip steps.

## Recovery Check (RUN FIRST — detect incomplete onboardings)

**Before starting a NEW onboarding, check if the PREVIOUS one was fully completed.** Context breaks mid-onboarding leave Smithery/Glama/GitHub description stale.

```bash
# 1. Get last onboarding commit
LAST_COMMIT=$(git log --oneline -1 --grep="TOOLS" | head -1)
echo "Last onboarding: $LAST_COMMIT"

# 2. Check if server-card.json tool count matches live API
LIVE=$(curl -s https://apibase.pro/api/v1/tools | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])")
CARD=$(python3 -c "import json; print(len(json.load(open('static/.well-known/mcp/server-card.json'))['tools']))")
echo "Live API: $LIVE tools | server-card.json: $CARD tools"

# 3. Check homepage counts match live API
SITE_TOOLS=$(curl -s https://apibase.pro/ | grep -oP '\d+(?= tools)' | head -1)
SITE_PROVS=$(curl -s https://apibase.pro/ | grep -oP '\d+(?= providers)' | head -1)
echo "Homepage: $SITE_TOOLS tools, $SITE_PROVS providers"

# If SITE_TOOLS != LIVE → homepage stale, fix index.html + terms.html + Nginx recreate
# If CARD < LIVE → server-card.json stale, regenerate + Smithery publish
```

**If any mismatch is found: fix it BEFORE starting the new onboarding.** Specifically:
- **Homepage stale** → grep old count in `static/index.html`, fix ALL occurrences (see Step 12.5a), then `sudo docker compose up -d nginx --force-recreate`
- **server-card stale** → regenerate (Step 14b), rebuild API, then Smithery publish (Step 16)
- **Smithery not published** → run Step 16 command immediately

---

## Prerequisites

Before starting, you MUST have from the user:
1. **Provider name** and website
2. **API credentials** (API key, OAuth2 client ID/secret, etc.)
3. **API endpoints** that are verified working
4. **Tool list** — which tools to create (tool_id, description, price, cache_ttl)

If any of these are missing, ask the user before proceeding.

## Production URLs

| Service | URL |
|---------|-----|
| MCP Endpoint | `https://apibase.pro/mcp` |
| Tool Catalog | `https://apibase.pro/api/v1/tools` |
| Health | `https://apibase.pro/health/ready` |
| Discovery | `https://apibase.pro/.well-known/mcp.json` |

---

## Step 1: Read Existing Patterns

Before writing any code, read these files to understand the patterns:

```
src/adapters/base.adapter.ts          — Base adapter class (timeout, retry, size limit)
src/adapters/registry.ts              — Adapter registry (tool_id → adapter mapping)
src/types/provider.ts                 — ProviderRequest, ProviderRawResponse types
src/schemas/index.ts                  — Schema registry
src/mcp/tool-definitions.ts            — MCP tool definitions (with mcpName, title, annotations)
src/mcp/types.ts                      — McpToolDefinition interface
src/utils/zod-to-json-schema.ts       — Shared Zod→JSON Schema converter
config/tool_provider_config.yaml      — Tool config (prices, TTLs)
src/config/env.ts                     — Environment variable schema
src/config/prefetch-rules.ts          — Predictive pre-fetch rules (F8)
.env                                  — Environment variables
```

Also read one existing adapter as reference (e.g. `src/adapters/coingecko/`, `src/adapters/nasa/`, or `src/adapters/sabre/`).

---

## Step 2: Create Adapter Files (3 files)

Create `src/adapters/{provider}/` directory with:

### 2a. `types.ts` — Raw API Response Types

TypeScript interfaces for each API endpoint's response structure.
Follow the pattern from `src/adapters/openweathermap/types.ts` or `src/adapters/sabre/types.ts`.

### 2b. `auth.ts` (if needed) — Auth Manager

Only needed for OAuth2 or token-based auth that requires refresh.
If using simple API key in query/header, skip this file.

Pattern: `src/adapters/sabre/auth.ts` (OAuth2 with token caching).

### 2c. `index.ts` — Main Adapter Class

Extends `BaseAdapter`. Must implement:
- `buildRequest(req: ProviderRequest)` — returns `{ url, method, headers, body? }`
- `parseResponse(raw: ProviderRawResponse, req: ProviderRequest)` — validates and returns parsed response

Constructor takes credentials. Switch on `req.toolId` in buildRequest/parseResponse.

If auth is async (OAuth2), override `call()` to fetch token before calling `super.call()`:
```typescript
async call(req: ProviderRequest): Promise<ProviderRawResponse> {
  this.currentToken = await this.auth.getToken();
  return super.call(req);
}
```

---

## Step 3: Create Zod Schemas (1 file)

Create `src/schemas/{provider}.schema.ts`.

One Zod schema per tool. Export as `Record<string, ZodSchema>`:
```typescript
export const {provider}Schemas: Record<string, ZodSchema> = {
  '{provider}.{tool_name}': schema,
};
```

### MANDATORY: Smithery Quality Requirements for Schemas

**Every schema MUST follow these rules to maintain 100% Smithery quality score:**

1. **`.describe()` on EVERY Zod field** — every parameter must have a description:
   ```typescript
   // WRONG:
   origin: z.string().length(3),

   // CORRECT:
   origin: z.string().length(3).describe('Origin airport IATA code (e.g. JFK, LAX)'),
   ```

2. **Nested object fields need `.describe()` too:**
   ```typescript
   passengers: z
     .object({
       adults: z.number().int().optional().describe('Number of adult passengers (1-9)'),
       children: z.number().int().optional().describe('Number of child passengers (0-9)'),
     })
     .strip()
     .optional()
     .describe('Passenger counts by type'),
   ```

3. **No empty schemas** — every tool must have at least 1 parameter with `.describe()`:
   ```typescript
   // WRONG (causes 44/45 param descriptions):
   const myTool = z.object({}).strip();

   // CORRECT:
   const myTool = z.object({
     locale: z.string().optional().describe('Response locale (e.g. en-US)'),
   }).strip();
   ```

4. Use `.strip()` on all schemas.

**If ANY field lacks `.describe()`, Smithery score drops. There are zero exceptions.**

### Why Schema Quality Matters for REST Catalog (CRITICAL)

`src/services/tool-registry.service.ts` automatically converts Zod schemas to JSON Schema at module load time and serves them in the REST catalog (`/api/tools`, `/api/v1/tools`). Similarly, `description` from `src/mcp/tool-definitions.ts` is auto-wired into the catalog.

This means:
- **Every Zod schema you create immediately appears as `input_schema` in the REST tool catalog** — agents use this to construct valid requests
- **Every `description` in tool-definitions.ts immediately appears in the catalog** — agents use this to understand what the tool does
- If a tool has no Zod schema → agents see `input_schema: {}` → they can't construct valid params → HTTP 400
- If a tool has no description → agents see the tool name echoed as description → unprofessional

The conversion uses `src/utils/zod-to-json-schema.ts` (shared with OpenAPI generation). Supported types: ZodString, ZodNumber, ZodBoolean, ZodEnum, ZodArray, ZodObject, ZodRecord, ZodOptional, ZodDefault, ZodUnknown.

**No extra wiring needed** — adding the schema to `src/schemas/index.ts` and the definition to `src/mcp/tool-definitions.ts` is sufficient. The REST catalog picks them up automatically.

---

## Step 4: Modify Existing Files (6 files)

### 4a. `.env` — Add credentials
```
PROVIDER_KEY_{NAME}=value
# or for OAuth2:
{PROVIDER}_CLIENT_ID=value
{PROVIDER}_CLIENT_SECRET=value
```

### 4b. `src/config/env.ts` — Add to appEnvSchema
```typescript
PROVIDER_KEY_{NAME}: z.string().optional().default(''),
```

### 4c. `src/adapters/registry.ts` — Add import + case
```typescript
import { {Provider}Adapter } from './{provider}';
// In resolveAdapter switch:
case '{provider}':
  // instantiate and return adapter
```

**CRITICAL: toolId prefix MUST match the case label.** `resolveAdapter()` extracts the provider with `toolId.split('.')[0]`. If your tool_id in YAML is `iban.validate` but your adapter case is `'ibanapi'`, the adapter will never be found (503 error). Solutions:
1. **Preferred:** Make tool_id prefix match the case label (e.g. `ibanapi.validate` + `case 'ibanapi':`)
2. **Alternative:** Add a fallthrough alias: `case 'iban': case 'ibanapi': { ... }`

**Verify after onboarding:** Every tool_id first segment in `config/tool_provider_config.yaml` must have a matching case in `src/adapters/registry.ts`.

### 4d. `src/schemas/index.ts` — Import and spread schemas
```typescript
import { {provider}Schemas } from './{provider}.schema';
// In toolSchemas:
...{provider}Schemas,
```

### 4e. `src/mcp/tool-definitions.ts` — Add tool definitions

**MANDATORY: Every tool MUST have ALL 6 fields:**

```typescript
// {Provider} ({N})
{
  toolId: '{provider}.{tool}',                    // Internal pipeline ID (2-level)
  mcpName: '{provider}.{category}.{action}',      // MCP-facing name (3-level dot hierarchy)
  title: 'Human Readable Tool Name',              // Human-readable display name
  description: 'Full description of what the tool does',
  category: '{category}',                          // One of 21 categories (see list below)
  annotations: READ_ONLY,                         // or TRADING / CANCEL for write operations
},
```

**Field requirements:**

| Field | Purpose | Smithery impact |
|-------|---------|-----------------|
| `toolId` | Internal 2-level ID for pipeline, DB, adapters | Pipeline routing |
| `mcpName` | 3-level dot hierarchy `provider.category.action` | **Tool names 5pt** |
| `title` | Human-readable display name | **Tool names 5pt** |
| `description` | What the tool does | **Tool descriptions 12pt** |
| `category` | Progressive disclosure category for `discover_tools` prompt | Tool discovery |
| `annotations` | `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` | **Annotations 7pt** |

**Category values (21 categories — pick ONE per tool):**

| Category | Use for |
|----------|---------|
| `travel` | Flights, hotels, airports, GDS (amadeus, aviasales, sabre) |
| `weather` | Weather, air quality, alerts (openweather, NWS, IQAir) |
| `finance` | Stocks, FX, banking, economic data (finnhub, FRED, FDIC, rateapi, iban) |
| `crypto` | Crypto markets, DeFi, prediction markets (coingecko, hyperliquid, polymarket) |
| `search` | Web search, semantic search (serper, tavily, exa) |
| `news` | News feeds, global events (newsdata, gdelt, currents) |
| `location` | Geocoding, maps, places, real estate (geo, geocodio, foursquare, walkscore, usrealestate) |
| `health` | Medical, nutrition, food safety, clinical (USDA, OpenFDA, WHO, fatsecret, spoonacular, clinical) |
| `entertainment` | Movies, TV, games, anime, music, events, podcasts, sports (tmdb, rawg, igdb, jikan, ticketmaster, music, podcast, sports) |
| `education` | Academic papers, colleges, books (OpenAlex, arXiv, PubMed, Open Library) |
| `jobs` | Salary, occupations, job listings (BLS, O*NET, ESCO, CareerJet) |
| `space` | NASA, asteroids, satellite data (nasa, jpl, firms) |
| `social` | Social networks (mastodon, bluesky, twitter) |
| `legal` | Regulations, case law, federal register (regulations.gov, courtlistener, fedregister) |
| `business` | Company data, LEI, enrichment (lei, ukcompany, hunter) |
| `developer` | Utilities: QR, barcode, SSL, URL shortener, VIN, WHOIS, IP, timezone, translation, PDF, file conversion |
| `media` | Images, video, OCR, art, cultural heritage, audio transcription (pexels, stability, ocr, artic, europeana, transcribe) |
| `infrastructure` | Cloud, DNS, domains, browser automation (cloudflare, namesilo, browserbase) |
| `messaging` | SMS, email, chat (telegram, twilio, resend, zerobounce) |
| `marketing` | AI marketing, web extraction (aipush, diffbot) |
| `world` | Countries, holidays, food products, disasters, VAT, random data (country, holidays, food, gdacs, vatcomply, random) |

**If a new provider doesn't fit any existing category, use the closest match. Do NOT invent new categories without explicit approval.**

**Annotation presets (defined at top of file):**
- `READ_ONLY` — for all read/query tools (most tools)
- `TRADING` — for tools that place orders or create resources
- `CANCEL` — for tools that cancel/delete resources

**3-level naming convention (`mcpName`):**

The `mcpName` MUST be 3 levels deep: `{provider}.{category}.{action}`

Category patterns by tool type:
- Flights: `{provider}.flights.search`, `{provider}.flights.status`
- Hotels: `{provider}.hotels.search`
- Markets: `{provider}.market.search`, `{provider}.market.detail`
- Trading: `{provider}.trading.place_order`, `{provider}.trading.cancel`
- Account: `{provider}.account.balance`
- Reference: `{provider}.reference.airline`, `{provider}.reference.airport`

Smithery scores "how well tool names form a navigable tree using dot-notation".
Flat lists (2-level) reduce the score. The ideal for 45+ tools is exactly 3 levels.

### 4f. `config/tool_provider_config.yaml` — Add tool entries
```yaml
# --- UC-{NNN}: {Provider} ---
- tool_id: {provider}.{tool}
  name: {Tool Name}
  provider: {provider}
  price_usd: "{price}"
  cache_ttl: {ttl}
```

### 4g. Platform Features Integration (MANDATORY)

New providers are automatically supported by all platform features. Review each and apply where relevant:

#### 4g-i. Tool Quality Index (automatic — no action needed)

The tool quality cron job (`src/jobs/tool-quality.job.ts`) runs every 10 min and computes uptime/latency/error_rate from `execution_ledger` for ALL tools with `provider_called = true` in the last 24h. New tools are automatically included after their first successful call. No config needed.

Agents can check quality before calling expensive tools:
```bash
curl -X POST https://apibase.pro/api/v1/tools/platform.tool_quality/call \
  -H "Authorization: Bearer ak_live_..." \
  -d '{"tool_id": "{provider}.{tool}"}'
```

#### 4g-ii. Batch API (automatic — no action needed)

The batch API (`platform.call_batch` tool + `POST /api/v1/tools/call_batch` REST) works with ALL tools automatically. Agents can include the new provider's tools in batch calls. Each sub-call runs the full 13-stage pipeline independently. No config needed.

#### 4g-iii. Predictive Pre-fetching Rules (evaluate — add if applicable)

Check if the new provider's tools are natural **follow-ups** to existing tools, or if existing tools naturally precede the new provider's tools. If so, add prefetch rules to `src/config/prefetch-rules.ts`.

**When to add a prefetch rule:**
- Flight search → weather at destination, exchange rates for currency
- Real estate search → walk score for the area
- Geocoding → country data for the country
- New provider's tool is commonly called right after an existing tool

**Prefetch rule pattern:**
```typescript
// In PREFETCH_RULES (src/config/prefetch-rules.ts):
'{existing_tool_id}': [
  {
    toolId: '{new_provider}.{tool}',
    deriveParams: (body) => {
      // Extract relevant params from the triggering tool's request body
      const param = body.some_field as string | undefined;
      if (!param) return null;  // null = skip this prefetch
      return { required_param: param };
    },
  },
],
```

**Rules for prefetch:**
- Only add rules for **free/cheap upstream tools** (platform absorbs the prefetch cost)
- `deriveParams` must return `null` if required params can't be derived (never call with invalid params)
- Prefetch is fire-and-forget — failures are logged but don't affect the original request
- Prefetch is disabled by default (`PREFETCH_ENABLED=false` in `.env`)
- Only add rules where the follow-up call has a >50% chance of actually being made by the agent

**Current prefetch rules (reference):**
```
aviasales.search_flights → finance.exchange_rates (currency conversion)
usrealestate.for_sale    → walkscore.score (walkability for listings)
geo.geocode              → country.search (country details)
```

**If no natural prefetch relationship exists — skip this step.** Most providers won't need prefetch rules.

#### 4g-iv. Usage Analytics (automatic — no action needed)

The account analytics tools (`account.usage`, `account.tools`, `account.timeseries`) query `execution_ledger` which records ALL tool calls. New provider tools are automatically included in agent usage reports. No config needed.

---

### 4h. `src/config/provider-limits.json` — Register in Dashboard (MANDATORY)

**Every new provider MUST be added to the dashboard config so it appears on https://apibase.pro/dashboard.**

#### 4h-pre. Research Provider Limits (MANDATORY — before writing config)

**Before filling in any values, you MUST research the provider's actual limits:**

1. Search the provider's official docs for pricing, rate limits, or quota pages
2. Find the specific free tier limit (daily/monthly/hourly cap, or lifetime credits)
3. Record the `docs_url` (link to the page where you found the limit)
4. Write a one-line `limit_proof` summarizing what the docs say

**If no limit documentation is found:**
- Set `limit_type: "unlimited"` and `free_limit: 0`
- Set `limit_proof` to explain why (e.g. "No rate limits documented in API docs")
- **Never guess a number** — if you cannot find a documented limit, STOP and report to the user

#### 4h-main. Add config entry

Add an entry keyed by the **exact `provider` value used in `tool_provider_config.yaml`** (this must match the `tools.provider` column in PostgreSQL):

```json
"{provider}": {
  "display_name": "{Human Readable Name}",
  "health_url": "{upstream API health/ping URL}",
  "limit_type": "{unlimited|daily|monthly|hourly|credits}",
  "free_limit": {number_or_0_for_unlimited},
  "reset_period": "{none|daily|monthly|hourly}",
  "docs_url": "{URL to provider pricing/rate-limit page}",
  "limit_proof": "{one-line evidence string from docs}"
}
```

**Field rules:**

**SECURITY: NEVER put real API keys or tokens in `health_url`.** This file is committed to GitHub.
If a health check endpoint requires authentication, use the placeholder `TOKEN_FROM_ENV`:
```json
"health_url": "https://api.example.com/botTOKEN_FROM_ENV/getMe"
```
The `provider-health.job.ts` substitutes `TOKEN_FROM_ENV` with the matching env var at runtime.
If the provider doesn't need auth for health checks, use a lightweight public endpoint (even 401/403 proves the service is alive).

| Field | How to determine |
|-------|-----------------|
| `display_name` | Human-readable provider name (e.g. "NASA Open APIs", "Zinc E-commerce") |
| `health_url` | Upstream API URL that returns quickly. Prefer: `/ping`, `/health`, or a lightweight GET endpoint. Use the simplest possible query (e.g. `?limit=1`). Auth errors (401/403) are OK — they still prove the service is alive. |
| `limit_type` | `unlimited` if no rate cap. `daily`/`monthly`/`hourly` if time-based free tier. `credits` if balance-based (finite pool, not time-reset). |
| `free_limit` | Number of free calls in the reset period. `0` for unlimited. For credits: total starting balance. |
| `reset_period` | `none` for unlimited/credits. `daily`/`monthly`/`hourly` matching `limit_type`. |
| `docs_url` | URL to the provider's pricing or rate-limit documentation page. Use `"internal"` for internal services. |
| `limit_proof` | One-line English string summarizing the evidence (e.g. "Free plan: 1,000 calls/day, 60 calls/min"). |

Optional fields:
- `"paid_balance": true` — provider has paid usage (no free tier). Dashboard shows real-time balance instead of used/limit.
- `"balance_api": true` — provider has an API to check real credit balance (like ZeroBounce `/getcredits`)

**Real-time balance on dashboard (for `paid_balance: true` providers):**

If the provider has a balance API, add a case to `fetchBalanceUpstream()` in `src/services/dashboard.service.ts`:

```typescript
case 'newprovider': {
  const key = process.env.PROVIDER_KEY_NEWPROVIDER;
  if (!key) return null;
  const res = await fetch('https://api.newprovider.com/balance?key=' + key, { signal: AbortSignal.timeout(5000) });
  const data = await res.json();
  return { balance_usd: parseFloat(data.balance), currency: 'USD', last_check: new Date().toISOString() };
}
```

Currently supported: **NameSilo** ($XX.XX balance), **ZeroBounce** (credit count). Balance cached in Redis for 5min (`provider:balance:{name}`). Dashboard shows balance in green (>$10), orange (>$0), red ($0).

**Example entries:**
```json
// Free, unlimited
"jpl": {
  "display_name": "NASA JPL SSD",
  "health_url": "https://ssd-api.jpl.nasa.gov/cad.api?limit=1",
  "limit_type": "unlimited",
  "free_limit": 0,
  "reset_period": "none",
  "docs_url": "https://ssd-api.jpl.nasa.gov/doc/",
  "limit_proof": "US Government open data, no auth required, no documented rate limits"
}

// Free tier with daily limit
"spoonacular": {
  "display_name": "Spoonacular Recipe",
  "health_url": "https://api.spoonacular.com/recipes/complexSearch?query=test&number=1",
  "limit_type": "daily",
  "free_limit": 150,
  "reset_period": "daily",
  "docs_url": "https://spoonacular.com/food-api/pricing",
  "limit_proof": "Free plan: 150 points/day (most endpoints cost 1 point)"
}

// Paid per-call, no free tier
"zerobounce": {
  "display_name": "ZeroBounce",
  "health_url": "https://api.zerobounce.net/v2/getcredits",
  "limit_type": "credits",
  "free_limit": 100,
  "reset_period": "monthly",
  "paid_balance": true,
  "balance_api": true,
  "docs_url": "https://www.zerobounce.net/docs/email-validation-api-quickstart/",
  "limit_proof": "100 free/month, then $39/2K credits (no expiry)"
}
```

**The key MUST match the `provider` field used in `tool_provider_config.yaml`.** If they don't match, the dashboard will show "unknown" for health and limits. Verify after deploy:
```bash
curl -s https://apibase.pro/api/v1/dashboard | python3 -c "
import sys,json; d=json.load(sys.stdin)
for p in d['providers']:
    if p['provider'] == '{provider}':
        print(f'{p[\"provider\"]}: health={p[\"health\"][\"status\"]}, limits={p[\"limits\"][\"status\"]}, tools={p[\"tool_count\"]}')
"
```

---

## Step 5: Verify TypeScript Compilation AND Lint

```bash
npx tsc --noEmit 2>&1 | grep "src/" || echo "No TS errors in project source"
npx eslint src/adapters/{provider}/ src/schemas/{provider}.schema.ts 2>&1 || echo "LINT ERRORS — fix before continuing"
```

Must have zero errors in BOTH checks. **GitHub CI runs `npm run lint` — if it fails, the deploy is blocked.**

**Common lint errors to avoid:**
- **Unused imports** — only import types you actually reference in the code. If you define 5 types in `types.ts` but only use 3, import only those 3. This is the #1 cause of CI failures after onboarding.
- **Unused variables** — prefix with `_` if intentionally unused (e.g. `_unused`)
- Run `npx eslint --fix src/adapters/{provider}/` to auto-fix simple issues

---

## Step 6: Seed Database

```bash
# Get PostgreSQL container IP
PG_IP=$(sudo docker inspect apibase-postgres-1 2>/dev/null | python3 -c "import sys,json; c=json.load(sys.stdin)[0]; nets=c['NetworkSettings']['Networks']; print(list(nets.values())[0]['IPAddress'])")

DATABASE_URL="postgresql://apibase:REDACTED_PG_PASSWORD@${PG_IP}:5432/apibase?schema=public" npx tsx scripts/seed.ts
```

Verify: output should show "Upserted N tools" where N includes the new tools.

---

## Step 7: Build & Deploy

```bash
sudo docker compose build api
sudo docker compose up -d api
```

Wait for healthy status:
```bash
sleep 10 && sudo docker compose ps api --format "{{.Status}}"
```

---

## Step 8: Verify in Production

```bash
# Health check
curl -s https://apibase.pro/health/ready

# Verify ALL tools returned (default limit is 1000, must show has_more=false)
curl -s https://apibase.pro/api/v1/tools | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(f'Tools returned: {len(d[\"data\"])}, Total: {d[\"total\"]}, Has more: {d[\"pagination\"][\"has_more\"]}')
assert not d['pagination']['has_more'], 'ERROR: has_more=true — not all tools visible to agents!'
assert d['total'] == len(d['data']), f'ERROR: total ({d[\"total\"]}) != returned ({len(d[\"data\"])})'
"

# Verify new tools appear in catalog
curl -s https://apibase.pro/api/v1/tools | python3 -m json.tool | grep -i "{provider}"

# Check tool detail (must have input_schema with properties + rich description)
curl -s https://apibase.pro/api/v1/tools/{provider}.{first_tool} | python3 -c "
import sys,json; t=json.load(sys.stdin)
has_schema = bool(t.get('input_schema',{}).get('properties'))
has_desc = t.get('description','') != t.get('name','')
print(f'id={t[\"id\"]} schema={has_schema} rich_desc={has_desc}')
if not has_schema: print('ERROR: input_schema has no properties — agents cannot construct params!')
if not has_desc: print('ERROR: description just echoes name — add description in tool-definitions.ts!')
assert has_schema and has_desc, 'STOP: fix schema/description before continuing'
"

# Verify provider appears in dashboard (flush cache first)
sudo docker exec apibase-redis-1 redis-cli DEL 'dashboard:data'
curl -s https://apibase.pro/api/v1/dashboard | python3 -c "
import sys,json; d=json.load(sys.stdin)
match = [p for p in d['providers'] if p['provider'] == '{provider}']
if match:
    p = match[0]
    print(f'Dashboard: {p[\"provider\"]} — tools={p[\"tool_count\"]}, limits={p[\"limits\"][\"status\"]}')
else:
    print('ERROR: Provider NOT found in dashboard! Check provider-limits.json key matches tools.provider')
"
```

**CRITICAL:** The `/api/v1/tools` endpoint MUST return ALL tools in a single response (default limit 1000, max 1000). Verify `has_more: false` and `total` equals data length. If agents can't see all tools in one call, they will miss your new provider's tools. This was a production bug: with limit=50, agents only saw 50/158 tools.

---

## Step 9: Run Smoke Tests

```bash
sudo bash scripts/smoke-test.sh
```

Must pass 8/8.

---

## Step 10: Create UC File

Create `.claude/skills/user-usecases/usecases/UC-{NNN}-{provider}.md`.

Follow the template from `UC-023-sabre.md` or `_TEMPLATE.md`. Must include:
- Meta table (ID, provider, category, date, status)
- Client input data & credentials
- Provider API analysis
- Tool mapping table
- Input schemas
- Implementation files list
- Pricing rationale

Update the index in `.claude/skills/user-usecases/SKILL.md`.

---

## Step 11: Create Smoke Test Script

Create `scripts/test-{provider}.sh`. Must test:
1. Health check
2. Provider tools in catalog (count)
3. Tool detail endpoints (200)
4. Live API calls (with TEST_API_KEY if available)

Make executable: `chmod +x scripts/test-{provider}.sh`

---

## Step 12: Update README.md (MANDATORY — 3 edits, verified)

**CRITICAL: README.md uses a COMPACT format with a category summary table. Do NOT add per-provider tool tables — agents get full schemas from `/api/v1/tools` endpoint.**

**README format (as of 2026-03-20):** ~200 lines, compact. Key sections:
- Tagline with tool/provider count
- "What is APIbase?" paragraph with tool count
- **Category table** (`## Tool Categories`) — one row per category with tools count, providers, examples
- Payment, auth, error codes, integrations, architecture

### 12a. Count current tools BEFORE editing

```bash
TOOL_COUNT=$(curl -s https://apibase.pro/api/v1/tools | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])")
PROVIDER_COUNT=$(curl -s https://apibase.pro/api/v1/dashboard | python3 -c "import sys,json; print(json.load(sys.stdin)['totals']['providers'])")
echo "Active tools: $TOOL_COUNT, Providers: $PROVIDER_COUNT"
```

### 12b. Edit 1 — Update tool/provider counts everywhere

Use `sed -i` with `replace_all` to update ALL occurrences:

```bash
sed -i "s/{OLD_TOOLS} tools/{NEW_TOOLS} tools/g" README.md
sed -i "s/{OLD_TOOLS} real-world/{NEW_TOOLS} real-world/g" README.md
sed -i "s/{OLD_PROVIDERS} providers/{NEW_PROVIDERS} providers/g" README.md
```

This updates: tagline, "What is APIbase?" paragraph, description paragraph, category table header.

**CRITICAL: The "What is APIbase?" paragraph contains a hardcoded tool count like "327 real-world API tools". This MUST be updated too.** Also update the "and 200+ more tools" part if the number has grown significantly (e.g. 200+ → 250+).

### 12c. Edit 2 — Update category table row (MANDATORY — NEVER SKIP)

Find the category row that matches the new provider's category in the `## Tool Categories` table in README.md. Update the **Tools** count and **Providers** list.

**Current categories (as of 2026-04-01, 413 tools, 123 providers):**

| Category | Current Tools | Key Providers |
|----------|--------------|---------------|
| Web Search | 11 | Serper, Tavily, Exa, Spider.cloud |
| News & Events | 10 | NewsData, GDELT, Mastodon, Currents |
| Social | 7 | Bluesky, TwitterAPI.io |
| Travel & Flights | 17 | Amadeus, Sabre, Aviasales |
| Finance & Stocks | 16 | Finnhub, CoinGecko, ECB, FRED |
| Jobs & Career | 20 | Adzuna, TheirStack, Jooble, Reed, Remotive, Arbeitnow |
| E-commerce | 12 | Zinc, Canopy API, Diffbot, Zyte |
| Entertainment | 24 | TMDB, Ticketmaster, RAWG, IGDB, Jikan |
| Weather | 7 | WeatherAPI.com, NWS, NASA FIRMS |
| Chemistry & Biology | 16 | PubChem, RCSB PDB, NCI CACTUS, Materials Project |
| Sports | 7 | API-Sports, BallDontLie |
| Logistics | 7 | 17TRACK, DHL, ShipEngine |
| Memes & Fun | 2 | Imgflip |
| Postal Codes | 4 | Zippopotam.us, Postcodes.io |

**When adding a provider:**
1. Find its category row → increment Tools count + add provider name
2. If the provider creates a **NEW category** not in the table, add a new row
3. **ALWAYS verify** the total tools count in the header matches: `## Tool Categories (N tools, M providers)`

Example: adding a new finance provider with 3 tools:
```
| **Finance & Stocks** | 16 | Finnhub, CoinGecko, ECB, FRED | ...
```
→ becomes:
```
| **Finance & Stocks** | 19 | Finnhub, CoinGecko, ECB, FRED, NewProvider | ...
```

### 12d. Edit 3 — Update dashboard category filter + search (MANDATORY)

In `static/dashboard.html`, find the `PROVIDER_CATEGORIES` JavaScript object and add the new provider's `display_name → category` mapping:

```javascript
// In PROVIDER_CATEGORIES object:
'New Provider Display Name': 'CategoryName',
```

**This step is critical for dashboard search AND category filter.** The dashboard has a live search bar that searches across three fields:
- `display_name` — from `provider-limits.json` (set in Step 4h)
- `provider` — internal DB key (from `tool_provider_config.yaml`)
- `category` — from `PROVIDER_CATEGORIES` mapping (set here)

**If you skip this step:** the provider will still appear in the table but will be categorized as "Other" and may be harder to find via search by category name. The `display_name` and `provider` are always searchable regardless.

Use the `display_name` from `provider-limits.json` as the key. Use one of the existing category names if possible:
`Travel`, `Finance`, `Crypto`, `Search`, `News`, `Maps`, `Entertainment`, `Music`, `Health`, `Education`, `Jobs`, `Legal`, `Real Estate`, `Space`, `Weather`, `Translation`, `Sports`, `Holidays`, `AI Tools`, `Email & SMS`, `Social`, `E-commerce`, `Domain & SSL`, `QR & Barcode`, `URL Shortener`, `IP Intelligence`, `AI Marketing`, `Timezone`, `Earthquakes`, `Books`, `Places`, `Recipes`, `Vehicle`, `Country Data`, `Food Products`, `Test Data`, `Air Quality`, `Nutrition`, `Business`, `Address & Postal`, `Podcasts`, `PDF & Documents`, `Art & Culture`, `Company Data`, `Audio & Speech`, `Tax & VAT`, `Domain Registration`, `Infrastructure`, `Web Scraping`, `Memes & Fun`, `Banking`, `Logistics`, `Developer`, `Security`, `Chemistry`, `Science`, `Clinical Research`

**If the provider creates a NEW category** (none of the above fit), you MUST update ALL of these locations:

| Location | What to add |
|----------|------------|
| `static/dashboard.html` → `PROVIDER_CATEGORIES` | `'Display Name': 'New Category'` |
| `README.md` → `## Tool Categories` table | New row with category, tools count, providers, examples |
| `src/mcp/tool-definitions.ts` → entry `category` field | New category string (lowercase, used by `discover_tools`) |
| `src/mcp/prompt-adapter.ts` | Auto-derived from tool-definitions — no manual change needed |
| `static/.well-known/ai-capabilities.json` → `categories` array | Add new category with tool count |

**NEVER leave a provider without a category.** Uncategorized = "Other" on dashboard = invisible to agents filtering by category.

### 12e. Edit 4 — Verify all counts match

```bash
grep "One endpoint" README.md
grep "Production MCP server" README.md | head -c 100
grep "Tool Categories" README.md
```

**All must show the NEW count.**

---

## Step 12.5: Update Homepage + Terms Page (MANDATORY — NEVER SKIP)

After README update, update **both** `static/index.html` and `static/terms.html` with the new tool and provider counts.

### 12.5a: Update `static/index.html` (EXHAUSTIVE — NO STALE COUNTS ALLOWED)

**DO NOT use simple `sed 's/OLD providers/NEW providers/g'`.** The homepage has provider/tool counts in 15+ places with DIFFERENT wording patterns. Simple sed misses most of them.

**MANDATORY PROCEDURE — grep-first, then fix each match:**

```bash
# Step 1: Find ALL lines with the OLD provider count (e.g., 148)
grep -n "${OLD_PROVIDER_COUNT}" static/index.html
# Step 2: Find ALL lines with the OLD tool count (e.g., 484)
grep -n "${OLD_TOOL_COUNT}" static/index.html
# Step 3: Fix EVERY match individually using Edit tool (not sed)
# Step 4: Re-run grep to confirm ZERO matches remain
```

**Known provider count patterns (ALL must be updated):**
1. `<title>` — `"N+ API Tools"`
2. `<meta name="description">` — `"N providers"`
3. `<meta property="og:title">` — `"N+ Tools"`
4. `<meta property="og:description">` — `"N providers"`
5. `<meta name="twitter:description">` — `"N providers"`
6. `<h1>` — `"N+ API Tools"`
7. Terminal JSON block — `"N providers"` in description string
8. Boot sequence — `"N providers"` in loading message
9. Short answer paragraph — `"N upstream providers"` ← **DIFFERENT WORDING, often missed!**
10. "Why people choose" list — `"replaces N separate provider integrations"` ← **DIFFERENT WORDING, often missed!**
11. "Why people choose" list — `"N tools across travel..."` ← tool count with category list
12. Comparison table — `"N+"` in APIbase row
13. Status bar — `PRV:</span><strong>N</strong>` ← **HTML tags around number!**
14. Status bar — `TOOLS:</span><strong>N</strong>` ← **HTML tags around number!**
15. Footer — `TOOLS: N`
16. Step wizard — `"N tools available"`
17. FAQ section — category list if new category added
18. JSON-LD schema — `"description"` field in `<script type="application/ld+json">`

**CRITICAL RULE: After ALL edits, run this exhaustive check:**
```bash
echo "=== Checking for stale provider count (${OLD_PROVIDER_COUNT}) ==="
grep -n "${OLD_PROVIDER_COUNT}" static/index.html
echo "=== Checking for stale tool count (${OLD_TOOL_COUNT}) ==="
grep -n "${OLD_TOOL_COUNT}" static/index.html
echo "=== Must show ZERO lines above. If any remain, fix them NOW ==="
```

**If grep returns ANY line, you MUST fix it before proceeding.** Do not assume "it's probably fine" — every stale number is visible to agents and users.

### 12.5b: Update `static/terms.html`

The Terms of Service page has tool/provider counts in two places:

1. **Section 1 (Service Description):** `"285+ API tools from 80+ providers"` → update both numbers
2. **Footer:** `"285 tools  |  80 providers"` → update both numbers

```bash
# Find and replace in terms.html
grep -n "tools\|providers" static/terms.html | grep "[0-9]"
```

### Verification for ALL pages (MANDATORY — run AFTER Nginx recreate):
```bash
# 1. Recreate Nginx to pick up static file changes
sudo docker compose up -d nginx --force-recreate

# 2. Wait for Nginx to restart
sleep 3

# 3. Auto-verify counts match live API
LIVE=$(curl -s https://apibase.pro/api/v1/tools | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])")
SITE=$(curl -s https://apibase.pro/ | grep -oP '\d+(?= tools)' | head -1)
echo "API: ${LIVE} tools | Site: ${SITE} tools"
if [ "$LIVE" != "$SITE" ]; then
  echo "ERROR: Site shows ${SITE} but API has ${LIVE} — fix static/index.html!"
  exit 1
fi
echo "OK — counts match"
```
**CRITICAL:** After updating static files, ALWAYS run `sudo docker compose up -d nginx --force-recreate`. Without this, Nginx serves the old cached version. This is the #1 reason homepage shows stale counts.
```

**All pages with counts that MUST be updated on every onboarding:**

| Page | File | What to update |
|------|------|---------------|
| Homepage | `static/index.html` | Title, meta, og, h1, terminal, body, table, status bar |
| Terms | `static/terms.html` | Section 1 description + footer |
| README | `README.md` | Tagline, description, category table header, tool catalog line |

---

## Step 12.55: Update Agent-Facing Discovery Files (MANDATORY — NEVER SKIP)

**All agent-facing discovery files MUST have current tool/provider counts.** These are the files agents and LLMs read to understand APIbase capabilities. Stale counts = agents think we have fewer tools than we do.

| File | What to update |
|------|---------------|
| `static/ai.txt` | Tool count in Identity + Quick Start sections |
| `static/llms.txt` | Tool count in header + Quick Start |
| `static/.well-known/mcp.json` | `tools_count`, `providers_count`, AND `description` (contains tool/provider counts as text) |
| `static/.well-known/ai-capabilities.json` | `tools_count`, `providers_count`, category tool counts |
| `static/.well-known/mcp/server-card.json` | Regenerated in Step 14b (auto-picks up new tools) |

**CRITICAL: Use the LIVE count from `/api/v1/tools`, NOT the code definitions count.**

There are TWO different numbers:
- `src/mcp/tool-definitions.ts` — all definitions in code (e.g. 415), includes unavailable tools
- `/api/v1/tools` total — active tools agents actually see (e.g. 409, because 5 foursquare are `status=unavailable` in DB)

Discovery files MUST show the **live API count** — that's what agents can actually call. Using the code count is a bug (agents see "409 tools" in catalog but "415" in docs = confusion).

**For each file, update:**
1. **Total tool count** — must match live `/api/v1/tools` total (NOT grep count from tool-definitions.ts)
2. **Provider count** — must match live `/api/v1/dashboard` provider total
3. **Category counts in `ai-capabilities.json`** — increment the matching category's `tools` field by the number of new tools added

**Verification after deploy:**
```bash
# All files must show the same tool count
AI_TXT=$(curl -s https://apibase.pro/ai.txt | grep -oP 'Tools: \K\d+')
LLMS_TXT=$(curl -s https://apibase.pro/llms.txt | grep -oP '\K\d+(?= API tools)')
MCP_JSON=$(curl -s https://apibase.pro/.well-known/mcp.json | python3 -c "import sys,json; print(json.load(sys.stdin)['tools_count'])")
CAP_JSON=$(curl -s https://apibase.pro/.well-known/ai-capabilities.json | python3 -c "import sys,json; print(json.load(sys.stdin)['tools_count'])")
API_COUNT=$(curl -s https://apibase.pro/api/v1/tools | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])")
echo "ai.txt=$AI_TXT llms.txt=$LLMS_TXT mcp.json=$MCP_JSON capabilities=$CAP_JSON API=$API_COUNT"
# All 5 numbers MUST be equal
```

**After updating static files, recreate Nginx:**
```bash
sudo docker compose up -d nginx --force-recreate
```

---

## Step 12.6: Nginx Static File Locations (CHECK when adding new static files)

**Every new static file** that needs to be served at a top-level URL (e.g., `/logo.svg`, `/new-image.png`) **MUST have a matching `location` block in `nginx/nginx.conf`**.

The `static/` directory is bind-mounted into Nginx at `/var/www/static`, but files are only served if there is an explicit `location` block in the Nginx config. Without it, the file exists on disk but returns 404.

**Current registered static locations in `nginx/nginx.conf`:**
```
/index.html, /dashboard.html, /contact.html, /privacy.html  → HTML pages
/favicon.svg, /favicon.png, /icon.png                        → Favicons
/logo.png, /logo.svg                                         → Logos
/og-image.png                                                → Social preview
/.well-known/*                                               → MCP discovery, OpenAPI
/robots.txt, /ai.txt, /llms.txt                              → Bot files
```

**When adding a new static file:**
1. Place the file in `static/` directory
2. Add a `location = /filename.ext` block in `nginx/nginx.conf`:
```nginx
location = /new-file.ext {
    root /var/www/static;
    types { correct/mime-type ext; }
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```
3. Test: `sudo docker exec apibase-nginx-1 nginx -t`
4. Recreate: `sudo docker compose up -d nginx --force-recreate`
5. Verify: `curl -sI https://apibase.pro/new-file.ext | head -3`

**Common MIME types:**
- `image/png png` | `image/svg+xml svg` | `image/jpeg jpg` | `application/json json`
- `text/plain txt` | `text/html html` | `application/pdf pdf`

**If you skip this step, the file will return 404 even though it exists on disk.**

---

## Step 12.7: Verify Tool Count Consistency (MANDATORY — NEVER SKIP)

**All 4 tool count sources MUST show the same number.** If they don't, the onboarding has a bug.

The single source of truth chain is:
1. `tool_provider_config.yaml` → defines which tools exist (seed input)
2. `src/mcp/tool-definitions.ts` → defines MCP-facing tools (must match yaml, minus any legacy/unavailable)
3. PostgreSQL `tools` table → `WHERE status != 'unavailable'` (seeded from yaml)
4. `/api/v1/tools` endpoint → reads from PG, filters `status != 'unavailable'`
5. `/api/v1/dashboard` → reads from PG, same filter
6. `README.md` + `static/index.html` → manually set, must match

**Verify after deploy:**
```bash
# Count from source files
YAML_COUNT=$(grep "^  - tool_id:" config/tool_provider_config.yaml | wc -l)
MCP_COUNT=$(grep "toolId: '" src/mcp/tool-definitions.ts | wc -l)

# Count from live API
API_COUNT=$(curl -s https://apibase.pro/api/v1/tools | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])")

# Count from dashboard
DASH_COUNT=$(curl -s https://apibase.pro/api/v1/dashboard | python3 -c "import sys,json; print(json.load(sys.stdin)['totals']['tools'])")

echo "YAML=$YAML_COUNT MCP=$MCP_COUNT API=$API_COUNT DASH=$DASH_COUNT"
# All 4 numbers MUST be equal. If not, investigate.
```

**Common causes of mismatch:**
- Legacy/unavailable tools in DB not filtered by API query
- Seed didn't run after removing a tool from yaml
- `tool-definitions.ts` has a comment line caught by grep

---

## Step 13: Update Memory

Update `/home/apibase/.claude/projects/-home-apibase-apibase/memory/MEMORY.md`:
- Add provider to "Connected Providers" list
- Update tool count in "Production Status"

---

## Step 14: Regenerate OpenAPI Spec + server-card.json (MANDATORY — BEFORE commit)

**This step MUST happen BEFORE the git commit so the updated files are included.**

### 14a. Regenerate OpenAPI spec (includes MPP discovery)

```bash
npx tsx scripts/generate-openapi.ts
```

Verify output shows correct tool count. `static/.well-known/openapi.json` must be updated.

**CRITICAL: OpenAPI now includes MPP (Machine Payments Protocol) discovery fields.** Every tool gets:
- `x-payment-info` with `pricingMode`, `price`, and `protocols: ["x402", "mpp"]`
- `402` response description: `"Payment Required"`

This is how MPPScan, AgentCash, and Tempo agents discover our paid endpoints. The price comes from `tool_provider_config.yaml` — ensure the new provider's tools have correct `price_usd` values BEFORE regenerating.

**Verify MPP discovery after deploy:**
```bash
npx -y @agentcash/discovery@latest discover https://apibase.pro 2>&1 | grep "{provider}" | head -5
# Expected: each tool shows "paid  $X.XXXXXX  [x402, mpp]"
```

### 14b. Regenerate server-card.json (CRITICAL — must include new tools)

**`server-card.json` does NOT auto-update.** It is a static file on disk. If you skip this step, Smithery will show the old tool count and new provider's tools will be missing from the card.

**Regenerate from live API data:**
```python
python3 << 'PYEOF'
import json, subprocess, re

# Get live tools from API
result = subprocess.run(['curl', '-s', 'https://apibase.pro/api/v1/tools'], capture_output=True, text=True)
api_tools = json.loads(result.stdout)

# Read current server-card
with open('static/.well-known/mcp/server-card.json') as f:
    card = json.load(f)

# Parse toolId -> mcpName mapping from tool-definitions.ts
with open('src/mcp/tool-definitions.ts') as f:
    td = f.read()
toolid_to_mcpname = {}
for m in re.finditer(r"toolId:\s*'([^']+)'.*?mcpName:\s*'([^']+)'", td, re.DOTALL):
    toolid_to_mcpname[m.group(1)] = m.group(2)

# Find missing tools and add them
existing = {t['name'] for t in card['tools']}
added = 0
for t in api_tools['data']:
    mcpname = toolid_to_mcpname.get(t['id'], t['id'])
    if mcpname not in existing:
        card['tools'].append({
            "name": mcpname,
            "title": t.get('name', ''),
            "description": t.get('description', ''),
            "inputSchema": t.get('input_schema', {"type": "object", "properties": {}}),
            "annotations": {"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": True}
        })
        added += 1

card['description'] = f"Unified MCP gateway to {len(card['tools'])} tools. Dual-rail: x402 + MPP."

# CRITICAL: Validate ALL tool names are 3-level dot-notation (provider.category.action)
# Smithery scores "Tool names" 5pt — any 2-level name = 0/5pt = red X
bad_names = [t['name'] for t in card['tools'] if t['name'].count('.') != 2]
if bad_names:
    print(f"FAIL: {len(bad_names)} tools have non-3-level names (Smithery will score 0/5pt):")
    for b in bad_names:
        correct = toolid_to_mcpname.get(b)
        print(f"  BAD: {b} → should be: {correct or 'UNKNOWN — check tool-definitions.ts'}")
    raise SystemExit(1)

total = sum(len(x.get('inputSchema',{}).get('properties',{})) for x in card['tools'])
desc = sum(1 for x in card['tools'] for v in x.get('inputSchema',{}).get('properties',{}).values() if v.get('description'))
print(f"Added: {added}, Tools: {len(card['tools'])}, Params: {desc}/{total}")
assert desc == total, f'FAIL: param descriptions {desc}/{total}'

with open('static/.well-known/mcp/server-card.json', 'w') as f:
    json.dump(card, f, indent=2)
print("server-card.json updated! All names 3-level ✓")
PYEOF
```

**Why this matters:** Smithery reads the live MCP endpoint during `publish`, but `server-card.json` is also served at `/.well-known/mcp/server-card.json` for other clients. If the file is stale, Smithery score page shows old param count (e.g. 400/400 instead of 415/415).

**CRITICAL: The script MUST use `mcpName` (3-level) NOT `toolId` (2-level) for the `name` field.** The fallback `toolid_to_mcpname.get(t['id'], t['id'])` uses the 2-level `toolId` when the mapping is missing — this breaks Smithery "Tool names" score (0/5pt). The validation block above catches this and aborts with an error listing the bad names. Fix: ensure every tool in `tool-definitions.ts` has a matching `toolId`→`mcpName` pair that the regex can parse.

**If verification fails — STOP. Fix before continuing.**

---

## Step 15: Commit & Push to GitHub (NON-NEGOTIABLE — NEVER SKIP)

**This step is MANDATORY. Every provider onboarding MUST result in a git push to GitHub. If this step is not completed, the onboarding is NOT finished. Do NOT end the conversation without pushing.**

```bash
git add \
  src/adapters/{provider}/ \
  src/schemas/{provider}.schema.ts \
  src/adapters/registry.ts \
  src/schemas/index.ts \
  src/mcp/tool-definitions.ts \
  config/tool_provider_config.yaml \
  src/config/provider-limits.json \
  README.md \
  static/index.html \
  static/.well-known/openapi.json \
  static/.well-known/mcp/server-card.json \
  scripts/test-{provider}.sh \
  [any other changed files]

git commit -m "feat: integrate {Provider} — {N} tools (UC-{NNN})"
git push origin main
```

**Verification — MUST see the push succeed:**
```bash
git log --oneline -1  # Must show the new commit
git status            # Must show "nothing to commit, working tree clean" (for tracked files)
```

**If push fails (auth, network, etc.) — retry or report the error. Do NOT proceed without a successful push.**

---

## Step 16: Publish to Smithery (NON-NEGOTIABLE — NEVER SKIP)

**This step is MANDATORY. Every provider onboarding MUST trigger a Smithery publish so the new tools appear at https://smithery.ai/servers/apibase-pro/api-hub/releases. If this step is not completed, the onboarding is NOT finished.**

```bash
SMITHERY_API_KEY=$(grep SMITHERY_API_KEY .env | cut -d= -f2-) \
npx -y @smithery/cli@latest mcp publish \
  "https://apibase.pro/mcp" \
  -n "apibase-pro/api-hub" \
  --config-schema '{"type":"object","required":[],"properties":{"apiKey":{"type":"string","description":"APIbase API key (ak_live_...). Leave empty for auto-registration."}}}'
```

**CRITICAL: `"required":[]` must be empty array. This gives "Optional config" 15pt.**

**Verification — MUST see `✓ Release successful!` in output:**
- Output must contain: `Release <uuid> accepted`
- Output must contain: `Release successful!`
- Output must show correct tool count (e.g. `410 tools, 4 prompts`)

**If publish fails — diagnose and retry. Common fixes:**
- Missing SMITHERY_API_KEY → tell user to create at smithery.ai/account/api-keys
- Timeout → retry the command
- Schema validation error → check server-card.json was regenerated (Step 14b)

**After publish, verify release is visible at:** https://smithery.ai/servers/apibase-pro/api-hub/releases

---

## STOP GATE: Verify Steps 15 + 16 (HARD BLOCK)

**DO NOT PROCEED past this point without verifying BOTH conditions:**

```bash
# 1. Git push happened?
git log --oneline -1 | grep "{provider}"
# MUST show the new commit. If not → go back to Step 15.

# 2. Smithery publish happened?
# MUST have seen "Release <uuid> accepted" in output. If not → go back to Step 16.
# The EXACT command is in /home/apibase/apibase/.claude/skills/smithery/SKILL.md
# Package: @smithery/cli@latest (NOT @anthropic-ai/smithery-cli)
# If CLI fails with unknown package → READ the smithery skill for the correct command.
# NEVER skip Smithery. NEVER say "it will auto-rescan". NEVER defer to "next time".
```

**If EITHER check fails, the onboarding is INCOMPLETE. Fix it NOW.**

---

## Step 17: Republish to Glama (report to user)

After every provider onboarding, update Glama so it detects the new tools:

1. Go to https://glama.ai/mcp/servers/whiteknightonhorse/APIbase/admin/dockerfile
2. Click **Deploy** — Glama rebuilds Docker image and re-inspects the server
3. Wait for build test to pass (green check in Instance logs)
4. Click **Create Release**
5. Fill changelog: `Added {Provider} — {N} tools ({tool list})`
6. Go to Score tab — verify Security A, License A, Quality A

**This step requires manual UI interaction — remind the user to do it.**

---

## Smithery Quality Score Checklist

After every onboarding, ALL of these must be true to maintain 100%:

| Category | Requirement | How to check |
|----------|-------------|--------------|
| **Tool descriptions** 12pt | Every tool has `description` in TOOL_DEFINITIONS | grep for tools without description |
| **Parameter descriptions** 11pt | Every Zod field has `.describe()`, no empty schemas | Check schema files |
| **Annotations** 7pt | Every tool has `annotations` (READ_ONLY/TRADING/CANCEL) | grep for tools without annotations |
| **Tool names** 5pt | Every tool has `mcpName` (3-level: `provider.category.action`) and `title` | Check TOOL_DEFINITIONS |
| **Prompts** 5pt | 4 prompts registered in `prompt-adapter.ts` (incl. `discover_tools`) | Already done |
| **Resources** 5pt | MCP resources (already handled by scan) | Already done |
| **Description** 10pt | Server description in `server.ts` SERVER_INFO | Already done |
| **Homepage** 10pt | websiteUrl in SERVER_INFO | Already done |
| **Icon** 7pt | `static/icon.png` served at `/icon.png` | Already done |
| **Display name** 3pt | Set in Smithery Settings UI | Already done |
| **Optional config** 15pt | Publish with `"required":[]` | Check publish command |
| **Config schema** 10pt | Config schema has apiKey property | Check publish command |

---

## Checklist

### Code & Config
- [ ] Adapter files created (types.ts, auth.ts if needed, index.ts)
- [ ] Zod schemas created with `.describe()` on EVERY field
- [ ] No empty schemas (every tool has at least 1 param with description)
- [ ] .env updated with credentials (if needed)
- [ ] env.ts updated with schema (if needed)
- [ ] registry.ts updated with case
- [ ] schemas/index.ts updated with import
- [ ] tool-definitions.ts updated with ALL 6 fields: `toolId`, `mcpName` (3-level), `title`, `description`, `category` (one of 21), `annotations`
- [ ] tool_provider_config.yaml updated with entries
- [ ] `src/config/provider-limits.json` updated with dashboard entry (display_name, health_url, limit_type, free_limit, reset_period)
- [ ] Platform features evaluated: prefetch rules added to `src/config/prefetch-rules.ts` if applicable (quality index, batch, analytics are automatic)
- [ ] TypeScript compiles with zero errors

### Build & Deploy
- [ ] Database seeded (SQL or seed script)
- [ ] API container built and deployed (`docker compose build api && docker compose up -d api`)
- [ ] Health check passes: `curl -s https://apibase.pro/health/ready`
- [ ] Tools visible at https://apibase.pro/api/v1/tools (ALL tools, has_more=false, total matches)

### Documentation & Artifacts
- [ ] UC file created/updated
- [ ] Smoke test script created
- [ ] **README.md updated** — tagline count, description count, category table row updated/added (NEVER SKIP). No per-provider tool tables — README uses compact category summary format.
- [ ] **Homepage updated** — `static/index.html` tool count and provider count match README (NEVER SKIP)
- [ ] **Terms page updated** — `static/terms.html` section 1 + footer counts match README (NEVER SKIP)
- [ ] **Agent discovery files updated** (NEVER SKIP — verify ALL 4 files have identical tool count):
  - [ ] `static/ai.txt` — `Tools:` line matches live count
  - [ ] `static/llms.txt` — header + Quick Start tool count matches
  - [ ] `static/.well-known/mcp.json` — `tools_count` + `providers_count` + `description` text (all 3 contain counts that must match)
  - [ ] `static/.well-known/ai-capabilities.json` — `tools_count` + `providers_count` fields match
- [ ] Memory updated

### Regeneration (MUST happen before commit)
- [ ] OpenAPI spec regenerated: `npx tsx scripts/generate-openapi.ts` — includes MPP `x-payment-info` for all tools
- [ ] MPP discovery verified: `npx -y @agentcash/discovery@latest discover https://apibase.pro | grep "{provider}"` shows new tools with `[x402, mpp]`
- [ ] server-card.json regenerated with prompts (410+ tools, 4 prompts incl. discover_tools, N/N params)

### Publish (NON-NEGOTIABLE — onboarding is NOT complete without these)
- [ ] **Git push to GitHub** — `git push origin main` succeeded (verify with `git log --oneline -1`)
- [ ] **Smithery publish** — `npx -y @smithery/cli@latest mcp publish ...` showed `✓ Release successful!`
- [ ] **Smithery release visible** at https://smithery.ai/servers/apibase-pro/api-hub/releases
- [ ] Glama: remind user to Deploy → Create Release (manual UI step)
- [ ] **GitHub repo description (MANDATORY — run every onboarding)** — Update the "About" section with LIVE tool/provider counts. Run this EXACT command (it auto-fetches counts from API):
  ```bash
  TOOL_COUNT=$(curl -s https://apibase.pro/api/v1/tools | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])")
  PROVIDER_COUNT=$(curl -s https://apibase.pro/api/v1/dashboard | python3 -c "import sys,json; print(json.load(sys.stdin)['totals']['providers'])")
  gh api repos/whiteknightonhorse/APIbase -X PATCH \
    -f description="Universal MCP gateway for AI agents — ${TOOL_COUNT} tools, ${PROVIDER_COUNT} providers. Bloomberg FIGI, SEC XBRL, npm, PyPI, climate, US Census, Congress, FEMA, SAM.gov, EPA, USNO, exercises, email verification. Pay per call with x402 USDC on Base + MPP Tempo."
  echo "GitHub description updated: ${TOOL_COUNT} tools, ${PROVIDER_COUNT} providers"
  ```
  **CRITICAL: This command auto-reads live counts. Do NOT hardcode numbers. Do NOT use {N}/{M} placeholders. Run the command as-is.** Stale GitHub description is the first thing developers see — it MUST match the live API count.

### Discovery (automatic — no action needed per provider)
- **CDP Bazaar:** New tools are auto-registered in CDP Discovery catalog (14K+ resources) when `CDP_ENABLED=true` and agents make x402 payments. No per-provider config needed — the dual-facilitator (`src/services/x402-server.service.ts`) handles this automatically.
- **MPPScan:** Auto-indexed via MPP payments. No action needed.
- **x402search.xyz:** Auto-indexed via CDP Bazaar. Agents search 13K+ x402 APIs here.
- [ ] Homepage verified: `curl -s https://apibase.pro/ | grep '<!doctype'` returns HTML (not JSON)
- [ ] **Official MCP Registry** — publish every 10 providers (not every onboard to avoid spam):

### Official MCP Registry — Batch Update Rule

**Publish to Official MCP Registry every 10 new providers, NOT every single onboard.**

Reason: the registry is a curated catalog, not a real-time feed. Publishing after every single provider (1-2 tools) creates noise. Batch updates (e.g. "327 tools, 92 providers") are more impactful.

**When to publish:**
- After every 10th new provider onboarded (e.g. at 100, 110, 120 providers)
- After a major milestone (e.g. 350 tools, 400 tools)
- After significant capability additions (new payment rail, new category)

**How to publish:**
```bash
# Update server.json description with current counts
# Then:
mcp-publisher publish
```

If token expired (401 error):
```bash
mcp-publisher login github
# Go to https://github.com/login/device
# Enter the displayed code
# Then retry: mcp-publisher publish
```

**Token location:** `.mcpregistry_registry_token` (auto-saved after login, expires ~30-90 days)

**Registry details:**
- URL: https://registry.modelcontextprotocol.io
- Our ID: `io.github.whiteknightonhorse/apibase`
- Config: `server.json` in project root
- Description max: 100 characters

---

## Step 18: Post-Deploy Verification Skills (MANDATORY)

After Step 17, run these skills in order. They replace manual verification.

### 18a. `/test-quick` — Payment Bypass Check

Verify that the new provider's paid tools require payment via MCP:

```
Run /test-quick
Expected: P0 discovery shows new tool count, P18 payment bypass 14/14 PASS
```

If P18 fails → the new provider may have broken payment enforcement. Investigate BEFORE proceeding.

### 18b. `/review` — Security Code Review

Launch cold-eyes review agent on the new adapter code:

```
Run /review
Expected: PASS — no OWASP issues, no leaked secrets, no pipeline invariant violations
```

If /review finds issues → fix them BEFORE push. Run `/flywheel` after fix.

### 18c. `/push` — Safe Push (replaces manual `git push`)

```
Run /push
Performs: TS check → secret scan → discovery sync check → git push → health verify
```

**NEVER use `git push origin main` directly. Always use `/push`.**

### 18d. Update Memory

Update `/home/apibase/.claude/projects/-home-apibase-apibase/memory/MEMORY.md`:
- Add provider to "Connected Providers" list
- Update tool count in "Production Status"

---

## Orchestrated Workflow Summary

**One command to the user: `/onboard-provider <name>`**

This skill orchestrates ALL other skills internally:

| Step | What | Skill Used |
|------|------|-----------|
| 1-3 | Read patterns, create adapter + schema | onboard-provider (this skill) |
| 4 | Register in registry, env, config | onboard-provider |
| 5-8 | Build, deploy, seed, smoke test | onboard-provider |
| 9-10 | UC file, smoke test script | onboard-provider |
| 11 | provider-limits.json (dashboard config) | **dashboard** knowledge |
| 12 | README, homepage, terms, discovery files | onboard-provider |
| 12.5 | Dashboard category mapping | **dashboard** knowledge |
| 12.55 | ai.txt, llms.txt, mcp.json, ai-capabilities.json | onboard-provider |
| 13 | Memory update | onboard-provider |
| 14a | OpenAPI spec regeneration | **integrations** knowledge |
| 14b | server-card.json regeneration | **integrations** knowledge |
| 15 | Git commit | onboard-provider |
| 16 | Smithery publish | **smithery** knowledge |
| 17 | Glama reminder | onboard-provider |
| 18a | Payment bypass test | **/test-quick** |
| 18b | Security review | **/review** |
| 18c | Safe push | **/push** |
| 18d | Memory update | onboard-provider |

**The user says:** `Подключаем UC-XXX` or `/onboard-provider <name>`
**Claude executes:** All 18 steps + 4 sub-skills automatically.

### STOP CONDITIONS — Onboarding is NOT finished if ANY of these are true:
- `git log --oneline -1` does NOT show the new provider commit → **push failed, fix it**
- Smithery output does NOT contain `Release successful` → **publish failed, fix it**
- `has_more: true` in tool catalog → **agents can't see all tools, fix it**
- `/test-quick` P18 fails → **payment bypass, investigate immediately**
- `/review` found CRITICAL/HIGH issues → **fix before declaring done**
