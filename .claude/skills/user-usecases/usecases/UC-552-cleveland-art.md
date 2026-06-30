# UC-552: Cleveland Museum of Art Open Access

## Meta

| Field | Value |
|-------|-------|
| ID | UC-552 |
| Provider | Cleveland Museum of Art |
| Category | media (Art & Culture) |
| Date | 2026-06-30 |
| Status | LIVE |
| Tools | 4 |
| Adapter | `src/adapters/cleveland-art/` |

## Provider Overview

The Cleveland Museum of Art Open Access API provides free, unrestricted access to the CMA's
digital collection data. No authentication required. Data is released under CC0 (public domain)
and CC BY licenses.

- **Base URL:** `https://openaccess-api.clevelandart.org/api`
- **Auth:** None (fully open)
- **Rate limits:** None documented
- **Collection size:** 68,000+ artworks, 9,200+ creators, 5,600+ exhibitions

## API Analysis

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/artworks/` | GET | Search artworks; filters: q, type, department, has_image, limit, skip |
| `/api/artworks/{id}` | GET | Full artwork record by numeric ID |
| `/api/creators/` | GET | Search creators; filters: q, nationality, limit, skip |
| `/api/exhibitions/` | GET | Search exhibitions; filters: q, is_venue_cma, limit, skip |

## Tool Mapping

| tool_id | mcpName | Description | Price |
|---------|---------|-------------|-------|
| `cma.artwork_search` | `cma.artwork.search` | Search 68K+ artworks by keyword, type, department | $0.001 |
| `cma.artwork_detail` | `cma.artwork.detail` | Full artwork record by numeric ID | $0.001 |
| `cma.creator_search` | `cma.creator.search` | Search 9,200+ artists/creators | $0.001 |
| `cma.exhibition_search` | `cma.exhibition.search` | Search 5,600+ exhibitions | $0.001 |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| `cma.artwork_search` | $0 (free, open) | $0.001 | ~100% |
| `cma.artwork_detail` | $0 (free, open) | $0.001 | ~100% |
| `cma.creator_search` | $0 (free, open) | $0.001 | ~100% |
| `cma.exhibition_search` | $0 (free, open) | $0.001 | ~100% |

All tools use free/open upstream data. Price of $0.001/call is the standard platform minimum
for infrastructure costs (API proxy, pipeline processing, ledger write).

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/cleveland-art/index.ts` | Main adapter class |
| `src/adapters/cleveland-art/types.ts` | TypeScript types for API responses |
| `src/schemas/cleveland-art.schema.ts` | Zod input schemas |
| `src/adapters/registry.ts` | Case `'cma':` added |
| `src/schemas/index.ts` | clevelandArtSchemas imported and spread |
| `src/mcp/tool-definitions.ts` | 4 tool definitions added |
| `config/tool_provider_config.yaml` | 4 tool entries added |
| `src/config/provider-limits.json` | Dashboard entry added |

## Notes

- **No auth needed** — Completely open API with no registration
- **CC0/CC BY license** — All collection data is freely reusable
- **Image CDN:** Images served from `openaccess-cdn.clevelandart.org` in web/print/full resolutions
- **Stale tools:** `cma.artwork` and `cma.search` (from a prior failed onboarding attempt) were
  marked `status='unavailable'` in the DB. `cma.search` has 165 execution_ledger entries and
  cannot be deleted due to FK constraint.
- **Cache TTLs:** artwork_detail at 86400s (collection data changes rarely); search endpoints 3600s
