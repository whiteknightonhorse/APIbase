# UC-644: GeoDIVA / Alaska Volcano Observatory (geodiva)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-644 |
| **Provider** | GeoDIVA (Alaska Volcano Observatory) |
| **Domain** | geodiva.avo.alaska.edu |
| **Category** | World (volcanoes) |
| **Theme** | Alaska volcano catalog, documented eruption history |
| **Date** | 2026-08-31 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE |
| **Region** | Alaska, USA |
| **Pricing Model** | free upstream |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

GeoDIVA is the Alaska Volcano Observatory's (AVO — a joint USGS / University of Alaska
Fairbanks Geophysical Institute / Alaska DGGS program) public data API covering all 356
Alaska volcanoes and their documented eruption history back through prehistoric time.

| Aspect | Details |
|--------|---------|
| **Free Tier** | Unlimited queries, no signup, no API key |
| **Paid Tier** | None |
| **Auth Model** | None |
| **License** | US Government work — public domain |
| **Quota** | No rate-limit headers observed, no documented request quota |
| **Global Availability** | Reachable from this host, standard HTTPS |
| **Status** | Stable, production REST API |

---

## API Overview

| # | Endpoint | Method | Description |
|---|----------|--------|--------------|
| 1 | `/volcanoes` | GET | Full list of Alaska's 356 volcanoes |
| 2 | `/volcanoes?id=...` | GET | Single volcano by ID, VNUM, or name |
| 3 | `/eruptions?volcano_id=...&eruption_id=...&sdate_start=...&sdate_end=...&edate_start=...&edate_end=...` | GET | Eruption records filtered by volcano, eruption ID, or date range |

Base URL: `https://geodiva.avo.alaska.edu`

**Research quirk — documentation lives at a different path than the real endpoints.** The API
docs are served at `/api` (an HTML page). `/api/volcanoes` and `/api/eruptions` also return that
same HTML doc page, NOT data. The real JSON endpoints are at the site root — `/volcanoes` and
`/eruptions` (no `/api` prefix).

Verified live before implementation:
```
curl "https://geodiva.avo.alaska.edu/volcanoes?id=ak52"
-> {"VolcanoId":"ak52","Vnum":311240,"Volcano":"Cleveland","OfficialName":"Mount Cleveland",...}
```

### Research Quirk — `/eruptions` has no server-side row cap; open-ended date bounds are dangerous

Unlike `/volcanoes` (356 rows, ~370KB fetched in full every time — safe under the 1MB budget),
`/eruptions` has no pagination or size cap:

| Query | Measured size | Records |
|-------|---------------|---------|
| `/eruptions` (no filter) | 2.14 MB | 1022 |
| `/eruptions?sdate_end=2020` (no `sdate_start`) | 2.01 MB | 985 |
| `/eruptions?edate_end=2020` (no `edate_start`) | 1.24 MB | 425 |
| `/eruptions?sdate_start=1000&sdate_end=2100` | 1.66 MB | 782 |
| `/eruptions?sdate_start=2004&sdate_end=2024` (densest 20y window found) | 691 KB | 180 |
| `/eruptions?volcano_id=ak252` (Shishaldin, busiest single volcano, 70 eruptions) | 165 KB | 70 |

Critically, **`sdate_end`/`edate_end` alone (without the matching `_start`) silently defaults the
open bound to the full catalog history** — the upstream API does not require pairing and does not
warn. To close this off, `geodiva.eruption_search`:
1. Requires `sdate_start`/`sdate_end` to be supplied together (never one alone), same for
   `edate_start`/`edate_end`.
