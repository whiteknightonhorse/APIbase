# UC-019: Shippo + Geocodio + USITC HTS + GeoNames + UN Comtrade (Logistics / Shipping / Tracking / Delivery Intelligence)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-019 |
| **Provider** | Shippo Platform API (white-label, 85+ carriers) + Geocodio (US/CA address validation + enrichment) + USITC HTS API (US Public Domain, tariff codes) + GeoNames (CC-BY 4.0, postal codes 100+ countries) + UN Comtrade (Premium Pro, international trade statistics) |
| **Category** | Logistics / Shipping / Tracking / Delivery Intelligence |
| **Date Added** | 2026-03-07 |
| **Status** | Reference |
| **Client** | APIbase (platform-level integration) |

---

## RESEARCH REPORT: UC-019 Logistics / Shipping / Tracking / Delivery Intelligence

---

# Phase 1: Comprehensive Candidate Discovery (31 Candidates Evaluated)

## 1.1 Package Tracking APIs

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 1 | **AfterShip** | 50 shipments/mo | $11-239/mo | 1,200+ carriers, webhooks |
| 2 | **17Track** | Limited free | $9-299/mo | 2,600+ carriers, global |
| 3 | **TrackingMore** | 100 trackings/mo | $11-499/mo | 1,300+ carriers |
| 4 | **Ship24** | 100 trackings/mo | $20-200/mo | Global tracking |
| 5 | **Tracktry** | 100 trackings/mo | $9-99/mo | 600+ carriers |

## 1.2 Shipping Rate/Label APIs

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 6 | **EasyPost** | Free dev plan | $0.05/label | Multi-carrier, 100+ carriers |
| 7 | **Shippo** | Free plan | $0.05/label | Platform API, white-label, MCP server |
| 8 | **ShipEngine** | 500 labels/mo free | $0.05/label | Auctane platform |
| 9 | **Stamps.com/Endicia** | Paid monthly | $17.99/mo+ | USPS-focused |

## 1.3 Carrier APIs (Direct)

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 10 | **USPS API** (new portal) | Free | $0 | US Postal Service official |
| 11 | **UPS API** | Free developer kit | $0 | UPS Developer Kit |
| 12 | **FedEx API** | Free developer portal | $0 | FedEx Compatible program |
| 13 | **DHL API** | Free developer portal | $0 | DHL Group services |
| 14 | **Royal Mail API** | Developer portal | £ varies | UK postal service |
| 15 | **Canada Post API** | Free developer keys | $0 | Canadian postal service |
| 16 | **Australia Post API** | Developer portal | AUD varies | Australian postal service |
| 17 | **Deutsche Post API** | Via DHL Group | $0 | German postal (= DHL) |

## 1.4 Postal/Address Validation APIs

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 18 | **Smarty (SmartyStreets)** | 250/mo free | $24.50-750/mo | US/intl address validation |
| 19 | **Lob** | 300 verifications/mo | $0.055/verification | Address + direct mail |
| 20 | **Geocodio** | 2,500/day free | $1/1K lookups | US/CA geocoding + data appends |
| 21 | **Loqate (GBG)** | 100/day trial | Enterprise pricing | Global address verification |
| 22 | **What3Words** | Free tier | API licence | 3-word address system |

## 1.5 Freight/Logistics Platforms

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 23 | **Freightos** | FBX indexes public | API subscription | International freight rates |
| 24 | **project44** | Enterprise only | $100-500/user/mo | Supply chain visibility |
| 25 | **FourKites** | Enterprise only | $100-500/user/mo | Supply chain visibility |

## 1.6 Open Postal/Geographic Data

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 26 | **GeoNames** | 10K credits/day | Premium ~$100/mo | CC-BY 4.0, 100+ countries postal codes |
| 27 | **OpenAddresses** | CC0/ODbL bulk | $0 (self-hosted) | Open address data aggregator |

## 1.7 Customs/Trade Data

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 28 | **USITC HTS API** | Free (US Gov) | $0 | US tariff schedule, public domain |
| 29 | **UN Comtrade API** | 500 calls/day | Premium Pro ~$50/mo | International trade stats, 200+ countries |
| 30 | **HS Ping** | Free daily quota | Paid plans | Multi-country HS code lookup |
| 31 | **WITS (World Bank)** | Free | $0 | Trade/tariff data, CC-BY 4.0 |

---

# Phase 2: Scoring Table (12-Parameter Matrix, Max = 245)

**Scoring Key:** Each parameter scored 1-5, multiplied by weight. Parameters: Free/Price (×5), Coverage (×4), API Quality (×3), Affiliate (×5), Agent Utility (×5), ToS Compatibility (×5), MCP Ecosystem (×3), Unique Features (×4), New Pattern Potential (×5), Cache Potential (×3), Cross-UC Synergy (×4), Market Position (×3).

