# UC-638: Humanitarian Data Exchange (HDX)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-638 |
| **Provider** | Humanitarian Data Exchange (HDX) |
| **Domain** | data.humdata.org/api/3/action |
| **Category** | World |
| **Theme** | Humanitarian dataset/organization/location catalog search |
| **Date** | 2026-08-30 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE |
| **Region** | Global |
| **Pricing Model** | free upstream |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

HDX is UN OCHA's public catalog of humanitarian datasets — 27,000+ datasets covering population,
displacement, food security, health, conflict, and climate data contributed by UN agencies, NGOs,
and governments for crisis response. The platform runs on CKAN, exposing a standard CKAN Action API
(`data.humdata.org/api/3/action/*`) with no authentication required for read-only search/browse.

| Aspect | Details |
|--------|---------|
| **Free Tier** | Unlimited queries, no signup, no API key |
| **Paid Tier** | None |
| **Auth Model** | None |
| **License** | HDX's own catalog metadata (titles, notes, organization/location names, tags) has no separate license; **individual dataset resources carry per-contributor licensing** (varies — many "Other"/HDX-specific terms, some explicitly non-commercial e.g. IOM DTM data) per [HDX Terms of Service](https://docs.humdata.org/about/hdx-terms-of-service): "Organizations are free to choose the license for their data... users must follow the applicable license when using and sharing the data." |
| **Quota** | No rate-limit headers observed, no documented request quota |
| **Global Availability** | Reachable from this host, standard HTTPS |
| **Status** | Stable, production CKAN Action API |

### Licensing Scope Decision

Because per-resource licensing varies (and some is explicitly non-commercial), these tools expose
**only HDX's own catalog metadata** — dataset titles/descriptions/organization/tags/resource
*pointers* (name, format, download URL, size) — never resource file content itself. This mirrors the
metadata-search-only pattern already used for `crossref-datacitations` (UC-634) and
`copernicus-sentinel` (UC-628): the tool is a *discovery* layer over a catalog of licensed content,
not a redistribution of that content. `dataset_detail` surfaces `license_title`/`license_url` per
dataset so an agent can check licensing before following a `download_url` itself.

---

## API Overview

| # | Endpoint | Method | Description |
|---|----------|--------|-------------|
| 1 | `/package_search?q=...&fq=groups:...&fq=organization:...&rows=...&fl=...` | GET | Free-text/country/org dataset search |
| 2 | `/package_show?id=...` | GET | Full metadata + resource list for one dataset |
| 3 | `/group_list?all_fields=true` | GET | Countries/regions with dataset counts |
| 4 | `/organization_list?all_fields=true&limit=...` | GET | Publishing organizations with dataset counts |

Base URL: https://data.humdata.org/api/3/action
Docs: https://hdx-hapi.readthedocs.io/en/latest/ (broader HDX docs hub)

Verified live before implementation:
```
curl "https://data.humdata.org/api/3/action/package_search?rows=1&q=health"
-> {"success": true, "result": {"count": 27872, "results": [{...}]}}
```

### Research Quirk — response size varies wildly, `fl=` is essential

A single `package_search` request with `rows=10` and no field restriction returned **5.8MB** (some
datasets have 90+ resources with verbose per-resource descriptions); sorting by `num_resources desc`
pushed a 3-row response to **4.2MB**. CKAN's Solr-backed `fl=` (field list) parameter — undocumented
in the CKAN Action API reference but confirmed live — restricts `package_search` to only the
requested top-level fields, cutting the same 3-row worst-case query to **9KB**. `dataset_search`
always sends `fl=id,name,title,notes,organization,num_resources,num_tags,dataset_date,last_modified,
license_title,tags` and caps `rows` at 20 to keep responses small; `dataset_detail` (`package_show`,
which does not support `fl`) was measured up to **631KB** for the single largest dataset on the
platform (95 resources), well under the adapter's `maxResponseBytes: 2_000_000` override.

`organization_list` has no server-side text search — when a `query` filter is given, the adapter
fetches the full org list (`all_fields=true`, ~390KB, no `limit`) and filters/sorts/slices
client-side; without a query it fetches directly with the requested `limit`. `group_list` (locations)
has no `limit` param at all — always fetched in full (~83KB, 253 entries) and filtered/sliced
client-side.

