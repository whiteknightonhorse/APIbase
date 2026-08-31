# UC-642: EU Open Data Portal (data-europa)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-642 |
| **Provider** | EU Open Data Portal |
| **Domain** | data.europa.eu/api/hub/search |
| **Category** | World |
| **Theme** | Pan-EU/EEA open dataset catalog search |
| **Date** | 2026-08-31 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE |
| **Region** | EU / EEA |
| **Pricing Model** | free upstream |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

The EU Open Data Portal (data.europa.eu) is the Publications Office of the EU's aggregation catalog
of 1M+ open datasets harvested from ~211 national, regional, and EU-institution data portals across
the EU/EEA (e.g. `gdi-de` Germany, `govdata` Germany, `geocat-li` Liechtenstein, `london-datastore`
UK, `opendata-swiss` Switzerland) plus EU institutions themselves (`jrc`, `frontex`, `olaf`, etc.).
It exposes the "Hub-Search" API (`data.europa.eu/api/hub/search`), an Elasticsearch-backed metadata
search service built on DCAT-AP, with no authentication required for read-only search/browse.

| Aspect | Details |
|--------|---------|
| **Free Tier** | Unlimited queries, no signup, no API key |
| **Paid Tier** | None |
| **Auth Model** | None |
| **License** | Varies per source dataset/catalogue (most are open-reuse; only metadata is exposed, resource file content is never fetched) |
| **Quota** | No rate-limit headers observed, no documented request quota |
| **Global Availability** | Reachable from this host, standard HTTPS |
| **Status** | Stable, production Hub-Search API v5.3.11 |

Like HDX (UC-638) and open-canada (UC-641), only catalog metadata is exposed — dataset resource file
content is never fetched, only pointers (format, download URL). Unlike those two, this portal
federates hundreds of *other* CKAN/DCAT-AP portals rather than being one CKAN instance itself, so
per-dataset licensing genuinely varies by the harvested source portal — resource `license` fields are
surfaced but not filtered on.

---

## API Overview

Full spec discovered via the ReDoc page's embedded `openapi.yaml`
(`https://data.europa.eu/api/hub/search/openapi.yaml`) — the interactive docs page itself is a
client-rendered Redoc SPA that returns no useful content to a non-JS fetch.

| # | Endpoint | Method | Auth | Description |
|---|----------|--------|------|--------------|
| 1 | `/search?q=...&filters=dataset&facets={"country":[...],"categories":[...]}&limit=...&includes=...` | GET | None | Elasticsearch dataset search with field-selection (`includes`) |
| 2 | `/ckan/package_show?id=...` | GET | None | CKAN-compatibility shim — full metadata + resource list for one dataset |
| 3 | `/vocabularies/data-theme` | GET | None | The 14-value DCAT-AP theme taxonomy |
| 4 | `/catalogues` | GET | None | List of ~211 source catalogue ids |

Base URL: https://data.europa.eu/api/hub/search

Verified live before implementation:
```
curl -G "https://data.europa.eu/api/hub/search/search" --data-urlencode "q=climate" --data-urlencode "limit=1"
-> {"result":{"count":21332,"results":[{...}]}}
```

Endpoints NOT used (require `BearerAuth`/`ApiKeyAuth` per the spec, reserved for
authenticated CRUD): `GET /datasets/{id}` (DCAT-AP native dataset read), `POST/PUT/PATCH/DELETE` on
every resource. `GET /organizations` was also tried but returns an empty result set on this portal
(`{"status":"success","result":[]}`) — unlike `/catalogues`, it is not populated — so `catalogue_list`
was used instead of an organization-based reference tool.

### Research Quirk — nearly every /search field is a ~25-language multilingual object

