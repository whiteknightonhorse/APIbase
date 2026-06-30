# UC-553 — UniProt Protein Database

## Meta

| Field | Value |
|-------|-------|
| ID | UC-553 |
| Provider | UniProt (UniProt Consortium — EBI, SIB, PIR) |
| Category | Science / Health / Bioinformatics |
| Date | 2026-06-30 |
| Status | LIVE |
| UC File | UC-553-uniprot.md |

## Provider Overview

UniProt is the world's leading repository for protein sequences and functional annotations. It consists of:
- **Swiss-Prot**: ~570K manually reviewed, high-quality entries
- **TrEMBL**: ~250M computationally analyzed entries

Free and open under CC BY 4.0. No auth, no registration required.

## API

- Base URL: `https://rest.uniprot.org`
- Auth: None
- Rate limits: Not documented (fair-use policy)
- License: CC BY 4.0

## Tools

| tool_id | mcpName | Description | Price | Cache TTL |
|---------|---------|-------------|-------|-----------|
| `uniprot.protein_search` | `science.uniprot.search` | Search proteins by name/gene/organism | $0.001 | 3600s |
| `uniprot.protein_entry` | `science.uniprot.entry` | Get full entry by accession | $0.002 | 86400s |
| `uniprot.protein_features` | `science.uniprot.features` | Sequence features/annotations | $0.002 | 86400s |
| `uniprot.taxonomy` | `science.uniprot.taxonomy` | Search organisms by name | $0.001 | 86400s |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| protein_search | $0 (unlimited free) | $0.001 | ~100% |
| protein_entry | $0 (unlimited free) | $0.002 | ~100% |
| protein_features | $0 (unlimited free) | $0.002 | ~100% |
| taxonomy | $0 (unlimited free) | $0.001 | ~100% |

Free upstream → minimum viable price ($0.001–0.002). Higher price for entry/features due to richer data.

## Implementation Files

- `src/adapters/uniprot/types.ts`
- `src/adapters/uniprot/index.ts`
- `src/schemas/uniprot.schema.ts`
- `src/adapters/registry.ts` (case 'uniprot')
- `src/schemas/index.ts` (uniprotSchemas)
- `src/mcp/tool-definitions.ts` (4 tool entries)
- `config/tool_provider_config.yaml` (4 entries)
- `src/config/provider-limits.json` (uniprot entry)
- `scripts/test-uniprot.sh`

## Key Notes

- `protein_entry` and `protein_features` use the same endpoint but different `fields` param to minimize response size
- Sequence value truncated to 200 characters in entry response (full sequence in features)
- Taxonomy endpoint returns lineage array and protein counts per organism
- `reviewed:true` filter in search restricts to Swiss-Prot (manually curated, higher quality)
