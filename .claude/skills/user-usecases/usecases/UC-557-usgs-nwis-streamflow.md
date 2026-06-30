# UC-557 — USGS NWIS Streamflow

## Meta

| Field | Value |
|-------|-------|
| UC ID | UC-557 |
| Provider | USGS National Water Information System (NWIS) |
| Category | world / hydrology |
| API | https://waterservices.usgs.gov/nwis/ |
| Auth | None (US Government open data, public domain) |
| Date Integrated | 2026-06-30 |
| Status | LIVE |
| Tools | 4 |

## Provider Overview

The USGS National Water Information System (NWIS) is the authoritative source for US streamflow
and water resources data. Operated by the US Geological Survey (Water Resources Mission Area), it
serves real-time and historical data from 1.5M+ monitoring sites across the US. The system covers
rivers, streams, lakes, reservoirs, groundwater wells, and atmospheric stations.

This UC (557) complements UC-369 (usgs-water) which provides real-time IV data and site search.
UC-557 adds four new capabilities not in UC-369:
- Historical daily mean values (DV service) over arbitrary date ranges
- Long-term annual statistics going back to the 1900s
- Basin-wide conditions for an entire HUC-8 watershed (multi-site query)
- Detailed gauge station metadata (drainage area, HUC, altitude, etc.)

## Verified Endpoints

All endpoints tested live from Hetzner DE server, 2026-06-30:

| Endpoint | Description | Status |
|----------|-------------|--------|
| `/nwis/dv/` | Daily Values — historical mean per day | 200 OK, JSON |
| `/nwis/stat/` | Statistics — annual means (RDB format) | 200 OK, RDB text |
| `/nwis/iv/` (HUC param) | Instantaneous Values for all sites in a watershed | 200 OK, JSON |
| `/nwis/site/` | Site Service — expanded gauge metadata (RDB format) | 200 OK, RDB text |

## Tool Mapping

| tool_id | mcpName | price_usd | cache_ttl | Description |
|---------|---------|-----------|-----------|-------------|
| nwis.daily_values | nwis.streamflow.daily_values | $0.001 | 3600s | Historical daily streamflow values for a date range |
| nwis.annual_stats | nwis.streamflow.annual_stats | $0.002 | 86400s | Year-by-year annual mean streamflow statistics |
| nwis.basin_conditions | nwis.streamflow.basin_conditions | $0.003 | 300s | Real-time flow at all gauges in a HUC-8 watershed |
| nwis.site_info | nwis.streamflow.site_info | $0.001 | 86400s | Detailed gauge station metadata (drainage area, HUC) |

## Input Schemas

### nwis.daily_values
```json
{
  "site_no": "string (required) — USGS gauge station number, 8–15 digits (e.g. '01646500')",
  "start_date": "string (optional) — YYYY-MM-DD start, defaults to 30 days ago",
  "end_date": "string (optional) — YYYY-MM-DD end, defaults to today",
  "parameter_cd": "enum (optional) — '00060'=discharge(default),'00065'=gage height,'00010'=temp,'00095'=conductance,'63680'=turbidity"
}
```

### nwis.annual_stats
```json
{
  "site_no": "string (required) — USGS gauge station number, 8–15 digits"
}
```

### nwis.basin_conditions
```json
{
  "huc_code": "string (required) — 8-digit HUC watershed code (e.g. '02070008' = Potomac Basin)",
  "period": "string (optional) — ISO 8601 duration e.g. 'PT2H' (default), 'PT6H'"
}
```

### nwis.site_info
```json
{
  "site_no": "string (required) — USGS gauge station number, 8–15 digits"
}
```

## Pricing Rationale

| tool_id | Upstream Cost | Our Price | Margin |
|---------|--------------|-----------|--------|
| nwis.daily_values | $0 (US Gov public domain) | $0.001 | ~100% |
| nwis.annual_stats | $0 (US Gov public domain) | $0.002 | ~100% |
| nwis.basin_conditions | $0 (US Gov public domain) | $0.003 | ~100% |
| nwis.site_info | $0 (US Gov public domain) | $0.001 | ~100% |

Pricing set at minimum tier ($0.001–$0.003) for free upstream providers.
`nwis.basin_conditions` is priced $0.003 because it fetches multi-site data (5–40 stations)
in a single request — higher compute/network cost at the gateway layer.
`nwis.annual_stats` at $0.002 because it parses RDB text and returns multi-decade time series.

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/usgs-nwis/index.ts` | Main adapter (DV, stat, IV-HUC, site RDB parsers) |
| `src/adapters/usgs-nwis/types.ts` | TypeScript interfaces for all response types |
| `src/schemas/usgs-nwis.schema.ts` | Zod input schemas for all 4 tools |
| `src/schemas/index.ts` | Schema registry (usgsNwisSchemas added) |
| `src/adapters/registry.ts` | Adapter registry (case 'nwis'/'usgs-nwis' added) |
| `src/mcp/tool-definitions.ts` | Tool definitions (4 tools added at end of file) |
| `config/tool_provider_config.yaml` | Tool pricing and TTL config |
| `src/config/provider-limits.json` | Dashboard entry for usgs-nwis |
| `scripts/test-usgs-nwis.sh` | Smoke test script |

## Notes

- USGS NWIS has no documented rate limits — US Government open data under 17 USC §105
- The stat service only returns RDB (tab-delimited) format; no JSON option exists
- The site service also returns only RDB format with `siteOutput=expanded`
- For basin queries, inactive sites or sites missing the parameter silently return no values
- UC-369 usgs-water handles: site search (by state/bbox/site_no) + real-time IV data for a single site
- UC-557 usgs-nwis handles: daily history, annual stats, basin-wide multi-site, site metadata
