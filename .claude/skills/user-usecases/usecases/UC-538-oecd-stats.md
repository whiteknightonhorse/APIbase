# UC-538: OECD Statistics (oecd-stats)

## Meta

| Field | Value |
|-------|-------|
| UC ID | UC-538 |
| Provider | OECD Statistics |
| API Base | https://sdmx.oecd.org/public/rest/data |
| Category | Economics / Finance / Environment |
| Date | 2026-06-30 |
| Status | LIVE |
| Auth | None (CC BY 4.0, public access) |
| Upstream Cost | $0 |

## Provider Overview

The OECD SDMX REST API provides access to 16,000+ statistical time series across economics,
education, health, environment, and social policy for 38 OECD member countries. Data is sourced
from official national statistics offices and harmonised to international standards (SNA 2008,
ILO, IPCC). The API follows the SDMX 2.1 standard with JSON-data format responses.

Base URL: `https://sdmx.oecd.org/public/rest/data`
Data format: SDMX-JSON 2.0 (`?format=jsondata`)
Licence: CC BY 4.0, commercial use permitted, unlimited access, no registration required.

## Key Agencies and Dataflows Used

| Tool | Agency | Dataflow ID | Description |
|------|--------|-------------|-------------|
| gdp | OECD.SDD.NAD | DSD_NAMAIN10@DF_TABLE1,2.0 | National Accounts Main Aggregates |
| unemployment | OECD.SDD.TPS | DSD_LFS@DF_IALFS_UNE_M,1.0 | Labour Force Survey — monthly unemployment |
| inflation | OECD.SDD.TPS | DSD_PRICES@DF_PRICES_ALL,1.0 | Consumer Price Indices, COICOP 1999 |
| emissions | OECD.ENV.EPI | DSD_AIR_GHG@DF_AIR_GHG,1.0 | Greenhouse Gas Emissions |
| trade | OECD.SDD.TPS | DSD_BOP@DF_BOP,1.0 | Balance of Payments |

## SDMX Response Parsing

The OECD SDMX-JSON 2.0 response uses a series-based layout:
- `data.structures[0].dimensions.series` — list of dimensions for series key
- `data.structures[0].dimensions.observation` — observation dimensions (TIME_PERIOD)
- `data.dataSets[0].series` — keyed by "idx0:idx1:..." → `{observations: {"timeIdx": [value, ...]}}`

The adapter decodes colon-separated indices into human-readable dimension labels and
filters to the most relevant series per tool (e.g., GDP filters to B1G* transactions at USD_EXC).

All-wildcard key pattern (`A.USA.............`) is used for the country and all other
dimensions, then server-side filtering narrows to the most relevant series.

## Tool Mapping

| Tool ID | MCP Name | Price | TTL | Description |
|---------|----------|-------|-----|-------------|
| oecd.economy.gdp | oecd.economy.gdp | $0.002 | 86400s | Annual GDP at USD exchange rates |
| oecd.economy.unemployment | oecd.economy.unemployment | $0.002 | 3600s | Monthly unemployment rate (LFS) |
| oecd.economy.inflation | oecd.economy.inflation | $0.002 | 3600s | CPI all-items year-on-year % change |
| oecd.environment.emissions | oecd.environment.emissions | $0.002 | 86400s | GHG emissions by gas/sector |
| oecd.economy.trade | oecd.economy.trade | $0.002 | 86400s | Balance of Payments current account |

## Input Schemas

All tools accept:
- `country` (string, 3-char ISO): OECD member country code (USA, GBR, DEU, FRA, JPN, etc.)
- `start_period` (string, optional): YYYY for annual; YYYY-MM for monthly
- `end_period` (string, optional): YYYY for annual; YYYY-MM for monthly
- `max_series` (integer 1-100, optional): max series to return (default 20)

## Output Format

```json
{
  "dataset": "Annual GDP and National Accounts (OECD NAMAIN10)",
  "country": "USA",
  "start_period": "2021",
  "end_period": "2022",
  "series": [
    {
      "dimensions": {
        "FREQ": "A", "REF_AREA": "USA", "TRANSACTION": "B1GXP119",
        "UNIT_MEASURE": "USD_EXC", "PRICE_BASE": "VQ"
      },
      "observations": [
        {"period": "2021", "value": 22861690},
        {"period": "2022", "value": 25082300}
      ]
    }
  ],
  "total_series": 12,
  "returned_series": 12
}
```

## Implementation Files

- `src/adapters/oecd-stats/index.ts` — main adapter
- `src/adapters/oecd-stats/types.ts` — TypeScript types
- `src/schemas/oecd-stats.schema.ts` — Zod input schemas
- `src/adapters/registry.ts` — registered as `case 'oecd-stats'`
- `src/schemas/index.ts` — `...oecdStatsSchemas` spread
- `src/mcp/tool-definitions.ts` — 5 tool definitions
- `config/tool_provider_config.yaml` — pricing + TTL config
- `src/config/provider-limits.json` — dashboard config

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| oecd.economy.gdp | $0 (free, CC BY 4.0) | $0.002 | ~100% |
| oecd.economy.unemployment | $0 (free, CC BY 4.0) | $0.002 | ~100% |
| oecd.economy.inflation | $0 (free, CC BY 4.0) | $0.002 | ~100% |
| oecd.environment.emissions | $0 (free, CC BY 4.0) | $0.002 | ~100% |
| oecd.economy.trade | $0 (free, CC BY 4.0) | $0.002 | ~100% |

Price set at $0.002/call — value pricing for high-quality OECD macro data that would otherwise
require institutional data subscriptions. No upstream cost so margin is 100%.

## Country Codes (OECD Members)

AUS, AUT, BEL, CAN, CHL, COL, CRI, CZE, DNK, EST, FIN, FRA, DEU, GRC, HUN, ISL, IRL, ISR, ITA,
JPN, KOR, LVA, LTU, LUX, MEX, NLD, NZL, NOR, POL, PRT, SVK, SVN, ESP, SWE, CHE, TUR, GBR, USA

## Rate Limits / ToS

No documented rate limits. CC BY 4.0 licence permits commercial use with attribution.
Attribution: "Source: OECD (2024), [dataset name], https://stats.oecd.org"
No registration or API key required.
