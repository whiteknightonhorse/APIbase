# UC-583 — ADB Key Indicators Database (KIDB)

## Meta

| Field | Value |
|-------|-------|
| UC ID | UC-583 |
| Provider | Asian Development Bank — Key Indicators Database |
| Category | finance |
| Date Added | 2026-07-02 |
| Status | LIVE |
| Tools | 4 |

## Overview

ADB KIDB is the Asian Development Bank's macroeconomic statistics database covering
50 Asia-Pacific member economies. Provides 700+ economic indicators across 62 dataflows
(population, economic output, monetary policy, fiscal policy, environment, SDGs, trade,
labor, education, and more) via SDMX v3.0 REST protocol.

No API key required. Open public access. Rate limit: 20 requests per minute.

## API Details

| Property | Value |
|----------|-------|
| Base URL | https://kidb.adb.org |
| Auth | None |
| Indicators Endpoint | `/api/dataflow/indicators/{dataflow}` (JSON) |
| Data Endpoint | `/api/v4/sdmx/data/ADB,{dataflow}/A.{indicators}.{economies}` (SDMX XML) |
| Protocol | SDMX v3.0 REST (XML only) |
| License | Open public access |
| Rate Limits | 20 req/min (x-ratelimit-limit header) |

## Tool Mapping

| Tool ID | MCP Name | Description | Price | Cache TTL |
|---------|----------|-------------|-------|-----------|
| adbkidb.dataflows_list | adbkidb.explore.dataflows | List 62 KIDB statistical dataflows | $0.001 | 86400s |
| adbkidb.indicators | adbkidb.explore.indicators | List indicators for a KIDB dataflow | $0.001 | 86400s |
| adbkidb.data | adbkidb.data.query | Query macroeconomic data (SDMX) | $0.002 | 3600s |
| adbkidb.economies | adbkidb.explore.economies | List 50 ADB member economies | $0.001 | 86400s |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| adbkidb.dataflows_list | $0.00 | $0.001 | ~100% |
| adbkidb.indicators | $0.00 | $0.001 | ~100% |
| adbkidb.data | $0.00 | $0.002 | ~100% |
| adbkidb.economies | $0.00 | $0.001 | ~100% |

Data queries priced at $0.002 due to SDMX XML parsing overhead and larger response sizes.
Static tools (dataflows_list, economies) serve hardcoded data without HTTP calls.

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/adbkidb/index.ts` | Main adapter with SDMX XML parser |
| `src/adapters/adbkidb/types.ts` | TypeScript interfaces |
| `src/schemas/adbkidb.schema.ts` | Zod schemas with `.describe()` |
| `src/adapters/registry.ts` | Added `case 'adbkidb':` |
| `src/schemas/index.ts` | Added adbkidbSchemas spread |
| `src/mcp/tool-definitions.ts` | Added 4 tool definitions |
| `config/tool_provider_config.yaml` | Added 4 tool entries |
| `src/config/provider-limits.json` | Added dashboard config |

## Key API Patterns

**List indicators for a dataflow:**
```
GET https://kidb.adb.org/api/dataflow/indicators/PPL
→ JSON array of {code, name, description}
```

**Query SDMX data (multiple indicators, economies, years):**
```
GET https://kidb.adb.org/api/v4/sdmx/data/ADB,PPL/A.PPL_POP+PPL_POP_F.IND+CHN?startPeriod=2015&endPeriod=2022&format=sdmx-structure-xml&version=3.0
→ SDMX Structure-Specific XML with <Series> and <Obs> elements
```

**SDMX XML structure parsed by adapter:**
```xml
<Series FREQ="A" INDICATOR="PPL_POP" ECONOMY_CODE="IND" UNIT_MULT="3" DECIMALS="0" UNIT_MEASURE="PERSON" STATUS_DESC="Normal value" SOURCE_DATASET="ADB_POPULATION_DATA_AND_PROJECTIONS">
  <Obs TIME_PERIOD="2020" OBS_VALUE="1380004385"/>
  <Obs TIME_PERIOD="2021" OBS_VALUE="1393409038"/>
</Series>
```

## Economy Codes (50 ADB Members)

AFG, ARM, AUS, AZE, BAN, BHU, BRU, CAM, PRC, COO, FIJ, GEO, HKG, IND, INO, JPN,
KAZ, KIR, KOR, KGZ, LAO, MAL, MLD, RMI, FSM, MON, MYA, NAU, NEP, NZL, NIU, PAK,
PLW, PNG, PHI, SAM, SIN, SOL, SRI, TAP, TAJ, THA, TIM, TON, TUR, TKM, TUV, UZB,
VAN, VIE

Note: ADB uses non-ISO codes. PRC = China, INO = Indonesia, BAN = Bangladesh, TAP = Chinese Taipei.

## Dataflow Codes (62 Dataflows)

PPL (Population), EO (Economic Outlook), EO_NA (Economic Outlook - National Accounts),
MFP (Multifactor Productivity), GG (Government Finance), GLB (Global Trade),
EGELC (Energy, Environment), TC (Trade and Commerce), ENV (Environment),
SDG_01 through SDG_17 (Sustainable Development Goals by target)
