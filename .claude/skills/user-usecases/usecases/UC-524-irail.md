# UC-524: iRail Belgium Rail

## Meta

| Field | Value |
|-------|-------|
| ID | UC-524 |
| Provider | iRail |
| Website | https://api.irail.be |
| Category | travel |
| Status | LIVE |
| Date | 2026-06-29 |
| Tools | 5 |

## Description

iRail is an open-data API for the Belgian national railway network (SNCB/NMBS). It provides real-time departure/arrival boards, train connections between stations, vehicle stop schedules with live delay data, service disturbances, and a complete station list. No authentication required. Open data license allows commercial use.

## Client Input Data & Credentials

- **API Key**: None required (open data)
- **Base URL**: `https://api.irail.be/v1`
- **License**: Open data, commercial use permitted

## Provider API Analysis

| Endpoint | Description | Auth |
|----------|-------------|------|
| `GET /v1/stations` | List all 700+ SNCB/NMBS stations | None |
| `GET /v1/liveboard` | Real-time departures/arrivals at a station | None |
| `GET /v1/connections` | Train connections between two stations | None |
| `GET /v1/vehicle` | Stop schedule + delays for a specific train | None |
| `GET /v1/disturbances` | Active service disruptions and alerts | None |

**Note**: The API redirects `api.irail.be/{path}` → `api.irail.be/v1/{path}` (HTTP 303). Always use the `/v1` prefix directly to avoid redirect overhead.

## Tool Mapping

| Tool ID | MCP Name | Description | Price | Cache TTL |
|---------|----------|-------------|-------|-----------|
| `irail.stations` | `irail.reference.stations` | List/filter all Belgian rail stations | $0.001 | 86400s |
| `irail.liveboard` | `irail.transit.liveboard` | Real-time departures/arrivals at a station | $0.001 | 30s |
| `irail.connections` | `irail.transit.connections` | Train connections between two stations | $0.002 | 60s |
| `irail.vehicle` | `irail.transit.vehicle` | Train stop schedule + live delays | $0.001 | 30s |
| `irail.disturbances` | `irail.transit.disturbances` | Service disruptions and alerts | $0.001 | 120s |

## Input Schemas

### `irail.stations`
- `query` (string, optional) — filter by station name
- `lang` (enum: en/nl/fr/de, optional) — response language

### `irail.liveboard`
- `station` (string, required) — station name (e.g. "Gent-Sint-Pieters")
- `arrdep` (enum: arrival/departure, optional) — default: departure
- `results` (integer 1–50, optional) — default: 20
- `date` (string DDMMYY, optional) — defaults to today
- `time` (string HHMM, optional) — defaults to now
- `lang` (enum: en/nl/fr/de, optional)

### `irail.connections`
- `from` (string, required) — departure station name
- `to` (string, required) — arrival station name
- `timesel` (enum: depart/arrive, optional) — default: depart
- `results` (integer 1–10, optional) — default: 6
- `date` (string DDMMYY, optional)
- `time` (string HHMM, optional)
- `lang` (enum: en/nl/fr/de, optional)

### `irail.vehicle`
- `id` (string, required) — vehicle ID (e.g. "BE.NMBS.IC1810")
- `date` (string DDMMYY, optional)
- `lang` (enum: en/nl/fr/de, optional)

### `irail.disturbances`
- `lang` (enum: en/nl/fr/de, optional)

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/irail/types.ts` | Raw API response TypeScript types |
| `src/adapters/irail/index.ts` | Main adapter class |
| `src/schemas/irail.schema.ts` | Zod input validation schemas |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| `irail.stations` | $0 (open data) | $0.001 | 100% |
| `irail.liveboard` | $0 (open data) | $0.001 | 100% |
| `irail.connections` | $0 (open data) | $0.002 | 100% |
| `irail.vehicle` | $0 (open data) | $0.001 | 100% |
| `irail.disturbances` | $0 (open data) | $0.001 | 100% |

Connections priced at $0.002 (vs $0.001) due to higher complexity of the response (multiple journeys with vias) and typically being the most latency-sensitive call. All within the $0.001–$0.005 range for free upstream providers.

## Notes

- All iRail timestamps are Unix epoch strings — adapter converts to ISO 8601
- `connections` endpoint returns `vias` as either array or single object depending on transfer count; adapter normalizes to always-array
- `disturbances` endpoint returns `descriptionLinks` as either array or single object — adapter ignores and exposes clean `more_info_url`
- Station names must match Belgian spelling (e.g. "Gent-Sint-Pieters" not "Ghent"); use `irail.stations` to look up valid names
- Vehicle IDs follow the format `BE.NMBS.{type}{number}` (e.g. "BE.NMBS.IC1810")
