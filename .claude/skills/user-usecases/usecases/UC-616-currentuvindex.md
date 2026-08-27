# UC-616 — Current UV Index

## Meta

| Field | Value |
|-------|-------|
| ID | UC-616 |
| Provider | Current UV Index — currentuvindex.com |
| Category | weather |
| Date | 2026-08-27 |
| Status | LIVE |
| Tools | 1 |
| Auth | None (no signup, no API key) |
| License | CC BY 4.0 (attribution required, commercial use OK) |

## Overview

Current UV Index exposes a single free, global, no-auth endpoint that returns the current UV
Index for any latitude/longitude worldwide, an hourly forecast for the next ~120 hours, and (since
Feb 2025) up to 24 hours of recent history. The adapter augments every data point with a
WHO/EPA-standard risk category (Low/Moderate/High/Very High/Extreme, thresholds 0-2/3-5/6-7/8-10/11+)
so agents don't have to hardcode the UV Index scale themselves, and surfaces the single
`peak_forecast` point (highest UVI in the forecast window) as a convenience field.

## API Endpoints Verified

| Endpoint | Method | Description |
|----------|--------|-------------|
| `https://currentuvindex.com/api/v1/uvi?latitude={lat}&longitude={lon}` | GET | Current UVI + ~120h hourly forecast + up to 24h hourly history for one point |

Verified live: valid coordinates return `{"ok":true,...}` with `now`/`forecast`/`history`. Missing
or invalid `latitude`/`longitude` returns HTTP 400 with `{"ok":false,"message":"..."}` (e.g.
`"missing latitude"`, `"invalid longitude"`) — handled automatically by the shared `BaseAdapter`'s
generic 4xx → `INPUT_REJECTED` (422) classification (§ CLAUDE.md 2026-06-06 rule), no custom error
handling needed in the adapter.

## Tool Mapping

| Tool ID | MCP Name | Endpoint | Price | TTL | Description |
|---------|----------|----------|-------|-----|-------------|
| `currentuvindex.uv_index` | `currentuvindex.weather.uv_index` | GET `/api/v1/uvi` | $0.002 | 1800s | Current UV Index, ~120h hourly forecast, up to 24h hourly history, with WHO/EPA risk category per point and peak-forecast summary |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| currentuvindex.uv_index | $0 (free, no auth) | $0.002 | ~100% |

No-auth, no-signup public API — pricing covers infrastructure/pipeline cost only. Priced in line
with other combined now+forecast weather-class tools (e.g. `airnow.forecast_zip` at $0.002).
1800s (30 min) TTL balances freshness (source data is hourly-resolution) against redundant
upstream calls for the same coordinate.

## Input Schema

### currentuvindex.uv_index
```json
{
  "latitude": "number (required, -90..90) — decimal degrees, e.g. 40.6943",
  "longitude": "number (required, -180..180) — decimal degrees, e.g. -73.9249"
}
```

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/currentuvindex/index.ts` | Main adapter class (`CurrentUvIndexAdapter`) — `buildRequest`/`parseResponse`, adds `risk_level` per point and `peak_forecast` |
| `src/adapters/currentuvindex/types.ts` | TypeScript interfaces for the upstream JSON response |
| `src/schemas/currentuvindex.schema.ts` | Zod input schema (`currentuvindexSchemas`) |
| `src/adapters/registry.ts` | Case `'currentuvindex'` → `CurrentUvIndexAdapter` |
| `src/schemas/index.ts` | Schema registry import (`currentuvindexSchemas`) |
| `src/mcp/tool-definitions.ts` | 1 tool definition |
| `config/tool_provider_config.yaml` | Price and TTL |
| `src/config/provider-limits.json` | Dashboard entry (`currentuvindex`) — `limit_type: daily`, `free_limit: 500` (500 req/IP/day per docs) |

## Notes

- Single-endpoint provider — no auth manager, no OAuth, standard `buildRequest`/`parseResponse`
  pattern (like `swpc`/`airnow`), no need to override `call()`.
- Upstream 4xx error bodies (`{"ok":false,"message":"..."}`) are surfaced verbatim via the shared
  `BaseAdapter`'s generic non-2xx → `INPUT_REJECTED` (422) path — no adapter-local error parsing
  needed, since the shared classification already includes the response body text in the message.
- Rate limit is 500 requests/IP/day per the provider's own docs, keyed by caller IP — since all
  agent traffic to this provider egresses from this server's single IP, this is a shared budget
  across all APIbase agents, not per-agent. Recorded as `limit_type: "daily"` / `free_limit: 500`
  in `provider-limits.json` for dashboard visibility; not separately rate-limited in the adapter
  (the platform's own per-agent/per-tool rate limiting and $0.002 price already bound demand well
  under 500/day for a single-tool low-traffic provider).
- Added `risk_level` (WHO/EPA UV Index exposure category) and `peak_forecast` (max-UVI point in
  the forecast window) as adapter-side enrichment — same pattern as `swpc.k_index`'s
  Kp-to-G-storm-severity mapping — so agents get an actionable classification without needing to
  hardcode the 0-2/3-5/6-7/8-10/11+ threshold table themselves.
- Onboarded 2026-08-27 (night-orchestra batch mode, sandboxed role) — no prior partial attempt
  existed (no adapter dir, no registry case, no yaml entries before this run).
