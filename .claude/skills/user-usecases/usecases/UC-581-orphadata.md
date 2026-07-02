# UC-581: Orphadata — Orphanet Rare Disease Knowledge Base

## Meta

| Field | Value |
|-------|-------|
| UC ID | UC-581 |
| Provider | Orphadata (Orphanet) |
| Category | health / Clinical Research |
| Date | 2026-07-02 |
| Status | LIVE |
| Tools | 4 |
| Auth | None (no credentials required) |
| License | CC BY 4.0 (commercial use allowed with attribution) |
| Upstream Cost | $0 |
| Our Price | $0.001/call |
| Margin | ~100% |

## Provider Overview

**Orphadata** is the scientific data service of **Orphanet** — the European reference portal for rare diseases and orphan drugs. The API provides structured access to:

- 4,245+ rare diseases classified in the Orphanet database
- Clinical phenotypes in HPO (Human Phenotype Ontology) format
- Epidemiological prevalence/incidence data
- Genetic inheritance modes and age-of-onset data
- Cross-references to ICD-10, ICD-11, OMIM, MONDO, MeSH, MedDRA, UMLS

Data is updated biannually (January and July). API is fully open, no authentication required.

**Base URL:** `https://api.orphadata.com`

## Tool Mapping

| Tool ID | MCP Name | Endpoint | Price |
|---------|----------|----------|-------|
| `orphadata.disease_lookup` | `orphadata.raredisease.disease_lookup` | `GET /rd-cross-referencing/orphacodes/names/{name}` | $0.001 |
| `orphadata.disease_epidemiology` | `orphadata.raredisease.disease_epidemiology` | `GET /rd-epidemiology/orphacodes/{orphacode}` | $0.001 |
| `orphadata.disease_phenotypes` | `orphadata.raredisease.disease_phenotypes` | `GET /rd-phenotypes/orphacodes/{orphacode}` | $0.001 |
| `orphadata.disease_natural_history` | `orphadata.raredisease.disease_natural_history` | `GET /rd-natural_history/orphacodes/{orphacode}` | $0.001 |

## Input Schemas

### orphadata.disease_lookup
```json
{
  "name": "string (required) — disease name or part of name e.g. 'Marfan syndrome'",
  "lang": "enum optional — en|fr|de|es|it|pt|nl|pl|cs|tr|uk|zh (default: en)"
}
```

### orphadata.disease_epidemiology / orphadata.disease_phenotypes / orphadata.disease_natural_history
```json
{
  "orphacode": "integer (required) — Orphanet ORPHAcode e.g. 558",
  "lang": "enum optional — en|fr|de|es|it|pt|nl|pl|cs|tr|uk|zh (default: en)"
}
```

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/orphadata/index.ts` | Main adapter |
| `src/adapters/orphadata/types.ts` | Raw and normalized types |
| `src/schemas/orphadata.schema.ts` | Zod validation schemas |
| `src/adapters/registry.ts` | Registry case `'orphadata'` |
| `src/schemas/index.ts` | Schema spread |
| `src/mcp/tool-definitions.ts` | 4 tool definitions |
| `config/tool_provider_config.yaml` | 4 tool entries |
| `src/config/provider-limits.json` | Dashboard entry |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| `orphadata.disease_lookup` | $0 (CC BY 4.0 free) | $0.001 | ~100% |
| `orphadata.disease_epidemiology` | $0 (CC BY 4.0 free) | $0.001 | ~100% |
| `orphadata.disease_phenotypes` | $0 (CC BY 4.0 free) | $0.001 | ~100% |
| `orphadata.disease_natural_history` | $0 (CC BY 4.0 free) | $0.001 | ~100% |

Minimum $0.001 price used for free upstream APIs — consistent with GBIF, Open Library, USGS, and other no-cost providers.

## Key Notes

- The `results` field in the API response is a single object (not array) when `__count = 1`
- The `lang` parameter is a query parameter (lowercase: `en`, `fr`, etc.) — NOT a path parameter
- Errors come in `{"error": {"code": 404, "message": "...", "type": "..."}}` format
- `disease_lookup` searches by preferred name substring; returns the first/exact match
- `disease_phenotypes` nests disease info under `results.Disorder.HPODisorderAssociation`
- Response caches 24h (cache_ttl: 86400) — data only changes biannually
- Attribution required per CC BY 4.0: "Source: Orphanet / Orphadata"
