# UC-667: Slovakia Statistics — Statistical Office of the Slovak Republic "DATAcube." (slovakia-statistics)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-667 |
| **Provider** | Statistical Office of the Slovak Republic ("DATAcube.") — data.statistics.sk |
| **Domain** | data.statistics.sk |
| **Category** | finance (dashboard/tool-definitions: `finance` — closest existing category, consistent with czso/statistik-austria/hungary-ksh/ine-spain/ilostat/bundesbank-timeseries national-statistics catalogs) |
| **Theme** | JSON-stat 2.0 REST API over the DATAcube. database — 675 statistical tables (population, earnings, prices, labour market, households, regions, etc.) |
| **Date** | 2026-09-02 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE (local) |
| **Region** | Slovakia |
| **Pricing Model** | free upstream (no auth) |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

The Statistical Office of the Slovak Republic publishes 675 statistical tables via a JSON-stat 2.0
REST API at `data.statistics.sk/api/v2` — no auth, no registration, CC BY 4.0. There is no
catalog/search endpoint beyond a single flat `collection.json` list of all 675 tables (same class
of API gap as czso/statistik-austria/hungary-ksh) — `dataset_search` filters it client-side by
label substring. Individual dimension value lists are fetched via `/dimension/{cube_code}/
{dim_code}`, and data via `/dataset/{cube_code}/{val1}/{val2}/...` where each path segment is a
selected VALUE code for one dimension, in the same order the collection lists that table's
dimensions — supporting single codes, comma lists, ranges (`a:b`, `a:`, `:b`), `lastN`, and `*`
wildcards.

| Aspect | Details |
|--------|---------|
| **Free Tier** | Fully open, no signup, no API key |
| **Paid Tier** | N/A — no paid tier exists |
| **Auth Model** | None |
| **License** | CC BY 4.0 ("Access to data is free and does not require registration... subject to the license terms of the Creative Commons Attribution License (cc-by) 4.0" — REST_API_HELP_EN.pdf), no resale restriction — same class as other national-statistics-office providers already onboarded (czso, statistik-austria, hungary-ksh, ine-spain) |
| **Quota** | No documented rate limit found; docs state a 2000-character URL length limit and ~10000 values per request; no rate-limit response headers observed |
| **Global Availability** | Reachable from this host, standard HTTPS |
| **Status** | Production |

---

## API Endpoints Verified

| # | Endpoint | Method | Description |
|---|----------|--------|--------------|
| 1 | `/api/v2/collection?lang=en` | GET | Flat list of all 675 tables (label, update date, per-dimension `{label, note, href}`) — cube_code parsed from each item's `href`, not a dict key |
| 2 | `/api/v2/dimension/{cube_code}/{dim_code}?lang=en` | GET | One dimension's full category list (`code → position` index, optional `code → label` map) |
| 3 | `/api/v2/dataset/{cube_code}/{val1}/{val2}/...?lang=en&type=json` | GET | Data for the selected value combination, JSON-stat 2.0 cube (`id`, `size`, `role`, `dimension`, flattened row-major `value` array) |

Live-measured before implementation: `collection?lang=en` is 565KB / ~3.5s; individual
`dimension`/`dataset` calls are small and fast (<1s each).

### Research Quirk — dataset path segments are VALUE codes, not dimension NAMES (onboarding initially got this backwards)

`REST_API_HELP_EN.pdf` documents the data URL as `/dataset/cube_code/PARAM1/PARAM2/PARAM3...`
where "PARAM1, PARAM2 .... are the element codes of the selected table dimensions" — i.e. each
path segment is a VALUE for one dimension, supplied in the table's dimension order, not the
dimension's own code/name. Passing dimension NAMES instead (e.g.
`/dataset/as1001rs/as1001rs_rok/as1001rs_ukaz/as1001rs_poh`) returns **HTTP 200 with an
always-empty cube** (`size: [0,0,0,1]`, `value: []`) — confirmed live before implementation, and
only resolved by downloading and reading the upstream PDF help doc (no machine-readable OpenAPI/
Swagger spec exists — `/api/v2/openapi.json`, `/swagger.json`, `/help` all 400; only
`/api/help/REST_API_HELP_(EN|SK).(pdf|docx)` exist as static files).

### Research Quirk — a value with no match returns HTTP 200 with an empty cube, not an error

Requesting a syntactically valid but non-existent value code (e.g. year `9999`) returns HTTP 200
with `category: []` (an empty ARRAY, not `{index:{...}}`) for that dimension and `value: []` —
silent-empty, same class as ine-spain/statistik-austria's unrecognized-id behavior. An unrecognized
`cube_code` is different: it returns a genuine `HTTP 400 {"status":400,"status_message":"Name API
not foud: {code}"}` (upstream's own typo, "not foud") — both cases are handled explicitly and
distinctly (`no_data: true` empty-result payload vs. `INPUT_REJECTED`/422).

### Research Quirk — the collection's per-item `dimension` object already excludes the metric dimension

Each collection item's `id`/JSON-stat structure implicitly has one extra "metric" dimension (e.g.
`as1001rs_data`, always a single fixed `NUM_VALUE` category) beyond the dimensions a caller
actually selects — but the collection's `dimension` map only lists the SELECTABLE dimensions
(confirmed against `role.metric` in a full dataset response), so `dataset_search`/
`dataset_metadata`/`dataset_data` never need to special-case or filter out a metric dimension by
name pattern.

