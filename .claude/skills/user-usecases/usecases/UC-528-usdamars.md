# UC-528 — USDA AMS MARS MyMarketNews

## Meta

| Field        | Value                                                       |
|-------------|-------------------------------------------------------------|
| UC ID       | UC-528                                                      |
| Provider    | USDA Agricultural Marketing Service — MyMarketNews           |
| Website     | https://mymarketnews.ams.usda.gov                           |
| Category    | agriculture / world                                         |
| Date        | 2026-06-29                                                  |
| Status      | LIVE                                                        |
| Auth        | None — US Government public domain (v3.1 public endpoints)  |
| Tools       | 4                                                           |

## Provider API Analysis

- **Base URL:** `https://marsapi.ams.usda.gov/services/v3.1/public`
- **Auth:** None required for public endpoints
- **Rate Limits:** None documented
- **License:** US Government public domain (17 USC §105)
- **Format:** JSON (`?format=json` query param)
- **Data scope:** Report metadata (title, ID, dates, file type) — not raw price data

### Available Public Endpoints

| Endpoint | Description |
|---------|-------------|
| `GET /listPublishedReports/{days}?format=json` | List reports published in last N days |
| `GET /listPublishedReport/{id}?format=json` | Get single report metadata by ID or slug |
| `GET /listCorrectedReports/{days}?format=json` | List corrected/amended reports |

### Note on v1.2 API

The v1.2 API (`https://marsapi.ams.usda.gov/services/v1.2`) returns 403 — it requires
registration. The file download URL (`mymarketnews.ams.usda.gov/filerepo/`) is blocked from
our Hetzner DE server. Tools use only the reliable v3.1 public endpoints.

## Tool Mapping

| Tool ID                        | MCP Name                       | Endpoint                          | Price  | Cache   |
|-------------------------------|-------------------------------|-----------------------------------|--------|---------|
| `usdamars.list_reports`       | `usdamars.reports.list`       | `/listPublishedReports/{days}`    | $0.001 | 3600s   |
| `usdamars.get_report`         | `usdamars.reports.get`        | `/listPublishedReport/{id}`       | $0.001 | 86400s  |
| `usdamars.list_corrected`     | `usdamars.reports.corrected`  | `/listCorrectedReports/{days}`    | $0.001 | 3600s   |
| `usdamars.search_reports`     | `usdamars.reports.search`     | `/listPublishedReports/{days}`    | $0.001 | 3600s   |

## Implementation Files

- `src/adapters/usdamars/types.ts` — TypeScript response interfaces
- `src/adapters/usdamars/index.ts` — UsdaMarsAdapter class
- `src/schemas/usdamars.schema.ts` — Zod input validation schemas
- `src/adapters/registry.ts` — Added `case 'usdamars':`
- `src/schemas/index.ts` — Spread `usdamarsSchemas`
- `src/mcp/tool-definitions.ts` — 4 tool entries
- `config/tool_provider_config.yaml` — 4 tool entries under `# UC-528`
- `src/config/provider-limits.json` — `"usdamars"` dashboard entry
- `scripts/test-usdamars.sh` — Provider smoke test script

## Input Schemas

### usdamars.list_reports
```json
{
  "days": { "type": "integer", "min": 1, "max": 30, "default": 7,
            "description": "Number of past days to include" }
}
```

### usdamars.get_report
```json
{
  "report_id": { "type": "string|number", "required": true,
                 "description": "Report numeric ID or slug (e.g. 2826 or \"nw_ls910\")" }
}
```

### usdamars.list_corrected
```json
{
  "days": { "type": "string|number", "default": "all",
            "description": "Days to search (1-90 or \"all\")" }
}
```

### usdamars.search_reports
```json
{
  "keyword": { "type": "string", "optional": true,
               "description": "Commodity keyword filter (cattle, dairy, fruit, grain, etc.)" },
  "days": { "type": "integer", "min": 1, "max": 30, "default": 7 }
}
```

## Pricing Rationale

| Tool                      | Upstream Cost | Our Price | Margin |
|--------------------------|--------------|-----------|--------|
| `usdamars.list_reports`  | $0           | $0.001    | ~100%  |
| `usdamars.get_report`    | $0           | $0.001    | ~100%  |
| `usdamars.list_corrected`| $0           | $0.001    | ~100%  |
| `usdamars.search_reports`| $0           | $0.001    | ~100%  |

Free upstream (US Government public domain) → standard $0.001 floor price for operational costs.
