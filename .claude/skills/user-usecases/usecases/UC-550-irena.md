# UC-550 — IRENA IRENASTAT

## Meta

| Field        | Value                                                                   |
|-------------|-------------------------------------------------------------------------|
| ID           | UC-550                                                                  |
| Provider     | IRENA (International Renewable Energy Agency)                           |
| Category     | world / energy / climate                                                |
| Date         | 2026-06-30                                                              |
| Status       | LIVE                                                                    |
| Tools        | 4                                                                       |
| API Base     | https://pxweb.irena.org/api/v1/en/IRENASTAT/                           |
| Auth         | None (public, CORS open)                                                |
| Upstream Cost| $0                                                                      |

## Provider Overview

IRENA (International Renewable Energy Agency) is the intergovernmental organisation that supports
countries in their transition to a sustainable energy future. IRENASTAT is the official repository
of global renewable energy statistics, used by the IPCC, IEA, World Bank, and UN agencies.

The data is accessed via the PX-Web API — a statistical query protocol used by Nordic statistical
offices, Eurostat, and international organisations.

**API discovered at:** `https://pxweb.irena.org/api/v1/en/` — lists `IRENASTAT` and `RE-STAT` databases.

## Endpoints Used

| Dataset | PX-Web path | Description |
|---------|------------|-------------|
| Power Capacity → Country | `/IRENASTAT/Power Capacity and Generation/Country_ELECCAP_*` | Country-level electricity capacity (MW) |
| Power Generation → Country | `/IRENASTAT/Power Capacity and Generation/Country_ELECGEN_*` | Country-level electricity generation (GWh) |
| Power Capacity → Region | `/IRENASTAT/Power Capacity and Generation/Region_ELECCAP_*` | World region electricity capacity (MW) |
| RE Share | `/IRENASTAT/Power Capacity and Generation/RE-SHARE_*` | Renewable energy share % |

Note: Table filenames include a vintage suffix (e.g. `2026_H1`) that updates each half-year. The adapter
fetches the table listing dynamically and selects the most recent filename (cached per process lifetime).

## Discovery Issue Resolved

The candidate URL `https://resourceirena.irena.org/gateway/api` returned 404 for all paths (Microsoft HTTPAPI).
The actual IRENA public API is the PX-Web instance at `https://pxweb.irena.org/api/v1/en/`.

## Tool Mapping

| tool_id | mcpName | Description | Price |
|---------|---------|-------------|-------|
| `irena.capacity_country` | `irena.energy.capacity_country` | Country-level RE capacity (MW) by technology, 2000–2025 | $0.002 |
| `irena.generation_country` | `irena.energy.generation_country` | Country-level electricity generation (GWh), 2000–2024 | $0.002 |
| `irena.capacity_region` | `irena.energy.capacity_region` | World region RE capacity (MW) by technology, 2000–2025 | $0.001 |
| `irena.share_renewables` | `irena.energy.share_renewables` | RE share of electricity generation/capacity (%), 2000–2025 | $0.001 |

## Input Schemas

### irena.capacity_country
```json
{
  "country": "DEU",          // ISO 3-letter code (required)
  "technology": "Total renewable energy",  // see enum list
  "year_from": 2020,
  "year_to": 2025,
  "grid_connection": "OnGrid"  // OnGrid | OffGrid
}
```

### irena.generation_country
```json
{
  "country": "USA",
  "technology": "Total renewable",
  "year_from": 2020,
  "year_to": 2024,
  "grid_connection": "OnGrid"  // OnGrid | OffGrid | All
}
```

### irena.capacity_region
```json
{
  "region": "Europe",          // see enum list
  "technology": "Total renewable energy",
  "year_from": 2020,
  "year_to": 2025,
  "grid_connection": "OnGrid"
}
```

### irena.share_renewables
```json
{
  "country_or_region": "DEU",  // ISO3 code OR region name
  "indicator": "generation",    // generation | capacity
  "year_from": 2020,
  "year_to": 2025
}
```

## PX-Web Query Protocol

The PX-Web API uses index values rather than text labels for dimensions.
The adapter hardcodes the dimension→index mappings and translates user-friendly inputs automatically.

**Year indexing:** Year 2000 = index "0", Year 2025 = index "25" (linear offset from base year).

**Technology indices (capacity/country table — 26 technologies):**
- "0": Total renewable energy
- "1": Solar energy
- "2": Solar photovoltaic
- "4": Wind energy
- "5": Onshore wind energy
- "7": Renewable hydropower
- "15": Geothermal energy
- (etc.)

**Region codes:**
- GLO: World, RAF: Africa, RAS: Asia, RER: Europe, RNA: North America, RSA: South America,
  RME: Middle East, REA: Eurasia, ROC: Oceania, RCC: Central America and the Caribbean

## Implementation Files

- `src/adapters/irena/index.ts` — Main adapter (overrides `call()`, handles table discovery + 4 tools)
- `src/adapters/irena/types.ts` — TypeScript interfaces for PX-Web response and output types
- `src/schemas/irena.schema.ts` — Zod schemas (4 tools, all fields with `.describe()`)
- `src/adapters/registry.ts` — Added `case 'irena':`
- `src/schemas/index.ts` — Added irenaSchemas spread
- `src/mcp/tool-definitions.ts` — Added 4 tool definitions
- `config/tool_provider_config.yaml` — Added 4 tool entries
- `src/config/provider-limits.json` — Added irena dashboard entry

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| irena.capacity_country | $0 (public domain) | $0.002 | 100% |
| irena.generation_country | $0 (public domain) | $0.002 | 100% |
| irena.capacity_region | $0 (public domain) | $0.001 | 100% |
| irena.share_renewables | $0 (public domain) | $0.001 | 100% |

IRENA data is published under CC BY-SA 3.0 IGO license (free for commercial use with attribution).
The PX-Web API has no documented rate limits and CORS is open (Access-Control-Allow-Origin: *).
Pricing reflects dataset complexity and query processing overhead.

## Rate Limits

No documented limits. CORS open. PX-Web is the standard statistical API used by academic and
governmental institutions globally. No authentication required.

## Notes

- The generation table (Country_ELECGEN) requires a `Data Type` dimension in every query
  (only one value: "Electricity Generation (GWh)"). The adapter handles this automatically.
- Table filenames change each H1/H2 (e.g. `Country_ELECCAP_2026_H1_v-PX 1.px`). The adapter
  fetches the current table list on first call and caches the paths in memory.
- The RE-SHARE table (`Region/country/area` dimension) accepts both ISO3 country codes AND
  IRENA region codes (e.g. GLO for World, RER for Europe).
- `resourceirena.irena.org` and `api.irena.org` are blocked from Hetzner DE IP range.
  Only `pxweb.irena.org` is accessible from our server.
