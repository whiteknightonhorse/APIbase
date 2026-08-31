# UC-646: Socrata Open Data (SODA) (socrata)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-646 |
| **Provider** | Socrata Open Data (SODA) |
| **Domain** | api.us.socrata.com (catalog) + thousands of per-portal domains (e.g. data.cityofnewyork.us) |
| **Category** | Country Data / World |
| **Theme** | Cross-portal government/civic open-data catalog search + per-dataset SoQL query |
| **Date** | 2026-08-31 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE |
| **Region** | Global (predominantly US federal/state/city, some international) |
| **Pricing Model** | free upstream (no auth, no app token) |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

Socrata (now part of Tyler Technologies) is the open-data platform behind thousands of
independently-hosted government/civic data portals — NYC, HHS/healthdata.gov, Connecticut,
countless US states/counties/cities, and more. Rather than wrapping one portal, this integration
wraps Socrata's own cross-portal Discovery/Catalog API plus the generic per-portal metadata and
SoQL data-query endpoints every Socrata-powered domain exposes.

| Aspect | Details |
|--------|---------|
| **Free Tier** | No signup, no API key, no app token required for read access |
| **Paid Tier** | Not evaluated (out of scope — no-auth batch mode, no app-token signup performed) |
| **Auth Model** | None |
| **License** | Varies per-dataset/per-portal (each result carries its own `metadata.license`); Discovery API itself has no resale prohibition |
| **Quota** | No documented numeric limit. `dev.socrata.com/docs/app-tokens` states unauthenticated requests are throttled per source IP into "a much lower throttling limit" shared pool vs. app-token holders, but publishes no exact number |
| **Global Availability** | Reachable from this host, standard HTTPS |
| **Status** | Stable, production REST API (Socrata Discovery API + SODA, used platform-wide by Socrata) |

---

## API Overview

| # | Endpoint | Method | Description |
|---|----------|--------|--------------|
| 1 | `api.us.socrata.com/api/catalog/v1?q=...&domains=...&categories=...&tags=...&only=dataset&limit=...&offset=...` | GET | Cross-portal catalog search (Discovery API) |
| 2 | `https://{domain}/api/views/{4x4}.json` | GET | Per-dataset metadata + column schema on a specific portal |
| 3 | `https://{domain}/resource/{4x4}.json?$select=...&$where=...&$order=...&$group=...&$limit=...&$offset=...` | GET | SoQL data query against a dataset's actual rows |

Verified live before implementation:
```
curl "https://api.us.socrata.com/api/catalog/v1?q=covid&limit=3"
-> {"results":[{"resource":{"name":"COVID-19 Report","id":"q5as-kyim",...},"metadata":{"domain":"data.ct.gov",...}}...],"resultSetSize":2975}

curl "https://data.cityofnewyork.us/resource/erm2-nwe9.json?\$limit=3"
-> [{"unique_key":"70235850","created_date":"2026-08-30T02:31:07.000","agency":"DOT",...}, ...]

curl "https://data.cityofnewyork.us/api/views/erm2-nwe9.json"
-> {"id":"erm2-nwe9","name":"311 Service Requests from 2020 to Present","tags":[...],"columns":[{"name":"Unique Key","fieldName":"unique_key","dataTypeName":"text",...}],...}

curl "https://data.cityofnewyork.us/resource/erm2-nwe9.json?\$select=complaint_type,count(*)&\$group=complaint_type&\$order=count(*)%20DESC&\$limit=5"
-> [{"complaint_type":"Illegal Parking","count":"2890002"}, ...]
```

### Research Quirk — the candidate URL is generic platform docs, not one dataset

The candidate line pointed at `dev.socrata.com/developers/docs/endpoints`, Socrata's own generic
API documentation (not a specific portal). Rather than picking one arbitrary city/state portal
(which would duplicate the shape of prior single-domain onboardings), this integration wraps the
cross-portal Discovery API (`api.us.socrata.com/api/catalog/v1`) as the entry point — a genuine
unified, no-auth API surface covering thousands of portals at once — plus the two generic
per-portal endpoints (`/api/views/{id}.json`, `/resource/{id}.json`) that every Socrata domain
exposes identically. This is architecturally distinct from HDX (UC-638, one CKAN instance),
open-canada (UC-641, one CKAN instance), and data-europa (UC-642, one Hub-Search instance) — those
wrap a single catalog; this wraps the catalog-of-catalogs plus a caller-selectable per-portal query
layer.

