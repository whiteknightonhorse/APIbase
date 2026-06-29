# UC-534: UN Comtrade Public Preview API

## Meta

| Field | Value |
|-------|-------|
| UC ID | UC-534 |
| Provider | UN Comtrade (United Nations) |
| Category | World / Trade Statistics |
| Date | 2026-06-29 |
| Status | LIVE |
| Auth | None — public preview endpoints, 500 calls/day |
| Upstream Cost | $0 |
| Our Price | $0.001–$0.002/call |

## Provider Summary

UN Comtrade is the largest repository of international merchandise trade data, maintained by the United Nations Statistics Division. It contains import/export data from 200+ reporter countries covering 1962–present (annual) and 2010–present (monthly). Commodities are classified by the Harmonized System (HS), SITC, and other codes.

The **Public Preview API** (`comtradeapi.un.org/public/v1/...`) requires no registration or subscription key and provides up to 500 records per query with a 500 calls/day limit. The same data is available with higher limits via paid subscriptions on comtradedeveloper.un.org.

**Base URL:** `https://comtradeapi.un.org`

## Verified Endpoints

All tested 2026-06-29 from Hetzner DE server:

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/public/v1/preview/{typeCode}/{freqCode}/{clCode}` | GET | None | Trade data (up to 500 records) |
| `/public/v1/getDA/{typeCode}/{freqCode}/{clCode}` | GET | None | Data availability by reporter/period |
| `/public/v1/getMetadata/{typeCode}/{freqCode}/{clCode}` | GET | None | Dataset methodology notes |
| `/files/v1/app/reference/Reporters.json` | GET | None | Reporter countries list |

**Verified working example:**
```
GET https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=276&period=2021&cmdCode=84&flowCode=X&maxRecords=5&format=JSON&includeDesc=true
→ count=500, returns German machinery exports for 2021
```

## Tool Mapping

| Tool ID | MCP Name | Description | Price | Cache TTL |
|---------|----------|-------------|-------|-----------|
| `comtrade.trade_data` | `comtrade.trade.query` | Query import/export data by country/period/commodity | $0.002 | 86400s |
| `comtrade.availability` | `comtrade.trade.availability` | Check data availability for a reporter/period | $0.001 | 86400s |
| `comtrade.metadata` | `comtrade.trade.metadata` | Get dataset methodology metadata | $0.001 | 86400s |
| `comtrade.reporters` | `comtrade.reference.reporters` | List reporter countries with codes | $0.001 | 86400s |

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/comtrade/index.ts` | Main adapter (buildRequest/parseResponse) |
| `src/adapters/comtrade/types.ts` | TypeScript response type interfaces |
| `src/schemas/comtrade.schema.ts` | Zod validation schemas with descriptions |
| `src/adapters/registry.ts` | Added `case 'comtrade':` |
| `src/schemas/index.ts` | Imported and spread comtradeSchemas |
| `src/mcp/tool-definitions.ts` | Added 4 tool definitions |
| `config/tool_provider_config.yaml` | Added 4 tool config entries |
| `src/config/provider-limits.json` | Added dashboard config |
| `static/dashboard.html` | Added PROVIDER_CATEGORIES mapping |
| `scripts/test-comtrade.sh` | Smoke test script |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin | Reasoning |
|------|--------------|-----------|--------|-----------|
| comtrade.trade_data | $0 | $0.002 | 100% | Returns up to 500 records; higher price reflects data volume |
| comtrade.availability | $0 | $0.001 | 100% | Lightweight availability check |
| comtrade.metadata | $0 | $0.001 | 100% | Small metadata response |
| comtrade.reporters | $0 | $0.001 | 100% | Static reference file, cached 24h |

## Rate Limits

- 500 calls/day (shared across all public preview endpoints)
- No per-minute limit documented
- No auth required — limits are IP-based

## Notes

- The "TOTAL" cmdCode returns 0 records in preview (works only with subscription key). Use specific HS codes.
- Data availability varies significantly by country. Developed economies have more recent data.
- Values are in USD. The metadata endpoint reveals each country's reporting currency and USD conversion factor.
- The `/files/v1/app/reference/` endpoint hosts static JSON reference files (reporters, partner areas, HS codes) with no rate limit.
- URL path segments (typeCode, freqCode, clCode) use `encodeURIComponent()` per CLAUDE.md security rules.
