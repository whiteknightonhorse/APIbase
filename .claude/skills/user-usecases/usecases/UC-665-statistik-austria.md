# UC-665: Statistik Austria (Statistics Austria) open-data portal (statistik-austria)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-665 |
| **Provider** | Statistik Austria (Statistics Austria) — data.statistik.gv.at |
| **Domain** | data.statistik.gv.at |
| **Category** | economic-indicators (dashboard/tool-definitions: `finance` — closest existing category, consistent with oecd-data/ilostat/istat/bundesbank-timeseries/ine-portugal/ine-spain/czso national-statistics catalogs) |
| **Theme** | OGD Austria Metadata 2.3 open-data portal (~540 datasets), no catalog/search JSON API — only a scraped HTML catalog page, per-dataset JSON metadata, and semicolon-delimited CSV data + categorical code lookups |
| **Date** | 2026-09-02 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE (local) |
| **Region** | Austria |
| **Pricing Model** | free upstream (no auth) |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

Austria's national statistics office publishes ~540 statistical datasets (population, consumer
prices, labour market, foreign trade, industry indices, wage structure) as public, no-auth files
under the "OGD Austria Metadata 2.3" convention at `data.statistik.gv.at`. Unlike the SDMX/CKAN
national-statistics offices already onboarded (oecd-data, ilostat, istat, bundesbank-timeseries,
ine-portugal, ine-spain, czso), there is **no catalog/search JSON API at all** — the CKAN Action
API (`api/3/action/package_list`) 302-redirects to a login page and every `*_list`/`*_search` path
tried 404s. The only place the full dataset id + title list exists is the human-facing
`web/catalog.jsp` HTML page.

| Aspect | Details |
|--------|---------|
| **Free Tier** | Fully open, no signup, no API key |
| **Paid Tier** | N/A — no paid tier exists |
| **Auth Model** | None |
| **License** | Creative Commons Namensnennung 4.0 International (CC BY 4.0) — stated on every sampled dataset's `license` field, no resale restriction, comparable to the other government open-data providers already onboarded |
| **Quota** | No documented rate limit found; no rate-limit response headers observed |
| **Global Availability** | Reachable from this host, standard HTTPS |
| **Status** | Production |

---

## API Overview

Candidate URL `https://data.statistik.gv.at` is the live OGD portal, confirmed against its own
"Formate"/documentation page.

| # | Endpoint | Method | Description |
|---|----------|--------|--------------|
| 1 | `/web/catalog.jsp` | GET | HTML page listing every dataset (id + title); no JSON equivalent |
| 2 | `/ogd/json?dataset={id}` | GET | Full OGD Austria Metadata 2.3 JSON for one dataset |
| 3 | `/data/{id}.csv` | GET | The dataset's main data file (semicolon-delimited, decimal-comma) |
| 4 | `/data/{id}_{dimension_code}.csv` | GET | Code -> German/English name lookup for one categorical column |

Verified live before implementation:
```
curl ".../web/catalog.jsp" -> 200, 1.06MB HTML, 540 unique dataset ids (831 raw <h4> matches —
  each dataset appears once per categorization tag it belongs to)
curl ".../ogd/json?dataset=OGD_veste309_Veste309_1" -> 200, correctly UTF-8 encoded, umlaut-heavy
  title decodes clean ("Staatsangehörigkeit")
curl ".../data/OGD_veste309_Veste309_1.json" -> 200, SAME metadata shape but MIS-ENCODED (declares
  charset=UTF-8, actually sends windows-1252 bytes for extended chars — byte 0xf6 fails strict
  UTF-8 decode) — never used by this adapter
curl ".../ogd/json?dataset=NOTREAL999" -> 200, 0-byte body (silent-empty, no error status)
curl ".../data/OGD_veste309_Veste309_1.csv" -> 200, text/csv;charset=UTF-8, 73 rows, 9 columns
curl ".../data/OGD_konjunkturmonitor_KonMon_1.csv" -> 200, 878 rows, 423KB (largest sampled)
curl ".../data/OGD_bevbewegung_BEV_BEW_3.csv" -> 200, 5,005 rows, 419KB
curl ".../data/NOTREAL999.csv" -> 404 (genuine HTTP error, not silent-empty)
curl ".../data/OGD_veste309_Veste309_1_C-STAATS-0.csv" -> 200, 9 rows, code;name;;en_name;... shape
curl ".../data/OGD_veste309_Veste309_1_C-NOTREAL-0.csv" -> 404
curl ".../api/3/action/package_list" -> 302 redirect (CKAN Action API not exposed here)
```