| # | Candidate | Free (×5) | Cover (×4) | API (×3) | Affil (×5) | Agent (×5) | ToS (×5) | MCP (×3) | Unique (×4) | Pattern (×5) | Cache (×3) | X-UC (×4) | Market (×3) | **TOTAL** |
|---|-----------|-----------|------------|----------|------------|------------|----------|----------|-------------|--------------|------------|-----------|-------------|-----------|
| 1 | AfterShip | 2(10) | 5(20) | 5(15) | 2(10) | 5(25) | 1(5) | 2(6) | 4(16) | 4(20) | 3(9) | 4(16) | 5(15) | **167** |
| 2 | 17Track | 3(15) | 5(20) | 4(12) | 1(5) | 5(25) | 1(5) | 3(9) | 3(12) | 3(15) | 3(9) | 3(12) | 4(12) | **151** |
| 3 | TrackingMore | 3(15) | 4(16) | 4(12) | 1(5) | 4(20) | 1(5) | 1(3) | 2(8) | 3(15) | 3(9) | 3(12) | 3(9) | **129** |
| 4 | Ship24 | 3(15) | 4(16) | 4(12) | 1(5) | 4(20) | 2(10) | 1(3) | 2(8) | 3(15) | 3(9) | 3(12) | 3(9) | **134** |
| 5 | Tracktry | 3(15) | 3(12) | 3(9) | 1(5) | 3(15) | 2(10) | 1(3) | 1(4) | 2(10) | 3(9) | 2(8) | 2(6) | **106** |
| 6 | EasyPost | 3(15) | 5(20) | 5(15) | 3(15) | 5(25) | 1(5) | 3(9) | 4(16) | 4(20) | 2(6) | 4(16) | 5(15) | **177** |
| **7** | **Shippo** | **4(20)** | **5(20)** | **5(15)** | **4(20)** | **5(25)** | **3(15)** | **5(15)** | **5(20)** | **5(25)** | **2(6)** | **5(20)** | **5(15)** | **216** |
| 8 | ShipEngine | 3(15) | 5(20) | 5(15) | 3(15) | 5(25) | 1(5) | 2(6) | 3(12) | 3(15) | 2(6) | 4(16) | 4(12) | **162** |
| 9 | Stamps.com | 2(10) | 3(12) | 3(9) | 1(5) | 3(15) | 1(5) | 1(3) | 2(8) | 2(10) | 2(6) | 2(8) | 3(9) | **100** |
| 10 | USPS API | 5(25) | 4(16) | 4(12) | 1(5) | 4(20) | 2(10) | 1(3) | 3(12) | 3(15) | 3(9) | 4(16) | 5(15) | **158** |
| 11 | UPS API | 4(20) | 4(16) | 4(12) | 1(5) | 4(20) | 1(5) | 3(9) | 3(12) | 3(15) | 2(6) | 3(12) | 5(15) | **147** |
| 12 | FedEx API | 4(20) | 4(16) | 4(12) | 1(5) | 4(20) | 1(5) | 1(3) | 3(12) | 3(15) | 2(6) | 3(12) | 5(15) | **141** |
| 13 | DHL API | 5(25) | 4(16) | 4(12) | 1(5) | 4(20) | 1(5) | 1(3) | 3(12) | 3(15) | 2(6) | 3(12) | 5(15) | **146** |
| 14 | Royal Mail | 3(15) | 2(8) | 3(9) | 1(5) | 2(10) | 1(5) | 1(3) | 2(8) | 2(10) | 2(6) | 2(8) | 3(9) | **96** |
| 15 | Canada Post | 4(20) | 2(8) | 3(9) | 1(5) | 2(10) | 1(5) | 1(3) | 2(8) | 2(10) | 2(6) | 2(8) | 3(9) | **101** |
| 16 | Australia Post | 3(15) | 2(8) | 3(9) | 1(5) | 2(10) | 1(5) | 1(3) | 2(8) | 2(10) | 2(6) | 2(8) | 3(9) | **96** |
| 17 | Deutsche Post | 4(20) | 3(12) | 4(12) | 1(5) | 3(15) | 1(5) | 1(3) | 2(8) | 2(10) | 2(6) | 2(8) | 4(12) | **116** |
| 18 | Smarty | 2(10) | 4(16) | 5(15) | 1(5) | 4(20) | 1(5) | 1(3) | 3(12) | 3(15) | 3(9) | 4(16) | 4(12) | **138** |
| 19 | Lob | 2(10) | 3(12) | 4(12) | 1(5) | 3(15) | 1(5) | 1(3) | 3(12) | 2(10) | 2(6) | 3(12) | 3(9) | **111** |
| **20** | **Geocodio** | **4(20)** | **4(16)** | **5(15)** | **1(5)** | **5(25)** | **4(20)** | **4(12)** | **5(20)** | **4(20)** | **5(15)** | **5(20)** | **3(9)** | **197** |
| 21 | Loqate | 2(10) | 4(16) | 4(12) | 1(5) | 3(15) | 1(5) | 1(3) | 3(12) | 2(10) | 2(6) | 3(12) | 4(12) | **118** |
| 22 | What3Words | 3(15) | 2(8) | 4(12) | 1(5) | 3(15) | 1(5) | 1(3) | 5(20) | 2(10) | 1(3) | 2(8) | 3(9) | **113** |
| 23 | Freightos | 3(15) | 4(16) | 3(9) | 1(5) | 4(20) | 2(10) | 1(3) | 5(20) | 4(20) | 3(9) | 3(12) | 4(12) | **151** |
| 24 | project44 | 1(5) | 5(20) | 4(12) | 1(5) | 4(20) | 1(5) | 1(3) | 4(16) | 3(15) | 1(3) | 2(8) | 5(15) | **127** |
| 25 | FourKites | 1(5) | 5(20) | 4(12) | 1(5) | 3(15) | 1(5) | 1(3) | 3(12) | 2(10) | 1(3) | 2(8) | 4(12) | **110** |
| **26** | **GeoNames** | **5(25)** | **4(16)** | **4(12)** | **1(5)** | **4(20)** | **5(25)** | **1(3)** | **4(16)** | **4(20)** | **5(15)** | **5(20)** | **4(12)** | **189** |
| 27 | OpenAddresses | 5(25) | 3(12) | 2(6) | 1(5) | 3(15) | 4(20) | 1(3) | 3(12) | 3(15) | 5(15) | 3(12) | 2(6) | **146** |
| **28** | **USITC HTS** | **5(25)** | **4(16)** | **3(9)** | **1(5)** | **4(20)** | **5(25)** | **1(3)** | **5(20)** | **5(25)** | **5(15)** | **4(16)** | **4(12)** | **191** |
| **29** | **UN Comtrade** | **4(20)** | **5(20)** | **3(9)** | **1(5)** | **4(20)** | **3(15)** | **1(3)** | **4(16)** | **4(20)** | **4(12)** | **4(16)** | **5(15)** | **171** |
| 30 | HS Ping | 4(20) | 3(12) | 4(12) | 1(5) | 4(20) | 4(20) | 1(3) | 4(16) | 4(20) | 4(12) | 3(12) | 2(6) | **158** |
| 31 | WITS | 5(25) | 4(16) | 3(9) | 1(5) | 3(15) | 4(20) | 1(3) | 3(12) | 3(15) | 4(12) | 4(16) | 4(12) | **160** |

