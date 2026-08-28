# UC-434: IMF DataMapper API — Economics / International Finance

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-434 |
| **Provider** | International Monetary Fund |
| **Domain** | imf.org |
| **Category** | Economics / International Finance |
| **Theme** | E: Finance & Economics |
| **Date** | 2026-08-28 |
| **Batch** | 23 (researched) / night-orchestra (onboarded) |
| **Status** | LIVE |
| **Region** | Global (190+ countries) |
| **Pricing Model** | free |
| **Monetization Pattern** | P3: Gov Open Data Wrapper |
| **Quick Score** | 98/110 |

---

## Provider Summary

The IMF DataMapper API is a lightweight, native-JSON, no-auth REST endpoint serving IMF World Economic Outlook indicators for 190+ countries. It covers GDP growth forecasts, inflation projections, fiscal balance, current account, government debt, and trade data — both historical series and forward projections to 2029. A heavier SDMX endpoint (`dataservices.imf.org`) extends coverage to the full IFS, DOT, and BOP databases (out of scope for this UC).

| Aspect | Details |
|--------|---------|
| **Free Tier** | Unlimited (IMF public service) |
| **Paid Tier** | None |
| **Auth Model** | None |
| **ToS** | Commercial use: OK (IMF open data policy, CC BY 4.0) |
| **Global Availability** | Available worldwide |

---

## API Overview

| # | Endpoint | Method | Description | Rate Limit |
|---|----------|--------|-------------|------------|
| 1 | `/indicators` | GET | List all WEO indicator codes + names | Unlimited |
| 2 | `/countries` | GET | List all country codes + names | Unlimited |
| 3 | `/{indicator}` | GET | All countries' data for one indicator (full matrix) | Unlimited |
| 4 | `/{indicator}/{country}` | GET | Documented single-country filter — confirmed ignored live, always returns the full matrix (see Upstream Quirk below) | Unlimited |

**Base URL:** `https://www.imf.org/external/datamapper/api/v1`
**Docs:** `https://www.imf.org/external/datamapper/api/v1` (self-documenting JSON)

### Upstream Quirk (confirmed live, 2026-08-28)

The documented `/{indicator}/{country}` path filter is silently ignored — `NGDP_RPCH/USA` and `NGDP_RPCH/DEU` both return the identical full ~229-entry country/aggregate matrix (only `NGDP_RPCH/USA` alone tested, key set was independent of the country segment). Same class of gotcha as UC-440 Ensembl, UC-607 usgs-mrds, and UC-605 federalregister ("documented filter param has no server-side effect"). The adapter always fetches the full `/{indicator}` matrix and applies country + year-range filtering client-side in `parseResponse`.

---

## Proposed MCP Tools

| # | Tool Name | Description | Est. Price |
|---|-----------|--------------|------------|
| 1 | `imf.gdp_growth` | Real GDP growth rate (WEO) for one or more countries with projections | $0.001 |
| 2 | `imf.inflation` | CPI inflation rate (WEO) with IMF projections to 2029 | $0.001 |
| 3 | `imf.fiscal_balance` | General government fiscal balance (% of GDP) | $0.001 |
| 4 | `imf.current_account` | Current account balance (% of GDP), 190+ countries | $0.001 |

---

## Why Interesting for Agents

- Cleanest no-auth JSON macro API on the planet — IMF official WEO data with forward projections
- Unique feature: includes IMF projections (not just historical), critical for financial planning agents
- 190+ countries including emerging markets not covered by OECD (UC-433)
- Complements BIS (UC-435) for a complete international finance picture
- High demand from macro research, sovereign credit analysis, ESG country scoring agents

---

## Quick Score

| Parameter | Weight | Score (1-5) | Weighted |
|-----------|--------|-------------|----------|
| Pricing (PPU confirmed) | 5 | 5 | 25 |
| Agent Utility / Demand | 5 | 5 | 25 |
| ToS Compatibility | 5 | 5 | 25 |
| Unique Features | 4 | 4 | 16 |
| Global Coverage | 3 | 3 | 9 |
| **Total** | **22** | | **100/110** |

---

## Implementation Files

| File | Purpose |
|------|---------|
| `src/adapters/imf/types.ts` | `ImfDataMapperResponse` raw response type |
| `src/adapters/imf/index.ts` | `ImfAdapter` — fetches full `/{indicator}` matrix, filters by country/year client-side |
| `src/schemas/imf.schema.ts` | Zod schemas (`country`, `countries[]`, `start_year`, `end_year`) shared by all 4 tools |
| `src/adapters/registry.ts` | `case 'imf':` → `ImfAdapter` |
| `src/schemas/index.ts` | `...imfSchemas` spread |
| `src/mcp/tool-definitions.ts` | 4 tool definitions, category `finance`, `mcpName` = `imf.macro.{action}` |
| `config/tool_provider_config.yaml` | 4 tool entries, `provider: imf`, `price_usd: "0.001"`, `cache_ttl: 86400` |
| `src/config/provider-limits.json` | `imf` dashboard entry (unlimited, no documented rate limit) |
| `static/dashboard.html` | `PROVIDER_CATEGORIES['IMF DataMapper'] = 'Finance'` |
| `scripts/test-imf.sh` | 6-check smoke test (catalog, schema, dashboard, OpenAPI, live upstream value) |

## Pricing Rationale

| Tool | Upstream Cost | Price (USD) | Margin |
|------|---------------|-------------|--------|
| `imf.gdp_growth` | $0 (free, no auth) | $0.001 | ~100% |
| `imf.inflation` | $0 (free, no auth) | $0.001 | ~100% |
| `imf.fiscal_balance` | $0 (free, no auth) | $0.001 | ~100% |
| `imf.current_account` | $0 (free, no auth) | $0.001 | ~100% |

`cache_ttl: 86400` (24h) — IMF WEO releases update twice a year (April/October); daily cache is conservative relative to actual data-refresh cadence.

---

## Next Steps

- [x] No registration needed
- [x] Onboarded via night-orchestra batch role — adapter, schemas, registry, config, seed, build, deploy, smoke tests all pass
- [x] Key indicators: NGDP_RPCH (GDP growth), PCPIPCH (inflation), GGXCNL_NGDP (fiscal balance), BCA_NGDPD (current account)
- [x] Smoke test all tools — `scripts/test-imf.sh` 6/6 PASS + general `scripts/smoke-test.sh` 8/8 PASS
- [ ] Update candidates-registry.json status to "onboarded"
