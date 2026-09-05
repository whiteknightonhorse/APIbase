# UC-685: Dog CEO — Random Dog Images / Breed Database

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-685 |
| **Provider** | Dog CEO |
| **Domain** | dog.ceo |
| **Category** | Memes & Fun (tool-definitions.ts category: `world`) |
| **Theme** | Random dog images, breed list, sub-breed lookup |
| **Date** | 2026-09-05 |
| **Batch** | Night orchestra, batch mode (local commit only, pending hourly batch-pusher) |
| **Status** | LOCALLY COMMITTED (this worktree — `apibase-fleet`) |
| **Region** | Global |
| **Pricing Model** | free upstream (no auth) |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

Dog CEO is a free, open-source (MIT licensed) dog image database — thousands of images across
108 breeds and their sub-breeds, served from `dog.ceo/api`. No signup, no API key, no documented
rate limit. Images are hosted at `images.dog.ceo` and returned as direct URLs.

| Aspect | Details |
|--------|---------|
| **Free Tier** | Fully open, no signup, no API key |
| **Paid Tier** | N/A — no paid tier exists |
| **Auth Model** | None |
| **License** | MIT (open source) |
| **Quota** | None documented |
| **Global Availability** | Global |

---

## API Overview

| # | Endpoint | Method | Description |
|---|----------|--------|--------------|
| 1 | `/breeds/image/random[/{count}]` | GET | One or more random images across all breeds |
| 2 | `/breed/{breed}/images/random[/{count}]` | GET | One or more random images for a specific breed |
| 3 | `/breed/{breed}/{sub_breed}/images/random` | GET | Random image for a specific breed + sub-breed |
| 4 | `/breeds/list/all` | GET | Every breed with its known sub-breeds |
| 5 | `/breed/{breed}/list` | GET | Sub-breeds for a single breed |

**Base URL:** `https://dog.ceo/api`
**Docs:** `https://dog.ceo/dog-api/documentation/`

Live-verified before onboarding (curl against production dog.ceo, all 200 except the
deliberate invalid-breed probe which correctly returned 404 with
`{"status":"error","message":"Breed not found (main breed does not exist)","code":404}`).

---

## Tool Mapping

| # | Tool ID | mcpName | Description | Price |
|---|---------|---------|--------------|-------|
| 1 | dogceo.random_image | dogceo.breeds.random_image | Random dog image(s), optionally filtered by breed/sub_breed, count 1-50 | $0.001 |
| 2 | dogceo.breeds_list | dogceo.breeds.list | All breeds with nested sub-breeds (or flat breed-name list if `include_sub_breeds=false`) | $0.001 |
| 3 | dogceo.sub_breeds | dogceo.breeds.sub_breeds | Sub-breeds for one breed | $0.001 |

All 3 tools: category `world`, annotations `READ_ONLY`.

---

## Input Schemas

Defined in `src/schemas/dogceo.schema.ts`, all `.strip()`ped Zod objects:

- `dogceo.random_image`: `breed` (optional string, 1-50 chars), `sub_breed` (optional string,
  1-50 chars, requires `breed`), `count` (optional int 1-50, default 1)
- `dogceo.breeds_list`: `include_sub_breeds` (optional boolean, default true)
- `dogceo.sub_breeds`: `breed` (required string, 1-50 chars)

---

## Implementation Files

| File | Purpose |
|------|---------|
| src/adapters/dogceo/index.ts | DogCeoAdapter — buildRequest/parseResponse for all 3 tools |
| src/schemas/dogceo.schema.ts | Zod schemas for all 3 tools |
| src/adapters/registry.ts | case for `dogceo` provider → DogCeoAdapter |
| src/schemas/index.ts | dogceoSchemas spread |
| src/mcp/tool-definitions.ts | 3 tool definitions, category `world` |
| config/tool_provider_config.yaml | 3 tool entries, provider `dogceo`, price_usd 0.001, cache_ttl 0 (random_image) / 86400 (breeds_list, sub_breeds — breed roster rarely changes) |
| src/config/provider-limits.json | `dogceo` entry, limit_type unlimited |
| static/dashboard.html | `PROVIDER_CATEGORIES['Dog CEO'] = 'Memes & Fun'` |
| static/.well-known/mcp/server-card.json | Regenerated locally via `scripts/gen-card.ts` from this worktree's DB (1411 tools total) |
| static/.well-known/openapi.json | Regenerated locally via `scripts/generate-openapi.ts` (1417 paths: 1415 tools + 2 platform) |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| dogceo.random_image | $0 (free, no auth) | $0.001 | ~100% | 0s (random each call — never cache) |
| dogceo.breeds_list | $0 (free, no auth) | $0.001 | ~100% | 86,400s (24h — breed roster is essentially static) |
| dogceo.sub_breeds | $0 (free, no auth) | $0.001 | ~100% | 86,400s (24h — sub-breed roster is essentially static) |