### Top 11 by Score

| Rank | Candidate | Score | Category |
|------|-----------|-------|----------|
| 1 | **Shippo** | **216** | Shipping Rates/Labels/Tracking |
| 2 | **Geocodio** | **197** | Address Validation/Geocoding |
| 3 | **USITC HTS API** | **191** | Customs/Tariff (US Gov) |
| 4 | **GeoNames** | **189** | Open Postal Data (CC-BY 4.0) |
| 5 | EasyPost | 177 | Shipping API |
| 6 | **UN Comtrade** | **171** | International Trade Statistics |
| 7 | AfterShip | 167 | Package Tracking |
| 8 | ShipEngine | 162 | Shipping API |
| 9 | WITS | 160 | Trade/Tariff Data |
| 10 | USPS API | 158 | Carrier (Gov) |
| 10 | HS Ping | 158 | HS Code API |

---

# Phase 3: Terms of Service Deep Dive

## 3.1 WINNER: Shippo (Score: 216) — CONDITIONAL (Platform Partner Agreement)

**ToS Sources:** [Shippo Terms](https://goshippo.com/terms), [Platform API Docs](https://docs.goshippo.com/docs/oauth_integrations/whitelabelintegration/), [Shippo for Platforms](https://goshippo.com/shippo-for-platforms)

**CRITICAL DISTINCTION:** While standard Terms of Use contain boilerplate anti-resale language, Shippo has a **dedicated Platform API with White Label integration** explicitly designed for resale/proxy use:

- *"You are responsible for billing and charging your customers, which allows you to completely customize the user experience"*
- Partners can markup shipping rates: *"a 10% markup of any shipping rate returned by Shippo, or a flat $0.50 markup per label"*
- Managed Accounts are *"opaque to your end customers, meaning they don't need to create their own Shippo login or have a billing relationship with Shippo"*
- Shippo has an **official MCP Server** and actively courts platform/reseller partners
- Affiliate program: **$5-$150 per referral**
- Contact: partnerships@goshippo.com for formal agreement

**Verdict:** The Platform API IS the proxy permission mechanism. Architecturally designed for exactly our use case. Requires formal partnership agreement.

## 3.2 WINNER: Geocodio (Score: 197) — CONDITIONAL (Bundled Resale OK)

**ToS Source:** [Geocodio Terms of Use](https://www.geocod.io/terms-of-use/)

**Prohibitions:**
- *"shall not: use the System for service bureau or time-sharing purposes or in any other way allow third parties to exploit the System"*

**Permissions (from marketing/comparison pages):**
- *"Geocodio results can be resold provided they are bundled as part of your broader services and not as a stand-alone"*
- *"Data from Geocodio can be cached and/or permanently stored without restrictions"*
- *"There are no restrictions on commercial use for the free tier"*
- *"you can store the results in a database, put them in your CRM, use them on any type of map, and even resell them if you want"*

**Verdict:** Resale of OUTPUT DATA is explicitly allowed when bundled as part of broader services. APIbase provides enriched logistics intelligence (multi-source, cached, aggregated) — NOT standalone Geocodio passthrough.

## 3.3 WINNER: USITC HTS API (Score: 191) — CLEARED (US Public Domain)

**Source:** [USITC Data](https://www.usitc.gov/data/index.htm), [HTS Search](https://hts.usitc.gov/)

- USITC is a **US Federal Government agency**
- Data on data.gov under **US Public Domain (us-pd)** license
- Per 17 U.S.C. §105: government works not subject to domestic copyright
- Federal Open Data Policy: *"no restrictions on copying, publishing, distributing, transmitting, adapting, or otherwise using the information for non-commercial or for commercial purposes"*
- REST API returns JSON, up to 100 results/query

**Verdict:** Fully unrestricted. Government data escape hatch (proven in UC-011, UC-013, UC-015, UC-016, UC-017).

## 3.4 WINNER: GeoNames (Score: 189) — CLEARED (CC-BY 4.0)

**Source:** [GeoNames Export/License](https://www.geonames.org/export/)

- Licensed under **Creative Commons Attribution 4.0 International (CC-BY 4.0)**
- Permits: *"copy and redistribute the material in any medium or format for any purpose, even commercially"*
- Permits: *"adapt — remix, transform, and build upon the material for any purpose, even commercially"*
- Requirement: attribution only (credit GeoNames with a link)
- Free tier: 10,000 credits/day, 1,000 credits/hour
- Postal codes for **100+ countries**

**Verdict:** Fully compatible. CC-BY 4.0 explicitly allows commercial redistribution.

## 3.5 WINNER: UN Comtrade (Score: 171) — CONDITIONAL (Premium Pro)

**Source:** [UN Comtrade License Agreement](https://comtrade.un.org/licenseagreement.html)

- Free tier: 500 calls/day, up to 100,000 records/call
- *"Re-dissemination means re-using UN Comtrade data as is (without any transformation) in other data platforms"*
- *"To be able to re-disseminate, you have to be an active Premium Pro subscriber"*
- Transformed/value-added data has more permissive terms

**Verdict:** Requires Premium Pro subscription (~$600/year). APIbase transforms and enriches data (combining with HS codes, postal data), which is more permissive. Manageable cost.

---

# Phase 4: Disqualification Summary (20 DISQUALIFIED — Record)

| # | Candidate | Score | Reason | Key Clause |
|---|-----------|-------|--------|------------|
| 1 | **AfterShip** | 167 | Non-sublicensable, no resale | *"license, sublicense, sell, resell... [prohibited]"* |
| 2 | **17Track** | 151 | Personal/non-commercial only | *"limited to personal, non-commercial purposes"* |
| 3 | **TrackingMore** | 129 | Non-sublicensable, no resale | *"not license, sublicense, sell, resell"* |
| 4 | **EasyPost** | **177** | Explicit no white-label/resale | *"not available as a white-label or resale feature"* |
| 5 | **ShipEngine** | **162** | No resale, no derivative use | *"may not be... sold, resold... for any commercial purpose"* |
| 6 | **Stamps.com** | 100 | Non-transferable license | Standard enterprise restrictions |
| 7 | **USPS API** | **158** | Redistribution requires written permission | *"written permission from the Postal Service"* — despite being government! |
| 8 | **UPS API** | 147 | Comprehensive resale prohibition + service bureau ban | *"shall not... redistribute, resell"* + service bureau ban |
| 9 | **FedEx API** | 141 | Resale/third-party prohibition | *"not license, sublicense, sell, resell"* |
| 10 | **DHL API** | 146 | Commercial storage prohibited | *"shall not store... for commercial purposes"* |
| 11 | **Royal Mail** | 96 | Restrictive carrier terms | Standard carrier restrictions |
| 12 | **Canada Post** | 101 | Restrictive carrier terms | Standard carrier restrictions |
| 13 | **Australia Post** | 96 | Restrictive carrier terms | Standard carrier restrictions |
| 14 | **Deutsche Post** | 116 | Via DHL Group restrictive terms | Same as DHL API |
| 15 | **Smarty** | 138 | Explicit no resale/redistribution | *"exclude any use involving resale, sublicensing"* |
| 16 | **Lob** | 111 | No resale/third-party access | *"shall not rent, lease, copy, resell"* |
| 17 | **Loqate** | 118 | Restrictive SaaS terms | Standard enterprise SaaS restrictions |
| 18 | **What3Words** | 113 | Non-commercial only | *"not for any commercial or business purposes"* |
| 19 | **project44** | 127 | Enterprise-only, no self-serve API | *"does not redistribute or resell data"*, $100-500/user/mo |
| 20 | **FourKites** | 110 | Enterprise-only, no self-serve API | $100-500/user/mo, locked platform |

### Critical Patterns Observed

**Universal carrier API lockdown:** ALL direct carrier APIs (USPS, UPS, FedEx, DHL, Royal Mail, Canada Post, Australia Post, Deutsche Post) prohibit proxy/resale. Even USPS (a government service) requires written permission for redistribution — unique among government APIs.

**Aggregator-as-escape-hatch:** While raw carrier APIs are locked, shipping AGGREGATORS (Shippo) exist specifically to be intermediaries. Their Platform API is the "redistribution license" — same pattern as Coursera affiliate in UC-017.

**High-score disqualifications:** EasyPost (177), ShipEngine (162), USPS API (158) all scored high but failed ToS. This is the highest total "wasted" score in any UC.

**Address validation lockdown:** SmartyStreets, Lob, Loqate, What3Words — all ban resale. Geocodio is the ONLY address validator with explicit bundled-resale permission.

---

# Phase 5: Winning Stack Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      AI Agent (MCP Client)                   │
│               "Ship this package to New York"                │
└──────────────────────┬──────────────────────────────────────┘
                       │ x402 USDC micropayment
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   APIbase MCP Server                         │
│          7 Logistics Intelligence Tools                      │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Shipping │ │ Package  │ │ Address  │ │ Postal   │       │
│  │  Rates   │ │ Tracking │ │Validation│ │ Lookup   │       │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘       │
│       │            │            │            │              │
│  ┌────┴─────┐ ┌────┴─────┐ ┌────┴─────┐                    │
│  │ HS Code  │ │  Trade   │ │ Shipping │                    │
│  │  Lookup  │ │  Flows   │ │ Estimate │                    │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘                    │
│       │            │            │                           │
│  ┌────┴────────────┴────────────┴───────────────┐           │
│  │        Cache Layer (TTL: 5min–7days)          │           │
│  │  Postal codes: 7d │ HS codes: 7d │ Rates: 15m│           │
│  │  Addresses: 24h   │ Trade: 24h   │ Track: 5m │           │
│  └──────────────────────────────────────────────┘           │
└──────────────┬────────┬────────┬────────┬───────────────────┘
               │        │        │        │
    ┌──────────▼──┐ ┌───▼────┐ ┌─▼──────┐ ┌▼──────────┐
    │   Shippo    │ │Geocodio│ │ USITC  │ │ GeoNames  │
    │ Platform API│ │        │ │HTS API │ │ CC-BY 4.0 │
    │ (Partner)   │ │(Resale │ │(US Gov)│ │(100+ ctry)│
    │ $0.05/label │ │  OK)   │ │  FREE  │ │   FREE    │
    └─────────────┘ └────────┘ └────────┘ └───────────┘
                                              │
                                    ┌─────────▼──────────┐
                                    │   UN Comtrade      │
                                    │ (Premium Pro ~$50) │
                                    │  200+ countries    │
                                    └────────────────────┘
```

### Provider Roles

| Provider | Role | ToS Status | Key Capability |
|----------|------|------------|----------------|
| **Shippo** | Shipping rates + labels + tracking | CONDITIONAL (Partner Agreement) | 85+ carriers, white-label, MCP server, rate markup |
| **Geocodio** | Address validation + geocoding + enrichment | CONDITIONAL (Bundled resale OK) | Census tract, congressional district, timezone appends |
| **USITC HTS** | Customs/tariff codes | CLEARED (US Public Domain) | HS codes, duty rates, trade restrictions |
| **GeoNames** | Global postal codes | CLEARED (CC-BY 4.0) | 100+ countries, reverse geocoding, nearby codes |
| **UN Comtrade** | International trade statistics | CONDITIONAL (Premium Pro) | Import/export flows, 200+ reporters, 1989-2025 |

---

# Phase 6: MCP Tool Definitions (7 Tools)

## Tool 1: `logistics_shipping_rates`

```json
{
  "name": "logistics_shipping_rates",
  "description": "Get real-time shipping rates from 85+ carriers (USPS, UPS, FedEx, DHL, etc.) for a given package with dimensions, weight, and origin/destination addresses. Returns sorted rates by price, speed, and carrier.",
  "parameters": {
    "type": "object",
    "properties": {
      "origin_address": {
        "type": "object",
        "properties": {
          "street1": {"type": "string"},
          "city": {"type": "string"},
          "state": {"type": "string"},
          "zip": {"type": "string"},
          "country": {"type": "string", "default": "US"}
        },
        "required": ["street1", "city", "state", "zip", "country"]
      },
      "destination_address": {
        "type": "object",
        "properties": {
          "street1": {"type": "string"},
          "city": {"type": "string"},
          "state": {"type": "string"},
          "zip": {"type": "string"},
          "country": {"type": "string", "default": "US"}
        },
        "required": ["street1", "city", "state", "zip", "country"]
      },
      "package": {
        "type": "object",
        "properties": {
          "weight_oz": {"type": "number"},
          "length_in": {"type": "number"},
          "width_in": {"type": "number"},
          "height_in": {"type": "number"}
        },
        "required": ["weight_oz"]
      },
      "sort_by": {
        "type": "string",
        "enum": ["price", "speed", "carrier"],
        "default": "price"
      }
    },
    "required": ["origin_address", "destination_address", "package"]
  },
  "x402_price_usd": 0.02,
  "cache_ttl_seconds": 900,
  "upstream_source": "Shippo Platform API"
}
```

## Tool 2: `logistics_track_package`

```json
{
  "name": "logistics_track_package",
  "description": "Track any package across 85+ carriers using a tracking number. Returns current status, location, estimated delivery, and full event history. Auto-detects carrier from tracking number format.",
  "parameters": {
    "type": "object",
    "properties": {
      "tracking_number": {
        "type": "string",
        "description": "The package tracking number"
      },
      "carrier": {
        "type": "string",
        "description": "Optional carrier code (usps, ups, fedex, dhl_express, etc.). Auto-detected if omitted."
      }
    },
    "required": ["tracking_number"]
  },
  "x402_price_usd": 0.01,
  "cache_ttl_seconds": 300,
  "upstream_source": "Shippo Platform API"
}
```

## Tool 3: `logistics_validate_address`

```json
{
  "name": "logistics_validate_address",
  "description": "Validate, standardize, and enrich a US or Canadian address. Returns USPS/Canada Post standardized address, geocoordinates, congressional district, census tract, timezone, and county FIPS code.",
  "parameters": {
    "type": "object",
    "properties": {
      "street": {"type": "string"},
      "city": {"type": "string"},
      "state": {"type": "string"},
      "zip": {"type": "string"},
      "country": {
        "type": "string",
        "enum": ["US", "CA"],
        "default": "US"
      },
      "include_fields": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["geocode", "congressional_district", "census", "timezone", "county"]
        },
        "default": ["geocode", "timezone"]
      }
    },
    "required": ["street", "city", "state"]
  },
  "x402_price_usd": 0.008,
  "cache_ttl_seconds": 86400,
  "upstream_source": "Geocodio (primary) + GeoNames (postal enrichment)"
}
```

## Tool 4: `logistics_postal_lookup`

```json
{
  "name": "logistics_postal_lookup",
  "description": "Look up postal/zip code information for 100+ countries. Returns place name, state/province, coordinates, and nearby postal codes. Supports forward (code to location) and reverse (coordinates to code) lookups.",
  "parameters": {
    "type": "object",
    "properties": {
      "postal_code": {
        "type": "string",
        "description": "Postal/zip code to look up"
      },
      "country_code": {
        "type": "string",
        "description": "ISO 3166-1 alpha-2 country code (e.g., US, GB, DE, JP)"
      },
      "latitude": {
        "type": "number",
        "description": "For reverse lookup: latitude coordinate"
      },
      "longitude": {
        "type": "number",
        "description": "For reverse lookup: longitude coordinate"
      },
      "radius_km": {
        "type": "number",
        "default": 10,
        "description": "Search radius for reverse/nearby lookups (km)"
      }
    }
  },
  "x402_price_usd": 0.003,
  "cache_ttl_seconds": 604800,
  "upstream_source": "GeoNames (CC-BY 4.0)"
}
```

## Tool 5: `logistics_hs_code_lookup`

```json
{
  "name": "logistics_hs_code_lookup",
  "description": "Look up Harmonized System (HS) tariff codes for international shipping. Search by product description or HS code number. Returns tariff rates, duty rates, product classification hierarchy, and trade restrictions for US imports/exports.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Product description (e.g., 'cotton t-shirts') or partial HS code (e.g., '6109')"
      },
      "search_type": {
        "type": "string",
        "enum": ["description", "code"],
        "default": "description"
      },
      "year": {
        "type": "integer",
        "description": "HTS year edition",
        "default": 2026
      }
    },
    "required": ["query"]
  },
  "x402_price_usd": 0.005,
  "cache_ttl_seconds": 604800,
  "upstream_source": "USITC HTS REST API (US Public Domain)"
}
```

## Tool 6: `logistics_trade_flows`

```json
{
  "name": "logistics_trade_flows",
  "description": "Query international trade flow data between countries. Returns import/export values, quantities, trade balances for specific commodities (by HS code) or aggregate bilateral trade. Covers 200+ reporter countries.",
  "parameters": {
    "type": "object",
    "properties": {
      "reporter_country": {
        "type": "string",
        "description": "ISO 3166-1 alpha-3 country code of reporting country (e.g., 'USA', 'CHN', 'DEU')"
      },
      "partner_country": {
        "type": "string",
        "description": "Trading partner country code, or 'ALL' for all partners"
      },
      "commodity_code": {
        "type": "string",
        "description": "HS code (2, 4, or 6 digit) or 'TOTAL' for aggregate"
      },
      "trade_flow": {
        "type": "string",
        "enum": ["import", "export", "both"],
        "default": "both"
      },
      "year": {
        "type": "integer",
        "description": "Year of trade data (1989-2025)"
      }
    },
    "required": ["reporter_country", "year"]
  },
  "x402_price_usd": 0.008,
  "cache_ttl_seconds": 86400,
  "upstream_source": "UN Comtrade API (Premium Pro) + USITC DataWeb (US Public Domain)"
}
```

## Tool 7: `logistics_shipping_estimate`

```json
{
  "name": "logistics_shipping_estimate",
  "description": "Get a quick shipping cost estimate without full address details. Uses postal codes and package weight to estimate costs across major carriers. Also returns estimated delivery timeframes and recommends optimal carrier for price/speed tradeoff. Enriched with postal code geographic data.",
  "parameters": {
    "type": "object",
    "properties": {
      "origin_zip": {"type": "string"},
      "origin_country": {"type": "string", "default": "US"},
      "destination_zip": {"type": "string"},
      "destination_country": {"type": "string", "default": "US"},
      "weight_oz": {"type": "number"},
      "service_level": {
        "type": "string",
        "enum": ["economy", "standard", "express", "overnight"],
        "default": "standard"
      }
    },
    "required": ["origin_zip", "destination_zip", "weight_oz"]
  },
  "x402_price_usd": 0.01,
  "cache_ttl_seconds": 3600,
  "upstream_source": "Shippo Platform API + GeoNames (postal code enrichment)"
}
```

---

# Phase 7: AI Instructions for Agents

```yaml
api_name: "APIbase Logistics Intelligence"
version: "1.0"
base_url: "https://api.apibase.pro/v1/logistics"
auth: "x402 USDC micropayment per call"