### Research Quirk — no catalog/search JSON API; `dataset_search` scrapes+dedupes the HTML catalog page

Every CKAN-style listing/search path (`package_list`, `package_search`, `current_package_list_with_resources`)
either 302-redirects or 404s. The only complete dataset id + title list lives in the human-facing
`web/catalog.jsp` page, where each dataset's `<h4><a href="meta.jsp?dataset=...">Title</a></h4>`
entry repeats once per categorization tag it belongs to (831 raw matches for 540 unique ids).
`statistik-austria.dataset_search` fetches this page, dedupes by `dataset_id` (keeping first
title seen), then filters client-side by an optional case-insensitive substring on title or id —
same "compensate client-side for a missing search endpoint" pattern as czso.dataset_list.

### Research Quirk — `/data/{id}.json` returns the same metadata as `/ogd/json?dataset={id}` but MIS-ENCODED

Both endpoints declare `Content-Type: application/json;charset=UTF-8` and return the identical
OGD Austria Metadata 2.3 shape, but `/data/{id}.json`'s actual bytes are windows-1252 for extended
characters (confirmed live: byte `0xf6` for "ö" fails a strict UTF-8 decode, while
`/ogd/json?dataset=...` decodes clean). `statistik-austria.dataset_metadata` only ever calls
`/ogd/json`, never the mis-encoded mirror.

### Research Quirk — an unrecognized `dataset_id` against `ogd/json` returns HTTP 200 with an EMPTY body, not an error

Same class as INE Spain's (UC-663) unrecognized-code quirk: `ogd/json?dataset={bad_id}` returns
`HTTP 200` with a 0-byte body — `JSON.parse('')` would otherwise throw, surfacing as a confusing
`INVALID_RESPONSE`/502. `fetchMetadata()` checks for an empty body explicitly and raises a 422
pointing at `dataset_search`. By contrast, an unrecognized id against `/data/{id}.csv` or
`/data/{id}_{dimension_code}.csv` returns a genuine `HTTP 404`, already classified correctly as
`INPUT_REJECTED`/422 by this adapter's shared `rawFetchText()` (2026-06-06 fault-based
classification rule).

### Research Quirk — categorical column VALUES are opaque codes, decoded by a dedicated `category_codes` tool

Data rows use cryptic column codes (`F-VESTE_AM`, `C-STAATS-0`) explained by
`dataset_metadata`'s `attribute_description`, but the categorical columns' own VALUES are ALSO
opaque codes (`STAATS-9`, `VEBDL-10`) — decoded only by a separate per-dimension resource
(`{id}_{dimension_code}.csv`, only published for "C-" columns; "F-" columns are numeric measures
with no lookup). Kept as its own atomic tool (AP-7) rather than auto-resolved inside
`dataset_data`, since decoding every categorical column of a wide row (some datasets have 4+
dimension columns) would multiply upstream calls per data request; `dataset_metadata` returns the
dataset's `category_dimensions` list so an agent knows exactly which `category_codes` calls are
worth making.

---

## Tool Mapping

| # | Tool ID | mcpName | Description | Price |
|---|---------|---------|--------------|-------|
| 1 | statistik-austria.dataset_search | statistik-austria.reference.dataset_search | Browse/search the ~540-dataset catalog (client-side substring filter, no upstream search) | $0.001 |
| 2 | statistik-austria.dataset_metadata | statistik-austria.reference.dataset_metadata | Full metadata for one dataset (title, license, column meanings, category_dimensions) | $0.001 |
| 3 | statistik-austria.dataset_data | statistik-austria.series.dataset_data | Fetch a dataset's CSV rows (1-200, decimal-comma values converted to numbers) | $0.002 |
| 4 | statistik-austria.category_codes | statistik-austria.reference.category_codes | Decode one categorical column's codes to German + English names | $0.001 |

All 4 tools: category `finance`, annotations `READ_ONLY`.

---

## Input Schemas

Defined in `src/schemas/statistik-austria.schema.ts`, all `.strip()`ped Zod objects:

- `dataset_search`: `search` (optional string, case-insensitive substring on title/id, client-filtered),
  `offset` (optional >=0, default 0), `limit` (optional 1-50, default 20)
- `dataset_metadata`: `dataset_id` (required string)
- `dataset_data`: `dataset_id` (required string), `limit` (optional 1-200, default 20), `offset` (optional >=0, default 0)
- `category_codes`: `dataset_id` (required string), `dimension_code` (required string, format `C-{NAME}-{N}`)

---

## Implementation Files

