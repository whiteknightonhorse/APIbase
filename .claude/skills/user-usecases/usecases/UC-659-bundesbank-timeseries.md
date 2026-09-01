# UC-659: Deutsche Bundesbank SDMX public REST API (bundesbank-timeseries)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-659 |
| **Provider** | Deutsche Bundesbank (German central bank) — api.statistiken.bundesbank.de |
| **Domain** | api.statistiken.bundesbank.de |
| **Category** | economic-indicators (dashboard/tool-definitions: `finance` — closest existing category, consistent with oecd-data/ilostat/istat/bank-of-england) |
| **Theme** | Single-agency SDMX 2.1 REST API: dataflow catalog -> dimension/codelist structure -> observation data, same shape as OECD SDMX (UC-629), ILOSTAT (UC-651), ISTAT (UC-656) — but metadata is XML-only |
| **Date** | 2026-09-01 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE (local) |
| **Region** | Germany |
| **Pricing Model** | free upstream (no auth) |
| **Monetization Pattern** | P3: Public/Community Open Data Wrapper |

---

## Provider Summary

The Bundesbank publishes ~94 economic time-series dataflows — exchange rates, interest rates,
money supply, prices, balance of payments — as a public, no-auth SDMX 2.1 REST API under a
single fixed agency (`BBK`). Structurally the same 3-tool shape as the OECD/ILOSTAT/ISTAT SDMX
adapters, but with one key difference found live (not documented anywhere obvious): the
`/rest/metadata/*` endpoints serve XML ONLY.

| Aspect | Details |
|--------|---------|
| **Free Tier** | Fully open, no signup, no API key |
| **Paid Tier** | N/A — no paid tier exists |
| **Auth Model** | None |
| **License** | Public statistical data (German federal institution) |
| **Quota** | No documented rate limit found; no rate-limit response headers observed |
| **Global Availability** | Reachable from this host, standard HTTPS |
| **Status** | Production |

---

## API Overview

Candidate URL `https://api.statistiken.bundesbank.de/rest` is the live SDMX 2.1 REST root. The
API's own OpenAPI spec (`/v3/api-docs`) was fetched and read directly to determine the real path
shapes and supported media types — the naive `BBK01`-prefixed flow/key convention from the
Bundesbank's older (retired) SDMX interface does NOT apply to this API (agency is `BBK`, not
`BBK01`; e.g. flowRef `BBEX3` not `BBK01.SU0202`).

| # | Endpoint | Method | Description |
|---|----------|--------|--------------|
| 1 | `/rest/metadata/dataflow/BBK` | GET | List all 94 dataflows (XML only) |
| 2 | `/rest/metadata/dataflow/BBK/{id}` | GET | Single dataflow -> linked DataStructure Ref id (XML only) |
| 3 | `/rest/metadata/datastructure/BBK/{dsd_id}?references=all` | GET | Dimensions + codelists (XML only) |
| 4 | `/rest/data/{flowRef}/{key}?detail=DATA_ONLY&...` | GET | Observation values (JSON supported) |

Verified live before implementation:
```
curl ".../rest/metadata/dataflow/BBK" -H "Accept: application/xml" -> 200, 94 dataflows
curl ".../rest/metadata/dataflow/BBK" -H "Accept: application/vnd.sdmx.structure+json;version=1.0" -> 406
curl ".../rest/metadata/datastructure/BBK/BBK_ERX?references=all" -H "Accept: application/xml" -> 200, 6 dims + 10 codelists
curl ".../rest/data/BBEX3?detail=dataonly" -H "Accept: application/json" -> 200, 116MB (unscoped key = every series)
curl ".../rest/data/BBEX3/D.USD.EUR.BB.AC.000?detail=DATA_ONLY&lastNObservations=5" -H "Accept: application/json" -> 200, 1 series, real EUR/USD rates
```

### Research Quirk — metadata endpoints are XML-only, unlike every other SDMX adapter onboarded so far