instructions: |
  You have access to 7 logistics intelligence tools covering shipping, tracking,
  address validation, postal codes, customs/tariff, and international trade.

  SHIPPING & TRACKING (via Shippo, 85+ carriers):
  - logistics_shipping_rates: Compare rates from USPS, UPS, FedEx, DHL, etc.
  - logistics_track_package: Track any package by tracking number (auto-detects carrier)
  - logistics_shipping_estimate: Quick estimate by postal code + weight (cheaper than full rates)

  ADDRESS & POSTAL (via Geocodio + GeoNames):
  - logistics_validate_address: Validate US/CA addresses + get census/timezone/geocode enrichment
  - logistics_postal_lookup: Global postal code data for 100+ countries

  CUSTOMS & TRADE (via USITC + UN Comtrade):
  - logistics_hs_code_lookup: Find HS tariff codes by product description for international shipping
  - logistics_trade_flows: International trade statistics between countries

  USAGE PATTERNS:
  1. "Ship a package" → logistics_validate_address → logistics_shipping_rates → present options
  2. "Where's my package?" → logistics_track_package with tracking number
  3. "How much to ship to Germany?" → logistics_shipping_estimate (quick) or logistics_shipping_rates (detailed)
  4. "What's the tariff on cotton shirts?" → logistics_hs_code_lookup
  5. "US-China trade in electronics" → logistics_trade_flows
  6. "What's the zip code for..." → logistics_postal_lookup

  COST OPTIMIZATION:
  - Use logistics_shipping_estimate ($0.01) for browsing/comparison scenarios
  - Use logistics_shipping_rates ($0.02) only when user is ready to ship
  - Use logistics_postal_lookup ($0.003) for simple postal code queries instead of full address validation ($0.008)
  - HS codes and postal codes are heavily cached (7-day TTL) — repeat queries are very fast

  CROSS-UC ENRICHMENT:
  - Combine with UC-009 (E-commerce) for product shipping estimates
  - Combine with UC-012 (Maps) for delivery zone visualization
  - Combine with UC-016 (Finance) for customs duty cost in local currency
  - Combine with UC-013 (Real Estate) for validated property addresses

  ATTRIBUTION:
  - GeoNames data: include "Data from GeoNames (geonames.org)" in responses
  - USITC data: note "Source: U.S. International Trade Commission"