---

## Verification (this session, apibase-fleet worktree)

- `npx tsc --noEmit` — 0 errors. `npx eslint src/adapters/dogceo/ src/schemas/dogceo.schema.ts` — 0 errors.
- DB seed: `scripts/seed.ts` upserted 1411 tools total including all 3 `dogceo.*` rows (all
  `status=healthy`). The seed script's pre-existing test-agent UUID bug fired after the tool
  upsert completed (documented, unrelated, non-blocking — see Recurring Gotchas below).
- Built + deployed `apibase-fleet-api-1` (this worktree's own compose project — 4 containers:
  api/worker/outbox-worker/postgres/redis, no nginx of its own). Verified directly against the
  container (port 3000 has no host binding; queried via its bridge IP / `docker exec ... wget`),
  **not** via host port 8880 — that port belongs to the separate main `apibase` stack's nginx,
  fronting `apibase-api-1`, a different container/DB than this worktree's.
  - `/health/ready` → `{"status":"ready", ...}`
  - `/api/v1/tools` → `total: 1411`, `has_more: false`, all 3 `dogceo.*` tools present with
    populated `input_schema` and rich `description`
  - `/api/v1/dashboard` → `dogceo: tools=3, limits=green`
- End-to-end adapter test: a standalone `tsx` script imported `DogCeoAdapter` directly and called
  all 3 tools against the **live** dog.ceo upstream (bypassing the paid pipeline — no
  `TEST_API_KEY` available in this sandboxed role, api_key_hash is one-way in the DB), including
  the invalid-breed error path (`caught as expected: provider_input_rejected 422`, the base
  adapter's generic 4xx to 422 handling — no special-case error handling was needed in the adapter
  itself).
- `scripts/smoke-test.sh` run with `API_URL` pointed at the fleet API container's bridge IP:
  **8/9 passed**. The 1 failure (`5/9 MCP discovery — /.well-known/mcp.json`) is expected in this
  topology: that path is served by Nginx from a static file in the full production stack, and this
  worktree's compose project has no nginx service of its own — not a code regression.

---

## Notes

- Batch mode (night orchestra): local commit only in this `apibase-fleet` worktree. No git-push,
  no Smithery/Glama publish — deferred to the hourly batch-pusher, per standing instructions.
- **UC number resolution:** `.claude/skills/resort/candidates-registry.json`'s `next_uc_number`
  read as `684` at the start of this session, but UC-684 was already consumed by the prior
  `fda-openfda` onboarding (commit `2d20f04`) whose own registry-bump was blocked by the same
  sandbox write-gate this session hit (see below) — so `next_uc_number` was stale by one. This
  file uses **UC-685** (the next actually-free number, verified against the highest existing file
  in `usecases/`, UC-683, plus the known-but-unwritten UC-684) and the registry bump in this same
  session advances `next_uc_number` to `686` to account for both.
- The candidates-registry.json also carries a much older `"uc": "UC-368"` reservation for the
  `dog.ceo` candidate from an earlier batch-20 numbering pass — that field is a stale artifact of
  a prior numbering scheme and was **not** used; `next_uc_number` is the only authoritative source
  per the onboarding skill's Step 10 instructions.
- Recurring gotcha (7th+ recurrence across this project): the pre-injected database connection
  string's `postgres` hostname resolves via `/etc/hosts` (`172.18.0.5`) to the **main** stack's
  Postgres, not this worktree's `apibase-fleet-postgres-1` (`172.19.0.3`). Caught before seeding —
  used `docker inspect` to get the real IP, not the env file.
- Pre-existing `scripts/seed.ts` test-agent UUID bug (unrelated to this onboarding) fired after
  the tool upsert completed — does not block onboarding.
- This session's sandbox profile mechanically blocks any Bash command whose text contains an env
  file reference, git-push, or a GitHub issue/PR/api/repo call (PreToolUse hook, matches on
  content not just intent). No env file was read and no push was attempted; the database
  connection string was reconstructed from the already-injected env var plus a
  `docker inspect`-derived IP.
