# UC-591 — Japan Postal Codes (postcode.teraren.com)

## Meta

| Field | Value |
|-------|-------|
| ID | UC-591 |
| Provider | postcode.teraren.com |
| Category | Location |
| Date | 2026-07-02 |
| Status | LIVE |
| Tools | 3 |
| Adapter | `src/adapters/postcode-japan/` |

## Overview

postcode.teraren.com is a free, open-source Japanese postal code API (MIT license) providing lookup and search for all ~124,000 active Japan Post postcodes. No authentication required. Returns addresses in Japanese (kanji + kana readings) and romaji, plus GPS coordinates and JIS administrative codes.

## Endpoints Used

| Endpoint | Method | Tool |
|----------|--------|------|
| `/postcodes/{postcode}.json` | GET | `postcode-japan.lookup` |
| `/postcodes.json?s=&prefecture=&city=` | GET | `postcode-japan.search` |
| `/prefectures.json` | GET | `postcode-japan.prefectures` |

## Tool Mapping

| Tool ID | MCP Name | Title | Price | Cache TTL |
|---------|----------|-------|-------|-----------|
| `postcode-japan.lookup` | `postcode-japan.postal.lookup` | Japan Postcode Lookup | $0.001 | 86400s |
| `postcode-japan.search` | `postcode-japan.postal.search` | Japan Postcode Search | $0.001 | 3600s |
| `postcode-japan.prefectures` | `postcode-japan.reference.prefectures` | Japan Prefecture List | $0.001 | 86400s |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| `postcode-japan.lookup` | $0 (open data) | $0.001 | ~100% |
| `postcode-japan.search` | $0 (open data) | $0.001 | ~100% |
| `postcode-japan.prefectures` | $0 (open data) | $0.001 | ~100% |

Free MIT-licensed API with no rate limits documented. $0.001/call minimum floor price for platform value-add (caching, normalization, auth, logging).

## Input Schemas

### postcode-japan.lookup
```json
{
  "postcode": "1500001"
}
```

### postcode-japan.search
```json
{
  "query": "渋谷",
  "prefecture": 13,
  "city": "渋谷区",
  "limit": 20
}
```

### postcode-japan.prefectures
```json
{}
```

## Implementation Files

- `src/adapters/postcode-japan/types.ts` — TypeScript interfaces
- `src/adapters/postcode-japan/index.ts` — PostcodeJapanAdapter
- `src/schemas/postcode-japan.schema.ts` — Zod schemas
- `config/tool_provider_config.yaml` — pricing + cache config
- `src/adapters/registry.ts` — case 'postcode-japan'
- `src/schemas/index.ts` — schema spread
- `src/mcp/tool-definitions.ts` — 3 tool definitions
- `src/config/provider-limits.json` — dashboard config

## Notes

- 7-digit postcodes accepted with or without hyphen (e.g. "150-0001" or "1500001")
- Returns addresses in three scripts: kanji, kana (hiragana/katakana), and romaji
- Location field provides GPS coordinates for ~80% of postcodes
- Prefecture codes (JIS 1–47) used for filtering; list available via prefectures tool
- Cache TTL 86400s for lookup/prefectures (data rarely changes), 3600s for search