```

---

# Phase 8: Revenue Model

## 8.1 Upstream Costs

| Provider | Cost Model | Phase 1 (/mo) | Phase 3 (/mo) |
|----------|-----------|---------------|---------------|
| Shippo Platform API | $0.05/label, rates free | $50 | $500 |
| Geocodio | 2,500 free/day; then $1/1K | $0 (free tier) | $200 |
| USITC HTS API | Free (US Gov) | $0 | $0 |
| GeoNames | Free tier 10K/day; Premium ~$100/mo | $0 (free tier) | $100 |
| UN Comtrade | Free 500/day; Premium Pro ~$50/mo | $50 | $50 |
| HS Ping (supplementary) | Free daily quota | $0 | $50 |
| **Total Upstream** | | **$100/mo** | **$900/mo** |

## 8.2 x402 Revenue Per Tool

| Tool | x402 Price | Calls/Mo (P1) | Calls/Mo (P3) | Rev/Mo (P1) | Rev/Mo (P3) |
|------|-----------|---------------|---------------|-------------|-------------|
| logistics_shipping_rates | $0.02 | 5,000 | 100,000 | $100 | $2,000 |
| logistics_track_package | $0.01 | 10,000 | 200,000 | $100 | $2,000 |
| logistics_validate_address | $0.008 | 8,000 | 150,000 | $64 | $1,200 |
| logistics_postal_lookup | $0.003 | 15,000 | 300,000 | $45 | $900 |
| logistics_hs_code_lookup | $0.005 | 3,000 | 60,000 | $15 | $300 |
| logistics_trade_flows | $0.008 | 2,000 | 40,000 | $16 | $320 |
| logistics_shipping_estimate | $0.01 | 8,000 | 150,000 | $80 | $1,500 |
| **Totals** | | **51,000** | **1,000,000** | **$420** | **$8,220** |

## 8.3 Affiliate Revenue

| Stream | Model | Rev/Mo (P1) | Rev/Mo (P3) |
|--------|-------|-------------|-------------|
| Shippo referrals | $5-$150 per new user | $100 | $2,000 |
| Shipping insurance upsell | Commission on add-on | $50 | $1,000 |
| Packaging supplies affiliate | Links in rate responses | $25 | $500 |
| Carrier account upgrades | Referral for account creation | $25 | $500 |
| **Total Affiliate** | | **$200** | **$4,000** |

## 8.4 Cross-UC Enrichment Revenue

| Integration | Description | Rev/Mo (P1) | Rev/Mo (P3) |
|-------------|-------------|-------------|-------------|
| UC-009 (E-commerce) + Shipping | Product pages with shipping estimates | $50 | $1,000 |
| UC-003 (Food) + Tracking | Food delivery tracking enrichment | $30 | $600 |
| UC-012 (Maps) + Postal/Address | Map-based shipping zone visualization | $30 | $500 |
| UC-013 (Real Estate) + Address | Validated addresses + census data | $40 | $800 |
| UC-016 (Finance) + Trade | Economic analysis with trade flows | $20 | $400 |
| **Total Cross-UC** | | **$170** | **$3,300** |

## 8.5 Phase Projections

| Metric | Phase 1 (Mo 1-6) | Phase 2 (Mo 7-12) | Phase 3 (Mo 13-24) |
|--------|-------------------|--------------------|--------------------|
| Monthly API Revenue | $420 | $2,500 | $8,220 |
| Monthly Affiliate Revenue | $200 | $1,200 | $4,000 |
| Monthly Cross-UC Revenue | $170 | $1,000 | $3,300 |
| **Total Monthly Revenue** | **$790** | **$4,700** | **$15,520** |
| Monthly Upstream Cost | $100 | $400 | $900 |
| **Monthly Margin** | **$690** | **$4,300** | **$14,620** |
| **Margin %** | **87.3%** | **91.5%** | **94.2%** |
| **Break-Even** | **Month 1** | | |

## 8.6 Cache Multiplier Analysis

| Tool | Cache TTL | Hit Rate Est. | Cost Savings |
|------|-----------|---------------|--------------|
| logistics_postal_lookup | 7 days | 85% | GeoNames calls reduced 85% |
| logistics_hs_code_lookup | 7 days | 90% | USITC calls reduced 90% |
| logistics_validate_address | 24 hours | 60% | Geocodio calls reduced 60% |
| logistics_trade_flows | 24 hours | 70% | Comtrade calls reduced 70% |
| logistics_shipping_rates | 15 minutes | 30% | Shippo calls reduced 30% |
| logistics_track_package | 5 minutes | 15% | Minimal (tracking changes frequently) |
| logistics_shipping_estimate | 1 hour | 50% | Shippo calls reduced 50% |

---

# Phase 9: Cross-UC Synergy Map

```
                UC-019 Logistics Intelligence
                          │
           ┌──────────────┼──────────────────┐
           │              │                  │
    ┌──────▼──────┐ ┌─────▼──────┐ ┌─────────▼────────┐
    │  UC-009     │ │  UC-012    │ │    UC-016         │
    │  E-commerce │ │  Maps/Geo  │ │    Finance        │
    │             │ │            │ │                   │
    │ Product →   │ │ Address →  │ │ Duty cost in      │
    │ shipping    │ │ delivery   │ │ local currency    │
    │ estimates   │ │ zones      │ │ via exchange rate  │
    └─────────────┘ └────────────┘ └───────────────────┘
           │              │                  │
    ┌──────▼──────┐ ┌─────▼──────┐ ┌─────────▼────────┐
    │  UC-003     │ │  UC-013    │ │    UC-015         │
    │  Food       │ │  Real Est  │ │    Jobs           │
    │             │ │            │ │                   │
    │ Delivery    │ │ Property   │ │ Import/export     │
    │ tracking    │ │ address    │ │ trade data for    │
    │ enrichment  │ │ validation │ │ logistics jobs    │
    └─────────────┘ └────────────┘ └───────────────────┘
