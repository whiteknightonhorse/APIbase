# UC-631: geoBoundaries

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-631 |
| **Provider** | William & Mary geoLab |
| **Domain** | www.geoboundaries.org |
| **Category** | Location |
| **Theme** | Political Administrative Boundary Data (Country/State/County) |
| **Date** | 2026-08-29 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE |
| **Region** | Global (every country, ADM0 through ADM5 where available) |
| **Pricing Model** | free upstream |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

geoBoundaries is an open database of political administrative boundaries maintained by William &
Mary's geoLab. It exposes country outlines (ADM0) down to fine local subdivisions (ADM1-ADM5,
country-dependent) via a public, no-auth REST API at
`www.geoboundaries.org/api/current/gbOpen`. No registration or API key is required.

| Aspect | Details |
|--------|---------|
| **Free Tier** | Unlimited queries, no signup, no API key |
| **Paid Tier** | None |
| **Auth Model** | None |
| **License** | Varies per boundary, always documented in the response (`boundaryLicense` field) — mostly CC BY / public domain |
| **Quota** | No documented rate limit or hard cap on `api.html` |
| **Global Availability** | Reachable from this host, standard HTTPS JSON (Apache-served, CORS `*`) |

### Upstream Quirk — response is metadata + download links, NOT geometry

Each `{ISO3}/{ADM_LEVEL}/` call returns one JSON object of metadata (name, admin unit count,
area/perimeter stats, license, source) plus URLs to the actual boundary files (`gjDownloadURL` for
full GeoJSON, `simplifiedGeometryGeoJSON` for a lighter version, `tjDownloadURL` for TopoJSON,
`imagePreview` for a PNG, `staticDownloadLink` for a zip of everything) hosted on GitHub
(`github.com/wmgeolab/geoBoundaries`). **These geometry files can be very large** — confirmed
`RUS/ADM1` simplified GeoJSON is ~9.7MB and even the plain metadata call for `USA/ADM1` returns
`gjDownloadURL` pointing to a 13MB full-resolution file. The platform's response size cap (1MB raw)
makes it infeasible to fetch-and-re-serve geometry through a tool call, so this integration
**never downloads geometry** — tools return the metadata + URLs and agents fetch the geometry
directly from GitHub only if/when they need the actual shapes.

### Upstream Quirk — ISO3 only, `ALL` wildcard on either path segment

- Country codes MUST be ISO 3166-1 **alpha-3** (`USA`, `KEN`) — ISO2 (`US`) and country names
  (`France`) both 404.
- `ISO3=ALL` lists every country at one ADM level (`ALL/ADM0/` = 230 countries, ~410KB).
- `ADM_LEVEL=ALL` lists every level for one country (`USA/ALL/` = array of that country's ADM0-N).
- Both wildcards together (`ALL/ALL/`) also works (~1.2MB, all countries' ADM0 only, dedup'd).
- An invalid ISO3 (`ZZZ`) or unsupported ADM level for that country (e.g. `USA/ADM5` if it doesn't
  exist) returns a plain-text Apache 404 page, not a JSON error — the adapter surfaces this via
  the standard `INPUT_REJECTED`/422 upstream-4xx mapping (§ HTTP error mapping below), and the
  `available_levels` tool exists specifically so agents can check before hitting this.

---

## API Overview

| # | Endpoint | Method | Description |
|---|----------|--------|-------------|
| 1 | `www.geoboundaries.org/api/current/gbOpen/{ISO3}/{ADM_LEVEL}/` | GET | Single country+level boundary metadata record |
| 2 | `www.geoboundaries.org/api/current/gbOpen/ALL/{ADM_LEVEL}/` | GET | Every country's metadata at one ADM level (array) |
| 3 | `www.geoboundaries.org/api/current/gbOpen/{ISO3}/ADM0..ADM5/` (fan-out, 6 probes) | GET | Which levels exist for one country |

**Base URL:** `https://www.geoboundaries.org/api/current/gbOpen`
**Docs:** `https://www.geoboundaries.org/api.html`

---

## Tool Mapping

| # | Tool ID | mcpName | Description | Price |
|---|---------|---------|--------------|-------|
| 1 | `geoboundaries.boundary.detail` | `geoboundaries.boundary.detail` | Metadata + download URLs for one country's boundary at a given ADM level | $0.001 |
| 2 | `geoboundaries.boundary.list_countries` | `geoboundaries.boundary.list_countries` | Every country's metadata at one ADM level (default ADM0) | $0.002 |
| 3 | `geoboundaries.boundary.available_levels` | `geoboundaries.boundary.available_levels` | Which ADM0-ADM5 levels exist for one country, with unit counts | $0.001 |

All 3 tools: `category: location`, `annotations: READ_ONLY`.

---

## Why Interesting for Agents

- Only live provider on the platform exposing global **political administrative boundary**
  reference data (country/state/county polygons) — complements existing geocoding (Geo UC-012),
  postal code (Japan UC-591), and census/statistical providers that need to resolve a
  place name to an admin hierarchy or fetch official boundary shapes for mapping.
- `available_levels` lets agents discover a country's admin hierarchy depth (e.g. Kenya stops at
  ADM2, France goes to ADM4) before requesting a specific level, avoiding wasted calls.