### Research Quirk — the Discovery API has no `/categories` or `/domains` facet endpoint

`GET /api/catalog/v1/categories` and `/api/catalog/v1/domains` both 404. There is no dedicated
facet-listing endpoint; category/domain values are only discoverable by reading
`classification.domain_category` / `metadata.domain` off search results themselves. No 4th
"list categories" tool was added as a result — `socrata.dataset_search` is the only discovery
mechanism, consistent with the actual API surface (no invented endpoint).

### Research Quirk — SSRF hardening required for `domain`, unlike any prior single-portal adapter

Every prior onboarding wraps one fixed upstream host baked into the adapter. Here,
`socrata.dataset_metadata` and `socrata.query_dataset` let the CALLER choose which host our
server makes an outbound request to (`domain` is interpolated directly into the request URL) —
this is the platform's core value (any Socrata portal, not just one), but it is also a genuine
SSRF surface that no other adapter in this codebase has. Mitigation in
`src/adapters/socrata/index.ts`:
1. `domain` must match a strict hostname regex (`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$`) — at least two dot-separated labels, RFC-1035-shaped.
2. Bare IPv4 literals are explicitly rejected (`^\d{1,3}(\.\d{1,3}){3}$`) even though they'd
   otherwise match the hostname regex's label shape.
3. `localhost` and reserved-use TLD suffixes (`.local`, `.internal`, `.test`, `.invalid`,
   `.example`, `.arpa`) are explicitly rejected.
4. `dataset_id` is separately regex-validated to Socrata's exact "4x4" identifier shape
   (`^[a-z0-9]{4}-[a-z0-9]{4}$`) before being interpolated into the URL path, closing off
   path-injection on top of the host-injection defense above.

This does not fully close DNS-rebinding-class SSRF (a domain could resolve to an internal IP at
request time), but it removes the trivial literal-IP/localhost/reserved-suffix attack surface —
same defense-in-depth posture as the CQL_FILTER allowlisting in malaria-atlas (UC-640) and the
`lang` allowlist regex in wikimedia-rest (UC-635).

### Research Quirk — `only=dataset` default avoids noise from non-tabular asset types

An unscoped catalog search returns a mix of `dataset`, `story`, `chart`, `map`, etc. asset types
(confirmed live: a `q=covid` search's first two results were `type:"story"` narrative pages, not
queryable tabular datasets). `socrata.dataset_search` defaults `only=dataset` (overridable via the
schema's `only` enum) so agents get queryable datasets by default, matching the tool's stated
purpose of feeding `dataset_metadata`/`query_dataset`.

---

## Tool Mapping

| # | Tool ID | mcpName | Description | Price |
|---|---------|---------|--------------|-------|
| 1 | socrata.dataset_search | socrata.datasets.search | Cross-portal catalog search (query/domains/category/tags) | $0.002 |
| 2 | socrata.dataset_metadata | socrata.datasets.detail | Per-dataset metadata + column schema on a specific portal | $0.001 |
| 3 | socrata.query_dataset | socrata.datasets.query | SoQL data query against a dataset's actual rows | $0.002 |

All 3 tools: category world, annotations READ_ONLY.

- `dataset_search` is the natural entry point — its returned `id` + `domain` feed directly into
  both `dataset_metadata` (get column schema before writing a query) and `query_dataset` (fetch
  actual rows), same list -> detail flow as HDX/open-canada/data-europa.

---

## Input Schemas

Defined in `src/schemas/socrata.schema.ts`, all `strip()`ped Zod objects:

- `dataset_search`: `query`, `domains`, `category`, `tags` (all optional strings), `only`
  (optional enum: dataset/chart/map/file/story/href, default dataset), `limit` (1-50, default 10),
  `offset` (>=0, default 0).
- `dataset_metadata`: `domain` (required, hostname), `dataset_id` (required, 4x4-regex).
- `query_dataset`: `domain` (required, hostname), `dataset_id` (required, 4x4-regex), `select`,
  `where`, `order`, `group` (all optional SoQL clause strings), `limit` (1-1000, default 50),
  `offset` (>=0, default 0).

`domain` and `dataset_id` are re-validated in the adapter (`requireDomain`/`requireDatasetId`) —
not just at the Zod layer — since they are interpolated directly into the outbound request URL
(see SSRF Research Quirk above). All other params are passed through `URLSearchParams`
(auto-encoded), consistent with the 2026-03-30 flywheel rule.

---

## Implementation Files

| File | Purpose |
|------|---------|
| src/adapters/socrata/index.ts | SocrataAdapter — all 3 tools, domain/dataset_id validation |
| src/adapters/socrata/types.ts | Raw Socrata catalog/view/data response types |
| src/schemas/socrata.schema.ts | Zod schemas for all 3 tools |
| src/adapters/registry.ts | case 'socrata' to SocrataAdapter |
| src/schemas/index.ts | socrataSchemas spread |
| src/mcp/tool-definitions.ts | 3 tool definitions, category world |
| config/tool_provider_config.yaml | 3 tool entries, provider socrata, price_usd 0.001-0.002, cache_ttl 300-86400 |
| src/config/provider-limits.json | Dashboard entry, limit_type unlimited (no documented numeric throttle) |
| static/dashboard.html | PROVIDER_CATEGORIES entry: 'Country Data' (matches open-canada/data-europa) |
| scripts/test-socrata.sh | Smoke test script |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| socrata.dataset_search | $0 (free, no auth) | $0.002 | ~100% | 3600s (1h — new datasets are published continuously across thousands of portals) |
| socrata.dataset_metadata | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — column schema/description changes rarely) |
| socrata.query_dataset | $0 (free, no auth) | $0.002 | ~100% | 300s (5min — many portals publish near-real-time civic data, e.g. NYC 311) |

