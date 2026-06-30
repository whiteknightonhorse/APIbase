# UC-560 — NLM ICD-11 Clinical Tables

## Meta

| Field | Value |
|-------|-------|
| UC ID | UC-560 |
| Provider | NLM ICD-11 Clinical Tables |
| Category | Health / Disease Classification & Coding |
| Date | 2026-06-30 |
| Status | LIVE |
| Auth | No auth (US NLM public domain) |
| Upstream cost | $0 |
| License | US National Library of Medicine public domain; ICD-11 Copyright WHO 2019 (permitted for public classification use) |
| Docs | https://clinicaltables.nlm.nih.gov/apidoc/icd11_codes/v3/doc.html |

## Provider Description

The NLM Clinical Tables Service provides a searchable index of the WHO ICD-11 classification (International Classification of Diseases, 11th Revision), published by the US National Library of Medicine. The API offers fast full-text search across 55,000+ ICD-11 codes used for clinical documentation, hospital billing, disease surveillance, and mortality coding.

The ICD-11 supersedes ICD-10 (effective WHO member states from 2022) with improved digital design, granularity, and post-coordination (extension codes). Code types:
- **Stem codes** — Primary diagnoses, injuries, diseases, and causes of death (standalone)
- **Extension codes** — Qualifiers/modifiers (severity, laterality, histopathology, timing)

The API returns a compact 4-element array: `[total_matches, [codes], extra, [[code, title, type], ...]]`.

## Credentials / Keys

None required. Fully public, no registration needed.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `https://clinicaltables.nlm.nih.gov/api/icd11_codes/v3/search` | GET | Full-text search across ICD-11 codes |
| `?terms=<query>` | — | Clinical term to search |
| `?sf=code` | — | Search only code field (for exact lookup) |
| `?maxList=<n>` | — | Maximum results (default 7, no documented hard cap) |

## Tool Mapping

| Tool ID | MCP Name | Description | Price | Cache TTL |
|---------|----------|-------------|-------|-----------|
| `icd11.search` | `icd11.disease.search` | Search ICD-11 codes by clinical term | $0.001 | 86400s |
| `icd11.lookup` | `icd11.disease.lookup` | Look up a specific ICD-11 code | $0.001 | 86400s |
| `icd11.autocomplete` | `icd11.disease.autocomplete` | Quick autocomplete suggestions | $0.001 | 3600s |
| `icd11.primary_search` | `icd11.disease.primary_search` | Search only stem (primary) diagnosis codes | $0.001 | 86400s |

## Input Schemas

### icd11.search
- `terms` (string, required) — Clinical term (e.g. "diabetes mellitus", "pneumonia", "fracture")
- `max_results` (integer, optional, 1-25, default 10) — Maximum results to return

### icd11.lookup
- `code` (string, required) — ICD-11 code (e.g. "BA00", "5A10", "CA40")

### icd11.autocomplete
- `terms` (string, required) — Partial term for autocomplete (e.g. "dia", "hyp", "pneu")
- `max_results` (integer, optional, 1-10, default 5) — Maximum suggestions

### icd11.primary_search
- `terms` (string, required) — Clinical term to search (returns stems only)
- `max_results` (integer, optional, 1-25, default 10) — Maximum primary codes to return

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/nlm-icd11/types.ts` | Icd11ApiResponse array type + Icd11Result interface |
| `src/adapters/nlm-icd11/index.ts` | Main adapter — buildRequest/parseResponse for 4 tools |
| `src/schemas/nlm-icd11.schema.ts` | Zod validation schemas with .describe() on all fields |
| `src/adapters/registry.ts` | `case 'icd11': case 'nlm-icd11':` entry |
| `src/schemas/index.ts` | `...nlmIcd11Schemas` spread |
| `src/mcp/tool-definitions.ts` | 4 tool definitions (toolId, mcpName, title, description, category, annotations) |
| `config/tool_provider_config.yaml` | Tool config (price_usd $0.001, cache_ttl 86400/3600) |
| `src/config/provider-limits.json` | Dashboard: unlimited, NLM health endpoint |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| `icd11.search` | $0 | $0.001 | ~100% |
| `icd11.lookup` | $0 | $0.001 | ~100% |
| `icd11.autocomplete` | $0 | $0.001 | ~100% |
| `icd11.primary_search` | $0 | $0.001 | ~100% |

Pricing rationale: $0.001/call is the standard micro-tier floor for free/open APIs with no upstream cost. The ICD-11 classification is an indispensable reference for healthcare AI agents handling clinical documentation, EHR coding, disease research, and public health reporting. Cache TTL of 86400s (24h) for search/lookup (ICD-11 codes rarely change) and 3600s for autocomplete.

## Notes

- NLM Clinical Tables API also provides ICD-10-CM, ICD-10-PCS, SNOMED CT, and LOINC — future expansion opportunity
- `primary_search` fetches 50 results internally and filters to stems, returning up to `max_results` stems
- Registry aliases: `case 'icd11':` (tool prefix) + `case 'nlm-icd11':` (provider name)
