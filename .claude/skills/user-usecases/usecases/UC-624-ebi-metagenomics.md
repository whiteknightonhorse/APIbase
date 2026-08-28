# UC-624 — EBI Metagenomics / MGnify API

## Meta

| Field | Value |
|-------|-------|
| ID | UC-624 |
| Provider | EBI Metagenomics / MGnify (www.ebi.ac.uk/metagenomics) |
| Category | health |
| Date | 2026-08-28 |
| Status | LIVE (local build/seed/deploy only — not yet pushed to production or Smithery) |
| Tools | 4 |
| Auth | None (public REST API) |
| License | Public EMBL-EBI research infrastructure, no auth required |

## Overview

The EBI Metagenomics API (MGnify, `www.ebi.ac.uk/metagenomics/api/v1`) is a public, no-auth
JSON:API service over EMBL-EBI's metagenomics analysis archive — 5,000+ studies and their
biological samples, classified by an environmental biome taxonomy (e.g.
`root:Host-associated:Human:Digestive system:Large intestine`,
`root:Environmental:Aquatic:Marine`). It covers study search (free-text + biome filter), full
study detail, per-study sample listing (with geo-coordinates, collection date, and environment
metadata), and browsing the biome classification tree.

No documented rate limit was found in the public API docs (`www.ebi.ac.uk/metagenomics/api/v1/docs/`);
no `X-RateLimit-*` headers were observed on live responses during onboarding.

## API Endpoints Verified

| Endpoint | Method | Description |
|----------|--------|-------------|
| `https://www.ebi.ac.uk/metagenomics/api/v1/studies` | GET | Search studies by `search` (free text), `lineage` (biome filter), `page`, `page_size` |
| `https://www.ebi.ac.uk/metagenomics/api/v1/studies/{accession}` | GET | Full study detail — name, abstract, bioproject, centre, sample count, release status, biomes |
| `https://www.ebi.ac.uk/metagenomics/api/v1/studies/{accession}/samples` | GET | Samples belonging to a study — geo-coords, collection date, environment biome/feature/material, host taxon |
| `https://www.ebi.ac.uk/metagenomics/api/v1/biomes/{lineage}/children` | GET | Descendant biomes under a lineage, with sample counts |

Confirmed live via direct `curl` testing during onboarding: study search for `search=soil` returned
675 pages of results (vs 5,203 unfiltered — proving the filter is real, not ignored); study detail
for `MGYS00006862` returned full metadata plus its biome lineage; sample listing for the same study
returned 84 samples with host/geo metadata; biome browse under `root:Host-associated` returned its
full subtree. A bad study accession (`MGYS99999999`) and a bad biome lineage (`root:Nonsense`) both
correctly returned HTTP 404, which the shared `BaseAdapter` maps to a 422 `INPUT_REJECTED` client
error rather than a 502 gateway error.

## Scope Reduction (tools NOT built)

Analysis-level taxonomic/functional annotation endpoints (`/analyses/{id}/taxonomy`,
`/analyses/{id}/kegg-modules`, etc.) were tested live against a representative completed analysis
(`MGYA00795177`) and returned an **empty result set** (`"data": []`) despite the analysis itself
reporting hundreds of thousands of InterProScan matches in its summary — the detailed
taxonomy/functional breakdown is not reliably populated for arbitrary analyses. This is the same
"unreliable enough to drop" class as UC-440 Ensembl's dropped `variant_consequence`/`ortholog_search`
tools and UC-607 USGS-MRDS's dropped text-search tool. Scope was kept to the study/sample/biome
endpoints that consistently returned real, non-empty data across every test.

## Tool Mapping

| Tool ID | MCP Name | Endpoint | Price | TTL | Description |
|---------|----------|----------|-------|-----|--------------|
| `ebi-metagenomics.study_search` | `ebi-metagenomics.studies.search` | `/studies` | $0.001 | 900s | Search studies by free-text query and/or biome lineage |
| `ebi-metagenomics.study_detail` | `ebi-metagenomics.studies.detail` | `/studies/{accession}` | $0.001 | 86400s | Full detail for one study by accession |
| `ebi-metagenomics.sample_list` | `ebi-metagenomics.samples.list` | `/studies/{accession}/samples` | $0.001 | 86400s | Samples belonging to a study |
| `ebi-metagenomics.biome_browse` | `ebi-metagenomics.biomes.browse` | `/biomes/{lineage}/children` | $0.001 | 604800s | Browse the biome classification subtree under a lineage |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| ebi-metagenomics.study_search | $0 (open API) | $0.001 | ~100% |
| ebi-metagenomics.study_detail | $0 (open API) | $0.001 | ~100% |
| ebi-metagenomics.sample_list | $0 (open API) | $0.001 | ~100% |
| ebi-metagenomics.biome_browse | $0 (open API) | $0.001 | ~100% |

