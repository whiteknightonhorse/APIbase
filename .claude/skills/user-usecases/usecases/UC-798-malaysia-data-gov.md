# UC-798 — Malaysia data.gov.my (malaysia-data-gov)

## Meta

| Field | Value |
|-------|-------|
| ID | UC-798 |
| Provider | Malaysia Open API (api.data.gov.my, developer docs at developer.data.gov.my) |
| Category | world / weather (government open data) |
| Date | 2026-10-01 |
| Status | LIVE (local build/deploy only — not yet pushed to production or Smithery) |
| Tools | 5 |
| Auth | None (open government data, per-IP rate limit upstream) |
| Provider key in APIbase | `malaysiagov` (tool_id prefix and registry case) |

## Overview

Malaysia's official open data API. Responses are plain JSON arrays; paging via `limit`, filtering via
`filter=value@column`, `contains=value@column`, `date_start`/`date_end`, `sort`. Wrapped: the generic
data-catalogue and OpenDOSM datasets (fuel prices, CPI, ...), MET Malaysia 7-day forecast and weather
warnings, earthquake reports, and JPS flood-station readings. GTFS static/realtime endpoints return
zip / protobuf and are NOT wrapped. Endpoints are called with a trailing slash to avoid a 301.
UC number = highest existing UC file + 1 (resort registry `next_uc_number` is stale at 776, which collides with UC-776).

## Tool Mapping

| tool_id | mcpName | Endpoint |
|---------|---------|----------|
| malaysiagov.dataset | malaysiagov.statistics.get_dataset | /data-catalogue/ or /opendosm/ |
| malaysiagov.weather_forecast | malaysiagov.weather.get_forecast | /weather/forecast/ |
| malaysiagov.weather_warning | malaysiagov.weather.get_warnings | /weather/warning/ |
| malaysiagov.earthquake | malaysiagov.hazards.get_earthquakes | /weather/warning/earthquake/ |
| malaysiagov.flood_warning | malaysiagov.hazards.get_flood_warnings | /flood-warning/ |

## Input Schemas

- dataset: `id` (required), `source`, `filter`, `contains`, `date_start`, `date_end`, `sort`, `limit`
- weather_forecast: `location_name`, `date_start`, `date_end`, `limit`
- weather_warning / earthquake: `limit`
- flood_warning: `state`, `district`, `limit`

## Implementation Files

- `src/adapters/malaysiagov/index.ts`, `src/schemas/malaysiagov.schema.ts`
- `src/adapters/registry.ts`, `src/schemas/index.ts`, `src/mcp/tool-definitions.ts`
- `config/tool_provider_config.yaml`, `src/config/provider-limits.json`, `scripts/test-malaysiagov.sh`

## Pricing Rationale

| Tool | Upstream cost | Price | Margin |
|------|---------------|-------|--------|
| all 5 | $0 (free open data) | $0.001 | ~100% |
