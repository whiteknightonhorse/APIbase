# UC-632: Wikimedia Analytics

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-632 |
| **Provider** | Wikimedia Foundation |
| **Domain** | wikimedia.org/api/rest_v1 |
| **Category** | World |
| **Theme** | Wikipedia Traffic & Editing Analytics (Pageviews, Top Articles, Edit Counts) |
| **Date** | 2026-08-29 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE |
| **Region** | Global (any Wikimedia project — Wikipedia editions, Commons, Wiktionary, etc.) |
| **Pricing Model** | free upstream |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

The Wikimedia Analytics REST API (`wikimedia.org/api/rest_v1/metrics`) is the Wikimedia
Foundation's public, Cloudflare-cached analytics service, distinct from the MediaWiki Action API
used by the existing `wikimedia-commons` adapter (UC-599). It exposes traffic (pageview) and
editing-activity (edit count) statistics computed from Wikimedia's server logs, for every
Wikimedia project (any `{lang}.wikipedia`, `commons.wikimedia`, `www.wikidata`, etc.). No
registration or API key is required.

| Aspect | Details |
|--------|---------|
| **Free Tier** | Unlimited queries, no signup, no API key |
| **Paid Tier** | None |
| **Auth Model** | None — Wikimedia's User-Agent policy (mediawiki.org/wiki/API:Etiquette) asks for a descriptive UA identifying the app + contact, not a credential |
| **License** | CC0 / public domain (Wikimedia Foundation open data) |
| **Quota** | No documented rate limit or hard cap found in the AQS/Pageviews wikitech docs |
| **Global Availability** | Reachable from this host, standard HTTPS JSON |

### Upstream Quirk — editors/aggregate route is dead (404)

The classic AQS editors/aggregate endpoint (distinct editor counts) returns
a 404 for every date format tried (both YYYYMMDD and the older YYYYMMDD00
hour-padded form). This route appears to have been removed/relocated upstream.
It is not included as a tool — edits/aggregate (total edit count, not distinct editors) is
live and used instead.

### Upstream Quirk — date format is plain YYYYMMDD, not hour-padded

Unlike some legacy Wikimedia analytics endpoints that expect YYYYMMDD00,
every route actually used here (pageviews/aggregate, pageviews/per-article, edits/aggregate)
accepts and expects plain 8-digit YYYYMMDD for start/end. Confirmed live: 20260701/20260801
works; hour-padded strings are unnecessary and were only ever needed for the dead
editors route above.

### Upstream Quirk — 404 for unknown project/date is a generic message, not per-field