```

### Key Integrations

| UC Partner | Integration | Value |
|------------|-------------|-------|
| **UC-009 E-commerce** | Product listing → "estimate shipping" → logistics_shipping_estimate | Most natural cross-UC: "How much to ship this?" |
| **UC-003 Food Delivery** | Order tracking enrichment via logistics_track_package | Extends food delivery to package tracking |
| **UC-012 Maps/Geo** | Address validation + shipping zone mapping | Geocodio/GeoNames overlap with Geoapify |
| **UC-013 Real Estate** | Property address validation + census data enrichment | Geocodio provides same enrichment as Census API |
| **UC-016 Finance** | Customs duty → currency conversion | "Import duty on this product in EUR?" |
| **UC-015 Jobs** | Trade flow data for logistics career intelligence | Import/export volumes → logistics job demand |

---

# Phase 10: Risk Analysis

| Risk | Impact | Mitigation |
|------|--------|------------|
| Shippo partnership not approved | High | Platform API is designed for this; Shopify/WooCommerce already use it. Approach via partnerships@goshippo.com. Fallback: Ship24 or direct carrier integrations. |
| Geocodio service-bureau clause challenged | Medium | We resell enriched OUTPUT DATA (explicitly allowed), not direct system access. Document architecture for compliance. |
| UN Comtrade Premium Pro cost | Low | $600/year is manageable. USITC covers US tariff data for free. Comtrade adds international dimension. Can defer to Phase 2. |
| Carrier ToS enforcement against Shippo | Low | Shippo holds carrier agreements. We use Shippo, not carriers directly. Shippo responsible for carrier ToS compliance. |
| Cache staleness for tracking | Medium | 5-minute TTL keeps data fresh. Shippo supports webhooks for push updates. |
| GeoNames rate limits | Low | 10K/day free tier sufficient for Phase 1. Premium tier ($100/mo) unlocks unlimited. Data also available as bulk download. |

---

# Phase 11: MCP Ecosystem Analysis

| MCP Server | Provider | Status | Relevance |
|------------|----------|--------|-----------|
| [Shippo MCP](https://docs.goshippo.com/docs/guides_general/mcpserver/) | Official Shippo | Production | Labels, tracking, rates — validates our approach |
| [EasyPost MCP](https://lobehub.com/mcp/bischoff99-easypost_mcp_server) | Community | Available | Competitor (but ToS-banned for resale) |
| [UPS MCP](https://lobehub.com/mcp/ups-api-ups-mcp) | Community | Available | Direct carrier (ToS-banned) |
| [17Track MCP](https://skywork.ai) | Community | Available | Tracking only (ToS: non-commercial) |
| [Geocodio MCP](https://www.geocod.io/code-and-coordinates/2025-08-05-geocodio-mcp-experiment/) | Official | Experimental | Geocoding — validates Geocodio interest |
| [TrackMage MCP](https://trackmage.com/mcp-server-shipment-tracking-api/) | Official | Production | Tracking only |

**Key insight:** No existing MCP server combines shipping + address + customs + trade into a unified intelligence layer. APIbase's differentiation is the multi-source fusion.

---

# Phase 12: Pattern P19 — Supply Chain Intelligence Layer

## Core Strategy

**P19: Supply Chain Intelligence Layer** — Unify fragmented logistics data (shipping rates, tracking, addresses, postal codes, tariff/customs, trade flows) into a single enriched intelligence layer. Combines commercially licensed aggregator data (Shippo), permissively-licensed commercial data (Geocodio), and government/open data (USITC, GeoNames, UN Comtrade).

## Sub-Patterns

### P19a: Logistics Aggregator Partnership
Partner with shipping aggregators (Shippo) that explicitly support platform/white-label models. Unlike raw carrier APIs (which universally prohibit proxy/resale), aggregators like Shippo are DESIGNED to be intermediaries — their business model IS being resold. APIbase becomes a "platform on top of a platform," adding AI-agent accessibility and micropayment billing.

### P19b: Compliance Data as a Service
Government-published compliance data (HS codes, tariff rates, trade regulations) is free and unrestricted but hard to access and interpret. P19b transforms raw government datasets into agent-friendly, queryable tools. Same pattern as UC-015 (BLS labor data) and UC-016 (FRED economic data) — government data escape hatch, new domain.

### P19c: Address Intelligence Enrichment
Combine permissively-licensed geocoding (Geocodio — resale explicitly allowed when bundled) with open postal data (GeoNames — CC-BY 4.0) to create enriched address validation + postal intelligence. Each query returns validated address + coordinates + postal code + timezone + census tract + congressional district — far more than any single source.

### P19d: Transactional Revenue via Shipping Actions
Unlike most APIbase tools (which return data), shipping tools can trigger ACTIONS (create labels, schedule pickups, buy insurance). Each action creates both an x402 micropayment AND potential affiliate revenue (Shippo referral, insurance commission). **First APIbase pattern where tools create direct commercial transactions, not just information retrieval.**

## Key Innovation

P19 is the **first pattern where APIbase tools trigger physical-world actions**. A shipping label causes a package to be picked up and delivered. This creates a fundamentally different value proposition than information-only tools.

## P19 Revenue Formula

```
Revenue = (x402_micropayments × call_volume)
        + (shipping_label_markup × labels_created)
        + (affiliate_commissions × referrals)
        + (insurance_commissions × policies_sold)
        + (cross_UC_enrichment × enriched_queries)
