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
| UC-022 | Amadeus | Travel / Flights / Hotels / Airports | Draft | API Key + Secret (OAuth2, Self-Service) | `usecases/UC-022-amadeus.md` |
| UC-023 | Sabre GDS | Travel / Flights / Airlines / Destinations | Live | Client ID + Secret (OAuth2 double base64, cert env) | `usecases/UC-023-sabre.md` |
| UC-024 | TheFork + TableCheck + EatApp | Restaurant Discovery + Reservation | Planning | Provider credentials needed | `usecases/UC-024-restaurant-booking.md` |
| UC-025 | Zinc API | E-commerce / Product Search | Candidate | $0.01/call wallet | `usecases/UC-025-zinc-api.md` |
| UC-026 | Diffbot | E-commerce / Product Extraction | Candidate | 10K free/mo | `usecases/UC-026-diffbot.md` |
| UC-027 | Best Buy | E-commerce / Electronics | Candidate | Fully free | `usecases/UC-027-best-buy.md` |
| UC-028 | WhoisXML API | Domain / WHOIS Lookup | Candidate | 500/mo free | `usecases/UC-028-whoisxml-api.md` |
| UC-029 | WhoisFreaks | Domain / WHOIS Lookup | Candidate | 500 credits free | `usecases/UC-029-whoisfreaks.md` |
| UC-030 | WhoisJSON | Domain / WHOIS Lookup | Candidate | 1K/mo free | `usecases/UC-030-whoisjson.md` |
| UC-031 | Spoonacular | Recipe / Cooking / Food | Candidate | 150 pts/day free | `usecases/UC-031-spoonacular.md` |
| UC-032 | Zestful | Recipe / Ingredient Parsing | Candidate | 30/day free | `usecases/UC-032-zestful.md` |
| UC-033 | Recipe API | Recipe / AI Generation | Candidate | 100/day free | `usecases/UC-033-recipe-api.md` |
| UC-034 | NASA Open APIs | Space / Astronomy | Candidate | 1K/hr free | `usecases/UC-034-nasa-open-apis.md` |
| UC-035 | NASA JPL SSD/CNEOS | Space / Asteroid Tracking | Candidate | Fully free | `usecases/UC-035-nasa-jpl-ssd-cneos.md` |
| UC-036 | AstronomyAPI | Space / Celestial Positions | Candidate | Free tier | `usecases/UC-036-astronomyapi.md` |
| UC-037 | RAWG | Video Games / Gaming | Candidate | 20K/mo free | `usecases/UC-037-rawg.md` |
| UC-038 | Steam Web API | Video Games / Steam | Candidate | 100K/day free | `usecases/UC-038-steam-web-api.md` |
| UC-039 | IGDB | Video Games / Metadata | Candidate | Free via Twitch | `usecases/UC-039-igdb.md` |
| UC-040 | QRServer | Dev & Infrastructure / QR Codes | Live | Fully free, no auth | `usecases/UC-040-qrserver.md` |
| UC-041 | UPCitemdb | UPC / Product Lookup | Live | 100/day free, no auth | `usecases/UC-041-upcitemdb.md` |
| UC-042 | BarcodeAPI | Barcode Generation | Candidate | Fully free | `usecases/UC-042-barcodeapi.md` |
| UC-043 | Rakuten Web Service | Japan / E-commerce | Candidate | Fully free | `usecases/UC-043-rakuten-web-service.md` |
| UC-044 | e-Stat Japan | Japan / Government Stats | Candidate | Fully free | `usecases/UC-044-e-stat-japan.md` |
| UC-213 | PubChem | Chemistry / Compound Data | Candidate | Free (US Gov) | `usecases/UC-213-pubchem.md` |
| UC-214 | Open Charge Map | EV / Charging Stations | Candidate | Free (open data) | `usecases/UC-214-openchargemap.md` |
| UC-215 | ChEMBL | Drug Bioactivity | Candidate | Free (CC BY-SA) | `usecases/UC-215-chembl.md` |
| UC-216 | EU Open Data Portal | Gov Data (EU) | Candidate | Free (open data) | `usecases/UC-216-eu-opendata.md` |
| UC-217 | IPQualityScore | Fraud Detection | Candidate | 1K free/mo | `usecases/UC-217-ipqualityscore.md` |
| UC-218 | RCSB Protein Data Bank | Structural Biology | Candidate | Free (CC0) | `usecases/UC-218-rcsb-pdb.md` |
| UC-219 | NHTSA Safety | Vehicle Recalls | Candidate | Free (US Gov) | `usecases/UC-219-nhtsa-safety.md` |
| UC-220 | NCI Cactus | Chemical ID Resolver | Candidate | Free (US Gov) | `usecases/UC-220-nci-cactus.md` |
| UC-221 | 17TRACK | Package Tracking | Candidate | 100 free + pay-per-quota | `usecases/UC-221-17track.md` |
| UC-222 | Materials Project | Materials Science | Candidate | Free (DOE) | `usecases/UC-222-materials-project.md` |
| UC-223 | ONS UK | Gov Statistics (UK) | Candidate | Free (no auth) | `usecases/UC-223-ons-uk.md` |
| UC-224 | Statistics Canada | Gov Statistics (CA) | Candidate | Free (no auth) | `usecases/UC-224-statcan.md` |
| UC-225 | Listen Notes | Podcast Search | Candidate | 300 free/mo | `usecases/UC-225-listennotes.md` |
| UC-226 | AudD | Audio Recognition | Candidate | 300 free + $5/1K | `usecases/UC-226-audd.md` |
| UC-227 | Threat Intelligence Platform | Threat Intelligence | Candidate | 100 credits + pay-per-credit | `usecases/UC-227-threatintel.md` |
| UC-228 | DHL Tracking | Shipping (DHL) | Candidate | 250 free/day | `usecases/UC-228-dhl-tracking.md` |
| UC-229 | ABS Australia | Gov Statistics (AU) | Candidate | Free (no auth) | `usecases/UC-229-abs-australia.md` |
| UC-230 | Musixmatch | Lyrics / Music | Candidate | 50 free/day | `usecases/UC-230-musixmatch.md` |
| UC-231 | MarketCheck | Car Listings / Valuation | Candidate | 500 free/mo | `usecases/UC-231-marketcheck.md` |
| UC-232 | Vincario | VIN History (Global) | Candidate | 3 free/mo + pay-per-credit | `usecases/UC-232-vincario.md` |
| UC-393 | Upstash Vector | Vector Database / Embedding | Candidate | 10K ops/day free | `usecases/UC-393-upstash-vector.md` |
| UC-394 | Plivo | SMS / Voice (CPaaS) | Candidate | $10 trial credit | `usecases/UC-394-plivo.md` |
| UC-395 | Telnyx | SMS / Voice (CPaaS) | Candidate | $5 trial credit | `usecases/UC-395-telnyx.md` |
| UC-396 | NOAA SWPC | Space Weather / Geomagnetic | Candidate | Free (US Gov NODD) | `usecases/UC-396-noaa-swpc.md` |
| UC-397 | AirNow EPA | US Air Quality / AQI | Candidate | 500/hr/endpoint free | `usecases/UC-397-airnow.md` |
| UC-398 | OpenAQ v3 | Global Air Quality / Sensors | Candidate | 60/min, 2K/hr free | `usecases/UC-398-openaq.md` |
| UC-399 | Free Use Bible API | Public-Domain Scriptures | Candidate | Unlimited free | `usecases/UC-399-bible-api.md` |
| UC-400 | Gutendex | Project Gutenberg Books | Candidate | Unlimited free, MIT | `usecases/UC-400-gutendex.md` |
| UC-401 | LibriVox | Public-Domain Audiobooks | Candidate | Unlimited free | `usecases/UC-401-librivox.md` |
| UC-402 | Tatoeba | Multilingual Sentences / NLP | Candidate | Unlimited free, CC-BY | `usecases/UC-402-tatoeba.md` |
| UC-403 | BrasilAPI | Brazil — CNPJ/CEP/Banks/PIX | Candidate | Unlimited free, MIT | `usecases/UC-403-brasilapi.md` |
| UC-404 | IBGE | Brazil — Census / Geography | Candidate | Unlimited free, CC BY 4.0 | `usecases/UC-404-ibge.md` |
| UC-405 | BCB SGS | Brazil — Financial Time Series | Candidate | Unlimited free, ODbL | `usecases/UC-405-bcb-sgs.md` |
| UC-406 | US NPS | US National Parks | Candidate | Free, US Gov | `usecases/UC-406-nps.md` |
| UC-407 | US EIA | US Energy / Petroleum / Electricity | Candidate | 5K/hr free, US Gov | `usecases/UC-407-eia.md` |
| UC-408 | US FEC | US Campaign Finance | Candidate | 1K/hr free, US Gov | `usecases/UC-408-fec.md` |
| UC-409 | US Library of Congress | US Cultural / Historical Archives | Candidate | Unlimited free, public domain | `usecases/UC-409-loc.md` |
| UC-410 | Eurostat | EU Statistics / Macro | Candidate | Unlimited free, CC BY 4.0 | `usecases/UC-410-eurostat.md` |
| UC-411 | UK Police | UK Crime Data | Candidate | Unlimited free, OGL v3.0 | `usecases/UC-411-uk-police.md` |
| UC-412 | Singapore data.gov.sg | SG Real-time Env + Transport | Candidate | Unlimited free | `usecases/UC-412-data-gov-sg.md` |
| UC-413 | NIST NVD | Security / CVE Database | Candidate | 5/30s anon, 50/30s with key | `usecases/UC-413-nist-nvd.md` |
| UC-414 | NREL AFDC + PVWatts | Energy / EV / Solar (US Gov) | Candidate | Unlimited free key | `usecases/UC-414-nrel-afdc.md` |
| UC-415 | USAJOBS | Jobs / US Federal | Candidate | Unlimited free key | `usecases/UC-415-usajobs.md` |
| UC-416 | Lichess | Chess / Esports | Candidate | Unlimited, no key | `usecases/UC-416-lichess.md` |
| UC-417 | Chess.com | Chess / Esports | Candidate | Unlimited, no key | `usecases/UC-417-chesscom.md` |
| UC-418 | OpenDota | Esports / Dota 2 | Candidate | 3K/day anon, 50K/mo with key | `usecases/UC-418-opendota.md` |
| UC-419 | HuggingFace Inference | NLP / AI Inference | Candidate | $0.10/mo credits | `usecases/UC-419-huggingface-inference.md` |
| UC-420 | DeepInfra | LLM Serverless Inference | Candidate | CC required | `usecases/UC-420-deepinfra.md` |
| UC-421 | MyMemory | Translation | Candidate | 50K chars/day with email | `usecases/UC-421-mymemory.md` |
| UC-422 | NOAA Aviation Weather Center | Aviation / METAR/TAF/SIGMET | Candidate | Unlimited (100/min) | `usecases/UC-422-awc.md` |
| UC-423 | CheckWX | Aviation / Decoded METAR | Candidate | 3K/day | `usecases/UC-423-checkwx.md` |
| UC-424 | AVWX | Aviation / Parsed NOTAMs | Candidate | METAR/TAF free, NOTAM paid | `usecases/UC-424-avwx.md` |
| UC-425 | Razorpay IFSC | India — Banking IFSC | Candidate | Unlimited, no key, MIT | `usecases/UC-425-razorpay-ifsc.md` |
| UC-426 | IRCTC RapidAPI | India — Railways PNR | Candidate | RapidAPI free tier (existing key) | `usecases/UC-426-irctc-rapidapi.md` |
| UC-427 | IndianRailAPI | India — Railways (alt) | Candidate | Free tier, maintenance flag | `usecases/UC-427-indianrailapi.md` |
| UC-428 | Bhashini / ULCA | India — Indic Languages NLP | Candidate | Free (gov registration) | `usecases/UC-428-bhashini.md` |
| UC-429 | UK FSA Food Hygiene | UK — Food Hygiene Ratings | Candidate | Unlimited, OGL v3.0 | `usecases/UC-429-uk-fsa.md` |
| UC-430 | UK gov.uk | UK — Gov Content + Search | Candidate | Unlimited, OGL v3.0 | `usecases/UC-430-uk-govuk.md` |
| UC-431 | SCB Statistics Sweden | EU/SE — National Stats | Candidate | Unlimited (30/min) | `usecases/UC-431-scb-sweden.md` |
| UC-432 | CBS Netherlands | EU/NL — National Stats | Candidate | Unlimited, CC0 | `usecases/UC-432-cbs-netherlands.md` |
| UC-433 | OECD Data Explorer SDMX | Economics / Macro | Candidate | Unlimited, no key, CC BY 4.0 | `usecases/UC-433-oecd.md` |
| UC-434 | IMF DataMapper API | Economics / Finance | Candidate | Unlimited, no key, CC BY 4.0 | `usecases/UC-434-imf.md` |
| UC-435 | BIS Statistics API | Finance / Central Banking | Candidate | Unlimited, no key, attribution | `usecases/UC-435-bis.md` |
| UC-436 | ILO ILOSTAT SDMX | Labour Statistics | Candidate | Unlimited, no key, CC BY 4.0 | `usecases/UC-436-ilostat.md` |
| UC-437 | eCFR US Federal Regulations | Legal / Government | Candidate | Unlimited, no key, public domain | `usecases/UC-437-ecfr.md` |
| UC-438 | CDC EPH Tracking Network | Health / Environment | Candidate | Unlimited, no key, public domain | `usecases/UC-438-ephtracking.md` |
| UC-439 | UniProt Protein KB | Bioinformatics | Candidate | Unlimited, no key, CC BY 4.0 | `usecases/UC-439-uniprot.md` |
| UC-440 | Ensembl Genome REST API | Bioinformatics / Genomics | Candidate | 55K/hr, no key, Apache 2.0 | `usecases/UC-440-ensembl.md` |
| UC-441 | Open Targets Platform | Drug Discovery | Candidate | Unlimited, no key, CC0 | `usecases/UC-441-opentargets.md` |
| UC-442 | Cleveland Museum of Art | Cultural Heritage | Candidate | Unlimited, no key, CC0 | `usecases/UC-442-clevelandart.md` |
| UC-443 | DigitalNZ NZ Heritage | Cultural Heritage | Candidate | 10K/day, no key, metadata OK | `usecases/UC-443-digitalnz.md` |
| UC-444 | Getty Museum LOD | Cultural Heritage | Candidate | Unlimited, no key, CC0 | `usecases/UC-444-getty.md` |
| UC-445 | NASA POWER Solar & Met | Earth Science | Candidate | Unlimited, no key, CC0 | `usecases/UC-445-nasapower.md` |
| UC-446 | USGS Volcano Hazards | Earth Science | Candidate | Unlimited, no key, public domain | `usecases/UC-446-usgsvolcano.md` |
| UC-447 | USGS Water Quality Portal | Environment / Hydrology | Candidate | Unlimited, no key, public domain | `usecases/UC-447-waterqualityportal.md` |
| UC-448 | WTO Timeseries API | Trade Statistics | Candidate | Free key (self-serve) | `usecases/UC-448-wto.md` |
| UC-449 | GovInfo GPO Documents | Government / Legal | Candidate | Free api.data.gov key (likely have it) | `usecases/UC-449-govinfo.md` |
| UC-450 | DPLA Digital Library | Cultural Heritage | Candidate | Free email key | `usecases/UC-450-dpla.md` |
| UC-451 | INSEE France Stats | National Statistics | Candidate | Free OAuth2 client creds | `usecases/UC-451-insee.md` |
| UC-452 | Destatis Germany Stats | National Statistics | Candidate | Free account signup | `usecases/UC-452-destatis.md` |
| UC-453 | INEGI Mexico Stats | National Statistics | Candidate | Free token (instant) | `usecases/UC-453-inegi.md` |
| UC-454 | NIH Reporter | Health / Research Grants | LIVE | None (US Gov) | `usecases/UC-454-nihreporter.md` |
| UC-455 | FCC Open Data | Legal & Regulatory | LIVE | None (api.data.gov shared key) | `usecases/UC-455-fcc.md` |
| UC-456 | NASA Exoplanet Archive | Space / Astronomy | LIVE | None (Caltech IPAC public) | `usecases/UC-456-nasaexoplanet.md` |
| UC-457 | UN SDG Statistics | Global Statistics | LIVE | None (UN open data) | `usecases/UC-457-unsdg.md` |
| UC-458 | DataCite REST API | Research Data / DOI | LIVE | None (open, CC0) | `usecases/UC-458-datacite.md` |
| UC-459 | Statistics Norway (SSB) PXWeb API | Government Statistics | LIVE | None (NLOD 2.0) | `usecases/UC-459-ssbnorway.md` |
| UC-460 | Overpass API (OpenStreetMap) | Geospatial / Location | LIVE | None (ODbL) | `usecases/UC-460-overpass.md` |
| UC-461 | Zenodo (CERN/OpenAIRE) | Education / Research Data | LIVE | None (CC0) | `usecases/UC-461-zenodo.md` |
| UC-462 | Bright Sky (DWD) | Weather / Germany | Candidate | None (MIT + DWD GeoNutzV) | `usecases/UC-462-brightsky.md` |
| UC-463 | Statistics Finland | Nordic Statistics | Candidate | None (CC BY 4.0) | `usecases/UC-463-stat-finland.md` |
| UC-464 | UNICEF SDMX API | Global Health / Child Development | Candidate | None (CC BY 3.0 IGO) | `usecases/UC-464-unicef-sdmx.md` |
| UC-465 | OFAC SDN Sanctions List | Compliance / Sanctions | Candidate | None (US Gov public domain) | `usecases/UC-465-ofac-sdn.md` |
| UC-466 | European Parliament Open Data | Civic / Legislative | Candidate | None (EU open data mandate) | `usecases/UC-466-europarl.md` |
| UC-467 | EU Publications CELLAR | Legal / EU Law | Candidate | None (EU public domain) | `usecases/UC-467-eu-cellar.md` |
| UC-468 | ECB SDMX API | Finance / Central Bank | Candidate | None (ECB disclosure req.) | `usecases/UC-468-ecb-sdmx.md` |
| UC-469 | SMHI Open Data | Weather / Nordic | Candidate | None (CC BY 4.0 SE) | `usecases/UC-469-smhi.md` |
| UC-470 | BTS Transportation Statistics | Transportation / US | Candidate | None (US Gov public domain) | `usecases/UC-470-bts.md` |
| UC-471 | NSF Award Search | Research Funding / Science | Candidate | None (US Gov public domain) | `usecases/UC-471-nsf-awards.md` |
| UC-472 | Deutsche Bundesbank SDMX | Finance / Germany | Candidate | None (CC BY 3.0 DE) | `usecases/UC-472-bundesbank.md` |
| UC-473 | European Environment Agency | Environment / ESG | Candidate | None (CC BY 2.5 DK) | `usecases/UC-473-eea.md` |
| UC-474 | NASA Technical Reports Server | Space / Aeronautics | LIVE | None (US Gov) | `usecases/UC-474-nasantrs.md` |
| UC-475 | CERN Open Data | Space / Physics | LIVE | None (CERN open science) | `usecases/UC-475-cernopendata.md` |
| UC-476 | CelesTrak GP | Space / Satellites | LIVE | None (US Space Force public release) | `usecases/UC-476-celestrak.md` |
| UC-477 | NASA EONET | World / Disaster Monitoring | LIVE | None (US Gov public domain) | `usecases/UC-477-eonet.md` |
| UC-478 | RxNorm (NIH NLM) | Health / Drug Nomenclature | LIVE | None (US Gov open data) | `usecases/UC-478-rxnorm.md` |
| UC-479 | MyGene.info | Health / Gene Annotation | LIVE | None (BioThings CC0 open data) | `usecases/UC-479-mygene.md` |
| UC-480 | MyVariant.info | Health / Variant Annotation | LIVE | None (BioThings open access, TSRI) | `usecases/UC-480-myvariant.md` |
| UC-481 | MyChem.info | Health / Chemical Annotation | LIVE | None (BioThings open access, TSRI) | `usecases/UC-481-mychem.md` |
| UC-482 | US Drought Monitor | Weather / Climate / Agriculture | LIVE | None (US Gov NOAA/USDA/UNL public domain) | `usecases/UC-482-us-drought-monitor.md` |
| UC-483 | NLM Clinical Tables | Biomedical / Clinical Coding | Candidate | None (US Gov NLM, unlimited) | `usecases/UC-483-clinicaltables-nlm.md` |
| UC-484 | SIMBAD CDS | Astronomy / Stellar Catalog | Candidate | None (ODbL, unlimited) | `usecases/UC-484-simbad-cds.md` |
| UC-485 | NASA HEASARC | Astronomy / High-Energy Archive | Candidate | None (US Gov NASA, unlimited) | `usecases/UC-485-heasarc-nasa.md` |
| UC-486 | MAST STScI | Astronomy / Space Telescope Archive | Candidate | None (NASA-funded, unlimited) | `usecases/UC-486-mast-stsci.md` |
| UC-487 | Japan NDL Search | Libraries / Japan Bibliography | Candidate | None (Japan Gov, unlimited) | `usecases/UC-487-ndl-search.md` |
| UC-488 | NOAA ERDDAP | Ocean Science / Environment | Candidate | None (US Gov NOAA, unlimited) | `usecases/UC-488-noaa-erddap.md` |
| UC-489 | Statistics Iceland | Government Statistics / Nordic | Candidate | None (Iceland Gov, unlimited) | `usecases/UC-489-stats-iceland.md` |
| UC-490 | Europe PMC | Biomedical Literature / Health | LIVE | None (EBI/EMBL, CC BY 4.0, unlimited) | `usecases/UC-490-europe-pmc.md` |
| UC-491 | ROR (Research Organization Registry) | Research Organizations / Education | LIVE | None (DataCite/CrossRef/CDL, CC0, unlimited) | `usecases/UC-491-ror.md` |
| UC-492 | Catalogue of Life | Biodiversity / Science | LIVE | None (COL/GBIF, CC BY 4.0, unlimited) | `usecases/UC-492-catalogue-of-life.md` |
| UC-493 | Open Context | Archaeology / Education | LIVE | None (Alexandria Archive Institute, CC BY 4.0, unlimited) | `usecases/UC-493-opencontext.md` |
| UC-493-A | PharmGKB | Pharmacogenomics | Candidate (ToS verify) | None (Stanford/NIH, open access) | `usecases/UC-492-pending.md` |
| UC-494 | WTO Timeseries API | Finance / Trade Statistics | LIVE | Azure APIM key (apiportal.wto.org, free developer tier, 10K req/h) | `usecases/UC-494-wto.md` |
| UC-495 | INSEE Sirene API | Business / French Company Registry | LIVE | INSEE portail key (portail-api.insee.fr, free, 500K/month) | `usecases/UC-495-insee.md` |
| UC-496 | Biodiversity Heritage Library | Education / Natural History Literature | LIVE | apikey query param (biodiversitylibrary.org, free) | `usecases/UC-496-bhl.md` |
| UC-497 | Global Fishing Watch | World / Ocean Monitoring | LIVE | Bearer JWT (globalfishingwatch.org, 50K req/day free) | `usecases/UC-497-gfw.md` |
| UC-498 | OpenStates | Legal / Legislative | LIVE | X-API-Key header (openstates.org, 500 req/day free) | `usecases/UC-498-openstates.md` |
| UC-499 | Victoria and Albert Museum | Media / Art & Culture | LIVE | No auth (public API, unlimited) | `usecases/UC-499-vam.md` |
| UC-500 | PharmGKB | Health / Pharmacogenomics | LIVE | No auth (CC BY-SA 4.0, unlimited) | `usecases/UC-500-pharmgkb.md` |
| UC-501 | Brreg | Business / Company Registry | LIVE | No auth (NLOD 2.0, unlimited) | `usecases/UC-501-brreg.md` |
| UC-502 | WoRMS | Marine Biology / Biodiversity | LIVE | No auth (CC BY 4.0, unlimited) | `usecases/UC-502-worms.md` |
| UC-503 | Bank of Canada | Finance | LIVE | No auth (open data, attribution required) | `usecases/UC-503-bankofcanada.md` |
| UC-504 | OpenSenseMap | Weather / IoT Sensors | LIVE | No auth (PDDL 1.0, unlimited) | `usecases/UC-504-opensensemap.md` |
| UC-505 | OpenFDA Medical Devices | Health / Safety | LIVE | Free API key (PROVIDER_KEY_OPENFDA shared w/ UC-011) | `usecases/UC-505-openfda-devices.md` |
| UC-506 | Open-Meteo Marine | Weather / Marine | LIVE | No auth (CC BY 4.0, unlimited) | `usecases/UC-506-open-meteo-marine.md` |
| UC-507 | MFAPI India Mutual Funds | Finance / India | LIVE | No auth (MIT, unlimited) | `usecases/UC-507-mfapi.md` |
| UC-508 | EPA Safe Drinking Water (SDWIS) | Health / Safety | LIVE | No auth (US Gov public domain) | `usecases/UC-508-sdwis.md` |
| UC-509 | BLS Macro (Bureau of Labor Statistics) | Finance / Economics | LIVE | Registered key (500 req/day, free) | `usecases/UC-509-bls-macro.md` |
| UC-510 | MBTA Transit (Boston Public Transit) | Transport | LIVE | No auth (20 req/min, 500 req/day) | `usecases/UC-510-mbta-transit.md` |
| UC-511 | UNHCR Population Data | Humanitarian / World | LIVE | No auth, no rate limits | `usecases/UC-511-unhcr-population.md` |
| UC-512 | GeoNames Geographical Database | Location / Geography | LIVE | Free username, 20K credits/hour | `usecases/UC-512-geonames.md` |
| UC-513 | UK National Grid Carbon Intensity | Environment / Energy | LIVE | CC BY 4.0, no auth, no rate limits | `usecases/UC-513-carbon-intensity-uk.md` |
| UC-514 | Open Topo Data | Location / Elevation | LIVE | MIT, no auth, 1 req/s | `usecases/UC-514-opentopodata.md` |
| UC-515 | MET Norway | Weather / Astronomy | LIVE | CC BY 4.0, no auth, no rate limits | `usecases/UC-515-met-norway.md` |
| UC-516 | Frankfurter.dev | Finance / Currency | LIVE | MIT, no auth, no rate limits | `usecases/UC-516-frankfurter-dev.md` |
| UC-517 | SunriseSunset.io | Space / Astronomy | LIVE | Free commercial use, no auth, no rate limits | `usecases/UC-517-sunrisesunset.md` |
| UC-518 | PokéAPI | Entertainment / Gaming | LIVE | MIT+CC-BY-SA, no auth, fair-use | `usecases/UC-518-pokeapi.md` |
| UC-519 | SA National Treasury Municipal Finance | World / Government Finance | LIVE | Open data, no auth, free commercial use | `usecases/UC-519-south-africa-municipal.md` |
| UC-520 | TVMaze | Entertainment / TV Shows | LIVE | CC BY-SA, no auth, 20 req/10s | `usecases/UC-520-tvmaze.md` |
| UC-521 | HackerNews Firebase | Tech News | LIVE | CC BY 3.0, no auth, no rate limits | `usecases/UC-521-hackernews-firebase.md` |
| UC-522 | HackerNews Algolia | Tech News Search | LIVE | CC BY 3.0, no auth, no rate limits | `usecases/UC-522-hackernews-algolia.md` |
| UC-523 | Wikipedia REST API | Reference / Education | LIVE | CC BY-SA 4.0, no auth, unlimited | `usecases/UC-523-wikipedia-rest.md` |
| UC-524 | iRail Belgium Rail | Travel | LIVE | Open data, no auth, commercial use OK | `usecases/UC-524-irail.md` |
| UC-525 | Norges Bank | Finance / Central Bank | LIVE | NLOD open government data, no auth, unlimited | `usecases/UC-525-norgesbank.md` |

## How to Use

- `/user-usecases list` — show all use cases
- `/user-usecases polymarket` — find use cases matching "polymarket"
- `/user-usecases predictions` — find use cases by category

When adding a new use case, follow the template in `usecases/_TEMPLATE.md`.

---

Read the use case files from the `usecases/` directory relative to this skill for detailed information.
If $ARGUMENTS is "list" or empty, show the index table above.
Otherwise, search for use cases matching $ARGUMENTS.