Unlike CKAN portals (HDX, open-canada), a single `/search` result for `title`/`description`/
`catalog.title`/`categories[].label` is a dict keyed by ISO 639-1 language code with ~25-27 entries
each (`en`, `de`, `fr`, `bg`, `el`, ... every EU official language). A single unfiltered result is
~13.8KB; 20 results without field trimming would be ~276KB of near-entirely-unused translations. The
`includes` query param (undocumented outside the OpenAPI spec's `Filter queries by document fields`
description) restricts which top-level fields the API returns — `dataset_search` requests only
`id,title,description,catalog,country,categories,issued,modified,distributions` — and the adapter
then flattens every multilingual field to a single locale (`locale` param, default `en`, falling back
to `en` then the first available language if the requested locale is missing) before returning to the
agent, cutting response size by roughly a factor of 20-25.

The `/ckan/package_show` shim (used for `dataset_detail`) behaves differently: `title`/`notes` are
already flattened to a **single plain string** server-side (in the source dataset's own original
language, not necessarily English — verified against a German geospatial dataset where `title` was
plain `"Sonnenhalde"`, not a dict). `organization.title` on that same endpoint, however, is still a
multilingual dict. The adapter's `localize()` helper handles both shapes defensively (string
passthrough vs. dict flatten) since the API is not internally consistent about which fields are
localized at fetch time vs. serialization time.

### Research Quirk — facet-based filtering syntax, verified field-by-field

The `facets` query param (`facets={"country":["de"]}` — JSON-encoded, combined with `filters=dataset`)
filters (not just aggregates) the result set. Verified live: `country` accepts a lowercase 2-letter
ISO code array (`"de"`, `"fr"` — NOT the 3-letter `"deu"` form used in the `country.resource` URL,
which returns 0 results); `categories` accepts the 14 fixed data-theme codes (`"ENVI"`, `"HEAL"`,
etc. — verified against `/vocabularies/data-theme`). An invalid/unrecognized `categories` code
silently returns 0 results rather than an error (same silent-empty class as world-bank-cckp/
bank-of-england), so `theme` is `z.enum()`-constrained in the schema to the 14 verified-live values
rather than accepting free text.

### Research Quirk — `ckan/package_show` resource `access_url` is sometimes a JSON-stringified array

While `/search`'s `distributions[].access_url` is a genuine JSON array, `/ckan/package_show`'s
`resources[].access_url` is occasionally a **string containing a JSON-encoded array literal** (e.g.
`"[\"https://...\"]"`) rather than either a plain URL string or a real array — an inconsistency
between the two response shapes for what is conceptually the same field. The adapter's
`firstAccessUrl()` helper detects a leading `[` and attempts `JSON.parse`, falling back to the raw
string if parsing fails, so `dataset_detail.distributions[].download_url` is always a clean URL
string regardless of which shape the upstream returned.

---

## Tool Mapping

| # | Tool ID | mcpName | Description | Price |
|---|---------|---------|--------------|-------|
| 1 | data-europa.dataset_search | data-europa.datasets.search | Search datasets by query/country/theme | $0.002 |
| 2 | data-europa.dataset_detail | data-europa.datasets.detail | Full metadata + resource list for one dataset | $0.002 |
| 3 | data-europa.theme_list | data-europa.reference.theme_list | The 14 fixed DCAT-AP data themes | $0.001 |
| 4 | data-europa.catalogue_list | data-europa.reference.catalogue_list | The ~211 source national/regional/EU catalogues | $0.001 |

All 4 tools: category world, annotations READ_ONLY.

- `theme_list` and `catalogue_list` are reference/lookup tools — `theme_list`'s output (theme code)
  feeds directly into `dataset_search`'s `theme` filter; the natural discovery flow is
  list-themes -> search-datasets -> get-detail (same pattern as HDX UC-638 / open-canada UC-641).
- `catalogue_list` returns only source-portal ids (no titles — the upstream `/catalogues` endpoint is
  documented as returning "an array with IDs of all the catalogues" only, no per-catalogue metadata in
  the list response; per-catalogue detail would require ~211 individual `/catalogues/{id}` calls,
  out of scope for a single tool call) — still useful for agents that want to filter `dataset_search`
  results by a known national-portal slug they recognize (e.g. `govdata`, `london-datastore`).

