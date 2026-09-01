# UC-655: Statbel beSTAT (statbel)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-655 |
| **Provider** | Statbel (Belgian statistics office) — bestat.statbel.fgov.be |
| **Domain** | bestat.statbel.fgov.be |
| **Category** | World (dashboard: "Country Data" — closest existing category, consistent with gus-poland/socrata/open-canada) |
| **Theme** | Two-layer catalog: raw datasources -> curated per-language views -> view data (same shape as hdx/au-data-gov CKAN catalogs) |
| **Date** | 2026-09-01 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE (local) |
| **Region** | Belgium |
| **Pricing Model** | free upstream (no auth) |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

Statbel's beSTAT is the Belgian statistics office's public data-dissemination platform. It
publishes ~180 raw statistical datasources (datasets), each of which backs one or more of ~1300
curated "views" — ready-to-query cross-tabs in a specific language (fr/nl/de/en). Views are not
a shared record with a language field; each language variant is a distinct `id`.

| Aspect | Details |
|--------|---------|
| **Free Tier** | Fully open, no signup, no API key |
| **Paid Tier** | N/A — no paid tier exists |
| **Auth Model** | None |
| **License** | Public statistical data (Belgian federal government) |
| **Quota** | No documented rate limit found (FAQ page returns 200 but has no extractable quota text) |
| **Global Availability** | Reachable from this host, standard HTTPS |
| **Status** | Production |

---

## API Overview

Candidate URL (`bestat.statbel.fgov.be/bestat/api`) itself 404s — that path is the PrimeFaces
JSF web-app root, not an API endpoint. Real endpoints discovered via WebSearch (Statbel's own
beSTAT FAQ documents the `/result/{FORMAT}` export shape) and confirmed live with curl:

| # | Endpoint | Method | Description |
|---|----------|--------|--------------|
| 1 | `/bestat/api/views` | GET | List all curated views (all locales, ~1300) |
| 2 | `/bestat/api/views/{id}/result/JSON` | GET | Fetch fact rows for one view |
| 3 | `/bestat/api/datasources` | GET | List all raw datasources (~180) |
| 4 | `/bestat/api/datasources/{id}` | GET | Fetch metadata for one datasource |

Verified live before implementation:
```
curl "https://bestat.statbel.fgov.be/bestat/api/views" -> 200, 1341 views, locales {fr,nl,de,en}
curl "https://bestat.statbel.fgov.be/bestat/api/views/1be9b77f-.../result/JSON" -> 200, 8 fact rows
curl "https://bestat.statbel.fgov.be/bestat/api/datasources" -> 200, 182 datasources
curl "https://bestat.statbel.fgov.be/bestat/api/datasources/89cf1b74-..." -> 200, full metadata object
```

### Research Quirk — both list endpoints ignore all server-side query params

`/views` and `/datasources` return their entire catalog regardless of any query string
(limit/locale tested, zero effect) — filtering and pagination are done client-side in the
adapter, same pattern as world-bank-cckp/bank-of-england/oecd-data.

### Research Quirk — invalid `datasource_id` returns HTTP 200 with an EMPTY body (0 bytes)

Not an empty JSON object — a genuinely empty response body, which fails `JSON.parse` in
`base.adapter.ts` and surfaces as the generic `INVALID_RESPONSE` (502). Documented in the tool
description so agents know an id must come from `list_datasources` first. Invalid `view_id`
instead returns a clean HTTP 404 (handled by the existing generic 4xx -> `INPUT_REJECTED` (422)
classification, no special-casing needed).

### Research Quirk — the real data-fetch path (`/result/JSON`) is not discoverable from the
### catalog list responses themselves

Neither `/views` nor `/views/{id}` (metadata) mentions the `/result/{FORMAT}` sub-path — it only
appears in Statbel's own FAQ documentation, found via web search after the naive guesses
(`/data`, `/export`, `/table`, `/values`, `/cube`, `/dataset`, `/crosstab`, `/tabulardata`,
`/data.json`) all 404'd.

---

## Tool Mapping

| # | Tool ID | mcpName | Description | Price |
|---|---------|---------|--------------|-------|
| 1 | statbel.list_views | statbel.catalog.list_views | Browse curated views by locale + name search | $0.001 |
| 2 | statbel.view_data | statbel.catalog.view_data | Fetch fact rows for one view | $0.002 |
| 3 | statbel.list_datasources | statbel.catalog.list_datasources | Browse raw datasources by search + language | $0.001 |
| 4 | statbel.datasource_detail | statbel.catalog.datasource_detail | Fetch metadata for one datasource | $0.001 |

