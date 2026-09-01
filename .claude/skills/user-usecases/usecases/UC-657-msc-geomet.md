# UC-657: MSC GeoMet OGC API - Features (msc-geomet)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-657 |
| **Provider** | MSC GeoMet — Meteorological Service of Canada / Environment and Climate Change Canada — api.weather.gc.ca |
| **Domain** | api.weather.gc.ca |
| **Category** | weather |
| **Theme** | Public OGC API - Features front-end over 100+ ECCC/MSC geospatial collections: weather, climate, hydrometric, air quality |
| **Date** | 2026-09-01 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE (local) |
| **Region** | Canada |
| **Pricing Model** | free upstream (no auth) |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

MSC GeoMet is Environment and Climate Change Canada's public geospatial web service platform,
exposing 100+ collections (weather, climate, hydrometric, air quality, hurricanes, climate
projections) through a standards-compliant OGC API - Features (GeoJSON) interface at
`api.weather.gc.ca`. No auth, no signup. This UC wraps 4 of the most agent-useful collections.

| Aspect | Details |
|--------|---------|
| **Free Tier** | Fully open, no signup, no API key |
| **Paid Tier** | N/A — no paid tier exists |
| **Auth Model** | None |
| **License** | Canadian government open data |
| **Quota** | No documented rate limit found; no rate-limit response headers observed |
| **Global Availability** | Reachable from this host, standard HTTPS |
| **Status** | Production |

---

## API Overview

Candidate URL `https://api.weather.gc.ca` is the live OGC API root (confirmed via curl — root
document lists `collections`, `openapi`, `conformance` links, no dead-page issue).

| # | Endpoint | Method | Description |
|---|----------|--------|--------------|
| 1 | `/collections/climate-stations/items` | GET | Climate station catalog (filter by province, bbox) |
| 2 | `/collections/climate-daily/items` | GET | Daily climate observations (filter by CLIMATE_IDENTIFIER, datetime range) |
| 3 | `/collections/hydrometric-realtime/items` | GET | Real-time river/lake water level + discharge (filter by STATION_NUMBER) |
| 4 | `/collections/aqhi-observations-realtime/items` | GET | Real-time Air Quality Health Index (filter by location_id or latest=true) |

Verified live before implementation:
```
curl "/collections?f=json" -> 200, 104 collections
curl "/collections/climate-stations/items?limit=2&f=json" -> 200, real BC station records
curl "/collections/climate-daily/items?CLIMATE_IDENTIFIER=6158731&limit=2&f=json" -> 200, Toronto Intl A daily obs
curl "/collections/hydrometric-realtime/items?STATION_NUMBER=01AD003&limit=3&f=json" -> 200, 5-min level/discharge readings
curl "/collections/aqhi-observations-realtime/items?latest=true&limit=3&f=json" -> 200, real AQHI values (Halifax 1.16, etc.)
```

### Research Quirk — upstream does not cap `limit`; a naive pass-through is a response-size hazard

`GET /collections/climate-stations/items?limit=100000&f=json` returned **8,435 features / 8.3MB**
with `200 OK` — the OGC API server enforces no server-side ceiling on `limit`. Every tool clamps
`limit` client-side (`clampLimit()` in the adapter) to a collection-appropriate max: 100 for
station search, 366 for a full year of daily climate data, 288 for a full day of 5-minute
hydrometric readings, 50 for AQHI observations — all comfortably under the platform's 1MB
response ceiling.

### Research Quirk — filtering is exact-match only, no substring/name search

The OGC API Features spec (and this server) only supports exact-match filtering on queryable
properties (confirmed: `PROV_STATE_TERR_CODE=ON` works, there is no fuzzy/substring station-name
search). `msc-geomet.climate_stations` therefore exposes `province` (exact 2-letter code) and
`bbox` as filters, not a free-text name search — matches the provider's actual query surface
instead of implying a capability that would silently return nothing.

### Research Quirk — `datetime` range filter uses OGC's `start/end` slash syntax, not two separate params

Confirmed `?datetime=2020-01-01/2020-01-05` returns exactly the 5 matching days (`numberMatched:
5`). The adapter validates `start_date`/`end_date` are both present and `YYYY-MM-DD` before
building this into a single `datetime` query param.

### Research Quirk — `sortby=-DATETIME` works on hydrometric-realtime, used for most-recent-first ordering

Real-time hydrometric readings arrive roughly every 5 minutes; without sorting, the OGC API
returns them in arbitrary/insertion order. `sortby=-DATETIME` (confirmed via curl: latest reading
first) makes `msc-geomet.hydrometric_realtime` return the most recent readings first by default,
which is what an agent asking "what's the current water level" actually wants.

