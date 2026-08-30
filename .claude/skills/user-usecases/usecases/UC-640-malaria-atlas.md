# UC-640: Malaria Atlas Project (MAP)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-640 |
| **Provider** | Malaria Atlas Project (MAP), University of Oxford |
| **Domain** | data.malariaatlas.org/geoserver/ows |
| **Category** | Health (Public Health) |
| **Theme** | Malaria epidemiology surveys, case estimates, mosquito vector occurrence |
| **Date** | 2026-08-30 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE |
| **Region** | Global |
| **Pricing Model** | free upstream |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

The Malaria Atlas Project (MAP) is a University of Oxford research group producing the world's
primary open geospatial database on malaria risk and burden. The candidate URL given
(`malariaatlas.org/api`) is a WordPress marketing site with no API — the real data service is a
separate no-auth OGC WFS 2.0 GeoServer instance at `data.malariaatlas.org/geoserver`, discovered via
`GetCapabilities` and confirmed live during research. It backs MAP's public data-explorer web app and
the CRAN `malariaAtlas` R package.

| Aspect | Details |
|--------|---------|
| **Free Tier** | Unlimited queries, no signup, no API key |
| **Paid Tier** | None |
| **Auth Model** | None |
| **License** | MAP publishes under open-data terms for non-commercial/research reuse with attribution (see https://malariaatlas.org/about-us/); this integration exposes only aggregate/summary catalog fields (survey metadata, case-estimate counts, vector-occurrence records, admin-reference names) — never redistributes raw geometry/imagery products |
| **Quota** | No rate-limit headers observed, no documented request quota |
| **Global Availability** | Reachable from this host, standard HTTPS |
| **Status** | Stable, production GeoServer WFS (`updateSequence` incrementing — actively maintained) |

### Candidate URL Correction

The night-orchestra seed candidate listed `https://malariaatlas.org/api`, which 404s (WordPress site,
no API). Research (`GetCapabilities` probing per the standard OGC WFS discovery pattern) found the
real service at `data.malariaatlas.org/geoserver/ows`, the same domain MAP's own Angular data-explorer
app calls. This is the same class of "candidate URL is a marketing page, real API is on a sibling
subdomain" quirk seen in `crossref-datacitations` (UC-634) and `copernicus-sentinel` (UC-628).

---

## API Overview

| # | Endpoint (WFS `GetFeature`, typeName) | Description |
|---|----------------------------------------|--------------|
| 1 | `Explorer:public_pf_data` / `Explorer:public_pv_data` | Point-level Pf/Pv parasite-rate survey records |
| 2 | `MAP_READER:map_data_estate_detail_admin1_conf_c_pf` / `_pv` | Admin1 confirmed-case counts by year (1980-2017) |
| 3 | `Explorer:Anopheline_Data` | Anopheles mosquito vector-occurrence records |
| 4 | `Explorer:mapadmin_0_2022` | Country reference list (ISO3/ISO2/name) |

Base URL: `https://data.malariaatlas.org/geoserver/ows`
Protocol: OGC WFS 2.0, `outputFormat=application/json` (GeoJSON FeatureCollection)

Verified live before implementation:
```
curl "https://data.malariaatlas.org/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=Explorer:public_pf_data&outputFormat=application/json&count=1"
-> {"type":"FeatureCollection","features":[{...,"properties":{"country":"Sudan","pf_pr":null,...}}],"totalFeatures":47978,...}
```

### Research Quirks

- **Geometry is never returned.** Admin-boundary and admin1-region layers carry full multi-polygon
  geometry that can run into multiple MB per feature. Every request sends an explicit `propertyName`
  list that excludes `geom` — GeoServer still returns `"geometry": null` plus a small `bbox`, but the
  heavy coordinate array is never serialized. Same defensive pattern as `bank-of-england` (UC-633)
  and `world-bank-cckp` (UC-630), which also strip large payload-inflating fields.
- **CQL injection surface.** Filtering by country/species/year is done via GeoServer's `CQL_FILTER`
  query param, which is interpolated server-side into a feature-store query (the OGC analog of SQL —
  GeoServer CQL injection is a known real-world CVE class). Every value that reaches `CQL_FILTER` is
  validated against a strict allowlist first: country codes must match `^[A-Z]{3}$`, free-text search
  fields must match `^[A-Za-z0-9 .,'-]{1,60}$`, years are `Number.isInteger` range-checked — and any
  literal `'` is additionally escaped (doubled) as defense in depth even though the regexes already
  exclude it.
- **`map_data_estate_detail_admin1_conf_c_{pf,pv}` requires a country filter.** Without `CQL_FILTER`
  the layer returns 13,449+ (`pf`) rows across ~38 countries and years 1980-2017; `case_estimates`
  therefore makes `country` a required parameter (unlike the other 3 tools where it is optional) to
  keep responses bounded and force agents toward a scoped query.
- **`ILIKE` substring search works** for both `vector_occurrence.species` and `country_list.name`
  (confirmed live, e.g. `name_0 ILIKE '%kenya%'` → `{"iso":"KEN","name_0":"Kenya"}`).

---

## Tool Mapping

| # | Tool ID | mcpName | Description | Price |
|---|---------|---------|--------------|-------|
| 1 | malaria-atlas.parasite_rate_survey | malaria-atlas.epidemiology.parasite_rate_survey | Point-level Pf/Pv parasite-rate survey search | $0.002 |
| 2 | malaria-atlas.case_estimates | malaria-atlas.epidemiology.case_estimates | Admin1 confirmed case counts by year (1980-2017) | $0.002 |
| 3 | malaria-atlas.vector_occurrence | malaria-atlas.entomology.vector_occurrence | Anopheles mosquito vector-occurrence search | $0.002 |
| 4 | malaria-atlas.country_list | malaria-atlas.reference.country_list | MAP-covered country ISO3/ISO2/name reference | $0.001 |

All 4 tools: category health, annotations READ_ONLY.

- `country_list` is a reference/lookup tool whose output (`iso`) feeds directly into the `country`
  filter on the other 3 tools — natural discovery flow is list-countries -> search-surveys/cases/vectors.

---

## Input Schemas

Defined in `src/schemas/malaria-atlas.schema.ts`, all `strip()`ped Zod objects:

- `parasite_rate_survey`: `species` (enum `pf`|`pv`, required), `country` (ISO3 string, optional),
  `limit` (integer, optional, 1-200, default 50).
- `case_estimates`: `species` (enum `pf`|`pv`, required), `country` (ISO3 string, required), `year`
  (integer, optional, 1980-2017), `limit` (integer, optional, 1-500, default 50).
- `vector_occurrence`: `country` (ISO3 string, optional), `species` (string, optional, 1-60 chars,
  substring match), `limit` (integer, optional, 1-200, default 50).
- `country_list`: `name` (string, optional, 1-60 chars, substring match), `limit` (integer, optional,
  1-250, default 50).

The adapter re-validates `country` against `^[A-Z]{3}$` and free-text fields against
`^[A-Za-z0-9 .,'-]{1,60}$` before building the `CQL_FILTER`, surfacing a 422 `INPUT_REJECTED` with a
corrective message rather than forwarding unvalidated input to GeoServer.

---

## Implementation Files

| File | Purpose |
|------|---------|
| src/adapters/malaria-atlas/index.ts | MalariaAtlasAdapter — all 4 tools |
| src/adapters/malaria-atlas/types.ts | Raw WFS GeoJSON FeatureCollection types |
| src/schemas/malaria-atlas.schema.ts | Zod schemas for all 4 tools |
| src/adapters/registry.ts | case 'malaria-atlas' to MalariaAtlasAdapter |
| src/schemas/index.ts | malariaAtlasSchemas spread |
| src/mcp/tool-definitions.ts | 4 tool definitions, category health |
| config/tool_provider_config.yaml | 4 tool entries, provider malaria-atlas, price_usd 0.001-0.002, cache_ttl 604800 |
| src/config/provider-limits.json | Dashboard entry, limit_type unlimited |
| scripts/test-malaria-atlas.sh | Smoke test (catalog, schema, dashboard, OpenAPI, upstream sanity) |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| malaria-atlas.parasite_rate_survey | $0 (free, no auth) | $0.002 | ~100% | 604800s (7d — historical survey archive, rarely updated) |
| malaria-atlas.case_estimates | $0 (free, no auth) | $0.002 | ~100% | 604800s (7d — fixed historical series, 1980-2017) |
| malaria-atlas.vector_occurrence | $0 (free, no auth) | $0.002 | ~100% | 604800s (7d — historical vector-collection archive) |
| malaria-atlas.country_list | $0 (free, no auth) | $0.001 | ~100% | 604800s (7d — static reference list) |

---

## Notes

- Live payment-gated verification: could not complete a full paid payment round-trip from this
  sandboxed batch role (no wallet key access). Instead verified end-to-end adapter correctness
  directly against the real `data.malariaatlas.org` GeoServer via `curl` before writing code
  (confirmed feature counts, field names via `DescribeFeatureType`, `CQL_FILTER`/`ILIKE` behavior,
  and response sizes with `propertyName` geometry exclusion), then confirmed catalog/schema/
  dashboard/OpenAPI wiring via the local docker stack REST API (health, `/api/v1/tools`,
  `/api/v1/dashboard`, `/.well-known/openapi.json`) — same pattern as prior sandboxed onboardings
  (e.g. `hdx` UC-638).
- `server-card.json` regenerated via the Step 14b script (backward-search parser) — verified 0 tools
  with non-3-level `mcpName` and 0 tools missing `outputSchema` platform-wide after regeneration.
- Sandboxed batch role (no environment-file access, no direct push, no GitHub CLI) per
  night-orchestra I-01 — steps 1-14 only, local commit, hourly batch-pusher handles push and Smithery.

## Next Steps

- [x] No registration needed
- [x] Onboarded via night-orchestra batch role — adapter, schemas, registry, config, seed, build, deploy all live
- [ ] Update candidates-registry.json status to "onboarded" (if malaria-atlas was tracked there)
