# UC-582 — CBS Netherlands (Statistics Netherlands)

## Meta

| Field | Value |
|-------|-------|
| UC ID | UC-582 |
| Provider | CBS Netherlands (Centraal Bureau voor de Statistiek) |
| Category | world |
| Date Added | 2026-07-02 |
| Status | LIVE |
| Tools | 4 |

## Overview

CBS is the national statistical office of the Netherlands. The CBS Open Data StatLine API
provides free, unlimited access to 5900+ statistical datasets covering population, economy,
labor market, health, education, environment, and more via OData v3.

No API key required. CC BY 4.0 license.

## API Details

| Property | Value |
|----------|-------|
| Base URL | https://opendata.cbs.nl |
| Auth | None |
| Catalog Endpoint | `/ODataCatalog/Tables` |
| Data Endpoint | `/ODataApi/OData/{id}/TypedDataSet` |
| Protocol | OData v3 ($filter, $top, $skip, $select, $orderby) |
| License | CC BY 4.0 |
| Rate Limits | None documented |

## Tool Mapping

| Tool ID | MCP Name | Description | Price | Cache TTL |
|---------|----------|-------------|-------|-----------|
| cbs.catalog_search | cbs.catalog.search | Search CBS statistical table catalog (5900+ datasets) | $0.001 | 3600s |
| cbs.table_info | cbs.table.info | Get metadata for a specific CBS table | $0.001 | 3600s |
| cbs.table_properties | cbs.table.properties | Get column schema for a CBS table | $0.001 | 3600s |
| cbs.table_data | cbs.table.data | Query data from a CBS table with OData filters | $0.002 | 3600s |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| cbs.catalog_search | $0.00 | $0.001 | ~100% |
| cbs.table_info | $0.00 | $0.001 | ~100% |
| cbs.table_properties | $0.00 | $0.001 | ~100% |
| cbs.table_data | $0.00 | $0.002 | ~100% |

Data queries are priced at $0.002 (vs $0.001 for metadata) to reflect higher compute and
bandwidth usage (dataset rows can be large). All pricing in the $0.001–$0.005 range per spec.

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/cbs-netherlands/index.ts` | Main adapter class |
| `src/adapters/cbs-netherlands/types.ts` | TypeScript interfaces |
| `src/schemas/cbs-netherlands.schema.ts` | Zod schemas with `.describe()` |
| `src/adapters/registry.ts` | Added `case 'cbs':` |
| `src/schemas/index.ts` | Added cbsNetherlandsSchemas spread |
| `src/mcp/tool-definitions.ts` | Added 4 tool definitions |
| `config/tool_provider_config.yaml` | Added 4 tool entries |
| `src/config/provider-limits.json` | Added dashboard config |

## Key API Patterns

**Catalog search with keyword:**
```
GET /ODataCatalog/Tables?$filter=substringof('population',tolower(Title))&$top=10
```

**Table metadata:**
```
GET /ODataApi/OData/37556/TableInfos?$format=json
```

**Column schema:**
```
GET /ODataApi/OData/37556/DataProperties?$format=json&$orderby=Position
```

**Typed data with OData filter:**
```
GET /ODataApi/OData/37556/TypedDataSet?$filter=Perioden eq '2018JJ00'&$top=10
```

Annual period codes: `YYYY + JJ00` (e.g. 2023JJ00)
National total region: `RegioS eq 'NL00  '` (note trailing spaces in codes)