2. Requires at least one of `volcano_id`, `eruption_id`, or a paired date range.
3. Caps any date-range-only query (no `volcano_id`/`eruption_id`) to a 20-year span — the
   densest 20-year window measured (691KB) leaves comfortable margin under the 1MB budget. A
   date range combined with `volcano_id`/`eruption_id` is always safe regardless of span, since
   per-volcano history is naturally bounded (measured worst case 165KB for the most active
   volcano's entire recorded history).

All of this cross-field validation lives in `GeoDivaAdapter.buildRequest()` (`invalidInput()`
helper, same pattern as `macrostrat`'s `age_top`/`age_bottom` pairing checks) rather than in the
Zod schema — **`.refine()`/`.superRefine()` on an exported tool schema breaks
`src/utils/zod-to-json-schema.ts`** (it has no `ZodEffects` case, so the wrapped schema converts
to an empty `input_schema` — this was caught live during this onboarding: `geodiva.eruption_search`
initially had `schema=False` in the REST catalog until the refine logic was moved to the adapter).
No other schema file in the codebase uses `.refine()`/`.superRefine()` for this reason.

### Research Quirk — flexible date formats, including negative (BCE) years

The upstream API accepts `YYYY`, `YYYY-MM-DD`, `YYYY-MM-DDTHH:MM:SS`, and negative years for
prehistoric eruptions (e.g. `sdate_start=-500`) — reflecting that some volcanoes have eruption
records spanning thousands of years. The schema's date regex
(`^-?\d{1,4}(-\d{2}(-\d{2}(T\d{2}:\d{2}:\d{2})?)?)?$`) and the adapter's year-span calculation
(`extractYear()`, a simple leading-integer regex) both account for this.

### Research Quirk — flexible `id` lookup, clean 404 on miss

`/volcanoes?id=` accepts a `VolcanoId` (`ak52`), a `Vnum` (`311240`), or a volcano name
(`Cleveland`) interchangeably — all three resolve to the same record. An unmatched `id` returns
a clean HTTP 404 with a plain-text body (`"Volcano not found"`), which `base.adapter.ts` already
classifies as `INPUT_REJECTED` (422) per the 2026-06-06 flywheel rule — no adapter-level
special-casing needed.

---

## Tool Mapping

| # | Tool ID | mcpName | Description | Price |
|---|---------|---------|--------------|-------|
| 1 | geodiva.volcano_list | geodiva.geology.volcano_list | Browse/filter Alaska's 356 volcanoes (threat, age class, monitored, name) | $0.001 |
| 2 | geodiva.volcano_detail | geodiva.geology.volcano_detail | Single volcano by ID, VNUM, or name | $0.001 |
| 3 | geodiva.eruption_search | geodiva.geology.eruption_search | Eruption history by volcano, eruption ID, or date range | $0.002 |

All 3 tools: category world, annotations READ_ONLY.

- `volcano_list` is the natural entry point — its returned `VolcanoId` feeds directly into
  `volcano_detail` and `eruption_search`'s `volcano_id` param (list -> detail / eruptions, same
  discovery pattern as HDX/open-canada's search -> detail flow).

---

## Input Schemas

Defined in `src/schemas/geodiva.schema.ts`, all `strip()`ped Zod objects:

- `volcano_list`: `threat_level` (enum of 5 NVEWS threat ratings, optional, client-side filter),
  `age_class` (enum of 6 geologic age classes, optional, client-side filter), `monitored_only`
  (boolean, optional, client-side filter), `name_contains` (string, optional, case-insensitive
  substring match, client-side filter). No required params — the full 356-volcano list is always
  fetched (safe at ~370KB) and filtered client-side, since upstream has no server-side filter
  beyond single-`id` lookup.
- `volcano_detail`: `id` (string, required) — VolcanoId, VNUM, or name.
- `eruption_search`: `volcano_id` (string, optional), `eruption_id` (positive integer, optional),
  `sdate_start`/`sdate_end` (string, optional, regex-validated flexible date, must be paired),
  `edate_start`/`edate_end` (string, optional, regex-validated flexible date, must be paired).
  Cross-field business rules (at-least-one-filter, pairing, 20-year span cap) enforced in the
  adapter, not the schema (see Research Quirk above).

All free-text/numeric params are passed through `URLSearchParams` (auto-encoded, no manual URL
string concatenation) — no path-injection surface, consistent with the 2026-03-30 flywheel rule.

---

## Implementation Files

| File | Purpose |
|------|---------|
| src/adapters/geodiva/index.ts | GeoDivaAdapter — all 3 tools + cross-field validation |
| src/adapters/geodiva/types.ts | Raw GeoDIVA volcano/eruption response types |
| src/schemas/geodiva.schema.ts | Zod schemas for all 3 tools |
| src/adapters/registry.ts | case 'geodiva' to GeoDivaAdapter |
| src/schemas/index.ts | geodivaSchemas spread |
| src/mcp/tool-definitions.ts | 3 tool definitions, category world |
| config/tool_provider_config.yaml | 3 tool entries, provider geodiva, price_usd 0.001-0.002, cache_ttl 604800 |
| src/config/provider-limits.json | Dashboard entry, limit_type unlimited |
| static/dashboard.html | PROVIDER_CATEGORIES entry: 'Volcanoes' (matches existing 'USGS HANS Volcano') |
| scripts/test-geodiva.sh | Smoke test script (6/6 pass) |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| geodiva.volcano_list | $0 (free, no auth) | $0.001 | ~100% | 604800s (7d — static reference catalog) |
| geodiva.volcano_detail | $0 (free, no auth) | $0.001 | ~100% | 604800s (7d — same rationale) |
| geodiva.eruption_search | $0 (free, no auth) | $0.002 | ~100% | 604800s (7d — historical catalog, rarely updated) |

---

## Notes

- Live payment-gated verification: could not complete a full paid x402/MPP round-trip from this
  sandboxed batch role (no wallet key access, no environment secrets read). Instead verified
  end-to-end adapter correctness directly (`buildRequest` -> live upstream HTTP call via
  `adapter.call()` -> `parseResponse`) via a throwaway `tsx` script exercising all 3 tools plus
  5 error paths (bad id, no-filter, asymmetric date pair, 20-year-span-without-volcano_id) against
  the real `geodiva.avo.alaska.edu` API — confirmed real volcano/eruption data returned and
  correct 422 `INPUT_REJECTED` classification for every rejected case. Catalog/schema/dashboard
  wiring verified via the local docker stack REST API (`/health/ready`, `/api/v1/tools`,
  `/api/v1/tools/geodiva.*`, `/api/v1/dashboard`), `scripts/smoke-test.sh` (8/8 pass), and
  `scripts/test-geodiva.sh` (6/6 pass, written for this onboarding).
- `scripts/seed.ts` upserted all 1286 tools (including the 3 new geodiva tools) successfully;
  the script's separate `seedTestAgent()` step failed afterward with a pre-existing, unrelated
  Prisma UUID error (`TEST_AGENT_ID = 'test-agent-001'` is not a valid UUID for the
  `Agent.agent_id` column, which is `@db.Uuid`) — confirmed unmodified by this onboarding, already
  documented in UC-643's notes, and out of scope to fix here.
- **Caught and fixed during this onboarding:** the eruption_search schema was originally written
  with `.superRefine()` for cross-field validation (at-least-one-filter, date pairing, span cap).
  This broke `src/utils/zod-to-json-schema.ts` (no `ZodEffects` handling), causing
  `geodiva.eruption_search`'s REST catalog `input_schema` to come back empty. Fixed by moving all
  cross-field checks into `GeoDivaAdapter.buildRequest()` instead, matching the existing
  `macrostrat` adapter convention — confirmed no other schema file in the repo uses
  `.refine()`/`.superRefine()` for this reason.
- Regenerated `static/.well-known/openapi.json` (3 new `/api/v1/tools/geodiva.*/call` paths) and
  `static/.well-known/mcp/server-card.json` (3 tools added, all 3-level names, 100% param
  descriptions, 100% outputSchema coverage) as part of this run, per explicit batch-role
  instructions (unlike UC-643, which deferred this to the hourly batch-pusher).
- Per A-06/sandbox rules, this role did NOT run `scripts/sync-counts.sh` and did not publish to
  the remote repository or Smithery — those remain for the hourly batch-pusher per the BATCH MODE
  instructions (steps 1-14 only, local commit).

## Next Steps

- [x] No registration needed
- [x] Onboarded via night-orchestra batch role — adapter, schemas, registry, config, seed, build,
      deploy, OpenAPI, server-card all live
