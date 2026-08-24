# UC-594 — Statistics Denmark (StatBank)

## Meta

| Field | Value |
|-------|-------|
| ID | UC-594 |
| Provider | Statistics Denmark / Danmarks Statistik (api.statbank.dk) |
| Category | finance / world statistics |
| Date | 2026-08-24 |
| Status | LIVE |
| Tools | 4 |
| Auth | None (Danish Government open data) |
| License | Creative Commons (open government data) |

## Overview

Statistics Denmark (StatBank) is Denmark's national statistical office. It publishes 2,000+ time-series tables covering population, labour market, economy, social conditions, education, business, transport, culture, and environment. The StatBank API is fully open — no API key or registration required.

## API Endpoints Verified

| Endpoint | Method | Description |
|----------|--------|-------------|
| `https://api.statbank.dk/v1/subjects` | GET | Subject/topic tree (hierarchical categories) |
| `https://api.statbank.dk/v1/tables` | GET | Search/list tables by keyword and/or subject |
| `https://api.statbank.dk/v1/tableinfo` | GET | Table metadata — dimensions, valid value codes |
| `https://api.statbank.dk/v1/data` | POST | Fetch table data as a JSON-stat dataset |

## Tool Mapping

| Tool ID | MCP Name | Endpoint | Price | TTL | Description |
|---------|----------|----------|-------|-----|-------------|
| `statistics-denmark.subjects` | `statistics-denmark.data.subjects` | GET /subjects | $0.001 | 86400s | Subject/topic tree (English labels) |
| `statistics-denmark.tables` | `statistics-denmark.data.tables` | GET /tables | $0.001 | 3600s | Search tables by keyword and/or subject; returns id, title, unit, period range, variables |
| `statistics-denmark.table_info` | `statistics-denmark.data.table_info` | GET /tableinfo | $0.001 | 86400s | Table dimensions + valid value codes (required before querying data) |
| `statistics-denmark.data` | `statistics-denmark.data.query` | POST /data | $0.002 | 3600s | Fetch a JSON-stat dataset with dimension filters |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| statistics-denmark.subjects | $0 (open data) | $0.001 | ~100% |
| statistics-denmark.tables | $0 (open data) | $0.001 | ~100% |
| statistics-denmark.table_info | $0 (open data) | $0.001 | ~100% |
| statistics-denmark.data | $0 (open data) | $0.002 | ~100% |

All tools are no-auth open government data — pricing covers infrastructure and pipeline cost. `.data` is priced higher than the metadata tools because it is a POST query that can return larger JSON-stat payloads.

## Input Schemas

### statistics-denmark.subjects
```json
{
  "recursive": "boolean (optional, include nested subject tree)"
}
```

### statistics-denmark.tables
```json
{
  "query": "string (optional keyword, e.g. 'population', 'gdp', 'unemployment')",
  "subjects": "string (optional subject code filter)"
}
```

### statistics-denmark.table_info
```json
{
  "table_id": "string (required, e.g. 'FOLK1A')"
}
```

### statistics-denmark.data
```json
{
  "table_id": "string (required)",
  "variables": "array of {code: string, values: string[]} (required, one entry per dimension; use values: [\"*\"] for the full range)"
}
```

## Common Table IDs

| Table ID | Description |
|----------|-------------|
| `FOLK1A` | Quarterly population by region/sex/age/marital status |
| `BEFOLK1` | Annual population by sex/age since 1971 |
| `AKU1` | Labour force survey |
| `NAN1` | GDP and national accounts |
| `PRIS111` | Consumer price index |

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/statistics-denmark/index.ts` | Main adapter class |
| `src/adapters/statistics-denmark/types.ts` | TypeScript interfaces for API responses |
| `src/schemas/statistics-denmark.schema.ts` | Zod input schemas |
| `src/adapters/registry.ts` | Case `'statistics-denmark'` → StatisticsDenmarkAdapter |
| `src/schemas/index.ts` | Schema registry import |
| `src/mcp/tool-definitions.ts` | 4 tool definitions |
| `config/tool_provider_config.yaml` | Prices and TTLs |
| `src/config/provider-limits.json` | Dashboard config |
| `scripts/test-statistics-denmark.sh` | Smoke test script (5/5 PASS) |

## Notes

- Required call order: `statistics-denmark.tables` (find table ID) → `statistics-denmark.table_info` (learn dimension codes and valid values) → `statistics-denmark.data` (fetch actual data).
- Any dimension omitted from `variables` in `.data` is auto-aggregated to its total by StatBank — callers must explicitly pass every dimension they want broken out.
- Onboarded by night-orchestra (task L-01, 2026-08-24); this UC doc was backfilled in a non-sandboxed pass after the sandboxed `record-statistics-denmark` step could not get write approval for `.claude/` in headless `--print` mode (see M-03 in orchestra plan).
