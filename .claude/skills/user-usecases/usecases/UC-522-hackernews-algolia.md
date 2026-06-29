# UC-522: HackerNews Algolia Search

## Meta

| Field | Value |
|-------|-------|
| ID | UC-522 |
| Provider | HackerNews Algolia (`hn.algolia.com`) |
| Category | news |
| Date | 2026-06-29 |
| Status | LIVE |
| Adapter | `src/adapters/hnalgolia/` |
| Schema | `src/schemas/hnalgolia.schema.ts` |
| Tools | 5 |
| Auth | None (no registration, no API key) |
| License | CC BY 3.0 |
| UC File | UC-522-hackernews-algolia.md |

## Provider Overview

Algolia powers the official HackerNews search API at `https://hn.algolia.com/api/v1`. It indexes the full HN dataset (~20+ years, 40M+ items) with real-time updates. Provides relevance-ranked and date-ranked full-text search across stories, Ask HN, Show HN, jobs, polls, and comments. Also exposes item details and user profiles. No authentication required, no documented rate limits.

## API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `https://hn.algolia.com/api/v1/search` | GET | Full-text search, relevance-ranked |
| `https://hn.algolia.com/api/v1/search_by_date` | GET | Full-text search, date-ranked |
| `https://hn.algolia.com/api/v1/items/{id}` | GET | Item details with nested comments |
| `https://hn.algolia.com/api/v1/users/{username}` | GET | User profile |

## Tool Mapping

| Tool ID | MCP Name | Description | Price | Cache TTL |
|---------|----------|-------------|-------|-----------|
| `hnalgolia.search` | `hnalgolia.search.relevance` | Full-text search ranked by relevance | $0.001 | 300s |
| `hnalgolia.search_recent` | `hnalgolia.search.recent` | Full-text search ranked by date | $0.001 | 300s |
| `hnalgolia.search_comments` | `hnalgolia.search.comments` | Search HN comments | $0.001 | 300s |
| `hnalgolia.item_details` | `hnalgolia.item.details` | Item details by integer ID | $0.001 | 3600s |
| `hnalgolia.user_profile` | `hnalgolia.user.profile` | User profile (karma + bio) | $0.001 | 3600s |

## Input Schemas

### `hnalgolia.search` / `hnalgolia.search_recent`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Full-text search query |
| `type` | enum | no | story/comment/job/poll/ask/show (default: story) |
| `limit` | integer 1–30 | no | Results per page (default 10) |
| `page` | integer ≥0 | no | Page index (default 0) |

### `hnalgolia.search_comments`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Comment text search query |
| `limit` | integer 1–30 | no | Results per page (default 10) |
| `page` | integer ≥0 | no | Page index (default 0) |

### `hnalgolia.item_details`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | integer | yes | HN item ID (e.g. 48713832) |

### `hnalgolia.user_profile`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `username` | string | yes | HN username (case-sensitive, e.g. "pg") |

## Implementation Files

- `src/adapters/hnalgolia/index.ts` — main adapter (HnAlgoliaAdapter)
- `src/adapters/hnalgolia/types.ts` — TypeScript interfaces for raw API responses
- `src/schemas/hnalgolia.schema.ts` — Zod input schemas
- `src/adapters/registry.ts` — case 'hnalgolia' added
- `src/schemas/index.ts` — hnalgoliaSchemas spread
- `src/mcp/tool-definitions.ts` — 5 tool entries added
- `config/tool_provider_config.yaml` — 5 tool entries added
- `src/config/provider-limits.json` — "hnalgolia" entry added
- `scripts/test-hnalgolia.sh` — smoke test script

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| `hnalgolia.search` | $0 (public API) | $0.001 | ~100% |
| `hnalgolia.search_recent` | $0 (public API) | $0.001 | ~100% |
| `hnalgolia.search_comments` | $0 (public API) | $0.001 | ~100% |
| `hnalgolia.item_details` | $0 (public API) | $0.001 | ~100% |
| `hnalgolia.user_profile` | $0 (public API) | $0.001 | ~100% |

No upstream cost. $0.001/call covers infra + gateway overhead. ~100% gross margin.

## Differences vs HackerNews Firebase (UC-521)

| Capability | Firebase (UC-521) | Algolia (UC-522) |
|-----------|-------------------|-----------------|
| Real-time top/new/best lists | ✓ | ✗ |
| Full-text search | ✗ | ✓ |
| Date-ranked search | ✗ | ✓ |
| Comment search | ✗ | ✓ |
| Pagination | ✗ | ✓ |
| Historical coverage | last N items | 20+ years |

The two providers are complementary: Firebase for live feeds, Algolia for search and historical research.
