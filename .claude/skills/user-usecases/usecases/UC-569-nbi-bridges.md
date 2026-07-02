# UC-569 — National Bridge Inventory (NBI)

## Meta

| Field | Value |
|-------|-------|
| UC ID | UC-569 |
| Provider | National Bridge Inventory (NBI) / FHWA |
| Category | Infrastructure |
| Status | LIVE |
| Date | 2026-07-02 |
| Tools | 4 |

## Provider Summary

The National Bridge Inventory (NBI) is a FHWA/USDOT dataset tracking the status, location,
and structural health of all highway bridges on public roads in the United States.
Data is served via an ArcGIS FeatureServer hosted on geo.dot.gov. No authentication required.

- **621,000+ bridge records** (as of June 2023)
- **128 data fields** per bridge covering inspection ratings, load capacity, geometry, ownership
- **Annual updates** from FHWA inspection cycles
- **Public domain** — US Government open data (17 USC §105)
- **No rate limits** documented

## API Details

| Field | Value |
|-------|-------|
| Base URL | `https://geo.dot.gov/server/rest/services/Hosted/National_Bridge_Inventory/FeatureServer/0` |
| Auth | None |
| Protocol | ArcGIS REST API (query endpoint) |
| Max records/call | 2000 (ArcGIS default) |
| Geometry support | Yes (bounding box spatial queries) |
| Statistics support | Yes (GROUP BY aggregations) |

Note: The `National_Bridge_Inventory_DS` variant at the same domain requires auth (499 Token Required).
This integration uses `National_Bridge_Inventory` (without `_DS`) which is public.

## Tools

| Tool ID | MCP Name | Price | Cache TTL | Description |
|---------|----------|-------|-----------|-------------|
| `nbi.search` | `nbi.infrastructure.search` | $0.001 | 86400s | Search bridges by state + condition |
| `nbi.bridge_detail` | `nbi.infrastructure.bridge_detail` | $0.002 | 86400s | Full bridge record by structure number |
| `nbi.nearby` | `nbi.infrastructure.nearby` | $0.002 | 86400s | Find bridges within radius of a point |
| `nbi.condition_stats` | `nbi.infrastructure.condition_stats` | $0.001 | 86400s | Aggregated condition counts per state |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| nbi.search | $0 (US Gov public domain) | $0.001 | ~100% |
| nbi.bridge_detail | $0 | $0.002 | ~100% |
| nbi.nearby | $0 | $0.002 | ~100% |
| nbi.condition_stats | $0 | $0.001 | ~100% |

Higher price on detail/nearby reflects higher data richness (more fields, spatial indexing).

## Input Schemas

### nbi.search
```json
{
  "state_code": "string (2-digit FIPS, required)",
  "condition": "enum G|F|P (optional)",
  "limit": "integer 1–200 (default 50)"
}
```

### nbi.bridge_detail
```json
{
  "state_code": "string (2-digit FIPS, required)",
  "structure_number": "string max 15 chars (required)"
}
```

### nbi.nearby
```json
{
  "latitude": "number decimal degrees (required)",
  "longitude": "number decimal degrees (required)",
  "radius_miles": "number 0.1–50 (default 10)",
  "limit": "integer 1–100 (default 25)"
}
```

### nbi.condition_stats
```json
{
  "state_code": "string (2-digit FIPS, required)"
}
```

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/nbi/index.ts` | Main adapter — ArcGIS FeatureServer queries |
| `src/adapters/nbi/types.ts` | TypeScript types for NBI response shapes |
| `src/schemas/nbi.schema.ts` | Zod validation schemas |
| `src/adapters/registry.ts` | Added `case 'nbi':` |
| `src/schemas/index.ts` | Added `...nbiSchemas` |
| `src/mcp/tool-definitions.ts` | Added 4 tool definitions |
| `config/tool_provider_config.yaml` | Added 4 tool entries |
| `src/config/provider-limits.json` | Added dashboard config |
| `static/dashboard.html` | Added category mapping |

## Key Implementation Notes

1. **ArcGIS WHERE clauses**: State code must be padded to 2 digits (`state_code='06'`, not `'6'`).
2. **Nearby search**: Uses bounding box (`esriGeometryEnvelope`) — not exact circle. Degree conversion uses latitude-corrected longitude delta.
3. **Condition stats**: Uses ArcGIS `outStatistics` with `groupByFieldsForStatistics` to aggregate without transferring all records.
4. **Bridge condition decoding**: `G/F/P/N` → Good/Fair/Poor/Not applicable.
5. **Rating decoding**: NBI 0–9 scale decoded to text (0=Failed, 9=Excellent).
6. **Inspection date**: MMYY format decoded to ISO YYYY-MM.
7. **Open/Close status**: 7 codes decoded (A=Open, P=Posted, K=Posted combination, D/E=Closed, R/Z=Permitted).
8. **Scour**: 12 codes decoded (0=Low risk through U=Unknown).
