# UC-568 — Transport for London (TfL Open Data)

## Meta

| Field | Value |
|-------|-------|
| ID | UC-568 |
| Provider | Transport for London (TfL) |
| Category | travel |
| Date Connected | 2026-07-02 |
| Status | LIVE |
| Tools | 4 |
| UC File | UC-568-tfl-london.md |

## Provider Overview

Transport for London (TfL) operates the London public transport network including the Underground (Tube), Overground, Elizabeth line, DLR, buses, trams, Santander Cycles, river buses, and cable car. The TfL Unified API (api.tfl.gov.uk) provides real-time data under the TfL Open Data licence (CC-BY), free for commercial use with attribution.

**API Base URL:** https://api.tfl.gov.uk  
**Docs:** https://api-portal.tfl.gov.uk  
**Auth:** None required for anonymous access  
**Rate Limits:** No documented hard limits for unauthenticated requests  
**License:** TfL Open Data — CC-BY, free for commercial use  

## Credentials

No credentials required. Anonymous access to all endpoints used.

## Provider API Analysis

| Endpoint | Tool | Notes |
|----------|------|-------|
| `GET /Line/Mode/{modes}/Status` | `tfl.line_status` | Real-time line status for tube, overground, DLR, Elizabeth line, bus |
| `GET /Line/{line}/Arrivals/{stopId}` | `tfl.arrivals` | Live arrival predictions at a stop (30s refresh) |
| `GET /Journey/JourneyResults/{from}/to/{to}` | `tfl.journey_plan` | Multi-modal journey planner |
| `GET /BikePoint` | `tfl.bike_points` | Santander Cycles docking station availability |

## Tool Mapping

| tool_id | mcpName | Description | Price | Cache TTL |
|---------|---------|-------------|-------|-----------|
| `tfl.line_status` | `tfl.transit.line_status` | Real-time status for all TfL lines | $0.001 | 30s |
| `tfl.arrivals` | `tfl.transit.arrivals` | Live arrivals at a stop/station | $0.001 | 30s |
| `tfl.journey_plan` | `tfl.transit.journey_plan` | Journey planner between two points | $0.002 | 300s |
| `tfl.bike_points` | `tfl.transit.bike_points` | Santander Cycles docking availability | $0.001 | 60s |

## Input Schemas

### tfl.line_status
- `modes` (string, optional) — comma-separated modes (tube,overground,elizabeth-line,dlr,bus,tram)
- `include_good_service` (boolean, optional) — include Good Service lines (default true)
- `detail` (boolean, optional) — include affected stops in disruptions (default false)

### tfl.arrivals
- `line_id` (string, required) — TfL line ID (e.g. central, bakerloo, jubilee, elizabeth)
- `stop_id` (string, required) — NAPTAN stop ID (e.g. 940GZZLUHPK)
- `direction` (enum, optional) — inbound | outbound | all
- `limit` (integer, optional) — max arrivals to return (1-50, default 20)

### tfl.journey_plan
- `from` (string, required) — origin (NAPTAN, ICS, lat/lon, or free text)
- `to` (string, required) — destination (NAPTAN, ICS, lat/lon, or free text)
- `mode` (string, optional) — comma-separated modes (e.g. tube,bus)
- `date` (string, optional) — YYYYMMDD
- `time` (string, optional) — HHMM
- `time_is` (enum, optional) — Departing | Arriving
- `limit` (integer, optional) — journey options (1-5, default 3)

### tfl.bike_points
- `query` (string, optional) — filter by station name keyword
- `limit` (integer, optional) — max stations (1-200, default 50)

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/tfl/index.ts` | Main adapter class |
| `src/adapters/tfl/types.ts` | TypeScript types for TfL API responses |
| `src/schemas/tfl.schema.ts` | Zod input schemas (4 tools) |
| `src/adapters/registry.ts` | Added `case 'tfl'` |
| `src/schemas/index.ts` | Added `...tflSchemas` |
| `src/mcp/tool-definitions.ts` | Added 4 tool definitions |
| `config/tool_provider_config.yaml` | 4 tool entries (UC-568) |
| `src/config/provider-limits.json` | Dashboard config for tfl |
| `scripts/test-tfl.sh` | Smoke test script |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|-------------|-----------|--------|
| tfl.line_status | $0 (TfL Open Data) | $0.001 | ~100% |
| tfl.arrivals | $0 (TfL Open Data) | $0.001 | ~100% |
| tfl.journey_plan | $0 (TfL Open Data) | $0.002 | ~100% |
| tfl.bike_points | $0 (TfL Open Data) | $0.001 | ~100% |

Journey planner is priced at $0.002 (double the others) because it calls the TfL journey API which performs complex multi-modal routing computation and is more computationally expensive on the TfL side.

## Notes

- All endpoints return real-time data (30s staleness for status/arrivals, 60s for bike points)
- TfL Open Data requires attribution: "Powered by TfL Open Data"
- Journey planner accepts free-text locations (resolves via TfL geocoding internally)
- NAPTAN IDs for common stations: Kings Cross=940GZZLUKSX, Waterloo=940GZZLUWLO, Heathrow T5=940GZZLUHRC
- Bike points return all 800+ stations unless filtered with `query`
