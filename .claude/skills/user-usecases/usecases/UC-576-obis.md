# UC-576 — OBIS (Ocean Biodiversity Information System)

## Meta

| Field | Value |
|-------|-------|
| ID | UC-576 |
| Provider | OBIS — Ocean Biodiversity Information System |
| Website | https://obis.org |
| API Docs | https://api.obis.org/ |
| Category | Marine Biodiversity / Education |
| Status | LIVE |
| Date | 2026-07-02 |
| Tools | 4 |

## Provider Overview

OBIS (Ocean Biodiversity Information System) is the world's largest open-access repository of marine biodiversity data. It aggregates 100M+ occurrence records from 4,200+ datasets contributed by 900+ institutions across 100+ countries. Data covers all marine environments: pelagic, benthic, coastal, and deep-sea. Taxonomy is linked to the World Register of Marine Species (WoRMS).

**License:** CC BY 4.0 / CC0 (dataset-dependent)
**Auth:** None required — fully open API
**Rate limits:** None documented

## Client Input Data & Credentials

No credentials required. No registration needed.

| Field | Value |
|-------|-------|
| Base URL | `https://api.obis.org/v3` |
| Auth | None |
| Cost | $0 upstream |

## Provider API Analysis

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/occurrence` | GET | Search occurrence records by species, coordinates, year |
| `/taxon/{name}` | GET | Look up species taxonomy in WoRMS |
| `/checklist` | GET | Generate species checklist for area/taxon |
| `/dataset` | GET | Search datasets by species/area |

Key response fields:
- Occurrences: `scientificName`, `decimalLatitude/Longitude`, `date_year`, `aphiaID`, `datasetName`, `bathymetry`, `sst`
- Taxon: `taxonID` (AphiaID), full taxonomy (kingdom→species), `is_marine`, `vernacularNames`
- Checklist: species list with `records` count per species
- Dataset: `title`, `abstract`, `records`, `citation`, `url`

## Tool Mapping

| tool_id | mcpName | Description | Price | TTL |
|---------|---------|-------------|-------|-----|
| `obis.occurrence_search` | `obis.marine.occurrence_search` | Search 100M+ marine occurrence records | $0.001 | 3600s |
| `obis.taxon_search` | `obis.marine.taxon_search` | WoRMS taxonomy lookup for marine species | $0.001 | 86400s |
| `obis.checklist` | `obis.marine.checklist` | Species checklist by area or taxon | $0.002 | 3600s |
| `obis.dataset_search` | `obis.marine.dataset_search` | Search OBIS network datasets | $0.001 | 3600s |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| obis.occurrence_search | $0 | $0.001 | ~100% |
| obis.taxon_search | $0 | $0.001 | ~100% |
| obis.checklist | $0 | $0.002 | ~100% |
| obis.dataset_search | $0 | $0.001 | ~100% |

OBIS is fully free and open. Pricing follows the standard $0.001–$0.002 floor for high-value scientific data tools with 100% margins. Checklist is priced at $0.002 due to higher computational complexity (aggregating across millions of records).

## Implementation Files

| File | Description |
|------|-------------|
| `src/adapters/obis/index.ts` | Main adapter (occurrence_search, taxon_search, checklist, dataset_search) |
| `src/adapters/obis/types.ts` | TypeScript types for OBIS API responses |
| `src/schemas/obis.schema.ts` | Zod validation schemas with `.describe()` on every field |
| `src/adapters/registry.ts` | Added `case 'obis'` |
| `src/schemas/index.ts` | Added `obisSchemas` spread |
| `src/mcp/tool-definitions.ts` | Added 4 tool definitions |
| `config/tool_provider_config.yaml` | Added 4 tool entries |
| `src/config/provider-limits.json` | Added `obis` dashboard entry |

## Notes

- No auth required, no API key
- Uses `User-Agent: APIbase/1.0` header as good-practice identification
- Taxon endpoint path-encodes scientific name: `/taxon/{name}` 
- Occurrence `total` field reflects full DB count, not just returned results
- Dataset `abstract` and `citation` are truncated to 500/300 chars to avoid large responses
- Compatible with GBIF — OBIS uses WoRMS AphiaIDs, GBIF uses its own taxon keys
