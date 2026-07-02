# UC-577 — EPA ECHO (Enforcement and Compliance History Online)

## Meta

| Field | Value |
|-------|-------|
| UC ID | UC-577 |
| Provider | EPA ECHO |
| Website | https://echodata.epa.gov/echo/ |
| Category | Environmental Compliance |
| Date | 2026-07-02 |
| Status | LIVE |
| Tools | 4 |
| Auth | None — US Government public domain (17 USC §105) |
| Rate Limit | 300 req/hour, 1500/day per IP |

## Overview

EPA ECHO (Enforcement and Compliance History Online) is the US Environmental Protection Agency's
public database of regulated facility compliance and enforcement data. It covers 1M+ facilities
regulated under major environmental statutes including the Clean Air Act (CAA), Clean Water Act
(CWA), Resource Conservation and Recovery Act (RCRA), Safe Drinking Water Act (SDWA), and
Toxic Release Inventory (TRI).

Key use cases:
- Environmental due diligence for M&A, real estate, and lending
- ESG/sustainability screening of suppliers and counterparties  
- Regulatory compliance research and permit verification
- Journalism and public interest research on polluters

## API Analysis

Base URL: `https://echodata.epa.gov/echo/`

| Endpoint | Notes |
|----------|-------|
| `echo_rest_services.get_facilities` | Multi-program facility search; requires narrow params (zip_code or name+state) to avoid 100K+ row limit |
| `echo_rest_services.get_facility_info` | Facility detail by FRS Registry ID |
| `air_rest_services.get_facilities` | CAA-specific facility search |
| `echo_rest_services.get_enforcement_actions` | Enforcement/violation history by Registry ID |

**Rate limit:** 300 req/hour, 1500/day per IP (mitigated by long cache TTLs).
**No API key required.** No registration. US Government open data.

## Tool Mapping

| tool_id | mcpName | Endpoint | Price | Cache TTL |
|---------|---------|----------|-------|-----------|
| `echo.facility_search` | `echo.compliance.facility_search` | `echo_rest_services.get_facilities` | $0.003 | 3600s |
| `echo.facility_detail` | `echo.compliance.facility_detail` | `echo_rest_services.get_facility_info` | $0.003 | 86400s |
| `echo.air_facilities` | `echo.compliance.air_facilities` | `air_rest_services.get_facilities` | $0.003 | 3600s |
| `echo.violations` | `echo.compliance.violations` | `echo_rest_services.get_enforcement_actions` | $0.003 | 86400s |

## Input Schemas

### echo.facility_search
```json
{
  "zip_code": "string (optional) — US ZIP code for location-based search",
  "facility_name": "string (optional) — partial name; use with state",
  "state": "string (optional) — 2-letter state code (CA, TX, NY)",
  "active_only": "boolean (optional, default true)",
  "limit": "integer (optional, 1-50, default 10)"
}
```

### echo.facility_detail
```json
{
  "registry_id": "string (required) — FRS Registry ID from facility_search"
}
```

### echo.air_facilities
```json
{
  "zip_code": "string (optional) — US ZIP code",
  "facility_name": "string (optional) — partial name",
  "state": "string (optional) — 2-letter state code",
  "limit": "integer (optional, 1-50, default 10)"
}
```

### echo.violations
```json
{
  "registry_id": "string (required) — FRS Registry ID from facility_search"
}
```

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/echo/types.ts` | TypeScript response interfaces |
| `src/adapters/echo/index.ts` | EchoAdapter extending BaseAdapter |
| `src/schemas/echo.schema.ts` | Zod schemas with descriptions |
| `src/adapters/registry.ts` | `case 'echo':` added |
| `src/schemas/index.ts` | `echoSchemas` spread |
| `src/mcp/tool-definitions.ts` | 4 tool definitions |
| `config/tool_provider_config.yaml` | Pricing + TTL config |
| `src/config/provider-limits.json` | Dashboard config |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|---------------|-----------|--------|
| echo.facility_search | $0.000 (US Gov) | $0.003 | 100% |
| echo.facility_detail | $0.000 (US Gov) | $0.003 | 100% |
| echo.air_facilities | $0.000 (US Gov) | $0.003 | 100% |
| echo.violations | $0.000 (US Gov) | $0.003 | 100% |

$0.003 reflects the high value of environmental compliance data for ESG/due diligence use cases.
The 300 req/hour rate limit makes caching essential; long TTLs (1h–24h) preserve quota for
fresh lookups.

## Notes

- The search endpoints require narrow parameters: `p_zip` alone is sufficient, but `p_name` without
  `p_st` often exceeds the API's queryset limit (~100K rows max). The adapter throws `INPUT_REJECTED`
  (422) with a helpful message when the queryset limit is hit.
- Rate limit errors from EPA ECHO surface as `RATE_LIMIT` (429) in the pipeline.
- FRS Registry IDs (e.g. `110000350226`) are the canonical cross-program facility identifier.
  They appear in `facility_search` results and are used by `facility_detail` and `violations`.
