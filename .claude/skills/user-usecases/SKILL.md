---
name: user-usecases
description: "Database of real user use cases for APIbase platform. Contains detailed examples of how specific APIs are onboarded, wrapped, and served to AI agents. Use this skill when you need to reference real integration examples, explain the APIbase onboarding process, or design new API wrappers based on proven patterns."
user-invocable: true
argument-hint: "[search-query or 'list' to show all]"
allowed-tools: Read, Grep, Glob
---

# APIbase — User Use Cases Database

This skill contains real-world use cases of API integrations on the APIbase platform.
Each use case documents the full pipeline: client data → API analysis → wrapper creation → MCP tools → publication.

Use these examples as reference patterns when:
- Onboarding a new API provider
- Explaining the APIbase value proposition to partners
- Designing API wrappers for new categories
- Generating MCP Tool Definitions
- Writing AI-instructions for agents

## Use Cases Index

| # | Provider | Category | Status | Client Data | File |
|---|----------|----------|--------|-------------|------|
| UC-001 | Polymarket | Predictions / Analytics | Reference | Builder API Keys (x3) | `usecases/UC-001-polymarket.md` |
| UC-002 | Aviasales / Travelpayouts | Travel / Flights + Hotels | Reference | API Token + Partner Marker | `usecases/UC-002-aviasales.md` |
| UC-003 | MealMe + DoorDash + Wolt + Yandex Eda | Food Delivery / Groceries | Reference | MealMe API Key + DoorDash JWT + Wolt/YE Affiliate IDs | `usecases/UC-003-food-delivery.md` |
| UC-004 | CoinGecko | Finance / Crypto Market Data | Reference | CoinGecko Pro API Key + x402 USDC Wallet | `usecases/UC-004-coingecko.md` |
| UC-005 | OpenWeatherMap | Weather / Environment | Reference | OWM API Key + One Call 3.0 Key | `usecases/UC-005-openweathermap.md` |
| UC-006 | NewsAPI.org | News / Current Events | Reference | NewsAPI.org Business Key ($449/mo) | `usecases/UC-006-newsapi.md` |
| UC-007 | DeepL | Translation / Content Transformation | Reference | DeepL API Pro Key ($5.49/mo + $25/M chars) | `usecases/UC-007-deepl.md` |
| UC-008 | Ticketmaster | Events / Live Entertainment | Reference | TM Discovery API Key (free) + Impact Affiliate ID | `usecases/UC-008-ticketmaster.md` |
| UC-009 | Keepa | E-commerce / Price Intelligence | Reference | Keepa API Key (€49/mo subscription) | `usecases/UC-009-keepa.md` |
| UC-010 | TMDB | Movies & TV / Entertainment Discovery | Reference | TMDB API Key (free) + Commercial Agreement | `usecases/UC-010-tmdb.md` |
| UC-011 | USDA + OpenFDA | Health & Nutrition / Fitness | Reference | USDA API Key (free) + OpenFDA Key (free) | `usecases/UC-011-health-nutrition.md` |
| UC-012 | Geoapify + Valhalla | Maps & Navigation / Geolocation | Reference | Geoapify API Key (free) + Valhalla (self-hosted MIT) | `usecases/UC-012-maps-geo.md` |
| UC-013 | RentCast + US Census | Real Estate / Property Intelligence | Reference | RentCast API Key ($199-449/mo) + Census Key (free) | `usecases/UC-013-real-estate.md` |
| UC-014 | The Odds API + API-Sports | Sports / Live Scores | Reference | The Odds API Key ($59/mo) + API-Sports Key ($29/mo) | `usecases/UC-014-sports.md` |
| UC-015 | BLS + O\*NET + ESCO + CareerJet | Jobs / Recruiting / Career Intelligence | Reference | BLS Key (free) + O\*NET (free) + ESCO (free) + CareerJet Publisher (free) | `usecases/UC-015-jobs.md` |
| UC-016 | Frankfurter/ECB + FRED + World Bank + US Treasury + fawazahmed0 + OpenIBAN | Payments / Banking / Financial Intelligence | Reference | All free ($0): CC0 + CC-BY 4.0 + US Gov + ECB free reuse | `usecases/UC-016-payments-banking.md` |
| UC-017 | OpenAlex + College Scorecard + PubMed + arXiv + Coursera | Education / Online Learning / Academic Research | Reference | OpenAlex (CC0) + College Scorecard (US Gov) + PubMed (US Gov) + arXiv (CC0) + Coursera (affiliate, 15-45%) | `usecases/UC-017-education.md` |
| UC-018 | MusicBrainz + Discogs + ListenBrainz + AcoustID + Wikidata + RadioBrowser | Music / Audio Discovery / Music Intelligence | Reference | MusicBrainz (CC0) + Discogs Dumps (CC0) + ListenBrainz (CC0) + AcoustID (CC-BY-SA, €50/mo) + Wikidata (CC0) + RadioBrowser (PD) | `usecases/UC-018-music.md` |
| UC-019 | Shippo + Geocodio + USITC HTS + GeoNames + UN Comtrade | Logistics / Shipping / Tracking / Delivery Intelligence | Reference | Shippo (Platform Partner, $0.05/label) + Geocodio (free-$200/mo) + USITC HTS (US Gov, free) + GeoNames (CC-BY 4.0, free) + UN Comtrade (Premium Pro, ~$50/mo) | `usecases/UC-019-logistics.md` |
| UC-020 | AsterDex (Aster) | DeFi / Decentralized Trading / Perpetual Futures | Reference | Aster Code Builder Program (100 ASTER deposit) + Referral (tlRYkq, 5-10%) + API Key (HMAC SHA256) | `usecases/UC-020-asterdex.md` |
| UC-021 | Hyperliquid (#1 DEX) | DeFi / Decentralized Trading / Perpetual Futures | Reference | Builder Codes (100 USDC, permissionless) + Referral (CRYPTOREFERENCE, 10%) + API Wallet (0xc98d...eAbB) | `usecases/UC-021-hyperliquid.md` |

## How to Use

- `/user-usecases list` — show all use cases
- `/user-usecases polymarket` — find use cases matching "polymarket"
- `/user-usecases predictions` — find use cases by category

When adding a new use case, follow the template in `usecases/_TEMPLATE.md`.

---

Read the use case files from the `usecases/` directory relative to this skill for detailed information.
If $ARGUMENTS is "list" or empty, show the index table above.
Otherwise, search for use cases matching $ARGUMENTS.
