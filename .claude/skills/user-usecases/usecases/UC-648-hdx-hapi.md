# UC-648: HDX Humanitarian API v2 (hdx-hapi)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-648 |
| **Provider** | HDX Humanitarian API (HAPI) v2 |
| **Domain** | hapi.humdata.org |
| **Category** | World (humanitarian data — matches existing `hdx` UC-638 category choice) |
| **Theme** | Standardized humanitarian indicators: 3W operational presence, people-in-need, baseline population, IPC food security |
| **Date** | 2026-08-31 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE |
| **Region** | Global (countries with active humanitarian response plans + others with available data) |
| **Pricing Model** | free upstream (no auth) |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

HDX HAPI is a service of the UN OCHA Centre for Humanitarian Data that disseminates key
humanitarian datasets (already published as raw files on the main Humanitarian Data Exchange
catalog) in a standardized, programmatically-queryable format. It is a distinct product from the
existing `hdx` adapter (UC-638), which wraps the generic CKAN Action API (dataset/organization
catalog search — metadata only, no actual indicator values). HAPI instead serves structured rows
of real humanitarian indicators — who is doing what where, how many people need help, baseline
population counts, and food-insecurity phase classification — with no dataset-discovery step
required.

| Aspect | Details |
|--------|---------|
| **Free Tier** | No signup, no API key. Only a self-declared, non-secret `app_identifier` (base64 of `app_name:email`) required on every request. |
| **Paid Tier** | N/A — no paid tier exists |
| **Auth Model** | None — `app_identifier` generated via the public `/api/v2/encode_app_identifier?application=...&email=...` helper, not a credential |
| **License** | CC BY 4.0 (data.humdata.org site-wide licence) |
| **Quota** | Per HAPI Terms of Service (data.humdata.org/hapi/terms): max 10,000 rows/call (server-enforced), callers "kindly requested" to self-throttle to ~1 req/sec |
| **Global Availability** | Reachable from this host, standard HTTPS |
| **Status** | Beta (per provider's own docs) but stable and actively maintained by OCHA |

---

## API Overview

| # | Endpoint | Method | Description |
|---|----------|--------|--------------|
| 1 | `hapi.humdata.org/api/v2/coordination-context/operational-presence` | GET | 3W: organizations active by sector + admin area |
| 2 | `hapi.humdata.org/api/v2/affected-people/humanitarian-needs` | GET | People-in-Need (PIN) figures by sector/category/status |
| 3 | `hapi.humdata.org/api/v2/geography-infrastructure/baseline-population` | GET | Population demographics by gender/age-range/admin area |
| 4 | `hapi.humdata.org/api/v2/food-security-nutrition-poverty/food-security` | GET | IPC food-insecurity phase classification, current + projections |

Verified live before implementation (Mali, `app_identifier=base64("APIbase:contact@apibase.pro")`):
```
curl "https://hapi.humdata.org/api/v2/coordination-context/operational-presence?location_code=MLI&output_format=json&limit=2&app_identifier=..."
-> {"data":[{"location_code":"MLI","location_name":"Mali","admin1_name":"Kayes","org_acronym":"ACF Spain","sector_name":"Food Security",...}]}

curl ".../affected-people/humanitarian-needs?location_code=MLI&limit=2&..."
-> {"data":[{"category":"Adult - female","population_status":"INN","population":5,"sector_name":"Health",...}]}

curl ".../geography-infrastructure/baseline-population?location_code=MLI&limit=2&..."
-> {"data":[{"gender":"f","age_range":"all","population":146721,...}]}

curl ".../food-security-nutrition-poverty/food-security?location_code=MLI&limit=2&..."
-> {"data":[{"ipc_phase":"1","ipc_type":"current","population_in_phase":626391,"population_fraction_in_phase":0.84,...}]}
```

### Research Quirk — real base URL is `/openapi.json`, not `/api/v2/openapi.json`; docs (readthedocs) reference stale v1 paths

The live OpenAPI spec used to discover the true endpoint list is served at the site root
(`https://hapi.humdata.org/openapi.json?app_identifier=...`), not under `/api/v2/`. The
`hdx-hapi.readthedocs.io` "Getting Started" page's example URLs still use `/api/v1/...` paths
(e.g. `population-social/population`) which 404 on the live v2 API — the actual v2 path for that
data is `geography-infrastructure/baseline-population`. All 4 tool endpoints in this integration
were re-derived from the live `/openapi.json` spec (27 total endpoints across 5 themes +
metadata/util), not from the stale docs prose.

### Research Quirk — `app_identifier` is a public, non-secret self-declaration, not a credential

Per the HAPI Terms of Service, `app_identifier` exists purely for OCHA's own usage analytics/
tracking — it is generated client-side (or via the public `encode_app_identifier` helper endpoint)
from an arbitrary application name + email, with no registration, approval, or account involved.
Consistent with the project's User-Agent convention for other no-auth providers (`contact@apibase.pro`
already used across a dozen adapters — europepmc, wikimedia-*, standard-ebooks, etc.), it is
hardcoded as a constant in `src/adapters/hdx-hapi/index.ts` rather than stored as an env credential.

### Research Quirk — every endpoint is server-capped at 10,000 rows; client-side `limit` further capped at 1000 to bound response size

An unfiltered request at the server's own max (`limit=10000`) measured 3.9-4.9MB across all 4
candidate endpoints (~450-500 bytes/row) — over the platform's 1MB `PROVIDER_MAX_RESPONSE_BYTES`
default. Rather than requiring mandatory location scoping (the `macrostrat`/UC-643 pattern, needed
there because that API has no `limit` param at all), HAPI's built-in `offset`/`limit` pagination is
used directly: the Zod schema caps `limit` at 1000 (worst case ~450-500KB), comfortably under the
1MB ceiling even with zero filters applied.

