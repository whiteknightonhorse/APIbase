# UC-559 — CMU Delphi Epidata

## Meta

| Field | Value |
|-------|-------|
| UC ID | UC-559 |
| Provider | CMU Delphi Epidata |
| Category | Health / Epidemiological Surveillance |
| Date | 2026-06-30 |
| Status | LIVE |
| Auth | No auth (open access) |
| Upstream cost | $0 |
| License | Academic open access; data sourced from CDC (public domain), HHS (public domain) |
| Docs | https://cmu-delphi.github.io/delphi-epidata/api/README.html |

## Provider Description

CMU Delphi Epidata is a real-time epidemiological surveillance API maintained by the Delphi Research Group at Carnegie Mellon University. It provides unified access to multiple disease surveillance datasets:

- **CDC ILINet** — Weekly influenza-like illness (ILI) surveillance from ~3,000 outpatient providers nationally
- **FluSurv-NET** — CDC hospitalization surveillance network for influenza with age/sex/race breakdown
- **COVIDcast** — Multi-source COVID-19 signal aggregation (JHU-CSSE, CDC, HHS, symptom surveys)
- **COVID Hospitalization State Timeseries** — Daily HHS Protect hospital utilization data by state

No authentication is required. The API returns `{result, message, epidata}` JSON with `result=1` for success and `result=-1` for errors or missing data.

## Credentials / Keys

None required.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/epidata/fluview/` | GET | CDC ILINet weekly flu surveillance by region |
| `/epidata/flusurv/` | GET | FluSurv-NET flu hospitalization rates |
| `/epidata/covidcast/` | GET | COVID-19 signals from multiple sources |
| `/epidata/covid_hosp_state_timeseries/` | GET | COVID hospitalization by state timeseries |

## Tool Mapping

| Tool ID | MCP Name | Description | Price | Cache TTL |
|---------|----------|-------------|-------|-----------|
| `delphi.fluview` | `delphi.flu.fluview` | CDC ILINet weekly flu surveillance | $0.001 | 3600s |
| `delphi.flusurv` | `delphi.flu.flusurv` | FluSurv-NET flu hospitalization rates | $0.001 | 3600s |
| `delphi.covidcast` | `delphi.covid.covidcast` | COVID-19 signals (JHU-CSSE, HHS, CDC) | $0.001 | 3600s |
| `delphi.covid_hosp` | `delphi.covid.hospitalization` | COVID hospitalization state timeseries | $0.001 | 3600s |

## Input Schemas

### delphi.fluview
- `regions` (string, required) — Region codes: "nat", "hhs1"-"hhs10", "cen1"-"cen9", state codes
- `epiweeks` (string, required) — Epiweek(s) in YYYYWW format; supports ranges and lists
- `issues` (string, optional) — Filter to specific release epiweek

### delphi.flusurv
- `locations` (string, required) — "network_all", "network_eip", "network_ihsp", or state name
- `epiweeks` (string, required) — Epiweek(s) in YYYYWW format

### delphi.covidcast
- `data_source` (string, required) — Source: "jhu-csse", "hhs", "fb-survey", "doctor-visits", "cdc"
- `signal` (string, required) — Signal name within source (e.g. "confirmed_cumulative_num")
- `time_values` (string, required) — Date(s) in YYYYMMDD format or range
- `geo_value` (string, required) — Geographic identifier (2-letter state, FIPS, "us")
- `geo_type` (enum, optional) — "nation", "state", "county", "msa", "hrr", "hhs" (default: "state")
- `time_type` (enum, optional) — "day" or "week" (default: "day")

### delphi.covid_hosp
- `states` (string, required) — 2-letter state abbreviations, comma-separated
- `dates` (string, required) — Date(s) in YYYYMMDD format or range

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/delphi/types.ts` | TypeScript output types |
| `src/adapters/delphi/index.ts` | Main adapter class |
| `src/schemas/delphi.schema.ts` | Zod validation schemas |
| `src/adapters/registry.ts` | case 'delphi' entry |
| `src/schemas/index.ts` | delphiSchemas spread |
| `src/mcp/tool-definitions.ts` | 4 tool definitions |
| `config/tool_provider_config.yaml` | Tool pricing/TTL config |
| `src/config/provider-limits.json` | Dashboard config |

## Pricing Rationale

| Tool | Upstream Cost | Our Price | Margin |
|------|--------------|-----------|--------|
| `delphi.fluview` | $0 | $0.001 | ~100% |
| `delphi.flusurv` | $0 | $0.001 | ~100% |
| `delphi.covidcast` | $0 | $0.001 | ~100% |
| `delphi.covid_hosp` | $0 | $0.001 | ~100% |

All tools are $0.001/call — free upstream academic API with unlimited access.

## Notes

- The Delphi API wraps multiple CDC/HHS datasets in a unified JSON envelope
- `result=-1` with message "no results" is treated as INPUT_REJECTED (422) so agents know to adjust their query
- Epiweek format: YYYYWW where WW is the ISO week number (Sunday start); week 1 contains January 1
- FluSurv-NET data has ~3-6 week reporting lag; ILINet has ~1-2 week lag
- COVIDcast historical data from JHU-CSSE ends 2023-03-10 (JHU shut down their tracker)
- COVID hospitalization data available from 2020-07-15 onward (HHS Protect launch date)
