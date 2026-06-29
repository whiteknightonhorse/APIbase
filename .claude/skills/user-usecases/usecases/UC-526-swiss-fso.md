# UC-526 — Swiss Federal Statistics Office (FSO/BFS) STAT-TAB

## Meta

| Field | Value |
|-------|-------|
| **UC ID** | UC-526 |
| **Provider** | Swiss Federal Statistics Office (FSO / BFS) |
| **Category** | government-statistics |
| **Date** | 2026-06-29 |
| **Status** | LIVE |
| **Auth** | No auth required |
| **Upstream URL** | https://www.pxweb.bfs.admin.ch/api/v1/de |
| **License** | Swiss OGD (Creative Commons CCZero), commercial use permitted |
| **Upstream cost** | $0 — unlimited, open government data |

## Provider Description

The Swiss Federal Statistical Office (FSO, German: BFS) publishes 600+ statistical databases covering population, employment, health, education, agriculture, construction, tourism, energy, and sustainability via the PxWeb STAT-TAB API. The data is publicly available under Swiss Open Government Data terms (CCZero / TERMS OF USE open data) and free to use commercially.

### Critical API Behaviour

The BFS PxWeb installation has a language-routing quirk:
- **English** endpoint (`/api/v1/en`): only returns the root database catalog
- **German** endpoint (`/api/v1/de`): required for all navigation, metadata, and data queries

All adapter calls use `/api/v1/de`. Response fields are in German but field values (especially variable codes) are language-independent.

### Table Naming Convention

Every BFS database has exactly ONE table, always at `{dbid}/{dbid}.px`. The adapter derives the table path deterministically from the database ID — no navigation step required.

### Subject Code System

The first 2 digits of the database ID (after `px-x-`) encode the subject:

| Code | Subject |
|------|---------|
| 01 | population |
| 02 | territory |
| 03 | employment |
| 06 | industry |
| 07 | agriculture |
| 09 | construction |
| 10 | tourism |
| 11 | transport |
| 13 | social-security |
| 14 | health |
| 15 | education |
| 16 | culture |
| 17 | politics |
| 21 | sustainability |
| 40 | multi-subject |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/v1/de` | GET | Root catalog — returns all ~648 databases |
| `GET /api/v1/de/{dbid}` | GET | Navigate database — returns single table `{dbid}.px` |
| `GET /api/v1/de/{dbid}/{dbid}.px` | GET | Table metadata — dimensions, variable codes, value labels |
| `POST /api/v1/de/{dbid}/{dbid}.px` | POST | Query table — returns JSON-stat2 dataset |

### Query Body Format (POST)

```json
{
  "query": [
    { "code": "<variable_code>", "selection": { "filter": "item", "values": ["<value_code>"] } }
  ],
  "response": { "format": "json-stat2" }
}
```

**Important variable codes for wages database (`px-x-0304010000_201`):**
- All "total" values use `"-1"` (NOT `"0"` or `"T"`)
- Percentile: `"1"`=median, `"2"`=P10, `"3"`=P25, `"4"`=P75, `"5"`=P90
- Gender: `"-1"`=total, `"1"`=female, `"2"`=male

## Tool Mapping

| tool_id | mcpName | Price | Cache TTL |
|---------|---------|-------|-----------|
| `swissfso.catalog.list` | `swissfso.catalog.list` | $0.001 | 86400s |
| `swissfso.table.metadata` | `swissfso.table.metadata` | $0.001 | 86400s |
| `swissfso.table.query` | `swissfso.table.query` | $0.003 | 3600s |
| `swissfso.wages.monthly` | `swissfso.wages.monthly` | $0.002 | 86400s |

## Pricing Rationale

| Tool | Upstream cost | APIbase price | Margin |
|------|--------------|---------------|--------|
| `swissfso.catalog.list` | $0 | $0.001 | ~100% |
| `swissfso.table.metadata` | $0 | $0.001 | ~100% |
| `swissfso.table.query` | $0 | $0.003 | ~100% |
| `swissfso.wages.monthly` | $0 | $0.002 | ~100% |

`table.query` priced at $0.003 (higher) because it performs a live data fetch with arbitrary variable selection across potentially large datasets and has a shorter TTL (3600s vs 86400s for structural data). `wages.monthly` is a convenience wrapper with 86400s TTL on stable historical data, priced at $0.002. Catalog and metadata calls are pure reference lookups priced at minimum $0.001.

## Pre-built Wages Tool

The `swissfso.wages.monthly` tool provides direct access to database `px-x-0304010000_201` (Monthly gross wages by region, industry, professional status, gender, and percentile; 2012–2024). This is the most-queried FSO dataset.

Confirmed 2024 Swiss median monthly gross wage: **CHF 7,024**.

## Implementation Files

- `src/adapters/swissfso/index.ts` — Main adapter (PxWeb + JSON-stat2 parser)
- `src/adapters/swissfso/types.ts` — TypeScript interfaces
- `src/schemas/swissfso.schema.ts` — Zod input validation schemas

## Input Schemas

### swissfso.catalog.list
```
subject?: string  — Subject code (e.g. "03") or name (e.g. "employment"). Empty = all databases.
limit?: number    — Max databases to return (1-200, default 50).
```

### swissfso.table.metadata
```
database_id: string  — BFS database ID (e.g. "px-x-0304010000_201")
```

### swissfso.table.query
```
database_id: string  — BFS database ID (e.g. "px-x-0304010000_201")
filters?: Array<{ code: string, values: string[] }>  — Variable filters. Use metadata to discover codes.
```

### swissfso.wages.monthly
```
year?: string          — Year (2012-2024, default "2024")
gender?: "total"|"female"|"male"  — Gender breakdown (default "total")
percentile?: "1"|"2"|"3"|"4"|"5"  — 1=median, 2=P10, 3=P25, 4=P75, 5=P90 (default "1")
```

## Notes

- Response format is JSON-stat2 (`class: "dataset"`): values are a flat array in C-order (row-major), dimensions in `id[]`, sizes in `size[]`, labels in `dimension[id].category.label`.
- The adapter increases `maxResponseBytes` to 5MB to handle large statistical datasets.
- Path traversal prevention: `validateDbId()` rejects `database_id` values containing `..`, `/`, or null bytes.
- `parseCatalog()` maps subject codes to human-readable names using `SUBJECT_MAP`.
- BFS STAT-TAB URL: https://www.atlas.bfs.admin.ch/
