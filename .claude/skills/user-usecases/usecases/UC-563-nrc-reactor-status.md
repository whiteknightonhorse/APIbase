# UC-563 — NRC Power Reactor Status

## Meta

| Field | Value |
|-------|-------|
| UC ID | UC-563 |
| Provider | US Nuclear Regulatory Commission (NRC) |
| Category | Energy / Nuclear Grid Monitoring |
| Date | 2026-07-02 |
| Status | LIVE |
| Tools | 4 |
| Auth | None (US Government public domain — Atomic Energy Act) |
| Upstream cost | $0 |
| Our price | $0.002–$0.003/call |
| Margin | 100% |

## Provider Overview

The US Nuclear Regulatory Commission (NRC) publishes daily power output reports for all ~95 licensed commercial nuclear reactor units in the United States. Data is released each business day (M–F) in a pipe-delimited text format covering the previous day's capacity level.

- **Data file (365-day rolling):** `https://www.nrc.gov/reading-rm/doc-collections/event-status/reactor-status/PowerReactorStatusForLast365Days.txt`
- **Annual archives:** `https://www.nrc.gov/reading-rm/doc-collections/event-status/reactor-status/{YEAR}/{YEAR}PowerStatus.txt`
- **Format:** `ReportDt|Unit|Power` — pipe-delimited text, `Power` = integer 0–100 (% of licensed thermal power)
- **Coverage:** ~95 reactor units at ~58 nuclear power plants, data back to 1999
- **License:** US Government public domain (Atomic Energy Act / 10 CFR)

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `PowerReactorStatusForLast365Days.txt` | 365-day rolling daily power output (~34K rows, 1.3MB) |
| `{YEAR}/{YEAR}PowerStatus.txt` | Annual historical archive (~17K–35K rows, 650KB–1.3MB) |

No authentication, no rate limits documented. US Gov open data.

## Tool Mapping

| Tool ID | MCP Name | Title | Price | Cache TTL |
|---------|----------|-------|-------|-----------|
| `nrc.current_status` | `nrc.reactor.current_status` | NRC — US Nuclear Reactor Current Status | $0.002 | 3600s |
| `nrc.reactor_history` | `nrc.reactor.history` | NRC — Nuclear Reactor Power History | $0.002 | 3600s |
| `nrc.outages` | `nrc.reactor.outages` | NRC — Nuclear Reactor Outages & Reduced Power | $0.002 | 3600s |
| `nrc.annual_data` | `nrc.reactor.annual_data` | NRC — Nuclear Reactor Annual Historical Status | $0.003 | 86400s |

## Tool Descriptions

### `nrc.current_status`
Returns latest daily power output for all ~95 US reactor units. Fleet summary (total, at_full_power, reduced_power, shutdown counts) plus per-reactor status (power_pct, status label, date).

**Input:** `sort_by` (optional: "name" | "power_asc" | "power_desc")

### `nrc.reactor_history`
Returns up to 365 days of daily power output history for a named reactor unit.

**Input:** `unit` (required, e.g. "Diablo Canyon 1"), `days` (optional, 1–365, default 30)

### `nrc.outages`
Returns reactors currently below a power threshold (default max_power=99 = all not at 100%).

**Input:** `max_power` (optional, 0–100, default 99)

### `nrc.annual_data`
Returns historical annual data for a specific year (1999–current). Optional unit filter. Paginated via `limit` (max 1000).

**Input:** `year` (optional, 1999–2026), `unit` (optional filter), `limit` (optional, 1–1000, default 200)

## Input Schemas

### `nrc.current_status`
```json
{
  "sort_by": { "type": "string", "enum": ["name", "power_asc", "power_desc"] }
}
```

### `nrc.reactor_history`
```json
{
  "unit": { "type": "string", "minLength": 1 },
  "days": { "type": "integer", "minimum": 1, "maximum": 365 }
}
```

### `nrc.outages`
```json
{
  "max_power": { "type": "integer", "minimum": 0, "maximum": 100 }
}
```

### `nrc.annual_data`
```json
{
  "year": { "type": "integer", "minimum": 1999, "maximum": 2030 },
  "unit": { "type": "string" },
  "limit": { "type": "integer", "minimum": 1, "maximum": 1000 }
}
```

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/nrc/types.ts` | TypeScript response type interfaces |
| `src/adapters/nrc/index.ts` | Main adapter — overrides call() for text/plain parsing |
| `src/schemas/nrc.schema.ts` | Zod input validation schemas |
| `src/adapters/registry.ts` | Registry case `'nrc'` |
| `src/schemas/index.ts` | Schema spread |
| `src/mcp/tool-definitions.ts` | 4 tool definitions |
| `config/tool_provider_config.yaml` | Pricing and cache TTL config |
| `src/config/provider-limits.json` | Dashboard config entry |
| `scripts/test-nrc.sh` | Smoke test script |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| `nrc.current_status` | $0 | $0.002 | 100% |
| `nrc.reactor_history` | $0 | $0.002 | 100% |
| `nrc.outages` | $0 | $0.002 | 100% |
| `nrc.annual_data` | $0 | $0.003 | 100% |

All tools fetch from free US Government public-domain files. Price set at $0.002–$0.003 to reflect:
- Upstream file size (1.3MB 365-day file, 650KB annual files)
- Server-side parsing cost (34K rows parsed per call for most tools)
- Small premium for annual data which covers more data and has a 86400s cache TTL

## Notes

- Adapter overrides `call()` (same pattern as CACTUS adapter) because upstream returns `text/plain` pipe-delimited, not JSON
- The `sort_by` parameter on `current_status` is client-side sorting (post-parse)
- The `reactor_history` tool uses case-insensitive unit name matching
- `annual_data` redirects follow automatically — NRC sometimes uses case variations in URLs
- Data for the current year may be incomplete (file grows throughout the year)
- NRC reports are released ~8am ET each business day; weekend/holiday gaps are normal
