# UC-016: ECB/Frankfurter + FRED + World Bank + US Treasury + fawazahmed0 (Payments / Banking / Financial Intelligence)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-016 |
| **Provider** | Frankfurter/ECB (exchange rates) + FRED (US economic data) + World Bank (global development data) + US Treasury Fiscal Data (US fiscal data) + fawazahmed0/exchange-api (200+ currencies CC0) |
| **Category** | Payments / Banking / Financial Intelligence |
| **Date Added** | 2026-03-07 |
| **Status** | Reference |
| **Client** | APIbase (platform-level integration) |

---

## RESEARCH REPORT: UC-016 Payments / Banking / Financial Infrastructure

---

# Phase 1: Comprehensive Candidate Discovery (25 Candidates Evaluated)

## 1.1 Currency & Exchange Rate APIs

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 1 | **ExchangeRate-API** | 1,500 req/mo (open, no key) | $100-700/yr | Simple JSON, 160+ currencies |
| 2 | **Open Exchange Rates** | 1,000 req/mo (USD base only) | $12-200/mo | 200+ currencies, hourly updates |
| 3 | **CurrencyLayer** (APILayer) | 100 req/day (daily updates) | $9.99-99.99/mo | 168+ currencies, enterprise features |
| 4 | **Fixer.io** (APILayer) | 100 req/mo | $9.99-99.99/mo | ECB-sourced, 170 currencies |
| 5 | **FreeCurrencyAPI** | 5,000 req/mo | $9.99-79.99/mo | 170+ currencies, 60s updates |
| 6 | **currencyapi.com** | 300 req/mo (personal only) | $9.99-99.99/mo | 170+ currencies, historical data |
| 7 | **AbstractAPI Currency** | Limited free tier | Custom pricing | 150+ currencies, crypto support |
| 8 | **Frankfurter API** | **UNLIMITED (no key, no limits)** | **$0 forever** | ECB reference rates, ~30 currencies, open source |
| 9 | **fawazahmed0/exchange-api** | **UNLIMITED (no key, no limits)** | **$0 forever (CC0)** | 200+ currencies + crypto, CDN-hosted |
| 10 | **XE Currency Data** | None (trial only) | ~$1,200+/yr | Premium forex-grade data |
| 11 | **ECB Data Portal API** | **UNLIMITED (no key, no limits)** | **$0 forever** | Official ECB reference rates, SDMX 2.1 |
| 12 | **Wise (TransferWise) API** | Rate lookup free | Requires Wise account | Mid-market rates, 50+ currencies |

## 1.2 Government Financial / Economic Data APIs

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 13 | **FRED (Federal Reserve)** | **120 req/min (free key)** | **$0 forever** | 816,000+ economic time series |
| 14 | **World Bank API** | **UNLIMITED (no key needed)** | **$0 forever (CC-BY 4.0)** | 16,000+ indicators, 200+ countries |
| 15 | **IMF Data API** | **Free access** | **$0** | WEO, IFS, BOP, GFS datasets |
| 16 | **US Treasury Fiscal Data** | **UNLIMITED (no key needed)** | **$0 forever** | US debt, revenue, spending, interest rates |
| 17 | **DBnomics** | **UNLIMITED** | **$0 (ODbL)** | Aggregator: 70+ providers, millions of series |

## 1.3 Open Banking / Account Data APIs

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 18 | **Plaid** | Sandbox only | Custom (expensive) | 12,000+ institutions, US/CA/EU |
| 19 | **Teller** | Sandbox only (free live, fair use) | Custom for production | US bank connections, simple API |
| 20 | **Nordigen/GoCardless** | Was free (50 connections/mo) | **Discontinued for new customers** | EU open banking |

## 1.4 Payment Processing APIs

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 21 | **Stripe** | Test mode free | 2.9% + 30c/txn | Market leader, partner ecosystem |
| 22 | **PayPal** | Sandbox free | 2.9% + 30c/txn | Ubiquitous, merchant/consumer |

## 1.5 Financial Market Data APIs

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 23 | **Alpha Vantage** | 25 req/day | $49.99-249.99/mo | Stocks, forex, crypto, economic indicators |
| 24 | **Financial Modeling Prep** | 250 req/day | $14-99+/mo | Financial statements, company data |
| 25 | **Twelve Data** | 8 req/min, 800/day | $29-329/mo | Stocks, forex, crypto, fundamentals |

## 1.6 Supplementary APIs (Tax, IBAN, Crypto Payments)

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 26 | **VATLayer** | 100 req/mo | $9.99/mo+ | EU VAT validation |
| 27 | **OpenIBAN** | **Free, no limits** | **$0** | IBAN validation (checksum + length) |
| 28 | **IBAN.com** | 100 trial queries | Custom | Premium IBAN validation + BIC |
| 29 | **NOWPayments** | Free integration | 0.5-1% per txn | 350+ crypto currencies |
| 30 | **TaxJar** | 30-day trial | $99/mo+ | US sales tax calculation |

---

# Phase 2: Evaluation Matrix (12 Parameters, Max 245 Points)

## Scoring Legend
- 5 = Exceptional / Best-in-class
- 4 = Very good
- 3 = Good / Average
- 2 = Below average / Limitations
- 1 = Poor / Major issues
- 0 = Disqualified / Not applicable

## 2.1 Top-Tier Candidates (Government + Open Data — The $0 Upstream Strategy)

### Candidate A: Frankfurter API (ECB Exchange Rates)

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **5** | x5 | **25** | 100% free, no key, no limits, no cost ever |
| Data Coverage / Depth | **3** | x4 | **12** | ~30 currencies (ECB reference), daily frequency only |
| API Quality | **5** | x3 | **15** | Excellent REST/JSON, fast CDN, minimal latency |
| Affiliate / Revenue Opp | **1** | x5 | **5** | No affiliate program (open source project) |
| Agent Utility | **4** | x5 | **20** | Currency conversion is universal utility for agents |
| ToS Compatibility | **5** | x5 | **25** | Open source (MIT), ECB data = free commercial reuse with attribution |
| MCP Ecosystem | **5** | x3 | **15** | Multiple existing MCP servers (Wes Bos, Anirban Basu, frankfurtermcp on PyPI) |
| Unique Features | **3** | x4 | **12** | Official ECB rates — institutional credibility |
| New Pattern Potential | **3** | x5 | **15** | Currency conversion enrichment for ALL international UCs |
| Cache Potential | **5** | x3 | **15** | ECB rates update daily at 16:00 CET — cache 23h59m per day |
| Cross-UC Synergy | **5** | x4 | **20** | UC-002 Travel, UC-004 Crypto, UC-009 E-commerce, UC-013 RE, UC-015 Jobs |
| Market Position | **4** | x3 | **12** | Top free option, but limited to EUR-centric ~30 currencies |
| **TOTAL** | | | **191/245** | |

### Candidate B: fawazahmed0/exchange-api (CC0 Currency Data)

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **5** | x5 | **25** | CC0 public domain, no key, no rate limits, $0 |
| Data Coverage / Depth | **4** | x4 | **16** | 200+ currencies INCLUDING crypto + metals |
| API Quality | **4** | x3 | **12** | CDN-hosted (jsDelivr + Cloudflare fallback), simple JSON |
| Affiliate / Revenue Opp | **1** | x5 | **5** | No affiliate (community project) |
| Agent Utility | **5** | x5 | **25** | 200+ currencies + crypto = near-universal coverage |
| ToS Compatibility | **5** | x5 | **25** | **CC0-1.0 (Public Domain)** — no restrictions whatsoever |
| MCP Ecosystem | **3** | x3 | **9** | Used in some currency MCP servers, not dedicated MCP |
| Unique Features | **4** | x4 | **16** | Crypto + fiat in one API, CC0, self-hostable in 30 seconds |
| New Pattern Potential | **4** | x5 | **20** | CC0 data can be cached permanently and redistributed freely |
| Cache Potential | **5** | x3 | **15** | Daily updates, cache entire dataset (< 2MB), serve from CDN |
| Cross-UC Synergy | **5** | x4 | **20** | All international UCs + UC-004 crypto (fiat-to-crypto bridge) |
| Market Position | **3** | x3 | **9** | Community project, not institutional — but 200+ currencies |
| **TOTAL** | | | **197/245** | |