An invalid project (e.g. a typo'd domain) and an out-of-range date both return the same generic
404 body about the date being valid but data not being loaded yet. The adapter cannot distinguish
"bad project" from "no data yet" from this message alone — both are surfaced identically via the
standard upstream-4xx to INPUT_REJECTED/422 mapping so the agent gets a clear fix-your-request
signal either way.

---

## API Overview

| # | Endpoint | Method | Description |
|---|----------|--------|-------------|
| 1 | /pageviews/aggregate/{project}/{access}/{agent}/{granularity}/{start}/{end} | GET | Total pageviews for a project over a date range |
| 2 | /pageviews/top/{project}/{access}/{year}/{month}/{day} | GET | Most-viewed articles for one day (or day=all-days for the month) |
| 3 | /pageviews/per-article/{project}/{access}/{agent}/{article}/{granularity}/{start}/{end} | GET | Pageview history for one specific article |
| 4 | /edits/aggregate/{project}/{editor-type}/{page-type}/{granularity}/{start}/{end} | GET | Total edit count for a project over a date range |

Base URL: https://wikimedia.org/api/rest_v1/metrics
Docs: https://wikitech.wikimedia.org/wiki/Analytics/AQS/Pageviews

---

## Tool Mapping

| # | Tool ID | mcpName | Description | Price |
|---|---------|---------|--------------|-------|
| 1 | wikimedia-analytics.pageviews_aggregate | wikimedia-analytics.pageviews.aggregate | Total pageviews for a project over a date range | $0.001 |
| 2 | wikimedia-analytics.pageviews_top | wikimedia-analytics.pageviews.top | Most-viewed articles for one day/month | $0.002 |
| 3 | wikimedia-analytics.pageviews_per_article | wikimedia-analytics.pageviews.per_article | Pageview history for one article | $0.001 |
| 4 | wikimedia-analytics.edits_aggregate | wikimedia-analytics.edits.aggregate | Total edit count for a project over a date range | $0.002 |

All 4 tools: category world, annotations READ_ONLY.

- First live provider exposing Wikipedia traffic/engagement analytics — complements the
  existing wikimedia-commons (media search, UC-599) content adapter with usage-signal data.
- pageviews_top gives agents a one-call "what's trending on Wikipedia right now" signal, useful
  for news/trend-detection agents without scraping the Wikipedia homepage.
- pageviews_per_article lets an agent correlate a real-world event with a spike in interest for
  a specific article (e.g. an actor's Wikipedia views after a film release).
- edits_aggregate is a signal for how actively-maintained or contested a topic or project is.

---

## Input Schemas

Defined in src/schemas/wikimedia-analytics.schema.ts, all strip()ped Zod objects:

- pageviews_aggregate: project (string, required — e.g. en.wikipedia), access (enum
  all-access/desktop/mobile-app/mobile-web, optional, default all-access), agent (enum
  all-agents/user/spider/automated, optional, default all-agents), granularity (enum
  daily/monthly, optional, default daily), start/end (string, YYYYMMDD, required).
- pageviews_top: project (required), access (optional), year (YYYY, required),
  month (MM, required), day (DD or all-days, required).
- pageviews_per_article: project (required), article (string, required — e.g.
  Albert_Einstein), access/agent/granularity (optional, same enums as above), start/end
  (required).
- edits_aggregate: project (required), editor_type (enum all-editor-types/
  anonymous/group-bot/name-bot/user, optional), page_type (enum all-page-types/
  content/non-content, optional), granularity (optional, default monthly), start/end
  (required).

---

## Implementation Files

| File | Purpose |
|------|---------|
| src/adapters/wikimedia-analytics/index.ts | WikimediaAnalyticsAdapter — buildRequest/parseResponse for all 4 tools |
| src/adapters/wikimedia-analytics/types.ts | Raw upstream response + normalized output types |
| src/schemas/wikimedia-analytics.schema.ts | Zod schemas for all 4 tools |
| src/adapters/registry.ts | case 'wikimedia-analytics' to WikimediaAnalyticsAdapter |
| src/schemas/index.ts | wikimediaAnalyticsSchemas spread |
| src/mcp/tool-definitions.ts | 4 tool definitions, category world |
| config/tool_provider_config.yaml | 4 tool entries, provider wikimedia-analytics, price_usd 0.001-0.002, cache_ttl 3600/86400 |
| src/config/provider-limits.json | Dashboard entry, limit_type unlimited |
| scripts/test-wikimedia-analytics.sh | Smoke test (catalog, schema, dashboard, OpenAPI, upstream sanity) |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| wikimedia-analytics.pageviews_aggregate | $0 (free, no auth) | $0.001 | ~100% | 3600s (1h — most recent day's count can still be updating) |
| wikimedia-analytics.pageviews_top | $0 (free, no auth) | $0.002 | ~100% | 86400s (24h — a past day's top-list is final once published) |
| wikimedia-analytics.pageviews_per_article | $0 (free, no auth) | $0.001 | ~100% | 3600s (1h — same recency rationale as aggregate) |
| wikimedia-analytics.edits_aggregate | $0 (free, no auth) | $0.002 | ~100% | 86400s (24h — edit counts settle quickly, monthly granularity by default) |

---

## Notes

- Deliberately excludes the classic editors/aggregate (distinct editor count) endpoint — see
  Upstream Quirk above; it 404s under every date format tried and appears removed/relocated.
- bytes-difference/aggregate (net byte delta from edits) was confirmed live during research but
  left out of scope — 4 tools (2 pageviews aggregate/detail views, top-articles discovery, edit
  activity) already cover the traffic-analytics use case without adding low-value overlap.
- Article titles are normalized (spaces to underscores) before being embedded in the per-article
  URL path, mirroring MediaWiki's own title-encoding convention.
- HTTP error mapping: malformed date (start/end not matching 8 digits) leads to INPUT_REJECTED/422
  (validated client-side); unknown project or no-data-yet date range that upstream 404s is a
  standard upstream-4xx INPUT_REJECTED/422 passthrough (section 12 PROVIDER_CALL fault classification).
- Verified live: en.wikipedia daily aggregate (Aug 2026), monthly desktop/user aggregate,
  pageviews/top for a specific day, Albert_Einstein per-article daily history, and
  edits/aggregate monthly total — all returned non-empty, plausible values before any code was
  written.

## Next Steps

- [x] No registration needed
- [x] Onboarded via night-orchestra batch role — adapter, schemas, registry, config, seed, build, deploy all live
- [x] Documented the dead editors/aggregate route and the date-format quirk
- [ ] Update candidates-registry.json status to "onboarded"