| File | Purpose |
|------|---------|
| src/adapters/statistik-austria/index.ts | StatistikAustriaAdapter — custom call() dispatch for all 4 tools (HTML scrape + JSON metadata + CSV parsing, not BaseAdapter's single-JSON-shape call()) |
| src/adapters/statistik-austria/types.ts | Raw OGD Austria Metadata 2.3 shapes + catalog entry type |
| src/schemas/statistik-austria.schema.ts | Zod schemas for all 4 tools |
| src/adapters/registry.ts | case 'statistik-austria' to StatistikAustriaAdapter |
| src/schemas/index.ts | statistikAustriaSchemas spread |
| src/mcp/tool-definitions.ts | 4 tool definitions, category finance |
| config/tool_provider_config.yaml | 4 tool entries, provider statistik-austria, price_usd 0.001-0.002, cache_ttl 3600-604800 |
| src/config/provider-limits.json | Dashboard entry, limit_type unlimited, no documented rate limit |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| statistik-austria.dataset_search | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — catalog of ~540 datasets is near-static) |
| statistik-austria.dataset_metadata | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — metadata rarely changes between annual revisions) |
| statistik-austria.dataset_data | $0 (free, no auth) | $0.002 | ~100% | 3600s (1h — some series, e.g. the economic monitor, update within a year; larger CSV parse work justifies the higher price vs. metadata/codes) |
| statistik-austria.category_codes | $0 (free, no auth) | $0.001 | ~100% | 604800s (7d — category code sets, e.g. federal states/citizenship groupings, essentially never change) |

---

## Notes

- Adapter logic was verified with real upstream data via direct `curl` against every endpoint
  before implementation (see API Overview above), and again end-to-end through
  `StatistikAustriaAdapter.call()` directly (bypassing the pipeline's auth stage, since this
  sandboxed role has no working authenticated test key from `seedTestAgent()` — see below), using
  a freshly self-registered agent (`POST /api/v1/agents/register`) for pipeline-level 400/402
  verification: `dataset_search` with `search: "Bevölkerung"` returned 56 real matching datasets;
  `dataset_metadata` for `OGD_veste309_Veste309_1` returned the real German+English titles, license,
  `column_meanings`, and `category_dimensions`; `dataset_data` for the same id returned real rows
  with decimal-comma values correctly converted to JSON numbers (e.g. `"17,60"` -> `17.6`);
  `category_codes` for `C-STAATS-0` returned the real 9-value citizenship code table
  (`STAATS-9` -> "Insgesamt"/"Total", `STAATS-7` -> "Türkei"/"Turkey", ...). Error paths verified
  directly: an unrecognized `dataset_id` returns `422 provider_input_rejected` ("use
  statistik-austria.dataset_search to find a valid id"); a malformed `dimension_code` (not matching
  `C-{NAME}-{N}`) returns `422` pointing at `dataset_metadata`'s `category_dimensions` field.
- One transient `ConnectTimeoutError` (IPv6 route to `data.statistik.gv.at` hanging past undici's
  10s connect timeout, immediately succeeding on retry over IPv4) was observed once during manual
  verification — not a code defect, and no retry logic was added since `rawFetchText()` matches
  czso's precedent (single attempt, no built-in retry); flagged here in case it recurs in
  production monitoring.
- `npx tsx scripts/seed.ts` upserted all 4 new tools ("Upserted 1351 tools"). The script's separate
  `seedTestAgent()` step failed afterward with the same pre-existing, unrelated Prisma UUID error
  documented in every prior UC's notes since UC-643 (`Agent.agent_id` is a Postgres `uuid` column
  but the seed script's hardcoded `TEST_AGENT_ID` is not a valid UUID) — confirmed unmodified by
  this onboarding; a freshly self-registered agent was used instead for pipeline-level verification.
- Local production stack (this host's Docker containers) rebuilt and redeployed cleanly: TS
  compile 0 errors, ESLint 0 errors, container healthy, `/api/v1/tools` shows 1330 tools with
  `has_more:false`, dashboard shows `tool_count:4` for `statistik-austria` with `limits.status:
  green`, and all 4 tools have populated `input_schema` + non-trivial descriptions.
- `next_uc_number` in `.claude/skills/resort/candidates-registry.json` was `665` (no stray
  reservation found for `statistik-austria`) at the time this step ran — read fresh per the
  skill's Step 10 rule, used as this UC's number, and incremented to `666` in the same step.
- Not published to Smithery and not pushed to the remote per this run's BATCH MODE instructions —
  the hourly batch-pusher handles both.