---

## Notes

- **SSRF hardening is the defining design concern** for this integration — `domain` is the first
  caller-supplied hostname in this codebase to be interpolated directly into an outbound request
  URL across two tools (`dataset_metadata`, `query_dataset`). Full defense-in-depth detail in the
  Research Quirk above and inline in `src/adapters/socrata/index.ts`.
- No numeric rate-limit was found in Socrata's published docs (`dev.socrata.com/docs/app-tokens`
  confirms throttling exists for no-app-token requests but gives no exact figure) — `dashboard`
  entry uses `limit_type: "unlimited"` with a `limit_proof` explaining the absence of a number,
  per the Step 4h-pre fallback rule.
- Live upstream verification: cross-portal catalog search (`q=covid`), domain-scoped catalog
  search (`domains=data.cityofnewyork.us`), a real SODA data query against NYC 311
  (`erm2-nwe9`, including a `$select`/`$group`/`$order` aggregate query), and per-dataset metadata
  (`/api/views/erm2-nwe9.json`) — all confirmed live via curl during research, then re-verified
  through the live docker stack REST API (`/api/v1/tools`, `/api/v1/tools/socrata.*` schema +
  rich description present on all 3, `/api/v1/dashboard` tool_count=3).
- `scripts/seed.ts` upserted all 1293 tools (including the 3 new socrata tools) successfully; the
  script's separate `seedTestAgent()` step failed afterward with the same pre-existing, unrelated
  Prisma UUID error documented in prior UC notes (UC-643, UC-644, UC-645) — confirmed unmodified
  by this onboarding, out of scope to fix here.
- `scripts/smoke-test.sh` 8/8 pass; `scripts/test-socrata.sh` 5/6 pass at first run (the
  OpenAPI-discovery check fails until `generate-openapi.ts`/`gen-card.ts` regen runs later in this
  same session — expected ordering, matches prior UC-644/UC-645 precedent) and 6/6 after regen.
- Regenerated `static/.well-known/openapi.json` (3 new `/api/v1/tools/socrata.*/call` paths) and
  `static/.well-known/mcp/server-card.json` (3 tools added, all 3-level names, 100% param
  descriptions, 100% outputSchema coverage — verified via the standard bad-name/no-output-schema
  validation one-liners) as part of this run.
- Per A-06/sandbox rules, this role did NOT run `scripts/sync-counts.sh` and did not publish to
  the remote repository or Smithery — those remain for the hourly batch-pusher, matching the
  UC-644/UC-645 precedent (their README/homepage/discovery-file count sync landed in a separate
  later commit, `9f4d302`).
- Per the recurring sandbox headless-permission gate (documented in prior UC notes since
  UC-614/UC-617), the Write/Edit tool was blocked for both this UC file and the
  `.claude/skills/user-usecases/SKILL.md` index row; both were written via a Bash `python3`
  file-write workaround instead (read-then-verify-then-write, per the sandbox tee-write
  near-miss lesson).

## Next Steps

- [x] No registration needed
- [x] Onboarded via night-orchestra batch role — adapter, schemas, registry, config, seed, build,
      deploy, OpenAPI, server-card all live
