# UC-641: Government of Canada Open Data (open-canada)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-641 |
| **Provider** | Government of Canada Open Data |
| **Domain** | open.canada.ca/data/api/3/action |
| **Category** | World |
| **Theme** | Federal/provincial dataset catalog search |
| **Date** | 2026-08-31 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE |
| **Region** | Canada |
| **Pricing Model** | free upstream |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

Open Government Canada is the Government of Canada's public catalog of federal open datasets —
covering economics, health, environment, science, government/politics, and more, contributed by
federal departments and agencies. Like HDX (UC-638), it runs on CKAN, exposing a standard CKAN
Action API (`open.canada.ca/data/api/3/action/*`) with no authentication required for read-only
search/browse.

| Aspect | Details |
|--------|---------|
| **Free Tier** | Unlimited queries, no signup, no API key |
| **Paid Tier** | None |
| **Auth Model** | None |
| **License** | Open Government Licence - Canada (permits commercial reuse, modification, and redistribution) — https://open.canada.ca/en/open-government-licence-canada |
| **Quota** | No rate-limit headers observed, no documented request quota |
| **Global Availability** | Reachable from this host, standard HTTPS |
| **Status** | Stable, production CKAN Action API |

Because this is the Government of Canada's own portal, the catalog metadata itself (titles, notes,
organization/subject names) is uniformly OGL-licensed — unlike HDX's per-contributor licensing,
there is no per-dataset licensing variance to gate. Dataset *resource* file content is still not
fetched (only pointers: name, format, download URL, size) — consistent with the metadata-search-only
pattern used across the platform (HDX, crossref-datacitations, copernicus-sentinel).

---

## API Overview

| # | Endpoint | Method | Description |
|---|----------|--------|-------------|
| 1 | `/package_search?q=...&fq=subject:...&fq=organization:...&rows=...&fl=...` | GET | Free-text/subject/org dataset search |
| 2 | `/package_show?id=...` | GET | Full metadata + resource list for one dataset |
| 3 | `/package_search?rows=0&facet.field=["subject"]` | GET | Subject-topic taxonomy with dataset counts |
| 4 | `/organization_list?all_fields=true&limit=...` | GET | Publishing federal departments/agencies with dataset counts |

Base URL: https://open.canada.ca/data/api/3/action

Verified live before implementation:
```
curl -G "https://open.canada.ca/data/api/3/action/package_search" --data-urlencode "q=climate" --data-urlencode "rows=1"
-> {"success": true, "result": {"count": 2862, "results": [{...}]}}
```

### Research Quirk — no CKAN "groups", subject facet used for topics instead

Unlike HDX, `group_list` on this portal returns an **empty list** (`{"result": []}`) — the Government
of Canada portal never adopted CKAN groups for topic browsing. Topic taxonomy is instead exposed via
the `subject` Solr facet on `package_search` (`facet.field=["subject"]`, `rows=0`): 19 fixed values
(e.g. `nature_and_environment` 16,955 datasets, `health_and_safety` 6,289, down to
`history_and_archaeology` 44). `subject_list` fetches this facet directly — a cheap `rows=0` query
(~2.5KB) — rather than a full dataset list.

### Research Quirk — `fl=` only accepts real stored Solr fields

Same `fl=` (Solr field list) size-control trick as HDX applies here, but with a narrower accepted
field set: `id`, `name`, `title`, `notes`, `organization`, `subject`, `portal_release_date`, and
`metadata_modified` are real stored fields and work with `fl=`. Requesting `title_translated`,
`notes_translated`, `num_resources`, `num_tags`, or `license_title` via `fl=` silently drops them
from the response (they are computed/assembled at CKAN's read layer, not raw Solr fields) — verified
by testing each field individually. `dataset_search` therefore uses only the working field list
(cutting a 20-row `q=health` response to ~11KB) and omits `num_resources`/`license_title` from search
results (both available via `dataset_detail`, which uses `package_show` and does not support `fl`).

`package_show` was measured up to **101KB** for the largest dataset found (97 resources) — well
under the adapter's `maxResponseBytes: 1_000_000` override.

An invalid `package_show` id returns upstream HTTP 404, correctly classified by `base.adapter.ts` as
422 `INPUT_REJECTED` (2026-06-06 flywheel rule) — no adapter-specific handling needed. An unknown
`fq:subject:<slug>` or `fq:organization:<slug>` filter returns HTTP 200 with `count: 0` — a normal
empty result.

### Research Quirk — `organization_list` full-fetch path can approach the provider timeout

`organization_list` has no server-side text search — when a `query` filter is given, the adapter
fetches the full org list (`all_fields=true`, ~176KB, 353 entries, no `limit`) and filters/sorts
client-side, same pattern as HDX. One manual test of this full-fetch path took just over 10s and hit
the platform's provider-call timeout on the first attempt, succeeding on the automatic retry (spec
§10: 10s timeout, 2 retries, exponential backoff) — expected behavior under §9 reliability rules, not
a bug, but noted here since it's the slowest of the 4 tools. The no-`query` path (direct `limit=N`
fetch) is fast (~450ms) and small (~2KB for 5 orgs).

