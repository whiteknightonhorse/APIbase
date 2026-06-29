# UC-523 — Wikipedia REST API

## Meta

| Field | Value |
|-------|-------|
| UC ID | UC-523 |
| Provider | Wikipedia / Wikimedia Foundation |
| Category | education |
| Onboarded | 2026-06-29 |
| Status | LIVE |
| Tools | 5 |
| Upstream cost | $0 (public open API) |
| Our price | $0.001–$0.002/call |
| Auth | None (User-Agent header required per Wikimedia policy) |
| License | CC BY-SA 4.0 (attribution included in all responses) |

## Provider Description

Wikipedia REST API exposes the world's largest free encyclopedia — 65M+ articles across 55+ language editions. The REST API (rest_v1) provides structured JSON access to article summaries, media files, and curated daily feeds. A second endpoint (w/rest.php/v1) powers full-text article search.

**No registration required.** Wikimedia's policy requires a descriptive `User-Agent` header identifying the application.

## API Endpoints Used

| Endpoint | Tool | Notes |
|----------|------|-------|
| `GET /api/rest_v1/page/summary/{title}` | `wikipedia.article.summary` | Language-aware via subdomain |
| `GET /w/rest.php/v1/search/page?q=...` | `wikipedia.search.pages` | Up to 50 results |
| `GET /api/rest_v1/page/media-list/{title}` | `wikipedia.article.media` | Images + srcsets |
| `GET /api/rest_v1/feed/featured/{year}/{mm}/{dd}` | `wikipedia.feed.featured` | English only |
| `GET /api/rest_v1/feed/onthisday/events/{mm}/{dd}` | `wikipedia.feed.on_this_day` | All years |

**Decommissioned endpoints (NOT used):**
- `/api/rest_v1/page/related/{title}` — returns 403 as of June 2026 (T376297)
- `/api/rest_v1/page/sections/{title}` — returns 404

## Tool Mapping

| Tool ID | MCP Name | Description | Price | Cache TTL |
|---------|----------|-------------|-------|-----------|
| `wikipedia.article.summary` | `wikipedia.article.summary` | Article summary with extract + thumbnail | $0.001 | 3600s |
| `wikipedia.search.pages` | `wikipedia.search.pages` | Full-text page search (up to 50 results) | $0.001 | 1800s |
| `wikipedia.article.media` | `wikipedia.article.media` | All media files embedded in an article | $0.001 | 3600s |
| `wikipedia.feed.featured` | `wikipedia.feed.featured` | Daily featured article + image + top-10 reads | $0.002 | 3600s |
| `wikipedia.feed.on_this_day` | `wikipedia.feed.on_this_day` | Historical events on a given month/day | $0.002 | 86400s |

## Input Schemas

### wikipedia.article.summary
```json
{
  "title": "string — Wikipedia article title (underscores for spaces, e.g. 'Albert_Einstein')",
  "language": "string (optional, 2-letter, default 'en')"
}
```

### wikipedia.search.pages
```json
{
  "query": "string — search query",
  "limit": "number (optional, 1–50, default 10)",
  "language": "string (optional, 2-letter, default 'en')"
}
```

### wikipedia.article.media
```json
{
  "title": "string — Wikipedia article title",
  "language": "string (optional, 2-letter, default 'en')"
}
```

### wikipedia.feed.featured
```json
{
  "date": "string (optional, YYYY-MM-DD, default today)"
}
```

### wikipedia.feed.on_this_day
```json
{
  "date": "string (optional, YYYY-MM-DD, only month+day used, default today)"
}
```

## Implementation Files

- `src/adapters/wikipedia/types.ts` — TypeScript response interfaces
- `src/adapters/wikipedia/index.ts` — WikipediaAdapter class (extends BaseAdapter)
- `src/schemas/wikipedia.schema.ts` — Zod schemas for all 5 tools
- `src/adapters/registry.ts` — Added `case 'wikipedia':`
- `src/schemas/index.ts` — Spread `...wikipediaSchemas`
- `src/mcp/tool-definitions.ts` — 5 tool definitions with mcpName, title, description, category, annotations
- `config/tool_provider_config.yaml` — 5 tool entries under `# --- UC-523 ---`
- `src/config/provider-limits.json` — `"wikipedia"` entry (unlimited, no auth)

## Pricing Rationale

| Tool | Upstream cost | Our price | Margin |
|------|--------------|-----------|--------|
| `wikipedia.article.summary` | $0 | $0.001 | 100% |
| `wikipedia.search.pages` | $0 | $0.001 | 100% |
| `wikipedia.article.media` | $0 | $0.001 | 100% |
| `wikipedia.feed.featured` | $0 | $0.002 | 100% |
| `wikipedia.feed.on_this_day` | $0 | $0.002 | 100% |

Featured and on-this-day priced at $0.002 due to larger response payloads (multiple articles, images, events).

## Attribution

All responses include:
```json
"attribution": "Wikipedia contributors, CC BY-SA 4.0, https://en.wikipedia.org"
```

This satisfies the CC BY-SA 4.0 license requirement for attribution in commercial use.

## Notes

- The adapter uses `en.{lang}.wikipedia.org` subdomain routing for multi-language support.
- Wikipedia titles are `encodeURIComponent`-encoded before interpolation into URL paths (CWE-116 prevention).
- User-Agent header `APIbase/1.0 (https://apibase.pro; contact@apibase.pro)` is set on every request per Wikimedia's bot policy.
- The `related` endpoint was decommissioned by Wikimedia in 2026 (T376297) and is not used.