```

---

# Executive Summary

UC-019 (Logistics/Shipping/Tracking/Delivery Intelligence) is viable with a **5-provider stack**:

1. **Shippo** (Platform API, $0.05/label) — Shipping rates, labels, tracking via white-label partnership designed for intermediaries. Official MCP server.
2. **Geocodio** ($0-$200/mo) — Address validation + geocoding + census/timezone enrichment with explicit bundled-resale permission.
3. **USITC HTS API** (FREE, US Public Domain) — Customs/tariff codes, duty rates — government data escape hatch.
4. **GeoNames** (FREE, CC-BY 4.0) — Global postal codes for 100+ countries — open data escape hatch.
5. **UN Comtrade** (~$50/mo) — International trade statistics with Premium Pro redistribution rights.

**Revenue:** $790/mo (Phase 1) → $15,520/mo (Phase 3) at 87-94% margins. Break-even Month 1.

**Pattern P19** ("Supply Chain Intelligence Layer") — first pattern where MCP tools trigger physical-world actions. Transactional + affiliate + data revenue model.

**Critical path:** Secure Shippo Platform Partner agreement (partnerships@goshippo.com). Their architecture, MCP Server, and white-label program are purpose-built for our use case.

**20 of 31 candidates disqualified** — new record. ALL carrier APIs (USPS, UPS, FedEx, DHL + 4 national posts) prohibit proxy/resale. ALL tracking aggregators non-sublicensable. Solution: Shippo Platform API = aggregator designed for intermediaries + government/open data for customs/postal.