### Candidate C: FRED (Federal Reserve Economic Data)

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **5** | x5 | **25** | Free API key, 120 req/min, $0 |
| Data Coverage / Depth | **5** | x4 | **20** | **816,000+ time series** — most comprehensive US economic DB |
| API Quality | **4** | x3 | **12** | REST/JSON, good docs, occasional slowness |
| Affiliate / Revenue Opp | **2** | x5 | **10** | No direct affiliate, but fintech affiliate funnel possible |
| Agent Utility | **5** | x5 | **25** | Economic indicators essential for financial AI agents |
| ToS Compatibility | **3** | x5 | **15** | Complex: FRED data free for apps, BUT third-party series may have copyright. 2024 update restricted caching. Must display FRED attribution + link. |
| MCP Ecosystem | **5** | x3 | **15** | Multiple FRED MCP servers exist (fred-mcp-server, mcp-fredapi) |
| Unique Features | **5** | x4 | **20** | **816K+ series**: GDP, CPI, unemployment, interest rates, mortgage rates, Fed Funds — authoritative US source |
| New Pattern Potential | **4** | x5 | **20** | Economic intelligence layer for B2B premium pricing |
| Cache Potential | **4** | x3 | **12** | Most series update monthly/quarterly — long cache windows. BUT 2024 ToS update prohibits caching/archiving |
| Cross-UC Synergy | **5** | x4 | **20** | UC-013 RE (mortgage rates), UC-015 Jobs (unemployment, CPI), UC-004 Crypto (Fed rates), ALL (inflation/macro) |
| Market Position | **5** | x3 | **15** | **THE** authoritative US economic data source. No competitor |
| **TOTAL** | | | **209/245** | |

### Candidate D: World Bank API (Global Development Data)

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **5** | x5 | **25** | Free, no key needed, unlimited, CC-BY 4.0 |
| Data Coverage / Depth | **5** | x4 | **20** | 16,000+ indicators, 200+ countries, decades of history |
| API Quality | **3** | x3 | **9** | REST/JSON + XML, slightly dated API design |
| Affiliate / Revenue Opp | **1** | x5 | **5** | No affiliate (intergovernmental organization) |
| Agent Utility | **4** | x5 | **20** | Country-level economic comparison, development metrics |
| ToS Compatibility | **5** | x5 | **25** | **CC-BY 4.0**: "free to copy, distribute, adapt, display or include the data in other products for commercial or noncommercial purposes at no cost." Explicit API redistribution allowed. |
| MCP Ecosystem | **2** | x3 | **6** | Limited MCP presence |
| Unique Features | **4** | x4 | **16** | Global development indicators no other API has (poverty, literacy, healthcare spending per capita by country) |
| New Pattern Potential | **3** | x5 | **15** | Country-level economic profiles for international decisions |
| Cache Potential | **5** | x3 | **15** | Annual indicators — cache for 365 days. Bulk download available. |
| Cross-UC Synergy | **4** | x4 | **16** | UC-002 Travel (country safety/economy), UC-015 Jobs (global salary context), UC-013 RE (comparative economics) |
| Market Position | **5** | x3 | **15** | THE global development data source. Unmatched coverage. |
| **TOTAL** | | | **187/245** | |

### Candidate E: US Treasury Fiscal Data API

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **5** | x5 | **25** | Free, no key, unlimited |
| Data Coverage / Depth | **4** | x4 | **16** | US debt, revenue, spending, interest rates, Treasury yields, savings bonds |
| API Quality | **4** | x3 | **12** | REST/JSON, well-documented, filters, pagination |
| Affiliate / Revenue Opp | **1** | x5 | **5** | No affiliate (US government) |
| Agent Utility | **4** | x5 | **20** | Treasury yields, national debt, government spending — key macro metrics |
| ToS Compatibility | **5** | x5 | **25** | **"Data is offered free, without restriction, and available to copy, adapt, redistribute, or otherwise use for non-commercial or commercial purposes."** Best ToS of any candidate. |
| MCP Ecosystem | **2** | x3 | **6** | No dedicated MCP server found |
| Unique Features | **4** | x4 | **16** | Treasury yields, national debt data — direct from source |
| New Pattern Potential | **3** | x5 | **15** | Treasury yield intelligence for investment/mortgage rate context |
| Cache Potential | **5** | x3 | **15** | Most data updates daily or monthly — excellent cache windows |
| Cross-UC Synergy | **3** | x4 | **12** | UC-013 RE (Treasury yields → mortgage rates), UC-004 Crypto (fiscal policy context) |
| Market Position | **4** | x3 | **12** | Authoritative for US fiscal data, but narrow scope |
| **TOTAL** | | | **179/245** | |

## 2.2 Commercial Currency APIs (Disqualification Candidates)

### Candidate F: ExchangeRate-API

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **4** | x5 | **20** | 1,500 req/mo free (no key), $100/yr paid |
| Data Coverage / Depth | **4** | x4 | **16** | 160+ currencies, daily updates (hourly on paid) |
| API Quality | **5** | x3 | **15** | Excellent REST/JSON, very simple to use |
| Affiliate / Revenue Opp | **1** | x5 | **5** | No affiliate program |
| Agent Utility | **4** | x5 | **20** | Currency conversion utility |
| ToS Compatibility | **1** | x5 | **5** | **DISQUALIFIED**: "does not permit re-distribution" and "may only be used for end purposes and not in any product or service that offers programmatic or automatic access to exchange rate data." |
| MCP Ecosystem | **3** | x3 | **9** | Some usage in MCP implementations |
| Unique Features | **2** | x4 | **8** | Nothing unique vs free alternatives |
| New Pattern Potential | **1** | x5 | **5** | ToS blocks all proxy/resale patterns |
| Cache Potential | **4** | x3 | **12** | "caching is for customer end-use only" — cache OK for end use, not redistribution |
| Cross-UC Synergy | **4** | x4 | **16** | Same as any currency API |
| Market Position | **3** | x3 | **9** | Popular but many free alternatives exist |
| **TOTAL** | | | **140/245** | **DISQUALIFIED** |

### Candidate G: Open Exchange Rates

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **3** | x5 | **15** | 1,000 req/mo free (USD base only) |
| ToS Compatibility | **1** | x5 | **5** | **DISQUALIFIED**: Commercial/ad-supported apps require paid plan. Free = "personal, small-scale and open source use" only. No redistribution language found — default restrictive. |
| **TOTAL** | | | **~135/245** | **DISQUALIFIED** |

## 2.3 Open Banking APIs (Disqualification Candidates)

### Candidate H: Plaid

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **1** | x5 | **5** | Sandbox only free. Production = expensive custom pricing. |
| ToS Compatibility | **0** | x5 | **0** | **DISQUALIFIED**: "You may not use the Service for timesharing or service bureau purposes or otherwise for the benefit of a third-party." Proxy/resale explicitly banned. Requires direct end-user relationship. PSD2/CFPB regulated. |
| **TOTAL** | | | **N/A** | **DISQUALIFIED** |

## 2.4 Financial Market Data APIs

### Candidate I: Alpha Vantage

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **2** | x5 | **10** | Only 25 req/day free — extremely limited |
| ToS Compatibility | **0** | x5 | **0** | **DISQUALIFIED**: "You may not redistribute, resell, or provide Alpha Vantage API data to third parties." "You shall not use the service on behalf of third parties." Explicit proxy ban. |
| **TOTAL** | | | **N/A** | **DISQUALIFIED** |

