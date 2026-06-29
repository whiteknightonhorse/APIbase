# UC-531 — ClinicalTrials.gov v2

## Meta

| Field | Value |
|-------|-------|
| UC ID | UC-531 |
| Provider | ClinicalTrials.gov v2 |
| Category | health / clinical-research |
| Added | 2026-06-29 |
| Status | LIVE |
| Auth | No auth (NIH US Gov, public domain) |
| Upstream cost | $0 |

## Client Input

No credentials needed. ClinicalTrials.gov v2 API is completely open.

## Provider API Analysis

- Base URL: `https://clinicaltrials.gov/api/v2`
- Version: v2 (2024 redesign), full RESTful JSON API
- Database: 400K+ registered clinical trials (591K+ total including completed)
- License: NIH US Government public domain, commercial use permitted
- Rate limits: None documented

Key endpoints used:
- `GET /api/v2/studies` — search with query.cond, query.intr, query.spons, filter.overallStatus, filter.phase
- `GET /api/v2/studies/{nctId}` — full study record
- `GET /api/v2/stats/size` — database statistics

## Tool Mapping

| tool_id | mcpName | Description | Price |
|---------|---------|-------------|-------|
| clinicaltrials.search | clinicaltrials.trials.search | Search by condition/drug/sponsor/keyword + filters | $0.001 |
| clinicaltrials.study | clinicaltrials.trials.detail | Full study record by NCT ID | $0.001 |
| clinicaltrials.recruiting | clinicaltrials.trials.recruiting | Recruiting trials for condition/drug | $0.001 |
| clinicaltrials.stats | clinicaltrials.trials.stats | Database size statistics | $0.001 |

## Pricing Rationale

| Tool | Upstream cost | Our price | Margin |
|------|--------------|-----------|--------|
| clinicaltrials.search | $0 | $0.001 | ~100% |
| clinicaltrials.study | $0 | $0.001 | ~100% |
| clinicaltrials.recruiting | $0 | $0.001 | ~100% |
| clinicaltrials.stats | $0 | $0.001 | ~100% |

All tools are free upstream (NIH US Gov, no cost). Price set at $0.001 (minimum meaningful tier) as value-add for aggregation, caching (TTL 3600s/86400s), normalization, and structured API gateway access.

## Implementation Files

- `src/adapters/clinicaltrials/index.ts` — adapter (4 tools)
- `src/adapters/clinicaltrials/types.ts` — TypeScript interfaces
- `src/schemas/clinicaltrials.schema.ts` — Zod schemas (already existed, updated)
- `src/adapters/registry.ts` — `case 'clinicaltrials':` added
- `src/schemas/index.ts` — schemas imported (already existed at line 98)
- `src/mcp/tool-definitions.ts` — 4 tool definitions added
- `config/tool_provider_config.yaml` — 4 tool entries
- `src/config/provider-limits.json` — `clinicaltrials` entry
- `static/dashboard.html` — `'ClinicalTrials.gov v2': 'Clinical Research'` added

## Notes

- The old adapter used `clinical.*` tool IDs (2-level prefix "clinical"); new adapter uses `clinicaltrials.*` (correct prefix matching registry case).
- The `case 'clinical':` in registry.ts is a legacy alias kept to avoid breaking any existing calls.
- The `clinicaltrials.stats` tool needs a dummy parameter (schema compatibility rule: no empty schemas).
- Response size can be large for full study records; eligibility criteria and description are truncated at 500/1000 chars.
