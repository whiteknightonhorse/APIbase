# UC-654: Environment Agency Hydrology (ea-hydrology)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-654 |
| **Provider** | UK Environment Agency — environment.data.gov.uk/hydrology |
| **Domain** | environment.data.gov.uk |
| **Category** | Weather (closest existing category — no dedicated "water" category exists; river/rainfall/groundwater environmental monitoring) |
| **Theme** | Station search -> per-station measure list -> latest/date-ranged readings (same 3-step drill-down shape as bank-of-england/oecd-data) |
| **Date** | 2026-09-01 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE (local) |
| **Region** | United Kingdom (England/Wales monitoring network) |
| **Pricing Model** | free upstream (no auth) |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

The Environment Agency Hydrology API is the public REST interface for the UK's river flow,
river level, groundwater level, rainfall, and water temperature monitoring network (the same
underlying network that backs the EA's flood-monitoring service, but this is the dedicated
sub-daily/historical hydrology dataset — version 2.1.1). It is a Linked Data (JSON-LD-flavoured)
REST API: stations have a `notation` (UUID) identifier, each station exposes one or more
`measures` (a parameter + averaging period + statistic combination, e.g. "15-minute
instantaneous flow" or "daily mean level"), and each measure has a `readings` time series
endpoint.

| Aspect | Details |
|--------|---------|
| **Free Tier** | Fully open, no signup, no API key |
| **Paid Tier** | N/A — no paid tier exists |
| **Auth Model** | None |
| **License** | UK Open Government Licence v3.0 |
| **Quota** | No documented rate limit found on the API reference page |
| **Global Availability** | Reachable from this host, standard HTTPS |
| **Status** | Production |

---

## API Overview

Candidate URL (`environment.data.gov.uk/hydrology`) is directly the live API root — no stale
path correction needed (unlike UKHSA's `/api` suffix or Copernicus's collection path).

| # | Endpoint | Method | Description |
|---|----------|--------|--------------|
| 1 | `/id/stations.json?riverName=&search=&observedProperty=&_limit=` | GET | Search/list stations |
| 2 | `/id/measures.json?station=&parameter=` | GET | List measures for a station |
| 3 | `/id/measures/{measure}/readings.json?latest&_limit=1` | GET | Latest single reading |
| 4 | `/id/measures/{measure}/readings.json?min-date=&max-date=&_limit=` | GET | Date-ranged readings |

Verified live before implementation:
```
curl "https://environment.data.gov.uk/hydrology/id/stations.json?riverName=River%20Thames&_limit=5"
-> 200, 5 stations incl. "Farmoor", "Windsor"

curl "https://environment.data.gov.uk/hydrology/id/measures.json?station={guid}&parameter=flow"
-> 200, 4 flow measures (daily mean/min/max, 15min instantaneous)

curl "https://environment.data.gov.uk/hydrology/id/measures/{measure}/readings.json?latest&_limit=5"
-> 200, 1 reading (date, dateTime, value, quality)

curl "https://environment.data.gov.uk/hydrology/id/measures/{measure}/readings.json?min-date=2026-08-01&max-date=2026-08-05"
-> 200, 3 readings, ~180 bytes/row
```

### Research Quirk — invalid IDs return HTTP 200 with empty `items`, not 404

Same class as world-bank-cckp/bank-of-england (2026-08-30/31 CLAUDE.md-documented pattern):
`?station=00000000-0000-0000-0000-000000000000` and a nonexistent measure notation both return
`200 {"items": []}`. Confirmed live directly against the adapter (see Notes) — no special error
mapping needed, but callers must obtain valid `station_id`/`measure_id` from `station_search` /
`station_measures` first.

### Research Quirk — `parameter` filter on `/id/measures.json` is case-sensitive and inconsistent

Confirmed live: `parameter=flow`, `parameter=level`, `parameter=rainfall` (lowercase) all match,
but `parameter=temperature` (lowercase) returns 0 results while `parameter=TEMPERATURE`
(uppercase) returns 2. This is an upstream data inconsistency, not a client bug — documented in
the Zod `.describe()` and the adapter's file-header comment so agents don't waste a call on the
lowercase form.

### Research Quirk — unbounded readings requests are large; `_limit` is mandatory

`readings.json` with no `_limit` defaults to an upstream cap of 100,000 rows. A daily-period
measure with no date filter returned 6,492 rows / 1.9MB (over the 1MB response ceiling) in
testing; a 2,000-station `stations.json?_limit=2000` call measured 3.7MB. The adapter always
sends an explicit `_limit` (`station_search`: 1-200, default 20; `readings_range`: 1-2000,
default 500) to stay under `maxResponseBytes` (1,000,000) in every case tested.

---

## Tool Mapping

| # | Tool ID | mcpName | Description | Price |
|---|---------|---------|--------------|-------|
| 1 | ea-hydrology.station_search | ea-hydrology.stations.search | Search stations by river name, freetext, or observed property | $0.001 |
| 2 | ea-hydrology.station_measures | ea-hydrology.stations.measures | List measures (parameter/period/stat) for a station | $0.001 |
| 3 | ea-hydrology.readings_latest | ea-hydrology.readings.latest | Most recent reading for a measure | $0.001 |
| 4 | ea-hydrology.readings_range | ea-hydrology.readings.range | Date-ranged readings time series for a measure | $0.002 |

All 4 tools: category `weather`, annotations `READ_ONLY`.

---

## Input Schemas

Defined in `src/schemas/ea-hydrology.schema.ts`, all `strip()`ped Zod objects:

- `station_search`: `river_name`, `search` (both optional strings, max 200), `observed_property`
  (optional enum: waterFlow/waterLevel/rainfall/temperature/groundwaterLevel), `limit` (optional
  1-200, default 20)
- `station_measures`: `station_id` (required string), `parameter` (optional enum:
  flow/level/rainfall/TEMPERATURE — note the case-sensitivity quirk above)
- `readings_latest`: `measure_id` (required string)
- `readings_range`: `measure_id` (required), `min_date`/`max_date` (required, `YYYY-MM-DD`
  regex-validated), `limit` (optional 1-2000, default 500)

---

## Implementation Files

| File | Purpose |
|------|---------|
| src/adapters/ea-hydrology/index.ts | EaHydrologyAdapter — buildRequest/parseResponse for all 4 tools |
| src/adapters/ea-hydrology/types.ts | Raw stations/measures/readings response types |
| src/schemas/ea-hydrology.schema.ts | Zod schemas for all 4 tools |
| src/adapters/registry.ts | case 'ea-hydrology' to EaHydrologyAdapter |
| src/schemas/index.ts | eaHydrologySchemas spread |
| src/mcp/tool-definitions.ts | 4 tool definitions, category weather |
| config/tool_provider_config.yaml | 4 tool entries, provider ea-hydrology, price_usd 0.001-0.002, cache_ttl 300-86400 |
| src/config/provider-limits.json | Dashboard entry, limit_type unlimited, no documented rate limit |
| static/dashboard.html | PROVIDER_CATEGORIES entry: 'EA Hydrology': 'Weather' |
| scripts/test-ea-hydrology.sh | 6-check smoke test (health, catalog, schema, dashboard, OpenAPI, upstream) |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| ea-hydrology.station_search | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — station metadata is near-static) |
| ea-hydrology.station_measures | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — a station's available measures rarely change) |
| ea-hydrology.readings_latest | $0 (free, no auth) | $0.001 | ~100% | 300s (5m — sub-daily instantaneous data updates every 15 minutes) |
| ea-hydrology.readings_range | $0 (free, no auth) | $0.002 | ~100% | 3600s (1h — historical time series, larger payload) |

