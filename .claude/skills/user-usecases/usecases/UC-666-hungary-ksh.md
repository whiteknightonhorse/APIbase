# UC-666: Hungary KSH — Központi Statisztikai Hivatal High-Value Datasets (hungary-ksh)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-666 |
| **Provider** | Hungarian Central Statistical Office (KSH) — data.ksh.hu |
| **Domain** | data.ksh.hu |
| **Category** | finance (dashboard/tool-definitions: `finance` — closest existing category, consistent with czso/statistik-austria/ine-spain/ilostat/bundesbank-timeseries national-statistics catalogs) |
| **Theme** | EU High-Value Datasets (HVD) open-data portal — exactly 13 datasets mandated by Commission Implementing Regulation (EU) 2023/138 (population, national accounts, prices, industrial production, tourism, etc.), DCAT-AP RDF/XML metadata + semicolon-CSV / SDMX-ML data files |
| **Date** | 2026-09-02 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE (local) |
| **Region** | Hungary |
| **Pricing Model** | free upstream (no auth) |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

KSH publishes exactly 13 High-Value Datasets (the EU-mandated HVD categories under Commission
Implementing Regulation (EU) 2023/138) at `data.ksh.hu`. There is no catalog/search JSON API
beyond a single flat `datasets.json` list of all 13 entries — confirmed live that the documented
API base is `data.ksh.hu/` and not `data.ksh.hu/api/v1` as the original onboarding candidate line
stated (no `/api/v1` path exists, verified 404). Per-dataset metadata is DCAT-AP RDF/XML
(`metadata.rdf`), hand-parsed with regex (no XML dependency added to this project — same approach
as bundesbank-timeseries and usgs-mrds). Each dataset's `dcat:distribution` list mixes two data
formats with no consistent pattern per dataset: semicolon-delimited quoted CSV, and SDMX-ML 2.0
"CompactData" XML.

