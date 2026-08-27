# UC-621 — Figshare API (Open Research Repository)

## Meta

| Field | Value |
|-------|-------|
| ID | UC-621 |
| Provider | Figshare (api.figshare.com) |
| Category | education |
| Date | 2026-08-27 |
| Status | LIVE (local build/seed/deploy only — not yet pushed to production or Smithery) |
| Tools | 3 |
| Auth | None (public REST API) |
| License | CC-licensed research outputs; API itself is open, no auth required |

## Overview

The Figshare API (`api.figshare.com/v2`) is a public, no-auth REST API over Figshare's open
research repository — 3.8M+ CC-licensed datasets, figures, papers, preprints, theses, software,
posters, and other research outputs deposited by academic institutions and researchers worldwide.
It covers full-text article search (with DOI and item-type filters), full article detail retrieval
(authors, license, downloadable files, citation), and the 2,180-entry subject-category taxonomy
Figshare uses to classify articles.

No documented rate limit was found in the public API docs (`docs.figshare.com`) or help center;
anonymous GET requests were tested live with no rate-limit headers observed.

## API Endpoints Verified

| Endpoint | Method | Description |
|----------|--------|-------------|
| `https://api.figshare.com/v2/articles` | GET | Search articles by `search_for`, `doi`, `item_type`, `page`, `page_size`, `order`, `order_direction` |
| `https://api.figshare.com/v2/articles/{id}` | GET | Full article detail — description, authors, license, categories, files, citation |
| `https://api.figshare.com/v2/categories` | GET | Full subject-category taxonomy (2,180 entries, ~440KB) |
| `https://api.figshare.com/v2/item_types` | GET | Reference list of 12 research-output types (used to build the static `item_type` enum in the adapter, not called per-request) |

Confirmed live via direct `curl` testing during onboarding: search returned real recent articles
(e.g. id `33350571`, "Daily three-layer soil moisture data for China..."), article detail returned
full file/author/license metadata, categories returned 2,180 entries, and a bad article ID
correctly returned HTTP 404 (`EntityNotFound`) which the shared `BaseAdapter` maps to a 422
`INPUT_REJECTED` client error rather than a 502 gateway error.

## Tool Mapping

| Tool ID | MCP Name | Endpoint | Price | TTL | Description |
|---------|----------|----------|-------|-----|--------------|
| `figshare.search` | `figshare.articles.search` | `/articles` | $0.001 | 900s | Search research articles by free-text query, DOI, and/or item type, newest first |
| `figshare.article_details` | `figshare.articles.details` | `/articles/{id}` | $0.001 | 86400s | Full article metadata — description, authors, license, categories, downloadable files |
| `figshare.categories` | `figshare.taxonomy.categories` | `/categories` | $0.001 | 604800s | Browse/search the 2,180-entry subject-category taxonomy |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| figshare.search | $0 (open API) | $0.001 | ~100% |
| figshare.article_details | $0 (open API) | $0.001 | ~100% |
| figshare.categories | $0 (open API) | $0.001 | ~100% |

No-auth public research API — pricing covers infrastructure and pipeline cost only. `search` uses
a short 900s TTL since new articles are deposited continuously; `article_details` uses a 86400s TTL
since published article metadata rarely changes; `categories` uses the longest 604800s TTL since
the subject taxonomy is effectively static.

## Input Schemas

### figshare.search
```json
{
  "query": "string (optional) — free-text search across title, description, author, e.g. 'soil moisture'.",
  "doi": "string (optional) — filter by exact DOI, e.g. '10.6084/m9.figshare.33350571.v1'.",
  "item_type": "enum (optional) — figure, media, dataset, poster, journal_contribution, presentation, thesis, software, online_resource, preprint, book, conference_contribution.",
  "order_direction": "enum ['asc', 'desc'] (optional) — sort direction by published date, default 'desc'.",
  "page": "number (optional) — page number, default 1.",
  "page_size": "number (optional) — 1-50, default 10."
}
```

### figshare.article_details
```json
{
  "article_id": "number (required) — Figshare article ID, e.g. 33350571, from figshare.search results."
}
```

### figshare.categories
```json
{
  "query": "string (optional) — free-text filter on category/subject title, e.g. 'ecology'.",
  "limit": "number (optional) — 1-200, default 50."
}
```

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/figshare/index.ts` | Main adapter class (`FigshareAdapter`) — builds requests for articles/article-detail/categories, maps `item_type` string to Figshare's numeric type ID, trims verbose upstream records in `parseResponse()` |
| `src/schemas/figshare.schema.ts` | Zod input schemas (`figshareSchemas`) |
| `src/adapters/registry.ts` | Case `'figshare'` → `FigshareAdapter` |
| `src/schemas/index.ts` | Schema registry import (`figshareSchemas`) |
| `src/mcp/tool-definitions.ts` | 3 tool definitions (Figshare API block) |
| `config/tool_provider_config.yaml` | Price and TTL per tool (after the `inaturalist` block) |
| `src/config/provider-limits.json` | Dashboard entry (`figshare`) |
| `static/dashboard.html` | `PROVIDER_CATEGORIES['Figshare'] = 'Education'` |

## Notes

- No separate `types.ts` file — follows the lightweight pattern used by `gutendex`/`inaturalist`
  where raw upstream shapes are consumed inline via `Record<string, unknown>` since the adapter is
  small (3 tools, no OAuth/token management).
- `item_type` is validated against a fixed Zod enum (12 values) and mapped to Figshare's internal
  numeric type IDs in the adapter — Figshare's `/item_types` reference endpoint is not called
  per-request since the mapping is stable.
- `figshare.categories` fetches the full 2,180-entry (~440KB) taxonomy on every call (well under
  the 1MB response cap) and applies the optional `query` filter and `limit` slice client-side in
  `parseResponse()`, since the upstream endpoint has no server-side filter parameter.
- This onboarding ran in **batch mode** under the sandboxed night-orchestra role: adapter, schema,
  registry wiring, TS/lint, DB seed, local docker build and deploy, local verification (health,
  catalog, schema, 8/8 smoke test), UC file, and local git commit were completed. Per batch-mode
  instructions, publishing to the remote origin, Smithery, and Glama was intentionally skipped —
  the hourly batch-pusher role handles that step for locally-committed onboardings.
