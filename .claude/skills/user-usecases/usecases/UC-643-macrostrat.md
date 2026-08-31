# UC-643: Macrostrat Geologic Database (macrostrat)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-643 |
| **Provider** | Macrostrat |
| **Domain** | macrostrat.org/api/v2 |
| **Category** | World (geology) |
| **Theme** | Stratigraphic columns, rock units, bedrock geology, fossil collections |
| **Date** | 2026-08-31 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE |
| **Region** | Global |
| **Pricing Model** | free upstream |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

Macrostrat is a geologic database platform developed at the University of Wisconsin-Madison
(NSF Grant EAR-1150082 / ICER-1440312) that integrates worldwide stratigraphic column data,
lithology, depositional environment, geologic age, bedrock geologic map units, and Paleobiology
Database (PBDB) fossil collection linkages. It powers macrostrat.org and the Rockd mobile app.

| Aspect | Details |
|--------|---------|
| **Free Tier** | Unlimited queries, no signup, no API key |
| **Paid Tier** | None |
| **Auth Model** | None |
| **License** | CC BY 4.0 (attribution required, commercial reuse permitted) |
| **Quota** | No rate-limit headers observed, no documented request quota |
| **Global Availability** | Reachable from this host, standard HTTPS |
| **Status** | Stable, production REST API (v2.3.9 per `/api/v2/meta`) |

---

## API Overview

| # | Endpoint | Method | Description |
|---|----------|--------|-------------|
| 1 | `/columns?lat=...&lng=...&strat_name=...&interval_name=...&lith=...&age=...` | GET | Search stratigraphic columns |
| 2 | `/units?col_id=...` or `/units?lat=...&lng=...` | GET | Rock units (formation/member) for a column or point |
| 3 | `/geologic_units/map?lat=...&lng=...&scale=...` | GET | Bedrock geologic map units at a point |
| 4 | `/fossils?col_id=...` or `/fossils?unit_id=...` | GET | PBDB fossil collections tied to a column/unit |

Base URL: https://macrostrat.org/api/v2

Verified live before implementation:
```
curl "https://macrostrat.org/api/v2/columns?lat=43.07&lng=-89.4"
-> {"success":{"v":2,"license":"CC-BY 4.0","data":[{"col_id":187,"col_name":"Baraboo District, Sauk County, Wisconsin",...}]}}
```

### Research Quirk — `/units` and `/fossils` free-text filters have NO server-side row cap

Unlike `/columns` (a small ~5,000-row summary table — even the broadest possible query, the full
Phanerozoic age range, measured 913KB with `response=short`), `/units` and `/fossils` accept
free-text filters (`lith`, `interval_name`) directly against much larger underlying tables with no
row limit:

| Query | Measured size |
|-------|---------------|
| `/units?interval_name=Permian&response=long` | 19.8 MB |
| `/units?lith=sandstone` (default `response=short`) | 4.1 MB |
| `/units?lith=shale` | 5.1 MB |
| `/fossils?interval_name=Cretaceous` | 3.1 MB |
| `/fossils?lith=sandstone` | 7.1 MB |

All of these are far over the adapter's `maxResponseBytes: 1_500_000` override (and would exceed
even a much larger budget). To close this off, `macrostrat.units_search` and
`macrostrat.fossils_search` **require** a scoping identifier — `col_id` (from
`macrostrat.columns_search`) and/or a `lat`+`lng` point for units, `col_id` or `unit_id` for
fossils — and never expose the raw `lith`/`interval_name`-only search surface. Measured worst case
under this scoping: the single largest column found (`col_id=1346`, 460 units) returns 255KB via
`/units?col_id=1346` — comfortably under budget. `response=long` is never requested for `/columns`
either (measured 1.16MB for a broad interval, over the 1MB stock default).

### Research Quirk — `/units` `response=long` embeds nested lithology/environment objects

`response=short` (the default, always used here) returns flat unit records (name, ages,
thickness, PBDB counts). `response=long` additionally nests full `lith`/`environ`/`econ`/`measure`
arrays per unit — useful detail, but the size blowup above makes it unsafe to expose unscoped;
since this adapter already requires `col_id` scoping, `response=short`'s flat fields are
sufficient without the extra risk of a size regression if an agent widens `col_id` scope in the
future.

### Research Quirk — invalid `lat`/`lng` combinations must be paired

The upstream API silently accepts `lat` or `lng` alone in some endpoints without validation
(returns generic/wrong results), so the adapter validates them as a pair for `columns_search`,
`units_search`, and `geologic_map_units` — returning 422 `INPUT_REJECTED` if only one is given.

---

## Tool Mapping