`Accept: application/vnd.sdmx.structure+json;version=1.0` (the header that works for ISTAT/OECD/
ILOSTAT) returns `HTTP 406` on both `/rest/metadata/dataflow/BBK` and
`/rest/metadata/datastructure/BBK/{id}`. Confirmed by reading the API's own OpenAPI spec at
`/v3/api-docs`: the `content` map for both metadata paths lists only
`application/vnd.sdmx.structure+xml`, `application/xml`, `text/xml` — no JSON media type at all.
Only `/rest/data/{flowRef}` and `/rest/data/{flowRef}/{key}` support
`application/vnd.sdmx.data+json`/`application/json`. `call()` is overridden (same pattern as
`src/adapters/usgs-mrds/index.ts`) to hand-parse the two XML metadata responses with regex,
bypassing `BaseAdapter`'s `JSON.parse`; `bundesbank-timeseries.data` delegates to `super.call()`
since it's natively JSON.

### Research Quirk — the dataflow -> DataStructure mapping is not derivable from the dataflow_id

Verified against 3 different dataflows: `BBEX3` -> DSD `BBK_ERX`, `BBIN1` -> DSD `BBK_IRCBR`,
`BBDP1` -> DSD `BBK_DOPR`, `BBBK1` -> DSD `BBK_BSBBK1`. No shared prefix/suffix pattern exists, so
`bundesbank-timeseries.structure` must do 2 sequential upstream fetches: (1)
`/rest/metadata/dataflow/BBK/{dataflow_id}` to read the linked `<Ref ... class="DataStructure">`
id from the XML, then (2) `/rest/metadata/datastructure/BBK/{dsd_id}?references=all` to get
dimensions + their codelists in one call. `references=all` on the *dataflow* endpoint (step 1)
does NOT inline the DSD — it only returns a `Ref`; `references=all` must be on the *datastructure*
endpoint (step 2) to inline the codelists.

### Research Quirk — an unscoped data key returns the ENTIRE dataflow (116MB+), not just "many series"

`GET /rest/data/BBEX3?detail=dataonly` (no key) returned a **116,584,167-byte** response — every
series in the dataflow, all history, at once. This is more extreme than ISTAT's "hundreds of
series" unscoped-key finding (UC-656) — Bundesbank has no visible per-request cap. `key` is
therefore a REQUIRED field at the schema layer (not optional-with-default like ISTAT's), and
`bundesbank-timeseries.data`'s `buildRequest` additionally rejects any key with an empty segment
(`..`, leading/trailing `.`) so a caller cannot pass a partially-wildcarded key either — every SDMX
key position must be filled. A single fully-specified series (e.g.
`D.USD.EUR.BB.AC.000`, daily EUR/USD) with `detail=DATA_ONLY` and no `lastNObservations` was still
620KB (the response embeds the full currency/frequency code enumeration per dimension even for a
single series) — confirming `last_n_observations` (capped 1-100, default 30) is needed even for a
single scoped series, not just to bound multi-series responses.

### Research Quirk — `detail=dataonly` (lowercase) is rejected; the real enum value is `DATA_ONLY`

The API's own OpenAPI spec documents `detail` as an enum of `FULL`, `NAME_ONLY`, `DATA_ONLY`,
`SERIES_KEY_ONLY`, `NO_DATA`, `VERBOSE` (all uppercase-with-underscore) — `detail=dataonly` (the
casing that seemed natural by analogy to other SDMX APIs) returns `HTTP 400`. Found by reading the
OpenAPI spec directly rather than guessing from convention.

---

## Tool Mapping

| # | Tool ID | mcpName | Description | Price |
|---|---------|---------|--------------|-------|
| 1 | bundesbank-timeseries.dataflows | bundesbank-timeseries.reference.dataflows | Search/list Bundesbank dataflows | $0.001 |
| 2 | bundesbank-timeseries.structure | bundesbank-timeseries.reference.structure | Dimensions + codes for a dataflow | $0.001 |
| 3 | bundesbank-timeseries.data | bundesbank-timeseries.series.data | Observation values for a dataflow | $0.002 |

All 3 tools: category `finance`, annotations `READ_ONLY`.

---

## Input Schemas

Defined in `src/schemas/bundesbank-timeseries.schema.ts`, all `.strip()`ped Zod objects:

- `dataflows`: `query` (optional string, case-insensitive substring on id/name)
- `structure`: `dataflow_id` (required, `^[A-Za-z0-9_]+$`)
- `data`: `dataflow_id` (required), `key` (REQUIRED, `^[A-Za-z0-9_+.-]+$`, no empty segments —
  unlike ISTAT this has no "all" default), `start_period` (optional), `end_period` (optional),
  `last_n_observations` (optional 1-100, default 30, ignored if start/end period set)

---

## Implementation Files

| File | Purpose |
|------|---------|
| src/adapters/bundesbank-timeseries/index.ts | BundesbankTimeseriesAdapter — call() override for XML metadata (dataflows/structure), buildRequest/parseResponse for the JSON data tool |
| src/adapters/bundesbank-timeseries/types.ts | Raw SDMX-JSON data-message types + normalized dataflow/dimension shapes |
| src/schemas/bundesbank-timeseries.schema.ts | Zod schemas for all 3 tools |
| src/adapters/registry.ts | case 'bundesbank-timeseries' to BundesbankTimeseriesAdapter |
| src/schemas/index.ts | bundesbankTimeseriesSchemas spread |
| src/mcp/tool-definitions.ts | 3 tool definitions, category finance |
| config/tool_provider_config.yaml | 3 tool entries, provider bundesbank-timeseries, price_usd 0.001-0.002, cache_ttl 3600-86400 |
| src/config/provider-limits.json | Dashboard entry, limit_type unlimited, no documented rate limit |
| scripts/test-bundesbank-timeseries.sh | 6-check smoke test (health, catalog, schema, dashboard, OpenAPI, upstream) |

---

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin | Cache TTL |
|------|---------------|-------------|--------|-----------|
| bundesbank-timeseries.dataflows | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — catalog is near-static, only 94 dataflows) |
| bundesbank-timeseries.structure | $0 (free, no auth) | $0.001 | ~100% | 86400s (24h — dimension/codelist structure rarely changes) |
| bundesbank-timeseries.data | $0 (free, no auth) | $0.002 | ~100% | 3600s (1h — observation values can be revised, e.g. `BBK_DIFF`/`OBS_STATUS` attributes indicate provisional data) |