---

## Input Schemas

Defined in `src/schemas/data-europa.schema.ts`, all `strip()`ped Zod objects:

- `dataset_search`: `query` (string, optional), `country` (string, optional, 2-letter lowercase ISO
  code), `theme` (enum of 14 fixed DCAT-AP theme codes, optional), `locale` (string, optional,
  2-letter language code, default "en"), `limit` (integer, optional, 1-20, default 10).
- `dataset_detail`: `id` (string, required, data.europa.eu dataset id), `locale` (string, optional,
  2-letter language code, default "en" — applies only to fields still multilingual at the CKAN-shim
  layer, e.g. `organization.title`).
- `theme_list`: `locale` (string, optional, 2-letter language code, default "en").
- `catalogue_list`: `query` (string, optional, substring filter on catalogue id), `limit` (integer,
  optional, 1-211, default 50).

The adapter validates `country` against `^[a-z]{2}$`, `theme` against the fixed 14-value enum, and
`id` against `^[A-Za-z0-9._-]{1,120}$` before building the request, surfacing a 422
`INPUT_REJECTED` with a corrective message rather than forwarding malformed input.

---

## Implementation Files

| File | Purpose |
|------|---------|
| src/adapters/data-europa/index.ts | DataEuropaAdapter — all 4 tools |
| src/adapters/data-europa/types.ts | Raw Hub-Search/CKAN-shim/Vocabulary API + normalized output types |
| src/schemas/data-europa.schema.ts | Zod schemas for all 4 tools |
| src/adapters/registry.ts | case 'data-europa' to DataEuropaAdapter |
| src/schemas/index.ts | dataEuropaSchemas spread |
| src/mcp/tool-definitions.ts | 4 tool definitions, category world |
| config/tool_provider_config.yaml | 4 tool entries, provider data-europa, price_usd 0.001-0.002, cache_ttl 3600/86400 |
| src/config/provider-limits.json | Dashboard entry, limit_type unlimited |
| static/dashboard.html | PROVIDER_CATEGORIES entry: 'EU Open Data Portal' -> 'Country Data' |
| scripts/test-data-europa.sh | Smoke test (catalog, schema, dashboard, OpenAPI, upstream sanity) |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| data-europa.dataset_search | $0 (free, no auth) | $0.002 | ~100% | 3600s (1h — datasets updated regularly across 211 source portals) |
| data-europa.dataset_detail | $0 (free, no auth) | $0.002 | ~100% | 3600s (1h — resource lists can be updated) |
| data-europa.theme_list | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — fixed 14-value DCAT-AP taxonomy, effectively static) |
| data-europa.catalogue_list | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — catalogue registrations change rarely) |

---

## Notes

- Live payment-gated verification: could not complete a full paid x402/MPP round-trip from this
  sandboxed batch role (no wallet key access). Instead verified end-to-end adapter correctness
  directly (buildRequest -> live upstream HTTP call -> parseResponse logic traced manually against
  captured live responses for all 4 tools, plus the country/theme/id validation error paths) against
  the real `data.europa.eu` API — confirmed real dataset/theme/catalogue data returned. Catalog/
  schema/dashboard/OpenAPI wiring verified via the local docker stack REST API (health,
  `/api/v1/tools`, `/api/v1/dashboard`, `/.well-known/openapi.json`) same as prior sandboxed
  onboardings.
- `server-card.json` regenerated via the Step 14b regen procedure (backward-search parser,
  2026-04-09 fix) — verified 0 tools with non-3-level `mcpName` after regeneration.
- `scripts/sync-counts.sh` run afterward per the mandatory Step 12 procedure.

## Next Steps

- [x] No registration needed
- [x] Onboarded via night-orchestra batch role — adapter, schemas, registry, config, seed, build, deploy all live