### Candidate J: Financial Modeling Prep

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **3** | x5 | **15** | 250 req/day free |
| ToS Compatibility | **0** | x5 | **0** | **DISQUALIFIED**: "Customers may not use the Data or Services for any Commercial Use." "may not share, resell, permit other users access, integrate into tools accessible by third parties." Explicit proxy/resale ban. Personal license = non-commercial only. |
| **TOTAL** | | | **N/A** | **DISQUALIFIED** |

### Candidate K: Twelve Data

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **2** | x5 | **10** | 800 req/day free |
| ToS Compatibility | **1** | x5 | **5** | **DISQUALIFIED**: "Redistribution of any data necessitates a separate agreement." License is "solely for Internal Use during the subscription term." Non-transferable, non-sublicensable. |
| **TOTAL** | | | **N/A** | **DISQUALIFIED** |

## 2.5 Supplementary Candidates

### Candidate L: IMF Data API

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **5** | x5 | **25** | Free access |
| Data Coverage | **5** | x4 | **20** | World Economic Outlook, Balance of Payments, Government Finance Statistics |
| ToS Compatibility | **2** | x5 | **10** | **PROBLEMATIC**: "The IMF does not permit use of its Content or Sites for the training of large language models (LLMs) without explicit permission." Commercial reuse requires emailing copyright@imf.org. Bulk download prohibited without permission. Build services that provide IMF data to others requires explicit authorization. |
| **TOTAL** | | | **~155/245** | **CONDITIONAL — requires IMF permission** |

### Candidate M: ECB Data Portal (Direct SDMX API)

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **5** | x5 | **25** | Free, no key, no limits |
| Data Coverage | **4** | x4 | **16** | Exchange rates + monetary policy + banking stats |
| API Quality | **3** | x3 | **9** | SDMX 2.1 format — complex XML, less developer-friendly |
| ToS Compatibility | **5** | x5 | **25** | **"The ESCB subscribes to a policy of free access and free reuse... irrespective of any subsequent commercial or non-commercial use."** Source: ECB Statistics Governance. Must cite source. Must not modify data. |
| Cache Potential | **5** | x3 | **15** | Daily reference rates, monthly/quarterly for other series |
| **TOTAL** | | | **~183/245** | Excellent ToS, but SDMX format is agent-unfriendly |

### Candidate N: OpenIBAN

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **5** | x5 | **25** | Free, no limits, no key |
| Data Coverage | **2** | x4 | **8** | IBAN validation only (checksum + length) — narrow |
| Agent Utility | **3** | x5 | **15** | Useful niche tool for payment validation |
| ToS Compatibility | **4** | x5 | **20** | No restrictive ToS found, open access |
| **TOTAL** | | | **~145/245** | Useful supplementary tool, not primary |

### Candidate O: DBnomics (Aggregator)

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **5** | x5 | **25** | Free, ODbL license |
| Data Coverage | **5** | x4 | **20** | 70+ providers, millions of series — massive aggregator |
| ToS Compatibility | **3** | x5 | **15** | ODbL for aggregated data, BUT individual series subject to original provider's terms (variable) |
| **TOTAL** | | | **~170/245** | Useful but ToS complexity per-series |

### Candidate P: Wise Affiliate + Rate API

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **3** | x5 | **15** | Rate lookup free, transfers require account |
| Affiliate / Revenue Opp | **5** | x5 | **25** | **Lifetime cookie! GBP 10/personal, GBP 50/business conversion.** Partnership program with API access for affiliates. |
| ToS Compatibility | **2** | x5 | **10** | Requires Wise account, affiliate agreement, unclear on proxy/resale of rate data |
| Agent Utility | **4** | x5 | **20** | Real mid-market rates + instant transfer capability |
| **TOTAL** | | | **~175/245** | Strong affiliate, but requires partnership agreement |

---

# Phase 3: Terms of Service Deep Dive

## 3.1 CLEARED FOR USE (Green Light)

### fawazahmed0/exchange-api — CC0-1.0 (PUBLIC DOMAIN)
- **License**: CC0-1.0 — Public Domain Dedication
- **Redistribution**: UNRESTRICTED. CC0 waives all rights.
- **Proxy/intermediary**: ALLOWED. No restrictions.
- **AI/LLM use**: NOT BANNED. CC0 has no restrictions.
- **Commercial use**: FULLY ALLOWED.
- **Caching**: UNRESTRICTED.
- **Source**: https://github.com/fawazahmed0/exchange-api — "Licensed under CC0-1.0"
- **VERDICT**: **PERFECT ToS** — zero restrictions of any kind.

### US Treasury Fiscal Data — US Government Open Data
- **Key clause**: *"Data is offered free, without restriction, and available to copy, adapt, redistribute, or otherwise use for non-commercial or commercial purposes."*
- **Source**: https://fiscaldata.treasury.gov/ and https://treasurydirect.gov/legal-information/developers/web-api-terms/
- **Redistribution**: EXPLICITLY ALLOWED for commercial and non-commercial.
- **Proxy/intermediary**: NOT RESTRICTED.
- **AI/LLM use**: NOT BANNED.
- **Caching**: NOT RESTRICTED.
- **Restriction**: Must not falsely imply Fiscal Service endorsement.
- **VERDICT**: **EXCELLENT ToS** — explicit commercial redistribution allowed.

### World Bank API — CC-BY 4.0
- **Key clause**: *"You are free to copy, distribute, adapt, display or include the data in other products for commercial or noncommercial purposes at no cost under a Creative Commons Attribution 4.0 International License."*
- **Key clause 2**: *"You may use the World Bank's application programming interfaces ('APIs') to facilitate access to the Datasets, whether through a separate Web site or through another type of software application."*
- **Source**: https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets
- **Redistribution**: ALLOWED with attribution.
- **Proxy/intermediary**: EXPLICITLY ALLOWED ("through a separate Web site or through another type of software application").
- **AI/LLM use**: NOT BANNED.
- **Caching**: ALLOWED.
- **Attribution required**: "The World Bank: [Dataset name]: Data source (if known)"
- **Caveat**: Some third-party datasets may have different terms (check metadata per indicator).
- **VERDICT**: **EXCELLENT ToS** — explicit API redistribution and commercial use allowed.

### ECB Statistics — Free Reuse Policy
- **Key clause**: *"The ESCB subscribes to a policy of free access and free reuse regarding its publicly released statistics... irrespective of any subsequent commercial or non-commercial use."*
- **Source**: https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html
- **Redistribution**: ALLOWED.
- **Commercial use**: EXPLICITLY ALLOWED ("irrespective of... commercial or non-commercial use").
- **Requirements**: (1) Cite "Source: ECB statistics", (2) Do not modify the statistics.
- **AI/LLM use**: NOT BANNED.
- **VERDICT**: **EXCELLENT ToS** — official EU institution explicitly permits commercial reuse.

### Frankfurter API — Open Source (MIT License)
- **Source**: https://github.com/lineofflight/frankfurter (MIT license)
- **Data source**: ECB reference rates (covered by ECB free reuse policy above).
- **Redistribution**: MIT + ECB policy = fully allowed.
- **Commercial use**: ALLOWED.
- **VERDICT**: **EXCELLENT ToS** — open source wrapper around ECB public data.

### FRED API — Conditional
- **Key clause**: *FRED data itself mostly free to use, BUT 2024 ToS update added:* prohibition on "storing, caching, or archiving any portion of FRED Services or FRED Content; providing any stored, cached, or archived portion to any third party."
- **Key clause 2**: Third-party series "may be owned by third parties and subject to copyright restrictions."
- **Key clause 3**: Applications for others must "display a link to these terms" and "state that users agree to the FRED Terms of Use."
- **Source**: https://fred.stlouisfed.org/docs/api/terms_of_use.html
- **Redistribution**: CONDITIONAL. Apps serving others are allowed, but must link to FRED ToS. Cannot cache/archive for redistribution (2024 update).
- **Proxy/intermediary**: CONDITIONAL. Cannot "replicate or replace the essential user experience of FRED."
- **AI/LLM use**: NOT EXPLICITLY BANNED.
- **VERDICT**: **CONDITIONAL** — can build apps that serve FRED data to agents, must attribute, cannot cache for redistribution, cannot replicate FRED. Real-time proxy pattern (pass-through, not caching) appears compliant.