### Research Quirk — ~40 of 675 tables have no `label` field at all (found live during adapter verification, fixed before commit)

A first verification run against the live API crashed with `Cannot read properties of undefined
(reading 'toLowerCase')` — 40 of 675 collection items omit `label` entirely (confirmed via a
Python scan of the full collection response), not just an empty string. Fixed by treating
`SkCollectionItem.label` as optional throughout (`it.label ?? ''` for search matching, `?? null`
for display), re-verified against live data after the fix.

### Research Quirk — JSON-stat's flattened `value` array is generic row-major, decoded without a library

The `value` array is a flattened cube in row-major order (last dimension varies fastest) over the
non-metric dimensions in `id` order. `decodeJsonStat()` computes strides generically from each
selected dimension's actual returned category size (works for any dimension count — observed 2 to
8 across the 675 tables) and reconstructs one row per data point with each dimension's code+label
and the value, rather than depending on a fixed dimension count/order per table.

---

## Tool Mapping

| # | Tool ID | mcpName | Description | Price |
|---|---------|---------|--------------|-------|
| 1 | slovakia-statistics.dataset_search | slovakia-statistics.reference.dataset_search | Search/browse the 675 tables by an optional query substring across labels and cube codes | $0.001 |
| 2 | slovakia-statistics.dataset_metadata | slovakia-statistics.reference.dataset_metadata | Dimensions + full value-code list for one table, needed to build a `selections` object | $0.001 |
| 3 | slovakia-statistics.dataset_data | slovakia-statistics.series.dataset_data | Fetch data rows for one table + selection (one value per dimension: single code, comma list, range, `lastN`, or `*` wildcard) | $0.002 |

All 3 tools: category `finance`, annotations `READ_ONLY`.

---

## Input Schemas

Defined in `src/schemas/slovakia-statistics.schema.ts`, all `.strip()`ped Zod objects:

- `dataset_search`: `query` (optional string, case-insensitive substring on label/cube_code),
  `limit` (optional 1-100, default 50), `offset` (optional >=0, default 0)
- `dataset_metadata`: `cube_code` (required string, e.g. `"as1001rs"`)
- `dataset_data`: `cube_code` (required string), `selections` (required `Record<string,string>` —
  one value per dimension, from `dataset_metadata`), `limit` (optional 1-1000, default 200),
  `offset` (optional >=0, default 0)

---

## Implementation Files

| File | Purpose |
|------|---------|
| src/adapters/slovakia-statistics/index.ts | SlovakiaStatisticsAdapter — custom call() dispatch for all 3 tools (multi-step collection+dimension+dataset fetches, generic JSON-stat row-major decode) |
| src/adapters/slovakia-statistics/types.ts | Collection/dimension/dataset JSON-stat response shapes |
| src/schemas/slovakia-statistics.schema.ts | Zod schemas for all 3 tools |
| src/adapters/registry.ts | case 'slovakia-statistics' to SlovakiaStatisticsAdapter |
| src/schemas/index.ts | slovakiaStatisticsSchemas spread |
| src/mcp/tool-definitions.ts | 3 tool definitions, category finance |
| config/tool_provider_config.yaml | 3 tool entries, provider slovakia-statistics, price_usd 0.001-0.002, cache_ttl 3600-86400 |
| src/config/provider-limits.json | Dashboard entry, no documented rate limit |
| static/dashboard.html | PROVIDER_CATEGORIES entry: "Slovakia Statistics (DATAcube.)" → "Country Data" |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| slovakia-statistics.dataset_search | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — 675-table catalog structure is near-static) |
| slovakia-statistics.dataset_metadata | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — dimension/category lists per table rarely change) |
| slovakia-statistics.dataset_data | $0 (free, no auth) | $0.002 | ~100% | 3600s (1h — data updates twice daily per docs; multi-fetch + JSON-stat decode work justifies the higher price vs. metadata) |

---

## Notes

- Adapter logic verified directly against real upstream data (bypassing the paid pipeline, via a
  standalone `tsx` script calling `SlovakiaStatisticsAdapter.call()`): `dataset_search` for
  "Population and attributes of age" correctly resolved `as1001rs`; `dataset_metadata` for
  `as1001rs` returned all 3 real dimensions (14 years, 25 indicators, 3 genders) with correct
  code→label mappings; `dataset_data` for `2020:2022`/`UKAZ01`/`TOTAL` returned 3 rows with real
  Slovak population figures (5,459,781 → 5,434,712 → 5,428,792, a plausible declining trend);
  the missing-dimension error, upstream-empty-cube (`no_data: true`), and unknown-`cube_code`
  cases were all exercised and returned the correct structured errors/payloads.
- A real bug (missing-`label` crash) was found and fixed during this same verification pass — see
  Research Quirk above — before the Docker image was rebuilt and redeployed.
- Every generic decode path (`decodeJsonStat`, `categoryEntries`) works for any dimension count —
  spot-checked against the collection's own distribution (2 to 8 dimensions across 675 tables) —
  rather than hardcoding the 3-4 dimensions seen in the examples used for design.
- `SELECTION_VALUE_RE` is a strict allow-list (`[A-Za-z0-9,:*_-]`) rather than
  `encodeURIComponent()`, because the upstream API's own selection syntax requires `,`/`:`/`*`
  unescaped in the path — `encodeURIComponent()` would percent-escape those separators and break
  every multi-value/range/wildcard selection. No character outside the allow-list (including `/`)
  can reach the URL, so the allow-list itself is the path-injection guard (CWE-116) for this field.
