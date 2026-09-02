# UC-663: INE Spain (Instituto Nacional de Estadística) Tempus3 public REST API (ine-spain)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-663 |
| **Provider** | Instituto Nacional de Estadística (Spanish National Statistics Institute) — servicios.ine.es |
| **Domain** | servicios.ine.es/wstempus |
| **Category** | economic-indicators (dashboard/tool-definitions: `finance` — closest existing category, consistent with oecd-data/ilostat/istat/bundesbank-timeseries/ine-portugal) |
| **Theme** | Custom (non-SDMX) 4-level statistics catalog: operation catalog -> per-operation table list -> per-table data -> per-series data + metadata |
| **Date** | 2026-09-02 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE (local) |
| **Region** | Spain |
| **Pricing Model** | free upstream (no auth) |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

Spain's official statistics office publishes its entire time-series catalog — CPI, labour force,
population, national accounts, and ~106 other statistical operations — as a public, no-auth JSON
REST API ("Tempus3", servicios.ine.es/wstempus/js). Unlike the SDMX-based national-statistics
offices already onboarded (oecd-data, ilostat, istat, bundesbank-timeseries, ine-portugal), INE
Spain uses its own bespoke query shape, not SDMX 2.1.

| Aspect | Details |
|--------|---------|
| **Free Tier** | Fully open, no signup, no API key |
| **Paid Tier** | N/A — no paid tier exists |
| **Auth Model** | None |
| **License** | CC BY-SA 4.0 (stated in the site footer) |
| **Quota** | No documented rate limit found in the official DataLab API manual; no rate-limit response headers observed |
| **Global Availability** | Reachable from this host, standard HTTPS |
| **Status** | Production |

---

## API Overview