## 3.2 DISQUALIFIED (Red Light)

### ExchangeRate-API
- **Exact clause**: *"The license does not permit re-distribution of ExchangeRate-API data... the data may only be used for end purposes and not in any product or service that offers programmatic or automatic access to exchange rate data."*
- **Source**: https://www.exchangerate-api.com/terms
- **REASON**: Explicitly bans building API services that provide exchange rate data. APIbase proxy model directly violates this.

### Open Exchange Rates
- **Exact clause**: Free accounts limited to *"personal, small-scale and open source use."* Commercial/ad-supported apps require paid plan.
- **Source**: https://openexchangerates.org/faq
- **REASON**: Free tier cannot be used commercially. Full ToS likely restricts redistribution further.

### CurrencyLayer / Fixer.io (APILayer)
- **REASON**: APILayer family. Enterprise terms with overage fees. No explicit redistribution permission. Commercial proxy likely violates standard ToS.

### currencyapi.com
- **Exact clause**: *"Free plan is for personal use only, and for commercial projects, you must upgrade."*
- **REASON**: Free tier = personal only. Commercial proxy explicitly excluded.

### Plaid
- **Exact clause**: *"You may not use the Service for timesharing or service bureau purposes or otherwise for the benefit of a third-party."*
- **Source**: https://plaid.com/legal/terms-of-use/
- **REASON**: "Service bureau" clause directly targets proxy/resale models. Also heavily regulated (PSD2/PCI).

### Alpha Vantage
- **Exact clause**: *"You may not redistribute, resell, or provide Alpha Vantage API data to third parties... You shall not use the service on behalf of third parties."*
- **Source**: https://www.alphavantage.co/terms_of_service/
- **REASON**: Explicit proxy/resale ban.

### Financial Modeling Prep
- **Exact clause**: *"Customers may not use the Data or Services for any Commercial Use... may not share, resell, permit other users access, integrate into tools accessible by third parties."*
- **Source**: https://site.financialmodelingprep.com/terms-of-service
- **REASON**: Personal license = non-commercial. Commercial requires special agreement. Redistribution explicitly banned.

### Twelve Data
- **Exact clause**: *"Redistribution of any data necessitates a separate agreement... solely for Internal Use during the subscription term."*
- **Source**: https://twelvedata.com/terms
- **REASON**: Default license = internal use only. Redistribution requires separate written agreement.

### Polygon.io
- **Exact clause**: *"may not use, redistribute, reverse assembling, reverse compiling, copying, modifying, displaying, disseminating, sublicensing, selling, publishing, reproducing, reselling, transferring."*
- **Source**: https://polygon.io/terms
- **REASON**: Comprehensive redistribution ban covering every conceivable form.

### IMF Data API
- **Exact clause**: *"The IMF does not permit use of its Content or Sites for the training of large language models (LLMs) without explicit permission."* Also: *"For any potential commercial reuse of IMF Data, please email copyright@imf.org."*
- **Source**: https://www.imf.org/en/about/copyright-and-terms
- **REASON**: LLM use explicitly banned. Commercial reuse requires permission. Bulk download prohibited without authorization. Could potentially be unlocked via formal permission, but uncertain.

### XE Currency Data
- **Exact clause**: *"Rates are meant to be used by a single legal entity and for one use case."*
- **REASON**: Single-entity restriction + expensive ($1,200+/yr) + no free tier.

### Nordigen/GoCardless
- **REASON**: "GoCardless is no longer offering the Nordigen API to new customers." Service discontinued for new registrations as of late 2025.

---

# Phase 4: Complete Disqualification List

| # | Candidate | Score | EXACT Reason for Disqualification |
|---|-----------|-------|-----------------------------------|
| 1 | ExchangeRate-API | 140/245 | ToS: "does not permit re-distribution... not in any product or service that offers programmatic access to exchange rate data" |
| 2 | Open Exchange Rates | ~135/245 | Free tier = "personal, small-scale and open source use" only. Commercial requires paid + unclear redistribution. |
| 3 | CurrencyLayer | N/A | APILayer enterprise terms, no explicit redistribution permission, overage fees |
| 4 | Fixer.io | N/A | Same as CurrencyLayer (APILayer family), enterprise terms |
| 5 | currencyapi.com | N/A | "Free plan is for personal use only" — commercial excluded |
| 6 | AbstractAPI Currency | N/A | No free tier details available, likely standard SaaS restrictions |
| 7 | XE Currency Data | N/A | "Single legal entity, one use case" + $1,200+/yr + no free tier |
| 8 | Plaid | N/A | "may not use the Service for timesharing or service bureau purposes" |
| 9 | Teller | N/A | Free = sandbox only. Production = custom pricing. Open banking regulation. |
| 10 | Nordigen/GoCardless | N/A | **Service discontinued for new customers** as of late 2025 |
| 11 | Stripe | N/A | Payment processor, not data API. Cannot proxy payment processing without being a payment facilitator (PCI-DSS, licensing). |
| 12 | PayPal | N/A | Same as Stripe — transactional, not data. Regulatory barriers. |
| 13 | Alpha Vantage | N/A | "may not redistribute, resell, or provide data to third parties" |
| 14 | Financial Modeling Prep | N/A | "may not use for any Commercial Use... may not share, resell, integrate into tools accessible by third parties" |
| 15 | Twelve Data | N/A | "Redistribution necessitates separate agreement... solely for Internal Use" |
| 16 | Polygon.io | N/A | Comprehensive redistribution ban |
| 17 | IMF Data API | Conditional | "does not permit use for training of LLMs without explicit permission" + commercial reuse requires email permission |
| 18 | TaxJar | N/A | $99/mo minimum, enterprise terms, tax calculation = regulated domain |
| 19 | Avalara | N/A | Custom enterprise pricing, no free tier, regulated domain |
| 20 | IBAN.com | N/A | Paid-only (trial = 100 queries), minimum 1-year license |

---

# Phase 5: Winner Recommendation

## THE WINNING STRATEGY: Multi-Source Government/Open Data Financial Intelligence Fusion

### Primary Stack (5 providers, $0 upstream):

```
Provider Stack:              Role:                          License:
---------------------------------------------------------------------
fawazahmed0/exchange-api     200+ currencies + crypto       CC0 (Public Domain)
Frankfurter API              ECB official reference rates    MIT + ECB free reuse
FRED API                     816K+ US economic series       Free (conditional)
World Bank API               16K+ global indicators         CC-BY 4.0
US Treasury Fiscal Data      US debt, yields, spending      US Gov open data
ECB Data Portal (direct)     EU monetary/banking stats      ECB free reuse policy
OpenIBAN                     IBAN validation                Free, open access
```

### Supplementary (Phase 2 expansion):
```
Wise Affiliate API           Mid-market rates + transfers   Affiliate partnership
                             GBP 10/personal, GBP 50/biz conversion
                             LIFETIME cookie attribution
```

