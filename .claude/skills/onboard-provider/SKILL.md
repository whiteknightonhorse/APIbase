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
src/mcp/tool-adapter.ts               — MCP tool definitions
config/tool_provider_config.yaml      — Tool config (prices, TTLs)
src/config/env.ts                     — Environment variable schema
.env                                  — Environment variables
```

Also read one existing adapter as reference (e.g. `src/adapters/openweathermap/` or `src/adapters/sabre/`).

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

Use `.strip()` on all schemas.

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

### 4d. `src/schemas/index.ts` — Import and spread schemas
```typescript
import { {provider}Schemas } from './{provider}.schema';
// In toolSchemas:
...{provider}Schemas,
```

### 4e. `src/mcp/tool-adapter.ts` — Add tool definitions
```typescript
// {Provider} ({N})
{ toolId: '{provider}.{tool}', description: '...' },
```
Update the tool count comment at the top.

### 4f. `config/tool_provider_config.yaml` — Add tool entries
```yaml
# --- UC-{NNN}: {Provider} ---
- tool_id: {provider}.{tool}
  name: {Tool Name}
  provider: {provider}
  price_usd: "{price}"
  cache_ttl: {ttl}
```

---

## Step 5: Verify TypeScript Compilation

```bash
npx tsc --noEmit 2>&1 | grep "src/" || echo "No errors in project source"
```

Must have zero errors in `src/` files.

---

## Step 6: Seed Database

```bash
# Get PostgreSQL container IP
PG_IP=$(sudo docker inspect apibase-postgres-1 2>/dev/null | python3 -c "import sys,json; c=json.load(sys.stdin)[0]; nets=c['NetworkSettings']['Networks']; print(list(nets.values())[0]['IPAddress'])")

DATABASE_URL="postgresql://apibase:0f36a390724b6d8b14ec5ab41bcdc9abb76ef16a86af27e73c2f1553175a6124@${PG_IP}:5432/apibase?schema=public" npx tsx scripts/seed.ts
```

Verify: output should show "Upserted N tools" where N includes the new tools.

---

## Step 7: Build & Deploy

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml build api
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d api
```

Wait 5 seconds for startup.

---

## Step 8: Verify in Production

```bash
# Health check
curl -s https://apibase.pro/health/ready

# Verify new tools appear in catalog
curl -s https://apibase.pro/api/v1/tools | python3 -m json.tool | grep -i "{provider}"

# Check tool detail
curl -s https://apibase.pro/api/v1/tools/{provider}.{first_tool} | python3 -m json.tool

# Count total tools
curl -s https://apibase.pro/api/v1/tools | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Total tools: {len(d[\"data\"])}')"
```

All new tools MUST appear in catalog with correct pricing.

---

## Step 9: Create UC File

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

## Step 10: Create Smoke Test Script

Create `scripts/test-{provider}.sh`. Must test:
1. Health check
2. Provider tools in catalog (count)
3. Tool detail endpoints (200)
4. Live API calls (with TEST_API_KEY if available)

Make executable: `chmod +x scripts/test-{provider}.sh`

---

## Step 11: Update README.md

Add provider section at the TOP of "Available Tools" in `README.md`.
New providers go first, older providers move down.

---

## Step 12: Update Memory

Update `/home/apibase/.claude/projects/-home-apibase-apibase/memory/MEMORY.md`:
- Add provider to "Connected Providers" list
- Update tool count in "Production Status"

---

## Step 13: Commit & Push

```bash
git add [all new and modified files]
git commit -m "Add {Provider} adapter — {N} tools (UC-{NNN})"
git push origin main
```

---

## Checklist

- [ ] Adapter files created (types.ts, auth.ts if needed, index.ts)
- [ ] Zod schemas created
- [ ] .env updated with credentials
- [ ] env.ts updated with schema
- [ ] registry.ts updated with case
- [ ] schemas/index.ts updated with import
- [ ] tool-adapter.ts updated with definitions
- [ ] tool_provider_config.yaml updated with entries
- [ ] TypeScript compiles with zero errors
- [ ] Database seeded
- [ ] API container built and deployed
- [ ] Tools visible at https://apibase.pro/api/v1/tools
- [ ] UC file created
- [ ] Smoke test script created
- [ ] README.md updated
- [ ] Memory updated
- [ ] Committed and pushed to GitHub
