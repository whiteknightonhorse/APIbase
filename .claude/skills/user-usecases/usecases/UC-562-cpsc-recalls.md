# UC-562 — CPSC SaferProducts.gov (Consumer Product Safety Recalls)

## Meta

| Field | Value |
|-------|-------|
| ID | UC-562 |
| Provider | CPSC SaferProducts.gov |
| Category | world (Consumer Safety) |
| Status | LIVE |
| Date | 2026-07-02 |
| Tools | 4 |
| Auth | None (US Gov public domain) |
| Upstream cost | $0 |
| Price | $0.001/call |
| Margin | 100% |

## Provider Overview

The US Consumer Product Safety Commission (CPSC) SaferProducts.gov REST API provides access
to the complete database of US consumer product safety recall notices. The CPSC is a federal
agency established under the Consumer Product Safety Act (15 USC §2051 et seq.) to protect
the public from unreasonable risks of injury or death from consumer products.

The database contains all recalls issued since 1974 — over 6 000 active recall records.
No authentication is required. The API returns JSON arrays of recall objects when queried
with `?format=json`.

**Base URL:** `https://www.saferproducts.gov/RestWebServices`

**Key API Behavior:**
- `pager.count` and `pager.offset` parameters are accepted but ignored — the API always
  returns ALL matching records in a single response. Client-side slicing is used.
- `RecallID` (integer) is the most reliable lookup key; `RecallNumber` is a string like "26582".
- Full-text search is done via `ProductName`, `Manufacturer`, `ProductType` query params.
- Date filtering uses `RecallDateStart` / `RecallDateEnd` (YYYY-MM-DD format accepted).

## Terms of Service / Resale

US Government data. Consumer Product Safety Act information is public domain under
17 USC §105. No terms restrict resale or redistribution. APIbase charges $0.001/call
as a gateway/normalization fee with 100% margin.

## Tool Mapping

| Tool ID | MCP Name | Endpoint | Price | Cache TTL |
|---------|----------|----------|-------|-----------|
| cpsc.search | cpsc.safety.search | GET /RestWebServices/Recall?format=json | $0.001 | 3600s |
| cpsc.detail | cpsc.safety.detail | GET /RestWebServices/Recall?format=json&RecallID=N | $0.001 | 86400s |
| cpsc.recent | cpsc.safety.recent | GET /RestWebServices/Recall?format=json&RecallDateStart=N days ago | $0.001 | 3600s |
| cpsc.by_manufacturer | cpsc.safety.by_manufacturer | GET /RestWebServices/Recall?format=json&Manufacturer=name | $0.001 | 3600s |

## Input Schemas

### cpsc.search
```typescript
{
  product_name?: string;     // Partial match product name keyword
  product_type?: string;     // Exact CPSC category (e.g. "Toys", "Furniture")
  manufacturer?: string;     // Partial match manufacturer name
  date_start?: string;       // YYYY-MM-DD recall date range start
  date_end?: string;         // YYYY-MM-DD recall date range end
  hazard?: string;           // Exact hazard name
  country?: string;          // Manufacturer country of origin
  limit?: number;            // 1–100, default 20
}
```

### cpsc.detail
```typescript
{
  recall_id?: number;        // Numeric RecallID (preferred)
  recall_number?: string;    // String recall number like "26582"
  // At least one of recall_id or recall_number required
}
```

### cpsc.recent
```typescript
{
  days?: number;             // Look-back window in days (1–365, default 30)
  product_type?: string;     // Optional CPSC category filter
  limit?: number;            // 1–100, default 20
}
```

### cpsc.by_manufacturer
```typescript
{
  manufacturer: string;      // Required — manufacturer/brand name (partial match)
  date_start?: string;       // YYYY-MM-DD date range start
  date_end?: string;         // YYYY-MM-DD date range end
  limit?: number;            // 1–100, default 50
}
```

## Implementation Files

- `src/adapters/cpsc/types.ts` — Raw API response TypeScript interfaces
- `src/adapters/cpsc/index.ts` — Main adapter (CpscAdapter extends BaseAdapter)
- `src/schemas/cpsc.schema.ts` — Zod schemas with full `.describe()` on all fields
- `src/adapters/registry.ts` — Added `case 'cpsc':` entry
- `src/schemas/index.ts` — Added `...cpscSchemas`
- `src/mcp/tool-definitions.ts` — Added 4 tool definitions with mcpName, title, description, category, annotations
- `config/tool_provider_config.yaml` — Added 4 tool entries with pricing
- `src/config/provider-limits.json` — Added `cpsc` dashboard config entry
- `scripts/test-cpsc.sh` — Smoke test script

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| cpsc.search | $0 (US Gov public domain) | $0.001 | 100% |
| cpsc.detail | $0 (US Gov public domain) | $0.001 | 100% |
| cpsc.recent | $0 (US Gov public domain) | $0.001 | 100% |
| cpsc.by_manufacturer | $0 (US Gov public domain) | $0.001 | 100% |

Rationale: free upstream, $0.001 standard rate for US Gov open data following same pricing
as earthquake.search, usgs-nwis, cms.hospital_search, and other US Gov providers.
Cache TTLs: detail=86400s (individual recalls change rarely), others=3600s (new recalls added daily).