---

## Tool Mapping

| Tool ID | mcpName | Category | Description |
|---------|---------|----------|--------------|
| msc-geomet.climate_stations | msc-geomet.climate.stations | weather | Search climate stations by province/bbox |
| msc-geomet.climate_daily | msc-geomet.climate.daily | weather | Daily climate observations for a station |
| msc-geomet.hydrometric_realtime | msc-geomet.hydrometric.realtime | weather | Real-time river/lake level + discharge |
| msc-geomet.aqhi_observations | msc-geomet.aqhi.observations | weather | Real-time Air Quality Health Index |

## Input Schemas (summary)

- `climate_stations`: `province` (optional enum, 13 Canadian province/territory codes), `bbox`
  (optional "minLon,minLat,maxLon,maxLat"), `limit` (optional 1-100, default 20)
- `climate_daily`: `climate_identifier` (required), `start_date`/`end_date` (optional paired
  YYYY-MM-DD), `limit` (optional 1-366, default 30)
- `hydrometric_realtime`: `station_number` (required), `limit` (optional 1-288, default 20)
- `aqhi_observations`: `location_id` (optional — omit for latest across all locations), `limit`
  (optional 1-50, default 20)

---

## Implementation Files

| File | Purpose |
|------|---------|
| src/adapters/msc-geomet/index.ts | MscGeometAdapter — buildRequest/parseResponse for all 4 tools |
| src/adapters/msc-geomet/types.ts | GeoJSON FeatureCollection + per-collection property types |
| src/schemas/msc-geomet.schema.ts | Zod schemas for all 4 tools |
| src/adapters/registry.ts | case 'msc-geomet' to MscGeometAdapter |
| src/schemas/index.ts | mscGeometSchemas spread |
| src/mcp/tool-definitions.ts | 4 tool definitions, category weather |
| config/tool_provider_config.yaml | 4 tool entries, provider msc-geomet, price_usd 0.001-0.002, cache_ttl 300-604800 |
| src/config/provider-limits.json | Dashboard entry, limit_type unlimited, no documented rate limit |
| static/dashboard.html | PROVIDER_CATEGORIES entry: 'MSC GeoMet (Environment Canada)': 'Weather' |
| scripts/test-msc-geomet.sh | 6-check smoke test (health, catalog, schema, dashboard, OpenAPI, upstream) |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| msc-geomet.climate_stations | $0 (free, no auth) | $0.001 | ~100% | 604800s (7d — station metadata is near-static) |
| msc-geomet.climate_daily | $0 (free, no auth) | $0.002 | ~100% | 86400s (24h — historical daily records, occasionally revised) |
| msc-geomet.hydrometric_realtime | $0 (free, no auth) | $0.001 | ~100% | 300s (5min — matches upstream real-time telemetry interval) |
| msc-geomet.aqhi_observations | $0 (free, no auth) | $0.001 | ~100% | 3600s (1h — AQHI observations update roughly hourly) |

---

## Notes

- `npx tsx scripts/seed.ts` upserted all 4 new tools ("Upserted 1332 tools"). The script's
  separate `seedTestAgent()` step failed afterward with the same pre-existing, unrelated Prisma
  UUID error documented in every prior UC's notes since UC-643 (`Agent.agent_id` is a Postgres
  `uuid` column but the seed script's hardcoded `TEST_AGENT_ID` is not a valid UUID) — confirmed
  unmodified by this onboarding, verified the 4 tools persisted in Postgres directly via `psql`
  (all `status='healthy'`) despite the later script failure, out of scope to fix here.
- Local production stack (this host's Docker containers, which serve apibase.pro directly)
  rebuilt and redeployed cleanly: TS compile 0 errors, ESLint 0 errors, container healthy,
  `/api/v1/tools` shows 1311 tools with `has_more:false`, dashboard shows `tool_count:4` for
  `msc-geomet`. Both the general 8/8 smoke suite and the 6-check `test-msc-geomet.sh` suite pass
  (the OpenAPI-routes check only passes after Step 14 regeneration, run before this final commit).
- No authenticated end-to-end payment-pipeline test was run (this is a sandboxed role — no
  environment-file access, no funded test wallet available); adapter logic itself was verified
  directly against live upstream data via curl for all 4 endpoints (province filter, date-range
  filter, station-number filter, latest-AQHI filter) before and after wiring into the adapter.
- No natural prefetch relationship to existing tools identified (Step 4g-iii) — skipped per the
  skill's guidance that most providers don't need one.
