# UC-541 — Swiss National Bank (SNB) Data

## Meta

| Field | Value |
|-------|-------|
| ID | UC-541 |
| Provider | Swiss National Bank (SNB) |
| Category | Finance — Central Bank Data |
| Date | 2026-06-30 |
| Status | LIVE |
| Auth | None (Swiss Open Government Data) |
| Base URL | https://data.snb.ch |
| Adapter | src/adapters/swissnbm/ |

## Overview

The Swiss National Bank (SNB) data portal at data.snb.ch publishes macroeconomic and monetary statistics
under the Swiss OGD open license. The REST API serves cube-based time series in JSON format.

**Key discovery:** The API uses lowercase cube IDs discovered from the sitemap (not from SPA navigation).
All paths under /api/cube/{cubeId}/data/{format}/{lang} respond with JSON. The frontend is an Angular SPA;
the actual REST backend uses relative paths. Cube names like `devkum`, `snbgwdzid`, `zirepo`, `snbmonagg`
were confirmed from the sitemap and tested live.

## API Analysis

### Endpoint Pattern

```
GET https://data.snb.ch/api/cube/{cubeId}/data/json/en
```

Returns:
```json
{
  "timeseries": [
    {
      "header": [{"dim": "Currency", "dimItem": "EUR 1"}],
      "metadata": {"key": "EPB@SNB.devkum{M0,EUR1}", "frequency": "P1M", "unit": "Rates at 11 am. in CHF"},
      "values": [{"date": "2026-03", "value": 0.90912}, ...]
    }
  ]
}
```

### Cubes Used

| Cube ID | Description | Raw Size | Timeseries |
|---------|-------------|----------|------------|
| `devkum` | CHF FX rates (monthly avg + end-of-month) | ~865 KB | 54 |
| `snbgwdzid` | SNB policy rate, SARON fixing, sight deposits | ~630 KB | 7 |
| `zirepo` | SARON overnight and compound rates | ~2.1 MB | 9 |
| `snbmonagg` | Monetary aggregates M0–M3 | ~316 KB | 16 |

All cubes return full historical series. Adapter slices to last N observations.

### Important Technical Notes

- **No date filtering support** — The API does not support `?startDate=` or similar params
- **maxResponseBytes override** — Set to 3 MB in adapter to handle raw `zirepo` (2.1 MB)
- **Cube IDs are lowercase** — `devkum` not `DEVKUM`; confirmed from `https://data.snb.ch/sitemap`
- **POST endpoints blocked** — The `json/table/*` POST endpoints are WAF-blocked from non-browser clients
- **Cube ID discovery** — Found via sitemap XML (`/topics/{category}/cube/{cubeId}` URL patterns)

## Tool Mapping

| Tool ID | MCP Name | Cube | Description | Price |
|---------|----------|------|-------------|-------|
| `swissnbm.fx_rates` | `swissnbm.fx.rates` | `devkum` | CHF exchange rates for 27 currencies | $0.002 |
| `swissnbm.policy_rate` | `swissnbm.rates.policy` | `snbgwdzid` | SNB policy rate + sight deposit rates | $0.001 |
| `swissnbm.saron_rates` | `swissnbm.rates.saron` | `zirepo` | SARON overnight + 1M/3M/6M compound rates | $0.001 |
| `swissnbm.monetary_aggregates` | `swissnbm.money.aggregates` | `snbmonagg` | M1, M2, M3 monetary aggregates | $0.002 |

## Input Schemas

### swissnbm.fx_rates
```json
{
  "period": "monthly_avg|end_of_month (default: monthly_avg)",
  "limit": "integer 1–120 (default: 24 months)"
}
```

### swissnbm.policy_rate
```json
{
  "limit": "integer 1–365 (default: 90 days)"
}
```

### swissnbm.saron_rates
```json
{
  "limit": "integer 1–365 (default: 90 days)"
}
```

### swissnbm.monetary_aggregates
```json
{
  "level_type": "level|change (default: level)",
  "limit": "integer 1–120 (default: 24 months)"
}
```

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/swissnbm/index.ts` | Main adapter with 4 tool parsers |
| `src/adapters/swissnbm/types.ts` | TypeScript types for SNB API response |
| `src/schemas/swissnbm.schema.ts` | Zod input schemas |
| `src/schemas/index.ts` | Schema registry (swissnbmSchemas spread) |
| `src/adapters/registry.ts` | Adapter registry (case 'swissnbm') |
| `src/mcp/tool-definitions.ts` | 4 tool definitions with mcpName/category |
| `config/tool_provider_config.yaml` | 4 tool pricing entries |
| `src/config/provider-limits.json` | Dashboard entry (unlimited, no auth) |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| swissnbm.fx_rates | $0 (open data) | $0.002 | ~100% |
| swissnbm.policy_rate | $0 (open data) | $0.001 | ~100% |
| swissnbm.saron_rates | $0 (open data) | $0.001 | ~100% |
| swissnbm.monetary_aggregates | $0 (open data) | $0.002 | ~100% |

Higher price ($0.002) for `fx_rates` and `monetary_aggregates` because they involve larger data payloads
requiring more processing. `policy_rate` and `saron_rates` are simpler focused series.

## Live Data Examples (as of 2026-06-30)

- EUR/CHF: 0.915 (monthly avg, May 2026)
- SNB policy rate: 0.0%
- SARON overnight: ~-0.04%
- Swiss M3 money supply: CHF 1,228,273 million

## Rate Limits

None documented. Swiss OGD public data — free and unlimited.