| # | Tool ID | mcpName | Description | Price |
|---|---------|---------|--------------|-------|
| 1 | macrostrat.columns_search | macrostrat.geology.columns_search | Search stratigraphic columns by point, age, lithology, or name | $0.002 |
| 2 | macrostrat.units_search | macrostrat.geology.units_search | Rock units (formation/member, age, lithology) for a column or point | $0.002 |
| 3 | macrostrat.geologic_map_units | macrostrat.geology.map_units | Bedrock geologic map units at a point (surface geology) | $0.001 |
| 4 | macrostrat.fossils_search | macrostrat.geology.fossils_search | PBDB fossil collections tied to a column or unit | $0.002 |

All 4 tools: category world, annotations READ_ONLY.

- `columns_search` is the natural entry point — its returned `col_id` feeds directly into
  `units_search` and `fossils_search` (list-columns -> get-units / get-fossils, same discovery
  pattern as HDX/open-canada's search -> detail flow).

---

## Input Schemas

Defined in `src/schemas/macrostrat.schema.ts`, all `strip()`ped Zod objects:

- `columns_search`: `lat`/`lng` (numbers, optional, must be supplied together), `adjacents`
  (boolean, optional), `strat_name` (string, optional, fuzzy match), `interval_name` (string,
  optional), `lith` (string, optional), `age` (number, optional, Ma), `age_top`/`age_bottom`
  (numbers, optional, must be supplied together). At least one filter is required.
- `units_search`: `col_id` (integer, optional), `lat`/`lng` (numbers, optional, must be supplied
  together). Requires `col_id` or `lat`+`lng`.
- `geologic_map_units`: `lat`/`lng` (numbers, required), `scale` (enum `small`/`medium`/`large`,
  optional).
- `fossils_search`: `col_id` (integer, optional), `unit_id` (integer, optional), `interval_name`
  (string, optional, narrows within the col_id/unit_id scope). Requires `col_id` or `unit_id`.

All free-text/numeric params are passed through `URLSearchParams` (auto-encoded, no manual URL
string concatenation) — no path-injection surface, consistent with the 2026-03-30 flywheel rule.

---

## Implementation Files

| File | Purpose |
|------|---------|
| src/adapters/macrostrat/index.ts | MacrostratAdapter — all 4 tools |
| src/adapters/macrostrat/types.ts | Raw Macrostrat API + envelope types |
| src/schemas/macrostrat.schema.ts | Zod schemas for all 4 tools |
| src/adapters/registry.ts | case 'macrostrat' to MacrostratAdapter |
| src/schemas/index.ts | macrostratSchemas spread |
| src/mcp/tool-definitions.ts | 4 tool definitions, category world |
| config/tool_provider_config.yaml | 4 tool entries, provider macrostrat, price_usd 0.001-0.002, cache_ttl 604800 |
| src/config/provider-limits.json | Dashboard entry, limit_type unlimited |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| macrostrat.columns_search | $0 (free, no auth) | $0.002 | ~100% | 604800s (7d — static geologic reference data) |
| macrostrat.units_search | $0 (free, no auth) | $0.002 | ~100% | 604800s (7d — same rationale) |
| macrostrat.geologic_map_units | $0 (free, no auth) | $0.001 | ~100% | 604800s (7d — same rationale) |
| macrostrat.fossils_search | $0 (free, no auth) | $0.002 | ~100% | 604800s (7d — same rationale) |

---

## Notes

- Live payment-gated verification: could not complete a full paid x402/MPP round-trip from this
  sandboxed batch role (no wallet key access, no environment secrets read). Instead verified
  end-to-end adapter correctness directly (buildRequest -> live upstream HTTP call via
  `adapter.call()` -> `parseResponse`) via a throwaway `tsx` script exercising all 4 tools plus
  both required-param error paths against the real `macrostrat.org` API — confirmed real
  column/unit/map-unit/fossil data returned and correct 422 `INPUT_REJECTED` classification for
  missing scoping params. Catalog/schema/dashboard wiring verified via the local docker stack REST
  API (`/health/ready`, `/api/v1/tools`, `/api/v1/tools/macrostrat.columns_search`,
  `/api/v1/dashboard`) and `scripts/smoke-test.sh` (8/8 pass), same as prior sandboxed onboardings.
- `scripts/seed.ts` upserted all 1283 tools (including the 4 new macrostrat tools) successfully;
  the script's separate `seedTestAgent()` step failed afterward with a pre-existing, unrelated
  Prisma UUID error (`TEST_AGENT_ID = 'test-agent-001'` is not a valid UUID for the `Agent.agent_id`
  column) — confirmed unmodified by this onboarding and out of scope to fix here.
- Per A-06/sandbox rules, this role did NOT run `scripts/gen-card.ts` (server-card.json
  regeneration) or `scripts/sync-counts.sh`, and did not publish to the remote repository or
  Smithery — those remain for the hourly batch-pusher / a follow-up step per the BATCH MODE
  instructions (steps 1-14 only, local commit).

## Next Steps

- [x] No registration needed
- [x] Onboarded via night-orchestra batch role — adapter, schemas, registry, config, seed, build, deploy all live
