# UC-617 — GUS Poland BDL (Bank Danych Lokalnych)

## Meta

| Field | Value |
|-------|-------|
| ID | UC-617 |
| Provider | GUS Poland — Local Data Bank (bdl.stat.gov.pl) |
| Category | world |
| Date | 2026-08-27 |
| Status | LIVE |
| Tools | 3 |
| Auth | None for the anonymous tier (no signup, no API key) |
| License | Polish Government open statistics (Główny Urząd Statystyczny) |

## Overview

GUS (Główny Urząd Statystyczny), Poland's central statistics office, publishes ~40,000
territorial-unit statistical variables (prices, demography, finance, environment, labour market,
housing, and more) through its BDL (Bank Danych Lokalnych / Local Data Bank) REST API. The
anonymous tier requires no registration or `X-ClientId` header. This integration exposes a
3-endpoint browse -> search -> fetch flow: browse the topic tree, search/list variables, then pull
the actual territorial-unit time series for a variable.

## API Endpoints Verified

| Endpoint | Method | Description |
|----------|--------|-------------|
| `https://bdl.stat.gov.pl/api/v1/subjects[?parent-id=]` | GET | Topic tree (33 root subjects, browsable via parent-id) |
| `https://bdl.stat.gov.pl/api/v1/variables/search?name=` | GET | Keyword search across all variables |
| `https://bdl.stat.gov.pl/api/v1/variables?subject-id=` | GET | List variables under a leaf subject |
| `https://bdl.stat.gov.pl/api/v1/data/by-variable/{id}?unit-level=&year=` | GET | Variable's values across all units at a level |
| `https://bdl.stat.gov.pl/api/v1/data/by-unit/{id}?var-id=&year=` | GET | Variable's values for one specific unit |

Verified live: `/subjects`, `/variables/search`, `/variables?subject-id=`, and both `/data/*`
endpoints return correct JSON with real Polish statistics (e.g. wheat procurement prices by
voivodeship 1999-2025).

**CRITICAL QUIRK — quota errors are HTTP 200, not an HTTP error status.** GUS BDL signals
quota exhaustion as `HTTP 200` with body `{"errorResult": "API calls quota exceeded! Maximum
admitted N per WINDOW."}`. `base.adapter.ts`'s status-code-based classification cannot see this
(it only inspects non-2xx statuses), so `GusPolandAdapter.parseResponse()` explicitly checks every
response body for an `errorResult` string field and throws `RATE_LIMIT` (HTTP 429, `retryAfter:
900`) itself — same class of "error embedded in a 200 body" quirk as UC-611 (USGS National Map).

**CRITICAL QUIRK — the anonymous `/units` and `/units/search` endpoints have a much tighter quota
than `/subjects`/`/variables`/`/data`.** Live testing showed `/units/search?name=Warszawa` and
`/units?level=2` both immediately returned `errorResult` ("1000 per 12h" and "100 per 15 min"
respectively) on this server's shared IP, while `/subjects`, `/variables`, `/variables/search`,
and `/data/by-variable` all worked repeatedly with no throttling in the same test session. **This
adapter deliberately never calls `/units` or `/units/search`** — territorial units are instead
addressed via the `unit_level` parameter (0-7) on `/data/by-variable` (returns all units at that
level, e.g. all 16 voivodeships), or via a caller-supplied `unit_id` (12-digit TERYT-based code,
e.g. `"000000000000"` for all of Poland) on `/data/by-unit`, neither of which requires a prior unit
lookup call.

## Tool Mapping

| Tool ID | MCP Name | Endpoint | Price | TTL | Description |
|---------|----------|----------|-------|-----|-------------|
| `gus-poland.subjects` | `gus-poland.reference.subjects` | GET `/subjects` | $0.001 | 604800s | Browse the 33-root-topic BDL subject tree via `parent_id` |
| `gus-poland.variables` | `gus-poland.reference.variables` | GET `/variables/search` or `/variables` | $0.001 | 604800s | Search variables by keyword, or list variables under a `subject_id` |
| `gus-poland.data` | `gus-poland.series.data` | GET `/data/by-variable/{id}` or `/data/by-unit/{id}` | $0.002 | 86400s | Fetch a variable's values, broken down by `unit_level` or for one `unit_id` |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| gus-poland.subjects | $0 (free, no auth) | $0.001 | ~100% |
| gus-poland.variables | $0 (free, no auth) | $0.001 | ~100% |
| gus-poland.data | $0 (free, no auth) | $0.002 | ~100% |