- `list_countries` gives one-call global coverage discovery (which of the 230 tracked
  territories exist, at what resolution) without iterating 230 individual lookups.
- Free upstream, no key friction, high margin, static data (long cache TTL).

---

## Input Schemas

Defined in `src/schemas/geoboundaries.schema.ts`, all `.strip()`ped Zod objects:

- **`boundary.detail`**: `country` (string, length 3, required — ISO3 alpha-3), `adm_level`
  (enum `ADM0`-`ADM5`, optional, default `ADM0`).
- **`boundary.list_countries`**: `adm_level` (enum `ADM0`-`ADM5`, optional, default `ADM0`).
- **`boundary.available_levels`**: `country` (string, length 3, required — ISO3 alpha-3).

---

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/geoboundaries/index.ts` | `GeoBoundariesAdapter` — `buildRequest`/`parseResponse` for `detail`/`list_countries`; `call()` override fans out 6 probes for `available_levels` |
| `src/adapters/geoboundaries/types.ts` | `GeoBoundariesRecord`/`GeoBoundariesResponse` raw types |
| `src/schemas/geoboundaries.schema.ts` | Zod schemas for all 3 tools |
| `src/adapters/registry.ts` | `case 'geoboundaries':` → `GeoBoundariesAdapter` |
| `src/schemas/index.ts` | `...geoboundariesSchemas` spread |
| `src/mcp/tool-definitions.ts` | 3 tool definitions, category `location` |
| `config/tool_provider_config.yaml` | 3 tool entries, `provider: geoboundaries`, `price_usd: "0.001"–"0.002"`, `cache_ttl: 604800` |
| `src/config/provider-limits.json` | Dashboard entry, `limit_type: unlimited` |
| `scripts/test-geoboundaries.sh` | Smoke test (catalog, schema, dashboard, OpenAPI, upstream sanity) |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| `geoboundaries.boundary.detail` | $0 (free, no auth) | $0.001 | ~100% | 604800s (7d — boundary releases are versioned/static, rarely change) |
| `geoboundaries.boundary.list_countries` | $0 (free, no auth) | $0.002 | ~100% | 604800s (7d — same static-release rationale, larger payload) |
| `geoboundaries.boundary.available_levels` | $0 (free, no auth), 6 upstream probes per call | $0.001 | ~100% | 604800s (7d) |

---

## Notes

- `maxResponseBytes` overridden to 1,500,000 (1.5MB) — headroom for the `ALL/ADM1` /
  `ALL/ADM2` bulk-country-listing responses (largest observed ~410KB at ADM0), while still well
  under the geometry-file sizes this adapter deliberately never fetches.
- Adapter validates `country` against `^[A-Z]{3}$` and `adm_level` against the fixed
  `ADM0`-`ADM5` enum client-side before the request is sent, since malformed/unsupported inputs
  return a plain-text Apache 404 rather than a JSON error.
- HTTP error mapping: malformed ISO3 or invalid ADM level → `INPUT_REJECTED`/422 (validated
  client-side); unknown country/level combination that upstream 404s → standard upstream-4xx
  `INPUT_REJECTED`/422 passthrough (§12 PROVIDER_CALL fault classification).
- `available_levels` is the one multi-request tool: it overrides `call()` to fan out
  `Promise.all` across ADM0-ADM5 (same pattern as `gebco.elevation_profile`), catching individual
  404s per level rather than failing the whole call.
- Verified live: `USA`/`KEN`/`FRA`/`LSO`/`ABW` ADM0-ADM2 lookups, `ALL/ADM0` (230 countries),
  `ALL/ADM1` (350KB), and per-level probing for a country with only 3 levels (Kenya: ADM0-ADM2)
  vs. one with more (France: ADM0-ADM4) — all confirmed to return non-empty, plausible metadata.

## Next Steps

- [x] No registration needed
- [x] Onboarded via night-orchestra batch role — adapter, schemas, registry, config, seed, build, deploy all live
- [x] Documented the metadata-vs-geometry size tradeoff and ISO3-only/wildcard behavior
- [ ] Update candidates-registry.json status to "onboarded"
