# UC-564: BTS Transportation Statistics

## Meta

| Field | Value |
|-------|-------|
| UC ID | UC-564 |
| Provider | Bureau of Transportation Statistics (BTS) |
| Category | World / US Transportation Data |
| Date Added | 2026-07-02 |
| Status | LIVE |
| Auth | No auth — US Government open data (Socrata API) |
| Tools | 4 |
| Price Range | $0.001/call |
| Upstream Cost | $0 |
| Margin | ~100% |

## Provider Overview

The Bureau of Transportation Statistics (BTS) is part of the US Department of Transportation.
It publishes transportation data via a Socrata API at `data.bts.gov`. All data is US Government
public domain with no API key required and no documented rate limits.

Datasets used:
- `keg4-3bc2` — Border Crossing Entry Data (monthly, 594 ports)
- `bw6n-ddqk` — Transportation Services Index (monthly, 2000–present)
- `y5ut-ibwt` — Supply Chain and Freight Indicators (weekly/monthly, 2019–present)
- `r495-tyji` — T100 Segment Summary By Origin Airport (quarterly/annual)

## API Access

- Base URL: `https://data.bts.gov/resource/{dataset_id}.json`
- Auth: None
- Protocol: Socrata SoQL (URLSearchParams with `$where`, `$select`, `$order`, `$limit`)
- Both `$` and `%24` parameter prefix forms accepted

## Tools

| Tool ID | mcpName | Description | Price | Cache TTL |
|---------|---------|-------------|-------|-----------|
| `bts.border_crossings` | `bts.borders.crossings` | Monthly US border crossing stats by port, type, border | $0.001 | 86400s |
| `bts.tsi` | `bts.transport.tsi` | Transportation Services Index (total/freight/passenger) | $0.001 | 86400s |
| `bts.freight_indicators` | `bts.freight.indicators` | Supply chain & freight performance indicators | $0.001 | 3600s |
| `bts.aviation_traffic` | `bts.aviation.traffic` | T100 airline traffic by origin airport | $0.001 | 86400s |

## Input Schemas

### bts.border_crossings
```json
{
  "border": "US-Canada Border | US-Mexico Border",
  "measure": "Buses | Bus Passengers | Pedestrians | Personal Vehicle Passengers | Personal Vehicles | Train Passengers | Trains | Trucks",
  "port_name": "string (partial match)",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "limit": "integer 1-500 (default 20)"
}
```

### bts.tsi
```json
{
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "limit": "integer 1-300 (default 12)"
}
```

### bts.freight_indicators
```json
{
  "indicator": "string (partial match, e.g. 'Containerized Imports', 'Railroad', 'Truck Speed')",
  "year": "integer (e.g. 2024)",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "limit": "integer 1-500 (default 20)"
}
```

### bts.aviation_traffic
```json
{
  "airport_code": "IATA 3-letter code (e.g. ATL, JFK, LAX)",
  "year": "string (e.g. '2025' or '2026M1-3')",
  "limit": "integer 1-500 (default 20)"
}
```

## Implementation Files

- `src/adapters/bts-transport/types.ts` — TypeScript interfaces for all 4 datasets
- `src/adapters/bts-transport/index.ts` — BtsTransportAdapter (extends BaseAdapter)
- `src/schemas/bts-transport.schema.ts` — Zod schemas for all 4 tools
- `src/adapters/registry.ts` — case `'bts'` / `'bts-transport'`
- `src/schemas/index.ts` — spread `btsTransportSchemas`
- `src/mcp/tool-definitions.ts` — 4 tool definitions (mcpName + title + description + category + annotations)
- `config/tool_provider_config.yaml` — 4 entries under `bts-transport` provider
- `src/config/provider-limits.json` — `bts-transport` dashboard entry

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| bts.border_crossings | $0 (US Gov open data) | $0.001 | ~100% |
| bts.tsi | $0 (US Gov open data) | $0.001 | ~100% |
| bts.freight_indicators | $0 (US Gov open data) | $0.001 | ~100% |
| bts.aviation_traffic | $0 (US Gov open data) | $0.001 | ~100% |

Minimum viable price of $0.001/call applied (free/open upstream → 100% margin standard for US Gov APIs).

## Notes

- Socrata SoQL `$where` conditions support `=`, `like`, `upper()`, date comparisons
- The freight indicators dataset has 30+ distinct indicator series covering supply chain, ports, rail, trucking
- Aviation T100 data covers quarters as "YYYYMn-n" (e.g. "2026M1-3" for Q1 2026)
- Border crossing data covers 594+ land ports with monthly counts since early 1990s
- TSI base year is 2000=100 — values above 100 indicate growth from 2000 baseline