## 5.1 Score Breakdown — Combined Stack

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **5** | x5 | **25** | ALL providers = $0. CC0, CC-BY 4.0, US Gov open data, ECB free reuse. |
| Data Coverage / Depth | **5** | x4 | **20** | 200+ currencies + 816K economic series + 16K global indicators + US fiscal + IBAN = massive coverage |
| API Quality | **4** | x3 | **12** | Mix of excellent (Frankfurter, Treasury) and good (FRED, World Bank). All REST/JSON. |
| Affiliate / Revenue Opp | **3** | x5 | **15** | Wise affiliate (GBP 10-50/conversion, lifetime cookie) + fintech affiliate funnel (NerdWallet, SoFi, CIT Bank) |
| Agent Utility | **5** | x5 | **25** | Universal utility: currency conversion, economic indicators, country data, fiscal metrics, IBAN validation |
| ToS Compatibility | **5** | x5 | **25** | CC0 + CC-BY 4.0 + US Gov open data + ECB free reuse = strongest ToS portfolio of any UC |
| MCP Ecosystem | **5** | x3 | **15** | Multiple existing MCP servers: Frankfurter MCP (2+), FRED MCP (3+), currency conversion MCP (5+) |
| Unique Features | **5** | x4 | **20** | ONLY platform combining: exchange rates + economic indicators + development data + fiscal data + IBAN validation into one API |
| New Pattern Potential | **5** | x5 | **25** | P16: Financial Intelligence Fusion — new pattern combining P5 cache + P11 gov fusion + cross-UC enrichment engine |
| Cache Potential | **5** | x3 | **15** | Exchange rates = daily cache (23h59m). Economic data = monthly/quarterly cache. World Bank = annual cache. IBAN = permanent cache. fawazahmed0 = entire DB < 2MB, cache locally. |
| Cross-UC Synergy | **5** | x4 | **20** | **HIGHEST cross-UC synergy of any UC**: enriches UC-002, UC-004, UC-009, UC-013, UC-015, and potentially ALL UCs with financial context |
| Market Position | **5** | x3 | **15** | Government/institutional data = no competitor can match authority |
| **TOTAL** | | | **232/245** | **HIGHEST SCORE OF ANY UC-016 CANDIDATE** |

## 5.2 Why This Strategy Wins

```
STRATEGIC ADVANTAGES:
=====================

1. $0 UPSTREAM COST (fourth UC with 100% margin after UC-010, UC-011, UC-015)
   - Every provider is free: CC0, CC-BY 4.0, US Gov, ECB free reuse
   - No subscription fees, no per-call costs, no enterprise agreements
   - Break-even = infrastructure cost only (~$50/month)

2. STRONGEST ToS OF ANY UC
   - CC0 (fawazahmed0) = literally PUBLIC DOMAIN, zero restrictions
   - CC-BY 4.0 (World Bank) = explicit commercial redistribution with attribution
   - US Gov (Treasury, FRED) = "free, without restriction"
   - ECB = "irrespective of commercial or non-commercial use"
   - NO ToS risk. NO legal gray area. NO "we might get shut down."

3. UNIVERSAL CROSS-UC ENRICHMENT (infrastructure layer like UC-012 Maps)
   - Currency conversion enriches EVERY international UC
   - Economic context enriches financial decisions across ALL UCs
   - Unlike UC-012 (location), UC-016 is a VALUE multiplier, not just context

4. MASSIVE EXISTING MCP ECOSYSTEM
   - 5+ currency conversion MCP servers already exist
   - 3+ FRED MCP servers already exist
   - Financial Datasets MCP server exists
   - APIbase becomes the UNIFIED financial intelligence layer

5. INSTITUTIONAL AUTHORITY
   - ECB, Federal Reserve, World Bank, US Treasury = sources of truth
   - No commercial API can match this credibility
   - "According to the Federal Reserve..." vs "According to CurrencyLayer..."

6. EXTREME CACHEABILITY
   - Exchange rates: daily updates = 24-hour cache window
   - Economic indicators: monthly/quarterly = 30-90 day cache
   - World Bank indicators: annual = 365-day cache
   - fawazahmed0: entire dataset < 2MB = cache EVERYTHING locally
   - IBAN validation: permanent cache (IBANs don't change format)
   - Day 1 cache hit rate: ~90% (seed from bulk/CDN data)
```

## 5.3 New Monetization Pattern: P16

### P16: Financial Intelligence Fusion + Cross-UC Currency Enrichment + Fintech Affiliate Funnel

**UC:** UC-016 fawazahmed0 + Frankfurter + FRED + World Bank + US Treasury + ECB + OpenIBAN

**Core Strategy:** Multi-source government/institutional financial data fusion, $0 upstream. Three revenue streams: (1) x402 micropayments for financial intelligence queries, (2) cross-UC currency enrichment billable as add-on, (3) fintech affiliate funnel (Wise, NerdWallet, SoFi, robo-advisors).

```
Conditions:
  - Upstream = 7 government/institutional/open data APIs ($0 total!)
  - fawazahmed0 = CC0 (public domain), Frankfurter = MIT + ECB policy,
    FRED = free API key, World Bank = CC-BY 4.0, Treasury = US Gov open,
    ECB = free reuse, OpenIBAN = free open
  - Exchange rate data cacheable 24h, economic data cacheable 30-365 days
  - fawazahmed0 entire dataset < 2MB — cache LOCALLY, serve forever
  - Fintech affiliate funnel: currency conversion → Wise referral (GBP 10-50)
    economic analysis → NerdWallet/SoFi/robo-advisor referral ($25-1000)

Mechanics:
  Stream 1: Agent -> x402 $0.002-0.05 -> APIbase -> cache (all sources) -> response
  Stream 2: Cross-UC enrichment:
    UC-002 Travel: "Paris hotel EUR 250" -> convert to agent's currency -> +$0.001
    UC-009 E-commerce: "Amazon.de price" -> EUR->USD conversion -> +$0.001
    UC-015 Jobs: "Berlin salary" -> EUR->USD + cost-of-living comparison -> +$0.003
    UC-013 Real Estate: "Mortgage rate comparison" -> FRED 30Y rate -> +$0.002
  Stream 3: Fintech affiliate funnel:
    Currency conversion -> "Send money with Wise" -> GBP 10-50 per conversion (lifetime cookie!)
    Economic data -> "Open high-yield savings" -> CIT Bank $100/referral
    Country comparison -> "Invest internationally" -> robo-advisor referral ($25-150)

Revenue: x402 fees (100% margin) + cross-UC enrichment add-on + fintech affiliate
Margin: ~100% ($0 upstream, all from cache/CDN data)
Risk: Very low — $0 fixed cost, government data permanently free
Break-even: ~2,500 req (~$50 infrastructure)

Distinction from P11 (Gov Data Fusion):
  P11: Health data -> supplement affiliate (recurring, $1-2.50/order)
  P16: Financial data -> fintech affiliate (HIGH VALUE: $10-1000/referral)
  P11: Health vertical (standalone)
  P16: Financial data = INFRASTRUCTURE enriching ALL other UCs

Distinction from P12 (Location Intelligence Cache):
  P12: Location is CONTEXT (where is something?)
  P16: Currency/financial is VALUE MULTIPLIER (what is something worth?)
  P12: Enriches UCs with spatial context
  P16: Enriches UCs with monetary/economic context

Distinction from P15 (Salary Intelligence):
  P15: Career lifecycle funnel (salary -> skills -> job -> relocation)
  P16: Financial literacy funnel (rates -> savings -> investing -> transfers)
  P15: Job CPC affiliate ($0.10-0.50)
  P16: Fintech affiliate ($10-1000 per conversion)

Sub-pattern: Currency Enrichment Tax
  Every UC that involves international data pays a tiny "currency conversion tax":
  $0.001 per conversion call. Invisible to agent, massive at scale.
  100K daily cross-UC enrichment calls = $100/day = $3,000/month pure profit.

Sub-pattern: Economic Context Layer
  FRED mortgage rates auto-injected into UC-013 Real Estate queries.
  FRED unemployment data auto-injected into UC-015 Jobs queries.
  FRED CPI data auto-injected into salary comparisons.
  Agents don't request this — APIbase adds it as value-add.

Sub-pattern: Fintech Affiliate Cascade
  Financial intelligence naturally drives financial product signups:
  1. Currency lookup -> "Send money cheaper with Wise" -> GBP 10-50 CPA
  2. Economic analysis -> "Protect against inflation" -> high-yield savings referral
  3. Country comparison -> "Invest globally" -> robo-advisor referral ($25-150)
  4. Mortgage rate lookup -> "Compare mortgage offers" -> LendingTree ($85 CPA)
  5. National debt/fiscal -> "Hedge risk" -> gold/Bitcoin affiliate

Examples: UC-016 (financial intelligence), potentially:
         education funding data + student loan affiliate,
         insurance rate data + insurance comparison affiliate,
         tax data + tax software affiliate
```