---

## Notes

- Adapter logic was verified with real upstream data by instantiating `BundesbankTimeseriesAdapter`
  directly and calling all 3 tools against the live API: `dataflows` with `query: "exchange"`
  returned 3 real dataflows (BBEE1, BBEE5, BBEX3); `structure` for `BBEX3` returned 6
  correctly-ordered dimensions with codes (`BBK_STD_FREQ` 6 codes, `BBK_STD_CURRENCY` 219 codes);
  `data` with `key: "D.USD.EUR.BB.AC.000"` and `last_n_observations: 5` returned real August/
  September 2026 EUR/USD reference rates (1.1643, 1.1596, 1.1590 on trading days; `null` on the
  2026-08-29/30 weekend, matching the daily-only-on-business-days series semantics).
- Error paths verified directly: an unknown `dataflow_id` on `structure` surfaces the upstream's
  own 404 as a 422 `provider_input_rejected` (not a 502); a `data` key with an empty segment
  (`D..EUR.BB.AC.000`) is rejected at the schema/buildRequest layer before any upstream call.
- `npx tsx scripts/seed.ts` upserted all 3 new tools ("Upserted 1337 tools" — includes concurrently
  in-flight uncommitted providers from other night-orchestra roles in this shared working tree).
  The script's separate `seedTestAgent()` step failed afterward with the same pre-existing,
  unrelated Prisma UUID error documented in every prior UC's notes since UC-643 (`Agent.agent_id`
  is a Postgres `uuid` column but the seed script's hardcoded `TEST_AGENT_ID` is not a valid UUID)
  — confirmed unmodified by this onboarding, verified the 3 tools persisted in Postgres directly
  via a Prisma query despite the later script failure, out of scope to fix here.
- Local production stack (this host's Docker containers, which serve apibase.pro directly)
  rebuilt and redeployed cleanly: TS compile 0 errors, ESLint 0 errors, container healthy,
  `/api/v1/tools` shows 1316 tools with `has_more:false`, dashboard shows `tool_count:3` for
  `bundesbank-timeseries`, both the general 8/8 smoke suite and the 6-check
  `test-bundesbank-timeseries.sh` suite pass.
- Not published to Smithery and not pushed to GitHub per this run's BATCH MODE instructions — the
  hourly batch-pusher handles both.
