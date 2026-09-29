# UC-797 — NOAA Fisheries Stats (noaa-fisheries-stats)

## Meta

| Field | Value |
|-------|-------|
| ID | UC-797 |
| Provider | NOAA Fisheries — Fisheries One Stop Shop (FOSS) ODS REST API (apps-st.fisheries.noaa.gov/ods/foss) |
| Category | world (marine/fisheries data; no dedicated category exists) |
| Date | 2026-09-29 |
| Status | LIVE (local build/deploy only — not yet pushed to production or Smithery) |
| Tools | 3 |
| Auth | None (public US Government data) |
| License | US Government work, public domain; NOAA Fisheries data-use attribution requested |

## Overview

The candidate URL (fisheries.noaa.gov/data-tools) is a landing page, not an API. The real machine
interface is FOSS, an Oracle REST Data Services instance exposing NOAA Fisheries tables with a
JSON `q` filter (`$like`, `$between`, `$gte`, ...), `limit`/`offset` paging and `hasMore`. Three
tables are wrapped: `landings` (US commercial pounds/dollars and recreational fish counts by
species, state, region, year — 1950s onward), `afsc_groundfish_survey_species` and
`afsc_groundfish_survey_catch` (AFSC bottom-trawl survey catch/CPUE per haul). No key, no
documented rate limit.

Notes: `landings.ts_afs_name` is upper-case ("SALMON, CHUM") and `state_name` upper-case, so the adapter
upper-cases those filters; survey `common_name` is lowercase, so it lower-cases. Free text is
whitelisted (letters/digits/space/`,.'-`) before entering `$like`. Alaska commercial rows come from
source AKFIN; the `source` field is returned as-is. The other FOSS tables (haul, cruise, trade) are
not wrapped. UC number = highest existing UC file + 1 (resort registry file absent in this worktree).

## API Endpoints Verified

| Endpoint | Description |
|----------|-------------|
| `/ods/foss/landings/?q={json}&limit=&offset=` | Landings by species/state/region/collection/year |
| `/ods/foss/afsc_groundfish_survey_species/?q={json}` | Survey species lookup (code, names, WoRMS, ITIS) |
| `/ods/foss/afsc_groundfish_survey_catch/?q={json}` | Catch per haul for a species code |

## Tool Mapping

| Tool ID | MCP Name | Price | TTL | Description |
|---------|----------|-------|-----|-------------|
| `noaa-fisheries-stats.landings` | `noaa-fisheries-stats.landings.search` | $0.002 | 86400s | Commercial/recreational landings |
| `noaa-fisheries-stats.survey_species` | `noaa-fisheries-stats.survey.search_species` | $0.001 | 86400s | Survey species lookup |
| `noaa-fisheries-stats.survey_catch` | `noaa-fisheries-stats.survey.get_catch` | $0.002 | 86400s | Survey catch/CPUE per haul |

All tools: category `world`, annotations `READ_ONLY`.

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin | Cache TTL |
|------|--------------|-----------|--------|-----------|
| noaa-fisheries-stats.landings | $0 (open API) | $0.002 | ~100% | 86400s — annual data |
| noaa-fisheries-stats.survey_species | $0 (open API) | $0.001 | ~100% | 86400s — static reference |
| noaa-fisheries-stats.survey_catch | $0 (open API) | $0.002 | ~100% | 86400s — annual survey |

## Input Schemas

- `landings`: `species`, `state`, `region`, `collection` (Commercial|Recreational), `year_from`, `year_to`, `limit` (1-100), `offset` — all optional.
- `survey_species`: `common_name`, `scientific_name`, `limit`, `offset` — all optional.
- `survey_catch`: `species_code` (required int), `hauljoin`, `limit`, `offset`.

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/noaa-fisheries-stats/index.ts` | `NoaaFisheriesStatsAdapter` — builds ODS `q` filter, flattens rows to snake_case output with `count`/`has_more`/`offset` |
| `src/adapters/noaa-fisheries-stats/types.ts` | ODS response row types |
| `src/schemas/noaa-fisheries-stats.schema.ts` | Zod schemas |
| `scripts/test-noaa-fisheries-stats.sh` | Smoke test |
