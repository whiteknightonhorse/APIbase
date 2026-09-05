# UC-054: Open Library — Books / ISBN Lookup

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-054 |
| **Provider** | Open Library (Internet Archive) |
| **Domain** | openlibrary.org |
| **Category** | Education (tool-definitions.ts category: `education`) |
| **Theme** | Books/ISBN lookup, full-text book search, work/author metadata |
| **Date** | 2026-03-17 |
| **Batch** | Solo onboarding (commit `6a0f2261`, 4 tools) |
| **Status** | LIVE |
| **Region** | Global |
| **Pricing Model** | free upstream (no auth) |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

Open Library is the Internet Archive's book database — 40M+ works, CC0 public domain — providing
ISBN-10/13 edition lookup, full-text search across title/author/subject, consolidated work-level
metadata (grouping all editions), and author profiles. `/isbn/{ISBN}.json` 302-redirects to
`/books/{OLID}.json`, which `fetch()` follows transparently.

| Aspect | Details |
|--------|---------|
| **Free Tier** | Fully open, no signup, no API key, CC0 public domain |
| **Paid Tier** | N/A — no paid tier exists |
| **Auth Model** | None (adapter sends a `User-Agent` header for polite crawling) |
| **License** | CC0 (public domain) |
| **Quota** | 1-3 req/sec (documented courtesy limit, not enforced) |
| **Global Availability** | Global |

---

## API Overview

| # | Endpoint | Method | Description |
|---|----------|--------|--------------|
| 1 | `/isbn/{ISBN}.json` | GET | Canonical ISBN-10/13 lookup (302 → `/books/{OLID}.json`) |
| 2 | `/search.json?q=&title=&author=&subject=&isbn=&sort=&page=&limit=` | GET | Full-text search across title, author, subject, ISBN |
| 3 | `/works/{OLID}.json` | GET | Work-level metadata (groups all editions) |
| 4 | `/authors/{OLID}.json` | GET | Author biography, dates, photo, Wikipedia link |

**Base URL:** `https://openlibrary.org`
**Docs:** `https://openlibrary.org/developers/api`

---

## Tool Mapping

| # | Tool ID | mcpName | Description | Price |
|---|---------|---------|--------------|-------|
| 1 | books.isbn_lookup | books.editions.isbn | Look up a book by ISBN-10/13 — title, author, publisher, pages, cover, subjects | $0.001 |
| 2 | books.search | books.catalog.search | Search 40M+ books by title, author, subject, or ISBN — ratings, covers, edition counts | $0.001 |
| 3 | books.work_details | books.works.details | Consolidated work metadata across all editions by Open Library Work ID | $0.001 |
| 4 | books.author | books.authors.details | Author profile by Open Library Author ID — bio, birth/death dates, photo, Wikipedia | $0.001 |

All 4 tools: category `education`, annotations `READ_ONLY`.

---

## Input Schemas

Defined in `src/schemas/openlibrary.schema.ts`, all `strip()`ped Zod objects:

- `books.isbn_lookup`: `isbn` (required string, ISBN-10 or ISBN-13)
- `books.search`: `query`, `title`, `author`, `subject`, `isbn` (all optional strings), `sort`
  (optional enum: new/old/rating/readinglog/want_to_read/currently_reading/already_read), `page`
  (optional int ≥1), `limit` (optional int 1-100, default 10)
- `books.work_details`: `olid` (required string, Open Library Work ID, e.g. `OL45804W`)
- `books.author`: `olid` (required string, Open Library Author ID, e.g. `OL23919A`)

---

## Implementation Files

| File | Purpose |
|------|---------|
| src/adapters/openlibrary/index.ts | OpenLibraryAdapter — buildRequest/parseResponse for all 4 tools |
| src/adapters/openlibrary/types.ts | Raw edition/search/work/author response types |
| src/schemas/openlibrary.schema.ts | Zod schemas for all 4 tools |
| src/adapters/registry.ts | case for `openlibrary` provider → OpenLibraryAdapter |
| src/schemas/index.ts | openlibrarySchemas spread |
| src/mcp/tool-definitions.ts | 4 tool definitions, category `education` |
| config/tool_provider_config.yaml | 4 tool entries, provider `openlibrary`, price_usd 0.001, cache_ttl 2592000 (isbn_lookup/work_details/author, 30d — static bibliographic data) / 3600 (search, 1h) |
| scripts/test-openlibrary.sh | Smoke test |
| static/.well-known/mcp/server-card.json | Regenerated — 175 tools, 3 prompts as of this commit |
| static/.well-known/openapi.json | Regenerated — 177 paths as of this commit |
| README.md | Updated tool/provider counts (176 tools, 36 providers) |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| books.isbn_lookup | $0 (free, no auth) | $0.001 | ~100% | 2,592,000s (30d — published edition metadata is static) |
| books.search | $0 (free, no auth) | $0.001 | ~100% | 3,600s (1h — catalog/ratings can shift) |
| books.work_details | $0 (free, no auth) | $0.001 | ~100% | 2,592,000s (30d — work-level metadata is static) |
| books.author | $0 (free, no auth) | $0.001 | ~100% | 2,592,000s (30d — author biographical data is static) |

---

## Notes

- This UC file backfills documentation for a provider that was already fully onboarded, deployed,
  and verified in production (commit `6a0f2261`, 2026-03-17) — the code, schemas, tool
  definitions, and config row all predate this file. Written from the real source files listed
  under Implementation Files, not invented.
- A pre-onboarding "candidate" version of this file existed at the same path (Status: Candidate,
  proposal-only Quick Score format) and has been replaced by this verified/onboarded-format
  version to match the current convention used by later UC files (e.g. UC-683).
- The commit also touched a second, duplicate-content commit (`4d23bac`) with an identical message
  and diff stat immediately preceding `6a0f2261` in history — both reference the same UC-054
  onboarding; `6a0f2261` is treated as canonical since it is the tip commit.
