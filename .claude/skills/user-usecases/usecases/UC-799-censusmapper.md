# UC-799 — CensusMapper (censusmapper)

## Meta

| Field | Value |
|-------|-------|
| ID | UC-799 |
| Provider | CensusMapper (censusmapper.ca/api/v1) — Statistics Canada census data |
| Category | world (government open data) |
| Date | 2026-10-01 |
| Status | LOCALLY COMMITTED (local build/deploy only — not yet pushed to production or Smithery) |
| Tools | 2 |
| Auth | API key `PROVIDER_KEY_CENSUSMAPPER`, POST form param `api_key` (measured: real key 200 text/csv, garbage key 401 "Access denied, invalid API key") |
| Provider key in APIbase | `censusmapper` (tool_id prefix and registry case) |

## Overview

CensusMapper serves Statistics Canada census tables. Only two endpoints were verified live and are wrapped:
`list_datasets` (public JSON, NOT proof of key validity) and `data.csv` (key required, POST form).
`list_regions` / `list_vectors` variants returned 404 under every path tried, so they are not wrapped.
data.csv returns text/csv, so the adapter overrides `call()` and converts the CSV to JSON rows (GeoUID kept
as string, numeric columns coerced, headers trimmed, `max_rows` default 200, cap 1000). Every response carries
the Statistics Canada attribution required by the terms. Quota: 500 region ids/day (cancensus README; operator's
registration notes said 1,000 requests/hour, 10,000/day — conservative figure used). Resale: granted_conditional,
Statistics Canada Open Licence, attribution mandatory (censusmapper.ca/about).
UC number = highest existing UC file + 1 (resort registry absent in this worktree).

## Tool Mapping

| tool_id | mcpName | Endpoint |
|---------|---------|----------|
| censusmapper.list_datasets | censusmapper.census.list_datasets | GET /api/v1/list_datasets |
| censusmapper.data | censusmapper.census.get_data | POST /api/v1/data.csv |

## Input Schemas

- list_datasets: `query` (optional client-side filter)
- data: `dataset`, `level`, `regions` (record level -> id array), `vectors` (v_CAxx_n ids), `geo_hierarchy`, `max_rows`

## Implementation Files

- `src/adapters/censusmapper/index.ts`, `src/schemas/censusmapper.schema.ts`
- `src/adapters/registry.ts`, `src/schemas/index.ts`, `src/mcp/tool-definitions.ts`, `src/config/env.ts`
- `config/tool_provider_config.yaml`, `src/config/provider-limits.json` (entry pre-existing), `scripts/test-censusmapper.sh`

## Verification

Adapter run inside the local container with the real key: CA21 / CMA 35535 / v_CA21_1 → Toronto, population 6,202,225.
Smoke test 6/6 against the local container.

## Pricing Rationale

| Tool | Upstream cost | Price | Margin |
|------|---------------|-------|--------|
| both | $0 (free tier, 500 region ids/day) | $0.002 | ~100% |
