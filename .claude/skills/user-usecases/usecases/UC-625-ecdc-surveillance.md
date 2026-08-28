# UC-625: ECDC COVID-19 Surveillance — Public Health

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-625 |
| **Provider** | European Centre for Disease Prevention and Control (ECDC) |
| **Domain** | ecdc.europa.eu |
| **Category** | Public Health |
| **Theme** | Health & Epidemiology |
| **Date** | 2026-08-28 |
| **Batch** | night-orchestra (onboarded) |
| **Status** | LIVE (historical data only — see quirk below) |
| **Region** | EU/EEA (~30 countries) |
| **Pricing Model** | free upstream |
| **Monetization Pattern** | P3: Gov Open Data Wrapper |

---

## Provider Summary

ECDC publishes historical COVID-19 surveillance data (TESSy collection) as static, unauthenticated,
CORS-open JSON dumps under `opendata.ecdc.europa.eu`. There is no queryable REST/CKAN API — each
dataset is a full-history JSON file with no pagination or server-side filtering.

| Aspect | Details |
|--------|---------|
| **Free Tier** | Unlimited (public open data) |
| **Paid Tier** | None |
| **Auth Model** | None |
| **ToS** | Commercial use/resale: OK — CC BY 4.0 (see `ecdc.europa.eu/en/ecdc-intellectual-property-notices`) |
| **Global Availability** | Available worldwide (data scope: EU/EEA countries) |

### CRITICAL Upstream Quirk (confirmed live, 2026-08-28) — Frozen dataset, not live surveillance

Every ECDC opendata JSON file returns `Last-Modified: Fri, 01 Dec 2023` — ECDC discontinued routine
COVID-19 reporting in December 2023. All three datasets below cover **2020-W01 through 2023-W47
only** and will never receive new weeks. This is a historical archive, not real-time disease
surveillance, despite the "surveillance" name. Every tool description and the UC title explicitly
state this so agents/users are not misled into thinking they're getting current outbreak data.

### Dataset size constraint — 2 candidate datasets REJECTED as infeasible

The `opendata.ecdc.europa.eu/covid19/` folder has no query params, so every call must download the
**entire** dataset file. Two originally-candidate datasets were dropped after live `curl -I` checks:
- `vaccine_tracker/json/` — **502MB** (age/vaccine/region breakdown) — far beyond any workable
  `maxResponseBytes`/timeout budget.
- `subnationalcasedaily/json/` — **101MB** — same problem.
- `casedistribution/json/` (legacy) — 28MB, deprecated since 2021-02, superseded by
  `nationalcasedeath` — also dropped.

Three datasets were kept because their full-file size is small enough to fetch within the 15s
adapter timeout: `nationalcasedeath` (3.7MB), `testing` (1.9MB), `hospitalicuadmissionrates`
(5.6MB). `maxResponseBytes` raised to 6.5MB adapter-wide (largest file + margin), matching the
UC-590 OFAC fetch-full-then-filter pattern (fetch entire static file, filter server-side in
`parseResponse`, never forward the raw multi-MB blob to the agent).

---

## API Overview

| # | Endpoint | Method | Description | Rate Limit |
|---|----------|--------|-------------|------------|
| 1 | `/covid19/nationalcasedeath/json/` | GET | Weekly cases/deaths by country, full history | Unlimited |
| 2 | `/covid19/testing/json/` | GET | Weekly testing volume + positivity rate by country | Unlimited |
| 3 | `/covid19/hospitalicuadmissionrates/json/` | GET | Daily hospital/ICU occupancy + weekly admission rates | Unlimited |

**Base URL:** `https://opendata.ecdc.europa.eu`
**Docs:** No API docs page exists — dataset catalog is at `www.ecdc.europa.eu/en/publications-data`

---

## Proposed MCP Tools

| # | Tool Name | Description | Est. Price |
|---|-----------|--------------|------------|
| 1 | `ecdc-surveillance.cases_deaths` | Historical weekly COVID-19 cases/deaths by country (2020-W01–2023-W47) | $0.002 |
| 2 | `ecdc-surveillance.testing_rate` | Historical weekly testing volume + positivity rate by country | $0.002 |
| 3 | `ecdc-surveillance.hospital_icu` | Historical daily hospital/ICU occupancy + weekly admission rates | $0.002 |

---

## Why Interesting for Agents

- Only official EU-wide COVID-19 epidemiological dataset with weekly per-country resolution back to 2020
- Useful for historical/retrospective public-health research agents (pandemic timeline analysis, policy retrospectives)
- CC BY 4.0 explicitly permits commercial resale, unlike many national health portals
- Complements existing health-category tools (USDA/OpenFDA/NIH in UC-011) with an EU-specific epidemiological angle
- **Not suitable** for agents needing current/live disease surveillance — tool descriptions state this explicitly

---

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/ecdc-surveillance/types.ts` | Raw row types for all 3 datasets |
| `src/adapters/ecdc-surveillance/index.ts` | `EcdcSurveillanceAdapter` — fetches full static JSON file, filters by country/week/indicator client-side |
| `src/schemas/ecdc-surveillance.schema.ts` | Zod schemas (`country`, `indicator`, `year_week`, `limit`) per tool |
| `src/adapters/registry.ts` | `case 'ecdc-surveillance':` → `EcdcSurveillanceAdapter` |
| `src/schemas/index.ts` | `...ecdcSurveillanceSchemas` spread |
| `src/mcp/tool-definitions.ts` | 3 tool definitions, category `health`, `mcpName` = `ecdc-surveillance.covid.{action}` |
| `config/tool_provider_config.yaml` | 3 tool entries, `provider: ecdc-surveillance`, `price_usd: "0.002"`, `cache_ttl: 2592000` |
| `src/config/provider-limits.json` | `ecdc-surveillance` dashboard entry (unlimited, no documented rate limit) |
| `static/dashboard.html` | `PROVIDER_CATEGORIES['ECDC COVID-19 Surveillance'] = 'Health'` |
| `scripts/test-ecdc-surveillance.sh` | 6-check smoke test (catalog, schema, dashboard, OpenAPI, live upstream value) |

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin |
|------|---------------|-------------|--------|
| `ecdc-surveillance.cases_deaths` | $0 (free, no auth) | $0.002 | ~100% |
| `ecdc-surveillance.testing_rate` | $0 (free, no auth) | $0.002 | ~100% |
| `ecdc-surveillance.hospital_icu` | $0 (free, no auth) | $0.002 | ~100% |

`cache_ttl: 2592000` (30 days) — datasets are permanently frozen (no updates since Dec 2023), so a
long TTL is safe and minimizes repeated multi-MB upstream fetches, matching the UC-623 GEBCO
static-grid pattern.

---

## Next Steps

- [x] No registration needed
- [x] Onboarded via night-orchestra batch role — adapter, schemas, registry, config, seed, build, deploy, smoke tests all pass
- [x] Key datasets: nationalcasedeath, testing, hospitalicuadmissionrates (vaccine_tracker/subnationalcasedaily/casedistribution rejected — too large or deprecated)
- [x] Smoke test all tools — `scripts/test-ecdc-surveillance.sh` 6/6 PASS + general `scripts/smoke-test.sh` 8/8 PASS
- [ ] Update candidates-registry.json status to "onboarded"