Candidate URL `https://servicios.ine.es/wstempus/js` is the live Tempus3 JSON API root, confirmed
against the official docs at `https://www.ine.es/dyngs/DAB/index.htm?cid=1099` ("Datos abiertos /
API JSON").

| # | Endpoint | Method | Description |
|---|----------|--------|--------------|
| 1 | `/{lang}/OPERACIONES_DISPONIBLES` | GET | List all 109 published statistical operations |
| 2 | `/{lang}/TABLAS_OPERACION/{operation_code}` | GET | List tables published under one operation |
| 3 | `/{lang}/DATOS_TABLA/{table_id}?nult=N` | GET | Most-recent N periods for every series in a table |
| 4 | `/{lang}/DATOS_SERIE/{series_code}?nult=N&det=2` | GET | Most-recent N periods + rich metadata for one series |

`{lang}` is `ES` or `EN` (both confirmed live — English operation names differ, e.g. "IPC" ->
"Consumer Price Index (CPI)").

Verified live before implementation:
```
curl ".../ES/OPERACIONES_DISPONIBLES" -> 200, 112 rows (109 unique Codigo values), ~21KB
curl ".../ES/TABLAS_OPERACION/IPC" -> 200, 59 tables
curl ".../ES/TABLAS_OPERACION/EPA" -> 200, 1039 tables, 327KB (largest operation tested)
curl ".../ES/DATOS_TABLA/14506?nult=1" -> 200, 240 series bundled in one table, 61KB
curl ".../ES/DATOS_TABLA/14506?nult=6" -> 200, same table, 185KB (confirms near-linear scaling with nult)
curl ".../ES/DATOS_SERIE/IPC53262?nult=999999" -> 200, 6.2KB (upstream itself caps full-history length)
curl ".../ES/DATOS_SERIE/IPC53262?nult=3&det=2" -> 200, rich per-period metadata (Periodo.Nombre_largo, TipoDato.Codigo)
curl ".../ES/DATOS_TABLA/999999999?nult=1" -> 404 (genuine HTTP error, not silent-empty)
curl ".../ES/DATOS_SERIE/NOTREAL999?nult=3" -> 200, 0-byte body (silent-empty, no error status)
curl ".../ES/TABLAS_OPERACION/NOTREAL" -> 200, 0-byte body (silent-empty, no error status)
curl ".../EN/OPERACION/IPC" -> 200, {"Nombre":"Consumer Price Index (CPI) ", ...} (lang param confirmed live)
```

### Research Quirk — an unrecognized operation/series code returns HTTP 200 with an EMPTY body, not an error

Both `TABLAS_OPERACION/{bad_code}` and `DATOS_SERIE/{bad_code}` return `HTTP 200` with a 0-byte
body for an unrecognized code — `base.adapter.ts`'s `JSON.parse('')` then throws, surfacing as a
confusing `INVALID_RESPONSE`/502 ("gateway failure") rather than a clear input-validation error.
Since the operation-code set is small and closed (109 codes, rarely changes), `ine-spain.tables`
enum-constrains `operation_code` in its Zod schema so this path is unreachable for that tool.
`series_code` has no closed set (100,000+ dynamically-generated codes like `IPC53262`), so it
cannot be enum-constrained — `ine-spain.series_data` is left with the imperfect 502 on an
unrecognized code, documented in the tool description ("An unrecognized series_code returns an
empty upstream response") and in the adapter's file-header comment. `table_id`, by contrast, needs
no special handling: an unrecognized `table_id` returns a genuine `HTTP 404`, which
`base.adapter.ts` already classifies correctly as `INPUT_REJECTED`/422 (2026-06-06 fault-based
classification rule) — confirmed live, not silent-empty like the operation/series codes.

### Research Quirk — DATOS_TABLA has no server-side cap on series-per-table, so `periods` is capped tightly

`DATOS_TABLA` returns every series in a table at once, with no pagination. The EPA (Labour Force
Survey) operation alone has 1,039 tables; one tested table (id 14506) already bundles 240 series
at 61KB for `nult=1`, scaling to 185KB at `nult=6` — near-linear, so a table with more series or a
higher `nult` risks exceeding the 1MB response-size default fast. `ine-spain.table_data`'s `periods`
is therefore capped to 1-6 (default 1) in the Zod schema, and the adapter overrides
`maxResponseBytes` to 2MB as a fail-closed safety net for tables denser than any tested so far.
`ine-spain.series_data` (single series, up to 100 periods) has no such risk — even `nult=999999`
against a real series returned only 6.2KB, because the upstream itself silently caps to the
series' real history length rather than erroring on an over-large `nult`.

---

## Tool Mapping

| # | Tool ID | mcpName | Description | Price |
|---|---------|---------|--------------|-------|
| 1 | ine-spain.operations | ine-spain.reference.operations | Browse/search the 109-operation catalog | $0.001 |
| 2 | ine-spain.tables | ine-spain.reference.tables | List tables published under an operation | $0.001 |
| 3 | ine-spain.table_data | ine-spain.series.table_data | Recent data (1-6 periods) for every series in a table | $0.002 |
| 4 | ine-spain.series_data | ine-spain.series.data | Recent data (up to 100 periods) + rich metadata for one series | $0.002 |

All 4 tools: category `finance`, annotations `READ_ONLY`.

---

## Input Schemas

Defined in `src/schemas/ine-spain.schema.ts`, all `.strip()`ped Zod objects:

- `operations`: `search` (optional string, case-insensitive substring on name, client-filtered),
  `lang` (optional enum `ES`/`EN`, default `ES`)
- `tables`: `operation_code` (required, enum of the 109 live operation codes), `lang`
- `table_data`: `table_id` (required number), `periods` (optional 1-6, default 1), `lang`
- `series_data`: `series_code` (required string), `periods` (optional 1-100, default 12), `lang`

---

## Implementation Files

| File | Purpose |
|------|---------|
| src/adapters/ine-spain/index.ts | IneSpainAdapter — buildRequest/parseResponse for all 4 tools, shared formatSeries() helper for the two data-point shapes |
| src/adapters/ine-spain/types.ts | Raw Tempus3 response types (operation, table, compact + detailed data-point shapes) |
| src/schemas/ine-spain.schema.ts | Zod schemas for all 4 tools, incl. the 109-value operation_code enum |
| src/adapters/registry.ts | case 'ine-spain' to IneSpainAdapter |
| src/schemas/index.ts | ineSpainSchemas spread |
| src/mcp/tool-definitions.ts | 4 tool definitions, category finance |
| config/tool_provider_config.yaml | 4 tool entries, provider ine-spain, price_usd 0.001-0.002, cache_ttl 3600-86400 |
| src/config/provider-limits.json | Dashboard entry, limit_type unlimited, no documented rate limit |
| scripts/test-ine-spain.sh | 6-check smoke test (health, catalog, schema, dashboard, OpenAPI, upstream) |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| ine-spain.operations | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — catalog of 109 operations is near-static) |
| ine-spain.tables | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — table list per operation rarely changes) |
| ine-spain.table_data | $0 (free, no auth) | $0.002 | ~100% | 3600s (1h — provisional values get revised) |
| ine-spain.series_data | $0 (free, no auth) | $0.002 | ~100% | 3600s (1h — provisional values get revised, `TipoDato.Codigo != 'D'` marks provisional) |