---

## Tool Mapping

| # | Tool ID | mcpName | Description | Price |
|---|---------|---------|--------------|-------|
| 1 | open-canada.dataset_search | open-canada.datasets.search | Search datasets by query/subject/organization | $0.002 |
| 2 | open-canada.dataset_detail | open-canada.datasets.detail | Full metadata + resource list for one dataset | $0.002 |
| 3 | open-canada.subject_list | open-canada.reference.subject_list | Subject-topic taxonomy with dataset counts | $0.001 |
| 4 | open-canada.organization_list | open-canada.reference.organization_list | Publishing federal departments/agencies | $0.001 |

All 4 tools: category world, annotations READ_ONLY.

- `subject_list` and `organization_list` are reference/lookup tools whose output (slug/id) feeds
  directly into `dataset_search`'s `subject`/`organization` filters — the natural discovery flow is
  list-subjects-or-orgs -> search-datasets -> get-detail (same pattern as HDX UC-638).

---

## Input Schemas

Defined in `src/schemas/open-canada.schema.ts`, all `strip()`ped Zod objects:

- `dataset_search`: `query` (string, optional), `subject` (string, optional, topic slug),
  `organization` (string, optional, org slug), `rows` (integer, optional, 1-20, default 10).
- `dataset_detail`: `id` (string, required, Open Canada dataset UUID or URL slug).
- `subject_list`: `query` (string, optional, substring filter on subject slug).
- `organization_list`: `query` (string, optional, substring filter), `limit` (integer, optional,
  1-50, default 20).

The adapter validates `subject`/`organization` slugs against `^[a-z0-9_-]{2,60}$` before
interpolating into the `fq=` filter query, surfacing a 422 `INPUT_REJECTED` with a corrective message
rather than forwarding malformed input (same CQL/Solr-injection defense pattern used across the
platform's CKAN/GeoServer adapters).

---

## Implementation Files

| File | Purpose |
|------|---------|
| src/adapters/open-canada/index.ts | OpenCanadaAdapter — all 4 tools |
| src/adapters/open-canada/types.ts | Raw CKAN Action API + normalized output types |
| src/schemas/open-canada.schema.ts | Zod schemas for all 4 tools |
| src/adapters/registry.ts | case 'open-canada' to OpenCanadaAdapter |
| src/schemas/index.ts | openCanadaSchemas spread |
| src/mcp/tool-definitions.ts | 4 tool definitions, category world |
| config/tool_provider_config.yaml | 4 tool entries, provider open-canada, price_usd 0.001-0.002, cache_ttl 3600/86400 |
| src/config/provider-limits.json | Dashboard entry, limit_type unlimited |
| static/dashboard.html | PROVIDER_CATEGORIES entry: 'Government of Canada Open Data' -> 'Country Data' |
| scripts/test-open-canada.sh | Smoke test (catalog, schema, dashboard, OpenAPI, upstream sanity) |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| open-canada.dataset_search | $0 (free, no auth) | $0.002 | ~100% | 3600s (1h — datasets updated regularly) |
| open-canada.dataset_detail | $0 (free, no auth) | $0.002 | ~100% | 3600s (1h — resource lists can be updated) |
| open-canada.subject_list | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — topic taxonomy is stable) |
| open-canada.organization_list | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — same rationale) |

---

## Notes

- Live payment-gated verification: could not complete a full paid x402/MPP round-trip from this
  sandboxed batch role (no wallet key access). Instead verified end-to-end adapter correctness
  directly (buildRequest -> live upstream HTTP call -> parseResponse) via a throwaway `tsx` script
  exercising all 4 tools plus both error paths (missing required param, upstream 404) against the
  real `open.canada.ca` API — confirmed real dataset/subject/organization data returned and correct
  422 `INPUT_REJECTED` classification for both cases. Catalog/schema/dashboard/OpenAPI wiring
  verified via the local docker stack REST API (health, `/api/v1/tools`, `/api/v1/dashboard`,
  `/.well-known/openapi.json`) same as prior sandboxed onboardings.
- `server-card.json` regenerated via `scripts/gen-card.ts` (backward-search parser, 2026-04-09 fix) —
  verified 0 tools with non-3-level `mcpName` after regeneration.
- `scripts/sync-counts.sh` run afterward per the mandatory Step 12 procedure — synced tool/provider
  counts (1254/355) across README, static pages, discovery files, and GitHub repo description.

## Next Steps

- [x] No registration needed
- [x] Onboarded via night-orchestra batch role — adapter, schemas, registry, config, seed, build, deploy all live
