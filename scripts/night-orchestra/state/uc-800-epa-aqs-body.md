<!-- Pending: copy to .claude/skills/user-usecases/usecases/UC-800-epa-aqs.md (skills write blocked in sandbox).
     Index row for .claude/skills/user-usecases/SKILL.md after the UC-799 row:
| UC-800 | EPA Air Quality System (aqs.epa.gov) | US EPA AQS Data API -- criteria-pollutant monitor data by county: parameter/county code lookups, monitors, daily and annual summaries incl. AQI | LOCALLY COMMITTED (local) | API key (`email`+`key` query), 5 tools | `usecases/UC-800-epa-aqs.md` |
-->
# UC-800 — EPA Air Quality System (epa-aqs)

## Meta

| Field | Value |
|-------|-------|
| ID | UC-800 |
| Provider | US EPA Air Quality System (AQS) Data API — aqs.epa.gov/data/api |
| Category | world (government open data, air quality) |
| Date | 2026-10-01 |
| Status | LOCALLY COMMITTED (local build/deploy only — not yet pushed to production or Smithery) |
| Tools | 5 |
| Auth | `email` (api@apibase.pro) + `key` query params; key in `PROVIDER_KEY_EPA_AQS` (measured: real key `Success`, invalid key `Failed: Email and/or key are invalid.` with HTTP 200) |
| Provider key in APIbase | `epa-aqs` (tool_id prefix and registry case) |

## Overview

Official US monitoring-network data: criteria pollutants (PM2.5, ozone, CO, NO2, SO2, PM10, lead), AQI, monitor sites.
Wrapped the by-county variants only (state+county FIPS), plus parameter and county code lookups. Upstream wraps every
reply in `{Header:[{status,error?}],Data:[...]}` and signals errors with HTTP 200 + `status: "Failed"`, so the adapter
maps that to PROVIDER_AUTH (key/email) or INPUT_REJECTED (422). "No data matched your selection" is returned as an empty,
successful result. Rows capped by `max_rows` (default 200, max 1000). Upstream limits: 10 requests/min, 5 s spacing,
edate in same year as bdate, max 5 parameter codes. Resale: granted_conditional (US federal government work; see
provider-limits `resale_permission_proof`).

## Tool Mapping

| tool_id | mcpName | Endpoint |
|---------|---------|----------|
| epa-aqs.list_parameters | epa_aqs.air_quality.list_parameters | GET /list/parametersByClass |
| epa-aqs.list_counties | epa_aqs.air_quality.list_counties | GET /list/countiesByState |
| epa-aqs.monitors | epa_aqs.air_quality.get_monitors | GET /monitors/byCounty |
| epa-aqs.daily_data | epa_aqs.air_quality.get_daily_data | GET /dailyData/byCounty |
| epa-aqs.annual_data | epa_aqs.air_quality.get_annual_data | GET /annualData/byCounty |

## Implementation Files

- `src/adapters/epaaqs/index.ts`, `src/schemas/epaaqs.schema.ts`
- `src/adapters/registry.ts`, `src/schemas/index.ts`, `src/mcp/tool-definitions.ts`, `src/config/env.ts`
- `config/tool_provider_config.yaml`, `src/config/provider-limits.json` (entry pre-existing), `scripts/test-epa-aqs.sh`

## Verification

Adapter run inside the local container with the real key: list_counties state 06 → 58 counties; daily_data PM2.5
(88101) Los Angeles County 2024-01-01..07 → 390 rows with AQI; state 99 → empty "No data matched your selection".
Smoke test 8/8 against the local container. Seeded to the orchestra Postgres (172.20.0.2), not the main stack.

## Pricing Rationale

| Tool | Upstream cost | Price | Margin |
|------|---------------|-------|--------|
| all | $0 (free registered key, 10 req/min) | $0.002 | ~100% |
