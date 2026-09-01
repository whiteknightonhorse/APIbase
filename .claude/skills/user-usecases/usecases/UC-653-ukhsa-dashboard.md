# UC-653: UKHSA Data Dashboard (ukhsa-dashboard)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-653 |
| **Provider** | UK Health Security Agency — api.ukhsa-dashboard.data.gov.uk |
| **Domain** | api.ukhsa-dashboard.data.gov.uk |
| **Category** | Health (UK infectious disease / immunisation / medicines / climate-health surveillance) |
| **Theme** | 6-level drill-down catalog (theme/sub_theme/topic/geography_type/geography/metric) over paginated daily/weekly timeseries |
| **Date** | 2026-09-01 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE (local) |
| **Region** | United Kingdom (Nation/Region/Local Authority/NHS Trust geographies) |
| **Pricing Model** | free upstream (no auth) |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

The UKHSA Data Dashboard is the UK Health Security Agency's public surveillance data platform,
backing the dashboard at `ukhsa-dashboard.data.gov.uk`. Its REST API (Django REST Framework) is a
strict 6-level drill-down hierarchy with no free-text search at any level — an agent must browse
theme -> sub_theme -> topic -> geography_type -> geography -> metric before it can pull a
timeseries. This is a distinct discovery shape from the CKAN catalogs (HDX/open-canada/au-data-gov)
and closer to the OECD/ILOSTAT SDMX dataflow-drill-down pattern, but with fixed path segments
instead of dimension codelists.

| Aspect | Details |
|--------|---------|
| **Free Tier** | Fully open, no signup, no API key |
| **Paid Tier** | N/A — no paid tier exists |
| **Auth Model** | None |
| **License** | UK Open Government Licence v3.0 |
| **Quota** | No documented rate limit found on the API docs page |
| **Global Availability** | Reachable from this host, standard HTTPS |
| **Status** | Production |

---

## API Overview

Django REST Framework, browsable-API-by-default (returns HTML unless `Accept: application/json`
is sent). The candidate URL's `/api` path suffix is stale — the real API is served at the domain
root, not under `/api`.

| # | Endpoint | Method | Description |
|---|----------|--------|--------------|
| 1 | `/themes/` | GET | List all themes |
| 2 | `/themes/{theme}/sub_themes/` | GET | List sub-themes for a theme |
| 3 | `/themes/{theme}/sub_themes/{sub_theme}/topics` | GET | List topics |
| 4 | `/.../topics/{topic}/geography_types` | GET | List geography types |
| 5 | `/.../geography_types/{geography_type}/geographies` | GET | List geographies |
| 6 | `/.../geographies/{geography}/metrics` | GET | List metric names |
| 7 | `/.../metrics/{metric}?page=&page_size=&year=&epiweek=&date=&age=&sex=&stratum=&in_reporting_delay_period=` | GET | Paginated timeseries data points |

Verified live before implementation:
```
curl -H "Accept: application/json" "https://api.ukhsa-dashboard.data.gov.uk/themes/"
-> 200, 4 themes: climate_and_environment, immunisation, infectious_disease, medicines

curl -H "Accept: application/json" ".../themes/infectious_disease/sub_themes/"
-> 200, 10 sub_themes (antimicrobial_resistance, respiratory, vaccine_preventable, ...)

curl -H "Accept: application/json" ".../topics/COVID-19/geography_types"
-> 200, 7 geography types incl. "Government Office Region" (space in value, needs encodeURIComponent)

curl -H "Accept: application/json" ".../geographies/England/metrics/COVID-19_cases_casesByDay?page_size=365"
-> 200, count=2401, 365 rows returned, 134538 bytes (~369 bytes/row)
```
The OpenAPI schema at `/api/schema` (discovered via the Swagger UI's embedded `url: "/api/schema"`
reference — `/api/swagger/?format=openapi` itself 404s the raw JSON, only the HTML wrapper) confirms
`page`/`page_size`/`year`/`epiweek`/`date`/`age`/`sex`/`stratum`/`in_reporting_delay_period` as the
only supported query params on the leaf metric endpoint — no `date_from`/`date_to` range filter
exists, only an exact `date` match.

### Research Quirk — no search at any level, browsing is the only discovery path

Unlike every CKAN/Solr catalog onboarded so far, there is no query-parameter search — each browse
level returns the complete unfiltered child list (`[{name, link}]`). An agent must walk the full
path before it can request data. `ukhsa-dashboard.browse` mirrors this directly: it accepts 0-5
increasingly specific optional params and returns whichever level is one deeper than what was
supplied, refusing (422) any request that skips an intermediate level (e.g. `topic` without
`sub_theme`).

### Research Quirk — geography_type and topic values contain spaces

`geography_type` values like `"Government Office Region"`, `"Upper Tier Local Authority"`, `"NHS
Trust"` contain spaces and must be `encodeURIComponent`-escaped in the path (2026-03-30 CLAUDE.md
rule). Confirmed working via curl with `%20` escaping.

### Research Quirk — page_size sizing for the 1MB response ceiling