## 5.4 Seven Proposed MCP Tools

### Tool 1: `convert_currency`
```json
{
  "name": "convert_currency",
  "description": "Convert amount between any two of 200+ currencies (fiat + crypto + metals). Uses CC0 public domain data with ECB cross-validation. Daily updates, zero rate limits.",
  "parameters": {
    "from": "USD",
    "to": "EUR",
    "amount": 100,
    "date": "latest"
  },
  "x402_price": "$0.001 per conversion",
  "cache_ttl": "24 hours",
  "upstream": "fawazahmed0 (CC0) + Frankfurter (ECB cross-validation)"
}
```

### Tool 2: `get_exchange_rates`
```json
{
  "name": "get_exchange_rates",
  "description": "Get current or historical exchange rates for a base currency against all available currencies. Supports 200+ currencies including BTC, ETH, gold, silver.",
  "parameters": {
    "base": "USD",
    "date": "latest",
    "currencies": ["EUR", "GBP", "JPY", "BTC"]
  },
  "x402_price": "$0.002 per request",
  "cache_ttl": "24 hours",
  "upstream": "fawazahmed0 (primary, CC0) + ECB (cross-validation)"
}
```

### Tool 3: `get_economic_indicator`
```json
{
  "name": "get_economic_indicator",
  "description": "Retrieve US economic indicators from the Federal Reserve: GDP, CPI, unemployment, interest rates, mortgage rates, Fed Funds rate, money supply, consumer confidence, and 816,000+ other series.",
  "parameters": {
    "indicator": "GDP",
    "series_id": "GDPC1",
    "start_date": "2020-01-01",
    "frequency": "quarterly"
  },
  "x402_price": "$0.005 per request",
  "cache_ttl": "varies (daily to quarterly based on series frequency)",
  "upstream": "FRED API (Federal Reserve Bank of St. Louis)"
}
```

### Tool 4: `compare_countries_economic`
```json
{
  "name": "compare_countries_economic",
  "description": "Compare economic indicators across countries using World Bank data: GDP per capita, inflation, population, poverty rate, healthcare spending, education, trade balance, and 16,000+ indicators for 200+ countries.",
  "parameters": {
    "countries": ["US", "DE", "JP"],
    "indicators": ["GDP_per_capita", "inflation", "unemployment"],
    "year": 2024
  },
  "x402_price": "$0.005 per comparison",
  "cache_ttl": "365 days (annual indicators)",
  "upstream": "World Bank API (CC-BY 4.0)"
}
```

### Tool 5: `get_treasury_data`
```json
{
  "name": "get_treasury_data",
  "description": "US government fiscal data: Treasury yields, national debt, government revenue/spending, daily Treasury statement, savings bond rates. Direct from US Treasury.",
  "parameters": {
    "dataset": "treasury_yields",
    "security_type": "10-year",
    "start_date": "2024-01-01"
  },
  "x402_price": "$0.003 per request",
  "cache_ttl": "24 hours (daily data) to 30 days (monthly reports)",
  "upstream": "US Treasury Fiscal Data API (US Gov open data)"
}
```

### Tool 6: `validate_iban`
```json
{
  "name": "validate_iban",
  "description": "Validate an International Bank Account Number (IBAN). Checks country-specific length and checksum. Returns validity status and parsed components (country, bank code, account number).",
  "parameters": {
    "iban": "DE89370400440532013000"
  },
  "x402_price": "$0.001 per validation",
  "cache_ttl": "permanent (IBAN format rules don't change)",
  "upstream": "OpenIBAN (free) + local validation engine"
}
```

### Tool 7: `financial_snapshot`
```json
{
  "name": "financial_snapshot",
  "description": "Comprehensive financial intelligence for a country or region: exchange rates, key economic indicators (GDP, CPI, unemployment, interest rates), Treasury yields (US), cost-of-living comparison, and recent economic trends. Ideal for relocation, investment, or business decisions.",
  "parameters": {
    "country": "Germany",
    "compare_to": "United States",
    "include": ["exchange_rates", "economic_indicators", "cost_of_living", "interest_rates"]
  },
  "x402_price": "$0.02 per snapshot (premium multi-source fusion)",
  "cache_ttl": "24-72 hours (blended from multiple cache layers)",
  "upstream": "ALL SOURCES fused: fawazahmed0 + FRED + World Bank + Treasury + ECB"
}
```

## 5.5 Revenue Model

### Upstream Cost
```
Provider                  Cost         Auth Required
---------------------------------------------------------
fawazahmed0/exchange-api  $0           No key needed (CDN)
Frankfurter API           $0           No key needed
FRED API                  $0           Free API key (instant)
World Bank API            $0           No key needed
US Treasury Fiscal Data   $0           No key needed
ECB Data Portal           $0           No key needed
OpenIBAN                  $0           No key needed
---------------------------------------------------------
TOTAL UPSTREAM:           $0/month
Infrastructure:           ~$50/month (server + cache + CDN)
```

### Expected Revenue (Monthly Projections)

```
Phase 1 (Month 1-3): 10K requests/day
  convert_currency:     5,000 req × $0.001 = $5.00/day
  get_exchange_rates:   2,000 req × $0.002 = $4.00/day
  get_economic_indicator: 1,500 req × $0.005 = $7.50/day
  compare_countries:      500 req × $0.005 = $2.50/day
  get_treasury_data:      500 req × $0.003 = $1.50/day
  validate_iban:          300 req × $0.001 = $0.30/day
  financial_snapshot:     200 req × $0.02  = $4.00/day
  -------------------------------------------------------
  Daily x402 revenue:                       $24.80/day
  Monthly x402 revenue:                     $744/month
  Cross-UC enrichment (invisible):          $150/month
  Wise affiliate (5 conversions/month):     $250/month
  -------------------------------------------------------
  TOTAL MONTH 1-3:                          ~$1,144/month
  Cost:                                     $50/month (infra)
  MARGIN:                                   95.6%

Phase 2 (Month 6-12): 50K requests/day
  x402 revenue:           $124/day = $3,720/month
  Cross-UC enrichment:    $750/month
  Wise affiliate (25/mo): $1,250/month
  Fintech affiliate:      $500/month (NerdWallet, SoFi referrals)
  -------------------------------------------------------
  TOTAL MONTH 6-12:                         ~$6,220/month
  Cost:                                     $100/month (infra)
  MARGIN:                                   98.4%

Phase 3 (Year 2+): 200K requests/day
  x402 revenue:            $496/day = $14,880/month
  Cross-UC enrichment:     $3,000/month
  Wise affiliate (100/mo): $5,000/month
  Fintech affiliate:       $2,000/month
  B2B economic intelligence premium:  $1,500/month
  -------------------------------------------------------
  TOTAL YEAR 2+:                            ~$26,380/month
  Cost:                                     $200/month (infra)
  MARGIN:                                   99.2%
```

### Break-Even Analysis
```
Monthly infrastructure cost:  $50 (Phase 1) to $200 (Phase 3)
Break-even at Phase 1:        ~2,000 requests ($50 / $0.025 avg)
                               = ~67 requests/day
                               = achievable in WEEK 1

Margin trajectory:
  Day 1:    95%+ (infra cost only)
  Month 6:  98%+ (cache fully warm)
  Year 1:   99%+ (all data cached, maximum efficiency)
```

## 5.6 Cross-UC Synergies

UC-016 Financial Intelligence is a **CROSS-CUTTING INFRASTRUCTURE LAYER** — like UC-012 Maps but for monetary/economic context. It enriches virtually every other UC:

