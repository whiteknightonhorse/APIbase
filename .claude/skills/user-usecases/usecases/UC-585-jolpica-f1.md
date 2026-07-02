# UC-585 — Jolpica F1 (Formula 1 Racing Data)

## Meta

| Field | Value |
|-------|-------|
| **UC ID** | UC-585 |
| **Provider** | Jolpica F1 (Ergast-compatible API) |
| **Category** | Entertainment / Sports |
| **Status** | LIVE |
| **Date** | 2026-07-02 |
| **Tools** | 4 |
| **Auth** | None (public, open access) |
| **Upstream Cost** | $0 |
| **Our Price** | $0.001/call |
| **Margin** | ~100% |

## Provider Overview

Jolpica F1 is an open, Ergast-compatible REST API providing comprehensive Formula 1 racing data
from 1950 to the present. It requires no authentication and has no documented rate limits.
Data includes race calendars, results, driver standings, and constructor standings across
all F1 seasons.

**API Base URL:** `https://api.jolpi.ca/ergast/f1/`
**Documentation:** https://api.jolpi.ca/

## Endpoints Used

| Endpoint | Tool | Cache TTL |
|----------|------|-----------|
| `GET /ergast/f1/{season}.json` | f1.races.schedule | 3600s |
| `GET /ergast/f1/{season}/{round}/results.json` | f1.races.results | 300s |
| `GET /ergast/f1/{season}/driverstandings.json` | f1.standings.drivers | 300s |
| `GET /ergast/f1/{season}/constructorstandings.json` | f1.standings.constructors | 300s |

## Tool Mapping

| Tool ID | MCP Name | Description |
|---------|----------|-------------|
| `f1.races.schedule` | `f1.races.schedule` | Race calendar (circuits, dates, qualifying/sprint times) |
| `f1.races.results` | `f1.races.results` | Race finishing order with points, status, fastest lap |
| `f1.standings.drivers` | `f1.standings.drivers` | World Drivers Championship standings by points |
| `f1.standings.constructors` | `f1.standings.constructors` | World Constructors Championship standings by points |

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/jolpica-f1/types.ts` | Raw API response TypeScript types |
| `src/adapters/jolpica-f1/index.ts` | JolpicaF1Adapter class (no auth) |
| `src/schemas/jolpica-f1.schema.ts` | Zod validation schemas |
| `src/adapters/registry.ts` | `case 'f1':` → JolpicaF1Adapter |
| `src/schemas/index.ts` | jolpicaF1Schemas spread |
| `src/mcp/tool-definitions.ts` | 4 tool entries |
| `config/tool_provider_config.yaml` | Pricing and cache TTLs |
| `src/config/provider-limits.json` | Dashboard config (unlimited, no auth) |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| f1.races.schedule | $0 | $0.001 | ~100% |
| f1.races.results | $0 | $0.001 | ~100% |
| f1.standings.drivers | $0 | $0.001 | ~100% |
| f1.standings.constructors | $0 | $0.001 | ~100% |

Free upstream → $0.001 per call covers infrastructure cost and maintains standard platform pricing
for low-cost/high-value data tools.

## Notes

- `season` parameter defaults to `current` when omitted (current calendar year)
- `round` in `f1.races.results` defaults to `last` (most recently completed race)
- Cache TTL for schedule is 3600s (race calendars change rarely)
- Cache TTL for results/standings is 300s (updated after each race weekend)
- Historical data available from 1950 (constructors from 1958)
- No ToS restrictions on commercial use; Jolpica explicitly provides a public open API
