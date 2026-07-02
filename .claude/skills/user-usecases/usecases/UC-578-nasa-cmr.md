# UC-578 — NASA CMR (Common Metadata Repository)

## Meta

| Field | Value |
|-------|-------|
| ID | UC-578 |
| Provider | NASA CMR |
| Category | Space |
| Date | 2026-07-02 |
| Status | LIVE |
| Tools | 4 |
| Auth | None (US Gov public domain) |
| Upstream Cost | $0 |

## Provider Overview

NASA Common Metadata Repository (CMR) is the authoritative catalog for NASA Earth science data.
It indexes 45,000+ satellite collections from 60+ NASA data archives covering climate, atmosphere,
land, ocean, cryosphere, biosphere, and space weather. CMR is the gateway for discovering
satellite datasets (collections) and individual data files (granules) from missions like Terra,
Aqua, Aura, Landsat, GPM, GRACE-FO, ICESat-2, and many others.

- **API Base URL:** https://cmr.earthdata.nasa.gov/search/
- **Documentation:** https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html
- **Auth:** None required
- **Rate Limits:** No documented rate limits

## Tool Mapping

| Tool ID | MCP Name | Description | Price | Cache TTL |
|---------|----------|-------------|-------|-----------|
| `nasa-cmr.search_collections` | `nasa-cmr.datasets.search` | Search Earth science satellite datasets | $0.002 | 300s |
| `nasa-cmr.collection_detail` | `nasa-cmr.datasets.detail` | Get full UMM metadata for a collection | $0.001 | 3600s |
| `nasa-cmr.search_granules` | `nasa-cmr.granules.search` | Search data granules (files) in a collection | $0.002 | 300s |
| `nasa-cmr.list_providers` | `nasa-cmr.providers.list` | List NASA CMR data archive providers | $0.001 | 86400s |

## API Endpoints Used

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/search/collections.json` | GET | Search collections by keyword, temporal, spatial, provider |
| `/search/collections.umm_json?concept_id=` | GET | Full UMM-C metadata for a collection |
| `/search/granules.json` | GET | Search granules by collection ID, temporal, spatial |
| `/search/providers` | GET | List all registered CMR data providers |

## Input Schemas

### nasa-cmr.search_collections
- `keyword` (string, optional) — Free-text search
- `short_name` (string, optional) — Exact dataset short name (e.g. "MOD13A2")
- `provider` (string, optional) — Data center ID (e.g. "GES_DISC", "ORNL_DAAC")
- `temporal_start` (string, optional) — ISO 8601 UTC start date
- `temporal_end` (string, optional) — ISO 8601 UTC end date
- `bbox` (string, optional) — "west,south,east,north" decimal degrees
- `processing_level` (string, optional) — "1B", "2", "3", or "4"
- `sort_key` (enum, optional) — "-score", "entry_title", "-entry_title", "start_date", "-start_date"
- `page_size` (integer 1–20, optional, default 10)

### nasa-cmr.collection_detail
- `concept_id` (string, required) — CMR concept ID (e.g. "C2515837343-GES_DISC")

### nasa-cmr.search_granules
- `collection_concept_id` (string, optional) — CMR concept ID of the parent collection
- `short_name` (string, optional) — Collection short name
- `temporal_start` (string, optional) — ISO 8601 UTC start
- `temporal_end` (string, optional) — ISO 8601 UTC end
- `bbox` (string, optional) — "west,south,east,north" spatial filter
- `day_night_flag` (enum, optional) — "day", "night", "unspecified"
- `page_size` (integer 1–20, optional, default 10)

### nasa-cmr.list_providers
- `page_size` (integer 1–100, optional, default 50)

## Implementation Files

- `src/adapters/nasa-cmr/types.ts` — TypeScript response types
- `src/adapters/nasa-cmr/index.ts` — NasaCmrAdapter class
- `src/schemas/nasa-cmr.schema.ts` — Zod input schemas
- `src/adapters/registry.ts` — case 'nasa-cmr'
- `src/schemas/index.ts` — ...nasaCmrSchemas
- `src/mcp/tool-definitions.ts` — 4 tool definitions
- `config/tool_provider_config.yaml` — 4 tool entries
- `src/config/provider-limits.json` — "nasa-cmr" entry

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| nasa-cmr.search_collections | $0 | $0.002 | ~100% |
| nasa-cmr.collection_detail | $0 | $0.001 | ~100% |
| nasa-cmr.search_granules | $0 | $0.002 | ~100% |
| nasa-cmr.list_providers | $0 | $0.001 | ~100% |

Free upstream (US Gov public domain) → pricing set at $0.001–$0.002/call per APIbase minimum for
open-data providers. Collection/granule search set at $0.002 to reflect computational overhead of
spatial/temporal queries; detail/providers set at $0.001 (simpler lookups, heavy caching).

## Notes

- CMR `opensearch:totalResults` field is absent from JSON `.json` format responses (only in Atom XML);
  the adapter returns the count of entries in `entry[]` instead.
- The `providers` endpoint uses path `/search/providers` (no `.json` extension) and returns
  `{"hits": N, "took": N, "items": [...]}` UMM-JSON format.
- `collection_detail` uses `/search/collections.umm_json?concept_id=X` which returns the full
  UMM-C (Universal Metadata Model for Collections) record with platforms, instruments, science
  keywords (GCMD taxonomy), DOI, and related URLs.
- Granule download URLs are extracted from `links[]` where `rel` contains "download".