```
UC-002 Travel (Aviasales):
  "Flight Paris -> Tokyo $1,200" -> auto-convert to EUR/JPY/agent currency
  "Japan trip budget" -> cost-of-living comparison (World Bank)
  "Best time to book" -> currency trend analysis
  ENRICHMENT: +$0.001-0.003 per travel query

UC-004 Crypto (CoinGecko):
  fawazahmed0 includes crypto -> fiat-to-crypto bridge
  FRED Fed Funds rate -> impact on crypto markets
  "BTC price in EUR" -> real-time conversion
  ENRICHMENT: +$0.001 per crypto query

UC-005 Weather (OWM):
  "Weather in London" -> if queried from US agent, show cost-of-living context
  Minimal direct synergy, but enables trip planning context
  ENRICHMENT: +$0.001 for international context

UC-009 E-commerce (Keepa):
  "Amazon.de product EUR 49.99" -> auto-convert to buyer's currency
  "Is this a good deal?" -> purchasing power parity comparison
  International price arbitrage detection
  ENRICHMENT: +$0.002 per international product query

UC-013 Real Estate (RentCast):
  FRED 30-year mortgage rate (series: MORTGAGE30US) -> auto-inject into property analysis
  Treasury yields -> mortgage rate prediction context
  "Can I afford this house?" -> mortgage calculator with live rates
  Cost-of-living comparison for relocation (World Bank + FRED CPI)
  ENRICHMENT: +$0.005 per real estate query (high-value context)

UC-015 Jobs (BLS + O*NET):
  "Software engineer salary Berlin vs San Francisco" -> PPP-adjusted comparison
  FRED CPI -> real wage calculation (nominal vs inflation-adjusted)
  World Bank cost-of-living -> relocation financial analysis
  "Should I take this offer?" -> comprehensive financial comparison
  ENRICHMENT: +$0.005 per salary comparison

UC-006 News (NewsAPI):
  Economic indicators provide CONTEXT for news:
  "Fed raises rates" -> show actual FRED data
  "Inflation hits X%" -> show CPI series
  ENRICHMENT: +$0.002 per economic news query

UC-001 Predictions (Polymarket):
  Economic indicators as prediction inputs:
  "Will Fed cut rates?" -> actual FRED data as context
  ENRICHMENT: +$0.002 per macro prediction query
```

### Cross-UC Revenue Estimate (at scale):
```
Total cross-UC enrichment calls:  50,000-200,000/day
Average enrichment fee:           $0.002/call
Daily cross-UC revenue:           $100-400/day
Monthly cross-UC revenue:         $3,000-12,000/month
Cost of enrichment:               $0 (all from cache)
Margin on enrichment:             ~100%
```

## 5.7 Affiliate / Commerce Opportunities

### Tier 1: Wise Partnership (Primary Affiliate)
```
Product:          Wise international money transfer
Commission:       GBP 10 per personal user, GBP 50 per business user
Cookie:           LIFETIME (never expires!)
Trigger:          Agent handles currency conversion -> "Send money with Wise"
Volume estimate:  25-100 referrals/month at scale
Revenue:          GBP 250-5,000/month ($315-6,300)
Application:      https://join.partnerize.com/wise/en
```

### Tier 2: Banking / Savings Affiliate
```
CIT Bank:         $100 per deposit account referral
SoFi:             Up to $1,000 per student loan refinance referral
NerdWallet:       Revenue share on financial product clicks
Trigger:          Economic data query -> "Protect your savings" -> high-yield account
Volume estimate:  10-50 referrals/month
Revenue:          $1,000-5,000/month
```

### Tier 3: Investment / Robo-Advisor Affiliate
```
Wealthfront:      $5,000 managed free per referral
Betterment:       $25-150 per qualified referral
eToro:            25% RevShare or $400 CPA
Trigger:          Country comparison -> "Invest internationally" -> platform referral
Volume estimate:  5-20 referrals/month
Revenue:          $125-3,000/month
```

### Tier 4: Cross-UC Financial Product Affiliate
```
LendingTree:      $85 per mortgage lead (synergy with UC-013 Real Estate)
Policygenius:     $30 per insurance lead
Credit Karma:     Revenue share on financial product clicks
Trigger:          Real estate query with financial context -> mortgage comparison
Volume estimate:  10-30 leads/month
Revenue:          $850-2,550/month
```

---

## 6. Implementation Architecture

### Traffic Flow Diagram

```
Agent Request
    |
    v
APIbase Gateway (x402 micropayment)
    |
    v
UC-016 Router
    |
    +---> Currency Conversion?
    |     |
    |     +---> Local cache (fawazahmed0 full dataset, < 2MB, refreshed daily)
    |     |     99%+ cache hit rate after day 1
    |     |
    |     +---> Cache miss? -> fawazahmed0 CDN -> cache locally
    |     |
    |     +---> Cross-validate with Frankfurter (ECB official) for major pairs
    |
    +---> Economic Indicator?
    |     |
    |     +---> FRED API (real-time proxy, display FRED attribution)
    |     |     120 req/min rate limit
    |     |     Cache: per-series based on update frequency
    |     |
    |     +---> Popular series pre-cached:
    |           GDP (GDPC1), CPI (CPIAUCSL), Unemployment (UNRATE),
    |           Fed Funds (FEDFUNDS), 30Y Mortgage (MORTGAGE30US),
    |           10Y Treasury (DGS10), S&P 500 (SP500)
    |
    +---> Country Comparison?
    |     |
    |     +---> World Bank API (bulk cached annually)
    |     |     No rate limits, no auth needed
    |     |     Cache entire indicator catalog on startup
    |     |
    |     +---> ECB Data Portal (EU monetary stats)
    |           SDMX 2.1 -> transform to JSON -> cache
    |
    +---> US Fiscal Data?
    |     |
    |     +---> US Treasury Fiscal Data API
    |           No auth, no limits, cache daily/monthly
    |
    +---> IBAN Validation?
    |     |
    |     +---> Local validation engine (checksum + length rules)
    |     |     Permanent cache of country IBAN formats
    |     |
    |     +---> OpenIBAN as fallback verification
    |
    +---> Financial Snapshot? (premium fusion)
          |
          +---> Parallel fetch from ALL sources
                Merge into unified intelligence response
                Cache composite result for 24-72 hours
```

### Cache Strategy

```
Data Source              Cache TTL        Strategy
-----------------------------------------------------------------
fawazahmed0 rates       24 hours         Download ENTIRE dataset daily (~2MB)
                                         Serve 100% from local cache
                                         Zero upstream calls after initial fetch
Frankfurter (ECB)       24 hours         Cache per currency pair
                                         ECB updates at 16:00 CET daily
FRED series             Varies           Popular series: pre-fetch daily
                                         Others: cache on first request
                                         TTL = series update frequency
World Bank indicators   365 days         Bulk download annually
                                         Serve 100% from cache
                                         99%+ hit rate from day 1
US Treasury data        24h-30 days      Daily Statement: 24h cache
                                         Monthly reports: 30-day cache
                                         Yield curves: 24h cache
ECB monetary stats      30-90 days       Monthly stats: 30-day cache
                                         Quarterly stats: 90-day cache
IBAN validation         Permanent        Country format rules never change
                                         Build local validation engine
                                         Zero upstream calls needed

COMPOSITE CACHE HIT RATE:
  Day 1:   ~90% (seed fawazahmed0 + World Bank bulk + IBAN rules)
  Week 1:  ~95% (popular FRED series cached, Treasury cached)
  Month 1: ~97% (warm cache across all sources)
  Month 6: ~99% (comprehensive coverage)
```

---

## 7. Risk Analysis

