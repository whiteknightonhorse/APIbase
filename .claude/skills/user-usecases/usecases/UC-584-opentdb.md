# UC-584: Open Trivia Database (opentdb)

## Meta

| Field | Value |
|-------|-------|
| ID | UC-584 |
| Provider | Open Trivia Database |
| Website | https://opentdb.com |
| Category | Entertainment / Trivia |
| Status | LIVE |
| Date | 2026-07-02 |
| Auth | None (no registration required) |
| License | CC BY-SA 4.0 |

## Provider Overview

Open Trivia Database is a free, user-contributed trivia question database with 5000+ verified questions
across 24 categories. No API key or registration is required. Questions span General Knowledge,
Entertainment (Books, Film, Music, TV, Video Games, Board Games, Musicals), Science & Nature,
Computers, Mathematics, Mythology, Sports, Geography, History, Politics, Art, Celebrities, Animals,
Vehicles, Comics, Gadgets, Japanese Anime & Manga, and Cartoon & Animations.

## API Endpoints Verified

| Endpoint | Method | Description |
|----------|--------|-------------|
| `https://opentdb.com/api.php` | GET | Fetch random trivia questions |
| `https://opentdb.com/api_category.php` | GET | List all categories |
| `https://opentdb.com/api_count.php?category={id}` | GET | Question count per category |
| `https://opentdb.com/api_count_global.php` | GET | Global question statistics |

## Tool Mapping

| tool_id | mcpName | Description | Price | Cache TTL |
|---------|---------|-------------|-------|-----------|
| `opentdb.questions` | `opentdb.trivia.questions` | Get random trivia questions | $0.001 | 60s |
| `opentdb.categories` | `opentdb.trivia.categories` | List all 24 categories | $0.001 | 86400s |
| `opentdb.category_count` | `opentdb.trivia.category_count` | Question count for a category | $0.001 | 3600s |
| `opentdb.global_count` | `opentdb.trivia.global_count` | Global question statistics | $0.001 | 3600s |

## Input Schemas

### opentdb.questions
- `amount` (integer, optional, default 10, max 50) — number of questions to return
- `category` (integer, optional) — category ID (9–32), use categories tool to list
- `difficulty` (enum: easy|medium|hard, optional) — difficulty filter
- `type` (enum: multiple|boolean, optional) — multiple-choice or True/False

### opentdb.categories
- `_placeholder` (string, optional) — no params needed

### opentdb.category_count
- `category_id` (integer, required, 9–32) — category to count

### opentdb.global_count
- `_placeholder` (string, optional) — no params needed

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/opentdb/types.ts` | TypeScript interfaces for API responses |
| `src/adapters/opentdb/index.ts` | OpenTdbAdapter — buildRequest + parseResponse |
| `src/schemas/opentdb.schema.ts` | Zod schemas for 4 tools |
| `src/adapters/registry.ts` | Added `case 'opentdb':` |
| `src/schemas/index.ts` | Spread `opentdbSchemas` |
| `src/mcp/tool-definitions.ts` | 4 tool definitions with mcpName, title, description |
| `config/tool_provider_config.yaml` | 4 tool entries with prices and TTLs |
| `src/config/provider-limits.json` | Dashboard entry for opentdb |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| `opentdb.questions` | $0 (free, unlimited) | $0.001 | ~100% |
| `opentdb.categories` | $0 (free, unlimited) | $0.001 | ~100% |
| `opentdb.category_count` | $0 (free, unlimited) | $0.001 | ~100% |
| `opentdb.global_count` | $0 (free, unlimited) | $0.001 | ~100% |

All tools priced at $0.001 (minimum) — upstream is free, CC BY-SA 4.0. 100% margin on compute + gateway.

## Notes

- HTML entities in question/answer text are decoded by the adapter (e.g. `&#039;` → `'`, `&amp;` → `&`)
- `opentdb.questions` returns `all_answers` as a shuffled list for direct quiz presentation
- Response code 1 (no results) is handled gracefully — returns empty array with hint message
- opentdb asks for courtesy 1 req/5s; caching (60s for questions, 86400s for categories) ensures compliance
- No session token system used — simpler for stateless API gateway use