---

## Notes

- Adapter logic was verified with real upstream data via direct `curl` against every endpoint
  before implementation (see API Overview above): `OPERACIONES_DISPONIBLES` returned 112 real
  rows; `TABLAS_OPERACION/IPC` returned 59 real CPI tables; `DATOS_TABLA/14506` returned 240 real
  EPA series; `DATOS_SERIE/IPC53262` returned real monthly CPI variation values back to 2006
  (`det=2` confirmed rich metadata: `Periodo.Nombre_largo` e.g. "Diciembre", `TipoDato.Codigo`
  "D" for definitivo).
- Error paths verified directly: an unrecognized `table_id` returns a genuine upstream 404,
  correctly classified as `INPUT_REJECTED`/422 by the existing base-adapter fault classification
  (no adapter-side special-casing needed); an unrecognized `operation_code` is made unreachable by
  the Zod enum before any upstream call; an unrecognized `series_code` still surfaces as a 502
  (documented limitation — see Research Quirk above, not fixable without a `base.adapter.ts`
  change, out of scope per CLAUDE.md section 0).
- `npx tsx scripts/seed.ts` upserted all 4 new tools ("Upserted 1344 tools" — includes concurrently
  in-flight uncommitted providers from other night-orchestra roles in this shared working tree).
  The script's separate `seedTestAgent()` step failed afterward with the same pre-existing,
  unrelated Prisma UUID error documented in every prior UC's notes since UC-643 (`Agent.agent_id`
  is a Postgres `uuid` column but the seed script's hardcoded `TEST_AGENT_ID` is not a valid UUID)
  — confirmed unmodified by this onboarding.
- Local production stack (this host's Docker containers, which serve apibase.pro directly)
  rebuilt and redeployed cleanly: TS compile 0 errors, ESLint 0 errors, container healthy,
  `/api/v1/tools` shows 1323 tools with `has_more:false`, dashboard shows `tool_count:4` for
  `ine-spain`, and `test-ine-spain.sh` passes 5/6 locally — the 6th check (OpenAPI route count via
  the running server) fails only because `static-current/` is a git-SHA-versioned symlink that
  `scripts/deploy.sh` re-points on a real deploy (triggered by pushing the branch to the remote);
  the git-tracked `static/.well-known/openapi.json` was independently confirmed to contain all 4
  `ine-spain.*` paths after regeneration. Same known batch-mode gap as every prior
  local-commit-only onboarding in this run (istat, msc-geomet, ine-portugal,
  bundesbank-timeseries) — resolves automatically once the hourly batch-pusher runs.
- `next_uc_number` in `.claude/skills/resort/candidates-registry.json` had already drifted to 663
  (numbers 660-662 reserved by concurrent resort-candidate/night-orchestra activity with no UC file
  yet) at the time this step ran — read fresh per the skill's Step 10 rule rather than reusing the
  candidate line's assumed "next" number, and incremented to 664 in the same step.
- Not published to Smithery and not pushed to the remote per this run's BATCH MODE instructions —
  the hourly batch-pusher handles both.
