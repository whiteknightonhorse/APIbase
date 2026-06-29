# UC-535: USDA Livestock Mandatory Price Reporting (LMPR) Datamart

## Meta

| Field | Value |
|-------|-------|
| UC ID | UC-535 |
| Provider | USDA Agricultural Marketing Service (AMS) |
| Category | Agriculture / Livestock Prices |
| Date | 2026-06-29 |
| Status | LIVE |
| Auth | None — US Government public domain (7 U.S.C. § 198–198b) |
| Upstream Cost | $0 |
| Our Price | $0.001/call |

## Provider Summary

The USDA Livestock Mandatory Price Reporting (LMPR) Datamart provides mandatory market reports for federally regulated livestock, poultry, and grain markets under the Livestock Mandatory Reporting Act. Packers, live poultry dealers, and importers with $125M+ in annual sales are legally required to report transaction prices.

**Base URL:** `https://mpr.datamart.ams.usda.gov`

**Note on API Endpoints:** Two separate APIs exist on this domain:
1. **Legacy XML endpoint:** `/ws/report/v1/{species}/{slug}?filter={JSON}` — requires JSON filter object with `{"filters":[{"fieldName":"Report date","operatorType":"EQUAL","values":["M/D/YYYY"]}]}`; returns XML.
2. **Current JSON endpoint (used by adapter):** `/services/v1.1/reports/{numericId}?q=report_date=M/D/YYYY&allSections=true` OR `?lastReports=1` for most recent — returns JSON arrays of report sections.

**Why the root `/ws/report` returns 404:** The base path has no listing endpoint. Individual report paths (e.g. `/ws/report/v1/cattle/LM_CT150`) return 204 when queried without the JSON filter parameter.

## Verified Endpoints

All tested 2026-06-29 from Hetzner DE server:

| Numeric ID | LM Slug | Report | Frequency |
|------------|---------|--------|-----------|
| 2466 | LM_CT100 | 5 Area Daily Weighted Average Direct Slaughter Cattle | Daily |
| 2511 | LM_HG201 | National Daily Direct Prior Day Slaughtered Swine | Daily |
| 2461 | LM_XB459 | National Weekly Boxed Beef Cutout & Boxed Beef Cuts | Weekly (Thu) |
| 2993 | DYWDAIRYPRODUCTSSALES | National Dairy Products Sales Report | Weekly |
| 2649 | LM_XL502 | National Estimated Lamb Carcass Cutout | Daily |

**Verified working example:**
```
GET https://mpr.datamart.ams.usda.gov/services/v1.1/reports/2466?q=report_date=6/29/2026&allSections=true
→ Returns: JSON with Summary + Detail sections showing cattle price ranges, head counts, weighted averages
```

## Tool Mapping

| Tool ID | MCP Name | Report ID | Description |
|---------|----------|-----------|-------------|
| `lmpr.cattle_slaughter_prices` | `lmpr.cattle.slaughter_prices` | 2466 | Daily 5-area cattle weighted avg prices |
| `lmpr.hog_slaughter_prices` | `lmpr.hog.slaughter_prices` | 2511 | Daily national prior-day hog prices |
| `lmpr.boxed_beef_cutout` | `lmpr.beef.boxed_cutout` | 2461 | Weekly boxed beef cutout & cut prices |
| `lmpr.dairy_product_prices` | `lmpr.dairy.product_prices` | 2993 | Weekly butter/cheese/whey/NFDM prices |
| `lmpr.lamb_carcass_cutout` | `lmpr.lamb.carcass_cutout` | 2649 | Daily lamb carcass cutout value |

## Input Schemas

All tools share the same input parameters:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `report_date` | string | No | Date in YYYY-MM-DD or M/D/YYYY format. Omit for most recent. |
| `all_sections` | boolean | No | Return all report sections (default: true). False = summary only. |

## Response Format

Each tool returns:
```json
{
  "report": "LM_CT100 — 5 Area Daily Weighted Average Direct Slaughter Cattle",
  "report_date": "06/29/2026",
  "published_date": "06/29/2026 11:28:36",
  "office": "St Joseph, MO",
  "available_sections": ["Summary", "Detail", "History"],
  "sections": {
    "Summary": [{ "previous_day_head_count": "44,520", ... }],
    "Detail": [{ "class_description": "ALL BEEF TYPE", "weighted_avg_price": "407.70", ... }]
  }
}
```

## Implementation Files

| File | Description |
|------|-------------|
| `src/adapters/lmpr/index.ts` | Main adapter class |
| `src/adapters/lmpr/types.ts` | TypeScript types for API responses |
| `src/schemas/lmpr.schema.ts` | Zod input schemas |
| `src/adapters/registry.ts` | Added `case 'lmpr':` |
| `src/schemas/index.ts` | Spread `lmprSchemas` |
| `src/mcp/tool-definitions.ts` | 5 tool definitions |
| `config/tool_provider_config.yaml` | 5 tool entries |
| `src/config/provider-limits.json` | Dashboard config |
| `static/dashboard.html` | Added `'USDA LMPR Datamart': 'Agriculture'` |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| lmpr.cattle_slaughter_prices | $0 | $0.001 | ~100% |
| lmpr.hog_slaughter_prices | $0 | $0.001 | ~100% |
| lmpr.boxed_beef_cutout | $0 | $0.001 | ~100% |
| lmpr.dairy_product_prices | $0 | $0.001 | ~100% |
| lmpr.lamb_carcass_cutout | $0 | $0.001 | ~100% |

Upstream is US Government public domain with no rate limits documented. Price set at $0.001 (minimum viable pricing) per the $0 upstream cost guideline.

## Key Implementation Notes

1. **API uses numeric IDs not LM_ slugs** — the `/services/v1.1/reports/{id}` endpoint requires numeric IDs (2466, 2511, etc.) not the legacy LM_ codes. These IDs are stable and do not change.
2. **Date format** — the API requires `M/D/YYYY` (no zero-padding). The adapter converts YYYY-MM-DD automatically.
3. **`lastReports=1` parameter** — used when no date is specified; returns the most recently published report. Cannot be combined with `allSections=true` (the API requires a date filter for allSections).
4. **Response is JSON array** — each element is a report section with `reportSection`, `reportSections` (list), `stats`, and `results` array.
5. **Response cleaning** — adapter strips repetitive metadata fields (slug_name, office_code, market_type_category, etc.) from each row to reduce response size.
6. **204 No Content** — the legacy `/ws/report/v1/{species}/{slug}` endpoint returns 204 when called without the JSON `filter` parameter. The adapter uses the `/services/v1.1/` endpoint instead.