No-auth public research API — pricing covers infrastructure and pipeline cost only. `study_search`
uses a short 900s TTL since new studies are deposited continuously; `study_detail`/`sample_list` use
a 86400s TTL since published study/sample metadata rarely changes; `biome_browse` uses the longest
604800s TTL since the biome taxonomy is effectively static.

## Input Schemas

### ebi-metagenomics.study_search
```json
{
  "query": "string (optional) — free-text search across study name, abstract, and bioproject, e.g. 'gut microbiome'.",
  "biome_lineage": "string (optional) — filter to studies under this biome lineage, e.g. 'root:Host-associated:Human'.",
  "page": "number (optional) — page number, 1-indexed, default 1.",
  "page_size": "number (optional) — 1-25, default 10."
}
```

### ebi-metagenomics.study_detail
```json
{
  "accession": "string (required) — MGnify study accession, e.g. 'MGYS00006862', from ebi-metagenomics.study_search."
}
```

### ebi-metagenomics.sample_list
```json
{
  "study_accession": "string (required) — MGnify study accession, e.g. 'MGYS00006862', from ebi-metagenomics.study_search.",
  "page": "number (optional) — page number, 1-indexed, default 1.",
  "page_size": "number (optional) — 1-50, default 10."
}
```

### ebi-metagenomics.biome_browse
```json
{
  "lineage": "string (optional) — biome lineage to browse the descendant subtree of, e.g. 'root' or 'root:Host-associated'. Defaults to 'root'.",
  "page": "number (optional) — page number, 1-indexed, default 1.",
  "page_size": "number (optional) — 1-50, default 20."
}
```

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/ebi-metagenomics/index.ts` | Main adapter class (`EbiMetagenomicsAdapter`) — builds requests for study search/detail, sample list, biome browse; trims JSON:API `attributes`/`relationships` shapes down to flat response objects in `parseResponse()` |
| `src/adapters/ebi-metagenomics/types.ts` | JSON:API raw response interfaces (`MgnifyStudyAttributes`, `MgnifySampleAttributes`, `MgnifyBiomeAttributes`, etc.) |
| `src/schemas/ebi-metagenomics.schema.ts` | Zod input schemas (`ebiMetagenomicsSchemas`) |
| `src/adapters/registry.ts` | Case `'ebi-metagenomics'` → `EbiMetagenomicsAdapter` |
| `src/schemas/index.ts` | Schema registry import (`ebiMetagenomicsSchemas`) |
| `src/mcp/tool-definitions.ts` | 4 tool definitions (EBI Metagenomics block, category `health`) |
| `config/tool_provider_config.yaml` | Price and TTL per tool (after the `gebco` block) |
| `src/config/provider-limits.json` | Dashboard entry (`ebi-metagenomics`) |
| `static/dashboard.html` | `PROVIDER_CATEGORIES['EBI Metagenomics'] = 'Science'` |
| `scripts/test-ebi-metagenomics.sh` | Smoke test — catalog, schema/description, dashboard, OpenAPI, upstream reachability + value sanity |

## Notes

- Upstream responses use the JSON:API format (`{data: {type, id, attributes, relationships}}`);
  `parseResponse()` flattens `attributes` (which use kebab-case keys like `study-name`,
  `samples-count`) into snake_case fields and pulls related biome lineages out of
  `relationships.biomes.data[].id`.
- **QUIRK:** `/biomes/{lineage}/children` does NOT return only immediate children — it returns the
  queried biome plus its entire descendant subtree (e.g. `root` returns all 492 biomes in the whole
  taxonomy, ordered depth-first). The tool description and schema `.describe()` text call this out
  explicitly so agents don't assume a shallow one-level listing.
- Study/sample/biome accession and lineage values are path segments and are `encodeURIComponent()`-
  encoded per the 2026-03-30 CLAUDE.md flywheel rule (lineage values contain `:` and spaces, e.g.
  `root:Host-associated:Human:Digestive system:Large intestine`).
- No separate `auth.ts` file — no-auth public API, same lightweight pattern as `inaturalist`/`figshare`.
- This onboarding ran in **batch mode** under the sandboxed night-orchestra role: adapter, schema,
  registry wiring, TS/lint, DB seed, local docker build and deploy, local verification (health,
  catalog, schema, dashboard, OpenAPI, 7/7 provider-specific smoke checks, 8/8 general smoke test),
  UC file + index, OpenAPI + server-card.json regeneration, and local git commit were completed. Per
  batch-mode instructions, publishing to the remote origin, Smithery, and Glama was intentionally
  skipped — the hourly batch-pusher role handles that.