| Aspect | Details |
|--------|---------|
| **Free Tier** | Fully open, no signup, no API key |
| **Paid Tier** | N/A — no paid tier exists |
| **Auth Model** | None |
| **License** | CC BY 4.0 (every sampled distribution's `dct:license` resolves to creativecommons.org/licenses/by/4.0), no resale restriction — same class as other national-statistics-office providers already onboarded (czso, statistik-austria, ine-spain) |
| **Quota** | No documented rate limit found; no rate-limit response headers observed |
| **Global Availability** | Reachable from this host, standard HTTPS |
| **Status** | Production |

---

## API Endpoints Verified

| # | Endpoint | Method | Description |
|---|----------|--------|--------------|
| 1 | `/datasets.json` | GET | Flat list of all 13 HVD dataset entries (id, hu/en titles, keywords, themes) — not paginated, no search param |
| 2 | `/datasets/{id}/metadata.rdf` | GET | DCAT-AP RDF/XML metadata for one dataset: title, description, and the `dcat:distribution` list (distribution id, format, download URL, temporal coverage, license) |
| 3 | distribution `download_url` (from metadata.rdf) | GET | The actual data file for one distribution — either semicolon-delimited quoted CSV or SDMX-ML 2.0 "CompactData" XML, no consistent format per dataset |

Live-measured before implementation: `datasets.json` returns 13 entries; a 4.5MB SDMX-ML
distribution fetched in ~3.3s, but a 26.7MB file took 45s (server-side generation is slow for
large SDMX exports, not just transfer). `data.ksh.hu/api/v1/...` (the candidate line's assumed
base) 404s — no such path exists.

### Research Quirk — gzip'd Content-Length hides the true decoded size, so the byte cap is enforced twice

Large SDMX-ML exports are highly repetitive (attribute names/values repeat per observation) and
compress roughly 10x under gzip. A fast-path check against the wire `Content-Length` header alone
is **not sufficient** — a 61MB decoded document's compressed Content-Length can slip under the
5MB `MAX_DATA_BYTES` cap (confirmed live: one distribution parsed in 11s instead of being
rejected, because its compressed size read under the cap). `fetchDataFile()` therefore checks
`Content-Length` first as a fast-path reject, then re-checks `Buffer.byteLength()` of the actually
decoded text as the authoritative guard, rejecting with `RESPONSE_TOO_LARGE`/502 and a pointer to
the raw `download_url` — same class of guard as czso's ZIP rejection.

### Research Quirk — two incompatible data formats (CSV vs SDMX-ML) with no consistent pattern per dataset, parsed by two hand-rolled regex parsers

`dcat:format` on each distribution resolves to either `CSV` (semicolon-delimited, quote-aware,
parsed by `parseSemicolonCsv()`) or `XML` (SDMX-ML 2.0 CompactData — flat `<Series ATTR=".."><Obs
TIME_PERIOD=".." OBS_VALUE=".."/></Series>` with no nested text content, parsed by
`parseSdmxCompactData()` via attribute-only regex, merging each Series' attributes with each
nested Obs' attributes into one flat row; header is the ordered union of every attribute name
observed). Any other declared format is rejected with `INPUT_REJECTED`/422 and a pointer to the
raw `download_url`. `dataset_data` applies the same generic `filter_column`/`filter_value` +
`limit`/`offset` pattern as czso.dataset_data since column names differ per distribution (no
shared schema across the 13 datasets).

### Research Quirk — `dataset_id` and `distribution_id` are both UUIDs; validated client-side with a regex before any upstream call

Both `data.ksh.hu` id spaces are UUIDs (e.g. `f44d314b-bc27-40a7-b34e-af01b3c4ab05` for
Population). `requireDatasetId()`/`requireDistributionId()` reject non-UUID input with
`INPUT_REJECTED`/422 before any network call, pointing the agent at `dataset_search`/
`dataset_metadata` respectively to find a valid id — avoids a wasted upstream round-trip on
obviously malformed input.

---

## Tool Mapping

| # | Tool ID | mcpName | Description | Price |
|---|---------|---------|--------------|-------|
| 1 | hungary-ksh.dataset_search | hungary-ksh.reference.dataset_search | Search/browse the 13 High-Value Datasets by an optional query substring across hu+en titles/keywords/themes | $0.001 |
| 2 | hungary-ksh.dataset_metadata | hungary-ksh.reference.dataset_metadata | Full metadata for one dataset (title, description, distribution list with format/download URL/temporal coverage/license) | $0.001 |
| 3 | hungary-ksh.dataset_data | hungary-ksh.series.dataset_data | Fetch + filter one distribution's rows (CSV or SDMX-ML, both parsed into the same header + rows shape) | $0.002 |

All 3 tools: category `finance`, annotations `READ_ONLY`.

---

## Input Schemas

Defined in `src/schemas/hungary-ksh.schema.ts`, all `.strip()`ped Zod objects:

- `dataset_search`: `query` (optional string, case-insensitive substring on hu+en titles/keywords/themes),
  `limit` (optional 1-13, default 13), `offset` (optional >=0, default 0)
- `dataset_metadata`: `dataset_id` (required string, UUID)
- `dataset_data`: `dataset_id` (required string, UUID), `distribution_id` (required string, UUID),
  `filter_column` (optional string, must match a header column returned by this same tool; requires
  `filter_value`), `filter_value` (optional string, case-insensitive substring match), `limit`
  (optional 1-500, default 50), `offset` (optional >=0, default 0)

---

## Implementation Files

| File | Purpose |
|------|---------|
| src/adapters/hungary-ksh/index.ts | HungaryKshAdapter — custom call() dispatch for all 3 tools (RDF/XML metadata + CSV + SDMX-ML parsing, not BaseAdapter's single-JSON-shape call()) |
| src/adapters/hungary-ksh/types.ts | Raw dataset list / DCAT-AP distribution / parsed table shapes |
| src/schemas/hungary-ksh.schema.ts | Zod schemas for all 3 tools |
| src/adapters/registry.ts | case 'hungary-ksh' to HungaryKshAdapter |
| src/schemas/index.ts | hungaryKshSchemas spread |
| src/mcp/tool-definitions.ts | 3 tool definitions, category finance |
| config/tool_provider_config.yaml | 3 tool entries, provider hungary-ksh, price_usd 0.001-0.002, cache_ttl 3600-86400 |
| src/config/provider-limits.json | Dashboard entry, no documented rate limit |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| hungary-ksh.dataset_search | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — fixed 13-entry catalog, near-static) |
| hungary-ksh.dataset_metadata | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — DCAT-AP metadata rarely changes between revisions) |
| hungary-ksh.dataset_data | $0 (free, no auth) | $0.002 | ~100% | 3600s (1h — data files can update; larger CSV/SDMX-ML parse work justifies the higher price vs. metadata) |

---

## Notes

- Adapter logic verified against real upstream data via direct fetch against every endpoint before
  implementation (see API Endpoints Verified above): `dataset_search` against the real
  `datasets.json` returns all 13 HVD datasets; `dataset_metadata` for a real `dataset_id` returns
  parsed hu/en titles + a non-empty distribution list; `dataset_data` was verified against both a
  CSV distribution and an SDMX-ML distribution, confirming both parsers produce the same
  header+rows shape and that `filter_column`/`filter_value` narrows rows correctly.
- The `MAX_DATA_BYTES` (5MB) two-stage guard (`Content-Length` fast-path + post-decode
  `Buffer.byteLength` authoritative check) was added specifically because a gzip'd SDMX-ML
  response's compressed Content-Length can misreport the true decoded size — see Research Quirk
  above. This is the same defensive pattern as czso's ZIP rejection (UC-664), applied to a
  different failure mode (compression ratio, not unsupported format).
- `dataset_id`/`distribution_id` UUID validation happens client-side before any upstream call,
  avoiding a wasted round-trip on malformed input and giving the agent a precise 422 pointing at
  the correct discovery tool (`dataset_search` or `dataset_metadata`).
- This UC file was backfilled after onboarding (commit `c4e7dba feat: integrate hungary-ksh — 3
  tools (UC-666)`) because the sandboxed onboarding role's `record-hungary-ksh` step could not get
  write approval for files under `.claude/` in headless mode — a structural permission gap in that
  role, not a content decision. All facts above were sourced directly from the real adapter,
  schema, tool-definitions, and config files already committed, not invented.
- Not published to Smithery and not pushed to the remote by this documentation-only step — per
  batch-mode conventions the hourly batch-pusher / next Smithery republish handles both, and this
  step's boundaries are documentation-only inside `.claude/skills/user-usecases/`.
