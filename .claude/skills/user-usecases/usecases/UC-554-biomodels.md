# UC-554 — BioModels

| Field | Value |
|-------|-------|
| ID | UC-554 |
| Provider | BioModels (EMBL-EBI) |
| Category | health / science |
| Status | LIVE |
| Date | 2026-06-30 |
| Auth | None (public open data) |
| Tools | 4 |
| Upstream cost | $0 (CC0 Public Domain) |
| Price | $0.001/call (100% margin) |

## Provider Overview

BioModels is the world's primary repository for peer-reviewed mathematical models of biological and biomedical systems, maintained by the European Bioinformatics Institute (EMBL-EBI). It contains 3,200+ curated SBML models covering signaling pathways, metabolic networks, gene regulatory circuits, circadian rhythms, pharmacokinetics, and disease dynamics. The BioModels REST API is public, no auth required, no documented rate limits.

API base: `https://biomodels.org`

## Tool Mapping

| Tool ID | MCP Name | Description | Price | Cache TTL |
|---------|----------|-------------|-------|-----------|
| `biomodels.model.search` | `biomodels.model.search` | Search models by keyword/curation | $0.001 | 3600s |
| `biomodels.model.detail` | `biomodels.model.detail` | Full metadata by accession ID | $0.001 | 86400s |
| `biomodels.model.files` | `biomodels.model.files` | List downloadable files (SBML, MATLAB, BioPAX) | $0.001 | 86400s |
| `biomodels.model.latest` | `biomodels.model.latest` | Latest curated models (sorted by date) | $0.001 | 1800s |

## Key Endpoints

- `GET https://biomodels.org/search?query=...&numResults=N&format=json` — full-text search
- `GET https://biomodels.org/{modelId}?format=json` — model metadata
- `GET https://biomodels.org/{modelId}?format=json` — also returns files list (same endpoint)

## Pricing Rationale

| Item | Value |
|------|-------|
| Upstream cost | $0 (CC0 public domain, EMBL-EBI public API) |
| Our price | $0.001/call |
| Margin | ~100% |
| Rationale | Minimum price tier; covers gateway, caching, pipeline, ledger overhead |

## Implementation Files

- `src/adapters/biomodels/types.ts` — raw + normalized output types
- `src/adapters/biomodels/index.ts` — BioModelsAdapter class
- `src/schemas/biomodels.schema.ts` — Zod schemas
- `src/adapters/registry.ts` — `case 'biomodels':`
- `src/schemas/index.ts` — `...biomodelsSchemas`
- `src/mcp/tool-definitions.ts` — 4 tool definitions
- `config/tool_provider_config.yaml` — pricing + TTL config
- `src/config/provider-limits.json` — dashboard entry

## Notes

- API redirects from `www.ebi.ac.uk/biomodels` to `biomodels.org` — adapter uses `biomodels.org` directly
- HTML description in model detail is stripped via shared `stripHtml()` utility
- Curated models: accession prefix `BIOMD` (manually validated, linked to publication)
- Submitted models: accession prefix `MODEL` (author-contributed, variable quality)
- The `files` tool reuses the same detail endpoint and returns file list with direct download URLs
