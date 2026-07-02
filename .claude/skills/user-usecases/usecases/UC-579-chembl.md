# UC-579 — ChEMBL (Drug Discovery Database)

## Meta

| Field | Value |
|-------|-------|
| ID | UC-579 |
| Provider | ChEMBL (EMBL-EBI) |
| Category | Health / Drug Discovery |
| Date | 2026-07-02 |
| Status | LIVE |
| Tools | 4 |
| Auth | None (CC BY-SA 3.0) |
| Upstream Cost | $0 |

## Provider Overview

ChEMBL is a manually curated bioactivity database maintained by EMBL-EBI (European Molecular Biology
Laboratory — European Bioinformatics Institute). It contains drug-like bioactive molecules, their
biological targets, and quantitative potency measurements sourced from 88,000+ peer-reviewed papers.

ChEMBL is the world's largest open-access drug discovery database:
- **2.9M+ molecule records** including approved drugs, clinical candidates, and research compounds
- **18,500+ biological targets** (proteins, enzymes, receptors, ion channels) across 650+ organisms
- **20M+ bioactivity measurements** (IC50, Ki, EC50, Kd, MIC values) from assay publications
- **Phase 4 approved drugs** with ATC codes, first approval year, and clinical annotation
- **Lipinski properties** (ALogP, MW, HBD, HBA, PSA, Ro5 violations) for drug-likeness assessment

- **API Base URL:** https://www.ebi.ac.uk/chembl/api/data/
- **Documentation:** https://www.ebi.ac.uk/chembl/api/data/
- **Auth:** None required
- **Rate Limits:** No documented rate limits
- **License:** CC BY-SA 3.0 (freely redistributable with attribution)

## Tool Mapping

| Tool ID | MCP Name | Description | Price | Cache TTL |
|---------|----------|-------------|-------|-----------|
| `chembl.molecule_search` | `chembl.molecules.search` | Search drug molecules by name, phase, type | $0.001 | 3600s |
| `chembl.molecule_detail` | `chembl.molecules.detail` | Full structural data for a molecule by ChEMBL ID | $0.001 | 86400s |
| `chembl.target_search` | `chembl.targets.search` | Search biological targets by name, type, organism | $0.001 | 3600s |
| `chembl.bioactivity` | `chembl.activity.bioactivity` | Bioactivity measurements for molecule or target | $0.002 | 3600s |

## API Endpoints Used

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/molecule?format=json&pref_name__icontains={query}` | GET | Search molecules by name substring |
| `/molecule/{CHEMBL_ID}?format=json` | GET | Retrieve single molecule by ChEMBL ID |
| `/target?format=json&pref_name__icontains={query}` | GET | Search targets by name substring |
| `/activity?format=json&molecule_chembl_id={id}` | GET | Bioactivity records for a molecule |
| `/activity?format=json&target_chembl_id={id}` | GET | Bioactivity records for a target |

## Input Schemas

### chembl.molecule_search
- `query` (string, optional) — Molecule name substring (e.g. "aspirin", "paclitaxel")
- `max_phase` (integer 0–4, optional) — Exact clinical phase filter
- `max_phase_gte` (integer 0–4, optional) — Minimum clinical phase
- `molecule_type` (enum, optional) — "Small molecule", "Protein", "Antibody", etc.
- `limit` (integer 1–25, optional, default 10)

### chembl.molecule_detail
- `chembl_id` (string, required) — ChEMBL ID (e.g. "CHEMBL25" for aspirin)

### chembl.target_search
- `query` (string, optional) — Target name substring (e.g. "Acetylcholinesterase", "EGFR")
- `target_type` (enum, optional) — "SINGLE PROTEIN", "PROTEIN COMPLEX", "PROTEIN FAMILY", etc.
- `organism` (string, optional) — Source organism (e.g. "Homo sapiens")
- `limit` (integer 1–25, optional, default 10)

### chembl.bioactivity
- `molecule_chembl_id` (string, optional) — ChEMBL molecule ID
- `target_chembl_id` (string, optional) — ChEMBL target ID
- `activity_type` (string, optional) — Measurement type: IC50, Ki, EC50, Kd, MIC, GI50
- `limit` (integer 1–25, optional, default 10)
- *At least one of molecule_chembl_id or target_chembl_id is required*

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/chembl/types.ts` | Raw API response types + normalized output shapes |
| `src/adapters/chembl/index.ts` | ChemblAdapter — buildRequest + parseResponse |
| `src/schemas/chembl.schema.ts` | Zod schemas with .describe() on every field |
| `src/schemas/index.ts` | Added chemblSchemas spread |
| `src/adapters/registry.ts` | Added `case 'chembl':` |
| `src/mcp/tool-definitions.ts` | Added 4 tool definitions (toolId, mcpName, title, description, category, annotations) |
| `config/tool_provider_config.yaml` | Added 4 tool entries with pricing |
| `src/config/provider-limits.json` | Added chembl dashboard entry |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|---------------|-----------|--------|
| `chembl.molecule_search` | $0 (no auth, unlimited) | $0.001 | 100% |
| `chembl.molecule_detail` | $0 (no auth, unlimited) | $0.001 | 100% |
| `chembl.target_search` | $0 (no auth, unlimited) | $0.001 | 100% |
| `chembl.bioactivity` | $0 (no auth, unlimited) | $0.002 | 100% |

Bioactivity is priced higher ($0.002) because it returns dense scientific data (20M+ records queryable)
and has higher processing overhead due to large result normalization.

## Notes

- ChEMBL follows Django REST Framework conventions: `pref_name__icontains` for case-insensitive search
- The `/molecule/{id}` endpoint returns a single object (not wrapped in a list)
- `max_phase=4` = approved drug; `max_phase=null` or `-1` = preclinical
- `pchembl_value` in bioactivity is -log10(molar concentration) — higher = more potent
- ATC codes follow WHO Anatomical Therapeutic Chemical classification
- All ChEMBL IDs start with "CHEMBL" followed by an integer (e.g. CHEMBL25 = aspirin)