No-auth, no-signup public API — pricing covers infrastructure/pipeline cost only, in line with
other government open-statistics adapters (`ine-chile`, `bcb`, `ibge`). Reference/topic-tree
endpoints get a 7-day TTL (subject and variable metadata rarely changes); the data endpoint gets a
24h TTL since annual/periodic statistical series update infrequently within a day.

## Input Schema

### gus-poland.subjects
```json
{
  "parent_id": "string (optional) — subject-tree node id to list children of, e.g. 'K15'. Omit for the 33 root topics.",
  "page": "integer (optional, >=0)",
  "page_size": "integer (optional, 1-100, default 20)"
}
```

### gus-poland.variables
```json
{
  "query": "string (optional) — keyword search, e.g. 'population'. Either query or subject_id is required.",
  "subject_id": "string (optional) — leaf subject id from gus-poland.subjects, e.g. 'P1458'.",
  "page": "integer (optional, >=0)",
  "page_size": "integer (optional, 1-100, default 20)"
}
```

### gus-poland.data
```json
{
  "variable_id": "integer (required) — from gus-poland.variables, e.g. 4859",
  "unit_id": "string (optional) — 12-digit TERYT code for one unit, e.g. '000000000000' (all of Poland). If set, unit_level is ignored.",
  "unit_level": "integer (optional, 0-7, default 2) — 0=Poland,1=macroregion,2=voivodeship,3=region,4=subregion,5=powiat,6=gmina,7=locality",
  "year": "integer array (optional, max 10) — e.g. [2022, 2023]. Omit for full history.",
  "page": "integer (optional, >=0)",
  "page_size": "integer (optional, 1-100, default 20)"
}
```

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/gus-poland/index.ts` | Main adapter class (`GusPolandAdapter`) — `buildRequest`/`parseResponse`, plus `assertNoErrorResult` for the 200-body quota quirk |
| `src/adapters/gus-poland/types.ts` | TypeScript interfaces for the upstream JSON response (`BdlPagedSubjects`, `BdlPagedVariables`, `BdlDataResponse`, `BdlErrorResult`) |
| `src/schemas/gus-poland.schema.ts` | Zod input schemas (`gusPolandSchemas`) |
| `src/adapters/registry.ts` | Case `'gus-poland'` → `GusPolandAdapter` |
| `src/schemas/index.ts` | Schema registry import (`gusPolandSchemas`) |
| `src/mcp/tool-definitions.ts` | 3 tool definitions |
| `config/tool_provider_config.yaml` | Price and TTL for all 3 tools |
| `src/config/provider-limits.json` | Dashboard entry (`gus-poland`) — `limit_type: hourly`, `free_limit: 80` (derived from the observed "100 per 15 min" / "1000 per 12h" anonymous quotas) |
| `scripts/test-gus-poland.sh` | Smoke test (catalog, schema, dashboard, OpenAPI, upstream reachability) |

## Notes

- Single-country statistics adapter — no auth manager, no OAuth, standard `buildRequest`/
  `parseResponse` pattern (like `ibge`/`bcb`), no need to override `call()`.
- SCOPE DECISION: a 4th tool for territorial-unit lookup by name (mirroring `/units/search`) was
  deliberately not built, because that upstream endpoint's anonymous quota was already exhausted
  during live verification (see Critical Quirk above) — same class of reliability-driven scope
  reduction as UC-440 (Ensembl) and UC-607 (USGS MRDS), where a candidate tool was dropped after
  live testing showed the specific upstream endpoint was unfit for production resale, while the
  rest of the provider's surface remained solid.
- `unit_id` values are 12-digit TERYT-based codes (e.g. `"011200000000"` = Małopolskie
  voivodeship, `"000000000000"` = all of Poland) returned as the `id` field on `/data/by-variable`
  results — agents can bootstrap a unit_id from one `gus-poland.data` call at a broad `unit_level`
  and reuse it in subsequent `unit_id`-scoped calls, without ever needing `/units/search`.
- Onboarded 2026-08-27 (night-orchestra batch mode, sandboxed role) — no prior partial attempt
  existed (no adapter dir, no registry case, no yaml entries before this run).
