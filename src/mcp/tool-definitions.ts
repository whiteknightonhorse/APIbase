/**
 * Static tool definitions (§12.42, §6.14).
 *
 * Pure data — no side-effect imports. Safe to import from build-time scripts.
 *
 * mcpName = 3-level dot-notation for MCP clients (Smithery quality score).
 * toolId  = 2-level internal pipeline ID (DB, adapters, schemas).
 */

import type { McpToolDefinition } from './types';

/** Read-only annotation preset */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** Trading/write annotation preset */
const TRADING = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;

/** Cancel/delete annotation preset */
const CANCEL = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/**
 * Static tool definitions for all tools.
 *
 * mcpName: 3-level hierarchy for Smithery quality score (provider.category.action).
 * toolId: 2-level internal ID for pipeline routing (provider.action).
 */
export const TOOL_DEFINITIONS: McpToolDefinition[] = [
  // Weather (7)
  {
    toolId: 'weather.get_current',
    mcpName: 'weather.conditions.current',
    title: 'Get Current Weather',
    description: 'Get current weather conditions for a location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'weather.get_forecast',
    mcpName: 'weather.conditions.forecast',
    title: 'Get Weather Forecast',
    description: 'Get weather forecast for a location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'weather.get_alerts',
    mcpName: 'weather.alerts.get',
    title: 'Get Weather Alerts',
    description: 'Get active weather alerts for a location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'weather.get_history',
    mcpName: 'weather.conditions.history',
    title: 'Get Historical Weather',
    description: 'Get historical weather data for a location and date',
    annotations: READ_ONLY,
  },
  {
    toolId: 'weather.air_quality',
    mcpName: 'weather.air.quality',
    title: 'Get Air Quality',
    description: 'Get air quality index for a location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'weather.geocode',
    mcpName: 'weather.location.geocode',
    title: 'Geocode Location',
    description: 'Geocode a location query to coordinates',
    annotations: READ_ONLY,
  },
  {
    toolId: 'weather.compare',
    mcpName: 'weather.conditions.compare',
    title: 'Compare Weather',
    description: 'Compare weather across multiple locations',
    annotations: READ_ONLY,
  },

  // Crypto (9)
  {
    toolId: 'crypto.get_price',
    mcpName: 'crypto.price.current',
    title: 'Get Crypto Prices',
    description: 'Get current prices for cryptocurrencies',
    annotations: READ_ONLY,
  },
  {
    toolId: 'coingecko.get_market',
    mcpName: 'crypto.market.overview',
    title: 'Get Crypto Market Data',
    description: 'Get cryptocurrency market data by category',
    annotations: READ_ONLY,
  },
  {
    toolId: 'crypto.coin_detail',
    mcpName: 'crypto.coin.detail',
    title: 'Get Coin Details',
    description: 'Get detailed information about a cryptocurrency',
    annotations: READ_ONLY,
  },
  {
    toolId: 'crypto.price_history',
    mcpName: 'crypto.price.history',
    title: 'Get Crypto Price History',
    description: 'Get price history for a cryptocurrency',
    annotations: READ_ONLY,
  },
  {
    toolId: 'crypto.trending',
    mcpName: 'crypto.trending.get',
    title: 'Get Trending Coins',
    description: 'Get trending cryptocurrencies',
    annotations: READ_ONLY,
  },
  {
    toolId: 'crypto.global',
    mcpName: 'crypto.global.stats',
    title: 'Get Global Crypto Stats',
    description: 'Get global cryptocurrency market statistics',
    annotations: READ_ONLY,
  },
  {
    toolId: 'crypto.dex_pools',
    mcpName: 'crypto.dex.pools',
    title: 'Get DEX Pools',
    description: 'Get DEX liquidity pool data',
    annotations: READ_ONLY,
  },
  {
    toolId: 'crypto.token_by_address',
    mcpName: 'crypto.token.lookup',
    title: 'Get Token by Address',
    description: 'Get token info by contract address',
    annotations: READ_ONLY,
  },
  {
    toolId: 'crypto.search',
    mcpName: 'crypto.coin.search',
    title: 'Search Cryptocurrencies',
    description: 'Search for cryptocurrencies by name or symbol',
    annotations: READ_ONLY,
  },

  // Polymarket (11: 6 read-only + 5 trading)
  {
    toolId: 'polymarket.search',
    mcpName: 'polymarket.market.search',
    title: 'Search Prediction Markets',
    description: 'Search prediction markets on Polymarket',
    annotations: READ_ONLY,
  },
  {
    toolId: 'polymarket.market_detail',
    mcpName: 'polymarket.market.detail',
    title: 'Get Market Details',
    description: 'Get detailed info about a prediction market',
    annotations: READ_ONLY,
  },
  {
    toolId: 'polymarket.prices',
    mcpName: 'polymarket.market.prices',
    title: 'Get Market Price',
    description: 'Get midpoint price for a prediction market token',
    annotations: READ_ONLY,
  },
  {
    toolId: 'polymarket.price_history',
    mcpName: 'polymarket.market.history',
    title: 'Get Market Price History',
    description: 'Get price history for a prediction market',
    annotations: READ_ONLY,
  },
  {
    toolId: 'polymarket.get_orderbook',
    mcpName: 'polymarket.market.orderbook',
    title: 'Get Order Book',
    description: 'Get order book for a prediction market',
    annotations: READ_ONLY,
  },
  {
    toolId: 'polymarket.trending',
    mcpName: 'polymarket.market.trending',
    title: 'Get Trending Markets',
    description: 'Get trending prediction markets',
    annotations: READ_ONLY,
  },
  {
    toolId: 'polymarket.place_order',
    mcpName: 'polymarket.trading.place_order',
    title: 'Place Order',
    description: 'Place a limit order on Polymarket',
    annotations: TRADING,
  },
  {
    toolId: 'polymarket.cancel_order',
    mcpName: 'polymarket.trading.cancel_order',
    title: 'Cancel Order',
    description: 'Cancel an open order on Polymarket',
    annotations: CANCEL,
  },
  {
    toolId: 'polymarket.open_orders',
    mcpName: 'polymarket.trading.open_orders',
    title: 'Get Open Orders',
    description: 'Get open orders on Polymarket',
    annotations: READ_ONLY,
  },
  {
    toolId: 'polymarket.trade_history',
    mcpName: 'polymarket.trading.history',
    title: 'Get Trade History',
    description: 'Get trade history on Polymarket',
    annotations: READ_ONLY,
  },
  {
    toolId: 'polymarket.balance',
    mcpName: 'polymarket.account.balance',
    title: 'Get Balance',
    description: 'Get balance/allowance on Polymarket',
    annotations: READ_ONLY,
  },

  // Sabre GDS (4)
  {
    toolId: 'sabre.search_flights',
    mcpName: 'sabre.flights.search',
    title: 'Search Flights (Sabre)',
    description: 'Search for real-time flight offers with prices between airports (Sabre GDS)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sabre.destination_finder',
    mcpName: 'sabre.flights.destinations',
    title: 'Find Cheap Destinations',
    description: 'Find cheapest flight destinations from an origin airport',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sabre.airline_lookup',
    mcpName: 'sabre.reference.airline',
    title: 'Airline Lookup (Sabre)',
    description: 'Look up airline details by IATA or ICAO code',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sabre.travel_themes',
    mcpName: 'sabre.reference.themes',
    title: 'Get Travel Themes',
    description: 'Get travel theme categories (beach, skiing, romantic, etc.)',
    annotations: READ_ONLY,
  },

  // Amadeus Travel APIs (7)
  {
    toolId: 'amadeus.flight_search',
    mcpName: 'amadeus.flights.search',
    title: 'Search Flights (Amadeus)',
    description: 'Search for real-time flight offers between airports with prices, airlines, stops, and duration (Amadeus)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'amadeus.flight_price',
    mcpName: 'amadeus.flights.price',
    title: 'Confirm Flight Price',
    description: 'Confirm and get final pricing for a flight offer from Amadeus flight search',
    annotations: READ_ONLY,
  },
  {
    toolId: 'amadeus.flight_status',
    mcpName: 'amadeus.flights.status',
    title: 'Get Flight Status',
    description: 'Get real-time status of a specific flight — delays, cancellations, gate info (Amadeus)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'amadeus.airport_search',
    mcpName: 'amadeus.airports.search',
    title: 'Search Airports',
    description: 'Search airports and cities by keyword or IATA code with autocomplete (Amadeus)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'amadeus.airport_nearest',
    mcpName: 'amadeus.airports.nearest',
    title: 'Find Nearest Airports',
    description: 'Find nearest airports by geographic coordinates (Amadeus)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'amadeus.airport_routes',
    mcpName: 'amadeus.airports.routes',
    title: 'Get Airport Routes',
    description: 'Get all direct flight destinations from an airport (Amadeus)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'amadeus.airline_lookup',
    mcpName: 'amadeus.reference.airline',
    title: 'Airline Lookup (Amadeus)',
    description: 'Look up airline details by IATA or ICAO code (Amadeus)',
    annotations: READ_ONLY,
  },

  // Aviasales (6)
  {
    toolId: 'aviasales.search_flights',
    mcpName: 'aviasales.flights.search',
    title: 'Search Flights (Aviasales)',
    description: 'Search for flights between airports',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aviasales.price_calendar',
    mcpName: 'aviasales.flights.calendar',
    title: 'Flight Price Calendar',
    description: 'Get flight price calendar for a route',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aviasales.cheap_flights',
    mcpName: 'aviasales.flights.cheap',
    title: 'Find Cheap Flights',
    description: 'Find cheapest flights from an origin',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aviasales.popular_routes',
    mcpName: 'aviasales.flights.popular',
    title: 'Popular Flight Routes',
    description: 'Get popular flight routes from an origin',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aviasales.nearby_destinations',
    mcpName: 'aviasales.flights.nearby',
    title: 'Nearby Destinations',
    description: 'Find nearby flight destinations',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aviasales.airport_lookup',
    mcpName: 'aviasales.reference.airport',
    title: 'Airport Lookup',
    description: 'Look up airport by name or code',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Hyperliquid — DeFi Perpetuals (UC-021, Phase 1 read-only)
  // ---------------------------------------------------------------------------
  {
    toolId: 'hyperliquid.market_data',
    mcpName: 'hyperliquid.markets.data',
    title: 'Hyperliquid Market Data',
    description: 'Get market metadata and mid prices for all perpetual pairs on Hyperliquid',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hyperliquid.order_book',
    mcpName: 'hyperliquid.markets.orderbook',
    title: 'Hyperliquid Order Book',
    description: 'Get L2 order book depth for a perpetual pair on Hyperliquid',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hyperliquid.klines',
    mcpName: 'hyperliquid.markets.klines',
    title: 'Hyperliquid Klines',
    description: 'Get candlestick (OHLCV) data for a perpetual pair on Hyperliquid',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hyperliquid.positions',
    mcpName: 'hyperliquid.account.positions',
    title: 'Hyperliquid Positions',
    description: 'Get open positions for a user wallet on Hyperliquid',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hyperliquid.account',
    mcpName: 'hyperliquid.account.summary',
    title: 'Hyperliquid Account',
    description: 'Get account summary and margin details for a user wallet on Hyperliquid',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hyperliquid.vault',
    mcpName: 'hyperliquid.vaults.details',
    title: 'Hyperliquid Vault',
    description: 'Get vault details including performance and TVL on Hyperliquid',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Foursquare Places (UC-003, 5 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'foursquare.place_search',
    mcpName: 'foursquare.places.search',
    title: 'Search Places',
    description: 'Search for places (restaurants, hotels, cafes, attractions) worldwide by name, category, or location (Foursquare)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'foursquare.place_details',
    mcpName: 'foursquare.places.details',
    title: 'Get Place Details',
    description: 'Get detailed information about a place — hours, rating, price, contact, categories (Foursquare)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'foursquare.place_tips',
    mcpName: 'foursquare.places.tips',
    title: 'Get Place Tips',
    description: 'Get user tips and reviews for a place (Foursquare)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'foursquare.place_photos',
    mcpName: 'foursquare.places.photos',
    title: 'Get Place Photos',
    description: 'Get photos for a place with size and classification options (Foursquare)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'foursquare.autocomplete',
    mcpName: 'foursquare.places.autocomplete',
    title: 'Autocomplete Places',
    description: 'Get autocomplete suggestions for places, addresses, and searches (Foursquare)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Ticketmaster — Events & Entertainment (UC-008, 7 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'ticketmaster.events_search',
    mcpName: 'ticketmaster.events.search',
    title: 'Search Events',
    description: 'Search for events (concerts, sports, theatre, festivals) by keyword, city, date, or category across 26+ countries (Ticketmaster)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ticketmaster.event_details',
    mcpName: 'ticketmaster.events.details',
    title: 'Get Event Details',
    description: 'Get full details for an event — dates, venues, prices, images, classifications, seat map (Ticketmaster)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ticketmaster.events_nearby',
    mcpName: 'ticketmaster.events.nearby',
    title: 'Find Nearby Events',
    description: 'Find events near geographic coordinates with radius filter (Ticketmaster)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ticketmaster.artist_events',
    mcpName: 'ticketmaster.events.by_artist',
    title: 'Get Artist Events',
    description: 'Find events by artist or performer name with optional country and date filters (Ticketmaster)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ticketmaster.venue_events',
    mcpName: 'ticketmaster.events.by_venue',
    title: 'Get Venue Events',
    description: 'Get upcoming events at a specific venue by venue ID (Ticketmaster)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ticketmaster.events_trending',
    mcpName: 'ticketmaster.events.trending',
    title: 'Get Trending Events',
    description: 'Get trending and popular events sorted by relevance (Ticketmaster)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ticketmaster.events_categories',
    mcpName: 'ticketmaster.events.categories',
    title: 'Get Event Categories',
    description: 'Get all event classification categories — segments, genres, sub-genres (Ticketmaster)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // TMDB — Movies & TV Discovery (UC-010, 7 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'tmdb.movie_search',
    mcpName: 'tmdb.movies.search',
    title: 'Search Movies & TV',
    description: 'Search for movies, TV shows, and people by name across 1M+ titles in 39 languages (TMDB)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tmdb.movie_details',
    mcpName: 'tmdb.movies.details',
    title: 'Get Movie Details',
    description: 'Get full movie details — cast, crew, trailers, ratings, streaming providers, runtime, budget, revenue (TMDB)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tmdb.movie_discover',
    mcpName: 'tmdb.movies.discover',
    title: 'Discover Movies & TV',
    description: 'Discover movies or TV shows by genre, year, rating, language, and sort order (TMDB)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tmdb.movie_trending',
    mcpName: 'tmdb.movies.trending',
    title: 'Get Trending Movies & TV',
    description: 'Get trending movies, TV shows, or people — daily or weekly (TMDB)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tmdb.movie_similar',
    mcpName: 'tmdb.movies.similar',
    title: 'Get Similar Movies',
    description: 'Get movie recommendations based on a movie ID — similar genres, themes, cast (TMDB)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tmdb.movie_person',
    mcpName: 'tmdb.movies.person',
    title: 'Search Person / Filmography',
    description: 'Search for actors, directors, or crew by name, or get full filmography by person ID (TMDB)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tmdb.movie_where_to_watch',
    mcpName: 'tmdb.movies.where_to_watch',
    title: 'Where to Watch',
    description: 'Find streaming, rental, and purchase options for a movie or TV show by country (TMDB)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Health & Nutrition — Government Data APIs (UC-011, 7 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'health.food_search',
    mcpName: 'health.nutrition.food_search',
    title: 'Search Foods (USDA)',
    description: 'Search 350K+ foods in the USDA FoodData Central database — nutrition facts, ingredients, branded products, and reference foods',
    annotations: READ_ONLY,
  },
  {
    toolId: 'health.food_details',
    mcpName: 'health.nutrition.food_details',
    title: 'Get Food Nutrition Details',
    description: 'Get detailed nutrition data for a food item — up to 150 nutrients, portions, serving sizes, ingredients (USDA)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'health.drug_events',
    mcpName: 'health.safety.drug_events',
    title: 'Search Drug Adverse Events',
    description: 'Search FDA FAERS database for drug adverse event reports — side effects, reactions, patient demographics (OpenFDA)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'health.food_recalls',
    mcpName: 'health.safety.food_recalls',
    title: 'Search Food Recalls',
    description: 'Search FDA food enforcement and recall reports — contamination, mislabeling, safety alerts (OpenFDA)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'health.drug_labels',
    mcpName: 'health.safety.drug_labels',
    title: 'Search Drug Labels',
    description: 'Search drug labeling data — indications, dosage, warnings, interactions, contraindications (OpenFDA)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'health.supplement_search',
    mcpName: 'health.supplements.search',
    title: 'Search Dietary Supplements',
    description: 'Search 200K+ dietary supplement labels in the NIH DSLD database — vitamins, minerals, herbal products',
    annotations: READ_ONLY,
  },
  {
    toolId: 'health.supplement_details',
    mcpName: 'health.supplements.details',
    title: 'Get Supplement Label Details',
    description: 'Get full supplement label data — ingredients, amounts per serving, daily values, target groups (NIH DSLD)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Finance / Banking / Financial Intelligence (UC-016, 6 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'finance.exchange_rates',
    mcpName: 'finance.currency.rates',
    title: 'Get Exchange Rates',
    description: 'Get currency exchange rates for 200+ fiat and crypto currencies with optional historical dates (fawazahmed0 CDN)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'finance.ecb_rates',
    mcpName: 'finance.currency.ecb',
    title: 'Get ECB Exchange Rates',
    description: 'Get official European Central Bank reference exchange rates for ~33 fiat currencies (Frankfurter/ECB)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'finance.economic_indicator',
    mcpName: 'finance.macro.indicator',
    title: 'Get Economic Indicator',
    description: 'Get US economic data from 816K+ FRED series — GDP, CPI, unemployment, interest rates, money supply (Federal Reserve)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'finance.country_data',
    mcpName: 'finance.macro.country',
    title: 'Get Country Economic Data',
    description: 'Get global development indicators from World Bank — GDP, population, inflation, trade, poverty for 200+ countries',
    annotations: READ_ONLY,
  },
  {
    toolId: 'finance.treasury_data',
    mcpName: 'finance.treasury.data',
    title: 'Get US Treasury Data',
    description: 'Get US Treasury fiscal data — interest rates on federal debt, national debt, debt outstanding, gold reserves, exchange rates',
    annotations: READ_ONLY,
  },
  {
    toolId: 'finance.validate_iban',
    mcpName: 'finance.banking.iban',
    title: 'Validate IBAN',
    description: 'Validate an IBAN number and get associated bank data — BIC/SWIFT code, bank name, city (OpenIBAN)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Music / Audio Discovery (UC-018, 7 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'music.artist_search',
    mcpName: 'music.artists.search',
    title: 'Search Music Artists',
    description: 'Search for music artists by name across 2M+ artists — biography, country, tags, aliases (MusicBrainz)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'music.artist_details',
    mcpName: 'music.artists.details',
    title: 'Get Artist Details',
    description: 'Get detailed artist info by MusicBrainz ID — tags, ratings, external links, life span, area (MusicBrainz)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'music.release_search',
    mcpName: 'music.releases.search',
    title: 'Search Music Releases',
    description: 'Search for albums, singles, and EPs across 50M+ recordings — title, artist, date (MusicBrainz)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'music.release_details',
    mcpName: 'music.releases.details',
    title: 'Get Release Details',
    description: 'Get full release details by MusicBrainz ID — artist credits, labels, media formats (MusicBrainz)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'music.recording_search',
    mcpName: 'music.recordings.search',
    title: 'Search Music Recordings',
    description: 'Search for songs and recordings by title or artist — duration, release history, artist credits (MusicBrainz)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'music.fresh_releases',
    mcpName: 'music.discover.fresh',
    title: 'Get Fresh Music Releases',
    description: 'Discover recently released albums and singles from the past N days — trending new music (ListenBrainz)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'music.radio_search',
    mcpName: 'music.radio.search',
    title: 'Search Radio Stations',
    description: 'Search 40K+ internet radio stations by name, genre, country, or language — streaming URLs, bitrate, codec (RadioBrowser)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // AsterDEX — DeFi Perpetuals (UC-020, Phase 1 read-only)
  // ---------------------------------------------------------------------------
  {
    toolId: 'aster.exchange_info',
    mcpName: 'aster.exchange.info',
    title: 'AsterDEX Exchange Info',
    description: 'Get exchange information and available trading pairs on AsterDEX',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aster.market_data',
    mcpName: 'aster.markets.ticker',
    title: 'AsterDEX Market Data',
    description: 'Get 24-hour ticker statistics for trading pairs on AsterDEX',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aster.order_book',
    mcpName: 'aster.markets.orderbook',
    title: 'AsterDEX Order Book',
    description: 'Get order book depth for a trading pair on AsterDEX',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aster.klines',
    mcpName: 'aster.markets.klines',
    title: 'AsterDEX Klines',
    description: 'Get candlestick (OHLCV) data for a trading pair on AsterDEX',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Jobs / Career Intelligence (UC-015, 6 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'jobs.salary_data',
    mcpName: 'jobs.salary.data',
    title: 'Get Salary Data',
    description: 'Get US salary and employment timeseries data from BLS — wage estimates, employment counts, occupational statistics by SOC code and geography',
    annotations: READ_ONLY,
  },
  {
    toolId: 'jobs.occupation_search',
    mcpName: 'jobs.occupations.search',
    title: 'Search Occupations',
    description: 'Search O*NET occupation taxonomy by keyword — 1,000+ occupations with SOC codes, titles, and relevance scores',
    annotations: READ_ONLY,
  },
  {
    toolId: 'jobs.occupation_details',
    mcpName: 'jobs.occupations.details',
    title: 'Get Occupation Details',
    description: 'Get detailed occupation info from O*NET by SOC code — overview, skills, knowledge, abilities, technology skills, tasks',
    annotations: READ_ONLY,
  },
  {
    toolId: 'jobs.esco_search',
    mcpName: 'jobs.skills.search',
    title: 'Search EU Skills & Occupations',
    description: 'Search ESCO (European Skills/Competences/Occupations) taxonomy — occupations and skills in 27 EU languages',
    annotations: READ_ONLY,
  },
  {
    toolId: 'jobs.esco_details',
    mcpName: 'jobs.skills.details',
    title: 'Get EU Skill/Occupation Details',
    description: 'Get ESCO resource details by URI — occupation descriptions, essential/optional skills, ISCO codes, skill relationships',
    annotations: READ_ONLY,
  },
  {
    toolId: 'jobs.job_search',
    mcpName: 'jobs.listings.search',
    title: 'Search Job Listings',
    description: 'Search global job listings via CareerJet — title, company, salary, location, contract type across 90+ countries',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Education / Academic Research (UC-017, 7 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'education.paper_search',
    mcpName: 'education.papers.search',
    title: 'Search Academic Papers',
    description: 'Search 250M+ academic papers across all disciplines — citations, authors, institutions, open access status (OpenAlex)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'education.paper_details',
    mcpName: 'education.papers.details',
    title: 'Get Paper Details',
    description: 'Get full details for an academic paper by OpenAlex ID or DOI — authors, citations, abstract, references, open access links (OpenAlex)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'education.college_search',
    mcpName: 'education.colleges.search',
    title: 'Search US Colleges',
    description: 'Search US colleges and universities — admissions, tuition, enrollment, earnings, completion rates (College Scorecard)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'education.college_details',
    mcpName: 'education.colleges.details',
    title: 'Get College Details',
    description: 'Get detailed data for a US college by UNITID — admissions rate, costs, student outcomes, earnings after graduation (College Scorecard)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'education.pubmed_search',
    mcpName: 'education.pubmed.search',
    title: 'Search PubMed',
    description: 'Search 36M+ biomedical and life science articles — clinical trials, reviews, meta-analyses with date and type filters (PubMed/NCBI)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'education.arxiv_search',
    mcpName: 'education.arxiv.search',
    title: 'Search arXiv Preprints',
    description: 'Search 2.4M+ preprints in physics, math, CS, biology, and more — full text, authors, categories, PDF links (arXiv)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'education.doi_lookup',
    mcpName: 'education.crossref.doi',
    title: 'Lookup DOI',
    description: 'Resolve a DOI to full publication metadata — title, authors, journal, citations, funding, license (CrossRef)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Maps / Navigation / Geolocation (UC-012, 7 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'geo.geocode',
    mcpName: 'geo.address.geocode',
    title: 'Geocode Address',
    description: 'Convert an address, place name, or landmark to geographic coordinates (lat/lon) with structured address data (Geoapify/OSM)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geo.reverse_geocode',
    mcpName: 'geo.address.reverse',
    title: 'Reverse Geocode',
    description: 'Convert geographic coordinates (lat/lon) to a structured address — street, city, country, postal code (Geoapify/OSM)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geo.place_search',
    mcpName: 'geo.places.search',
    title: 'Search Places & POI',
    description: 'Search points of interest (restaurants, pharmacies, hotels, attractions) near a location by category and radius (Geoapify/OSM)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geo.autocomplete',
    mcpName: 'geo.address.autocomplete',
    title: 'Autocomplete Address',
    description: 'Get autocomplete suggestions as you type an address or place name — for real-time search UX (Geoapify/OSM)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geo.routing',
    mcpName: 'geo.navigation.route',
    title: 'Get Directions',
    description: 'Get turn-by-turn driving, walking, cycling, or transit directions between two points with distance and time (Geoapify/OSM)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geo.isochrone',
    mcpName: 'geo.navigation.isochrone',
    title: 'Get Isochrone',
    description: 'Get reachability area (isochrone) — polygon showing how far you can travel from a point in a given time or distance (Geoapify/OSM)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geo.ip_geolocation',
    mcpName: 'geo.ip.geolocation',
    title: 'IP Geolocation',
    description: 'Geolocate an IP address (IPv4/IPv6) to country, city, coordinates, and network info (Geoapify)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // AIPush — AI Marketing / Page Generation (UC-019, 7 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'aipush.setup_website',
    mcpName: 'aipush.website.setup',
    title: 'Setup Website for AI Marketing',
    description: 'Register a website for AI marketing. Call with domain + target_url. If DNS is not configured, returns DNS_NOT_VERIFIED with exact CNAME record instructions — relay to user: reference.{domain} → cname.aipush.app. After user creates DNS record, call again. On success: client registered, MIP analysis starts automatically, SSL provisioning begins. Poll website_status until mip_status=\'ready\' and cf_hostname_status=\'active\', then use generate_page. Idempotent (AIPush)',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    toolId: 'aipush.website_status',
    mcpName: 'aipush.website.status',
    title: 'Check Website Status',
    description: 'Poll website readiness after setup_website. Returns billing_status, mip_status (\'empty\'|\'pending\'|\'ready\'), cf_hostname_status, cf_ssl_status, pages_total. Gate your workflow: wait for mip_status=\'ready\' AND cf_hostname_status=\'active\' before calling generate_page. Safe to poll repeatedly (AIPush)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aipush.generate_page',
    mcpName: 'aipush.pages.generate',
    title: 'Generate AI Marketing Page',
    description: 'Requires mip_status=\'ready\' and cf_hostname_status=\'active\' (check website_status first). Generates one AI-optimized HTML page structured for AI assistant answer compilation (ChatGPT, Perplexity, Gemini). Page includes decision question, short answer with CTA, comparison, pricing, FAQ. Published at reference.{domain}/{slug}. Optional keyword parameter targets specific search intent (AIPush)',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    toolId: 'aipush.list_pages',
    mcpName: 'aipush.pages.list',
    title: 'List Generated Pages',
    description: 'List all published AI marketing pages for a website with URLs, titles, and publish dates (AIPush)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aipush.page_content',
    mcpName: 'aipush.pages.content',
    title: 'Get Page Content',
    description: 'Get full HTML content and metadata of a specific generated page by slug (AIPush)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aipush.website_profile',
    mcpName: 'aipush.analysis.profile',
    title: 'Get Website Business Profile',
    description: 'Get MIP business analysis results — business name, category, location, competitors, value propositions, and market surface data (AIPush)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aipush.check_visibility',
    mcpName: 'aipush.analysis.visibility',
    title: 'Check AI Visibility Score',
    description: 'Test whether AI assistants (ChatGPT, Perplexity, Gemini) know about and recommend a brand — returns per-model visibility scores (AIPush)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Diffbot — AI-Powered Web Extraction (UC-026, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'diffbot.product_extract',
    mcpName: 'diffbot.products.extract',
    title: 'Extract Product Data',
    description: 'Extract structured product data from any e-commerce URL — title, price, brand, specs, images, reviews. Works on any retailer without custom integration (Diffbot)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'diffbot.page_analyze',
    mcpName: 'diffbot.pages.analyze',
    title: 'Analyze Web Page',
    description: 'Auto-detect page type (product, article, image, video) and extract structured data from any URL using AI (Diffbot)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'diffbot.article_extract',
    mcpName: 'diffbot.articles.extract',
    title: 'Extract Article Text',
    description: 'Extract article text, author, date, tags, sentiment, and images from any blog or news URL with multi-page support (Diffbot)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'diffbot.search',
    mcpName: 'diffbot.knowledge.search',
    title: 'Search Knowledge Graph',
    description: 'Search Diffbot Knowledge Graph for products, organizations, people, and places — billions of structured entities from the web (Diffbot)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // WhoisXML API — Domain / WHOIS / DNS Intelligence (UC-028, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'whois.lookup',
    mcpName: 'whois.domain.lookup',
    title: 'WHOIS Lookup',
    description: 'Get WHOIS registration data for any domain — registrar, creation/expiry dates, nameservers, registrant contact, status across 374M+ domains and 7,596 TLDs (WhoisXML)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'whois.dns_lookup',
    mcpName: 'whois.dns.lookup',
    title: 'DNS Lookup',
    description: 'Get DNS records for a domain — A, AAAA, MX, NS, SOA, TXT, CNAME, SRV, CAA records with TTL and raw data (WhoisXML)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'whois.availability',
    mcpName: 'whois.domain.availability',
    title: 'Check Domain Availability',
    description: 'Check if a domain name is available for registration — fast DNS check or thorough DNS+WHOIS verification (WhoisXML)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'whois.reverse',
    mcpName: 'whois.domain.reverse',
    title: 'Reverse WHOIS Search',
    description: 'Find all domains registered by a person, company, or email — reverse WHOIS lookup for OSINT and brand monitoring (WhoisXML)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Spoonacular — Recipe / Cooking / Food Data (UC-031, 5 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'spoonacular.recipe_search',
    mcpName: 'spoonacular.recipes.search',
    title: 'Search Recipes',
    description: 'Search 365K+ recipes with dietary filters (vegan, keto, gluten-free), cuisine, meal type, and max prep time — includes nutrition data per result (Spoonacular)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'spoonacular.recipe_details',
    mcpName: 'spoonacular.recipes.details',
    title: 'Get Recipe Details',
    description: 'Get full recipe details by ID — ingredients, step-by-step instructions, nutrition facts, dietary labels, prep time, servings, and price per serving (Spoonacular)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'spoonacular.by_ingredients',
    mcpName: 'spoonacular.recipes.by_ingredients',
    title: 'Find Recipes by Ingredients',
    description: 'Find recipes using ingredients you have on hand — shows used/missing ingredients count, ranked by ingredient match (Spoonacular)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'spoonacular.ingredient_search',
    mcpName: 'spoonacular.ingredients.search',
    title: 'Search Ingredients',
    description: 'Search 86K+ food ingredients with nutrition data — sortable by calories, protein, fat, or carbs (Spoonacular)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'spoonacular.analyze_recipe',
    mcpName: 'spoonacular.recipes.analyze',
    title: 'Analyze Recipe Nutrition',
    description: 'Analyze a recipe by title and ingredient list — returns full nutrition breakdown, dietary labels, and caloric distribution (Spoonacular)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // NASA Open APIs — Space / Astronomy (UC-034, 5 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'nasa.apod',
    mcpName: 'nasa.astronomy.apod',
    title: 'Astronomy Picture of the Day',
    description: 'Get NASA Astronomy Picture of the Day — daily curated space image or video with expert explanation, dating back to 1995 (NASA APOD)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nasa.neo_feed',
    mcpName: 'nasa.asteroids.feed',
    title: 'Near-Earth Asteroids Feed',
    description: 'Get near-Earth asteroid close approaches for a date range — size estimates, hazard classification, velocity, miss distance (NASA NeoWs)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nasa.donki_flr',
    mcpName: 'nasa.space_weather.flares',
    title: 'Solar Flare Events',
    description: 'Get solar flare events from the Space Weather Database — class, peak time, source region, linked CMEs and geomagnetic storms (NASA DONKI)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nasa.epic',
    mcpName: 'nasa.earth.epic',
    title: 'Earth Camera (EPIC)',
    description: 'Get full-disc Earth images from the DSCOVR satellite EPIC camera — daily natural color photos from Lagrange point L1, 1.5M km away (NASA EPIC)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nasa.image_search',
    mcpName: 'nasa.media.search',
    title: 'Search NASA Images & Videos',
    description: 'Search NASA Image and Video Library — 140K+ images, videos, and audio from missions, telescopes, and events with metadata and download links (NASA)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // NASA JPL Solar System Dynamics (UC-035, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'jpl.close_approaches',
    mcpName: 'jpl.asteroids.approaches',
    title: 'Asteroid Close Approaches',
    description: 'Get upcoming and past asteroid close approaches to Earth — distance, velocity, size, sorted by date or distance (NASA JPL)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'jpl.fireballs',
    mcpName: 'jpl.events.fireballs',
    title: 'Fireball Events',
    description: 'Get reported fireball (bolide) events — atmospheric entry energy, velocity, altitude, geographic coordinates (NASA JPL CNEOS)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'jpl.small_body',
    mcpName: 'jpl.bodies.lookup',
    title: 'Small Body Lookup',
    description: 'Look up asteroid or comet data by name/designation — orbital elements, physical parameters, discovery info, hazard classification (NASA JPL SBDB)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'jpl.impact_risk',
    mcpName: 'jpl.asteroids.sentry',
    title: 'Asteroid Impact Risk (Sentry)',
    description: 'Get asteroid impact risk assessments from the Sentry monitoring system — impact probability, Palermo/Torino scale, size estimates (NASA JPL)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // RAWG — Video Games Database (UC-037, 5 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'rawg.game_search',
    mcpName: 'rawg.games.search',
    title: 'Search Video Games',
    description: 'Search 800K+ video games — filter by genre, platform, release date, Metacritic score, with ratings, screenshots, and store links (RAWG)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'rawg.game_details',
    mcpName: 'rawg.games.details',
    title: 'Get Game Details',
    description: 'Get full game details by ID or slug — description, platforms, genres, developers, publishers, ratings, Metacritic score, system requirements (RAWG)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'rawg.screenshots',
    mcpName: 'rawg.games.screenshots',
    title: 'Get Game Screenshots',
    description: 'Get screenshot images for a game — full resolution URLs with dimensions (RAWG)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'rawg.store_links',
    mcpName: 'rawg.games.stores',
    title: 'Get Game Store Links',
    description: 'Get purchase/download links for a game across stores — Steam, PlayStation Store, Xbox, Epic, GOG, Nintendo (RAWG)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'rawg.game_series',
    mcpName: 'rawg.games.series',
    title: 'Get Game Series',
    description: 'Get all games in the same series/franchise — sequels, prequels, and spin-offs with ratings and release dates (RAWG)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // IGDB — Video Games Database by Twitch (UC-039, 5 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'igdb.game_search',
    mcpName: 'igdb.games.search',
    title: 'Search Games (IGDB)',
    description: 'Search 280K+ games in IGDB (Twitch) — rich metadata with genres, platforms, ratings, cover art, and release dates',
    annotations: READ_ONLY,
  },
  {
    toolId: 'igdb.game_details',
    mcpName: 'igdb.games.details',
    title: 'Get Game Details (IGDB)',
    description: 'Get full game details by IGDB ID — storyline, genres, platforms, developers, publishers, themes, game modes, similar games, and websites',
    annotations: READ_ONLY,
  },
  {
    toolId: 'igdb.company_info',
    mcpName: 'igdb.companies.info',
    title: 'Get Company Info (IGDB)',
    description: 'Look up game companies by ID or search by name — description, country, developed/published game IDs, logos, and websites',
    annotations: READ_ONLY,
  },
  {
    toolId: 'igdb.platform_info',
    mcpName: 'igdb.platforms.info',
    title: 'Get Platform Info (IGDB)',
    description: 'Look up gaming platforms by ID or search by name — abbreviation, generation, platform family, versions, and summary',
    annotations: READ_ONLY,
  },
  {
    toolId: 'igdb.game_media',
    mcpName: 'igdb.games.media',
    title: 'Get Game Media (IGDB)',
    description: 'Get cover art, screenshots, and video trailers for a game — image URLs with dimensions and YouTube video IDs',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // QRServer — QR Code Generator & Reader (UC-040, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'qrserver.generate',
    mcpName: 'qrserver.qr.generate',
    title: 'Generate QR Code',
    description: 'Generate a QR code image URL from text or URL — customizable size, color, background, format (PNG/SVG), error correction level. Returns direct image URL (goqr.me)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'qrserver.read',
    mcpName: 'qrserver.qr.read',
    title: 'Read QR Code',
    description: 'Decode a QR code from an image URL — extracts the encoded text or URL from any QR code image (goqr.me)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // UPCitemdb — Barcode / UPC / Product Lookup (UC-041, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'upc.lookup',
    mcpName: 'upc.products.lookup',
    title: 'Product Barcode Lookup',
    description: 'Look up a product by UPC, EAN, GTIN, or ISBN barcode — returns title, brand, images, dimensions, weight, category, price range, and marketplace offers (UPCitemdb)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'upc.search',
    mcpName: 'upc.products.search',
    title: 'Product Search by Name',
    description: 'Search products by name, brand, or description — returns matching items with UPC codes, images, categories, and price ranges (UPCitemdb)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // ipapi.is — IP Intelligence / Geolocation (UC-045, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'ip.lookup',
    mcpName: 'ip.intelligence.lookup',
    title: 'IP Address Lookup',
    description: 'Look up any IP address — geolocation (country, city, coordinates), 9 security flags (VPN, Tor, proxy, datacenter, abuser, crawler, bogon, mobile, satellite), ASN, company info, abuse contacts (ipapi.is)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ip.bulk_lookup',
    mcpName: 'ip.intelligence.bulk',
    title: 'Bulk IP Lookup',
    description: 'Look up multiple IP addresses in one call (max 100) — country, city, VPN/Tor/proxy flags, ASN, and organization for each IP (ipapi.is)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // USGS Earthquake Hazards Program (UC-048, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'earthquake.search',
    mcpName: 'earthquake.events.search',
    title: 'Search Earthquakes',
    description: 'Search global earthquakes by time, location, magnitude, and depth — returns magnitude, coordinates, tsunami flags, PAGER alerts, and felt reports. 100+ years of data, updated every minute (USGS)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'earthquake.feed',
    mcpName: 'earthquake.events.feed',
    title: 'Real-Time Earthquake Feed',
    description: 'Get real-time earthquake feed by magnitude threshold (significant/4.5+/2.5+/1.0+/all) and time window (hour/day/week/month) — updated every minute (USGS)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'earthquake.count',
    mcpName: 'earthquake.events.count',
    title: 'Count Earthquakes',
    description: 'Count earthquakes matching search criteria without returning full data — useful for statistics and monitoring thresholds (USGS)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Jikan — Anime / Manga Database via MyAnimeList (UC-051, 5 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'anime.search',
    mcpName: 'anime.titles.search',
    title: 'Search Anime',
    description: 'Search 28K+ anime titles by name, genre, type, status, and rating — scores, episodes, studios, seasons (MyAnimeList via Jikan)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'anime.details',
    mcpName: 'anime.titles.details',
    title: 'Get Anime Details',
    description: 'Get full anime details by MAL ID — synopsis, score, rank, episodes, studios, genres, themes, demographics, rating (MyAnimeList via Jikan)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'manga.details',
    mcpName: 'anime.manga.details',
    title: 'Get Manga Details',
    description: 'Get full manga details by MAL ID — synopsis, chapters, volumes, authors, score, rank, genres (MyAnimeList via Jikan)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'anime.characters',
    mcpName: 'anime.titles.characters',
    title: 'Get Anime Characters',
    description: 'Get character cast and Japanese voice actors for an anime — names, roles (main/supporting), images (MyAnimeList via Jikan)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'anime.top',
    mcpName: 'anime.titles.top',
    title: 'Top Anime Rankings',
    description: 'Get top-ranked anime by score — filter by type (TV/movie/OVA), status (airing/upcoming), or popularity (MyAnimeList via Jikan)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Open Library — Books / ISBN Lookup (UC-054, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'books.isbn_lookup',
    mcpName: 'books.editions.isbn',
    title: 'ISBN Book Lookup',
    description: 'Look up a book by ISBN-10 or ISBN-13 — title, author, publisher, pages, cover image, subjects. 40M+ books (Open Library / Internet Archive)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'books.search',
    mcpName: 'books.catalog.search',
    title: 'Search Books',
    description: 'Search 40M+ books by title, author, subject, or ISBN — ratings, cover images, edition counts, publish year (Open Library / Internet Archive)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'books.work_details',
    mcpName: 'books.works.details',
    title: 'Get Book Work Details',
    description: 'Get consolidated work metadata across all editions by Open Library Work ID — description, subjects, authors, cover, first publish date (Open Library)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'books.author',
    mcpName: 'books.authors.details',
    title: 'Get Author Details',
    description: 'Get author profile by Open Library Author ID — biography, birth/death dates, photo, Wikipedia link (Open Library / Internet Archive)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // ZeroBounce — Email Validation (UC-055, 1 tool)
  // ---------------------------------------------------------------------------
  {
    toolId: 'email.validate',
    mcpName: 'email.validation.check',
    title: 'Validate Email Address',
    description: 'Validate an email address — checks deliverability, detects disposable/spam trap/abuse/catch-all addresses, MX records, SMTP provider, domain age. 99.6% accuracy (ZeroBounce)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Walk Score — Walkability & Transit Intelligence (UC-062, 1 tool)
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // NWS — US Weather Alerts (UC-109, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'weather_alerts.active',
    mcpName: 'weather.alerts.active',
    title: 'Active US Weather Alerts (NWS)',
    description: 'Active severe weather alerts for the US — tornado warnings, flood watches, heat advisories, winter storms. Filter by state, severity, event type. US Government open data, unlimited, no auth (NWS/NOAA)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'weather_alerts.by_area',
    mcpName: 'weather.alerts.by_state',
    title: 'Weather Alerts by US State (NWS)',
    description: 'Active weather alerts for a specific US state — all warnings, watches, and advisories. Returns event, severity, urgency, description, area, timing (NWS/NOAA)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Nager.Date — World Public Holidays (UC-110, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'holidays.by_country',
    mcpName: 'calendar.holidays.by_country',
    title: 'Public Holidays by Country (Nager.Date)',
    description: 'Public holidays for any country and year — 100+ countries, national and regional holidays. Returns date, name (local + English), type. No auth, free, open source (Nager.Date)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'holidays.next',
    mcpName: 'calendar.holidays.next',
    title: 'Next Public Holidays (Nager.Date)',
    description: 'Next upcoming public holidays for a country — useful for scheduling, availability checks, business day calculations. No auth (Nager.Date)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // ssl-checker.io — SSL Certificate Check (UC-119, 1 tool)
  // ---------------------------------------------------------------------------
  {
    toolId: 'ssl.check',
    mcpName: 'web.ssl.check',
    title: 'Check SSL Certificate (ssl-checker.io)',
    description: 'Check SSL/TLS certificate for any domain — validity, issuer, expiry date, days remaining, protocol, key size, HSTS status. No auth, free (ssl-checker.io)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // GDELT — Global Events \& News (UC-107, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'gdelt.search',
    mcpName: 'events.global.search',
    title: 'Search Global News \& Events (GDELT)',
    description: 'Search global news articles across 65 languages from 300K+ sources worldwide. Filter by time, language, tone. Returns title, URL, domain, country. 100% free, no auth (GDELT Project)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'gdelt.timeline',
    mcpName: 'events.global.timeline',
    title: 'News Mention Timeline (GDELT)',
    description: 'Track mention volume of any topic over time — see when a keyword spikes in global news coverage. Up to 3 months of data (GDELT Project)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // NASA FIRMS — Satellite Fire Detection (UC-108, 1 tool)
  // ---------------------------------------------------------------------------
  {
    toolId: 'firms.fires',
    mcpName: 'earth.fires.detect',
    title: 'Detect Fires by Satellite (NASA FIRMS)',
    description: 'Active fire hotspots detected by NASA satellites (VIIRS, MODIS) — latitude, longitude, brightness, confidence, fire radiative power. Filter by bounding box and days. Near real-time updates (NASA FIRMS)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // TimeAPI.io — World Clock & Timezone (UC-103, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'worldclock.current',
    mcpName: 'time.worldclock.current',
    title: 'Current Time by Timezone',
    description: 'Get current date, time, and day of week for any IANA timezone. DST-aware. No auth, free, unlimited (TimeAPI.io)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'worldclock.convert',
    mcpName: 'time.worldclock.convert',
    title: 'Convert Time Between Timezones',
    description: 'Convert date/time from one timezone to another. DST-aware. 597 IANA timezones (TimeAPI.io)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'worldclock.zones',
    mcpName: 'time.worldclock.zones',
    title: 'List All Timezones',
    description: 'List all 597 IANA timezone names. Use for timezone validation and discovery (TimeAPI.io)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // ApiFlash — Website Screenshot (UC-093, 1 tool)
  // ---------------------------------------------------------------------------
  {
    toolId: 'screenshot.capture',
    mcpName: 'web.screenshot.capture',
    title: 'Capture Website Screenshot (ApiFlash)',
    description: 'Take a screenshot of any URL — returns image URL. Chrome-based rendering, supports full-page capture, custom viewport, ad blocking, cookie banner removal. Waits for JS-heavy SPAs to load (ApiFlash)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // API-Sports — Multi-Sport Data (UC-089, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'sports.football_fixtures',
    mcpName: 'sports.football.fixtures',
    title: 'Football/Soccer Fixtures & Scores',
    description: 'Football/soccer fixtures, live scores, and results — filter by date, league (Premier League, La Liga, Champions League...), team. 2000+ leagues, 171 countries. 362+ fixtures per day (API-Sports)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sports.football_standings',
    mcpName: 'sports.football.standings',
    title: 'Football League Standings',
    description: 'League table/standings — rank, points, wins, draws, losses, goals for/against. All major leagues: Premier League (39), La Liga (140), Bundesliga (78), Serie A (135), Ligue 1 (61) (API-Sports)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sports.football_leagues',
    mcpName: 'sports.football.leagues',
    title: 'Search Football Leagues',
    description: 'Search football leagues and cups by country or name. Returns league ID, name, type (league/cup), country, logo. Use IDs for fixtures and standings queries (API-Sports)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sports.basketball_games',
    mcpName: 'sports.basketball.games',
    title: 'Basketball Games & Scores',
    description: 'Basketball games and scores — NBA, EuroLeague, and 100+ leagues worldwide. Filter by date, league, season, team. Live and historical data (API-Sports)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Langbly — Translation (UC-087, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'langbly.translate',
    mcpName: 'translate.text.translate',
    title: 'Translate Text (Langbly)',
    description: 'Translate text between 90+ languages — auto-detects source language, supports batch translation (array of strings), HTML format preservation. Google Translate v2 compatible. $5/1M chars (Langbly)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'langbly.detect',
    mcpName: 'translate.text.detect',
    title: 'Detect Language (Langbly)',
    description: 'Detect the language of text — returns language code and confidence score. Supports batch detection (Langbly)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'langbly.languages',
    mcpName: 'translate.text.languages',
    title: 'List Supported Languages (Langbly)',
    description: 'List all 90+ supported translation languages with localized names. Specify display_language to get names in that language (Langbly)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Twilio — SMS & Phone Lookup (UC-086, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'twilio.lookup',
    mcpName: 'phone.twilio.lookup',
    title: 'Phone Number Lookup (Twilio)',
    description: 'Validate and look up phone number info — format validation, country, national format. Optional: carrier name, line type (mobile/landline/VoIP), caller name CNAM (Twilio)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'twilio.send_sms',
    mcpName: 'phone.twilio.sms',
    title: 'Send SMS (Twilio)',
    description: 'Send SMS message to any phone number worldwide. Requires a Twilio phone number as sender. Returns message SID and delivery status. $0.0083/SMS US outbound (Twilio)',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },

  // ---------------------------------------------------------------------------
  // Stability AI — Image Generation (UC-080, 1 tool)
  // ---------------------------------------------------------------------------
  {
    toolId: 'stability.generate',
    mcpName: 'ai.image.generate',
    title: 'Generate Image (Stability AI)',
    description: 'Generate images from text prompts using Stable Diffusion — supports style presets (anime, cinematic, pixel-art, photographic...), aspect ratios, negative prompts. Returns base64 PNG data URI. Powered by Stability AI',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Resend — Transactional Email (UC-076, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'resend.send_email',
    mcpName: 'email.transactional.send',
    title: 'Send Email (Resend)',
    description: 'Send transactional email — plain text or HTML body, multiple recipients, reply-to. Requires verified sender domain. 3,000 free emails/month (Resend)',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    toolId: 'resend.email_status',
    mcpName: 'email.transactional.status',
    title: 'Check Email Status (Resend)',
    description: 'Check delivery status of a sent email by ID — last event, timestamps (Resend)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Mastodon — Fediverse Social Media (UC-081, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'mastodon.trending',
    mcpName: 'social.mastodon.trending',
    title: 'Trending Mastodon Posts',
    description: 'Trending posts on Mastodon (Fediverse) — popular content across the decentralized social network. Returns post text, author, reblogs, favourites, replies. No auth needed, $0 upstream (Mastodon.social)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'mastodon.trending_tags',
    mcpName: 'social.mastodon.tags',
    title: 'Trending Mastodon Hashtags',
    description: 'Trending hashtags on Mastodon — top topics with usage counts. Track social media trends on the decentralized network. No auth needed (Mastodon.social)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Regulations.gov — US Federal Regulatory Data (UC-082, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'regulations.search',
    mcpName: 'legal.regulations.search',
    title: 'Search US Federal Regulations',
    description: 'Search US federal regulatory documents — rules, proposed rules, notices, presidential documents. Filter by agency (EPA, SEC, FDA...), document type, date. 7,500+ results for "artificial intelligence" (Regulations.gov)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'regulations.document',
    mcpName: 'legal.regulations.document',
    title: 'Get Regulatory Document Details',
    description: 'Get full details of a US federal regulatory document by ID — title, abstract, agency, comment count, docket, dates. Public domain (Regulations.gov)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Federal Register — US Federal Rules & Executive Orders (UC-083, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'fedregister.search',
    mcpName: 'legal.fedregister.search',
    title: 'Search Federal Register',
    description: 'Search the US Federal Register — final rules, proposed rules, notices, executive orders. Filter by agency, type, date. 90+ years of official federal government records (Federal Register)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'fedregister.document',
    mcpName: 'legal.fedregister.document',
    title: 'Get Federal Register Document',
    description: 'Get full Federal Register document by number — title, abstract, agencies, effective date, PDF link, comment deadline (Federal Register)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'fedregister.recent',
    mcpName: 'legal.fedregister.recent',
    title: 'Recent Federal Register Documents',
    description: 'Latest documents published in the Federal Register — filter by type (rules, proposed rules, notices, presidential). No search query needed (Federal Register)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // CourtListener — US Case Law (UC-084, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'courtlistener.search',
    mcpName: 'legal.caselaw.search',
    title: 'Search US Court Opinions',
    description: 'Search US federal and state court opinions — filter by court (scotus, ca9, dcd...), date range, relevance. Largest free US case law archive. 7,000+ AI-related opinions (CourtListener / Free Law Project)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'courtlistener.opinion',
    mcpName: 'legal.caselaw.opinion',
    title: 'Get Court Opinion Text',
    description: 'Get full text of a US court opinion by ID — author, type, date, download URL. Up to 5,000 characters of opinion text (CourtListener)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'courtlistener.dockets',
    mcpName: 'legal.caselaw.dockets',
    title: 'Search Court Dockets (RECAP)',
    description: 'Search PACER/RECAP federal court dockets — case filings, motions, orders. Filter by court. From the RECAP Archive (CourtListener / Free Law Project)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // OCR.space — Optical Character Recognition (UC-078, 1 tool)
  // ---------------------------------------------------------------------------
  {
    toolId: 'ocr.extract_text',
    mcpName: 'ai.ocr.extract',
    title: 'Extract Text from Image (OCR)',
    description: 'Extract text from any image or PDF URL using OCR — supports 20+ languages including English, Russian, Chinese, Japanese, Korean, Arabic. Returns recognized text. Handles PNG, JPG, GIF, BMP, PDF, TIFF (OCR.space)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Finnhub — Stock Market Data (UC-074, 5 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'finnhub.quote',
    mcpName: 'stocks.market.quote',
    title: 'Real-Time Stock Quote',
    description: 'Real-time stock price quote — current price, change, percent change, day high/low, open, previous close. Supports US stocks, ETFs, and major global exchanges (Finnhub)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'finnhub.company_profile',
    mcpName: 'stocks.company.profile',
    title: 'Company Profile',
    description: 'Company profile by ticker — name, exchange, industry, country, market cap, shares outstanding, IPO date, logo, website (Finnhub)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'finnhub.company_news',
    mcpName: 'stocks.company.news',
    title: 'Company News',
    description: 'Latest news articles about a specific company — headline, source, summary, date, image. Filter by date range (Finnhub)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'finnhub.candles',
    mcpName: 'stocks.market.candles',
    title: 'Stock Price Candles (OHLCV)',
    description: 'Historical OHLCV candlestick data — open, high, low, close, volume with configurable resolution (1min to monthly). Use for charting and technical analysis (Finnhub)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'finnhub.market_news',
    mcpName: 'stocks.market.news',
    title: 'Market News',
    description: 'General market news — categories: general, forex, crypto, merger. Top headlines with source, summary, and images (Finnhub)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // NewsData.io — Global News (UC-070, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'news.latest',
    mcpName: 'news.global.latest',
    title: 'Latest Global News',
    description: 'Latest news from 180,000+ sources across 200+ countries in 70+ languages. Filter by keyword, country, category, language, domain, and recency. Returns title, link, description, source, sentiment, keywords (NewsData.io)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'news.crypto',
    mcpName: 'news.crypto.latest',
    title: 'Crypto & Blockchain News',
    description: 'Cryptocurrency and blockchain news feed — filter by coin (Bitcoin, Ethereum, Solana...), keyword, language. Dedicated crypto news index from specialized sources (NewsData.io)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'news.sources',
    mcpName: 'news.global.sources',
    title: 'News Sources Directory',
    description: 'Browse available news sources — filter by country, language, and category. Returns source name, URL, categories, and languages covered. 180,000+ sources indexed (NewsData.io)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Exa — Semantic Web Search (UC-069, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'exa.search',
    mcpName: 'search.semantic.web',
    title: 'Semantic Web Search (Exa)',
    description: 'Neural/semantic web search — finds conceptually related pages, not just keyword matches. Supports category filters (company, research paper, news, people, tweet), domain filtering, date range. Returns relevance scores and highlighted excerpts (Exa)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'exa.contents',
    mcpName: 'search.semantic.contents',
    title: 'Extract Page Content (Exa)',
    description: 'Extract clean text content from up to 10 URLs — returns title, author, published date, full text. Use for feeding web pages into agent context (Exa)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'exa.find_similar',
    mcpName: 'search.semantic.similar',
    title: 'Find Similar Pages (Exa)',
    description: 'Find web pages semantically similar to a given URL — discover related content, competitors, alternatives without knowing what to search for. Unique capability for research agents (Exa)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Tavily — AI Web Search (UC-068, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'tavily.search',
    mcpName: 'search.ai.web',
    title: 'AI Web Search (Tavily)',
    description: 'AI-optimized web search — returns synthesized answer + curated results with extracted page content and relevance scores. Built for LLM/agent RAG pipelines. Supports domain filtering and recency (Tavily)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tavily.extract',
    mcpName: 'search.ai.extract',
    title: 'Extract Web Page Content (Tavily)',
    description: 'Extract clean readable content from up to 20 URLs — returns text, title, author, published date. Eliminates scraping. Perfect for feeding web pages into agent context windows (Tavily)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Serper.dev — Google Search API (UC-067, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'serper.web_search',
    mcpName: 'search.google.web',
    title: 'Google Web Search',
    description: 'Real-time Google web search results — organic listings, knowledge graph, answer box, people also ask, related searches. Supports country and language targeting. Powered by Serper.dev',
    annotations: READ_ONLY,
  },
  {
    toolId: 'serper.news_search',
    mcpName: 'search.google.news',
    title: 'Google News Search',
    description: 'Real-time Google News articles — title, source, date, snippet, image. Filter by time (past hour/day/week/month). Global coverage in 70+ languages (Serper.dev)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'serper.image_search',
    mcpName: 'search.google.images',
    title: 'Google Image Search',
    description: 'Google Image search results — image URL, thumbnail, dimensions, source domain. Search any visual content worldwide (Serper.dev)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'serper.shopping_search',
    mcpName: 'search.google.shopping',
    title: 'Google Shopping Search',
    description: 'Google Shopping product listings — title, price, source, rating, delivery info, product images. Compare prices across retailers (Serper.dev)',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // US Real Estate — Property Listings & Details (UC-063, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'usrealestate.for_sale',
    mcpName: 'realestate.listings.for_sale',
    title: 'Search US Properties For Sale',
    description: 'Search active for-sale property listings across the US — filter by city, state, ZIP, price range, bedrooms, bathrooms, sqft, property type. Returns address, price, specs, photos. Millions of MLS listings (RapidAPI / Realtor.com data)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'usrealestate.property_detail',
    mcpName: 'realestate.property.details',
    title: 'Get US Property Details',
    description: 'Detailed property information by property ID — beds, baths, sqft, year built, lot size, tax assessment, HOA, days on market, photos, last sale price/date. Use for_sale search first to get property_id (RapidAPI / Realtor.com data)',
    annotations: READ_ONLY,
  },
  {
    toolId: 'usrealestate.location_suggest',
    mcpName: 'realestate.location.suggest',
    title: 'US Real Estate Location Search',
    description: 'Autocomplete location search for US real estate — returns matching cities, ZIP codes, and addresses with coordinates. Use to find valid city/state codes for property searches (RapidAPI / Realtor.com data)',
    annotations: READ_ONLY,
  },

  {
    toolId: 'walkscore.score',
    mcpName: 'realestate.walkscore.score',
    title: 'Get Walk Score, Transit Score & Bike Score',
    description: 'Walk Score (0-100), Transit Score (0-100), and Bike Score (0-100) for any US/Canada address. Measures walkability to amenities, public transit quality, and cycling infrastructure. Industry-standard walkability metric used by 30,000+ websites (Walk Score / Redfin)',
    annotations: READ_ONLY,
  },
];
