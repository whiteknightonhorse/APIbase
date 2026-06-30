# UC-548 — UN-Habitat Urban Indicators Database

## Meta

| Field | Value |
|-------|-------|
| ID | UC-548 |
| Provider | UN-Habitat (United Nations Human Settlements Programme) |
| Category | world |
| Date Added | 2026-06-30 |
| Status | LIVE |
| Tools | 4 |
| Auth | None (public ArcGIS Feature Services) |
| Upstream Cost | $0 |
| Price Range | $0.001–$0.002/call |

## Provider Overview

UN-Habitat (United Nations Human Settlements Programme) is the UN agency responsible for sustainable urban development. Their Urban Indicators Database tracks SDG Goal 11 (Sustainable Cities and Communities) indicators at the city level through ArcGIS Feature Services publicly hosted at services6.arcgis.com.

The data portal is at https://data.unhabitat.org/ (ArcGIS Hub site, orgId: uWtJiVzcBsV6C7NV).

## API Endpoints

| Service | Endpoint | Records |
|---------|----------|---------|
| SDG 11.2.1 Transport | `services6.arcgis.com/uWtJiVzcBsV6C7NV/arcgis/rest/services/11_2_1_Percentage_Access_to_Public_Transport/FeatureServer/0/query` | 1,555 |
| SDG 11.3.1 Land Use | `services6.arcgis.com/uWtJiVzcBsV6C7NV/arcgis/rest/services/11_3_1_Land_Consumption_Rates_1990_2000_and_2015/FeatureServer/0/query` | 581 |
| SDG 11.7.1 Open Spaces | `services6.arcgis.com/uWtJiVzcBsV6C7NV/arcgis/rest/services/11_7_1_provision_and_access_to_open_spaces_in_cities_2020/FeatureServer/0/query` | 621 |
| Global Municipal DB | `services6.arcgis.com/uWtJiVzcBsV6C7NV/arcgis/rest/services/Global_Municipal_Database/FeatureServer/0/query` | 1,207 |

**Auth:** None. All services are public ArcGIS Feature Services.

**Query parameters:**
- `where` — SQL-like WHERE clause (e.g. `Country='Kenya'`)
- `outFields=*` — return all fields
- `f=json` — JSON format
- `resultRecordCount` — max records

## Tool Mapping

| Tool ID | MCP Name | Description | Price |
|---------|----------|-------------|-------|
| `unhabitat.transport_access` | `unhabitat.urban.transport_access` | SDG 11.2.1: % population with public transport access (1,555 cities) | $0.001 |
| `unhabitat.land_consumption` | `unhabitat.urban.land_consumption` | SDG 11.3.1: Land consumption vs population growth rate (581 cities) | $0.001 |
| `unhabitat.open_spaces` | `unhabitat.urban.open_spaces` | SDG 11.7.1: Urban open public space share (621 cities, 2020) | $0.001 |
| `unhabitat.city_budget` | `unhabitat.urban.city_budget` | Global Municipal Database: city budget & expenditure breakdown (1,207 cities) | $0.002 |

## Input Schemas

All tools share the same filter schema:

```typescript
{
  country?: string  // partial match, case-insensitive (e.g. "Kenya", "United States")
  city?:    string  // partial match (e.g. "Nairobi", "Lagos")
  region?:  string  // UN-Habitat region partial match
  limit?:   number  // 1–100, default 50
}
```

UN-Habitat regions: `Sub-Saharan Africa`, `Northern America and Europe`, `Eastern and South-Eastern Asia`, `Central and Southern Asia`, `Latin America and the Caribbean`, `Northern Africa and Western Asia`, `Oceania`.

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/unhabitat/types.ts` | TypeScript interfaces for ArcGIS Feature Service responses |
| `src/adapters/unhabitat/index.ts` | UnhabitatAdapter: builds ArcGIS queries, parses responses |
| `src/schemas/unhabitat.schema.ts` | Zod validation schemas for all 4 tools |
| `src/adapters/registry.ts` | `case 'unhabitat'` → UnhabitatAdapter |
| `src/schemas/index.ts` | `...unhabitatSchemas` spread |
| `src/mcp/tool-definitions.ts` | 4 tool definitions with mcpName/title/description/category |
| `config/tool_provider_config.yaml` | Tool pricing and cache TTL (86400s) |
| `src/config/provider-limits.json` | Dashboard config: unlimited, no auth |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| `unhabitat.transport_access` | $0 | $0.001 | 100% |
| `unhabitat.land_consumption` | $0 | $0.001 | 100% |
| `unhabitat.open_spaces` | $0 | $0.001 | 100% |
| `unhabitat.city_budget` | $0 | $0.002 | 100% |

City budget data is priced at $0.002 (vs $0.001 for SDG indicators) because the dataset is more complex (30+ fields, expenditure breakdowns) and more valuable for researchers and policy analysts.

## Notes

- The candidate line referenced `https://unhabitat.org/api` which is a Drupal CMS (404 for API). The actual data API is the ArcGIS Feature Services at services6.arcgis.com.
- 163 total ArcGIS Feature Services exist in the UN-Habitat org; we integrate the 4 most structured and universally useful city-level statistical datasets.
- Cache TTL is 86400s (24h) — UN-Habitat releases new data annually; caching is safe and reduces unnecessary upstream calls.
- The ArcGIS SQL `LIKE` clause with `%` wildcard is used for partial country/city matching.
