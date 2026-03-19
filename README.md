# APIbase.pro — The API Hub for AI Agents

> Search flights, find restaurants, discover events, browse movies, geocode addresses, get directions, generate AI marketing pages, compare prices, track status, trade prediction markets, check walkability scores, search US property listings — all via MCP.
> One endpoint. 179 tools. 36 providers. Pay per call.

**[Live Platform](https://apibase.pro)** | **[Tool Catalog](https://apibase.pro/api/v1/tools)** | **[MCP Endpoint](https://apibase.pro/mcp)** | **[Health](https://apibase.pro/health/ready)**

---

## What is APIbase?

Production MCP server — universal API hub for AI agents. 179 tools across travel, places, maps, events, entertainment, music, health, finance, education, jobs, e-commerce, AI marketing, recipes, space/astronomy, gaming, real estate, dev tools, weather, and more. Search flights (Amadeus, Sabre GDS), find restaurants and places (Foursquare), geocode addresses, search places and POI, get directions (Geoapify/OSM), discover events and concerts (Ticketmaster), browse movies and TV shows (TMDB), search music artists, albums, and recordings (MusicBrainz), discover fresh releases (ListenBrainz), find internet radio stations (RadioBrowser), look up nutrition data and drug safety (USDA, OpenFDA, NIH), get exchange rates, economic indicators, and treasury data (ECB, FRED, World Bank, US Treasury), search academic papers and preprints (OpenAlex, arXiv, PubMed, CrossRef), compare US colleges and earnings (College Scorecard), find jobs and salary data (BLS, O*NET, ESCO, CareerJet), check walkability and transit scores (Walk Score), search US property listings and details (RapidAPI/Realtor.com), trade prediction markets (Polymarket), track crypto, check weather — with more providers shipping regularly. One endpoint, pay per call via x402 USDC micropayments. Auto-registration, zero setup. Covers the most popular API categories agents actually need: travel, local services, maps, events, entertainment, music, health, financial data, education, jobs, real estate, and marketing.

**Built for AI agents, not humans.** Every tool is designed for autonomous discovery, authentication, and invocation via the [Model Context Protocol](https://modelcontextprotocol.io).

<a href="https://glama.ai/mcp/servers/whiteknightonhorse/APIbase">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/whiteknightonhorse/APIbase/badge?v=2" alt="APIbase MCP server" />
</a>

### Why agents use APIbase

- **One MCP endpoint** — `https://apibase.pro/mcp` connects to 36 providers
- **Real-time flight search** — Amadeus + Sabre GDS, 500+ airlines, real prices
- **Places & restaurants** — Foursquare Places API, 100M+ places in 190+ countries
- **Pay per call** — x402 micropayments (USDC), no subscriptions, no minimums
- **Auto-registration** — agents get API keys instantly, zero human setup
- **Production-grade** — 13-stage pipeline, escrow payments, idempotent operations

---

## Quick Start (30 seconds)

### For Claude Desktop / Cursor / Windsurf

**Option A** — Direct connection (Streamable HTTP):

```json
{
  "mcpServers": {
    "apibase": {
      "url": "https://apibase.pro/mcp"
    }
  }
}
```

**Option B** — Via npm package (stdio bridge):

```json
{
  "mcpServers": {
    "apibase": {
      "command": "npx",
      "args": ["-y", "apibase-mcp-client"]
    }
  }
}
```

### For any MCP-compatible agent

```
MCP Endpoint:   https://apibase.pro/mcp
Tool Catalog:   https://apibase.pro/api/v1/tools
Discovery:      https://apibase.pro/.well-known/mcp.json
```

### Register and get your API key

```http
POST /api/v1/agents/register
Content-Type: application/json

{"agent_name": "my-agent", "agent_version": "1.0.0"}
```

Returns `api_key` (`ak_live_...`) and `agent_id`. Store the key securely — it is shown once.

### Call tools via MCP

Connect to `https://apibase.pro/mcp` using the MCP protocol (Streamable HTTP transport).
Authenticate with `Authorization: Bearer ak_live_...`.

All tool calls follow the MCP `tools/call` method.

### Call tools via REST

```http
POST /api/v1/tools/{tool_id}/call
Authorization: Bearer ak_live_...
Content-Type: application/json

{"param1": "value1", "param2": "value2"}
```

---

## Flight Search Example

Ask your AI agent:

> "Find the cheapest flights from New York to London next week"

The agent calls `amadeus.flight_search` and gets real-time prices from 500+ airlines:

```json
{
  "origin": "JFK",
  "destination": "LHR",
  "departure_date": "2026-03-20",
  "adults": 1,
  "travel_class": "ECONOMY",
  "max_results": 5,
  "currency": "USD"
}
```

Returns itineraries with prices, airlines, stops, duration, baggage info — ready for the agent to compare and present.

## Restaurant Search Example

Ask your AI agent:

> "Find the best restaurants near me in Bangkok"

The agent calls `foursquare.place_search` and gets results from 100M+ places worldwide:

```json
{
  "query": "restaurant",
  "near": "Bangkok,Thailand",
  "sort": "rating",
  "limit": 5,
  "open_now": true
}
```

Returns places with names, ratings, categories, distance, hours, price tier, and contact info.

---

## Available Tools (179)

### AIPush — AI Marketing / Page Generation (7 tools)

Fully autonomous AI marketing — your agent sets up a website, analyzes the business, and generates AI-optimized pages without any manual dashboard work. The only human step is creating one DNS CNAME record (`reference.yourdomain.com → cname.aipush.app`), and the agent tells you exactly what to create. MIP (Material Intelligence Pipeline) auto-runs on first setup, SSL auto-provisions, billing is covered by x402 micropayments. Pages are structured for AI assistant answer compilation (ChatGPT, Perplexity, Gemini) and published at `reference.{domain}`. Powered by [AIPush](https://aipush.app).

**Agent workflow:** `setup_website` → DNS CNAME (one manual step) → `setup_website` again → poll `website_status` until ready → `generate_page`

| Tool | Description | Price |
|------|-------------|-------|
| `aipush.setup_website` | Register website, auto-start MIP analysis and SSL provisioning. Returns DNS instructions if CNAME not configured | $1.000 |
| `aipush.website_status` | Poll readiness: mip_status, cf_hostname_status, billing, page counts | $0.002 |
| `aipush.generate_page` | Generate one AI-optimized page (requires mip_status='ready' + SSL active) | $0.050 |
| `aipush.list_pages` | List all published pages for a website | $0.002 |
| `aipush.page_content` | Get full HTML content of a generated page | $0.003 |
| `aipush.website_profile` | Get MIP business analysis — competitors, value props, market | $0.010 |
| `aipush.check_visibility` | AI visibility score — do ChatGPT/Perplexity know your brand? | $0.100 |

### Spoonacular — Recipe / Cooking / Food Data (5 tools)

Search 365K+ recipes with dietary filters, find recipes by ingredients on hand, get full nutrition breakdowns, and analyze custom recipes. Powered by Spoonacular API, 150 free points/day.

| Tool | Description | Price |
|------|-------------|-------|
| `spoonacular.recipe_search` | Search recipes with dietary, cuisine, and meal type filters | $0.003 |
| `spoonacular.recipe_details` | Full recipe: ingredients, instructions, nutrition, dietary labels | $0.003 |
| `spoonacular.by_ingredients` | Find recipes using ingredients you have on hand | $0.003 |
| `spoonacular.ingredient_search` | Search 86K+ ingredients with nutrition data | $0.002 |
| `spoonacular.analyze_recipe` | Analyze a recipe for nutrition and dietary labels | $0.005 |

### NASA — Space / Astronomy (5 tools)

Astronomy Picture of the Day, near-Earth asteroid tracking, solar flare events, full-disc Earth images from DSCOVR satellite, and 140K+ NASA images/videos. Powered by NASA Open APIs + NASA Image Library. 1,000 req/hour free.

| Tool | Description | Price |
|------|-------------|-------|
| `nasa.apod` | Astronomy Picture of the Day — daily curated space image with expert explanation | $0.001 |
| `nasa.neo_feed` | Near-Earth asteroid close approaches — size, hazard class, velocity, miss distance | $0.001 |
| `nasa.donki_flr` | Solar flare events — class, peak time, source region, linked storms (DONKI) | $0.001 |
| `nasa.epic` | Full-disc Earth images from DSCOVR satellite EPIC camera at Lagrange point L1 | $0.001 |
| `nasa.image_search` | Search 140K+ NASA images, videos, and audio from missions and telescopes | $0.001 |

### NASA JPL — Solar System Dynamics (4 tools)

Asteroid close approaches, fireball events, small body database, and impact risk assessments from NASA Jet Propulsion Laboratory. Open access, no API key needed. $0 upstream cost.

| Tool | Description | Price |
|------|-------------|-------|
| `jpl.close_approaches` | Upcoming and past asteroid close approaches to Earth | $0.001 |
| `jpl.fireballs` | Reported fireball (bolide) events — energy, velocity, altitude, coordinates | $0.001 |
| `jpl.small_body` | Asteroid/comet data by name — orbital elements, physical parameters, discovery info | $0.001 |
| `jpl.impact_risk` | Asteroid impact risk from Sentry system — probability, Palermo/Torino scale | $0.001 |

### RAWG — Video Games Database (5 tools)

Search 800K+ video games, get details, screenshots, store links, and game series. Filter by genre, platform, release date, and Metacritic score. Powered by RAWG API, unlimited free tier.

| Tool | Description | Price |
|------|-------------|-------|
| `rawg.game_search` | Search 800K+ games — filter by genre, platform, date, Metacritic | $0.001 |
| `rawg.game_details` | Full game details — description, platforms, developers, Metacritic, requirements | $0.001 |
| `rawg.screenshots` | Game screenshot images with full resolution URLs | $0.001 |
| `rawg.store_links` | Purchase/download links — Steam, PlayStation, Xbox, Epic, GOG, Nintendo | $0.001 |
| `rawg.game_series` | All games in a franchise — sequels, prequels, spin-offs | $0.001 |

### IGDB — Video Games Database by Twitch (5 tools)

Search 280K+ games in IGDB (powered by Twitch), the most comprehensive video game database. Rich relational metadata — genres, platforms, ratings, cover art, developer/publisher info, game media, and platform details. Uses Apicalypse query language. OAuth2 Twitch auth, unlimited free, 4 req/sec.

| Tool | Description | Price |
|------|-------------|-------|
| `igdb.game_search` | Search 280K+ games — genres, platforms, ratings, cover art, release dates | $0.001 |
| `igdb.game_details` | Full game details — storyline, genres, developers, themes, game modes, similar games | $0.001 |
| `igdb.company_info` | Game company info by ID or name — developed/published games, country, logos | $0.001 |
| `igdb.platform_info` | Gaming platform info by ID or name — generation, family, versions, summary | $0.001 |
| `igdb.game_media` | Cover art, screenshots, and video trailers — image URLs and YouTube video IDs | $0.001 |

### QRServer — QR Code Generator & Reader (2 tools)

Generate and decode QR codes via API. Create customizable QR code images (size, color, format, error correction) and read/decode QR codes from image URLs. Fully free, open access, no API key needed. Powered by goqr.me.

| Tool | Description | Price |
|------|-------------|-------|
| `qrserver.generate` | Generate QR code image URL — customizable size, color, format (PNG/SVG), error correction | $0.001 |
| `qrserver.read` | Decode QR code from image URL — extract encoded text or URL | $0.001 |

### Exa — Semantic Web Search & Discovery (3 tools)

Neural/semantic web search powered by a transformer model trained on hyperlinks. Finds conceptually related pages, not just keyword matches. Unique `find_similar` discovers related content from a seed URL. Category filters for companies, research papers, news, people, tweets. 1,000 free requests/month. Powered by Exa (formerly Metaphor).

| Tool | Description | Price |
|------|-------------|-------|
| `exa.search` | Semantic web search — conceptually related results, relevance scores, highlights | $0.012 |
| `exa.contents` | Extract clean text from up to 10 URLs — title, author, date, full text | $0.003 |
| `exa.find_similar` | Find pages semantically similar to a given URL — discover related content | $0.012 |

### Tavily — AI Web Search & Content Extraction (2 tools)

AI-optimized web search built for LLM/agent workflows. Returns synthesized answers + curated results with extracted page content and relevance scores. Also extracts clean readable content from any URL. Purpose-built for RAG pipelines. 1,000 free credits/month. Powered by Tavily.

| Tool | Description | Price |
|------|-------------|-------|
| `tavily.search` | AI web search — synthesized answer + results with extracted content, domain/recency filters | $0.010 |
| `tavily.extract` | Extract clean content from up to 20 URLs — text, title, author, date | $0.010 |

### Serper.dev — Google Search API (4 tools)

Real-time Google Search results via API — web search, news, images, and shopping. Organic results, knowledge graph, answer box, people also ask, related searches. Supports country and language targeting. PAYG at $0.001/call upstream. Powered by Serper.dev.

| Tool | Description | Price |
|------|-------------|-------|
| `serper.web_search` | Google web search — organic results, knowledge graph, answer box, related searches | $0.002 |
| `serper.news_search` | Google News — articles with source, date, snippet, time filter (hour/day/week) | $0.002 |
| `serper.image_search` | Google Images — image URL, thumbnail, dimensions, source domain | $0.002 |
| `serper.shopping_search` | Google Shopping — products with price, source, rating, delivery info | $0.002 |

### Walk Score — Walkability & Transit Intelligence (1 tool)

Walk Score, Transit Score, and Bike Score (0-100) for any US/Canada address. Industry-standard walkability metric used by 30,000+ websites including Apartments.com, Zillow, and Redfin. Measures walkability to amenities, public transit quality, and cycling infrastructure. Free tier: 5,000 calls/day. Powered by Walk Score (Redfin).

| Tool | Description | Price |
|------|-------------|-------|
| `walkscore.score` | Walk Score (0-100), Transit Score (0-100), and Bike Score (0-100) for any address | $0.001 |

### US Real Estate — Property Listings & Details (3 tools)

Search active for-sale property listings across the US with filters for city, state, ZIP, price range, bedrooms, bathrooms, sqft, and property type. Get detailed property info including tax history, HOA fees, photos, and days on market. Location autocomplete for finding valid cities and ZIP codes. Millions of MLS listings from Realtor.com data. Free tier: 500K req/month. Powered by RapidAPI.

| Tool | Description | Price |
|------|-------------|-------|
| `usrealestate.for_sale` | Search for-sale listings — filter by city, state, ZIP, price, beds, baths, type | $0.002 |
| `usrealestate.property_detail` | Full property details — beds, baths, sqft, tax, HOA, photos, sale history | $0.003 |
| `usrealestate.location_suggest` | Location autocomplete — cities, ZIP codes, addresses with coordinates | $0.001 |

### ZeroBounce — Email Validation (1 tool)

Validate email addresses with 99.6% accuracy — checks deliverability, detects disposable/spam trap/abuse/catch-all addresses, verifies MX records and SMTP provider, reports domain age. Pay-as-you-go credits that never expire. Powered by ZeroBounce.

| Tool | Description | Price |
|------|-------------|-------|
| `email.validate` | Validate email — status, disposable/spam trap flags, MX/SMTP, domain age | $0.025 |

### Open Library — Books / ISBN Lookup (4 tools)

Search 40M+ books, look up by ISBN-10/13, get work details across editions, and author profiles. CC0 public domain data from the Internet Archive. No API key needed.

| Tool | Description | Price |
|------|-------------|-------|
| `books.isbn_lookup` | Look up book by ISBN-10/13 — title, publisher, pages, cover, subjects | $0.001 |
| `books.search` | Search books by title, author, subject, or ISBN — ratings, covers, editions | $0.001 |
| `books.work_details` | Get consolidated work metadata across all editions | $0.001 |
| `books.author` | Get author profile — biography, birth/death dates, photo, Wikipedia | $0.001 |

### Jikan — Anime / Manga Database (5 tools)

Search 28K+ anime and 62K+ manga titles from MyAnimeList. Get details, scores, rankings, character cast with voice actors. MIT licensed, no API key needed. Powered by Jikan (unofficial MAL API).

| Tool | Description | Price |
|------|-------------|-------|
| `anime.search` | Search anime by title, genre, type, status, rating | $0.001 |
| `anime.details` | Full anime details — synopsis, score, rank, episodes, studios, genres | $0.001 |
| `manga.details` | Full manga details — chapters, volumes, authors, score, genres | $0.001 |
| `anime.characters` | Character cast with Japanese voice actors | $0.001 |
| `anime.top` | Top-ranked anime — filter by type, airing status, popularity | $0.001 |

### USGS Earthquake — Seismic Intelligence (3 tools)

Real-time global earthquake data from the USGS. Search by location, time, magnitude, and depth. Real-time feeds updated every minute, 100+ years of history, PAGER damage alerts, tsunami flags. US Government open data, no API key needed.

| Tool | Description | Price |
|------|-------------|-------|
| `earthquake.search` | Search earthquakes by location, time, magnitude — PAGER alerts, tsunami flags | $0.001 |
| `earthquake.feed` | Real-time feed by magnitude threshold (4.5+/2.5+/all) and time window | $0.001 |
| `earthquake.count` | Count earthquakes matching criteria without full data | $0.001 |

### ipapi.is — IP Intelligence / Geolocation (2 tools)

IP address intelligence with 9 security flags (VPN, Tor, proxy, datacenter, abuser, crawler, bogon, mobile, satellite), geolocation, ASN/company data, and abuse contacts. Bulk lookup up to 100 IPs per call. Free, open access, no API key needed. Powered by ipapi.is.

| Tool | Description | Price |
|------|-------------|-------|
| `ip.lookup` | IP geolocation + 9 security flags + ASN + company + abuse contacts | $0.002 |
| `ip.bulk_lookup` | Bulk lookup up to 100 IPs — country, city, VPN/Tor/proxy flags, ASN | $0.005 |

### UPCitemdb — Barcode / UPC / Product Lookup (2 tools)

Look up any product by UPC, EAN, GTIN, or ISBN barcode, or search products by name. Returns structured data: title, brand, images, dimensions, weight, category, price range, and marketplace offers. Free, open access, no API key needed. Powered by UPCitemdb.

| Tool | Description | Price |
|------|-------------|-------|
| `upc.lookup` | Look up product by barcode — title, brand, images, offers, price range | $0.002 |
| `upc.search` | Search products by name — matching items with UPC codes and categories | $0.002 |

### WhoisXML — Domain / WHOIS / DNS Intelligence (4 tools)

WHOIS registration data, DNS records, domain availability, and reverse WHOIS search across 374M+ domains and 7,596 TLDs. Powered by WhoisXML API, 500 free queries.

| Tool | Description | Price |
|------|-------------|-------|
| `whois.lookup` | WHOIS data — registrar, dates, nameservers, registrant, status | $0.005 |
| `whois.dns_lookup` | DNS records — A, AAAA, MX, NS, SOA, TXT, CNAME, SRV, CAA | $0.003 |
| `whois.availability` | Check if a domain is available for registration | $0.003 |
| `whois.reverse` | Find all domains by registrant name, email, or company | $0.008 |

### Diffbot — AI-Powered Web Extraction (4 tools)

Extract structured data from any web page using AI. Product data from any e-commerce URL, article text from any blog or news site, auto-detection of page type, and Knowledge Graph search across billions of entities. No retailer-specific integration needed. Powered by Diffbot AI, 10,000 free credits/month.

| Tool | Description | Price |
|------|-------------|-------|
| `diffbot.product_extract` | Extract product data from any e-commerce URL (any retailer) | $0.003 |
| `diffbot.page_analyze` | Auto-detect page type and extract structured data | $0.003 |
| `diffbot.article_extract` | Extract article text, author, date, tags, sentiment | $0.003 |
| `diffbot.search` | Search Knowledge Graph — products, orgs, people, places | $0.005 |

### Maps / Navigation / Geolocation (7 tools)

Geocode addresses, reverse geocode coordinates, search places and POI, get directions, calculate reachability areas, and geolocate IP addresses. Powered by Geoapify (OSM-based). Free tier 3,000 credits/day, ODbL license — caching and redistribution allowed. $0 upstream cost.

| Tool | Description | Price |
|------|-------------|-------|
| `geo.geocode` | Convert address or place name to coordinates (lat/lon) | $0.002 |
| `geo.reverse_geocode` | Convert coordinates to structured address | $0.002 |
| `geo.place_search` | Search POI (restaurants, pharmacies, hotels) near a location | $0.003 |
| `geo.autocomplete` | Autocomplete suggestions for addresses and places | $0.002 |
| `geo.routing` | Turn-by-turn directions (drive, walk, bicycle, transit) | $0.005 |
| `geo.isochrone` | Reachability area — how far you can travel in given time/distance | $0.005 |
| `geo.ip_geolocation` | Geolocate an IPv4/IPv6 address to country, city, coordinates | $0.002 |

### Finance / Banking / Financial Intelligence (6 tools)

Currency exchange rates, macroeconomic indicators, and banking utilities. 6 free open-data APIs: fawazahmed0 (200+ currencies), Frankfurter/ECB (~33 official fiat), FRED (816K+ US economic series), World Bank (16K+ global indicators), US Treasury Fiscal Data, and OpenIBAN (IBAN validation). All $0 upstream cost.

| Tool | Description | Price |
|------|-------------|-------|
| `finance.exchange_rates` | Exchange rates for 200+ fiat and crypto currencies | $0.002 |
| `finance.ecb_rates` | Official ECB reference rates for ~33 fiat currencies | $0.002 |
| `finance.economic_indicator` | FRED data — GDP, CPI, unemployment, interest rates | $0.005 |
| `finance.country_data` | World Bank data — GDP, population, inflation for 200+ countries | $0.005 |
| `finance.treasury_data` | US Treasury — interest rates, national debt, gold reserves | $0.003 |
| `finance.validate_iban` | Validate IBAN and get bank data (BIC, name, city) | $0.001 |

### Health & Nutrition — Government Data APIs (7 tools)

Free government health databases: USDA FoodData Central (350K+ foods, 150 nutrients), OpenFDA (drug adverse events, food recalls, drug labels), and NIH DSLD (200K+ supplement labels). All CC0/public domain.

| Tool | Description | Price |
|------|-------------|-------|
| `health.food_search` | Search 350K+ foods in the USDA database | $0.002 |
| `health.food_details` | Detailed nutrition data — up to 150 nutrients per food | $0.003 |
| `health.drug_events` | FDA FAERS drug adverse event reports | $0.003 |
| `health.food_recalls` | FDA food enforcement and recall reports | $0.002 |
| `health.drug_labels` | Drug labeling: indications, dosage, warnings, interactions | $0.003 |
| `health.supplement_search` | Search 200K+ dietary supplement labels (NIH DSLD) | $0.002 |
| `health.supplement_details` | Full supplement label: ingredients, amounts, daily values | $0.003 |

### Ticketmaster — Events & Entertainment (7 tools)

Discover concerts, sports, theatre, and festivals across 26+ countries. Real-time event data with pricing, venues, and ticket availability.

| Tool | Description | Price |
|------|-------------|-------|
| `ticketmaster.events_search` | Search events by keyword, city, date, or category | $0.003 |
| `ticketmaster.event_details` | Full event details: dates, venues, prices, images | $0.005 |
| `ticketmaster.events_nearby` | Find events near geographic coordinates | $0.003 |
| `ticketmaster.artist_events` | Find events by artist or performer name | $0.005 |
| `ticketmaster.venue_events` | Get upcoming events at a specific venue | $0.003 |
| `ticketmaster.events_trending` | Get trending and popular events | $0.003 |
| `ticketmaster.events_categories` | Get all event classification categories | $0.001 |

### TMDB — Movies & TV Discovery (7 tools)

The world's largest community-maintained entertainment database. 1M+ movies, 218K+ TV shows, 39 languages. Search, discover, get details, find streaming options.

| Tool | Description | Price |
|------|-------------|-------|
| `tmdb.movie_search` | Search movies, TV shows, and people by name | $0.002 |
| `tmdb.movie_details` | Full movie details: cast, crew, trailers, streaming, budget | $0.005 |
| `tmdb.movie_discover` | Discover movies or TV by genre, year, rating, language | $0.005 |
| `tmdb.movie_trending` | Trending movies, TV shows, or people (daily/weekly) | $0.002 |
| `tmdb.movie_similar` | Movie recommendations based on a movie | $0.003 |
| `tmdb.movie_person` | Search actors/directors or get full filmography | $0.003 |
| `tmdb.movie_where_to_watch` | Find streaming, rental, and purchase options by country | $0.003 |

### Music / Audio Discovery (7 tools)

Search artists, albums, songs, and recordings across 50M+ entries (MusicBrainz CC0), discover fresh releases (ListenBrainz CC0), and find 40K+ internet radio stations (RadioBrowser Public Domain). All $0 upstream cost, no API keys needed.

| Tool | Description | Price |
|------|-------------|-------|
| `music.artist_search` | Search 2M+ music artists by name | $0.003 |
| `music.artist_details` | Artist details: tags, ratings, external links, life span | $0.003 |
| `music.release_search` | Search albums, singles, EPs across 50M+ recordings | $0.003 |
| `music.release_details` | Full release: tracklist, artist credits, labels | $0.003 |
| `music.recording_search` | Search songs by title or artist | $0.003 |
| `music.fresh_releases` | Discover recently released albums and singles | $0.003 |
| `music.radio_search` | Search 40K+ internet radio stations by genre, country, language | $0.002 |

### Jobs / Career Intelligence (6 tools)

US salary data, occupation taxonomy, EU skills framework, and global job listings. 4 providers: BLS (US government salary/employment data), O*NET (1,000+ occupations with skills/knowledge/abilities), ESCO (EU Skills/Competences/Occupations in 27 languages), and CareerJet (global job listings across 90+ countries). All $0 upstream cost.

| Tool | Description | Price |
|------|-------------|-------|
| `jobs.salary_data` | US salary/employment timeseries from BLS — wage estimates by occupation and geography | $0.003 |
| `jobs.occupation_search` | Search O*NET occupation taxonomy — 1,000+ occupations with SOC codes | $0.003 |
| `jobs.occupation_details` | O*NET occupation details — skills, knowledge, abilities, technology, tasks | $0.003 |
| `jobs.esco_search` | Search ESCO EU occupations and skills in 27 languages | $0.003 |
| `jobs.esco_details` | ESCO occupation/skill details — essential skills, ISCO codes, relationships | $0.003 |
| `jobs.job_search` | Search global job listings — title, salary, company, location across 90+ countries | $0.003 |

### Foursquare — Places & Restaurant Discovery (5 tools)

Search restaurants, hotels, cafes, attractions worldwide. 100M+ places in 190+ countries with ratings, tips, and photos.

| Tool | Description | Price |
|------|-------------|-------|
| `foursquare.place_search` | Search places by query, location, category, with filtering | $0.025 |
| `foursquare.place_details` | Full details: hours, rating, price, contact, categories | $0.025 |
| `foursquare.place_tips` | User tips and reviews for a place | $0.030 |
| `foursquare.place_photos` | Venue photos with size and classification options | $0.030 |
| `foursquare.autocomplete` | Autocomplete suggestions for places and addresses | $0.020 |

### Amadeus — Flight Search & Travel Data (7 tools)

Real-time flight data from the world's largest GDS. Search flights across 500+ airlines, check live status, find airports.

| Tool | Description | Price |
|------|-------------|-------|
| `amadeus.flight_search` | Real-time flight offers with prices, airlines, stops, duration | $0.035 |
| `amadeus.flight_price` | Confirm final pricing for a flight offer | $0.020 |
| `amadeus.flight_status` | Real-time flight status — delays, cancellations, gates | $0.005 |
| `amadeus.airport_search` | Airport/city search by keyword or IATA code | $0.003 |
| `amadeus.airport_nearest` | Nearest airports by geographic coordinates | $0.003 |
| `amadeus.airport_routes` | All direct destinations from an airport | $0.003 |
| `amadeus.airline_lookup` | Airline details by IATA or ICAO code | $0.002 |

### Sabre GDS — Flight Search & Travel Data (4 tools)

Alternative flight search via Sabre Global Distribution System. Cross-reference prices with Amadeus for best deals.

| Tool | Description | Price |
|------|-------------|-------|
| `sabre.search_flights` | Real-time flight offers with prices between airports | $0.010 |
| `sabre.destination_finder` | Cheapest flight destinations from an origin airport | $0.005 |
| `sabre.airline_lookup` | Airline details by IATA or ICAO code | $0.002 |
| `sabre.travel_themes` | Travel theme categories (beach, skiing, romantic, etc.) | $0.002 |

### Aviasales — Flight Search & Price Intelligence (6 tools)

Search cheap flights, browse price calendars, find popular routes, discover nearby destinations, and look up airport data. Powered by Travelpayouts (Aviasales partner network). Cached prices with up to 24h data freshness, no API key cost for cached endpoints.

| Tool | Description | Price |
|------|-------------|-------|
| `aviasales.search_flights` | Search flights between airports — prices, airlines, stops, booking links | $0.005 |
| `aviasales.price_calendar` | Flight price calendar — cheapest price for each day on a route | $0.001 |
| `aviasales.cheap_flights` | Cheapest flights from an origin — direct and connecting | $0.001 |
| `aviasales.popular_routes` | Popular flight routes from an origin city | $0.001 |
| `aviasales.nearby_destinations` | Find nearby flight destinations within a radius | $0.001 |
| `aviasales.airport_lookup` | Airport lookup by name, city, or IATA/ICAO code | $0.001 |

### Polymarket — Prediction Markets (11 tools)

Search, analyze, and trade on prediction markets. Real-time odds, order books, and trading via CLOB.

| Tool | Description | Price |
|------|-------------|-------|
| `polymarket.search` | Search prediction markets | $0.0005 |
| `polymarket.market_detail` | Market details with probabilities | $0.0005 |
| `polymarket.prices` | Midpoint price for a token | $0.0005 |
| `polymarket.price_history` | Historical price data | $0.0005 |
| `polymarket.get_orderbook` | Order book depth | $0.0005 |
| `polymarket.trending` | Trending markets by volume | $0.0005 |
| `polymarket.place_order` | Place a limit order (GTC/GTD/FOK) | $0.001 |
| `polymarket.cancel_order` | Cancel an open order | $0.001 |
| `polymarket.open_orders` | Get open orders | $0.0005 |
| `polymarket.trade_history` | Trade history | $0.0005 |
| `polymarket.balance` | Balance and allowance | $0.0005 |

### Hyperliquid — DeFi Perpetuals (6 tools)

On-chain perpetual futures exchange. Market data, order books, positions, and account info.

| Tool | Description | Price |
|------|-------------|-------|
| `hyperliquid.market_data` | Market data and funding rates | $0.002 |
| `hyperliquid.order_book` | Order book depth | $0.003 |
| `hyperliquid.klines` | Candlestick / OHLCV data | $0.003 |
| `hyperliquid.positions` | User positions | $0.005 |
| `hyperliquid.account` | Account summary | $0.005 |
| `hyperliquid.vault` | Vault details | $0.005 |

### AsterDEX — DeFi Perpetuals (4 tools)

Decentralized perpetual exchange on Asterism. Market data, order books, and candlestick charts.

| Tool | Description | Price |
|------|-------------|-------|
| `aster.exchange_info` | Exchange info and trading pairs | $0.001 |
| `aster.market_data` | Market data and 24h stats | $0.002 |
| `aster.order_book` | Order book depth | $0.003 |
| `aster.klines` | Candlestick / OHLCV data | $0.003 |

### CoinGecko — Crypto Market Data (9 tools)

Real-time and historical crypto data for 10,000+ coins. Prices, market overviews, trending assets, and DEX pool data via GeckoTerminal.

| Tool | Description | Price |
|------|-------------|-------|
| `crypto.get_price` | Real-time prices for any cryptocurrency | $0.001 |
| `coingecko.get_market` | Market overview with sorting and filtering | $0.001 |
| `crypto.coin_detail` | Detailed coin info (market data, community, dev stats) | $0.002 |
| `crypto.price_history` | Historical price charts (up to 365 days) | $0.002 |
| `crypto.trending` | Currently trending coins on CoinGecko | $0.001 |
| `crypto.global` | Global crypto market statistics | $0.001 |
| `crypto.search` | Search coins, exchanges, and categories | $0.001 |
| `crypto.dex_pools` | DEX liquidity pools via GeckoTerminal | $0.001 |
| `crypto.token_by_address` | Token info by contract address via GeckoTerminal | $0.001 |

### Education / Academic Research (7 tools)

Search 250M+ academic papers (OpenAlex CC0), compare US colleges and graduate earnings (College Scorecard), search biomedical literature (PubMed/NCBI), find preprints (arXiv CC0), and resolve DOIs (CrossRef CC0). All $0 upstream cost, 5 free open-data providers.

| Tool | Description | Price |
|------|-------------|-------|
| `education.paper_search` | Search 250M+ academic papers across all disciplines (OpenAlex) | $0.002 |
| `education.paper_details` | Full paper details by ID or DOI — authors, citations, abstract (OpenAlex) | $0.002 |
| `education.college_search` | Search US colleges — admissions, tuition, earnings, completion rates (College Scorecard) | $0.003 |
| `education.college_details` | Detailed college data by UNITID — costs, outcomes, student demographics (College Scorecard) | $0.003 |
| `education.pubmed_search` | Search 36M+ biomedical articles — clinical trials, reviews, meta-analyses (PubMed/NCBI) | $0.002 |
| `education.arxiv_search` | Search 2.4M+ preprints in physics, math, CS, biology (arXiv) | $0.002 |
| `education.doi_lookup` | Resolve DOI to full publication metadata — authors, journal, citations (CrossRef) | $0.002 |

---

## Payment

| Field | Value |
|-------|-------|
| Protocol | **x402** (HTTP 402 Payment Required) |
| Token | USDC on Base |
| Address | `0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480` |

No subscriptions. No minimums. Pay only for what you use.

## Authentication

| Method | Header | Format |
|--------|--------|--------|
| API Key | `Authorization` | `Bearer ak_live_<32hex>` |
| x402 Payment | `X-Payment` | Base64-encoded payment receipt |

## Response Format

All responses include:
- `X-Request-ID` header for tracing
- JSON body with tool-specific `data` field
- Standard error codes on failure

## Rate Limits

- Per-agent, per-tool token bucket
- Global tier limits: free (20 req/s), paid (100 req/s)
- `429` with `Retry-After` header on limit exceeded
- Redis-backed, fail-closed

## Error Codes

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `validation_error` | Invalid parameters |
| 401 | `unauthorized` | Missing or invalid API key |
| 402 | `payment_required` | x402 payment needed |
| 404 | `not_found` | Tool or resource not found |
| 406 | `not_acceptable` | Wrong Accept header (use `application/json`) |
| 429 | `rate_limited` | Rate limit exceeded |
| 500 | `internal_error` | Server error |
| 502 | `bad_gateway` | Provider unavailable |
| 503 | `service_unavailable` | System not ready |

## MCP Discovery

```json
GET /.well-known/mcp.json

{
  "name": "APIbase",
  "protocol": "MCP",
  "version": "1.0",
  "mcp_endpoint": "https://apibase.pro/mcp",
  "authentication": "x402"
}
```

## Integrations

Connect APIbase to any AI platform:

| Platform | Config location | Setup |
|----------|----------------|-------|
| **Claude Desktop** | `claude_desktop_config.json` | `"url": "https://apibase.pro/mcp"` |
| **Cursor** | `.cursor/mcp.json` | `"url": "https://apibase.pro/mcp"` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | `"serverUrl": "https://apibase.pro/mcp"` |
| **VS Code** | `.vscode/settings.json` | `"url": "https://apibase.pro/mcp"` |
| **Continue.dev** | `~/.continue/config.json` | Streamable HTTP transport |
| **OpenAI GPT** | GPT Editor > Actions | Import `https://apibase.pro/.well-known/openapi.json` |
| **OpenClaw** | `~/.openclaw/openclaw.json` | `"url": "https://apibase.pro/mcp"` |
| **MCP.so** | [mcp.so/server/apibase](https://mcp.so/server/apibase----universal-api-hub-for-ai-agents/whiteknightonhorse) | Listed in directory |

<details>
<summary>Claude Desktop / Cursor</summary>

```json
{
  "mcpServers": {
    "apibase": {
      "url": "https://apibase.pro/mcp"
    }
  }
}
```
</details>

<details>
<summary>Windsurf</summary>

```json
{
  "mcpServers": {
    "apibase": {
      "serverUrl": "https://apibase.pro/mcp"
    }
  }
}
```
</details>

<details>
<summary>VS Code (Copilot)</summary>

```json
{
  "mcp": {
    "servers": {
      "apibase": {
        "type": "http",
        "url": "https://apibase.pro/mcp"
      }
    }
  }
}
```
</details>

<details>
<summary>Continue.dev</summary>

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "streamable-http",
          "url": "https://apibase.pro/mcp"
        }
      }
    ]
  }
}
```
</details>

<details>
<summary>OpenAI GPT Actions</summary>

1. Go to GPT Editor > Actions tab
2. Click "Import from URL"
3. Enter: `https://apibase.pro/.well-known/openapi.json`
4. Set Authentication: API Key, Header `Authorization`, prefix `Bearer`
5. Save — all tools auto-discovered from spec
</details>

<details>
<summary>OpenClaw</summary>

Add to `~/.openclaw/openclaw.json`:

```json
{
  "provider": {
    "mcpServers": {
      "apibase": {
        "url": "https://apibase.pro/mcp"
      }
    }
  }
}
```

Or via CLI:
```bash
openclaw config set provider.mcpServers.apibase.url "https://apibase.pro/mcp"
```
</details>

---

## Architecture

- **13-stage pipeline**: AUTH → IDEMPOTENCY → SCHEMA_VALIDATION → CACHE → RATE_LIMIT → ESCROW → PROVIDER_CALL → LEDGER → RESPONSE
- **Fail-closed**: Redis down = reject all requests, no silent degradation
- **Idempotent**: same request + same key = same result, no double charges
- **Observable**: Prometheus metrics, Grafana dashboards, structured logging

## Self-Hosting

```bash
git clone https://github.com/whiteknightonhorse/APIbase.git
cp .env.example .env    # configure secrets
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Requires: Docker, PostgreSQL 16, Redis 7.2, Node.js 20.

16 containers: API, Worker, Outbox, PostgreSQL, Redis, Nginx, Prometheus, Grafana, Loki, Promtail, Alertmanager, and exporters.

## License

[MIT](LICENSE)