365 rows at `page_size=365` measured 134,538 bytes (~369 bytes/row). `page_size` is capped at 500
(~185KB worst case) in the schema/adapter to stay comfortably under the 1MB raw response ceiling
while still allowing a full year of daily data in one call.

---

## Tool Mapping

| # | Tool ID | mcpName | Description | Price |
|---|---------|---------|--------------|-------|
| 1 | ukhsa-dashboard.browse | ukhsa-dashboard.catalog.browse | Drill down themes -> sub_themes -> topics -> geography_types -> geographies -> metrics | $0.001 |
| 2 | ukhsa-dashboard.metric_data | ukhsa-dashboard.metrics.data | Paginated timeseries data points for one metric+geography, with year/epiweek/date/age/sex/stratum filters | $0.002 |

Both tools: category `health`, annotations `READ_ONLY`.

---

## Input Schemas

Defined in `src/schemas/ukhsa-dashboard.schema.ts`, both `strip()`ped Zod objects:

- `browse`: `theme`, `sub_theme`, `topic`, `geography_type`, `geography` — all optional strings,
  each requiring every shallower field to be present (enforced in the adapter, not Zod, since it's
  a cross-field dependency chain)
- `metric_data`: `theme`, `sub_theme`, `topic`, `geography_type`, `geography`, `metric` (all
  required strings), plus optional `year` (2000-2100), `epiweek` (1-53), `date` (YYYY-MM-DD),
  `age`, `sex`, `stratum`, `in_reporting_delay_period` (boolean), `page`, `page_size` (1-500,
  default 100)

---

## Implementation Files

| File | Purpose |
|------|---------|
| src/adapters/ukhsa-dashboard/index.ts | UkhsaDashboardAdapter — buildRequest/parseResponse for both tools |
| src/adapters/ukhsa-dashboard/types.ts | Raw DRF browse-link and paginated-data response types |
| src/schemas/ukhsa-dashboard.schema.ts | Zod schemas for both tools |
| src/adapters/registry.ts | case 'ukhsa-dashboard' to UkhsaDashboardAdapter |
| src/schemas/index.ts | ukhsaDashboardSchemas spread |
| src/mcp/tool-definitions.ts | 2 tool definitions, category health |
| config/tool_provider_config.yaml | 2 tool entries, provider ukhsa-dashboard, price_usd 0.001-0.002, cache_ttl 3600-86400 |
| src/config/provider-limits.json | Dashboard entry, limit_type unlimited, no documented rate limit |
| static/dashboard.html | PROVIDER_CATEGORIES entry: 'UKHSA Data Dashboard': 'Health' |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| ukhsa-dashboard.browse | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — catalog taxonomy is static) |
| ukhsa-dashboard.metric_data | $0 (free, no auth) | $0.002 | ~100% | 3600s (1h — surveillance data updates on a daily/weekly reporting cadence) |

---

## Notes

- End-to-end verified directly against the adapter class (`UkhsaDashboardAdapter.call()`) rather
  than a full paid REST round-trip: no funded test wallet exists in this sandboxed batch role.
  Confirmed live: themes list (4), sub_themes list (10 for infectious_disease), a
  space-containing `geography_type` ("UKHSA Region") round-tripping correctly through
  `encodeURIComponent`, a 422 rejection for `sub_theme` supplied without `theme`, and a full
  `metric_data` call (`COVID-19_cases_casesByDay`, England, year=2023) returning 365 real daily
  case counts. Separately confirmed via plain `curl` against the live REST endpoint
  (`/api/v1/tools/ukhsa-dashboard.browse/call`) that the payment pipeline correctly gates the tool
  with a well-formed x402 402 challenge (`price_usd: 0.001`, correct `payment_address`) — the
  ESCROW stage is wired correctly for this tool.
- `npx tsx scripts/seed.ts` upserted both new tools (confirmed present in Postgres via direct
  Prisma query: `ukhsa-dashboard.browse`, `ukhsa-dashboard.metric_data`). The script's separate
  `seedTestAgent()` step failed afterward with the same pre-existing, unrelated Prisma UUID error
  documented in every prior UC's notes since UC-643 (`Agent.agent_id` column is typed `uuid` in
  Postgres but the seed script's hardcoded `TEST_AGENT_ID` value `'test-agent-001'` is not a valid
  UUID) — confirmed unmodified by this onboarding, out of scope to fix here.
- **Concurrent working-tree state observed at onboarding time (not caused by ukhsa-dashboard):** a
  separate in-progress process had already `git add`-staged unrelated changes in this shared
  working tree (`prisma/schema.prisma` +4 lines, a new `prisma/migrations/0004_add_upstream_cost_usd/`
  migration, `scripts/migrate-upstream-cost.py`, `scripts/seed.ts` +15 lines, and
  `src/pipeline/stages/tool-status.stage.ts` +67 lines — apparently an "upstream cost" pricing
  feature) at the time this onboarding began. This onboarding's commit used explicit pathspecs
  (`git commit <specific files>`) rather than `git commit -a`/`git add -A` to avoid bundling that
  unrelated staged work into this commit. Confirms the same class of hazard documented in UC-652's
  notes (shared working tree, not exclusively owned by one role) — always inspect `git status`
  before committing and commit only the files this onboarding actually touched.
