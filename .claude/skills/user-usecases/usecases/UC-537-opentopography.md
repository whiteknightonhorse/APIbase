# UC-537 — OpenTopography (Global DEM Elevation + LiDAR Catalog)

## Meta

| Field | Value |
|-------|-------|
| UC ID | UC-537 |
| Provider | OpenTopography |
| Category | Science / Terrain / Elevation |
| Date | 2026-06-29 |
| Status | LIVE |
| Auth | API key (free registration, 5K req/day) |
| Cost | $0 upstream (CC BY 4.0) |
| Tools | 4 |

## Provider Overview

OpenTopography (portal.opentopography.org) is an NSF-funded geoscience data facility providing:

1. **Global DEM access** — SRTM, Copernicus, NASADEM, ALOS, GEBCO and more via `/API/globaldem`
2. **LiDAR point cloud catalog** — USGS 3DEP and research datasets via `/API/otCatalog`
3. **Raster DEM catalog** — Community-contributed high-res DEMs via `/API/otCatalog`

The main differentiation from UC-514 (OpenTopoData) is access to **high-resolution LiDAR data** (cm–m resolution) and the research dataset catalog. OpenTopoData covers JSON elevation queries; OpenTopography covers discovery and high-res data access.

## API Credentials

- URL: `https://portal.opentopography.org/API/`
- Auth: `API_Key` query parameter
- Free registration: https://portal.opentopography.org/requestApiKey
- Demo key: `demoapikeyot2022` (50 req/day limit)
- Registered key: 5,000 req/day, CC BY 4.0 license
- Env var: `PROVIDER_KEY_OPENTOPO`

## Endpoints Used

| Endpoint | Format | Use |
|----------|--------|-----|
| `GET /API/globaldem` | AAIGrid ASCII text | Point and area elevation |
| `GET /API/otCatalog?productFormat=PointCloud` | JSON | LiDAR dataset catalog |
| `GET /API/otCatalog?productFormat=Raster` | JSON | DEM raster catalog |

**Key design decision**: The `/API/globaldem` endpoint returns AAIGrid ASCII text (not JSON). The adapter overrides `call()` to fetch the text response, parse it, and return structured JSON — same pattern as `QrServerAdapter`.

## Tool Mapping

| Tool ID | MCP Name | Price | Cache TTL | Description |
|---------|----------|-------|-----------|-------------|
| `opentopo.elevation_point` | `opentopo.elevation.point` | $0.002 | 86400s | Terrain elevation at a lat/lon point |
| `opentopo.elevation_area` | `opentopo.elevation.area` | $0.003 | 86400s | Elevation stats (min/max/mean) for a bbox |
| `opentopo.lidar_catalog` | `opentopo.catalog.lidar` | $0.002 | 3600s | Search LiDAR point cloud datasets |
| `opentopo.dem_catalog` | `opentopo.catalog.dem` | $0.002 | 3600s | Search raster DEM datasets |

## Input Schemas

### opentopo.elevation_point
```json
{
  "lat": -90..90,
  "lon": -180..180,
  "dataset": "SRTMGL1|COP30|AW3D30|NASADEM|..." (optional, default SRTMGL1)
}
```

### opentopo.elevation_area
```json
{
  "south": -90..90,
  "north": -90..90,
  "west": -180..180,
  "east": -180..180,
  "dataset": "SRTMGL1|..." (optional)
}
```
Max bbox: 0.5° × 0.5°

### opentopo.lidar_catalog
```json
{
  "min_lon": -180..180,
  "min_lat": -90..90,
  "max_lon": -180..180,
  "max_lat": -90..90
}
```

### opentopo.dem_catalog
Same as lidar_catalog.

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| elevation_point | $0 (CC BY 4.0 free) | $0.002 | ~100% |
| elevation_area | $0 (CC BY 4.0 free) | $0.003 | ~100% |
| lidar_catalog | $0 (CC BY 4.0 free) | $0.002 | ~100% |
| dem_catalog | $0 (CC BY 4.0 free) | $0.002 | ~100% |

Elevation queries are priced slightly higher than pure-JSON providers ($0.001) because:
1. Requires registered API key (provider has a real rate limit of 5K/day)
2. AAIGrid parsing adds processing overhead
3. Terrain data has high per-query value for agents (infrastructure siting, hydrology, etc.)

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/opentopography/index.ts` | Main adapter, AAIGrid parser, catalog handler |
| `src/adapters/opentopography/types.ts` | TypeScript types for raw API responses |
| `src/schemas/opentopography.schema.ts` | Zod schemas with full `.describe()` coverage |
| `src/config/env.ts` | `PROVIDER_KEY_OPENTOPO` env var |
| `src/adapters/registry.ts` | `case 'opentopography':` → OpenTopographyAdapter |
| `src/schemas/index.ts` | `...opentopographySchemas` spread |
| `src/mcp/tool-definitions.ts` | 4 tool definitions with mcpName/title/description/category |
| `config/tool_provider_config.yaml` | 4 tool entries with price_usd and cache_ttl |
| `src/config/provider-limits.json` | Dashboard config: 5K/day limit |

## Technical Notes

- **AAIGrid format**: ASCII text with header lines (ncols, nrows, cellsize, NODATA_value) then space-separated elevation values. Parser handles both `xllcorner` and `xllcenter` variants.
- **Demo key limits**: `demoapikeyot2022` allows 50 calls/day. Production should use a registered key (5K/day).
- **Dataset selection**: SRTMGL1 (30m NASA SRTM) is the default. COP30 (Copernicus 30m) offers slightly higher accuracy in some regions.
- **Point elevation method**: Requests a tiny 0.004° × 0.004° bbox (~440m × 440m), gets 14×14 SRTMGL1 cells, returns their mean.
- **Area elevation limit**: Max 0.5° × 0.5° bbox to keep response sizes manageable (~3MB raw AAIGrid for SRTMGL1 at max size).
- **Catalog uses JSON**: The `/API/otCatalog` endpoint returns JSON natively, using the standard `super.call()` flow.
