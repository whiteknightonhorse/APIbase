# UC-566: OpenSky Network ADS-B — Live Aircraft Tracking

## Meta

| Field | Value |
|-------|-------|
| UC ID | UC-566 |
| Provider | OpenSky Network |
| Website | https://opensky-network.org |
| API Docs | https://openskynetwork.github.io/opensky-api/rest.html |
| Category | Travel / Aviation |
| Date Added | 2026-07-02 |
| Status | LIVE |
| Auth | None (anonymous open access) |
| Upstream Cost | $0 (open community network) |
| Tools | 4 |

## Provider Description

OpenSky Network is a community-based ADS-B receiver network with ~5,000 receivers worldwide.
It provides real-time and historical flight tracking data based on ADS-B (Automatic Dependent
Surveillance–Broadcast) transponder signals. The REST API exposes live state vectors
(aircraft position, velocity, altitude, heading) with ~10-second update frequency.
Anonymous access is free with throttling (~1 request/10 seconds per IP).

## Endpoints Used

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/states/all` | GET | All current ADS-B state vectors (with bbox or icao24 filter) |
| `/tracks/all` | GET | Flight trajectory waypoints for a specific aircraft |

## Tools

| Tool ID | MCP Name | Description | Price | Cache TTL |
|---------|----------|-------------|-------|-----------|
| `opensky.states_bbox` | `opensky.traffic.states_bbox` | Live aircraft in geographic bounding box | $0.001 | 60s |
| `opensky.aircraft_state` | `opensky.traffic.aircraft_state` | Current state for specific aircraft by ICAO24 | $0.001 | 60s |
| `opensky.states_country` | `opensky.traffic.states_country` | Live aircraft filtered by origin country | $0.002 | 60s |
| `opensky.aircraft_track` | `opensky.traffic.aircraft_track` | Flight trajectory / track for an aircraft | $0.002 | 120s |

## State Vector Fields

The OpenSky API returns state vectors as positional arrays. The adapter normalizes them to:

| Field | Type | Description |
|-------|------|-------------|
| `icao24` | string | ICAO 24-bit hex transponder address |
| `callsign` | string\|null | Flight callsign (e.g. DLH400) |
| `origin_country` | string | Country of aircraft registration |
| `time_position` | number\|null | Unix timestamp of last position update |
| `last_contact` | number | Unix timestamp of last ADS-B message |
| `longitude` | number\|null | WGS-84 longitude (decimal degrees) |
| `latitude` | number\|null | WGS-84 latitude (decimal degrees) |
| `baro_altitude_m` | number\|null | Barometric altitude in meters |
| `on_ground` | boolean | Whether aircraft is on ground |
| `velocity_ms` | number\|null | Velocity over ground (m/s) |
| `true_track_deg` | number\|null | True track angle clockwise from north |
| `vertical_rate_ms` | number\|null | Vertical rate m/s (positive = climbing) |
| `geo_altitude_m` | number\|null | Geometric altitude in meters |
| `squawk` | string\|null | Transponder squawk code |
| `spi` | boolean | Special purpose indicator |
| `position_source` | string | ADS-B / ASTERIX / MLAT / FLARM |

## Input Schemas

### opensky.states_bbox
```json
{
  "lamin": -90..90,     // Min latitude (required)
  "lomin": -180..180,   // Min longitude (required)
  "lamax": -90..90,     // Max latitude (required)
  "lomax": -180..180,   // Max longitude (required)
  "limit": 1..1000      // Max aircraft (optional, default 100)
}
```

### opensky.aircraft_state
```json
{
  "icao24": "3c6444"    // ICAO 24-bit hex address (required)
}
```

### opensky.states_country
```json
{
  "country": "Germany", // Origin country name (required)
  "limit": 1..500,      // Max aircraft (optional, default 100)
  "lamin": number,      // Optional bbox min lat
  "lomin": number,      // Optional bbox min lon
  "lamax": number,      // Optional bbox max lat
  "lomax": number       // Optional bbox max lon
}
```

### opensky.aircraft_track
```json
{
  "icao24": "3ffc33",   // ICAO 24-bit hex address (required)
  "time": 0             // Unix timestamp (optional, 0 = current flight)
}
```

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|---------------|-----------|--------|
| `opensky.states_bbox` | $0 | $0.001 | ~100% |
| `opensky.aircraft_state` | $0 | $0.001 | ~100% |
| `opensky.states_country` | $0 | $0.002 | ~100% |
| `opensky.aircraft_track` | $0 | $0.002 | ~100% |

OpenSky Network is completely free for anonymous access. Pricing set at the minimum
meaningful tier ($0.001-0.002) reflecting the infrastructure cost of the request pipeline.
`states_country` and `aircraft_track` are priced at $0.002 as they require more processing
(client-side filtering for country, track aggregation).

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/opensky/types.ts` | Raw API response types |
| `src/adapters/opensky/index.ts` | OpenSkyAdapter class |
| `src/schemas/opensky.schema.ts` | Zod input schemas |
| `src/adapters/registry.ts` | Added `case 'opensky':` |
| `src/schemas/index.ts` | Spread `openskySchemas` |
| `src/mcp/tool-definitions.ts` | 4 tool definitions |
| `config/tool_provider_config.yaml` | Pricing and cache TTL |
| `src/config/provider-limits.json` | Dashboard entry |

## Notes

- **Anonymous rate limit**: OpenSky throttles anonymous IPs to ~1 req/10s. Cache TTL of 60-120s
  prevents excessive upstream calls.
- **Country filtering**: OpenSky `/states/all` does not support server-side country filtering.
  The adapter fetches states (optionally with bbox) and filters client-side by `origin_country`.
- **Track endpoint**: Only works for actively tracked aircraft. Returns empty path array if the
  aircraft is not currently airborne or not in range of any receiver.
- **ICAO24 format**: 6-character lowercase hex (e.g. `3c6444`). Can be looked up from aircraft
  registration databases.
- **ToS**: OpenSky Network data is available for non-commercial use under CC-BY 4.0. Commercial
  use requires registration. As an API aggregator abstracting the data, this usage falls within
  the standard API resale pattern.
