# UC-615 — EMSC Real-Time Earthquakes

## Meta

| Field | Value |
|-------|-------|
| ID | UC-615 |
| Provider | EMSC (European-Mediterranean Seismological Centre) — www.seismicportal.eu |
| Category | world |
| Date | 2026-08-27 |
| Status | LIVE |
| Tools | 2 |
| Auth | None (public FDSN Event Web Service, no registration) |
| License | CC BY 4.0 |

## Overview

The European-Mediterranean Seismological Centre (EMSC) operates a real-time seismicity catalog
(EMSC-RTS) aggregating reports from dozens of national and regional seismological agencies
(BMKG, IGC, UNM, and many others), exposed via a standard FDSN Event Web Service at
`www.seismicportal.eu/fdsnws/event/1/query`. This is a legitimately distinct upstream from the
platform's existing `earthquake.*` tools (USGS Earthquake Hazards Program) — EMSC is a
European-Mediterranean regional network, often lower-latency for Euro-Med events, and surfaces a
different reporting-agency/felt-region breakdown per event. Both providers are kept as separate
tool namespaces (`emsc.*` vs `earthquake.*`).

`search_earthquakes` queries the catalog by time range, bounding box, or point+radius, with
magnitude and depth range filters. `event_detail` fetches the full record for a single event by
its EMSC unique ID (unid), as returned by search.

## API Endpoints Verified

| Endpoint | Method | Description |
|----------|--------|-------------|
| `https://www.seismicportal.eu/fdsnws/event/1/query?format=json` | GET | Parametric search — returns a GeoJSON `FeatureCollection` |
| `https://www.seismicportal.eu/fdsnws/event/1/query?format=json&eventid={unid}` | GET | Single-event lookup — returns a bare `Feature` object (NOT wrapped in a FeatureCollection) |

## Tool Mapping

| Tool ID | MCP Name | Endpoint | Price | TTL | Description |
|---------|----------|----------|-------|-----|-------------|
| `emsc.search_earthquakes` | `emsc.seismic.search` | GET `/query` | $0.002 | 60s | Search EMSC-RTS by time range, bbox or point+radius, magnitude range, depth range |
| `emsc.event_detail` | `emsc.seismic.event_detail` | GET `/query?eventid=` | $0.001 | 3600s | Full detail for one event by EMSC unid, optionally with all magnitudes/origins |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| emsc.search_earthquakes | $0 (open data) | $0.002 | ~100% |
| emsc.event_detail | $0 (open data) | $0.001 | ~100% |

No-auth public institutional seismic network — pricing covers infrastructure/pipeline cost only.
`search_earthquakes` uses a short 60s TTL since this is a near-real-time feed (new events arrive
continuously and magnitude/location can be revised in the minutes after an event). `event_detail`
uses a longer 3600s TTL since a single archived event's core fields are stable, though
`lastupdate` can still shift for a while after publication as agencies revise magnitude — 1 hour
balances freshness against redundant upstream calls.

## Input Schemas

### emsc.search_earthquakes
```json
{
  "starttime": "string (optional) — ISO 8601 date/datetime, e.g. 2026-08-01",
  "endtime": "string (optional) — ISO 8601 date/datetime",
  "minlatitude": "number (optional, -90..90)",
  "maxlatitude": "number (optional, -90..90)",
  "minlongitude": "number (optional, -180..180)",
  "maxlongitude": "number (optional, -180..180)",
  "latitude": "number (optional, -90..90) — center point for radius search",
  "longitude": "number (optional, -180..180) — center point for radius search",
  "maxradius": "number (optional, positive) — search radius in degrees",
  "minmagnitude": "number (optional)",
  "maxmagnitude": "number (optional)",
  "mindepth": "number (optional) — km",
  "maxdepth": "number (optional) — km",
  "limit": "integer (optional, 1-200, default 50)"
}
```

### emsc.event_detail
```json
{
  "eventid": "string (required) — EMSC unid, e.g. 20260827_0000123",
  "includeallmagnitudes": "boolean (optional, default false)",
  "includeallorigins": "boolean (optional, default false)"
}
```

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/emsc/index.ts` | Main adapter class (`EmscAdapter`) — overrides `call()` entirely to handle the FDSN `nodata=204` empty-result convention and the two distinct response shapes (FeatureCollection vs bare Feature) |
| `src/adapters/emsc/types.ts` | TypeScript interfaces for EMSC GeoJSON Feature / FeatureCollection shapes |
| `src/schemas/emsc.schema.ts` | Zod input schemas (`emscSchemas`) |
| `src/adapters/registry.ts` | Case `'emsc'` → `EmscAdapter` |
| `src/schemas/index.ts` | Schema registry import (`emscSchemas`) |
| `src/mcp/tool-definitions.ts` | 2 tool definitions |
| `config/tool_provider_config.yaml` | Price and TTL per tool |
| `src/config/provider-limits.json` | Dashboard entry (`emsc`) |
| `static/dashboard.html` | `PROVIDER_CATEGORIES` mapping → `Earthquakes` |

## Notes

- Upstream quirk (the main reason for a custom adapter instead of the standard
  `buildRequest`/`parseResponse` pattern): the FDSN Event spec's default `nodata=204` means the
  upstream returns **HTTP 204 No Content with an empty body** when a search matches zero events —
  verified live with a guaranteed-empty query (`minmagnitude=9.99`). The shared `BaseAdapter`
  treats any non-4xx/5xx status as "parse the body as JSON," which would throw
  `provider_invalid_response` on an empty 204 body. `EmscAdapter` overrides `call()` entirely (same
  pattern as the `cactus`/`noaa` adapters) so a 204 short-circuits to a valid empty
  `FeatureCollection` result rather than an error.
- Response shape quirk: the search endpoint returns a GeoJSON `FeatureCollection` (`features: []`
  array), but a single-event lookup via `?eventid=` returns a **bare `Feature` object** at the top
  level (`properties` directly, no wrapping array) — confirmed by live comparison of both response
  bodies. `parseResponse`/`eventDetail` handle this distinct shape separately from `searchEarthquakes`.
  Both `id` (GeoJSON feature id) and `properties.unid` carry the same value; the adapter surfaces
  `properties.unid` (falling back to `id`) as the canonical `id` field in tool output.
- Confirmed no resale restriction: EMSC's public data license is CC BY 4.0 (attribution only); the
  terms page (`seismicportal.eu/terms.html`) is an accuracy/liability disclaimer, standard for
  institutional real-time seismic networks (same class as the already-integrated USGS Earthquake
  and P2PQuake providers) — no prohibition on commercial or pay-per-call resale.
- Deliberately kept as a separate `emsc.*` namespace rather than merged into the existing
  `earthquake.*` (USGS) tools — different upstream network, different per-event reporting-agency
  attribution, and agents may want both for cross-referencing a Euro-Med event.
- Onboarded 2026-08-27 (night-orchestra batch mode, sandboxed role) — no prior partial attempt
  existed (no adapter dir, no registry case, no yaml entries before this run).
