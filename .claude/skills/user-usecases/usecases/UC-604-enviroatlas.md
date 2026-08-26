# UC-604 — EPA EnviroAtlas (Community Ecosystem-Service Metrics)

## Meta

| Field | Value |
|-------|-------|
| ID | UC-604 |
| Provider | EPA EnviroAtlas (enviroatlas.epa.gov) |
| Category | environment |
| Date | 2026-08-26 |
| Status | LIVE |
| Tools | 3 |
| Auth | None (US Gov open data, public ArcGIS REST) |
| License | US Government public domain |

## Overview

EnviroAtlas is EPA's community-scale ecosystem-service and environmental-health mapping
platform, published as public ArcGIS REST services at `enviroatlas.epa.gov`. Coverage is
limited to 32 EPA pilot communities at block-group resolution (e.g. Des Moines IA, Chicago IL,
Washington DC) — it is not a nationwide dataset.

`communities` lists the 32 covered pilot communities with their code, name, and block-group
count. `block_group_metrics` runs a point-in-polygon query against a lat/lon and returns the
full set of ecosystem-service and environmental-health metrics for the enclosing census block
group (tree cover, impervious surface, carbon storage/sequestration, air-pollutant removal,
temperature reduction, flood-risk population, park proximity, stormwater/runoff reduction).
`community_summary` runs an ArcGIS `outStatistics` aggregation across all block groups in a
named community to produce community-wide averages/sums (avg tree cover, avg impervious %,
total population, total carbon stored, avg flood-risk population %).

## API Endpoints Verified

| Endpoint | Method | Description |
|----------|--------|-------------|
| `https://enviroatlas.epa.gov/arcgis/rest/services/Communities/Community_Locations/MapServer/0/query` | GET | List the 32 EnviroAtlas pilot communities |
| `https://enviroatlas.epa.gov/arcgis/rest/services/Communities/Community_BGmetrics/MapServer/2/query` | GET (point-in-polygon geometry) | Block-group ecosystem-service metrics at a coordinate |
| `https://enviroatlas.epa.gov/arcgis/rest/services/Communities/Community_BGmetrics/MapServer/2/query` | GET (outStatistics) | Community-wide aggregate statistics |

## Tool Mapping

| Tool ID | MCP Name | Endpoint | Price | TTL | Description |
|---------|----------|----------|-------|-----|-------------|
| `enviroatlas.communities` | `enviroatlas.communities.list` | GET Community_Locations/0/query | $0.001 | 604800s | List/filter the 32 EPA pilot communities |
| `enviroatlas.block_group_metrics` | `enviroatlas.metrics.block_group` | GET Community_BGmetrics/2/query (point-in-polygon) | $0.001 | 86400s | Ecosystem-service metrics for the block group at a lat/lon |
| `enviroatlas.community_summary` | `enviroatlas.metrics.community_summary` | GET Community_BGmetrics/2/query (outStatistics) | $0.001 | 86400s | Community-wide aggregate ecosystem-service stats |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| enviroatlas.communities | $0 (open data) | $0.001 | ~100% |
| enviroatlas.block_group_metrics | $0 (open data) | $0.001 | ~100% |
| enviroatlas.community_summary | $0 (open data) | $0.001 | ~100% |

No-auth US Gov public database — pricing covers infrastructure and pipeline cost only.
`communities` uses a 7-day TTL since the 32-community pilot dataset is a completed EPA project
(no updates since 2018 publication). `block_group_metrics` and `community_summary` use a 24-hour
TTL for the same reason — the underlying ecosystem-service dataset is static.

## Input Schemas

### enviroatlas.communities
```json
{
  "query": "string (optional) — filter the 32 pilot communities by name or state substring, case-insensitive (e.g. 'TX' or 'Portland'). Omit to list all of them."
}
```

### enviroatlas.block_group_metrics
```json
{
  "lat": "number (required, -90 to 90) — latitude in decimal degrees (e.g. 41.5868 for Des Moines, IA)",
  "lon": "number (required, -180 to 180) — longitude in decimal degrees (e.g. -93.6091 for Des Moines, IA)"
}
```

### enviroatlas.community_summary
```json
{
  "community": "string (required, min 1 char) — EnviroAtlas pilot community code (e.g. 'DMIA') or name (e.g. 'Des Moines, IA'). Call enviroatlas.communities first to see all 32 covered communities."
}
```

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/enviroatlas/index.ts` | Main adapter class (`EnviroatlasAdapter`) — builds ArcGIS REST queries, resolves community name/code, flattens metric fields |
| `src/adapters/enviroatlas/types.ts` | TypeScript interfaces for ArcGIS REST response shapes |
| `src/schemas/enviroatlas.schema.ts` | Zod input schemas (`enviroatlasSchemas`) |
| `src/adapters/registry.ts` | Case `'enviroatlas'` → `EnviroatlasAdapter` |
| `src/schemas/index.ts` | Schema registry import (`enviroatlasSchemas`) |
| `src/mcp/tool-definitions.ts` | 3 tool definitions (lines ~13817-13849) |
| `config/tool_provider_config.yaml` | Price and TTL per tool (lines ~7032-7048) |

## Notes

- The adapter embeds a static 32-community code/name table (`PILOT_COMMUNITIES`) solely to
  resolve a human-supplied community name or code into the exact `CommST` value the upstream
  ArcGIS service expects — all response data returned to callers is always fetched live from
  upstream, never served from this table.
- `block_group_metrics` uses ArcGIS point-in-polygon geometry query
  (`geometryType=esriGeometryPoint`, `spatialRel=esriSpatialRelIntersects`); when the coordinate
  falls outside all 32 pilot communities, the adapter returns `{covered: false, message: ...}`
  instead of an error.
- `community_summary` uses ArcGIS `outStatistics` server-side aggregation (avg/sum/count) across
  all block groups matching `CommST='<code>'`, rather than fetching every block group and
  aggregating client-side.
- Onboarded 2026-08-25/26 (commit `8c5f6ae`); this UC doc was backfilled in a non-sandboxed pass
  after the sandboxed onboarding step could not get write approval for `.claude/` in headless
  mode — the same structural gap already logged for
  `ine`/`unpaywall`/`open-beauty-facts`/`ine-chile`/`indec-georef`.