An invalid `package_show` id returns upstream HTTP 404, correctly classified by `base.adapter.ts` as
422 `INPUT_REJECTED` (2026-06-06 flywheel rule) — no adapter-specific handling needed. An empty
`fq:groups:<slug>` filter (unknown location) returns HTTP 200 with `count: 0` — a normal empty
result, not a silent-failure quirk.

---

## Tool Mapping

| # | Tool ID | mcpName | Description | Price |
|---|---------|---------|--------------|-------|
| 1 | hdx.dataset_search | hdx.datasets.search | Search datasets by query/country/organization | $0.002 |
| 2 | hdx.dataset_detail | hdx.datasets.detail | Full metadata + resource list for one dataset | $0.002 |
| 3 | hdx.location_list | hdx.reference.locations | Countries/regions with dataset counts | $0.001 |
| 4 | hdx.organization_list | hdx.reference.organizations | Publishing orgs with dataset counts | $0.001 |

All 4 tools: category world, annotations READ_ONLY.

- `location_list` and `organization_list` are reference/lookup tools whose output (`id`/`slug`)
  feeds directly into `dataset_search`'s `country`/`organization` filters — the natural discovery
  flow is list-locations-or-orgs -> search-datasets -> get-detail.

---

## Input Schemas

Defined in `src/schemas/hdx.schema.ts`, all `strip()`ped Zod objects:

- `dataset_search`: `query` (string, optional), `country` (string, optional, HDX location slug),
  `organization` (string, optional, HDX org slug), `rows` (integer, optional, 1-20, default 10).
- `dataset_detail`: `id` (string, required, HDX dataset id or URL slug).
- `location_list`: `query` (string, optional, substring filter), `limit` (integer, optional, 1-100,
  default 50).
- `organization_list`: `query` (string, optional, substring filter), `limit` (integer, optional,
  1-50, default 20).

The adapter validates `country`/`organization` slugs against `^[a-z0-9_-]{2,60}$` before
interpolating into the `fq=` filter query, surfacing a 422 `INPUT_REJECTED` with a corrective message
rather than forwarding malformed input.

---

## Implementation Files

| File | Purpose |
|------|---------|
| src/adapters/hdx/index.ts | HdxAdapter — all 4 tools |
| src/adapters/hdx/types.ts | Raw CKAN Action API + normalized output types |
| src/schemas/hdx.schema.ts | Zod schemas for all 4 tools |
| src/adapters/registry.ts | case 'hdx' to HdxAdapter |
| src/schemas/index.ts | hdxSchemas spread |
| src/mcp/tool-definitions.ts | 4 tool definitions, category world |
| config/tool_provider_config.yaml | 4 tool entries, provider hdx, price_usd 0.001-0.002, cache_ttl 3600/86400 |
| src/config/provider-limits.json | Dashboard entry, limit_type unlimited |
| scripts/test-hdx.sh | Smoke test (catalog, schema, dashboard, OpenAPI, upstream sanity) |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| hdx.dataset_search | $0 (free, no auth) | $0.002 | ~100% | 3600s (1h — new/updated datasets appear regularly) |
| hdx.dataset_detail | $0 (free, no auth) | $0.002 | ~100% | 3600s (1h — resource lists can be updated) |
| hdx.location_list | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — dataset counts change slowly) |
| hdx.organization_list | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — same rationale) |

---

## Notes

- Live payment-gated verification: could not complete a full paid x402/MPP round-trip from this
  sandboxed batch role (no wallet key access). Instead verified end-to-end adapter correctness
  directly (buildRequest -> live upstream HTTP call -> parseResponse) via a throwaway `tsx` script
  exercising all 4 tools plus both error paths (missing required param, upstream 404) against the
  real `data.humdata.org` API — confirmed real dataset/location/organization data returned and
  correct 422 `INPUT_REJECTED` classification for both cases. Catalog/schema/dashboard/OpenAPI
  wiring verified via the local docker stack REST API (health, `/api/v1/tools`, `/api/v1/dashboard`,
  `/.well-known/openapi.json`) same as prior sandboxed onboardings.
- `server-card.json` regenerated via `scripts/gen-card.ts` (backward-search parser, 2026-04-09 fix) —
  verified 0 tools with non-3-level `mcpName` and 0 tools missing `outputSchema` platform-wide after
  regeneration.

## Next Steps

- [x] No registration needed
- [x] Onboarded via night-orchestra batch role — adapter, schemas, registry, config, seed, build, deploy all live
- [ ] Update candidates-registry.json status to "onboarded" (if hdx was tracked there)
