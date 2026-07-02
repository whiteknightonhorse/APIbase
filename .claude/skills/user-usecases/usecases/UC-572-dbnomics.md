# UC-572 — DBnomics

## Meta

| Field | Value |
|-------|-------|
| UC ID | UC-572 |
| Provider | DBnomics |
| Category | Finance / Macroeconomic Data |
| Date | 2026-07-02 |
| Status | LIVE |
| Tools | 4 |
| Adapter | `src/adapters/dbnomics/` |

## Overview

DBnomics is a public aggregator of macroeconomic and statistical time-series data from 93+ official agencies worldwide. It provides a unified REST API to explore and fetch data from IMF, World Bank, OECD, Eurostat, ECB, BIS, ILO, INSEE, UN, and 85+ other providers. No registration or API key required. Data is open under CC-BY 4.0.

**Base URL:** `https://api.db.nomics.world/v22`

## Client Input Data & Credentials

- **API key:** None required
- **Authentication:** None
- **Rate limits:** No documented limits
- **License:** CC-BY 4.0

## Provider API Analysis

| Endpoint | Description | Auth |
|----------|-------------|------|
| `GET /providers` | List all 93+ statistical agencies | None |
| `GET /datasets/{provider_code}` | List datasets for a provider | None |
| `GET /series/{provider_code}/{dataset_code}` | List series in a dataset | None |
| `GET /series/{provider}/{dataset}/{series}?observations=true` | Fetch time-series data | None |

**Key observations:**
- `providers` response contains `.providers.docs[]` with `code`, `name`, `region`, `website`
- `datasets` response contains `.datasets.docs[]` with `code`, `name`, `nb_series`
- `series` response contains `.series.docs[]` with `series_code`, `series_name`, `dimensions`
- Series with `?observations=true` returns `period[]` and `value[]` arrays directly on the doc (not nested under `observations`)
- Values can be numeric or the string `"NA"` (missing data)
- Frequency encoded in `@frequency` field: `annual`, `quarterly`, `monthly`, etc.

## Tool Mapping

| tool_id | mcpName | Price | TTL | Upstream |
|---------|---------|-------|-----|----------|
| `dbnomics.providers` | `dbnomics.data.providers` | $0.001 | 86400s | `GET /providers` |
| `dbnomics.datasets` | `dbnomics.data.datasets` | $0.001 | 86400s | `GET /datasets/{provider}` |
| `dbnomics.series` | `dbnomics.data.series` | $0.001 | 3600s | `GET /series/{provider}/{dataset}` |
| `dbnomics.fetch_series` | `dbnomics.data.fetch_series` | $0.002 | 3600s | `GET /series/{p}/{d}/{s}?observations=true` |

## Input Schemas

### dbnomics.providers
```json
{
  "limit": { "type": "integer", "min": 1, "max": 200, "default": 100 },
  "offset": { "type": "integer", "min": 0, "default": 0 }
}
```

### dbnomics.datasets
```json
{
  "provider_code": { "type": "string", "required": true, "example": "WB" },
  "limit": { "type": "integer", "min": 1, "max": 200, "default": 50 },
  "offset": { "type": "integer", "min": 0, "default": 0 }
}
```

### dbnomics.series
```json
{
  "provider_code": { "type": "string", "required": true, "example": "WB" },
  "dataset_code": { "type": "string", "required": true, "example": "WDI" },
  "limit": { "type": "integer", "min": 1, "max": 200, "default": 50 },
  "offset": { "type": "integer", "min": 0, "default": 0 }
}
```

### dbnomics.fetch_series
```json
{
  "provider_code": { "type": "string", "required": true, "example": "WB" },
  "dataset_code": { "type": "string", "required": true, "example": "WDI" },
  "series_code": { "type": "string", "required": true, "example": "A-US.NY.GDP.MKTP.CD" },
  "last_n_periods": { "type": "integer", "min": 1, "max": 1000 }
}
```

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/dbnomics/index.ts` | Main adapter |
| `src/adapters/dbnomics/types.ts` | Raw API response types |
| `src/schemas/dbnomics.schema.ts` | Zod input schemas |
| `src/adapters/registry.ts` | Added `case 'dbnomics'` |
| `src/schemas/index.ts` | Spread `dbnomicsSchemas` |
| `src/mcp/tool-definitions.ts` | 4 tool definitions |
| `config/tool_provider_config.yaml` | 4 tool entries |
| `src/config/provider-limits.json` | Dashboard entry |
| `scripts/test-dbnomics.sh` | Smoke test script |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| dbnomics.providers | $0 (free) | $0.001 | ~100% |
| dbnomics.datasets | $0 (free) | $0.001 | ~100% |
| dbnomics.series | $0 (free) | $0.001 | ~100% |
| dbnomics.fetch_series | $0 (free) | $0.002 | ~100% |

`fetch_series` is priced at $0.002 (vs $0.001 for browse tools) because it returns full time-series arrays that can contain thousands of data points and benefits from caching — slight premium reflects data density.
