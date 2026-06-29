# UC-529 — ADS-B DB (adsbdb)

## Meta

| Field | Value |
|-------|-------|
| ID | UC-529 |
| Provider | ADS-B DB |
| Website | https://github.com/mrjackwills/adsbdb |
| API Base | https://api.adsbdb.com/v0 |
| Category | travel |
| Date | 2026-06-29 |
| Status | LIVE |
| Tools | 3 |
| Auth | None (MIT license, no registration required) |

## Provider Description

ADS-B DB is an open-source aircraft and airline database maintained by mrjackwills under the MIT license. It provides lookup of aircraft by Mode-S transponder hex code or ICAO registration mark, airline lookup by ICAO/IATA code, and flight callsign resolution to origin/destination airports. Data sourced from open ADS-B (Automatic Dependent Surveillance–Broadcast) transponder signals.

## API Analysis

### Endpoints Used

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v0/aircraft/{identifier}` | GET | Lookup by Mode-S hex or registration |
| `/v0/airline/{code}` | GET | Lookup by ICAO or IATA code |
| `/v0/callsign/{callsign}` | GET | Resolve callsign to route |

### Auth
No API key required. User-Agent header sent as courtesy.

### Rate Limits
No documented rate limits. MIT license, public access.

## Tool Mapping

| tool_id | mcpName | Endpoint | Price | Cache TTL |
|---------|---------|----------|-------|-----------|
| adsbdb.aircraft_lookup | adsbdb.aircraft.lookup | /v0/aircraft/{identifier} | $0.001 | 86400s |
| adsbdb.airline_lookup | adsbdb.airline.lookup | /v0/airline/{code} | $0.001 | 86400s |
| adsbdb.callsign_lookup | adsbdb.callsign.lookup | /v0/callsign/{callsign} | $0.001 | 3600s |

## Input Schemas

### adsbdb.aircraft_lookup
- `identifier` (string, required) — Mode-S hex code (e.g. "400F6B") or registration mark (e.g. "G-RVCL", "N123AB")

### adsbdb.airline_lookup
- `code` (string, required) — ICAO 3-letter (e.g. "BAW") or IATA 2-letter (e.g. "BA") code

### adsbdb.callsign_lookup
- `callsign` (string, required) — Flight callsign (e.g. "BAW123")

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| adsbdb.aircraft_lookup | $0 (free) | $0.001 | ~100% |
| adsbdb.airline_lookup | $0 (free) | $0.001 | ~100% |
| adsbdb.callsign_lookup | $0 (free) | $0.001 | ~100% |

MIT license, no auth, no upstream cost. Priced at minimum $0.001 per call standard for free public APIs.

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/adsbdb/index.ts` | Main adapter class |
| `src/adapters/adsbdb/types.ts` | TypeScript response types |
| `src/schemas/adsbdb.schema.ts` | Zod input schemas |

## Notes

- The `/v0/aircraft/{identifier}` endpoint auto-detects Mode-S vs registration format
- Callsign data covers commercial routes only; general aviation callsigns may return null
- `url_photo` and `url_photo_thumbnail` point to airport-data.com images (may be null)
- Cache TTL 86400s for aircraft/airline (static reference data), 3600s for callsigns (can change with schedule updates)