---

## Notes

- End-to-end verified directly against the adapter class (`EaHydrologyAdapter.call()`, deleted
  after verification) rather than a full paid REST round-trip: no funded test wallet exists in
  this sandboxed batch role. Confirmed live: `station_search` for "River Thames" returned real
  stations (Farmoor, Windsor); `station_measures` for Farmoor's station_id returned 7 real
  measures (flow daily mean/min/max, flow 15min instantaneous, level 15min instantaneous, level
  daily min/max); `readings_latest` returned a real 2026-08-30 daily mean flow value (1.254
  m3/s); `readings_range` (2026-08-01 to 2026-08-05) returned 3 real daily readings with
  completeness flags; an invalid `station_id` correctly returned `{"returned": 0, "measures":
  []}` (silent-empty, not an error). Separately confirmed via plain `curl` against the live REST
  endpoint (`/api/v1/tools/ea-hydrology.station_search/call`) that the payment pipeline correctly
  gates the tool with a well-formed x402 402 challenge (`price_usd: "0.001"`, correct
  `payment_address: 0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480`) — the ESCROW stage is wired
  correctly for this tool.
- `npx tsx scripts/seed.ts` upserted all 4 new tools (1321 tools total, confirmed via the script's
  own "Upserted 1321 tools" output — matches 1317 pre-existing + 4 new). The script's separate
  `seedTestAgent()` step failed afterward with the same pre-existing, unrelated Prisma UUID error
  documented in every prior UC's notes since UC-643 (`Agent.agent_id` column is typed `uuid` in
  Postgres but the seed script's hardcoded `TEST_AGENT_ID` value `'test-agent-001'` is not a
  valid UUID) — confirmed unmodified by this onboarding, out of scope to fix here.
- **Concurrent working-tree collision observed and recovered mid-onboarding (not caused by
  ea-hydrology):** partway through this onboarding, commit `7e6ae80` ("F1/C-5: real MPP payer
  capture + refund-owed recording") landed on local `main` from a separate concurrent process,
  and the shared working tree was reset to match it — silently wiping this onboarding's
  in-progress edits to `src/adapters/registry.ts`, `src/mcp/tool-definitions.ts`,
  `config/tool_provider_config.yaml`, `src/config/provider-limits.json`, `src/schemas/index.ts`,
  and `static/dashboard.html` (confirmed via `git status --short` showing those 6 files as
  unmodified while the 3 brand-new untracked files, which `git reset --hard` does not touch,
  survived intact). Detected via an external file-modification system note, verified against
  `git log`, and all 6 edits were redone cleanly against the new base and re-verified (TS
  compile, lint, rebuild, redeploy, both smoke test suites) before commit. Same class of hazard
  documented in UC-652's and UC-653's notes (shared working tree, not exclusively owned by one
  role) — always inspect `git status` and re-verify file contents after any long-running step
  before committing.