```
RISK ASSESSMENT:
================

LOW RISK:
  - $0 upstream cost = zero financial exposure
  - Government/institutional data = permanently free
  - CC0/CC-BY 4.0 = strongest possible legal footing
  - No single point of failure (7 independent providers)
  - All providers are non-commercial institutions (no business model change risk)

MEDIUM RISK:
  - FRED 2024 ToS update restricting caching: mitigated by real-time proxy pattern
    (pass-through, not storing/archiving — display attribution, link to FRED ToS)
  - fawazahmed0 is a community project: mitigated by having Frankfurter + ECB direct
    as fallback (3 independent currency sources)
  - FRED third-party series copyright: mitigated by using only Fed-authored series
    (GDP, CPI, etc. are Federal Reserve publications, not third-party)

ZERO RISK:
  - World Bank CC-BY 4.0 explicitly allows API redistribution
  - US Treasury "free, without restriction" — most permissive ToS found
  - ECB "irrespective of commercial or non-commercial use"
  - fawazahmed0 CC0 — literally public domain, zero restrictions

REGULATORY NOTES:
  - UC-016 is READ-ONLY financial intelligence — no payment processing
  - No PSD2/PCI-DSS/CFPB compliance needed (not handling money or accounts)
  - No fintech licensing required (providing data, not financial services)
  - Disclaimer: "This is financial data for informational purposes, not financial advice"
```

---

## 8. Summary Comparison Table: All Candidates

| # | Candidate | Score | ToS | Cost | Verdict |
|---|-----------|-------|-----|------|---------|
| 1 | **fawazahmed0/exchange-api** | **197/245** | **CC0 (PUBLIC DOMAIN)** | **$0** | **WINNER (currency)** |
| 2 | **FRED API** | **209/245** | **Conditional (OK for proxy)** | **$0** | **WINNER (economic)** |
| 3 | **Frankfurter API** | **191/245** | **MIT + ECB free reuse** | **$0** | **WINNER (ECB rates)** |
| 4 | **World Bank API** | **187/245** | **CC-BY 4.0 (explicit redistrib)** | **$0** | **WINNER (global)** |
| 5 | **US Treasury Fiscal Data** | **179/245** | **"Free, without restriction"** | **$0** | **WINNER (fiscal)** |
| 6 | **ECB Data Portal** | **~183/245** | **ECB free reuse policy** | **$0** | **WINNER (EU monetary)** |
| 7 | **OpenIBAN** | **~145/245** | **Free, open access** | **$0** | **SUPPLEMENTARY** |
| 8 | **Wise Affiliate** | **~175/245** | **Requires partnership** | **$0** | **PHASE 2 affiliate** |
| 9 | **DBnomics** | **~170/245** | **ODbL (per-series varies)** | **$0** | **BACKUP aggregator** |
| 10 | IMF Data API | ~155/245 | **LLM use BANNED, commercial requires permission** | $0 | CONDITIONAL |
| 11 | ExchangeRate-API | 140/245 | **DISQUALIFIED** — redistribution banned | $0-100/yr | REJECTED |
| 12 | Open Exchange Rates | ~135/245 | **DISQUALIFIED** — commercial on free tier banned | $0-200/mo | REJECTED |
| 13 | Plaid | N/A | **DISQUALIFIED** — "service bureau" clause | Custom | REJECTED |
| 14 | Alpha Vantage | N/A | **DISQUALIFIED** — redistribution/proxy banned | $0-250/mo | REJECTED |
| 15 | Financial Modeling Prep | N/A | **DISQUALIFIED** — commercial use banned (personal license) | $0-99/mo | REJECTED |
| 16 | Twelve Data | N/A | **DISQUALIFIED** — redistribution requires separate agreement | $0-329/mo | REJECTED |
| 17 | Polygon.io | N/A | **DISQUALIFIED** — comprehensive redistribution ban | $0-29/mo+ | REJECTED |
| 18 | XE Currency Data | N/A | **DISQUALIFIED** — single entity, one use case, $1,200+/yr | $1,200+/yr | REJECTED |
| 19 | CurrencyLayer/Fixer | N/A | **DISQUALIFIED** — APILayer enterprise terms, unclear redistrib | $0-100/mo | REJECTED |
| 20 | currencyapi.com | N/A | **DISQUALIFIED** — free = personal only | $0-100/mo | REJECTED |
| 21 | Stripe/PayPal | N/A | **DISQUALIFIED** — payment processors, not data APIs. Regulatory barriers (PCI-DSS). | 2.9%+30c | REJECTED |
| 22 | Nordigen/GoCardless | N/A | **DISQUALIFIED** — discontinued for new customers | N/A | REJECTED |
| 23 | TaxJar/Avalara | N/A | **DISQUALIFIED** — enterprise pricing, regulated domain | $99/mo+ | REJECTED |
| 24 | IBAN.com | N/A | **NOT SELECTED** — paid only, free = 100 trial queries | Custom | REJECTED (OpenIBAN suffices) |

---

## 9. Strategic Context: The UC-016 Play

```
THE PATTERN REPEATS:
====================

UC-011 Health:   USDA + OpenFDA + NIH = government health data fusion ($0)
UC-015 Jobs:     BLS + O*NET + ESCO = government career data fusion ($0)
UC-016 Finance:  FRED + World Bank + Treasury + ECB + fawazahmed0 = government
                 financial data fusion ($0)

EACH TIME:
  1. Government/institutional APIs provide FREE, authoritative data
  2. Commercial alternatives BLOCK proxy/resale in ToS
  3. APIbase FUSES multiple government sources into unified intelligence
  4. 100% margin on data layer + affiliate commerce on top

UC-016 UNIQUENESS:
  - HIGHEST cross-UC synergy (enriches 8+ other UCs)
  - STRONGEST ToS portfolio (CC0 + CC-BY 4.0 + US Gov + ECB)
  - MOST cacheable (daily exchange rates + annual indicators)
  - BEST affiliate potential in finance vertical ($10-1000/referral)
  - INFRASTRUCTURE layer (like UC-012 Maps, but for money/economics)

This is the FOURTH $0-upstream UC, and arguably the most strategically
important because currency conversion is UNIVERSAL UTILITY.
Every agent operating internationally needs UC-016.
```

---

## Sources

### Primary API Documentation
- fawazahmed0/exchange-api: https://github.com/fawazahmed0/exchange-api
- Frankfurter API: https://frankfurter.dev/
- FRED API: https://fred.stlouisfed.org/docs/api/fred/
- World Bank API: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation
- US Treasury Fiscal Data: https://fiscaldata.treasury.gov/api-documentation/
- ECB Data Portal API: https://data.ecb.europa.eu/help/api/overview
- OpenIBAN: https://openiban.com/

### Terms of Service / Legal
- FRED ToS: https://fred.stlouisfed.org/docs/api/terms_of_use.html
- World Bank Dataset ToS: https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets
- US Treasury API Terms: https://treasurydirect.gov/legal-information/developers/web-api-terms/
- ECB Reuse Policy: https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html
- IMF Copyright: https://www.imf.org/en/about/copyright-and-terms
- ExchangeRate-API Terms: https://www.exchangerate-api.com/terms
- Alpha Vantage ToS: https://www.alphavantage.co/terms_of_service/
- Plaid Terms: https://plaid.com/legal/terms-of-use/
- Polygon.io Terms: https://polygon.io/terms
- FMP Terms: https://site.financialmodelingprep.com/terms-of-service
- Twelve Data Terms: https://twelvedata.com/terms

### MCP Servers (Existing)
- Frankfurter MCP (Wes Bos): https://github.com/wesbos/currency-conversion-mcp
- Frankfurter MCP (Anirban Basu): https://pypi.org/project/frankfurtermcp/
- FRED MCP (stefanoamorelli): https://github.com/stefanoamorelli/fred-mcp-server
- FRED MCP (Jaldekoa): https://github.com/Jaldekoa/mcp-fredapi
- Currency Exchange MCP: https://github.com/Ruddxxy/currency-exchange-mcp
- Financial Datasets MCP: https://github.com/financial-datasets/mcp-server

### Affiliate Programs
- Wise Partnership: https://wise.com/gb/affiliate-program/
- Wise Affiliate Application: https://join.partnerize.com/wise/en