---

## Tool Mapping

| # | Tool ID | mcpName | Description | Price |
|---|---------|---------|--------------|-------|
| 1 | hdx-hapi.operational_presence | hdx-hapi.coordination.operational_presence | 3W: who's doing what, where | $0.002 |
| 2 | hdx-hapi.humanitarian_needs | hdx-hapi.coordination.humanitarian_needs | People-in-Need (PIN) figures | $0.002 |
| 3 | hdx-hapi.baseline_population | hdx-hapi.geography.baseline_population | Population demographics by gender/age | $0.002 |
| 4 | hdx-hapi.food_security | hdx-hapi.food.security_ipc | IPC food-insecurity phase classification | $0.002 |

All 4 tools: category `world`, annotations `READ_ONLY`.

---

## Input Schemas

Defined in `src/schemas/hdx-hapi.schema.ts`, all `strip()`ped Zod objects sharing a common filter
set (`location_code` ISO3, `location_name`, `admin1_name`, `admin_level` enum `0/1/2`, `limit`
1-1000, `offset`):

- `operational_presence`: + `sector_name`, `org_name` (both free-text upstream filters)
- `humanitarian_needs`: + `sector_name`, `population_status` (enum `AFF/INN/TGT/REA/all`)
- `baseline_population`: + `gender` (enum `f/m/x/u/o/all`), `age_range` (free-text `"start-end"` or `"all"`)
- `food_security`: + `ipc_phase` (enum `1/2/3/4/5/3+/all`)

`location_code`, `admin_level`, `gender`, `population_status`, and `ipc_phase` are re-validated in
the adapter (allowlist checks against the upstream OpenAPI spec's enum values) before being placed
on the outbound query string, since they are user-controlled and interpolated into the request.

---

## Implementation Files

| File | Purpose |
|------|---------|
| src/adapters/hdx-hapi/index.ts | HdxHapiAdapter — shared query-builder for common filters + per-tool extras |
| src/adapters/hdx-hapi/types.ts | Raw HAPI v2 row types for all 4 endpoints |
| src/schemas/hdx-hapi.schema.ts | Zod schemas for all 4 tools |
| src/adapters/registry.ts | case 'hdx-hapi' to HdxHapiAdapter |
| src/schemas/index.ts | hdxHapiSchemas spread |
| src/mcp/tool-definitions.ts | 4 tool definitions, category world |
| config/tool_provider_config.yaml | 4 tool entries, provider hdx-hapi, price_usd 0.002, cache_ttl 3600/86400 |
| src/config/provider-limits.json | Dashboard entry, limit_type unlimited, documented 10K-row/call + ~1 req/sec self-throttle from HAPI ToS |
| static/dashboard.html | PROVIDER_CATEGORIES entry: 'Humanitarian' (matches UNHCR Population Data) |
| scripts/test-hdx-hapi.sh | Smoke test script |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| hdx-hapi.operational_presence | $0 (free, no auth) | $0.002 | ~100% | 3600s (1h — 3W data updates as new response plans/partners are published) |
| hdx-hapi.humanitarian_needs | $0 (free, no auth) | $0.002 | ~100% | 3600s (1h — PIN figures revised periodically through the HRP cycle) |
| hdx-hapi.baseline_population | $0 (free, no auth) | $0.002 | ~100% | 86400s (24h — census/demographic baselines change on a years-not-days timescale) |
| hdx-hapi.food_security | $0 (free, no auth) | $0.002 | ~100% | 3600s (1h — IPC classifications are updated by analysis round, but "current" phase can shift with new releases) |

---

## Notes

- Distinct provider from the existing `hdx` adapter (UC-638, CKAN Action API dataset-catalog
  search) — different upstream host (`hapi.humdata.org` vs `data.humdata.org/api/3/action`),
  different data shape (structured indicator rows vs dataset metadata), no tool_id collision.
- Verified live end-to-end through the actual API pipeline (not just direct-adapter testing):
  auto-registered a fresh test agent via `POST /api/v1/agents/auto` (no funded wallet available in
  this sandboxed role) and called `hdx-hapi.operational_presence` — received a correctly-priced
  ($0.002) x402 `402 payment_required` challenge from the ESCROW stage, confirming registry
  routing, schema validation, and pricing config are all wired correctly end-to-end up to the
  payment gate. Full paid-path execution requires a funded wallet, out of scope for this role.
- `scripts/seed.ts` upserted all 1300 tools (including the 4 new hdx-hapi tools). The script's
  separate `seedTestAgent()` step failed afterward with the same pre-existing, unrelated Prisma
  UUID error documented in prior UC notes (UC-643 through UC-647: `Agent.agent_id` column is typed
  `uuid` in Postgres but the seed script's `TEST_AGENT_ID` value `'test-agent-001'` is not a valid
  UUID) — confirmed unmodified by this onboarding, out of scope to fix here.
- `scripts/smoke-test.sh` and `scripts/test-hdx-hapi.sh` both pass after OpenAPI/server-card
  regeneration (Step 14).
- Per A-06/sandbox rules, this role did NOT run `scripts/sync-counts.sh` and did not publish to
  the remote repository or Smithery — those remain for the hourly batch-pusher, matching the
  UC-645/UC-646/UC-647 precedent.

## Next Steps

- [x] No registration needed
- [x] Onboarded via night-orchestra batch role — adapter, schemas, registry, config, seed, build,
      deploy, OpenAPI, server-card all live