All 4 tools: category `world`, annotations `READ_ONLY`.

---

## Input Schemas

Defined in `src/schemas/statbel.schema.ts`, all `.strip()`ped Zod objects:

- `list_views`: `locale` (optional enum fr/nl/de/en, default fr), `search` (optional string,
  case-insensitive substring on name), `limit` (optional 1-100, default 20), `offset` (optional,
  default 0)
- `view_data`: `view_id` (required UUID)
- `list_datasources`: `search` (optional string), `locale` (optional enum fr/nl/de/en, filters by
  `supportedLocales`), `limit` (optional 1-100, default 20), `offset` (optional, default 0)
- `datasource_detail`: `datasource_id` (required UUID)

---

## Implementation Files

| File | Purpose |
|------|---------|
| src/adapters/statbel/index.ts | StatbelAdapter — buildRequest/parseResponse for all 4 tools |
| src/adapters/statbel/types.ts | Raw view/datasource/fact response types |
| src/schemas/statbel.schema.ts | Zod schemas for all 4 tools |
| src/adapters/registry.ts | case 'statbel' to StatbelAdapter |
| src/schemas/index.ts | statbelSchemas spread |
| src/mcp/tool-definitions.ts | 4 tool definitions, category world |
| config/tool_provider_config.yaml | 4 tool entries, provider statbel, price_usd 0.001-0.002, cache_ttl 86400 |
| src/config/provider-limits.json | Dashboard entry, limit_type unlimited, no documented rate limit |
| static/dashboard.html | PROVIDER_CATEGORIES entry: 'Statbel beSTAT': 'Country Data' |
| scripts/test-statbel.sh | 6-check smoke test (health, catalog, schema, dashboard, OpenAPI, upstream) |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| statbel.list_views | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — catalog is near-static) |
| statbel.view_data | $0 (free, no auth) | $0.002 | ~100% | 86400s (24h — official stats refresh infrequently, not real-time) |
| statbel.list_datasources | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — catalog is near-static) |
| statbel.datasource_detail | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — metadata rarely changes) |

---

## Notes

- **This is a re-onboard of previously-lost work.** A prior night-orchestra run for this exact
  provider (same 4 tool names, same design) completed a local commit earlier on 2026-09-01, but
  by the time this run started, `git status` was clean and no adapter/schema/registry/UC files
  existed anywhere in the working tree or git history reachable from `HEAD` — the local commit
  was evidently lost, most likely wiped by a concurrent `git reset --hard origin/main` from the
  hourly batch-pusher (the exact hazard documented in UC-652/UC-653/UC-654's notes: an unpushed
  local commit is invisible to a reset against `origin/main`). The prior session's memory file
  (`project_statbel_uc655.md`) survived (memory is a separate store from the git working tree)
  and was used to recreate the identical design in this run rather than re-deriving it from
  scratch — endpoints were independently re-verified live regardless (see Research Quirks above).
- Verified via the payment pipeline directly (not a full paid round-trip — no funded test wallet
  in this sandboxed role): a fresh auto-registered free-tier agent got a correctly-priced x402
  402 challenge on all 4 tools (`list_views`/`list_datasources`/`datasource_detail` at $0.001,
  `view_data` at $0.002, matching `tool_provider_config.yaml` exactly) — confirms ESCROW is wired
  correctly for every tool.
- `npx tsx scripts/seed.ts` upserted all 4 new tools ("Upserted 1325 tools" — matches 1321
  pre-existing + 4 new). The script's separate `seedTestAgent()` step failed afterward with the
  same pre-existing, unrelated Prisma UUID error documented in every prior UC's notes since
  UC-643 (`Agent.agent_id` is a Postgres `uuid` column but the seed script's hardcoded
  `TEST_AGENT_ID` is not a valid UUID) — confirmed unmodified by this onboarding, verified the 4
  tools persisted in Postgres directly via `psql` despite the later script failure, out of scope
  to fix here.
- Local production stack (this host's Docker containers, which serve apibase.pro directly)
  rebuilt and redeployed cleanly: TS compile 0 errors, ESLint 0 errors, container healthy,
  `/api/v1/tools` shows 1304 tools with `has_more:false`, dashboard shows `tool_count:4` for
  `statbel`, both the general 8/8 smoke suite and the 6-check `test-statbel.sh` suite pass (the
  OpenAPI-routes check in the latter only passes after Step 14a's regeneration, run later in this
  same session before commit).
