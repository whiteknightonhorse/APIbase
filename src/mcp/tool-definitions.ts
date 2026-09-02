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
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'weather.get_forecast',
    mcpName: 'weather.conditions.forecast',
    title: 'Get Weather Forecast',
    description: 'Get weather forecast for a location',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'weather.get_alerts',
    mcpName: 'weather.alerts.get',
    title: 'Get Weather Alerts',
    description: 'Get active weather alerts for a location',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'weather.get_history',
    mcpName: 'weather.conditions.history',
    title: 'Get Historical Weather',
    description: 'Get historical weather data for a location and date',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'weather.air_quality',
    mcpName: 'weather.air.quality',
    title: 'Get Air Quality',
    description: 'Get air quality index for a location',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'weather.geocode',
    mcpName: 'weather.location.geocode',
    title: 'Geocode Location',
    description: 'Geocode a location query to coordinates',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'weather.compare',
    mcpName: 'weather.conditions.compare',
    title: 'Compare Weather',
    description: 'Compare weather across multiple locations',
    category: 'weather',
    annotations: READ_ONLY,
  },

  // Crypto (9)
  {
    toolId: 'crypto.get_price',
    mcpName: 'crypto.price.current',
    title: 'Get Crypto Prices',
    description: 'Get current prices for cryptocurrencies',
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'coingecko.get_market',
    mcpName: 'crypto.market.overview',
    title: 'Get Crypto Market Data',
    description: 'Get cryptocurrency market data by category',
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'crypto.coin_detail',
    mcpName: 'crypto.coin.detail',
    title: 'Get Coin Details',
    description: 'Get detailed information about a cryptocurrency',
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'crypto.price_history',
    mcpName: 'crypto.price.history',
    title: 'Get Crypto Price History',
    description: 'Get price history for a cryptocurrency',
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'crypto.trending',
    mcpName: 'crypto.trending.get',
    title: 'Get Trending Coins',
    description: 'Get trending cryptocurrencies',
    category: 'crypto',
    annotations: READ_ONLY,
    relatedTools: [
      { toolId: 'crypto.get_price', reason: 'Get detailed price for a trending coin' },
      { toolId: 'crypto.global', reason: 'Overall market cap and dominance' },
    ],
  },
  {
    toolId: 'crypto.global',
    mcpName: 'crypto.global.stats',
    title: 'Get Global Crypto Stats',
    description: 'Get global cryptocurrency market statistics',
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'crypto.dex_pools',
    mcpName: 'crypto.dex.pools',
    title: 'Get DEX Pools',
    description: 'Get DEX liquidity pool data',
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'crypto.token_by_address',
    mcpName: 'crypto.token.lookup',
    title: 'Get Token by Address',
    description: 'Get token info by contract address',
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'crypto.search',
    mcpName: 'crypto.coin.search',
    title: 'Search Cryptocurrencies',
    description: 'Search for cryptocurrencies by name or symbol',
    category: 'crypto',
    annotations: READ_ONLY,
  },

  // Polymarket (11: 6 read-only + 5 trading)
  {
    toolId: 'polymarket.search',
    mcpName: 'polymarket.market.search',
    title: 'Search Prediction Markets',
    description: 'Search prediction markets on Polymarket',
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'polymarket.market_detail',
    mcpName: 'polymarket.market.detail',
    title: 'Get Market Details',
    description: 'Get detailed info about a prediction market',
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'polymarket.prices',
    mcpName: 'polymarket.market.prices',
    title: 'Get Market Price',
    description: 'Get midpoint price for a prediction market token',
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'polymarket.price_history',
    mcpName: 'polymarket.market.history',
    title: 'Get Market Price History',
    description: 'Get price history for a prediction market',
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'polymarket.get_orderbook',
    mcpName: 'polymarket.market.orderbook',
    title: 'Get Order Book',
    description: 'Get order book for a prediction market',
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'polymarket.trending',
    mcpName: 'polymarket.market.trending',
    title: 'Get Trending Markets',
    description: 'Get trending prediction markets',
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'polymarket.place_order',
    mcpName: 'polymarket.trading.place_order',
    title: 'Place Order',
    description: 'Place a limit order on Polymarket',
    category: 'crypto',
    annotations: TRADING,
  },
  {
    toolId: 'polymarket.cancel_order',
    mcpName: 'polymarket.trading.cancel_order',
    title: 'Cancel Order',
    description: 'Cancel an open order on Polymarket',
    category: 'crypto',
    annotations: CANCEL,
  },
  {
    toolId: 'polymarket.open_orders',
    mcpName: 'polymarket.trading.open_orders',
    title: 'Get Open Orders',
    description: 'Get open orders on Polymarket',
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'polymarket.trade_history',
    mcpName: 'polymarket.trading.history',
    title: 'Get Trade History',
    description: 'Get trade history on Polymarket',
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'polymarket.balance',
    mcpName: 'polymarket.account.balance',
    title: 'Get Balance',
    description: 'Get balance/allowance on Polymarket',
    category: 'crypto',
    annotations: READ_ONLY,
  },

  // Sabre GDS (4)
  {
    toolId: 'sabre.search_flights',
    mcpName: 'sabre.flights.search',
    title: 'Search Flights (Sabre)',
    description: 'Search for real-time flight offers with prices between airports (Sabre GDS)',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sabre.destination_finder',
    mcpName: 'sabre.flights.destinations',
    title: 'Find Cheap Destinations',
    description: 'Find cheapest flight destinations from an origin airport',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sabre.airline_lookup',
    mcpName: 'sabre.reference.airline',
    title: 'Airline Lookup (Sabre)',
    description: 'Look up airline details by IATA or ICAO code',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sabre.travel_themes',
    mcpName: 'sabre.reference.themes',
    title: 'Get Travel Themes',
    description: 'Get travel theme categories (beach, skiing, romantic, etc.)',
    category: 'travel',
    annotations: READ_ONLY,
  },

  // Amadeus Travel APIs (7)
  {
    toolId: 'amadeus.flight_search',
    mcpName: 'amadeus.flights.search',
    title: 'Search Flights (Amadeus)',
    description:
      '⚡ ACTION: Search for real-time flight offers between airports with prices, airlines, stops, and duration (Amadeus)',
    category: 'travel',
    annotations: READ_ONLY,
    relatedTools: [
      { toolId: 'amadeus.flight_price', reason: 'Confirm exact pricing for selected offer' },
      { toolId: 'finance.exchange_rates', reason: 'Convert flight price to local currency' },
      { toolId: 'weatherapi.forecast', reason: 'Check weather at destination' },
    ],
  },
  {
    toolId: 'amadeus.flight_price',
    mcpName: 'amadeus.flights.price',
    title: 'Confirm Flight Price',
    description: 'Confirm and get final pricing for a flight offer from Amadeus flight search',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'amadeus.flight_status',
    mcpName: 'amadeus.flights.status',
    title: 'Get Flight Status',
    description:
      'Get real-time status of a specific flight — delays, cancellations, gate info (Amadeus)',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'amadeus.airport_search',
    mcpName: 'amadeus.airports.search',
    title: 'Search Airports',
    description: 'Search airports and cities by keyword or IATA code with autocomplete (Amadeus)',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'amadeus.airport_nearest',
    mcpName: 'amadeus.airports.nearest',
    title: 'Find Nearest Airports',
    description: 'Find nearest airports by geographic coordinates (Amadeus)',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'amadeus.airport_routes',
    mcpName: 'amadeus.airports.routes',
    title: 'Get Airport Routes',
    description: 'Get all direct flight destinations from an airport (Amadeus)',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'amadeus.airline_lookup',
    mcpName: 'amadeus.reference.airline',
    title: 'Airline Lookup (Amadeus)',
    description: 'Look up airline details by IATA or ICAO code (Amadeus)',
    category: 'travel',
    annotations: READ_ONLY,
  },

  // Aviasales (6)
  {
    toolId: 'aviasales.search_flights',
    mcpName: 'aviasales.flights.search',
    title: 'Search Flights (Aviasales)',
    description: 'Search for flights between airports',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aviasales.price_calendar',
    mcpName: 'aviasales.flights.calendar',
    title: 'Flight Price Calendar',
    description: 'Get flight price calendar for a route',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aviasales.cheap_flights',
    mcpName: 'aviasales.flights.cheap',
    title: 'Find Cheap Flights',
    description: 'Find cheapest flights from an origin',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aviasales.popular_routes',
    mcpName: 'aviasales.flights.popular',
    title: 'Popular Flight Routes',
    description: 'Get popular flight routes from an origin',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aviasales.nearby_destinations',
    mcpName: 'aviasales.flights.nearby',
    title: 'Nearby Destinations',
    description: 'Find nearby flight destinations',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aviasales.airport_lookup',
    mcpName: 'aviasales.reference.airport',
    title: 'Airport Lookup',
    description: 'Look up airport by name or code',
    category: 'travel',
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
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hyperliquid.order_book',
    mcpName: 'hyperliquid.markets.orderbook',
    title: 'Hyperliquid Order Book',
    description: 'Get L2 order book depth for a perpetual pair on Hyperliquid',
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hyperliquid.klines',
    mcpName: 'hyperliquid.markets.klines',
    title: 'Hyperliquid Klines',
    description: 'Get candlestick (OHLCV) data for a perpetual pair on Hyperliquid',
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hyperliquid.positions',
    mcpName: 'hyperliquid.account.positions',
    title: 'Hyperliquid Positions',
    description: 'Get open positions for a user wallet on Hyperliquid',
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hyperliquid.account',
    mcpName: 'hyperliquid.account.summary',
    title: 'Hyperliquid Account',
    description: 'Get account summary and margin details for a user wallet on Hyperliquid',
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hyperliquid.vault',
    mcpName: 'hyperliquid.vaults.details',
    title: 'Hyperliquid Vault',
    description: 'Get vault details including performance and TVL on Hyperliquid',
    category: 'crypto',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Foursquare Places (UC-003, 5 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'foursquare.place_search',
    mcpName: 'foursquare.places.search',
    title: 'Search Places',
    description:
      'Search for places (restaurants, hotels, cafes, attractions) worldwide by name, category, or location (Foursquare)',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'foursquare.place_details',
    mcpName: 'foursquare.places.details',
    title: 'Get Place Details',
    description:
      'Get detailed information about a place — hours, rating, price, contact, categories (Foursquare)',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'foursquare.place_tips',
    mcpName: 'foursquare.places.tips',
    title: 'Get Place Tips',
    description: 'Get user tips and reviews for a place (Foursquare)',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'foursquare.place_photos',
    mcpName: 'foursquare.places.photos',
    title: 'Get Place Photos',
    description: 'Get photos for a place with size and classification options (Foursquare)',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'foursquare.autocomplete',
    mcpName: 'foursquare.places.autocomplete',
    title: 'Autocomplete Places',
    description: 'Get autocomplete suggestions for places, addresses, and searches (Foursquare)',
    category: 'location',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Ticketmaster — Events & Entertainment (UC-008, 7 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'ticketmaster.events_search',
    mcpName: 'ticketmaster.events.search',
    title: 'Search Events',
    description:
      'Search for events (concerts, sports, theatre, festivals) by keyword, city, date, or category across 26+ countries (Ticketmaster)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ticketmaster.event_details',
    mcpName: 'ticketmaster.events.details',
    title: 'Get Event Details',
    description:
      'Get full details for an event — dates, venues, prices, images, classifications, seat map (Ticketmaster)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ticketmaster.events_nearby',
    mcpName: 'ticketmaster.events.nearby',
    title: 'Find Nearby Events',
    description: 'Find events near geographic coordinates with radius filter (Ticketmaster)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ticketmaster.artist_events',
    mcpName: 'ticketmaster.events.by_artist',
    title: 'Get Artist Events',
    description:
      'Find events by artist or performer name with optional country and date filters (Ticketmaster)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ticketmaster.venue_events',
    mcpName: 'ticketmaster.events.by_venue',
    title: 'Get Venue Events',
    description: 'Get upcoming events at a specific venue by venue ID (Ticketmaster)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ticketmaster.events_trending',
    mcpName: 'ticketmaster.events.trending',
    title: 'Get Trending Events',
    description: 'Get trending and popular events sorted by relevance (Ticketmaster)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ticketmaster.events_categories',
    mcpName: 'ticketmaster.events.categories',
    title: 'Get Event Categories',
    description:
      'Get all event classification categories — segments, genres, sub-genres (Ticketmaster)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // TMDB — Movies & TV Discovery (UC-010, 7 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'tmdb.movie_search',
    mcpName: 'tmdb.movies.search',
    title: 'Search Movies & TV',
    description:
      'Search for movies, TV shows, and people by name across 1M+ titles in 39 languages (TMDB)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tmdb.movie_details',
    mcpName: 'tmdb.movies.details',
    title: 'Get Movie Details',
    description:
      'Get full movie details — cast, crew, trailers, ratings, streaming providers, runtime, budget, revenue (TMDB)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tmdb.movie_discover',
    mcpName: 'tmdb.movies.discover',
    title: 'Discover Movies & TV',
    description:
      'Discover movies or TV shows by genre, year, rating, language, and sort order (TMDB)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tmdb.movie_trending',
    mcpName: 'tmdb.movies.trending',
    title: 'Get Trending Movies & TV',
    description: 'Get trending movies, TV shows, or people — daily or weekly (TMDB)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tmdb.movie_similar',
    mcpName: 'tmdb.movies.similar',
    title: 'Get Similar Movies',
    description:
      'Get movie recommendations based on a movie ID — similar genres, themes, cast (TMDB)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tmdb.movie_person',
    mcpName: 'tmdb.movies.person',
    title: 'Search Person / Filmography',
    description:
      'Search for actors, directors, or crew by name, or get full filmography by person ID (TMDB)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tmdb.movie_where_to_watch',
    mcpName: 'tmdb.movies.where_to_watch',
    title: 'Where to Watch',
    description:
      'Find streaming, rental, and purchase options for a movie or TV show by country (TMDB)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Health & Nutrition — Government Data APIs (UC-011, 7 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'health.food_search',
    mcpName: 'health.nutrition.food_search',
    title: 'Search Foods (USDA)',
    description:
      'Search 350K+ foods in the USDA FoodData Central database — nutrition facts, ingredients, branded products, and reference foods',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'health.food_details',
    mcpName: 'health.nutrition.food_details',
    title: 'Get Food Nutrition Details',
    description:
      'Get detailed nutrition data for a food item — up to 150 nutrients, portions, serving sizes, ingredients (USDA)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'health.drug_events',
    mcpName: 'health.safety.drug_events',
    title: 'Search Drug Adverse Events',
    description:
      'Search FDA FAERS database for drug adverse event reports — side effects, reactions, patient demographics (OpenFDA)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'health.food_recalls',
    mcpName: 'health.safety.food_recalls',
    title: 'Search Food Recalls',
    description:
      'Search FDA food enforcement and recall reports — contamination, mislabeling, safety alerts (OpenFDA)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'health.drug_labels',
    mcpName: 'health.safety.drug_labels',
    title: 'Search Drug Labels',
    description:
      'Search drug labeling data — indications, dosage, warnings, interactions, contraindications (OpenFDA)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'health.supplement_search',
    mcpName: 'health.supplements.search',
    title: 'Search Dietary Supplements',
    description:
      'Search 200K+ dietary supplement labels in the NIH DSLD database — vitamins, minerals, herbal products',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'health.supplement_details',
    mcpName: 'health.supplements.details',
    title: 'Get Supplement Label Details',
    description:
      'Get full supplement label data — ingredients, amounts per serving, daily values, target groups (NIH DSLD)',
    category: 'health',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Finance / Banking / Financial Intelligence (UC-016, 6 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'finance.exchange_rates',
    mcpName: 'finance.currency.rates',
    title: 'Get Exchange Rates',
    description:
      'Get currency exchange rates for 200+ fiat and crypto currencies with optional historical dates (fawazahmed0 CDN)',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'finance.ecb_rates',
    mcpName: 'finance.currency.ecb',
    title: 'Get ECB Exchange Rates',
    description:
      'Get official European Central Bank reference exchange rates for ~33 fiat currencies (Frankfurter/ECB)',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'finance.economic_indicator',
    mcpName: 'finance.macro.indicator',
    title: 'Get Economic Indicator',
    description:
      'Get US economic data from 816K+ FRED series — GDP, CPI, unemployment, interest rates, money supply (Federal Reserve)',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'finance.country_data',
    mcpName: 'finance.macro.country',
    title: 'Get Country Economic Data',
    description:
      'Get global development indicators from World Bank — GDP, population, inflation, trade, poverty for 200+ countries',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'finance.treasury_data',
    mcpName: 'finance.treasury.data',
    title: 'Get US Treasury Data',
    description:
      'Get US Treasury fiscal data — interest rates on federal debt, national debt, debt outstanding, gold reserves, exchange rates',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'finance.validate_iban',
    mcpName: 'finance.banking.iban',
    title: 'Validate IBAN',
    description:
      'Validate an IBAN number and get associated bank data — BIC/SWIFT code, bank name, city (OpenIBAN)',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Music / Audio Discovery (UC-018, 7 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'music.artist_search',
    mcpName: 'music.artists.search',
    title: 'Search Music Artists',
    description:
      'Search for music artists by name across 2M+ artists — biography, country, tags, aliases (MusicBrainz)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'music.artist_details',
    mcpName: 'music.artists.details',
    title: 'Get Artist Details',
    description:
      'Get detailed artist info by MusicBrainz ID — tags, ratings, external links, life span, area (MusicBrainz)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'music.release_search',
    mcpName: 'music.releases.search',
    title: 'Search Music Releases',
    description:
      'Search for albums, singles, and EPs across 50M+ recordings — title, artist, date (MusicBrainz)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'music.release_details',
    mcpName: 'music.releases.details',
    title: 'Get Release Details',
    description:
      'Get full release details by MusicBrainz ID — artist credits, labels, media formats (MusicBrainz)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'music.recording_search',
    mcpName: 'music.recordings.search',
    title: 'Search Music Recordings',
    description:
      'Search for songs and recordings by title or artist — duration, release history, artist credits (MusicBrainz)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'music.fresh_releases',
    mcpName: 'music.discover.fresh',
    title: 'Get Fresh Music Releases',
    description:
      'Discover recently released albums and singles from the past N days — trending new music (ListenBrainz)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'music.radio_search',
    mcpName: 'music.radio.search',
    title: 'Search Radio Stations',
    description:
      'Search 40K+ internet radio stations by name, genre, country, or language — streaming URLs, bitrate, codec (RadioBrowser)',
    category: 'entertainment',
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
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aster.market_data',
    mcpName: 'aster.markets.ticker',
    title: 'AsterDEX Market Data',
    description: 'Get 24-hour ticker statistics for trading pairs on AsterDEX',
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aster.order_book',
    mcpName: 'aster.markets.orderbook',
    title: 'AsterDEX Order Book',
    description: 'Get order book depth for a trading pair on AsterDEX',
    category: 'crypto',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aster.klines',
    mcpName: 'aster.markets.klines',
    title: 'AsterDEX Klines',
    description: 'Get candlestick (OHLCV) data for a trading pair on AsterDEX',
    category: 'crypto',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Jobs / Career Intelligence (UC-015, 6 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'jobs.salary_data',
    mcpName: 'jobs.salary.data',
    title: 'Get Salary Data',
    description:
      'Get US salary and employment timeseries data from BLS — wage estimates, employment counts, occupational statistics by SOC code and geography',
    category: 'jobs',
    annotations: READ_ONLY,
  },
  {
    toolId: 'jobs.occupation_search',
    mcpName: 'jobs.occupations.search',
    title: 'Search Occupations',
    description:
      'Search O*NET occupation taxonomy by keyword — 1,000+ occupations with SOC codes, titles, and relevance scores',
    category: 'jobs',
    annotations: READ_ONLY,
  },
  {
    toolId: 'jobs.occupation_details',
    mcpName: 'jobs.occupations.details',
    title: 'Get Occupation Details',
    description:
      'Get detailed occupation info from O*NET by SOC code — overview, skills, knowledge, abilities, technology skills, tasks',
    category: 'jobs',
    annotations: READ_ONLY,
  },
  {
    toolId: 'jobs.esco_search',
    mcpName: 'jobs.skills.search',
    title: 'Search EU Skills & Occupations',
    description:
      'Search ESCO (European Skills/Competences/Occupations) taxonomy — occupations and skills in 27 EU languages',
    category: 'jobs',
    annotations: READ_ONLY,
  },
  {
    toolId: 'jobs.esco_details',
    mcpName: 'jobs.skills.details',
    title: 'Get EU Skill/Occupation Details',
    description:
      'Get ESCO resource details by URI — occupation descriptions, essential/optional skills, ISCO codes, skill relationships',
    category: 'jobs',
    annotations: READ_ONLY,
  },
  {
    toolId: 'jobs.job_search',
    mcpName: 'jobs.listings.search',
    title: 'Search Job Listings',
    description:
      'Search global job listings via CareerJet — title, company, salary, location, contract type across 90+ countries',
    category: 'jobs',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Education / Academic Research (UC-017, 7 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'education.paper_search',
    mcpName: 'education.papers.search',
    title: 'Search Academic Papers',
    description:
      'Search 250M+ academic papers across all disciplines — citations, authors, institutions, open access status (OpenAlex)',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'education.paper_details',
    mcpName: 'education.papers.details',
    title: 'Get Paper Details',
    description:
      'Get full details for an academic paper by OpenAlex ID or DOI — authors, citations, abstract, references, open access links (OpenAlex)',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'education.college_search',
    mcpName: 'education.colleges.search',
    title: 'Search US Colleges',
    description:
      'Search US colleges and universities — admissions, tuition, enrollment, earnings, completion rates (College Scorecard)',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'education.college_details',
    mcpName: 'education.colleges.details',
    title: 'Get College Details',
    description:
      'Get detailed data for a US college by UNITID — admissions rate, costs, student outcomes, earnings after graduation (College Scorecard)',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'education.pubmed_search',
    mcpName: 'education.pubmed.search',
    title: 'Search PubMed',
    description:
      'Search 36M+ biomedical and life science articles — clinical trials, reviews, meta-analyses with date and type filters (PubMed/NCBI)',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'education.arxiv_search',
    mcpName: 'education.arxiv.search',
    title: 'Search arXiv Preprints',
    description:
      'Search 2.4M+ preprints in physics, math, CS, biology, and more — full text, authors, categories, PDF links (arXiv)',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'education.doi_lookup',
    mcpName: 'education.crossref.doi',
    title: 'Lookup DOI',
    description:
      'Resolve a DOI to full publication metadata — title, authors, journal, citations, funding, license (CrossRef)',
    category: 'education',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Maps / Navigation / Geolocation (UC-012, 7 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'geo.geocode',
    mcpName: 'geo.address.geocode',
    title: 'Geocode Address',
    description:
      'Convert an address, place name, or landmark to geographic coordinates (lat/lon) with structured address data (Geoapify/OSM)',
    category: 'location',
    relatedTools: [
      { toolId: 'weatherapi.current', reason: 'Weather at the geocoded location' },
      { toolId: 'country.by_code', reason: 'Country details for the location' },
      { toolId: 'walkscore.score', reason: 'Walkability score for the address' },
    ],
    annotations: READ_ONLY,
  },
  {
    toolId: 'geo.reverse_geocode',
    mcpName: 'geo.address.reverse',
    title: 'Reverse Geocode',
    description:
      'Convert geographic coordinates (lat/lon) to a structured address — street, city, country, postal code (Geoapify/OSM)',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geo.place_search',
    mcpName: 'geo.places.search',
    title: 'Search Places & POI',
    description:
      'Search points of interest (restaurants, pharmacies, hotels, attractions) near a location by category and radius (Geoapify/OSM)',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geo.autocomplete',
    mcpName: 'geo.address.autocomplete',
    title: 'Autocomplete Address',
    description:
      'Get autocomplete suggestions as you type an address or place name — for real-time search UX (Geoapify/OSM)',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geo.routing',
    mcpName: 'geo.navigation.route',
    title: 'Get Directions',
    description:
      'Get turn-by-turn driving, walking, cycling, or transit directions between two points with distance and time (Geoapify/OSM)',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geo.isochrone',
    mcpName: 'geo.navigation.isochrone',
    title: 'Get Isochrone',
    description:
      'Get reachability area (isochrone) — polygon showing how far you can travel from a point in a given time or distance (Geoapify/OSM)',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geo.ip_geolocation',
    mcpName: 'geo.ip.geolocation',
    title: 'IP Geolocation',
    description:
      'Geolocate an IP address (IPv4/IPv6) to country, city, coordinates, and network info (Geoapify)',
    category: 'location',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // AIPush — AI Marketing / Page Generation (UC-019, 7 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'aipush.setup_website',
    mcpName: 'aipush.website.setup',
    title: 'Setup Website for AI Marketing',
    description:
      "Register a website for AI marketing. Call with domain + target_url. If DNS is not configured, returns DNS_NOT_VERIFIED with exact CNAME record instructions — relay to user: reference.{domain} → cname.aipush.app. After user creates DNS record, call again. On success: client registered, MIP analysis starts automatically, SSL provisioning begins. Poll website_status until mip_status='ready' and cf_hostname_status='active', then use generate_page. Idempotent (AIPush)",
    category: 'marketing',
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
    description:
      "Poll website readiness after setup_website. Returns billing_status, mip_status ('empty'|'pending'|'ready'), cf_hostname_status, cf_ssl_status, pages_total. Gate your workflow: wait for mip_status='ready' AND cf_hostname_status='active' before calling generate_page. Safe to poll repeatedly (AIPush)",
    category: 'marketing',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aipush.generate_page',
    mcpName: 'aipush.pages.generate',
    title: 'Generate AI Marketing Page',
    description:
      "Requires mip_status='ready' and cf_hostname_status='active' (check website_status first). Generates one AI-optimized HTML page structured for AI assistant answer compilation (ChatGPT, Perplexity, Gemini). Page includes decision question, short answer with CTA, comparison, pricing, FAQ. Published at reference.{domain}/{slug}. Optional keyword parameter targets specific search intent (AIPush)",
    category: 'marketing',
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
    description:
      '⚡ ACTION: List all published AI marketing pages for a website with URLs, titles, and publish dates (AIPush)',
    category: 'marketing',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aipush.page_content',
    mcpName: 'aipush.pages.content',
    title: 'Get Page Content',
    description: 'Get full HTML content and metadata of a specific generated page by slug (AIPush)',
    category: 'marketing',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aipush.website_profile',
    mcpName: 'aipush.analysis.profile',
    title: 'Get Website Business Profile',
    description:
      'Get MIP business analysis results — business name, category, location, competitors, value propositions, and market surface data (AIPush)',
    category: 'marketing',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aipush.check_visibility',
    mcpName: 'aipush.analysis.visibility',
    title: 'Check AI Visibility Score',
    description:
      'Test whether AI assistants (ChatGPT, Perplexity, Gemini) know about and recommend a brand — returns per-model visibility scores (AIPush)',
    category: 'marketing',
    annotations: READ_ONLY,
  },

  // AIPush — MIP Market Intelligence Report (UC-019, 2 tools)
  {
    toolId: 'aipush.market_report',
    mcpName: 'aipush.market.report',
    title: 'Market Intelligence Report',
    description:
      '⚡ ACTION: Start a full AI market intelligence report for any website. Provide a URL (e.g. "https://stripe.com") — the system crawls the site, extracts value propositions and services, identifies competitors, scores them, finds keyword gaps and market opportunities. Returns report_id — poll with aipush.market_report_status. Takes ~2 minutes. Cost: $29.99 (AIPush MIP)',
    category: 'marketing',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    toolId: 'aipush.market_report_status',
    mcpName: 'aipush.market.report_status',
    title: 'Market Report Status',
    description:
      'Poll the status of a market intelligence report. Returns "running" with current step (crawling/ai_analysis), or "completed" with full profile_json containing competitors (scored), keywords, market surface, and evidence. Free to poll (AIPush MIP)',
    category: 'marketing',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Diffbot — AI-Powered Web Extraction (UC-026, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'diffbot.product_extract',
    mcpName: 'diffbot.products.extract',
    title: 'Extract Product Data',
    description:
      'Extract structured product data from any e-commerce URL — title, price, brand, specs, images, reviews. Works on any retailer without custom integration (Diffbot)',
    category: 'marketing',
    annotations: READ_ONLY,
  },
  {
    toolId: 'diffbot.page_analyze',
    mcpName: 'diffbot.pages.analyze',
    title: 'Analyze Web Page',
    description:
      'Auto-detect page type (product, article, image, video) and extract structured data from any URL using AI (Diffbot)',
    category: 'marketing',
    annotations: READ_ONLY,
  },
  {
    toolId: 'diffbot.article_extract',
    mcpName: 'diffbot.articles.extract',
    title: 'Extract Article Text',
    description:
      'Extract article text, author, date, tags, sentiment, and images from any blog or news URL with multi-page support (Diffbot)',
    category: 'marketing',
    annotations: READ_ONLY,
  },
  {
    toolId: 'diffbot.search',
    mcpName: 'diffbot.knowledge.search',
    title: 'Search Knowledge Graph',
    description:
      'Search Diffbot Knowledge Graph for products, organizations, people, and places — billions of structured entities from the web (Diffbot)',
    category: 'marketing',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // WhoisXML API — Domain / WHOIS / DNS Intelligence (UC-028, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'whois.lookup',
    mcpName: 'whois.domain.lookup',
    title: 'WHOIS Lookup',
    description:
      'Get WHOIS registration data for any domain — registrar, creation/expiry dates, nameservers, registrant contact, status across 374M+ domains and 7,596 TLDs (WhoisXML)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'whois.dns_lookup',
    mcpName: 'whois.dns.lookup',
    title: 'DNS Lookup',
    description:
      'Get DNS records for a domain — A, AAAA, MX, NS, SOA, TXT, CNAME, SRV, CAA records with TTL and raw data (WhoisXML)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'whois.availability',
    mcpName: 'whois.domain.availability',
    title: 'Check Domain Availability',
    description:
      'Check if a domain name is available for registration — fast DNS check or thorough DNS+WHOIS verification (WhoisXML)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'whois.reverse',
    mcpName: 'whois.domain.reverse',
    title: 'Reverse WHOIS Search',
    description:
      'Find all domains registered by a person, company, or email — reverse WHOIS lookup for OSINT and brand monitoring (WhoisXML)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Spoonacular — Recipe / Cooking / Food Data (UC-031, 5 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'spoonacular.recipe_search',
    mcpName: 'spoonacular.recipes.search',
    title: 'Search Recipes',
    description:
      'Search 365K+ recipes with dietary filters (vegan, keto, gluten-free), cuisine, meal type, and max prep time — includes nutrition data per result (Spoonacular)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'spoonacular.recipe_details',
    mcpName: 'spoonacular.recipes.details',
    title: 'Get Recipe Details',
    description:
      'Get full recipe details by ID — ingredients, step-by-step instructions, nutrition facts, dietary labels, prep time, servings, and price per serving (Spoonacular)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'spoonacular.by_ingredients',
    mcpName: 'spoonacular.recipes.by_ingredients',
    title: 'Find Recipes by Ingredients',
    description:
      'Find recipes using ingredients you have on hand — shows used/missing ingredients count, ranked by ingredient match (Spoonacular)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'spoonacular.ingredient_search',
    mcpName: 'spoonacular.ingredients.search',
    title: 'Search Ingredients',
    description:
      'Search 86K+ food ingredients with nutrition data — sortable by calories, protein, fat, or carbs (Spoonacular)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'spoonacular.analyze_recipe',
    mcpName: 'spoonacular.recipes.analyze',
    title: 'Analyze Recipe Nutrition',
    description:
      'Analyze a recipe by title and ingredient list — returns full nutrition breakdown, dietary labels, and caloric distribution (Spoonacular)',
    category: 'health',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // NASA Open APIs — Space / Astronomy (UC-034, 5 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'nasa.apod',
    mcpName: 'nasa.astronomy.apod',
    title: 'Astronomy Picture of the Day',
    description:
      'Get NASA Astronomy Picture of the Day — daily curated space image or video with expert explanation, dating back to 1995 (NASA APOD)',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nasa.neo_feed',
    mcpName: 'nasa.asteroids.feed',
    title: 'Near-Earth Asteroids Feed',
    description:
      'Get near-Earth asteroid close approaches for a date range — size estimates, hazard classification, velocity, miss distance (NASA NeoWs)',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nasa.donki_flr',
    mcpName: 'nasa.space_weather.flares',
    title: 'Solar Flare Events',
    description:
      'Get solar flare events from the Space Weather Database — class, peak time, source region, linked CMEs and geomagnetic storms (NASA DONKI)',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nasa.epic',
    mcpName: 'nasa.earth.epic',
    title: 'Earth Camera (EPIC)',
    description:
      'Get full-disc Earth images from the DSCOVR satellite EPIC camera — daily natural color photos from Lagrange point L1, 1.5M km away (NASA EPIC)',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nasa.image_search',
    mcpName: 'nasa.media.search',
    title: 'Search NASA Images & Videos',
    description:
      'Search NASA Image and Video Library — 140K+ images, videos, and audio from missions, telescopes, and events with metadata and download links (NASA)',
    category: 'space',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // NASA JPL Solar System Dynamics (UC-035, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'jpl.close_approaches',
    mcpName: 'jpl.asteroids.approaches',
    title: 'Asteroid Close Approaches',
    description:
      'Get upcoming and past asteroid close approaches to Earth — distance, velocity, size, sorted by date or distance (NASA JPL)',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'jpl.fireballs',
    mcpName: 'jpl.events.fireballs',
    title: 'Fireball Events',
    description:
      'Get reported fireball (bolide) events — atmospheric entry energy, velocity, altitude, geographic coordinates (NASA JPL CNEOS)',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'jpl.small_body',
    mcpName: 'jpl.bodies.lookup',
    title: 'Small Body Lookup',
    description:
      'Look up asteroid or comet data by name/designation — orbital elements, physical parameters, discovery info, hazard classification (NASA JPL SBDB)',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'jpl.impact_risk',
    mcpName: 'jpl.asteroids.sentry',
    title: 'Asteroid Impact Risk (Sentry)',
    description:
      'Get asteroid impact risk assessments from the Sentry monitoring system — impact probability, Palermo/Torino scale, size estimates (NASA JPL)',
    category: 'space',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // RAWG — Video Games Database (UC-037, 5 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'rawg.game_search',
    mcpName: 'rawg.games.search',
    title: 'Search Video Games',
    description:
      'Search 800K+ video games — filter by genre, platform, release date, Metacritic score, with ratings, screenshots, and store links (RAWG)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'rawg.game_details',
    mcpName: 'rawg.games.details',
    title: 'Get Game Details',
    description:
      'Get full game details by ID or slug — description, platforms, genres, developers, publishers, ratings, Metacritic score, system requirements (RAWG)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'rawg.screenshots',
    mcpName: 'rawg.games.screenshots',
    title: 'Get Game Screenshots',
    description: 'Get screenshot images for a game — full resolution URLs with dimensions (RAWG)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'rawg.store_links',
    mcpName: 'rawg.games.stores',
    title: 'Get Game Store Links',
    description:
      'Get purchase/download links for a game across stores — Steam, PlayStation Store, Xbox, Epic, GOG, Nintendo (RAWG)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'rawg.game_series',
    mcpName: 'rawg.games.series',
    title: 'Get Game Series',
    description:
      'Get all games in the same series/franchise — sequels, prequels, and spin-offs with ratings and release dates (RAWG)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // IGDB — Video Games Database by Twitch (UC-039, 5 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'igdb.game_search',
    mcpName: 'igdb.games.search',
    title: 'Search Games (IGDB)',
    description:
      'Search 280K+ games in IGDB (Twitch) — rich metadata with genres, platforms, ratings, cover art, and release dates',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'igdb.game_details',
    mcpName: 'igdb.games.details',
    title: 'Get Game Details (IGDB)',
    description:
      'Get full game details by IGDB ID — storyline, genres, platforms, developers, publishers, themes, game modes, similar games, and websites',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'igdb.company_info',
    mcpName: 'igdb.companies.info',
    title: 'Get Company Info (IGDB)',
    description:
      'Look up game companies by ID or search by name — description, country, developed/published game IDs, logos, and websites',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'igdb.platform_info',
    mcpName: 'igdb.platforms.info',
    title: 'Get Platform Info (IGDB)',
    description:
      'Look up gaming platforms by ID or search by name — abbreviation, generation, platform family, versions, and summary',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'igdb.game_media',
    mcpName: 'igdb.games.media',
    title: 'Get Game Media (IGDB)',
    description:
      'Get cover art, screenshots, and video trailers for a game — image URLs with dimensions and YouTube video IDs',
    category: 'entertainment',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // QRServer — QR Code Generator & Reader (UC-040, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'qrserver.generate',
    mcpName: 'qrserver.qr.generate',
    title: 'Generate QR Code',
    description:
      'Generate a QR code image URL from text or URL — customizable size, color, background, format (PNG/SVG), error correction level. Returns direct image URL (goqr.me)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'qrserver.read',
    mcpName: 'qrserver.qr.read',
    title: 'Read QR Code',
    description:
      'Decode a QR code from an image URL — extracts the encoded text or URL from any QR code image (goqr.me)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // UPCitemdb — Barcode / UPC / Product Lookup (UC-041, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'upc.lookup',
    mcpName: 'upc.products.lookup',
    title: 'Product Barcode Lookup',
    description:
      'Look up a product by UPC, EAN, GTIN, or ISBN barcode — returns title, brand, images, dimensions, weight, category, price range, and marketplace offers (UPCitemdb)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'upc.search',
    mcpName: 'upc.products.search',
    title: 'Product Search by Name',
    description:
      'Search products by name, brand, or description — returns matching items with UPC codes, images, categories, and price ranges (UPCitemdb)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // ipapi.is — IP Intelligence / Geolocation (UC-045, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'ip.lookup',
    mcpName: 'ip.intelligence.lookup',
    title: 'IP Address Lookup',
    description:
      'Look up any IP address — geolocation (country, city, coordinates), 9 security flags (VPN, Tor, proxy, datacenter, abuser, crawler, bogon, mobile, satellite), ASN, company info, abuse contacts (ipapi.is)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ip.bulk_lookup',
    mcpName: 'ip.intelligence.bulk',
    title: 'Bulk IP Lookup',
    description:
      'Look up multiple IP addresses in one call (max 100) — country, city, VPN/Tor/proxy flags, ASN, and organization for each IP (ipapi.is)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // USGS Earthquake Hazards Program (UC-048, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'earthquake.search',
    mcpName: 'earthquake.events.search',
    title: 'Search Earthquakes',
    description:
      'Search global earthquakes by time, location, magnitude, and depth — returns magnitude, coordinates, tsunami flags, PAGER alerts, and felt reports. 100+ years of data, updated every minute (USGS)',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'earthquake.feed',
    mcpName: 'earthquake.events.feed',
    title: 'Real-Time Earthquake Feed',
    description:
      'Get real-time earthquake feed by magnitude threshold (significant/4.5+/2.5+/1.0+/all) and time window (hour/day/week/month) — updated every minute (USGS)',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'earthquake.count',
    mcpName: 'earthquake.events.count',
    title: 'Count Earthquakes',
    description:
      'Count earthquakes matching search criteria without returning full data — useful for statistics and monitoring thresholds (USGS)',
    category: 'world',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Jikan — Anime / Manga Database via MyAnimeList (UC-051, 5 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'anime.search',
    mcpName: 'anime.titles.search',
    title: 'Search Anime',
    description:
      'Search 28K+ anime titles by name, genre, type, status, and rating — scores, episodes, studios, seasons (MyAnimeList via Jikan)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'anime.details',
    mcpName: 'anime.titles.details',
    title: 'Get Anime Details',
    description:
      'Get full anime details by MAL ID — synopsis, score, rank, episodes, studios, genres, themes, demographics, rating (MyAnimeList via Jikan)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'manga.details',
    mcpName: 'anime.manga.details',
    title: 'Get Manga Details',
    description:
      'Get full manga details by MAL ID — synopsis, chapters, volumes, authors, score, rank, genres (MyAnimeList via Jikan)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'anime.characters',
    mcpName: 'anime.titles.characters',
    title: 'Get Anime Characters',
    description:
      'Get character cast and Japanese voice actors for an anime — names, roles (main/supporting), images (MyAnimeList via Jikan)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'anime.top',
    mcpName: 'anime.titles.top',
    title: 'Top Anime Rankings',
    description:
      'Get top-ranked anime by score — filter by type (TV/movie/OVA), status (airing/upcoming), or popularity (MyAnimeList via Jikan)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Open Library — Books / ISBN Lookup (UC-054, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'books.isbn_lookup',
    mcpName: 'books.editions.isbn',
    title: 'ISBN Book Lookup',
    description:
      'Look up a book by ISBN-10 or ISBN-13 — title, author, publisher, pages, cover image, subjects. 40M+ books (Open Library / Internet Archive)',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'books.search',
    mcpName: 'books.catalog.search',
    title: 'Search Books',
    description:
      'Search 40M+ books by title, author, subject, or ISBN — ratings, cover images, edition counts, publish year (Open Library / Internet Archive)',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'books.work_details',
    mcpName: 'books.works.details',
    title: 'Get Book Work Details',
    description:
      'Get consolidated work metadata across all editions by Open Library Work ID — description, subjects, authors, cover, first publish date (Open Library)',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'books.author',
    mcpName: 'books.authors.details',
    title: 'Get Author Details',
    description:
      'Get author profile by Open Library Author ID — biography, birth/death dates, photo, Wikipedia link (Open Library / Internet Archive)',
    category: 'education',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // ZeroBounce — Email Validation (UC-055, 1 tool)
  // ---------------------------------------------------------------------------
  {
    toolId: 'email.validate',
    mcpName: 'email.validation.check',
    title: 'Validate Email Address',
    description:
      'Validate an email address — checks deliverability, detects disposable/spam trap/abuse/catch-all addresses, MX records, SMTP provider, domain age. 99.6% accuracy (ZeroBounce)',
    category: 'messaging',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Walk Score — Walkability & Transit Intelligence (UC-062, 1 tool)
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Short.io — URL Shortener (UC-112, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'shorturl.create',
    mcpName: 'web.url.shorten',
    title: 'Shorten URL (Short.io)',
    description:
      '⚡ ACTION: Create a short URL from any long URL. Optional custom slug. Returns short link at apibase.short.gy. 1,000 free links/month (Short.io)',
    category: 'developer',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    toolId: 'shorturl.stats',
    mcpName: 'web.url.stats',
    title: 'Short URL Stats (Short.io)',
    description: 'Get click statistics and metadata for a short URL by its path (Short.io)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // ExchangeRate-API — Currency Conversion (UC-115, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'exchangerate.latest',
    mcpName: 'currency.exchange.latest',
    title: 'Latest Exchange Rates',
    description:
      'Latest exchange rates for 160+ currencies against any base currency. Updated daily on free tier. Returns all rates in one call (ExchangeRate-API)',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'exchangerate.convert',
    mcpName: 'currency.exchange.convert',
    title: 'Convert Currency',
    description:
      'Convert amount between any two currencies — 160+ currencies supported. Returns conversion rate and result (ExchangeRate-API)',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Calendarific — Premium World Holidays (UC-111, 1 tool)
  // ---------------------------------------------------------------------------
  {
    toolId: 'calendarific.holidays',
    mcpName: 'calendar.holidays.premium',
    title: 'World Holidays (Calendarific)',
    description:
      'Public holidays for 230+ countries — national, local, religious, observance types. Filter by month, day, type. 100+ years coverage. More countries than Nager.Date (Calendarific)',
    category: 'world',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // NWS — US Weather Alerts (UC-109, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'weather_alerts.active',
    mcpName: 'weather.alerts.active',
    title: 'Active US Weather Alerts (NWS)',
    description:
      'Active severe weather alerts for the US — tornado warnings, flood watches, heat advisories, winter storms. Filter by state, severity, event type. US Government open data, unlimited, no auth (NWS/NOAA)',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'weather_alerts.by_area',
    mcpName: 'weather.alerts.by_state',
    title: 'Weather Alerts by US State (NWS)',
    description:
      'Active weather alerts for a specific US state — all warnings, watches, and advisories. Returns event, severity, urgency, description, area, timing (NWS/NOAA)',
    category: 'weather',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Nager.Date — World Public Holidays (UC-110, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'holidays.by_country',
    mcpName: 'calendar.holidays.by_country',
    title: 'Public Holidays by Country (Nager.Date)',
    description:
      'Public holidays for any country and year — 100+ countries, national and regional holidays. Returns date, name (local + English), type. No auth, free, open source (Nager.Date)',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'holidays.next',
    mcpName: 'calendar.holidays.next',
    title: 'Next Public Holidays (Nager.Date)',
    description:
      'Next upcoming public holidays for a country — useful for scheduling, availability checks, business day calculations. No auth (Nager.Date)',
    category: 'world',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // NHTSA — US Vehicle VIN Decoder (UC-121, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'vin.decode',
    mcpName: 'vehicle.vin.decode',
    title: 'Decode VIN Number (NHTSA)',
    description:
      'Decode a 17-character VIN — make, model, year, body class, engine, fuel type, transmission, plant country. US Government open data, unlimited, no auth (NHTSA)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'vin.models',
    mcpName: 'vehicle.vin.models',
    title: 'Vehicle Models by Make/Year (NHTSA)',
    description:
      'List vehicle models for a make and/or year (e.g. Honda 2024). US Government data (NHTSA)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // REST Countries — Country Information (UC-122, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'country.search',
    mcpName: 'world.country.search',
    title: 'Search Country by Name',
    description:
      'Search country by name — population, area, capital, languages, currencies, timezones, flag, region, borders. 250+ countries. No auth, free (REST Countries)',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'country.by_code',
    mcpName: 'world.country.code',
    title: 'Country by ISO Code',
    description:
      'Get country details by ISO code (US, GB, DE, JP). Returns name, population, area, capital, currencies, languages, flag (REST Countries)',
    category: 'world',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Open Food Facts — Food Product Database (UC-123, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'food.barcode',
    mcpName: 'food.product.barcode',
    title: 'Food Product by Barcode',
    description:
      'Lookup food product by barcode (EAN/UPC) — name, brand, nutrition (calories, fat, carbs, protein per 100g), Nutri-Score, NOVA group, ingredients. 3M+ products (Open Food Facts)',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'food.search',
    mcpName: 'food.product.search',
    title: 'Search Food Products',
    description:
      'Search food products by name — returns matching products with brand, barcode, Nutri-Score, image. 3M+ products worldwide (Open Food Facts)',
    category: 'world',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Open Beauty Facts — Cosmetics Product Database (UC-601, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'openbeautyfacts.barcode',
    mcpName: 'openbeautyfacts.product.barcode',
    title: 'Cosmetics Product by Barcode',
    description:
      'Lookup a cosmetics/personal-care product by barcode (EAN/UPC) — name, brand, categories, quantity, full ingredients list, image. 6K+ products (Open Beauty Facts)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'openbeautyfacts.search',
    mcpName: 'openbeautyfacts.product.search',
    title: 'Search Cosmetics Products',
    description:
      'Search cosmetics/personal-care products by name — returns matching products with brand, barcode, categories, image. Shampoo, lipstick, sunscreen, and more (Open Beauty Facts)',
    category: 'health',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // RandomUser.me — Random User Generator (UC-124, 1 tool)
  // ---------------------------------------------------------------------------
  {
    toolId: 'random.user',
    mcpName: 'test.random.user',
    title: 'Generate Random User Profile',
    description:
      'Generate realistic random user profiles — name, email, phone, address, age, gender, photo. Filter by nationality and gender. For testing and demo data (RandomUser.me)',
    category: 'world',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // ssl-checker.io — SSL Certificate Check (UC-119, 1 tool)
  // ---------------------------------------------------------------------------
  {
    toolId: 'ssl.check',
    mcpName: 'web.ssl.check',
    title: 'Check SSL Certificate (ssl-checker.io)',
    description:
      'Check SSL/TLS certificate for any domain — validity, issuer, expiry date, days remaining, protocol, key size, HSTS status. No auth, free (ssl-checker.io)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // GDELT — Global Events \& News (UC-107, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'gdelt.search',
    mcpName: 'events.global.search',
    title: 'Search Global News \& Events (GDELT)',
    description:
      'Search global news articles across 65 languages from 300K+ sources worldwide. Filter by time, language, tone. Returns title, URL, domain, country. 100% free, no auth (GDELT Project)',
    category: 'news',
    annotations: READ_ONLY,
  },
  {
    toolId: 'gdelt.timeline',
    mcpName: 'events.global.timeline',
    title: 'News Mention Timeline (GDELT)',
    description:
      'Track mention volume of any topic over time — see when a keyword spikes in global news coverage. Up to 3 months of data (GDELT Project)',
    category: 'news',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // NASA FIRMS — Satellite Fire Detection (UC-108, 1 tool)
  // ---------------------------------------------------------------------------
  {
    toolId: 'firms.fires',
    mcpName: 'earth.fires.detect',
    title: 'Detect Fires by Satellite (NASA FIRMS)',
    description:
      'Active fire hotspots detected by NASA satellites (VIIRS, MODIS) — latitude, longitude, brightness, confidence, fire radiative power. Filter by bounding box and days. Near real-time updates (NASA FIRMS)',
    category: 'space',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // TimeAPI.io — World Clock & Timezone (UC-103, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'worldclock.current',
    mcpName: 'time.worldclock.current',
    title: 'Current Time by Timezone',
    description:
      'Get current date, time, and day of week for any IANA timezone. DST-aware. No auth, free, unlimited (TimeAPI.io)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'worldclock.convert',
    mcpName: 'time.worldclock.convert',
    title: 'Convert Time Between Timezones',
    description:
      'Convert date/time from one timezone to another. DST-aware. 597 IANA timezones (TimeAPI.io)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'worldclock.zones',
    mcpName: 'time.worldclock.zones',
    title: 'List All Timezones',
    description:
      'List all 597 IANA timezone names. Use for timezone validation and discovery (TimeAPI.io)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // ApiFlash — Website Screenshot (UC-093, 1 tool)
  // ---------------------------------------------------------------------------
  {
    toolId: 'screenshot.capture',
    mcpName: 'web.screenshot.capture',
    title: 'Capture Website Screenshot (ApiFlash)',
    description:
      '⚡ ACTION: Take a screenshot of any URL — returns image URL. Chrome-based rendering, supports full-page capture, custom viewport, ad blocking, cookie banner removal. Waits for JS-heavy SPAs to load (ApiFlash)',
    category: 'media',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // API-Sports — Multi-Sport Data (UC-089, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'sports.football_fixtures',
    mcpName: 'sports.football.fixtures',
    title: 'Football/Soccer Fixtures & Scores',
    description:
      'Football/soccer fixtures, live scores, and results — filter by date, league (Premier League, La Liga, Champions League...), team. 2000+ leagues, 171 countries. 362+ fixtures per day (API-Sports)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sports.football_standings',
    mcpName: 'sports.football.standings',
    title: 'Football League Standings',
    description:
      'League table/standings — rank, points, wins, draws, losses, goals for/against. All major leagues: Premier League (39), La Liga (140), Bundesliga (78), Serie A (135), Ligue 1 (61) (API-Sports)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sports.football_leagues',
    mcpName: 'sports.football.leagues',
    title: 'Search Football Leagues',
    description:
      'Search football leagues and cups by country or name. Returns league ID, name, type (league/cup), country, logo. Use IDs for fixtures and standings queries (API-Sports)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sports.basketball_games',
    mcpName: 'sports.basketball.games',
    title: 'Basketball Games & Scores',
    description:
      'Basketball games and scores — NBA, EuroLeague, and 100+ leagues worldwide. Filter by date, league, season, team. Live and historical data (API-Sports)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Langbly — Translation (UC-087, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'langbly.translate',
    mcpName: 'translate.text.translate',
    title: 'Translate Text (Langbly)',
    description:
      'Translate text between 90+ languages — auto-detects source language, supports batch translation (array of strings), HTML format preservation. Google Translate v2 compatible. $5/1M chars (Langbly)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'langbly.detect',
    mcpName: 'translate.text.detect',
    title: 'Detect Language (Langbly)',
    description:
      'Detect the language of text — returns language code and confidence score. Supports batch detection (Langbly)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'langbly.languages',
    mcpName: 'translate.text.languages',
    title: 'List Supported Languages (Langbly)',
    description:
      'List all 90+ supported translation languages with localized names. Specify display_language to get names in that language (Langbly)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Twilio — SMS & Phone Lookup (UC-086, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'twilio.lookup',
    mcpName: 'phone.twilio.lookup',
    title: 'Phone Number Lookup (Twilio)',
    description:
      'Validate and look up phone number info — format validation, country, national format. Optional: carrier name, line type (mobile/landline/VoIP), caller name CNAM (Twilio)',
    category: 'messaging',
    annotations: READ_ONLY,
  },
  {
    toolId: 'twilio.send_sms',
    mcpName: 'phone.twilio.sms',
    title: 'Send SMS (Twilio)',
    description:
      '⚡ ACTION: Send SMS message to any phone number worldwide. Requires a Twilio phone number as sender. Returns message SID and delivery status. $0.0083/SMS US outbound (Twilio)',
    category: 'messaging',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },

  // ---------------------------------------------------------------------------
  // Telnyx — SMS / Voice CPaaS (UC-395, 6 tools — geo-tiered SMS pricing)
  // ---------------------------------------------------------------------------
  {
    toolId: 'telnyx.send_sms_na',
    mcpName: 'phone.telnyx.sms_na',
    title: 'Send SMS — NANP / North America (Telnyx)',
    description:
      '⚡ ACTION: Send SMS to North America (NANP +1 — US, Canada, Caribbean). $0.012/message — cheapest tier. Returns 400 if destination is outside +1. Use telnyx.estimate_price first if unsure (Telnyx)',
    category: 'messaging',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    toolId: 'telnyx.send_sms_world',
    mcpName: 'phone.telnyx.sms_world',
    title: 'Send SMS — World (EU + APAC + LATAM core, Telnyx)',
    description:
      '⚡ ACTION: Send SMS to most international destinations: UK +44, EU (DE/FR/IT/ES/NL/PL...), AU +61, JP +81, IN +91, BR +55, MX +52, ZA +27, IL +972, AE +971, SG +65, KR +82. $0.10/message. Returns 400 if destination is in NA tier (use telnyx.send_sms_na) or premium tier (use telnyx.send_sms_premium) (Telnyx)',
    category: 'messaging',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    toolId: 'telnyx.send_sms_premium',
    mcpName: 'phone.telnyx.sms_premium',
    title: 'Send SMS — Premium (CIS / CN / MENA / Africa, Telnyx)',
    description:
      '⚡ ACTION: Send SMS to high-cost destinations: Russia +7, Belarus +375, Ukraine +380, China +86, Turkey +90, MENA (SA/AE/EG/JO/...), Africa (NG/KE/ZA/...), and any unknown prefix (default). $0.25/message. Highest tier — use telnyx.estimate_price to verify before sending (Telnyx)',
    category: 'messaging',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    toolId: 'telnyx.estimate_price',
    mcpName: 'phone.telnyx.estimate',
    title: 'Estimate SMS Tier + Price (Telnyx)',
    description:
      'Classify a destination phone number into the right pricing tier (na / world / premium) and return the recommended send tool and price. Use this BEFORE telnyx.send_sms_* to avoid 400 errors. $0.001/lookup (Telnyx)',
    category: 'messaging',
    annotations: READ_ONLY,
  },
  {
    toolId: 'telnyx.message_status',
    mcpName: 'phone.telnyx.status',
    title: 'Get Message Status (Telnyx)',
    description:
      'Get delivery status and events for a previously sent Telnyx message by message UUID. Returns per-recipient status (queued/sending/sent/delivered/failed), parts, sent_at, completed_at, errors, and cost (Telnyx)',
    category: 'messaging',
    annotations: READ_ONLY,
  },
  {
    toolId: 'telnyx.list_messages',
    mcpName: 'phone.telnyx.list',
    title: 'List Messages (Telnyx)',
    description:
      'List recent Telnyx messages with optional filters: direction (inbound/outbound), date_from (ISO 8601), and pagination limit (max 100). Returns array of {message_id, from, to, text, status, created_at, cost} (Telnyx)',
    category: 'messaging',
    annotations: READ_ONLY,
  },
  {
    toolId: 'telnyx.balance',
    mcpName: 'phone.telnyx.balance',
    title: 'Account Balance (Telnyx)',
    description:
      'Read current Telnyx account balance, available credit, currency, pending charges, and credit limit. Useful for cost monitoring before placing high-volume sends (Telnyx)',
    category: 'messaging',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // NOAA SWPC — Space Weather (UC-396, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'swpc.k_index',
    mcpName: 'space.swpc.k_index',
    title: 'Geomagnetic K-index (NOAA SWPC)',
    description:
      'Current planetary K-index with G1-G5 storm severity classification, plus the maximum K-index observed in the rolling 6-hour window. Returns latest reading, window_max, and the last N 1-minute observations. Source: NOAA SWPC real-time stream (NODD public domain)',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'swpc.aurora',
    mcpName: 'space.swpc.aurora',
    title: 'Aurora Forecast (NOAA SWPC OVATION)',
    description:
      'Latest OVATION aurora visibility forecast aggregated into 10-degree latitude bands. Returns observation/forecast times plus top northern and southern hemisphere bands by max aurora probability — useful for aurora-tourism agents and high-latitude visibility checks. Source: NOAA SWPC (NODD public domain)',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'swpc.solar_wind',
    mcpName: 'space.swpc.solar_wind',
    title: 'Solar Wind — Real-time (NOAA SWPC RTSW)',
    description:
      'Real-time solar wind speed (km/s), proton density (per cm³), and temperature (K) from the ACE/DSCOVR L1 monitors. Returns the latest reading plus the last N 1-minute observations. Source: NOAA SWPC RTSW (NODD public domain)',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'swpc.solar_regions',
    mcpName: 'space.swpc.solar_regions',
    title: 'Active Solar Regions (NOAA SWPC)',
    description:
      'Currently active sunspot regions with NOAA AR number, location (heliographic), area, spot class, magnetic class, and 24-hour C/M/X-class flare probabilities. Sorted by most recently observed first. Source: NOAA SWPC (NODD public domain)',
    category: 'space',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Free Use Bible API (UC-399, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'bible.translations',
    mcpName: 'bible.catalog.translations',
    title: 'List Bible Translations',
    description:
      'List 1000+ public-domain Bible translations across 429+ languages. Filter by ISO 639-3 language code or English name. Returns translation IDs needed for bible.passage. MIT-licensed open data (Free Use Bible API)',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bible.books',
    mcpName: 'bible.catalog.books',
    title: 'List Books in Translation',
    description:
      'List the books in a specific Bible translation (e.g. KJV → 66 books). Returns book IDs and chapter counts needed for bible.passage. Free Use Bible API',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bible.passage',
    mcpName: 'bible.text.passage',
    title: 'Get Bible Chapter',
    description:
      'Fetch the verse-by-verse text of a Bible chapter for a given translation and book (e.g. KJV / John / 3). Returns array of {number, text}. Free Use Bible API',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bible.commentaries',
    mcpName: 'bible.catalog.commentaries',
    title: 'List Scholarly Commentaries',
    description:
      'List available scholarly Bible commentaries (Matthew Henry, JFB, Gill, etc.). Each entry includes commentary ID, name, and language. Free Use Bible API',
    category: 'education',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Gutendex — Project Gutenberg (UC-400, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'gutendex.search',
    mcpName: 'books.gutendex.search',
    title: 'Search Project Gutenberg',
    description:
      'Search 78K+ public-domain books on Project Gutenberg by free-text query, language (ISO 639-1), topic, or author birth year. Returns book IDs, titles, authors, languages, subjects, download counts, and EPUB/TXT/HTML/cover URLs (Gutendex MIT)',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'gutendex.book',
    mcpName: 'books.gutendex.book',
    title: 'Get Gutenberg Book Details',
    description:
      'Get full metadata + download URLs (EPUB, TXT, HTML, cover JPEG) for a Project Gutenberg book by numeric ID (e.g. 1342 = Pride and Prejudice). Gutendex MIT',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'gutendex.by_author',
    mcpName: 'books.gutendex.by_author',
    title: 'Books by Author',
    description:
      'List all Project Gutenberg books by a specific author (search by name). Filter by language. Gutendex MIT',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'gutendex.popular',
    mcpName: 'books.gutendex.popular',
    title: 'Popular Public-Domain Books',
    description:
      'List most-downloaded Project Gutenberg books, optionally filtered by language or topic. Gutendex MIT',
    category: 'education',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // LibriVox — Public-Domain Audiobooks (UC-401, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'librivox.search',
    mcpName: 'books.librivox.search',
    title: 'Search LibriVox Audiobooks',
    description:
      'Search 20K+ public-domain audiobooks by title, author, or genre. Returns book IDs, descriptions, languages, copyright years, total time, and ZIP download URLs. LibriVox public domain',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'librivox.book',
    mcpName: 'books.librivox.book',
    title: 'Get LibriVox Audiobook Details',
    description:
      'Get full audiobook details by LibriVox ID — includes per-section MP3 URLs (chapter-level streaming), playtimes, authors, and project metadata. LibriVox public domain',
    category: 'education',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Tatoeba — Multilingual Sentence Database (UC-402, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'tatoeba.search',
    mcpName: 'language.tatoeba.search',
    title: 'Search Tatoeba Sentences',
    description:
      'Search 13M parallel sentences across 429 languages (CC-BY 2.0 FR). Filter by source language, optional translation language, audio availability, and free-text keyword. Sort by relevance/random/created/modified. Tatoeba',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tatoeba.sentence',
    mcpName: 'language.tatoeba.sentence',
    title: 'Get Tatoeba Sentence + Translations',
    description:
      'Get a single Tatoeba sentence by ID with all translations and audio recordings. Useful for language-learning agents. Tatoeba CC-BY 2.0 FR',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tatoeba.languages',
    mcpName: 'language.tatoeba.languages',
    title: 'List Tatoeba Languages',
    description:
      'List all 429 supported languages on Tatoeba with ISO 639-3 codes and sentence counts. Tatoeba CC-BY 2.0 FR',
    category: 'education',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // US Library of Congress (UC-409, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'loc.search',
    mcpName: 'media.loc.search',
    title: 'Search Library of Congress',
    description:
      'Search 415K+ digitized historical items at LOC (photos, manuscripts, maps, newspapers, films, rare books). Filter by online format (image/audio/video/text/web archive) or collection slug. Public domain by US statute (17 USC §105)',
    category: 'media',
    annotations: READ_ONLY,
  },
  {
    toolId: 'loc.item',
    mcpName: 'media.loc.item',
    title: 'Get LOC Item Detail',
    description:
      'Get full metadata + asset URLs (image, audio, PDF) for a Library of Congress item by its ID or full LOC URL. Includes rights, contributors, subjects, and digitized resource list. LOC public domain',
    category: 'media',
    annotations: READ_ONLY,
  },
  {
    toolId: 'loc.collections',
    mcpName: 'media.loc.collections',
    title: 'List LOC Collections',
    description:
      'Browse Library of Congress digital collections — Civil War Photographs, Geography & Map Division, Rosa Parks Papers, etc. Returns collection slugs needed for filtered search. LOC public domain',
    category: 'media',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // UK Police API (UC-411, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'ukpolice.crimes_near',
    mcpName: 'gov.ukpolice.crimes_near',
    title: 'UK Crimes Near Coordinate',
    description:
      'Street-level UK crime records within 1 mile of a coordinate for a given month (England + Wales, 43 forces). Filter by crime category. Returns up to 500 records with category, location, outcome status. OGL v3.0 (commercial OK)',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ukpolice.forces',
    mcpName: 'gov.ukpolice.forces',
    title: 'UK Police Forces',
    description:
      'List the 43 UK police forces (id + name) for England and Wales. Used to drill down into per-force statistics. OGL v3.0',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ukpolice.outcomes_at_location',
    mcpName: 'gov.ukpolice.outcomes',
    title: 'UK Crime Outcomes at Location',
    description:
      'Case outcomes (charged, acquitted, action taken, etc.) for crimes at a UK coordinate in a given month. Useful for property safety scoring. OGL v3.0',
    category: 'legal',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // BrasilAPI — Brazilian Gov Aggregator (UC-403, 6 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'brasilapi.cnpj',
    mcpName: 'gov.brasilapi.cnpj',
    title: 'Lookup Brazilian Company (CNPJ)',
    description:
      'Look up a Brazilian company by 14-digit CNPJ tax ID — returns name, address, CNAE codes, QSA partners, capital, status from Receita Federal. BrasilAPI MIT',
    category: 'business',
    annotations: READ_ONLY,
  },
  {
    toolId: 'brasilapi.cep',
    mcpName: 'gov.brasilapi.cep',
    title: 'Lookup Brazilian Address (CEP)',
    description:
      'Look up a Brazilian address by 8-digit CEP postal code — returns street, neighborhood, city, state, coordinates, timezone. BrasilAPI MIT',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'brasilapi.banks',
    mcpName: 'gov.brasilapi.banks',
    title: 'List Brazilian Banks',
    description: 'List all 472 Brazilian banks with ISPB codes and bank numbers. BrasilAPI MIT',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'brasilapi.rates',
    mcpName: 'gov.brasilapi.rates',
    title: 'Brazilian Interest Rates',
    description: 'Current SELIC, CDI, and IPCA rates from Banco Central do Brasil. BrasilAPI MIT',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'brasilapi.holidays',
    mcpName: 'gov.brasilapi.holidays',
    title: 'Brazilian National Holidays',
    description: 'All Brazilian national holidays for a given year. BrasilAPI MIT',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'brasilapi.ddd',
    mcpName: 'gov.brasilapi.ddd',
    title: 'Brazilian Area Code (DDD) Lookup',
    description: 'Look up Brazilian area code (DDD, 2 digits) → state and cities. BrasilAPI MIT',
    category: 'location',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // IBGE — Brazilian Census + Geography (UC-404, 5 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'ibge.states',
    mcpName: 'gov.ibge.states',
    title: 'Brazilian States',
    description:
      'All 27 Brazilian states + Federal District with full region hierarchy. IBGE CC BY 4.0',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ibge.municipalities',
    mcpName: 'gov.ibge.municipalities',
    title: 'Brazilian Municipalities',
    description:
      'List all 5,570 Brazilian municipalities (or filtered by 2-letter state code) with IBGE codes. IBGE CC BY 4.0',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ibge.name_frequency',
    mcpName: 'gov.ibge.name_frequency',
    title: 'Brazilian Name Frequency',
    description:
      'First-name popularity time-series by decade since 1930 from Brazilian census data — useful for cultural/marketing research. IBGE CC BY 4.0',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ibge.cnae',
    mcpName: 'gov.ibge.cnae',
    title: 'CNAE Economic Activity Classes',
    description:
      'Brazilian CNAE economic activity classification codes used in CNPJ and tax filings. IBGE CC BY 4.0',
    category: 'business',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ibge.regions',
    mcpName: 'gov.ibge.regions',
    title: 'Brazilian Geographic Regions',
    description:
      'The 5 Brazilian geographic regions (Norte, Nordeste, Sudeste, Sul, Centro-Oeste) with metadata. IBGE CC BY 4.0',
    category: 'world',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Banco Central do Brasil SGS (UC-405, 6 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'bcb.selic',
    mcpName: 'finance.bcb.selic',
    title: 'SELIC Daily Rate',
    description:
      'Brazilian SELIC daily interest rate (series 11) — last N observations from BCB SGS. ODbL',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bcb.cdi',
    mcpName: 'finance.bcb.cdi',
    title: 'CDI Daily Rate',
    description: 'Brazilian CDI daily rate (series 12) — last N observations from BCB SGS. ODbL',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bcb.ipca',
    mcpName: 'finance.bcb.ipca',
    title: 'IPCA Monthly Inflation',
    description:
      'Brazilian IPCA monthly inflation rate (series 433) — last N observations from BCB SGS. ODbL',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bcb.usd_brl',
    mcpName: 'finance.bcb.usd_brl',
    title: 'USD/BRL Daily FX',
    description:
      'Brazilian Real / US Dollar daily exchange rate (series 1) — last N observations from BCB SGS. ODbL',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bcb.eur_brl',
    mcpName: 'finance.bcb.eur_brl',
    title: 'EUR/BRL Daily FX',
    description:
      'Brazilian Real / Euro daily exchange rate (series 21619) — last N observations from BCB SGS. ODbL',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bcb.selic_target',
    mcpName: 'finance.bcb.selic_target',
    title: 'SELIC Target (COPOM)',
    description:
      'COPOM-set SELIC target rate (series 4389) — Brazilian central bank policy decisions. BCB SGS ODbL',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Eurostat (UC-410, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'eurostat.unemployment',
    mcpName: 'finance.eurostat.unemployment',
    title: 'EU Monthly Unemployment Rate',
    description:
      'Monthly unemployment rate (% of active population, seasonally adjusted, total population) for one EU country (geo code) or aggregate (EU27_2020, EA20). Eurostat dataset une_rt_m, CC BY 4.0',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'eurostat.inflation',
    mcpName: 'finance.eurostat.inflation',
    title: 'EU HICP Annual Inflation',
    description:
      'Monthly HICP annual rate of change (overall index) for one EU country. Eurostat dataset prc_hicp_manr, CC BY 4.0',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'eurostat.gdp_growth',
    mcpName: 'finance.eurostat.gdp_growth',
    title: 'EU Annual GDP Growth',
    description:
      'Annual real GDP growth rate (chain-linked volumes, % change vs previous year) for one EU country. Eurostat dataset tec00115, CC BY 4.0',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'eurostat.population',
    mcpName: 'finance.eurostat.population',
    title: 'EU Population (1 Jan)',
    description:
      'Annual population on 1 January for one EU country. Eurostat dataset demo_gind, CC BY 4.0',
    category: 'world',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Singapore data.gov.sg (UC-412, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'sg.weather_forecast',
    mcpName: 'gov.sg.weather_forecast',
    title: 'Singapore 2-Hour Weather Forecast',
    description:
      'Real-time 2-hour weather forecast for 51 Singapore zones (showers/cloudy/etc.) from NEA. Singapore Open Data Licence v1.0',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sg.air_quality',
    mcpName: 'gov.sg.air_quality',
    title: 'Singapore PM2.5 Air Quality',
    description:
      'Real-time PM2.5 readings (μg/m³) for the 5 Singapore regions (north/south/east/west/central). NEA, SG Open Data Licence v1.0',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sg.rainfall',
    mcpName: 'gov.sg.rainfall',
    title: 'Singapore Rainfall',
    description:
      '5-minute rainfall readings (mm) from 60 NEA weather stations across Singapore with station coords. SG Open Data Licence v1.0',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sg.taxi_availability',
    mcpName: 'gov.sg.taxi_availability',
    title: 'Singapore Live Taxi Density',
    description:
      'Live taxi positions across Singapore aggregated to a 5km grid — returns the top 30 zones by taxi count and the timestamp of the snapshot. LTA, SG Open Data Licence v1.0',
    category: 'world',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // AirNow EPA — US AQI (UC-397, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'airnow.current_zip',
    mcpName: 'weather.airnow.current_zip',
    title: 'Current AQI by US ZIP Code',
    description:
      'Current Air Quality Index (AQI) observations from EPA AirNow for any US ZIP code. Returns PM2.5, ozone, AQI value + category (Good/Moderate/Unhealthy/...). US Gov free',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'airnow.current_latlng',
    mcpName: 'weather.airnow.current_latlng',
    title: 'Current AQI by Coordinate',
    description:
      'Current AQI observations near a US coordinate. Same fields as current_zip. EPA AirNow',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'airnow.forecast_zip',
    mcpName: 'weather.airnow.forecast_zip',
    title: 'AQI Forecast by US ZIP',
    description:
      'Multi-day AQI forecast (today + ~5 days) for a US ZIP — ozone + PM2.5 expected category. EPA AirNow',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'airnow.forecast_latlng',
    mcpName: 'weather.airnow.forecast_latlng',
    title: 'AQI Forecast by Coordinate',
    description: 'Multi-day AQI forecast for a US lat/lng. EPA AirNow',
    category: 'weather',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // US National Park Service (UC-406, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'nps.parks',
    mcpName: 'travel.nps.parks',
    title: 'US National Parks',
    description:
      'Search the 474 US national parks with full metadata: coords, activities, entrance fees, operating hours, photos, designation. Filter by state code, park code, or keyword. NPS public domain',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nps.alerts',
    mcpName: 'travel.nps.alerts',
    title: 'NPS Park Alerts',
    description:
      'Real-time alerts (closures, hazards, fire, flood, danger) for US national parks. Filter by state or park code. NPS public domain',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nps.campgrounds',
    mcpName: 'travel.nps.campgrounds',
    title: 'NPS Campgrounds',
    description:
      'NPS campgrounds with reservation info, accessibility, amenities, coords. NPS public domain',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nps.things_to_do',
    mcpName: 'travel.nps.things_to_do',
    title: 'NPS Things To Do',
    description:
      'Activities, programs, tours offered at US national parks (3,587 entries). Filter by park or state. NPS public domain',
    category: 'travel',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // US Energy Information Administration (UC-407, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'eia.electricity_retail',
    mcpName: 'finance.eia.electricity',
    title: 'US Retail Electricity',
    description:
      'Retail electricity sales/price/revenue by US state and sector (residential, commercial, industrial). Frequency monthly/quarterly/annual. EIA public domain, 5K req/hr',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'eia.petroleum_spot',
    mcpName: 'finance.eia.petroleum',
    title: 'US Petroleum Spot Prices',
    description:
      'Spot prices for crude oil and petroleum products: WTI (EPCWTI), Brent (EPCBRENT), Diesel (EPD2D), Regular Gas (EPMRR). Daily/weekly/monthly/annual. EIA public domain',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'eia.natural_gas',
    mcpName: 'finance.eia.natural_gas',
    title: 'US Natural Gas Prices',
    description:
      'Natural gas residential/commercial/industrial prices by US state. EIA public domain',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'eia.series',
    mcpName: 'finance.eia.series',
    title: 'EIA Total-Energy Series',
    description:
      'Direct fetch of any EIA total-energy time-series by series ID (e.g. RNGWHHD = Henry Hub spot, ELETPUS = US electricity total). EIA public domain',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // US Federal Election Commission (UC-408, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'fec.candidates',
    mcpName: 'gov.fec.candidates',
    title: 'FEC Federal Candidates',
    description:
      'Search 53K+ US federal election candidates by name/cycle/office (House/Senate/Presidential)/state/party. Returns FEC candidate ID + filing dates. FEC public disclosure',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'fec.committee_totals',
    mcpName: 'gov.fec.committee_totals',
    title: 'FEC Committee Totals',
    description:
      'Receipts, disbursements, and cash-on-hand for US political committees (PACs, parties, candidate committees). Filter by cycle and committee type. FEC public disclosure',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'fec.super_pac_spending',
    mcpName: 'gov.fec.super_pac_spending',
    title: 'Super PAC Independent Expenditures',
    description:
      'Schedule E independent expenditures — Super PAC spending supporting/opposing specific federal candidates. Filter by cycle, candidate ID, or support/oppose direction. FEC public disclosure',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'fec.elections',
    mcpName: 'gov.fec.elections',
    title: 'FEC Election Totals',
    description:
      'Aggregate election totals by cycle, office, and state — total receipts, disbursements, candidate count per race. FEC public disclosure',
    category: 'legal',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Stability AI — Image Generation (UC-080, 1 tool)
  // ---------------------------------------------------------------------------
  {
    toolId: 'stability.generate',
    mcpName: 'ai.image.generate',
    title: 'Generate Image (Stability AI)',
    description:
      '⚡ ACTION: Generate images from text prompts using Stable Diffusion — supports style presets (anime, cinematic, pixel-art, photographic...), aspect ratios, negative prompts. Returns base64 PNG data URI. Powered by Stability AI',
    category: 'media',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Resend — Transactional Email (UC-076, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'resend.send_email',
    mcpName: 'email.transactional.send',
    title: 'Send Email (Resend)',
    description:
      '⚡ ACTION: Send transactional email — plain text or HTML body, multiple recipients, reply-to. Requires verified sender domain. 3,000 free emails/month (Resend)',
    category: 'messaging',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    toolId: 'resend.email_status',
    mcpName: 'email.transactional.status',
    title: 'Check Email Status (Resend)',
    description: 'Check delivery status of a sent email by ID — last event, timestamps (Resend)',
    category: 'messaging',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Mastodon — Fediverse Social Media (UC-081, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'mastodon.trending',
    mcpName: 'social.mastodon.trending',
    title: 'Trending Mastodon Posts',
    description:
      'Trending posts on Mastodon (Fediverse) — popular content across the decentralized social network. Returns post text, author, reblogs, favourites, replies. No auth needed, $0 upstream (Mastodon.social)',
    category: 'social',
    annotations: READ_ONLY,
  },
  {
    toolId: 'mastodon.trending_tags',
    mcpName: 'social.mastodon.tags',
    title: 'Trending Mastodon Hashtags',
    description:
      'Trending hashtags on Mastodon — top topics with usage counts. Track social media trends on the decentralized network. No auth needed (Mastodon.social)',
    category: 'social',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Regulations.gov — US Federal Regulatory Data (UC-082, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'regulations.search',
    mcpName: 'legal.regulations.search',
    title: 'Search US Federal Regulations',
    description:
      'Search US federal regulatory documents — rules, proposed rules, notices, presidential documents. Filter by agency (EPA, SEC, FDA...), document type, date. 7,500+ results for "artificial intelligence" (Regulations.gov)',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'regulations.document',
    mcpName: 'legal.regulations.document',
    title: 'Get Regulatory Document Details',
    description:
      'Get full details of a US federal regulatory document by ID — title, abstract, agency, comment count, docket, dates. Public domain (Regulations.gov)',
    category: 'legal',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Federal Register — US Federal Rules & Executive Orders (UC-083, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'fedregister.search',
    mcpName: 'legal.fedregister.search',
    title: 'Search Federal Register',
    description:
      'Search the US Federal Register — final rules, proposed rules, notices, executive orders. Filter by agency, type, date. 90+ years of official federal government records (Federal Register)',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'fedregister.document',
    mcpName: 'legal.fedregister.document',
    title: 'Get Federal Register Document',
    description:
      'Get full Federal Register document by number — title, abstract, agencies, effective date, PDF link, comment deadline (Federal Register)',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'fedregister.recent',
    mcpName: 'legal.fedregister.recent',
    title: 'Recent Federal Register Documents',
    description:
      'Latest documents published in the Federal Register — filter by type (rules, proposed rules, notices, presidential). No search query needed (Federal Register)',
    category: 'legal',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // CourtListener — US Case Law (UC-084, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'courtlistener.search',
    mcpName: 'legal.caselaw.search',
    title: 'Search US Court Opinions',
    description:
      'Search US federal and state court opinions — filter by court (scotus, ca9, dcd...), date range, relevance. Largest free US case law archive. 7,000+ AI-related opinions (CourtListener / Free Law Project)',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'courtlistener.opinion',
    mcpName: 'legal.caselaw.opinion',
    title: 'Get Court Opinion Text',
    description:
      'Get full text of a US court opinion by ID — author, type, date, download URL. Up to 5,000 characters of opinion text (CourtListener)',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'courtlistener.dockets',
    mcpName: 'legal.caselaw.dockets',
    title: 'Search Court Dockets (RECAP)',
    description:
      'Search PACER/RECAP federal court dockets — case filings, motions, orders. Filter by court. From the RECAP Archive (CourtListener / Free Law Project)',
    category: 'legal',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // OCR.space — Optical Character Recognition (UC-078, 1 tool)
  // ---------------------------------------------------------------------------
  {
    toolId: 'ocr.extract_text',
    mcpName: 'ai.ocr.extract',
    title: 'Extract Text from Image (OCR)',
    description:
      'Extract text from any image or PDF URL using OCR — supports 20+ languages including English, Russian, Chinese, Japanese, Korean, Arabic. Returns recognized text. Handles PNG, JPG, GIF, BMP, PDF, TIFF (OCR.space)',
    category: 'media',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Finnhub — Stock Market Data (UC-074, 5 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'finnhub.quote',
    mcpName: 'stocks.market.quote',
    title: 'Real-Time Stock Quote',
    description:
      'Real-time stock price quote — current price, change, percent change, day high/low, open, previous close. Supports US stocks, ETFs, and major global exchanges (Finnhub)',
    category: 'finance',
    relatedTools: [
      { toolId: 'finnhub.company', reason: 'Company profile and fundamentals' },
      { toolId: 'finance.exchange_rates', reason: 'Convert price to different currency' },
      { toolId: 'serper.news_search', reason: 'Latest news about this stock' },
    ],
    annotations: READ_ONLY,
  },
  {
    toolId: 'finnhub.company_profile',
    mcpName: 'stocks.company.profile',
    title: 'Company Profile',
    description:
      'Company profile by ticker — name, exchange, industry, country, market cap, shares outstanding, IPO date, logo, website (Finnhub)',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'finnhub.company_news',
    mcpName: 'stocks.company.news',
    title: 'Company News',
    description:
      'Latest news articles about a specific company — headline, source, summary, date, image. Filter by date range (Finnhub)',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'finnhub.candles',
    mcpName: 'stocks.market.candles',
    title: 'Stock Price Candles (OHLCV)',
    description:
      'Historical OHLCV candlestick data — open, high, low, close, volume with configurable resolution (1min to monthly). Use for charting and technical analysis (Finnhub)',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'finnhub.market_news',
    mcpName: 'stocks.market.news',
    title: 'Market News',
    description:
      'General market news — categories: general, forex, crypto, merger. Top headlines with source, summary, and images (Finnhub)',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // NewsData.io — Global News (UC-070, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'news.latest',
    mcpName: 'news.global.latest',
    title: 'Latest Global News',
    description:
      'Latest news from 180,000+ sources across 200+ countries in 70+ languages. Filter by keyword, country, category, language, domain, and recency. Returns title, link, description, source, sentiment, keywords (NewsData.io)',
    category: 'news',
    annotations: READ_ONLY,
  },
  {
    toolId: 'news.crypto',
    mcpName: 'news.crypto.latest',
    title: 'Crypto & Blockchain News',
    description:
      'Cryptocurrency and blockchain news feed — filter by coin (Bitcoin, Ethereum, Solana...), keyword, language. Dedicated crypto news index from specialized sources (NewsData.io)',
    category: 'news',
    annotations: READ_ONLY,
  },
  {
    toolId: 'news.sources',
    mcpName: 'news.global.sources',
    title: 'News Sources Directory',
    description:
      'Browse available news sources — filter by country, language, and category. Returns source name, URL, categories, and languages covered. 180,000+ sources indexed (NewsData.io)',
    category: 'news',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Exa — Semantic Web Search (UC-069, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'exa.search',
    mcpName: 'search.semantic.web',
    title: 'Semantic Web Search (Exa)',
    description:
      'Neural/semantic web search — finds conceptually related pages, not just keyword matches. Supports category filters (company, research paper, news, people, tweet), domain filtering, date range. Returns relevance scores and highlighted excerpts (Exa)',
    category: 'search',
    annotations: READ_ONLY,
  },
  {
    toolId: 'exa.contents',
    mcpName: 'search.semantic.contents',
    title: 'Extract Page Content (Exa)',
    description:
      'Extract clean text content from up to 10 URLs — returns title, author, published date, full text. Use for feeding web pages into agent context (Exa)',
    category: 'search',
    annotations: READ_ONLY,
  },
  {
    toolId: 'exa.find_similar',
    mcpName: 'search.semantic.similar',
    title: 'Find Similar Pages (Exa)',
    description:
      'Find web pages semantically similar to a given URL — discover related content, competitors, alternatives without knowing what to search for. Unique capability for research agents (Exa)',
    category: 'search',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Tavily — AI Web Search (UC-068, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'tavily.search',
    mcpName: 'search.ai.web',
    title: 'AI Web Search (Tavily)',
    description:
      'AI-optimized web search — returns synthesized answer + curated results with extracted page content and relevance scores. Built for LLM/agent RAG pipelines. Supports domain filtering and recency (Tavily)',
    category: 'search',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tavily.extract',
    mcpName: 'search.ai.extract',
    title: 'Extract Web Page Content (Tavily)',
    description:
      'Extract clean readable content from up to 20 URLs — returns text, title, author, published date. Eliminates scraping. Perfect for feeding web pages into agent context windows (Tavily)',
    category: 'search',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Serper.dev — Google Search API (UC-067, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'serper.web_search',
    mcpName: 'search.google.web',
    title: 'Google Web Search',
    description:
      'Real-time Google web search results — organic listings, knowledge graph, answer box, people also ask, related searches. Supports country and language targeting. Powered by Serper.dev',
    category: 'search',
    relatedTools: [
      { toolId: 'serper.news_search', reason: 'Search news specifically' },
      { toolId: 'diffbot.article_extract', reason: 'Extract full article from search result URL' },
    ],
    annotations: READ_ONLY,
  },
  {
    toolId: 'serper.news_search',
    mcpName: 'search.google.news',
    title: 'Google News Search',
    description:
      'Real-time Google News articles — title, source, date, snippet, image. Filter by time (past hour/day/week/month). Global coverage in 70+ languages (Serper.dev)',
    category: 'search',
    annotations: READ_ONLY,
  },
  {
    toolId: 'serper.image_search',
    mcpName: 'search.google.images',
    title: 'Google Image Search',
    description:
      'Google Image search results — image URL, thumbnail, dimensions, source domain. Search any visual content worldwide (Serper.dev)',
    category: 'search',
    annotations: READ_ONLY,
  },
  {
    toolId: 'serper.shopping_search',
    mcpName: 'search.google.shopping',
    title: 'Google Shopping Search',
    description:
      'Google Shopping product listings — title, price, source, rating, delivery info, product images. Compare prices across retailers (Serper.dev)',
    category: 'search',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // US Real Estate — Property Listings & Details (UC-063, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'usrealestate.for_sale',
    mcpName: 'realestate.listings.for_sale',
    title: 'Search US Properties For Sale',
    description:
      'Search active for-sale property listings across the US — filter by city, state, ZIP, price range, bedrooms, bathrooms, sqft, property type. Returns address, price, specs, photos. Millions of MLS listings (RapidAPI / Realtor.com data)',
    category: 'location',
    relatedTools: [
      { toolId: 'walkscore.score', reason: 'Walkability + transit + bike scores for listing' },
      { toolId: 'geo.geocode', reason: 'Get coordinates for area search' },
    ],
    annotations: READ_ONLY,
  },
  {
    toolId: 'usrealestate.property_detail',
    mcpName: 'realestate.property.details',
    title: 'Get US Property Details',
    description:
      'Detailed property information by property ID — beds, baths, sqft, year built, lot size, tax assessment, HOA, days on market, photos, last sale price/date. Use for_sale search first to get property_id (RapidAPI / Realtor.com data)',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'usrealestate.location_suggest',
    mcpName: 'realestate.location.suggest',
    title: 'US Real Estate Location Search',
    description:
      'Autocomplete location search for US real estate — returns matching cities, ZIP codes, and addresses with coordinates. Use to find valid city/state codes for property searches (RapidAPI / Realtor.com data)',
    category: 'location',
    annotations: READ_ONLY,
  },

  {
    toolId: 'walkscore.score',
    mcpName: 'realestate.walkscore.score',
    title: 'Get Walk Score, Transit Score & Bike Score',
    description:
      'Walk Score (0-100), Transit Score (0-100), and Bike Score (0-100) for any US/Canada address. Measures walkability to amenities, public transit quality, and cycling infrastructure. Industry-standard walkability metric used by 30,000+ websites (Walk Score / Redfin)',
    category: 'location',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // IQAir AirVisual — Air Quality (UC-120, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'airquality.city',
    mcpName: 'environment.airquality.city',
    title: 'Air Quality by City',
    description:
      'Real-time air quality index (AQI US + CN), pollutant concentrations (PM2.5, PM10, O3, NO2, SO2, CO), dominant pollutant, temperature, humidity, wind speed for any city worldwide. 30,000+ monitoring stations across 10,000+ cities (IQAir AirVisual)',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'airquality.nearest',
    mcpName: 'environment.airquality.nearest',
    title: 'Air Quality by Coordinates',
    description:
      'Real-time air quality index (AQI) and weather data for the nearest monitoring station to given GPS coordinates. Returns nearest city, AQI (US + CN), dominant pollutant, PM2.5/PM10/O3 concentrations, temperature, humidity (IQAir AirVisual)',
    category: 'weather',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // FatSecret — Nutrition Database (UC-126, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'fatsecret.food_search',
    mcpName: 'nutrition.fatsecret.search',
    title: 'Search Food Nutrition Database',
    description:
      'Search 2.3M+ food items by name — branded products, restaurant meals, generic foods from 190+ countries. Returns food ID, name, type, brand, and per-serving summary (calories, fat, carbs, protein). Use food_id for detailed nutritional lookup (FatSecret)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'fatsecret.food_details',
    mcpName: 'nutrition.fatsecret.details',
    title: 'Food Nutritional Details',
    description:
      'Complete nutritional profile for a food item by FatSecret ID — all serving sizes with calories, total/saturated/trans fat, cholesterol, sodium, potassium, carbs, fiber, sugar, protein, vitamins A/C/D, calcium, iron. 2.3M+ foods (FatSecret)',
    category: 'health',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Hunter.io — Company Enrichment (UC-128, 1 tool)
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Auto.dev — Global VIN Decoder (UC-127, 1 tool)
  // ---------------------------------------------------------------------------
  {
    toolId: 'autodev.vin_decode',
    mcpName: 'vehicle.autodev.vin_decode',
    title: 'Global VIN Decode (Auto.dev)',
    description:
      'Decode any VIN worldwide (100+ countries) — make, model, year, trim, engine, transmission, drive type, body style, origin country, manufacturer. Covers EU, Asia, and other markets beyond US-only NHTSA. Static data cached 24h (Auto.dev)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Geocodio — US/Canada Address Geocoding (UC-131, 2 tools)
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // PodcastIndex — Podcast Directory (UC-141, 4 tools)
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // API2PDF — PDF Generation (UC-146, 3 tools)
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // ConvertAPI — File Format Conversion (UC-148, 3 tools)
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Europeana — European Cultural Heritage (UC-161, 2 tools)
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Art Institute of Chicago — ARTIC (UC-162, 3 tools)
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Bluesky AT Protocol — Decentralized Social (UC-171, 3 tools)
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // SEC EDGAR — US Company Filings (UC-173, 3 tools)
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Companies House — UK Company Registry (UC-174, 2 tools)
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // GLEIF LEI — Global Legal Entity Identifiers (UC-175, 3 tools)
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // AssemblyAI — Speech-to-Text (UC-179, 3 tools)
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // VATcomply — EU VAT Validation + Rates (UC-185, 3 tools)
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Cloudflare — DNS, CDN & Infrastructure (UC-201, 6 tools) — EXCLUSIVE
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // NameSilo — Domain Registration (UC-202, 5 tools) — EXCLUSIVE
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // ClinicalTrials.gov — Clinical Research Database (UC-203, 3 tools) — EXCLUSIVE
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Telegram Bot API — Messaging (UC-204, 5 tools) — EXCLUSIVE
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Browserbase — Managed Browser Sessions (UC-205, 4 tools) — EXCLUSIVE
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Pexels — Stock Photos & Videos (UC-207, 3 tools) — EXCLUSIVE
  // ---------------------------------------------------------------------------
  {
    toolId: 'pexels.search_photos',
    mcpName: 'media.pexels.search_photos',
    title: 'Search Pexels Stock Photos',
    description:
      'Search curated free stock photos by keyword — filter by orientation (landscape/portrait/square), color, size. Returns multiple resolutions (original to tiny), photographer name, Pexels URL. Free for commercial use (Pexels)',
    category: 'media',
    annotations: READ_ONLY,
  },
  {
    toolId: 'pexels.search_videos',
    mcpName: 'media.pexels.search_videos',
    title: 'Search Pexels Stock Videos',
    description:
      'Search free stock videos by keyword — returns HD/SD video files with dimensions, duration, download URLs. Free for commercial use (Pexels)',
    category: 'media',
    annotations: READ_ONLY,
  },
  {
    toolId: 'pexels.curated',
    mcpName: 'media.pexels.curated',
    title: 'Pexels Curated Photos',
    description:
      'Hand-picked high-quality curated photos from Pexels — updated daily. Returns photographer, multiple sizes, Pexels URL. Perfect for featured images and hero sections (Pexels)',
    category: 'media',
    annotations: READ_ONLY,
  },

  {
    toolId: 'browser.create_session',
    mcpName: 'infra.browser.create_session',
    title: 'Create Browser Session',
    description:
      '⚡ ACTION: Create a managed headless browser session on Browserbase infrastructure. Returns session ID and WebSocket connect URL for Puppeteer/Playwright. Choose region (US/EU/Asia) and optional residential proxy. Sessions auto-expire after 5 minutes of inactivity (Browserbase)',
    category: 'infrastructure',
    annotations: TRADING,
  },
  {
    toolId: 'browser.session_status',
    mcpName: 'infra.browser.session_status',
    title: 'Browser Session Status',
    description:
      'Check the status of a Browserbase session — running, completed, error, timed out. Returns CPU usage, memory, proxy bytes, start/end times (Browserbase)',
    category: 'infrastructure',
    annotations: READ_ONLY,
  },
  {
    toolId: 'browser.session_content',
    mcpName: 'infra.browser.session_content',
    title: 'Browser Session Downloads',
    description:
      'Get files downloaded during a browser session — screenshots, PDFs, extracted data (Browserbase)',
    category: 'infrastructure',
    annotations: READ_ONLY,
  },
  {
    toolId: 'browser.list_sessions',
    mcpName: 'infra.browser.list_sessions',
    title: 'List Browser Sessions',
    description:
      'List active or recent browser sessions — filter by status (running, completed, error). Returns session IDs, regions, start times (Browserbase)',
    category: 'infrastructure',
    annotations: READ_ONLY,
  },

  {
    toolId: 'telegram.send_message',
    mcpName: 'messaging.telegram.send_message',
    title: 'Send Telegram Message',
    description:
      '⚡ ACTION: Send a text message to a Telegram user or group chat. Supports Markdown (*bold*, _italic_, `code`, [link](url)) and HTML formatting. Max 4096 chars. Perfect for alerts, notifications, reports (Telegram Bot API)',
    category: 'messaging',
    annotations: TRADING,
  },
  {
    toolId: 'telegram.send_photo',
    mcpName: 'messaging.telegram.send_photo',
    title: 'Send Telegram Photo',
    description:
      '⚡ ACTION: Send a photo to a Telegram chat with optional caption. Provide image URL — supports JPG, PNG, GIF up to 10MB (Telegram Bot API)',
    category: 'messaging',
    annotations: TRADING,
  },
  {
    toolId: 'telegram.send_document',
    mcpName: 'messaging.telegram.send_document',
    title: 'Send Telegram Document',
    description:
      '⚡ ACTION: Send a file/document to a Telegram chat — PDF, CSV, ZIP, any format up to 50MB. Perfect for sending reports, data exports, generated files (Telegram Bot API)',
    category: 'messaging',
    annotations: TRADING,
  },
  {
    toolId: 'telegram.get_updates',
    mcpName: 'messaging.telegram.get_updates',
    title: 'Get Telegram Updates',
    description:
      'Get recent incoming messages and events for the bot — new messages, user info, chat type. Use offset to get only new updates since last check (Telegram Bot API)',
    category: 'messaging',
    annotations: READ_ONLY,
  },
  {
    toolId: 'telegram.get_chat',
    mcpName: 'messaging.telegram.get_chat',
    title: 'Get Telegram Chat Info',
    description:
      'Get info about a Telegram chat — title, type (private/group/supergroup/channel), description, member count, invite link, username (Telegram Bot API)',
    category: 'messaging',
    annotations: READ_ONLY,
  },

  {
    toolId: 'clinical.search',
    mcpName: 'health.clinical.search',
    title: 'Search Clinical Trials',
    description:
      'Search 577,000+ clinical trials worldwide — filter by condition (cancer, diabetes), intervention (drug name), sponsor, status (recruiting/completed), phase. Returns NCT ID, title, status, conditions, interventions, sponsor, enrollment. US National Library of Medicine (ClinicalTrials.gov)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'clinical.study',
    mcpName: 'health.clinical.study',
    title: 'Clinical Trial Details',
    description:
      'Full details for a clinical trial by NCT ID — protocol, conditions, interventions with dosing, eligibility criteria (age, sex), primary/secondary outcomes, sponsor, enrollment, phase, study design, dates, results if available (ClinicalTrials.gov)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'clinical.stats',
    mcpName: 'health.clinical.stats',
    title: 'Clinical Trials Database Stats',
    description:
      'Total number of registered clinical studies in the ClinicalTrials.gov database (577,000+ as of March 2026) (ClinicalTrials.gov)',
    category: 'health',
    annotations: READ_ONLY,
  },

  {
    toolId: 'namesilo.domain_check',
    mcpName: 'domain.namesilo.check',
    title: 'Check Domain Availability',
    description:
      'Check if domain names are available for registration. Returns availability status, registration price, and renewal price per domain. Supports all TLDs (.com, .io, .dev, .app, .ai, etc.) (NameSilo)',
    category: 'infrastructure',
    annotations: READ_ONLY,
  },
  {
    toolId: 'namesilo.domain_register',
    mcpName: 'domain.namesilo.register',
    title: 'Register Domain Name',
    description:
      '⚡ ACTION: Purchase and register a domain name (1-10 years). Includes free WHOIS privacy protection. Domain is registered instantly. Prices: .com ~$21, .org ~$12, .dev ~$18, .io ~$42 (NameSilo)',
    category: 'infrastructure',
    annotations: TRADING,
  },
  {
    toolId: 'namesilo.domain_list',
    mcpName: 'domain.namesilo.list',
    title: 'List Registered Domains',
    description:
      'List all domains registered in the account with expiry dates and status (NameSilo)',
    category: 'infrastructure',
    annotations: READ_ONLY,
  },
  {
    toolId: 'namesilo.domain_info',
    mcpName: 'domain.namesilo.info',
    title: 'Domain Details',
    description:
      'Get detailed info for a domain — nameservers, creation/expiry dates, lock status, auto-renew setting, WHOIS contact (NameSilo)',
    category: 'infrastructure',
    annotations: READ_ONLY,
  },
  {
    toolId: 'namesilo.get_prices',
    mcpName: 'domain.namesilo.prices',
    title: 'Domain TLD Pricing',
    description:
      'Get current registration, renewal, and transfer prices for popular TLDs (.com, .net, .org, .io, .dev, .app, .ai, .co, .xyz, .tech, etc.) (NameSilo)',
    category: 'infrastructure',
    annotations: READ_ONLY,
  },

  {
    toolId: 'cloudflare.zones_list',
    mcpName: 'infra.cloudflare.zones_list',
    title: 'List Cloudflare Zones (Domains)',
    description:
      'List all domains (zones) managed in Cloudflare — zone ID, domain name, status (active/pending), plan, nameservers. Filter by domain name or status. Zone ID needed for all other Cloudflare tools (Cloudflare)',
    category: 'infrastructure',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cloudflare.dns_list',
    mcpName: 'infra.cloudflare.dns_list',
    title: 'List DNS Records',
    description:
      'List all DNS records for a Cloudflare zone — A, AAAA, CNAME, MX, TXT, NS records with name, content, TTL, proxy status. Filter by type or name (Cloudflare)',
    category: 'infrastructure',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cloudflare.dns_create',
    mcpName: 'infra.cloudflare.dns_create',
    title: 'Create DNS Record',
    description:
      '⚡ ACTION: Create a new DNS record (A, AAAA, CNAME, MX, TXT) for a Cloudflare zone. Set content (IP/hostname), TTL, and CDN proxy status. Returns new record ID (Cloudflare)',
    category: 'infrastructure',
    annotations: TRADING,
  },
  {
    toolId: 'cloudflare.dns_delete',
    mcpName: 'infra.cloudflare.dns_delete',
    title: 'Delete DNS Record',
    description:
      '⚡ ACTION: Delete a DNS record from a Cloudflare zone by record ID. Removes the record immediately (Cloudflare)',
    category: 'infrastructure',
    annotations: CANCEL,
  },
  {
    toolId: 'cloudflare.zone_analytics',
    mcpName: 'infra.cloudflare.zone_analytics',
    title: 'Zone Traffic Analytics',
    description:
      'Traffic analytics for a Cloudflare zone — total requests, cached vs uncached, bandwidth, threats blocked, page views. Supports custom time ranges (last 24h, 7 days, etc.) (Cloudflare)',
    category: 'infrastructure',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cloudflare.purge_cache',
    mcpName: 'infra.cloudflare.purge_cache',
    title: 'Purge CDN Cache',
    description:
      '⚡ ACTION: Purge Cloudflare CDN cache — all cached files or specific URLs (max 30). Forces CDN to fetch fresh content from origin server (Cloudflare)',
    category: 'infrastructure',
    annotations: TRADING,
  },

  {
    toolId: 'vatcomply.validate',
    mcpName: 'tax.vatcomply.validate',
    title: 'Validate EU VAT Number',
    description:
      'Validate a European VAT number via VIES — returns validity status, company name, and registered address. Supports all 27 EU member states + UK. Format: country prefix + number (e.g. DE123456789) (VATcomply, open source)',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'vatcomply.rates',
    mcpName: 'tax.vatcomply.rates',
    title: 'EU VAT Rates by Country',
    description:
      'Get current VAT rates for EU countries — standard rate, reduced rates, super-reduced rate, parking rate. Query one country or all 27 EU members. Sourced from EU TEDB (VATcomply)',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'vatcomply.currencies',
    mcpName: 'tax.vatcomply.currencies',
    title: 'ECB Currency Exchange Rates',
    description:
      'Current ECB reference exchange rates for 30+ currencies (USD, GBP, JPY, CHF, etc.) plus currency metadata — symbol, decimal places, issuing countries (VATcomply / ECB)',
    category: 'world',
    annotations: READ_ONLY,
  },

  {
    toolId: 'transcribe.submit',
    mcpName: 'audio.transcribe.submit',
    title: 'Submit Audio for Transcription',
    description:
      'Submit an audio file URL for speech-to-text transcription. Returns a transcript_id to check status and retrieve results. Supports MP3, WAV, M4A, FLAC, OGG, WebM. 99 languages auto-detected. Optional speaker diarization (AssemblyAI)',
    category: 'media',
    annotations: READ_ONLY,
  },
  {
    toolId: 'transcribe.status',
    mcpName: 'audio.transcribe.status',
    title: 'Check Transcription Status',
    description:
      'Check the status of a transcription job by transcript_id — queued, processing, completed, or error. Returns audio duration when completed (AssemblyAI)',
    category: 'media',
    annotations: READ_ONLY,
  },
  {
    toolId: 'transcribe.result',
    mcpName: 'audio.transcribe.result',
    title: 'Get Transcription Result',
    description:
      'Retrieve the completed transcription text, word count, confidence score, detected language, and speaker labels (if diarization was enabled). Use transcript_id from submit (AssemblyAI)',
    category: 'media',
    annotations: READ_ONLY,
  },

  {
    toolId: 'lei.search',
    mcpName: 'business.lei.search',
    title: 'Search Global Legal Entities (LEI)',
    description:
      'Search 2.5M+ legal entities worldwide by name — companies, funds, government bodies across 200+ countries. Returns LEI code, name, country, city, status, entity category. Filter by country. CC0 open data (GLEIF)',
    category: 'business',
    annotations: READ_ONLY,
  },
  {
    toolId: 'lei.lookup',
    mcpName: 'business.lei.lookup',
    title: 'LEI Entity Details',
    description:
      'Full details for a legal entity by 20-character LEI code — legal name, registered address, headquarters, legal form, registration date, renewal date, status. Use LEI from search results (GLEIF)',
    category: 'business',
    annotations: READ_ONLY,
  },
  {
    toolId: 'lei.relationships',
    mcpName: 'business.lei.relationships',
    title: 'LEI Parent Company Relationship',
    description:
      'Find the direct parent company of a legal entity by LEI code — returns parent LEI, relationship type, and status. Useful for corporate ownership chain analysis (GLEIF)',
    category: 'business',
    annotations: READ_ONLY,
  },

  {
    toolId: 'ukcompany.search',
    mcpName: 'business.ukcompany.search',
    title: 'Search UK Companies',
    description:
      'Search the UK Companies House registry by name — returns company number, name, type (plc/ltd), status (active/dissolved), incorporation date, registered address. Covers all companies registered under the Companies Act (Companies House UK Gov)',
    category: 'business',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ukcompany.details',
    mcpName: 'business.ukcompany.details',
    title: 'UK Company Details',
    description:
      'Full details for a UK company by Companies House number — company name, type, status, SIC codes, registered address, accounts due date, confirmation statement due, charges, insolvency history (Companies House UK Gov)',
    category: 'business',
    annotations: READ_ONLY,
  },

  {
    toolId: 'edgar.company_search',
    mcpName: 'finance.edgar.company_search',
    title: 'Search SEC Companies',
    description:
      'Search US public companies and SEC filings by name, ticker, or keyword. Returns company name, CIK number, form type, filing date. Covers all companies registered with the US Securities and Exchange Commission (SEC EDGAR)',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'edgar.filings',
    mcpName: 'finance.edgar.filings',
    title: 'SEC Company Filings',
    description:
      'List recent SEC filings for a company by CIK number — 10-K (annual), 10-Q (quarterly), 8-K (events), proxy statements. Returns form type, filing date, document URL, description. Up to 1000 filings per company (SEC EDGAR)',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'edgar.company_facts',
    mcpName: 'finance.edgar.company_facts',
    title: 'SEC Financial Facts (XBRL)',
    description:
      'XBRL financial facts for a US public company — revenue, net income, assets, liabilities, equity, EPS, cash, operating income. Returns last 5 reporting periods per metric with form type and date. Structured data from 10-K/10-Q filings (SEC EDGAR)',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'edgar.xbrl_concept',
    mcpName: 'finance.edgar.xbrl_concept',
    title: 'SEC Company Financial History',
    description:
      'Complete history of any XBRL financial concept (Revenues, NetIncomeLoss, Assets, EPS) for a company across all SEC filings. Returns up to 20 most recent values with period dates, form type, fiscal year. Free alternative to Bloomberg for historical financials.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'edgar.xbrl_frames',
    mcpName: 'finance.edgar.xbrl_frames',
    title: 'SEC Cross-Company Financial Comparison',
    description:
      'Compare a financial metric across ALL SEC-reporting companies for a period. Query Revenues for CY2023 → 2,649 companies with values. Top: Walmart $648B, UnitedHealth $371B. Free alternative to Bloomberg/FactSet. Period format: CY2023 (annual), CY2023Q4I (quarterly).',
    category: 'finance',
    annotations: READ_ONLY,
  },

  {
    toolId: 'bluesky.search_posts',
    mcpName: 'social.bluesky.search',
    title: 'Search Bluesky Posts',
    description:
      'Search posts across the Bluesky decentralized social network by keyword. Returns post text, author handle, display name, like/repost/reply counts, timestamps. Sort by relevance or latest. Filter by language (AT Protocol / Bluesky)',
    category: 'social',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bluesky.profile',
    mcpName: 'social.bluesky.profile',
    title: 'Bluesky User Profile',
    description:
      'Get a Bluesky user profile — display name, bio, avatar URL, follower/following/post counts, account creation date. Lookup by handle (e.g. "jay.bsky.team") (AT Protocol / Bluesky)',
    category: 'social',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bluesky.feed',
    mcpName: 'social.bluesky.feed',
    title: 'Bluesky User Feed',
    description:
      'Get recent posts from a Bluesky user by handle — post text, timestamps, like/repost counts. Up to 100 posts per request (AT Protocol / Bluesky)',
    category: 'social',
    annotations: READ_ONLY,
  },

  {
    toolId: 'artic.search',
    mcpName: 'culture.artic.search',
    title: 'Search Art Institute of Chicago',
    description:
      'Search 120,000+ artworks at the Art Institute of Chicago — paintings, sculptures, photographs, prints, textiles. Returns title, artist, date, medium, dimensions, IIIF image URL, public domain status. Covers all periods and regions (ARTIC)',
    category: 'media',
    annotations: READ_ONLY,
  },
  {
    toolId: 'artic.artwork',
    mcpName: 'culture.artic.artwork',
    title: 'Artwork Details (ARTIC)',
    description:
      'Full details for a single artwork — title, artist, date, medium, dimensions, credit line, place of origin, department, provenance, exhibition history, high-res IIIF image URL. Use artwork ID from search results (ARTIC)',
    category: 'media',
    annotations: READ_ONLY,
  },
  {
    toolId: 'artic.artist',
    mcpName: 'culture.artic.artist',
    title: 'Search Artists (ARTIC)',
    description:
      'Search artists and makers in the Art Institute of Chicago collection — name, birth/death dates, biography. Find artist IDs for cross-referencing with artwork search (ARTIC)',
    category: 'media',
    annotations: READ_ONLY,
  },

  {
    toolId: 'europeana.search',
    mcpName: 'culture.europeana.search',
    title: 'Search European Cultural Heritage',
    description:
      'Search 50M+ cultural heritage objects across 4,000 institutions in 36 European countries — paintings, photographs, books, maps, 3D objects, music, film. Multilingual (24 languages). Filter by country, media type. Returns title, creator, thumbnail, provider, year (Europeana)',
    category: 'media',
    annotations: READ_ONLY,
  },
  {
    toolId: 'europeana.record',
    mcpName: 'culture.europeana.record',
    title: 'Cultural Heritage Object Details',
    description:
      'Full metadata for a single cultural heritage object — title, creator, description, date, language, source, rights, high-res image URL, provider institution, landing page. Use ID from search results (Europeana)',
    category: 'media',
    annotations: READ_ONLY,
  },

  {
    toolId: 'convert.to_pdf',
    mcpName: 'document.convert.to_pdf',
    title: 'Convert Document to PDF',
    description:
      'Convert Word (DOCX), Excel (XLSX), PowerPoint (PPTX), HTML, Markdown, RTF, ODT, or images (JPG/PNG/SVG) to PDF. Provide source file as URL. Custom page size and orientation. 200+ format pairs supported (ConvertAPI)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'convert.from_pdf',
    mcpName: 'document.convert.from_pdf',
    title: 'Convert PDF to Other Format',
    description:
      'Convert PDF to Word (DOCX), Excel (XLSX), PowerPoint (PPTX), plain text (TXT), or images (JPG/PNG per page). Optional page range selection. Provide PDF as URL (ConvertAPI)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'convert.web_to_pdf',
    mcpName: 'document.convert.web_to_pdf',
    title: 'Web Page to PDF (ConvertAPI)',
    description:
      'Render any web page URL to PDF with full JavaScript execution — custom viewport width, lazy content loading, wait delay. Returns PDF download URL (ConvertAPI)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  {
    toolId: 'pdf.from_html',
    mcpName: 'document.pdf.from_html',
    title: 'HTML to PDF',
    description:
      'Convert HTML content to a PDF document using headless Chrome — full CSS + JavaScript rendering, custom page size, margins, headers/footers, background colors. Returns a temporary download URL for the generated PDF (API2PDF)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'pdf.from_url',
    mcpName: 'document.pdf.from_url',
    title: 'URL to PDF',
    description:
      'Capture any web page URL as a PDF using headless Chrome with full JS rendering — perfect for archiving pages, generating reports from dashboards, or creating printable snapshots. Returns temporary PDF download URL (API2PDF)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'pdf.merge',
    mcpName: 'document.pdf.merge',
    title: 'Merge PDFs',
    description:
      'Merge 2-20 PDF documents (provided as URLs) into a single combined PDF. Preserves page order. Returns temporary download URL for the merged result (API2PDF)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  {
    toolId: 'podcast.search',
    mcpName: 'media.podcast.search',
    title: 'Search Podcasts',
    description:
      'Search 4M+ podcasts by keyword — returns title, author, description, artwork, episode count, language, categories, RSS feed URL. Open directory covering all languages and countries (PodcastIndex)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'podcast.trending',
    mcpName: 'media.podcast.trending',
    title: 'Trending Podcasts',
    description:
      'Currently trending podcasts globally — ranked by recent episode engagement. Filter by language and category. Returns title, author, artwork, trending score, episode count (PodcastIndex)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'podcast.episodes',
    mcpName: 'media.podcast.episodes',
    title: 'Podcast Episodes',
    description:
      'List recent episodes for a podcast by feed ID — title, description, publish date, audio URL, duration, season/episode numbers. Use feed ID from search or trending results (PodcastIndex)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'podcast.by_feed',
    mcpName: 'media.podcast.details',
    title: 'Podcast Details by Feed ID',
    description:
      'Full metadata for a single podcast — title, author, description, RSS URL, artwork, language, categories, episode count, last update time, funding links (PodcastIndex)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },

  {
    toolId: 'geocodio.geocode',
    mcpName: 'address.geocodio.geocode',
    title: 'Geocode US/Canada Address',
    description:
      'Forward geocode a US or Canada address to coordinates — returns lat/lng, parsed address components (street, city, state, ZIP, county), accuracy type (rooftop/range/street), and data source. USPS-standardized results with Census data (Geocodio)',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geocodio.reverse',
    mcpName: 'address.geocodio.reverse',
    title: 'Reverse Geocode Coordinates (US/Canada)',
    description:
      'Reverse geocode latitude/longitude to a US or Canada address — returns formatted address, parsed components (street, city, state, ZIP, county), accuracy type, and source. Supports multiple results ranked by proximity (Geocodio)',
    category: 'location',
    annotations: READ_ONLY,
  },

  {
    toolId: 'hunter.company',
    mcpName: 'business.hunter.company',
    title: 'Company Email & Enrichment by Domain',
    description:
      'Find professional email addresses and company data for any domain — organization name, industry, employee count, tech stack, social profiles, email pattern, and verified contact emails with confidence scores, positions, departments, seniority levels. 50M+ domains indexed (Hunter.io)',
    category: 'business',
    annotations: READ_ONLY,
  },

  // FDIC BankFind (4) — UC-191
  {
    toolId: 'fdic.search',
    mcpName: 'fdic.institutions.search',
    title: 'Search FDIC-Insured Banks',
    description:
      'Search 4,300+ FDIC-insured US financial institutions by name, city, state, or charter type. Returns bank name, FDIC certificate number, total assets, deposits, and location. Official US Government data.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'fdic.details',
    mcpName: 'fdic.institutions.details',
    title: 'Bank Institution Details',
    description:
      'Get full regulatory profile for an FDIC-insured bank by certificate number. Returns address, charter class, regulator, assets, deposits, branches, established date, insurance date, and coordinates.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'fdic.financials',
    mcpName: 'fdic.institutions.financials',
    title: 'Bank Financial Reports',
    description:
      'Retrieve quarterly Call Report financial data for an FDIC-insured institution. Returns total assets, deposits, equity, net income, ROA, ROE, net interest margin, and efficiency ratio.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'fdic.failures',
    mcpName: 'fdic.institutions.failures',
    title: 'Failed Bank List',
    description:
      'Query the FDIC failed bank list. Returns 4,100+ historical bank failures with failure date, assets at closure, acquiring institution, and estimated loss to the Deposit Insurance Fund. Covers all failures since 1934.',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // disease.sh (4) — UC-192
  {
    toolId: 'disease.covid_global',
    mcpName: 'disease.covid.global',
    title: 'Global COVID-19 Statistics',
    description:
      'Get aggregated global COVID-19 statistics: total cases (704M+), deaths, recoveries, active cases, critical cases, cases/deaths per million, tests administered, and affected countries count. Data from Worldometers and OWID.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'disease.covid_country',
    mcpName: 'disease.covid.country',
    title: 'Country COVID-19 Statistics',
    description:
      'Get COVID-19 statistics for a specific country by name or ISO code. Returns cases, deaths, recoveries, active, critical, per-million rates, tests, population, and flag. Covers 215+ countries and territories.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'disease.covid_history',
    mcpName: 'disease.covid.history',
    title: 'Historical COVID-19 Data',
    description:
      'Get historical time-series COVID-19 data for a country or globally. Returns daily case, death, and recovery counts. Useful for trend analysis and longitudinal research. Data from Johns Hopkins CSSE.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'disease.influenza',
    mcpName: 'disease.influenza.cdc',
    title: 'US Influenza Surveillance (CDC)',
    description:
      'Get US influenza surveillance data from CDC FluView. Returns weekly ILI (influenza-like illness) activity levels by age group, positive test rates by influenza type (A/B), and national summary. Updated weekly.',
    category: 'health',
    annotations: READ_ONLY,
  },

  // WHO GHO (3) — UC-193
  {
    toolId: 'who.indicators',
    mcpName: 'who.health.indicators',
    title: 'WHO Health Indicators List',
    description:
      'List 1,000+ WHO Global Health Observatory indicators: life expectancy, mortality rates, disease burden, immunization, nutrition, mental health, environmental health. Returns indicator codes for use with who.data.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'who.data',
    mcpName: 'who.health.data',
    title: 'WHO Health Data by Indicator',
    description:
      'Retrieve WHO health data for a specific indicator, optionally filtered by country and year range. Returns values for up to 194 countries spanning multiple decades. Official UN member state reporting data.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'who.countries',
    mcpName: 'who.health.countries',
    title: 'WHO Member Countries',
    description:
      'List all 194 WHO member countries and territories with codes and names. Use returned country codes with who.data to filter health indicators by country.',
    category: 'health',
    annotations: READ_ONLY,
  },

  // GDACS (3) — UC-194
  {
    toolId: 'gdacs.alerts',
    mcpName: 'gdacs.disasters.alerts',
    title: 'Global Disaster Alerts (UN)',
    description:
      'Get current and recent global disaster alerts from the UN GDACS system. Returns earthquakes, tropical cyclones, floods, volcanoes, droughts, and tsunamis with color-coded severity (Green/Orange/Red), affected country, coordinates, and population impact estimates.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'gdacs.events',
    mcpName: 'gdacs.disasters.details',
    title: 'Disaster Event Details',
    description:
      'Get detailed information for a specific GDACS disaster event by ID. Returns event name, alert level with justification, affected population at each severity level, coordinates, geometry for mapping, source agency, and situation report links.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'gdacs.history',
    mcpName: 'gdacs.disasters.history',
    title: 'Historical Disaster Archive',
    description:
      'Query the GDACS historical disaster archive from 2000 onwards. Filter by date range, event type, country, and alert level. Returns past earthquakes, cyclones, floods, and volcanoes for disaster frequency analysis and regional risk assessment.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // RateAPI (4) — UC-197
  {
    toolId: 'rateapi.mortgage',
    mcpName: 'rateapi.lending.mortgage',
    title: 'US Mortgage Rate Decision',
    description:
      'Get AI-powered mortgage rate decision from 4,300+ US lenders. Returns recommended actions, current APR rates, estimated monthly payments, and confidence scores. Supports 30yr/15yr fixed and ARM products. Filter by state, amount, and credit tier.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'rateapi.auto_loan',
    mcpName: 'rateapi.lending.auto',
    title: 'US Auto Loan Rate Decision',
    description:
      'Get auto loan rate decision for new and used vehicles from US lenders. Returns recommended financing actions, APR rates by term (24-72 months), and estimated monthly payments. Filter by vehicle type and credit tier.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'rateapi.heloc',
    mcpName: 'rateapi.lending.heloc',
    title: 'US HELOC Rate Decision',
    description:
      'Get Home Equity Line of Credit (HELOC) rate decision. Returns current HELOC APR rates, recommended actions, and lender comparisons. Filter by combined loan-to-value ratio (CLTV), state, and credit score tier.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'rateapi.personal_loan',
    mcpName: 'rateapi.lending.personal',
    title: 'US Personal Loan Rate Decision',
    description:
      'Get personal loan rate decision from US lenders. Returns recommended financing actions, APR rates by term and amount, and monthly payment estimates. Filter by loan amount, term, and credit score tier.',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // TwitterAPI.io (4) — UC-198
  {
    toolId: 'twitter.search',
    mcpName: 'twitter.tweets.search',
    title: 'Search Twitter/X Tweets',
    description:
      'Search Twitter/X tweets by keyword, hashtag, or advanced query. Returns tweet text, author info, engagement metrics (likes, retweets, replies, views), and timestamps. 96% cheaper than official X API. Covers recent tweets.',
    category: 'social',
    annotations: READ_ONLY,
  },
  {
    toolId: 'twitter.user',
    mcpName: 'twitter.users.profile',
    title: 'Twitter/X User Profile',
    description:
      'Get a Twitter/X user profile by username. Returns display name, bio, follower/following count, tweet count, verified status, profile image, location, and account creation date.',
    category: 'social',
    annotations: READ_ONLY,
  },
  {
    toolId: 'twitter.followers',
    mcpName: 'twitter.users.followers',
    title: 'Twitter/X User Followers',
    description:
      'Get paginated follower list for a Twitter/X user. Returns follower profiles with username, display name, bio, follower count, and verified status. Supports cursor pagination.',
    category: 'social',
    annotations: READ_ONLY,
  },
  {
    toolId: 'twitter.trending',
    mcpName: 'twitter.trends.worldwide',
    title: 'Twitter/X Trending Topics',
    description:
      'Get current trending topics on Twitter/X. Filter by location using WOEID (Where On Earth ID). Returns trend name, search query, and rank. 1=worldwide, 23424977=US, 23424975=UK.',
    category: 'social',
    annotations: READ_ONLY,
  },

  // Currents API (3) — UC-210
  {
    toolId: 'currents.latest',
    mcpName: 'currents.news.latest',
    title: 'Latest Global News',
    description:
      'Get latest breaking news from 70+ countries in 18+ languages. Returns full article text, author, source URL, and publication time. Filter by language, country, and category (technology, business, health, sports, science, finance, world).',
    category: 'news',
    annotations: READ_ONLY,
  },
  {
    toolId: 'currents.search',
    mcpName: 'currents.news.search',
    title: 'Search Global News',
    description:
      'Search news articles by keyword across 70+ countries and 18+ languages. Returns full article text with Boolean operator support. Filter by language, country, category, and date range.',
    category: 'news',
    annotations: READ_ONLY,
  },
  {
    toolId: 'currents.categories',
    mcpName: 'currents.news.categories',
    title: 'News Categories List',
    description:
      'List all 46 available news categories: technology, business, health, sports, science, entertainment, finance, world, politics, and more. Use to discover valid category values for filtering.',
    category: 'news',
    annotations: READ_ONLY,
  },

  // IBANAPI (2) — UC-212
  {
    toolId: 'iban.validate',
    mcpName: 'iban.banking.validate',
    title: 'Validate IBAN + Bank Details',
    description:
      'Validate an IBAN and retrieve associated bank info: BIC/SWIFT code, bank name, address, country, currency, and SEPA membership. Supports 80+ IBAN-enabled countries including EU, UK, and MENA. Returns validation result with detailed breakdown.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'iban.calculate',
    mcpName: 'iban.banking.calculate',
    title: 'Calculate IBAN from Bank Details',
    description:
      'Calculate a valid IBAN from domestic bank routing details: country code, bank code, account number, and optional branch code. Returns the computed IBAN with correct checksum. Useful for payment automation.',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // PubChem — Chemical Compound Database (UC-213, 6 tools)
  {
    toolId: 'pubchem.compound_search',
    mcpName: 'chemistry.pubchem.search',
    title: 'Search Chemical Compounds',
    description:
      'Search 100M+ chemical compounds by name, formula, or SMILES string. Returns CID, molecular formula, weight, IUPAC name, SMILES, InChI, XLogP, H-bond donors/acceptors, exact mass, and complexity. The largest public chemical database (PubChem / NCBI)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'pubchem.compound_properties',
    mcpName: 'chemistry.pubchem.properties',
    title: 'Chemical Compound Properties',
    description:
      'Get full physical and chemical properties for a compound by PubChem CID — molecular formula, weight, SMILES, InChI, InChIKey, XLogP, H-bond donors/acceptors, exact mass, topological polar surface area, complexity, charge, heavy atom count (PubChem / NCBI)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'pubchem.compound_synonyms',
    mcpName: 'chemistry.pubchem.synonyms',
    title: 'Compound Synonyms & Identifiers',
    description:
      'Get all known names, CAS registry numbers, trade names, and identifiers for a chemical compound by PubChem CID. Returns up to 50 synonyms from a database of millions of name variants (PubChem / NCBI)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'pubchem.hazard_data',
    mcpName: 'chemistry.pubchem.hazards',
    title: 'Chemical Hazard Classification (GHS)',
    description:
      'Get GHS (Globally Harmonized System) hazard classification for a compound — signal words (Danger/Warning), hazard statements (H-codes), precautionary statements (P-codes), pictograms. Essential for chemical safety assessments (PubChem / NCBI)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'pubchem.bioassay_summary',
    mcpName: 'chemistry.pubchem.bioassays',
    title: 'Compound Bioactivity Summary',
    description:
      'Get bioactivity assay results for a compound — active/inactive counts, tested targets, assay types. Shows how the compound performed in biological tests across thousands of assays (PubChem / NCBI)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'pubchem.structure_lookup',
    mcpName: 'chemistry.pubchem.structure',
    title: 'Chemical Structure Lookup',
    description:
      'Look up a compound by name or identifier and get its chemical structure representations — SMILES (isomeric + canonical), InChI, InChIKey, molecular formula, and molecular weight. Convert between chemical identifier formats (PubChem / NCBI)',
    category: 'health',
    annotations: READ_ONLY,
  },

  // Open Charge Map — EV Charging Stations (UC-214, 3 tools)
  {
    toolId: 'evcharge.search',
    mcpName: 'ev.charging.search',
    title: 'Search EV Charging Stations',
    description:
      'Search 300K+ EV charging stations worldwide by location, country, operator, connector type, and power level. Returns station address, GPS coordinates, connectors (Type 2, CCS, CHAdeMO), power kW, operator, status. Filter by min power for fast charging. Largest open EV charging database (Open Charge Map)',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'evcharge.details',
    mcpName: 'ev.charging.details',
    title: 'EV Charging Station Details',
    description:
      'Get full details for a specific EV charging station by ID — address, GPS coordinates, all connectors with type/power/status, network operator, usage cost, verification date, number of charging points. Use station ID from search or nearby results (Open Charge Map)',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'evcharge.nearby',
    mcpName: 'ev.charging.nearby',
    title: 'Find Nearby EV Chargers',
    description:
      'Find the nearest EV charging stations to GPS coordinates within a radius (default 5km). Returns stations sorted by distance with connector types, power levels, and availability status. Filter by minimum power kW and connector type for DC fast charging (Open Charge Map)',
    category: 'location',
    annotations: READ_ONLY,
  },

  // IPQualityScore — Fraud Detection (UC-217, 4 tools)
  {
    toolId: 'ipqs.ip_check',
    mcpName: 'security.ipqs.ip_check',
    title: 'IP Fraud & Proxy Detection',
    description:
      'Check any IP address for fraud signals — proxy, VPN, Tor, bot, crawler detection with fraud score (0-100). Returns geolocation (country, city, ISP, ASN), abuse velocity, connection type, and 9+ risk indicators. Essential for e-commerce fraud prevention (IPQualityScore)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ipqs.email_check',
    mcpName: 'security.ipqs.email_check',
    title: 'Email Fraud Detection',
    description:
      'Validate email for fraud risk — checks deliverability, disposable/temporary providers, honeypot traps, spam traps, leaked credentials, catch-all detection. Returns fraud score (0-100), SMTP verification, domain age, and abuse history. Goes beyond basic validation (IPQualityScore)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ipqs.url_check',
    mcpName: 'security.ipqs.url_check',
    title: 'URL Malware & Phishing Scanner',
    description:
      'Scan any URL for malware, phishing, suspicious content, adult content, spamming, and domain parking. Returns risk score (0-100), domain reputation, domain age, IP address, HTTP status. Protects agents from visiting malicious URLs (IPQualityScore)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ipqs.phone_check',
    mcpName: 'security.ipqs.phone_check',
    title: 'Phone Number Fraud Detection',
    description:
      'Check phone number for fraud risk — detects VOIP, prepaid, risky numbers, carrier info, line type (mobile/landline/VOIP), active status, leaked data. Returns fraud score (0-100) and geographic location. Supports international numbers with country filter (IPQualityScore)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // NCI CACTUS — Chemical Identifier Resolution (UC-220, 3 tools)
  {
    toolId: 'chem.resolve',
    mcpName: 'science.chem.resolve',
    title: 'Chemical ID Resolver',
    description:
      'Convert any chemical identifier to SMILES, InChI, and InChIKey. Input a compound name (e.g. "aspirin"), CAS number (e.g. "50-78-2"), SMILES, or InChIKey and get all other representations. The only universal chemical ID converter — essential for chemistry workflows and cross-database lookups (NCI CACTUS)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'chem.formula',
    mcpName: 'science.chem.formula',
    title: 'Molecular Formula & Weight',
    description:
      'Get molecular formula and molecular weight for any compound by name, CAS number, or SMILES. Returns formula (e.g. "C9H8O4" for aspirin) and weight in daltons (e.g. 180.157). Accepts any chemical identifier format (NCI CACTUS)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'chem.names',
    mcpName: 'science.chem.names',
    title: 'Chemical Synonyms & Names',
    description:
      'Get all known names, synonyms, CAS numbers, and registry IDs for a chemical compound. Input any identifier (name, CAS, SMILES, InChIKey) and get the full list of aliases. Useful for finding alternative names, trade names, and cross-references (NCI CACTUS)',
    category: 'health',
    annotations: READ_ONLY,
  },

  // NHTSA Safety — Vehicle Recalls, Complaints, Ratings, Investigations (UC-219, 4 tools)
  {
    toolId: 'safety.recalls',
    mcpName: 'vehicle.safety.recalls',
    title: 'Vehicle Recall Search',
    description:
      'Search NHTSA vehicle recalls by make, model, and year. Returns campaign number, manufacturer, subject, summary, consequence, remedy, affected components, and units affected. Covers all US recalls from 1966 to present. Essential for automotive safety, insurance, and fleet management agents (NHTSA)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'safety.complaints',
    mcpName: 'vehicle.safety.complaints',
    title: 'Vehicle Consumer Complaints',
    description:
      'Search consumer complaints filed with NHTSA about vehicles. Returns incident details including crash/fire flags, injuries, deaths, affected components, and complaint summary. Covers US vehicles from ~1995 to present. Critical for safety research and product liability analysis (NHTSA)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'safety.ratings',
    mcpName: 'vehicle.safety.ratings',
    title: '5-Star Crash Test Safety Ratings',
    description:
      'Get NCAP 5-Star crash test safety ratings by make/model/year or vehicle ID. Returns overall rating, frontal crash, side crash, and rollover ratings (1-5 stars). Also shows related complaints, recalls, and investigation counts. Available from ~2011 for US-market vehicles (NHTSA)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'safety.investigations',
    mcpName: 'vehicle.safety.investigations',
    title: 'Defect Investigations',
    description:
      'Search NHTSA defect investigation records by manufacturer and model. Returns investigation number, type (preliminary/engineering analysis), description, latest activity date, and NHTSA action number. Covers active and closed investigations for US vehicles (NHTSA)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // RCSB Protein Data Bank — Structural Biology (UC-218, 4 tools)
  {
    toolId: 'pdb.search',
    mcpName: 'science.pdb.search',
    title: 'Search Protein Structures',
    description:
      'Search 220K+ macromolecular 3D structures in the Protein Data Bank by keyword, protein name, organism, or author. Returns PDB IDs with relevance scores. The canonical database for structural biology, X-ray crystallography, cryo-EM, and NMR structures (RCSB PDB)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'pdb.structure',
    mcpName: 'science.pdb.structure',
    title: 'Protein Structure Details',
    description:
      'Get full details for a 3D protein structure by PDB ID — title, experimental method (X-ray/cryo-EM/NMR), resolution, molecular weight, chain counts (protein/DNA/RNA), deposit date, primary citation with DOI and PubMed ID. Essential for drug design and structural analysis (RCSB PDB)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'pdb.ligand',
    mcpName: 'science.pdb.ligand',
    title: 'Ligand Chemistry Data',
    description:
      'Get chemical component data for a ligand/small molecule by its 3-letter PDB code — name, molecular formula, weight, type, formal charge, heavy atom count, SMILES/InChI descriptors. Covers ATP, HEM, NAG, drug molecules, cofactors, ions, and 40K+ chemical entities in the PDB (RCSB PDB)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'pdb.sequence',
    mcpName: 'science.pdb.sequence',
    title: 'Sequence Similarity Search',
    description:
      'Search protein structures by amino acid sequence similarity (BLAST). Input a protein sequence and find all PDB structures with matching chains. Configure identity cutoff (e.g. 90%) and E-value threshold. Returns PDB entity IDs ranked by similarity score. Essential for homology modeling and structure prediction (RCSB PDB)',
    category: 'health',
    annotations: READ_ONLY,
  },

  // Adzuna — Job Search (UC-253, 3 tools)
  {
    toolId: 'adzuna.search',
    mcpName: 'jobs.adzuna.search',
    title: 'Search Jobs (16+ Countries)',
    description:
      'Search job listings across 16+ countries (US, UK, AU, CA, DE, FR, and more) by keyword, location, category, salary range. Returns job title, company, salary, location, and apply URL. 70K+ developer jobs in US alone (Adzuna)',
    category: 'jobs',
    annotations: READ_ONLY,
  },
  {
    toolId: 'adzuna.categories',
    mcpName: 'jobs.adzuna.categories',
    title: 'Job Categories',
    description:
      'List all job categories available in a country — IT, Sales, Engineering, HR, Healthcare, Hospitality, and more. Use category tags to filter adzuna.search results (Adzuna)',
    category: 'jobs',
    annotations: READ_ONLY,
  },
  {
    toolId: 'adzuna.salary',
    mcpName: 'jobs.adzuna.salary',
    title: 'Salary Histogram',
    description:
      'Get salary distribution for a job title — returns histogram of salary buckets with job counts. Example: "python developer" in US → $20K-$140K distribution. Use for salary benchmarking and market research (Adzuna)',
    category: 'jobs',
    annotations: READ_ONLY,
  },

  // BallDontLie — Sports Data (UC-251, 3 tools)
  {
    toolId: 'bdl.games',
    mcpName: 'sports.bdl.games',
    title: 'Sports Games & Scores',
    description:
      'Get NBA and NFL game results by date — scores, teams, status (Final/In Progress/Scheduled). Filter by date, season, or team. Covers all NBA and NFL games with real-time scores (BallDontLie)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bdl.teams',
    mcpName: 'sports.bdl.teams',
    title: 'Sports Teams',
    description:
      'List NBA and NFL teams with conference, division, city, and abbreviation. Filter by conference (East/West for NBA, AFC/NFC for NFL) or division (BallDontLie)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bdl.players',
    mcpName: 'sports.bdl.players',
    title: 'Player Search',
    description:
      'Search NBA players by name — returns position, jersey number, and current team. Example: "lebron" → LeBron James #23 F, Los Angeles Lakers (BallDontLie)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },

  // Zippopotam.us — Global Postal Codes (UC-250, 1 tool)
  {
    toolId: 'postal.lookup',
    mcpName: 'address.postal.lookup',
    title: 'Global Postal Code Lookup',
    description:
      'Look up a postal/ZIP code in 60+ countries — returns city name, state/region, and lat/lon coordinates. Supports US, UK, Germany, France, Japan, Brazil, India, Australia, and 50+ more countries. Provide country code (ISO 2-letter) + postal code (Zippopotam.us)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // DHL — Shipment Tracking (UC-228, 1 tool)
  {
    toolId: 'dhl.track',
    mcpName: 'logistics.dhl.track',
    title: 'Track DHL Shipment',
    description:
      'Track a DHL shipment by tracking number — returns current status, delivery events timeline, origin/destination, estimated delivery date, and service type. Supports all DHL services: Express, Parcel, eCommerce, Freight. Official DHL data for 220+ countries (DHL)',
    category: 'logistics',
    annotations: READ_ONLY,
  },

  // Postcodes.io — UK Postal Lookup (UC-249, 3 tools)
  {
    toolId: 'ukpost.lookup',
    mcpName: 'address.ukpost.lookup',
    title: 'UK Postcode Lookup',
    description:
      'Look up a UK postcode — returns district, region, country, ward, parish, parliamentary constituency, and lat/lon coordinates. Backed by ONS/Ordnance Survey data. Example: "SW1A 1AA" → Westminster, London (Postcodes.io)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ukpost.nearest',
    mcpName: 'address.ukpost.nearest',
    title: 'Nearest UK Postcodes',
    description:
      'Find nearest UK postcodes to a lat/lon coordinate — returns postcodes sorted by distance with district info. Use for reverse geocoding in the UK (Postcodes.io)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ukpost.validate',
    mcpName: 'address.ukpost.validate',
    title: 'Validate UK Postcode',
    description:
      'Check if a UK postcode is valid and exists — returns true/false. Use for form validation or data cleaning (Postcodes.io)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // ShipEngine — Shipping Rates & Address Validation (UC-246, 3 tools)
  {
    toolId: 'shipengine.rates',
    mcpName: 'logistics.shipengine.rates',
    title: 'Compare Shipping Rates',
    description:
      'Compare shipping rates across multiple carriers (USPS, UPS, FedEx, DHL) for a package. Provide origin/destination ZIP codes, weight in pounds, and optional dimensions. Returns sorted rates with price, delivery time, and service type. Up to 84% off retail rates (ShipEngine)',
    category: 'logistics',
    annotations: READ_ONLY,
  },
  {
    toolId: 'shipengine.validate',
    mcpName: 'logistics.shipengine.validate',
    title: 'Validate US Address',
    description:
      'Validate and standardize a US address — returns USPS-verified address with corrected spelling, ZIP+4, and validation status. Catches typos, missing info, and invalid addresses before shipping (ShipEngine)',
    category: 'logistics',
    annotations: READ_ONLY,
  },
  {
    toolId: 'shipengine.carriers',
    mcpName: 'logistics.shipengine.carriers',
    title: 'List Shipping Carriers',
    description:
      'List all connected shipping carriers with their IDs and codes. Shows which carriers are available for rate comparison (USPS, UPS, FedEx, DHL, etc.) (ShipEngine)',
    category: 'logistics',
    annotations: READ_ONLY,
  },

  // WeatherAPI.com — Global Weather (UC-243, 4 tools)
  {
    toolId: 'weatherapi.current',
    mcpName: 'weather.weatherapi.current',
    title: 'Current Weather',
    description:
      'Get current weather conditions for any location worldwide — temperature, wind, humidity, pressure, UV index, cloud cover, feels-like temp. Accepts city name, coordinates, zip code, or airport code. 100K+ stations globally (WeatherAPI.com)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'weatherapi.forecast',
    mcpName: 'weather.weatherapi.forecast',
    title: 'Weather Forecast (3-day)',
    description:
      'Get 3-day weather forecast — daily min/max temperature, conditions, wind, precipitation, humidity, rain/snow chance, UV index. Accepts any location query (WeatherAPI.com)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'weatherapi.astronomy',
    mcpName: 'weather.weatherapi.astronomy',
    title: 'Astronomy Data',
    description:
      'Get sunrise, sunset, moonrise, moonset times and moon phase for any location and date. Returns moon illumination percentage and phase name (WeatherAPI.com)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'weatherapi.search',
    mcpName: 'weather.weatherapi.search',
    title: 'Location Search',
    description:
      'Search and autocomplete location names — returns matching cities with coordinates. Type partial name (e.g. "lon" → London, "mos" → Moscow). Use result coordinates with other weather tools (WeatherAPI.com)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // Judge0 CE — Code Execution Sandbox (UC-238, 2 tools)
  {
    toolId: 'code.execute',
    mcpName: 'dev.code.execute',
    title: 'Execute Code in Sandbox',
    description:
      '⚡ ACTION: Execute source code in a sandboxed environment — 71 programming languages supported (Python, JavaScript, Java, C++, Go, Rust, C#, Bash, Ruby, PHP, and 60+ more). Returns stdout, stderr, execution time, and memory usage. Safe sandboxed execution with CPU/memory limits. Use code.languages to get language IDs (Judge0 CE)',
    category: 'developer',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    toolId: 'code.languages',
    mcpName: 'dev.code.languages',
    title: 'List Programming Languages',
    description:
      'List all 71 available programming languages and their IDs for code execution. Common IDs: 71=Python 3.8, 63=JavaScript (Node.js), 62=Java, 54=C++ (GCC), 60=Go, 73=Rust, 51=C#, 46=Bash. Returns full list with compiler/interpreter versions (Judge0 CE)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // Zyte — Web Scraping (UC-233, 3 tools)
  {
    toolId: 'scrape.extract',
    mcpName: 'web.scrape.extract',
    title: 'Extract Web Page HTML',
    description:
      '⚡ ACTION: Extract raw HTML from any URL — cheapest web scraping API ($0.00013 for simple sites). Returns decoded HTML content, HTTP status code, and content length. Use for data extraction, content analysis, or price monitoring. Handles anti-bot protection automatically (Zyte)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'scrape.browser',
    mcpName: 'web.scrape.browser',
    title: 'Browser-Rendered Page HTML',
    description:
      '⚡ ACTION: Render a URL with headless browser and return JS-rendered HTML. Use for SPAs, React/Vue apps, or pages with dynamic content that raw HTTP cannot capture. Returns fully rendered DOM as HTML text (Zyte)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'scrape.screenshot',
    mcpName: 'web.scrape.screenshot',
    title: 'Web Page Screenshot',
    description:
      '⚡ ACTION: Capture a full-page screenshot of any URL — returns base64-encoded PNG image. Use for visual verification, monitoring, or archiving. Headless browser renders the page before capture (Zyte)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // MarketCheck — Car Listings (UC-231, 2 tools)
  {
    toolId: 'carmarket.search',
    mcpName: 'vehicle.carmarket.search',
    title: 'Search Car Listings',
    description:
      'Search millions of active US car listings by make, model, year, price range, mileage, ZIP code, and radius. Returns VIN, price, miles, dealer info, Carfax status, and days on market. Filter by seller type (dealer/private) and color. Data from all major US marketplaces (MarketCheck)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'carmarket.listing',
    mcpName: 'vehicle.carmarket.listing',
    title: 'Car Listing Details',
    description:
      'Get full details for a specific car listing by ID — VIN, price, MSRP, mileage, full build specs (engine, transmission, drivetrain, fuel type), dealer contact, Carfax 1-owner status, days on market, photos. Get listing IDs from carmarket.search (MarketCheck)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // Threat Intelligence Platform — Domain Security (UC-227, 3 tools)
  {
    toolId: 'threatintel.reputation',
    mcpName: 'security.threatintel.reputation',
    title: 'Domain Reputation Score',
    description:
      'Get domain reputation score (0-100) with detailed security test results — WHOIS age, SSL validity, mail server config, blacklist status, and more. Higher score = safer domain. Essential for security agents evaluating domain trustworthiness (Threat Intelligence Platform)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'threatintel.malware',
    mcpName: 'security.threatintel.malware',
    title: 'Malware & Phishing Check',
    description:
      'Check if a domain is associated with malware, phishing, or other threats. Returns safe score (0-100) and detailed warning descriptions. Use for URL safety verification before agent navigation (Threat Intelligence Platform)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'threatintel.infrastructure',
    mcpName: 'security.threatintel.infrastructure',
    title: 'Domain Infrastructure Analysis',
    description:
      'Analyze domain infrastructure — all associated IPv4 addresses, geolocation (country, city, region), subnets, and resource types (web, mail, DNS). Reveals hosting setup, CDN usage, and geographic distribution (Threat Intelligence Platform)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // Listen Notes — Podcast Search (UC-225, 3 tools)
  {
    toolId: 'listennotes.search',
    mcpName: 'podcasts.listennotes.search',
    title: 'Search Podcasts & Episodes',
    description:
      'Full-text search across 3.7M+ podcasts and 186M+ episodes. Search by keyword, filter by language and genre, sort by relevance or date. Returns episode titles, podcast names, audio URLs, and duration. The most comprehensive podcast search API available (Listen Notes)',
    category: 'podcasts',
    annotations: READ_ONLY,
  },
  {
    toolId: 'listennotes.podcast',
    mcpName: 'podcasts.listennotes.podcast',
    title: 'Podcast Details',
    description:
      'Get full details for a podcast by Listen Notes ID — title, publisher, description, episode count, language, country, website, genres, and latest publish date. Use IDs from listennotes.search or listennotes.best (Listen Notes)',
    category: 'podcasts',
    annotations: READ_ONLY,
  },
  {
    toolId: 'listennotes.best',
    mcpName: 'podcasts.listennotes.best',
    title: 'Best Podcasts by Genre',
    description:
      'Get curated lists of the best podcasts by genre — Technology (127), Business (93), TV & Film (68), Sports (77), Leisure (82), and 60+ more genres. Paginated, returns podcast titles, publishers, episode counts, and descriptions (Listen Notes)',
    category: 'podcasts',
    annotations: READ_ONLY,
  },

  // AudD — Music Recognition / Audio Fingerprinting (UC-226, 2 tools)
  {
    toolId: 'audd.recognize',
    mcpName: 'music.audd.recognize',
    title: 'Identify Song from Audio',
    description:
      'Identify a song from an audio file URL — like Shazam for AI agents. Analyzes audio fingerprint against 80M+ tracks and returns artist, title, album, release date, plus Spotify and Apple Music links. Accepts MP3, WAV, OGG, or any audio URL (AudD)',
    category: 'music',
    annotations: READ_ONLY,
  },
  {
    toolId: 'audd.lyrics',
    mcpName: 'music.audd.lyrics',
    title: 'Search Song Lyrics',
    description:
      'Search for song lyrics by artist name, song title, or both. Returns full lyrics text, artist, title, and metadata. Query examples: "imagine john lennon", "bohemian rhapsody", "taylor swift love story" (AudD)',
    category: 'music',
    annotations: READ_ONLY,
  },

  // Materials Project — Materials Science (UC-222, 3 tools)
  {
    toolId: 'materials.search',
    mcpName: 'science.materials.search',
    title: 'Search Materials Database',
    description:
      'Search 150,000+ inorganic materials by chemical formula, elements, band gap, stability, or metallic character. Returns DFT-computed properties: band gap, formation energy, density, crystal system. Filter semiconductors (band_gap 1-3 eV), stable battery cathodes (elements Li,Fe,O + is_stable), or metals. DOE/Lawrence Berkeley Lab data, CC BY 4.0 (Materials Project)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'materials.details',
    mcpName: 'science.materials.details',
    title: 'Material Properties',
    description:
      'Get full DFT-computed properties for a material by Materials Project ID (e.g. mp-149 for silicon). Returns: band gap, formation energy, thermodynamic stability, density, crystal structure, spacegroup, magnetism, bulk/shear modulus, Poisson ratio, Fermi energy, database cross-references. 150K+ materials (Materials Project)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'materials.elasticity',
    mcpName: 'science.materials.elasticity',
    title: 'Material Elastic Properties',
    description:
      'Get mechanical/elastic properties for a material: bulk modulus, shear modulus (Voigt-Reuss-Hill averages), universal anisotropy index, Poisson ratio, and full 6x6 elastic tensor (IEEE format). Essential for structural materials screening and mechanical simulations (Materials Project)',
    category: 'health',
    annotations: READ_ONLY,
  },

  // 17TRACK — Package Tracking (UC-221, 3 tools)
  {
    toolId: 'tracking.register',
    mcpName: 'logistics.tracking.register',
    title: 'Register Package for Tracking',
    description:
      '⚡ ACTION: Register a tracking number to begin monitoring shipment status. Auto-detects carrier from 3,200+ supported carriers worldwide (UPS, FedEx, DHL, USPS, China Post, Royal Mail, etc.). Must be called before tracking.status. Returns detected carrier and registration status. Consumes quota — 200 free/month (17TRACK)',
    category: 'logistics',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    toolId: 'tracking.status',
    mcpName: 'logistics.tracking.status',
    title: 'Get Package Tracking Events',
    description:
      'Get full tracking timeline for a registered package — latest status, all carrier scan events with timestamps and locations, delivery milestones, transit days, origin/destination countries. Supports 3,200+ carriers across 220 countries. Call tracking.register first if number is not yet registered (17TRACK)',
    category: 'logistics',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tracking.list',
    mcpName: 'logistics.tracking.list',
    title: 'List Tracked Packages',
    description:
      'List all tracking numbers registered in your account with status summary — package status, latest event, transit days, registration time. Paginated. Filter by status: NotFound, InTransit, Delivered, Expired, Exception (17TRACK)',
    category: 'logistics',
    annotations: READ_ONLY,
  },

  // Account Analytics — Usage & Billing Insights (F4, 3 tools)
  {
    toolId: 'account.usage',
    mcpName: 'account.analytics.usage',
    title: 'Usage Summary',
    description:
      'Get your API usage summary — total calls, total cost, cache hit rate, average latency, and unique tools used. Filter by period: 1 day, 7 days, or 30 days. See how efficiently you are using the platform. Free, no charge (APIbase)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'account.tools',
    mcpName: 'account.analytics.tools',
    title: 'Per-Tool Usage Breakdown',
    description:
      'Get per-tool usage breakdown — calls, cost, cache hits, average latency, last used. Sort by cost (highest spend), calls (most used), or latency (slowest). Identify your most-used and most-expensive tools. Free, no charge (APIbase)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'account.timeseries',
    mcpName: 'account.analytics.timeseries',
    title: 'Usage Time Series',
    description:
      'Get time-series usage data — calls, cost, cache hits per hour or day over a period. Visualize usage patterns and trends. Choose granularity: hourly (for 1d period) or daily (for 7d/30d). Free, no charge (APIbase)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // Platform Tools — Quality Index & Batch API (F1, F5, 3 tools)
  {
    toolId: 'platform.tool_quality',
    mcpName: 'platform.quality.tool',
    title: 'Tool Quality Metrics',
    description:
      'Get quality metrics for any tool — uptime percentage, p50/p95 latency, error rate, total calls in last 24h. Check reliability before calling expensive tools. Updated every 10 minutes. Free, no charge (APIbase)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'platform.tool_rankings',
    mcpName: 'platform.quality.rankings',
    title: 'Tool Quality Rankings',
    description:
      'Get ranked list of tools by quality — sort by uptime (most reliable), latency (fastest), or error_rate (fewest errors). Filter by category (e.g. "crypto", "weather"). Discover the best tools for your use case. Free, no charge (APIbase)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'platform.call_batch',
    mcpName: 'platform.batch.call',
    title: 'Batch Tool Calls',
    description:
      '⚡ ACTION: Execute up to 20 tool calls in a single request with parallel execution (max 10 concurrent). Each call runs the full pipeline independently with its own billing. Returns array of results with per-call status, data, cost, and duration. Save 5x round-trips vs sequential calls. Batch wrapper is free — you pay only for individual tool calls (APIbase)',
    category: 'developer',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },

  // ---------------------------------------------------------------------------
  // TheirStack — Job Market Intelligence (UC-254, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'theirstack.jobs',
    mcpName: 'jobs.theirstack.search',
    title: 'Search Job Postings',
    description:
      'Search 181M+ job postings worldwide — filter by keywords, country, remote, tech stack, recency. Returns title, company, location, salary range, post date. Job market intelligence for hiring analysis and talent sourcing (TheirStack)',
    category: 'jobs',
    annotations: READ_ONLY,
  },
  {
    toolId: 'theirstack.companies',
    mcpName: 'jobs.theirstack.companies',
    title: 'Search Companies by Tech Stack',
    description:
      'Find companies by technology stack — filter by technologies (kubernetes, react, python...), country, minimum active jobs. Returns company name, URL, job count, tech stack. Identify employers using specific technologies (TheirStack)',
    category: 'jobs',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Jooble — Job Aggregator (UC-255, 1 tool)
  // ---------------------------------------------------------------------------
  {
    toolId: 'jooble.search',
    mcpName: 'jobs.jooble.search',
    title: 'Search Jobs Worldwide',
    description:
      'Search aggregated job listings across 70+ countries — filter by keywords, location, radius, salary, company name. Returns title, company, location, salary, source, direct link. 9M+ active listings from thousands of job boards (Jooble)',
    category: 'jobs',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Arbeitnow — EU Job Listings (UC-256, 1 tool)
  // ---------------------------------------------------------------------------
  {
    toolId: 'arbeitnow.jobs',
    mcpName: 'jobs.arbeitnow.browse',
    title: 'Browse EU Job Listings',
    description:
      'Browse European job listings — 100 jobs per page sorted by newest. Returns title, company, location, remote flag, tags, job types, direct link. Updated hourly. EU-focused: Germany, Austria, Switzerland, Netherlands, and more. Open public API (Arbeitnow)',
    category: 'jobs',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Reed.co.uk — UK Job Board (UC-257, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'reed.search',
    mcpName: 'jobs.reed.search',
    title: 'Search UK Jobs',
    description:
      'Search UK job listings — filter by keywords, location, distance, salary range (GBP), contract type (permanent/contract/temp), full/part time. Returns title, company, salary, applications count, direct link. UK largest job board (Reed.co.uk)',
    category: 'jobs',
    relatedTools: [
      { toolId: 'reed.details', reason: 'Full job description and salary details' },
      { toolId: 'finance.exchange_rates', reason: 'Convert GBP salary to your currency' },
    ],
    annotations: READ_ONLY,
  },
  {
    toolId: 'reed.details',
    mcpName: 'jobs.reed.details',
    title: 'UK Job Details',
    description:
      'Get full details of a UK job listing by ID — title, company, full salary info (min/max GBP, annual/hourly/daily), contract type, full/part time, application count, full HTML description, external apply URL. Use job IDs from reed.search results (Reed.co.uk)',
    category: 'jobs',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Remotive — Remote Jobs (UC-258, 1 tool)
  // ---------------------------------------------------------------------------
  {
    toolId: 'remotive.search',
    mcpName: 'jobs.remotive.search',
    title: 'Search Remote Jobs',
    description:
      'Search curated remote-only job listings — filter by keywords and category (software-dev, design, marketing, data, devops, etc.). Returns title, company, salary, job type, location requirements, tags. Global remote positions only (Remotive)',
    category: 'jobs',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Canopy API — Amazon Product Data (UC-265, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'canopy.search',
    mcpName: 'ecommerce.amazon.search',
    title: 'Search Amazon Products',
    description:
      'Search Amazon products by keyword — filter by price range, sort by relevance/price/rating/reviews/newest. Returns title, ASIN, price, rating, Prime flag, image. 12 marketplaces: US, UK, CA, DE, FR, IT, ES, AU, IN, MX, BR, JP (Canopy API)',
    category: 'entertainment',
    relatedTools: [
      { toolId: 'canopy.product', reason: 'Full details for a specific ASIN' },
      { toolId: 'canopy.offers', reason: 'Compare seller prices + Buy Box winner' },
    ],
    annotations: READ_ONLY,
  },
  {
    toolId: 'canopy.product',
    mcpName: 'ecommerce.amazon.product',
    title: 'Amazon Product Details',
    description:
      'Get full Amazon product details by ASIN — title, brand, price, rating, stock status, feature bullets, categories, seller name. Use ASINs from canopy.search. 12 Amazon marketplaces supported (Canopy API)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'canopy.offers',
    mcpName: 'ecommerce.amazon.offers',
    title: 'Amazon Product Offers & Buy Box',
    description:
      'Get all third-party seller offers for an Amazon product — price, condition (new/used), seller name & rating, Buy Box winner flag, Fulfilled by Amazon, delivery estimate. Price comparison across sellers (Canopy API)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'canopy.deals',
    mcpName: 'ecommerce.amazon.deals',
    title: 'Amazon Current Deals',
    description:
      'Browse current Amazon deals — original price vs deal price, product title, ASIN, deal link. Paginated, 500+ active deals. 12 Amazon marketplaces (Canopy API)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Spider.cloud — Web Scraping (UC-274, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'spider.scrape',
    mcpName: 'scraping.spider.scrape',
    title: 'Scrape Web Page',
    description:
      'Scrape any web page and get clean content — markdown (default), plain text, or raw HTML. Handles JavaScript rendering, anti-bot bypass, proxy rotation. Returns LLM-ready output. Cheapest web scraper with PAYG pricing (Spider.cloud)',
    category: 'search',
    annotations: READ_ONLY,
    relatedTools: [
      { toolId: 'spider.search', reason: 'Find URLs to scrape via web search' },
      { toolId: 'diffbot.article_extract', reason: 'Alternative: structured article extraction' },
    ],
  },
  {
    toolId: 'spider.search',
    mcpName: 'scraping.spider.search',
    title: 'Web Search + Scrape',
    description:
      'Web search that returns page titles, descriptions, and URLs. Combine with spider.scrape to get full content. Results ranked by relevance (Spider.cloud)',
    category: 'search',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Imgflip — Meme Generator (UC-286, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'imgflip.memes',
    mcpName: 'media.imgflip.memes',
    title: 'Browse Meme Templates',
    description:
      'Get top 100 popular meme templates — Drake Hotline Bling, Two Buttons, Distracted Boyfriend, and more. Returns template ID, name, image URL, box count. Use IDs with imgflip.caption to generate memes (Imgflip)',
    category: 'media',
    annotations: READ_ONLY,
  },
  {
    toolId: 'imgflip.caption',
    mcpName: 'media.imgflip.caption',
    title: 'Generate Meme Image',
    description:
      '⚡ ACTION: Generate a captioned meme image from a template ID + top/bottom text. Returns direct image URL. Use imgflip.memes to find template IDs. 100K+ templates available (Imgflip)',
    category: 'media',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },

  // ---------------------------------------------------------------------------
  // TheCocktailDB — Cocktail Recipes (UC-304, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'cocktail.search',
    mcpName: 'recipes.cocktail.search',
    title: 'Search Cocktail Recipes',
    description:
      'Search 10,000+ cocktail recipes by name or filter by ingredient. Returns name, category, glass type, instructions, ingredients with measures, image. Search "margarita" or filter by "Vodka" (TheCocktailDB)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cocktail.random',
    mcpName: 'recipes.cocktail.random',
    title: 'Random Cocktail Recipe',
    description:
      'Get a random cocktail recipe with full details — name, category, glass, instructions, ingredients, measures, image. Great for discovery and recommendations (TheCocktailDB)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // GitHub API — Code & Repositories (UC-332, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'github.search_repos',
    mcpName: 'developer.github.search',
    title: 'Search GitHub Repositories',
    description:
      'Search GitHub repositories by keyword, language, stars, topics. Returns name, description, stars, forks, language, license, owner. Sort by stars/forks/updated. 86K+ MCP repos, 372M+ total repos (GitHub API)',
    category: 'developer',
    annotations: READ_ONLY,
    relatedTools: [
      { toolId: 'github.repo', reason: 'Get full details for a specific repo' },
      { toolId: 'github.user', reason: 'Check the repo owner profile' },
    ],
  },
  {
    toolId: 'github.user',
    mcpName: 'developer.github.user',
    title: 'GitHub User Profile',
    description:
      'Get a GitHub user profile — name, bio, public repos count, followers, company, location, join date. Works for users and organizations (GitHub API)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'github.repo',
    mcpName: 'developer.github.repo',
    title: 'GitHub Repository Details',
    description:
      'Get full details of a GitHub repository — description, stars, forks, language, topics, license, last update. Public repos only (GitHub API)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Wikidata — Structured Knowledge Graph (UC-323, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'wikidata.search',
    mcpName: 'knowledge.wikidata.search',
    title: 'Search Wikidata Entities',
    description:
      'Search 100M+ structured entities in Wikidata — people, companies, places, concepts. Returns entity ID, label, description. Use IDs with wikidata.entity for full details. CC-0 public domain (Wikidata)',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'wikidata.entity',
    mcpName: 'knowledge.wikidata.entity',
    title: 'Wikidata Entity Details',
    description:
      'Get structured data for a Wikidata entity by ID (e.g. Q42 = Douglas Adams). Returns labels, descriptions, aliases, and up to 20 property statements. 300+ languages supported. CC-0 (Wikidata)',
    category: 'education',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // Dictionary — Define Words + Word Search (UC-313+314, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'dictionary.define',
    mcpName: 'language.dictionary.define',
    title: 'Define a Word',
    description:
      'Get word definition — phonetic pronunciation, part of speech, definitions with examples, synonyms, antonyms, audio URL. Supports 12 languages: en, es, fr, de, it, pt, ru, ar, hi, ja, ko, zh (Free Dictionary API)',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'dictionary.words',
    mcpName: 'language.dictionary.words',
    title: 'Find Related Words',
    description:
      'Find words by meaning, sound, rhyme, or spelling pattern. "happy" → pleased, blissful. "algorithm" rhymes → rhythm, logarithm. Great for writing, creative tasks, word games (Datamuse)',
    category: 'education',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // NOAA NWS Weather — US Forecasts + Observations (UC-324, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'noaa.forecast',
    mcpName: 'noaa.weather.forecast',
    title: 'NOAA 7-Day Forecast (US)',
    description:
      'Get 7-day weather forecast for a US location by latitude/longitude. Returns day and night periods with temperature (°F), precipitation chance, wind speed/direction, and detailed forecast text. Powered by NOAA National Weather Service (api.weather.gov). US contiguous only.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'noaa.hourly',
    mcpName: 'noaa.weather.hourly',
    title: 'NOAA Hourly Forecast (US)',
    description:
      'Get hourly weather forecast (next 48 hours) for a US location by latitude/longitude. Returns temperature (°F), precipitation chance, wind speed/direction, and short conditions per hour. Powered by NOAA National Weather Service. US contiguous only.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'noaa.observation',
    mcpName: 'noaa.weather.observation',
    title: 'NOAA Latest Observation (US)',
    description:
      'Get latest weather observation from the nearest ASOS/AWOS station to a US location. Returns current temperature (°C/°F), humidity, wind, pressure, visibility, dewpoint, heat index, wind chill. Powered by NOAA National Weather Service. US contiguous only.',
    category: 'weather',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // WhoisJSON — SSL + Subdomain Discovery (UC-326, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'whoisjson.ssl_check',
    mcpName: 'whoisjson.ssl.check',
    title: 'SSL Certificate Check',
    description:
      'Validate SSL/TLS certificate for any domain. Returns issuer (org, CN), validity dates, subject CN, wildcard status, key size, and Subject Alternative Names (SAN) list. Useful for security audits, monitoring cert expiration, and verifying HTTPS configuration (WhoisJSON)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'whoisjson.subdomains',
    mcpName: 'whoisjson.dns.subdomains',
    title: 'Subdomain Discovery',
    description:
      'Discover subdomains for any domain via DNS brute-force enumeration. Returns subdomain names, DNS record types (A/CNAME/MX), resolved IPs, and active/inactive status. Useful for security reconnaissance, asset inventory, and infrastructure mapping (WhoisJSON)',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // npm Registry — JavaScript Package Intelligence (UC-344, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'npm.package_info',
    mcpName: 'npm.packages.info',
    title: 'npm Package Info',
    description:
      'Get metadata for any npm package: version, description, license, dependencies, maintainers, repository URL, keywords, engines. 2.1M+ packages. Supports scoped packages (@scope/name). Returns latest version by default or a specific version.',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'npm.downloads',
    mcpName: 'npm.packages.downloads',
    title: 'npm Download Stats',
    description:
      'Get download count for any npm package over a time period: last-day, last-week, last-month, last-year. Useful for measuring package popularity, adoption trends, and comparing alternatives (e.g. express: 92M/week).',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'npm.search',
    mcpName: 'npm.packages.search',
    title: 'npm Package Search',
    description:
      'Search 2.1M+ npm packages by keyword. Returns ranked results with quality, popularity, and maintenance scores, download counts, dependents, license, publisher. Find libraries for any task (e.g. "mcp server", "react hooks", "typescript orm").',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'npm.versions',
    mcpName: 'npm.packages.versions',
    title: 'npm Package Versions',
    description:
      'List all published versions of an npm package with dist-tags (latest, next, beta), deprecation status, and total version count. Returns the 50 most recent versions. Useful for dependency auditing and upgrade planning.',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // OSV.dev — Open Source Vulnerability Database (UC-345, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'osv.query',
    mcpName: 'osv.security.query',
    title: 'Query Package Vulnerabilities',
    description:
      'Check known vulnerabilities for a specific package version in any ecosystem (npm, PyPI, Go, Maven, Rust, NuGet, 14+ more). Returns CVE/GHSA IDs, severity scores, and affected package counts. Powered by Google OSV.dev — aggregates GitHub Security Advisories, NVD, and ecosystem-native databases.',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'osv.get',
    mcpName: 'osv.security.get',
    title: 'Get Vulnerability Details',
    description:
      'Retrieve full details for a vulnerability by OSV ID (GHSA-xxxx), CVE ID (CVE-2021-xxxxx), or ecosystem ID (PYSEC/RUSTSEC/GO). Returns summary, CVSS severity, affected packages with fix versions, and reference links.',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'osv.batch_query',
    mcpName: 'osv.security.batch',
    title: 'Batch Vulnerability Scan',
    description:
      'Scan up to 100 packages at once for known vulnerabilities. Submit package+version+ecosystem triples (e.g. full requirements.txt or package.json dependencies) and get vulnerability matches for all in a single call. Ideal for full dependency tree security audits.',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // US Census Bureau — Demographics & Population (UC-333, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'census.population',
    mcpName: 'census.data.population',
    title: 'US Population Data',
    description:
      'Get population counts for any US geography by FIPS code — total, male, female. Covers all 50 states, 3,000+ counties, and sub-county areas. Source: American Community Survey 5-year estimates (US Census Bureau). Public domain, updated annually.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'census.demographics',
    mcpName: 'census.data.demographics',
    title: 'US Demographics Data',
    description:
      "Get demographic composition for any US geography — median age, race (white/Black/Asian), Hispanic/Latino population, and bachelor's degree attainment. Source: ACS 5-year estimates (US Census Bureau). Useful for market research, policy analysis, and neighborhood profiling.",
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'census.economic',
    mcpName: 'census.data.economic',
    title: 'US Economic Data',
    description:
      'Get economic indicators for any US geography — median household income, population in poverty, and unemployed count. Source: ACS 5-year estimates (US Census Bureau). Key data for market sizing, real estate analysis, and business location intelligence.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'census.housing',
    mcpName: 'census.data.housing',
    title: 'US Housing Data',
    description:
      'Get housing statistics for any US geography — total units, median home value, median rent, owner-occupied vs renter-occupied counts. Source: ACS 5-year estimates (US Census Bureau). Essential for real estate agents, property valuations, and housing market analysis.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // USAspending — Federal Contracts & Grants (UC-335, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'spending.awards',
    mcpName: 'spending.federal.awards',
    title: 'Federal Award Search',
    description:
      'Search 60M+ US federal contract and grant awards by keyword, recipient, or NAICS code. Returns award amount, recipient, agency, dates, and description. Sorted by amount descending. Source: USAspending.gov (DATA Act mandate, US Gov open data).',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'spending.agency',
    mcpName: 'spending.federal.agency',
    title: 'Federal Agency Spending',
    description:
      'Search federal awards by agency name (e.g. "Defense", "NASA", "Health and Human Services"). Returns top awards by amount for a fiscal year. Source: USAspending.gov — covers all federal agencies.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'spending.geography',
    mcpName: 'spending.federal.geography',
    title: 'Federal Spending by State',
    description:
      'Get total US federal spending by state for contracts, grants, or all awards in a fiscal year. Returns all 50+ states sorted by spending amount. Useful for regional economic analysis and policy research. Source: USAspending.gov.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // SAM.gov — Federal Contractor Registry (UC-338, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'sam.entity_search',
    mcpName: 'sam.gov.entity_search',
    title: 'SAM.gov Entity Search',
    description:
      'Search 700K+ registered US federal contractors and grantees by company name, state, or NAICS code. Returns UEI (Unique Entity Identifier), CAGE code, registration status, business types (Small Business, 8(a), HUBZone, WOSB, Veteran-Owned), and NAICS codes. Source: SAM.gov (GSA).',
    category: 'business',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sam.entity_detail',
    mcpName: 'sam.gov.entity_detail',
    title: 'SAM.gov Entity Detail',
    description:
      'Get full SAM.gov registration details for a federal contractor by UEI (Unique Entity Identifier). Returns legal name, CAGE code, addresses, NAICS/PSC codes, business certifications, entity structure, organization type, and registration dates. Source: SAM.gov (GSA).',
    category: 'business',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // OpenFEMA — US Disaster Data (UC-334, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'fema.disasters',
    mcpName: 'fema.disaster.declarations',
    title: 'FEMA Disaster Declarations',
    description:
      'Search US federal disaster declarations from 1953 to present. Filter by state, incident type (Fire, Flood, Hurricane, Tornado, Earthquake), and year. Returns disaster number, title, dates, designated programs (IA, PA, HM). Source: OpenFEMA (US Gov open data).',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'fema.flood_claims',
    mcpName: 'fema.disaster.flood_claims',
    title: 'NFIP Flood Insurance Claims',
    description:
      'Retrieve National Flood Insurance Program (NFIP) claims by state and year. Returns flood zone, building/contents payments, insurance coverage amounts, cause of damage. Essential for flood risk assessment and insurance analysis. Source: OpenFEMA.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'fema.assistance',
    mcpName: 'fema.disaster.assistance',
    title: 'FEMA Housing Assistance',
    description:
      'Query federal disaster housing assistance data by state and disaster number. Returns registration counts, average damage, total inspected, approved amounts by county. Useful for disaster recovery analysis and aid distribution research. Source: OpenFEMA.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // PyPI — Python Package Index (UC-346, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'pypi.package_info',
    mcpName: 'pypi.packages.info',
    title: 'PyPI Package Info',
    description:
      'Get metadata for any Python package from PyPI: version, summary, license, author, dependencies, classifiers, Python version requirements. 550K+ packages. Supports specific version lookup. Complements npm (UC-344) for polyglot dependency intelligence.',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'pypi.releases',
    mcpName: 'pypi.packages.releases',
    title: 'PyPI Package Versions',
    description:
      'List all published versions of a Python package with upload dates, yanked status, and distribution file types (sdist/wheel). Returns the 50 most recent versions. Useful for dependency auditing, version pinning, and upgrade planning.',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // GBIF — Global Biodiversity (UC-341, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'gbif.species_search',
    mcpName: 'gbif.biodiversity.species_search',
    title: 'GBIF Species Search',
    description:
      'Search 9M+ species in the GBIF backbone taxonomy by common or scientific name. Returns taxon key, scientific name, kingdom/phylum/class/order/family/genus, and taxonomic status. Filter by rank (SPECIES, GENUS, FAMILY). Source: Global Biodiversity Information Facility (CC0).',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'gbif.species_details',
    mcpName: 'gbif.biodiversity.species_details',
    title: 'GBIF Species Details',
    description:
      'Get full taxonomic profile for a species by GBIF taxon key. Returns classification hierarchy, vernacular (common) names, synonyms, number of descendants, and accepted name. Source: GBIF backbone taxonomy.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'gbif.occurrences',
    mcpName: 'gbif.biodiversity.occurrences',
    title: 'GBIF Species Occurrences',
    description:
      'Search 2.5B+ species occurrence records by taxon, country, and year. Returns observation coordinates, date, collector institution, basis of record (specimen/observation). Filter by ISO country code. Source: GBIF (2000+ institutions, 100+ countries).',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'gbif.occurrence_count',
    mcpName: 'gbif.biodiversity.occurrence_count',
    title: 'GBIF Occurrence Count',
    description:
      'Get total occurrence count for a species, optionally filtered by country. Useful for range size estimation, data density assessment, and conservation status analysis. Source: GBIF.',
    category: 'education',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Congress.gov — US Legislation (UC-336, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'congress.bills',
    mcpName: 'congress.legislation.bills',
    title: 'US Congressional Bills',
    description:
      'Search US federal bills and resolutions from 1973 to present. Filter by Congress number (93-119), bill type (hr/s/hjres/sjres). Returns title, sponsor, party, latest action, policy area. Source: Congress.gov (Library of Congress).',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'congress.bill_details',
    mcpName: 'congress.legislation.bill_details',
    title: 'US Bill Details',
    description:
      'Get full details for a specific US bill by Congress number, type (hr/s), and bill number. Returns title, all sponsors, co-sponsor count, action history, committee referrals, policy subjects. Source: Congress.gov.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'congress.members',
    mcpName: 'congress.legislation.members',
    title: 'US Congressional Members',
    description:
      'Search current and historical members of the US Congress. Filter by state, chamber (House/Senate), and Congress number. Returns name, party, state, district, bioguide ID. Source: Congress.gov.',
    category: 'legal',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // deps.dev — Google Open Source Insights (UC-347, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'depsdev.package',
    mcpName: 'depsdev.insights.package',
    title: 'Package Info (deps.dev)',
    description:
      'Get package metadata from Google deps.dev — all versions, default version, ecosystem. Covers npm, PyPI, Go, Maven, Cargo, NuGet (50M+ package versions). Complements npm/PyPI registries with cross-ecosystem unified view.',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'depsdev.dependencies',
    mcpName: 'depsdev.insights.dependencies',
    title: 'Dependency Tree (deps.dev)',
    description:
      'Resolve the full transitive dependency tree for a package version. Returns all direct and indirect dependencies with versions and relation type. Reveals hidden supply chain depth (e.g. express@5.2.1 has 67 transitive deps). Google deps.dev.',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'depsdev.advisories',
    mcpName: 'depsdev.insights.advisories',
    title: 'Security Advisories (deps.dev)',
    description:
      'List security advisories (from OSV) affecting a specific package version. Cross-ecosystem: npm, PyPI, Go, Maven, Cargo, NuGet. Returns advisory IDs with links to OSV.dev for full details. Complements osv.query for version-specific lookups.',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // EPA Envirofacts — Environmental Data (UC-337, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'epa.toxic_releases',
    mcpName: 'epa.environment.toxic_releases',
    title: 'EPA Toxic Release Inventory',
    description:
      'Search EPA Toxic Release Inventory (TRI) facilities by US state or ZIP code. Returns facility name, address, county, industry sector, and closed status. 600K+ regulated facilities. Source: EPA Envirofacts (US Gov open data).',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'epa.water_systems',
    mcpName: 'epa.environment.water_systems',
    title: 'EPA Public Water Systems',
    description:
      'Search public water systems by US state. Returns system name, PWSID, activity status, primacy agency, EPA region, population served, and service connections. Source: EPA Safe Drinking Water Act data.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // NOAA NCEI — Historical Climate Data (UC-343, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'ncei.stations',
    mcpName: 'ncei.climate.stations',
    title: 'NCEI Weather Stations',
    description:
      'Search 100K+ global weather stations from NOAA NCEI by location (state FIPS, ZIP, country). Returns station ID, name, coordinates, elevation, and data coverage dates (some from 1700s). Use station IDs with ncei.daily_data for historical climate records.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ncei.daily_data',
    mcpName: 'ncei.climate.daily_data',
    title: 'NCEI Daily Climate Data',
    description:
      'Retrieve historical daily weather observations from NOAA NCEI — max/min temperature, precipitation, snowfall, wind speed. 260+ years of records from global stations. Values in tenths of °C (temp) and tenths of mm (precip). Source: GHCND dataset.',
    category: 'weather',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Global Warming API — Climate Indicators (UC-342, 5 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'climate.temperature',
    mcpName: 'climate.indicators.temperature',
    title: 'Global Temperature Anomaly',
    description:
      'Global surface temperature anomaly from NASA GISS — monthly readings since 1880. Values in °C vs 1951-1980 baseline. Returns last 10 years by default (adjustable 1-50). Source: NASA Goddard Institute for Space Studies.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'climate.co2',
    mcpName: 'climate.indicators.co2',
    title: 'Atmospheric CO2 (Keeling Curve)',
    description:
      'Atmospheric CO2 concentration from NOAA Mauna Loa Observatory — the Keeling Curve. Monthly readings in ppm (parts per million) since 1958. Returns last 10 years by default. Source: NOAA ESRL.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'climate.methane',
    mcpName: 'climate.indicators.methane',
    title: 'Atmospheric Methane (CH4)',
    description:
      'Atmospheric methane concentration from NOAA ESRL — monthly readings in ppb (parts per billion) since 1983. Methane is the second most important greenhouse gas after CO2. Returns last 10 years by default.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'climate.nitrous_oxide',
    mcpName: 'climate.indicators.nitrous_oxide',
    title: 'Atmospheric Nitrous Oxide (N2O)',
    description:
      'Atmospheric nitrous oxide concentration from NOAA ESRL — monthly readings in ppb since 2001. N2O is a potent greenhouse gas with 273x the warming potential of CO2. Returns last 10 years by default.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'climate.arctic_ice',
    mcpName: 'climate.indicators.arctic_ice',
    title: 'Arctic Sea Ice Extent',
    description:
      'Arctic sea ice extent from NSIDC — monthly measurements in million km² since 1979. Tracks long-term decline in Arctic ice coverage. Returns last 10 years by default. Source: National Snow and Ice Data Center.',
    category: 'weather',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // QuickChart — Data Visualization (1 tool)
  // ---------------------------------------------------------------------------
  {
    toolId: 'chart.create',
    mcpName: 'chart.visualization.create',
    title: 'Create Chart Image',
    description:
      '⚡ ACTION: Generate a chart image (PNG) from data — bar, line, pie, doughnut, radar, scatter. Returns a permanent image URL. Combine with data tools (climate.co2, census.population, finance.exchange_rates) to visualize any dataset. Powered by QuickChart (Chart.js).',
    category: 'developer',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },

  // ---------------------------------------------------------------------------
  // OpenFIGI — Bloomberg Financial Identifiers (UC-357, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'figi.map',
    mcpName: 'figi.finance.map',
    title: 'Map Financial Identifier to FIGI',
    description:
      'Resolve financial instrument identifiers — ISIN, CUSIP, SEDOL, or ticker symbol to Bloomberg FIGI (ISO 18774). Returns FIGI, composite FIGI, security name, type, and exchange. 300M+ instruments across 45K+ exchanges. Use ID_ISIN, ID_CUSIP, ID_SEDOL, or TICKER as id_type.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'figi.search',
    mcpName: 'figi.finance.search',
    title: 'Search Financial Instruments',
    description:
      'Search 300M+ financial instruments by company name or ticker keyword. Filter by exchange and security type. Returns Bloomberg FIGI, ticker, name, market sector. Covers equities, ETPs, bonds, derivatives globally.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'figi.filter',
    mcpName: 'figi.finance.filter',
    title: 'Filter Financial Instruments',
    description:
      'Filter financial instruments by exchange code, market sector (Equity/Corp/Govt/Index/Curncy/Comdty), or security type (Common Stock/ETP/REIT/ADR). Browse instrument universe by structured criteria. Bloomberg OpenFIGI.',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // USNO — US Naval Observatory Astronomical Data (UC-353, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'usno.moon_phases',
    mcpName: 'usno.astronomy.moon_phases',
    title: 'Moon Phases',
    description:
      'Get all moon phase dates for a year — New Moon, First Quarter, Full Moon, Last Quarter with exact UTC timestamps. ~50 phases per year. Source: US Naval Observatory (canonical astronomical authority, US Gov public domain).',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'usno.sun_moon',
    mcpName: 'usno.astronomy.sun_moon',
    title: 'Sun & Moon Rise/Set Times',
    description:
      'Get sunrise, sunset, moonrise, moonset, and transit times for any location and date. Includes civil/nautical/astronomical twilight. Used for photography golden hour, agriculture planning, outdoor events. Source: USNO.',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'usno.seasons',
    mcpName: 'usno.astronomy.seasons',
    title: 'Equinoxes & Solstices',
    description:
      'Get exact dates and UTC times for vernal equinox, summer solstice, autumnal equinox, and winter solstice for any year. Also includes Earth perihelion and aphelion dates. Source: US Naval Observatory.',
    category: 'space',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Wger — Exercise & Nutrition Database (UC-360, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'wger.exercise_search',
    mcpName: 'wger.fitness.exercise_search',
    title: 'Exercise Search',
    description:
      'Search 896 exercises by name — bench press, squat, deadlift, curl, etc. Returns exercise name, category (Chest/Back/Legs/Arms/Abs/Shoulders/Cardio), and ID for details lookup. Open-source fitness database (Wger, CC-BY-SA).',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'wger.exercise_details',
    mcpName: 'wger.fitness.exercise_details',
    title: 'Exercise Details',
    description:
      'Get full exercise details by ID — description, primary and secondary muscles worked, required equipment (barbell/dumbbell/bodyweight/machine), and category. Use with exercise_search to build workout plans.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'wger.ingredients',
    mcpName: 'wger.fitness.ingredients',
    title: 'Food Ingredient Nutrition',
    description:
      'Search 1.28M food ingredients by name — chicken breast, rice, banana, oats. Returns calories (kcal), protein, carbs, fat, fiber, sugar, sodium per 100g. Complements USDA FDC with broader international coverage.',
    category: 'health',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // WhoisXML Email Verification (UC-363, 1 tool)
  // ---------------------------------------------------------------------------
  {
    toolId: 'email_verify.check',
    mcpName: 'email.verification.check',
    title: 'Verify Email Address',
    description:
      'Verify an email address — SMTP deliverability check, DNS/MX validation, disposable email detection, catch-all server detection, free provider flag, role account flag (info@, admin@). Returns comprehensive verification result. Powered by WhoisXML API.',
    category: 'messaging',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Solar System OpenData (UC-354, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'solar.bodies',
    mcpName: 'solar.system.bodies',
    title: 'Solar System Bodies',
    description:
      'List solar system bodies — planets, moons, asteroids, comets, dwarf planets. Returns name, body type, gravity, radius, and moon count. 1,400+ bodies. Filter by type. Source: Solar System OpenData (MIT license).',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'solar.body_details',
    mcpName: 'solar.system.body_details',
    title: 'Solar System Body Details',
    description:
      'Get comprehensive data for a solar system body — mass, radius, density, gravity, escape velocity, temperature, axial tilt, orbital period, semi-major axis, eccentricity, inclination, discoverer, and list of moons. Source: Solar System OpenData.',
    category: 'space',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // ISS Tracker — Real-Time Space Station (UC-355, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'iss.position',
    mcpName: 'iss.space.position',
    title: 'ISS Current Position',
    description:
      'Get the real-time position of the International Space Station — latitude, longitude, altitude (km), velocity (km/h), and daylight/eclipse visibility. ISS orbits at 28,000 km/h, completes one orbit every 90 minutes. Updates every ~60 seconds.',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'iss.tle',
    mcpName: 'iss.space.tle',
    title: 'ISS Orbital Elements (TLE)',
    description:
      'Get the Two-Line Element set (TLE) for the International Space Station — NORAD catalog #25544. Contains orbital parameters for trajectory prediction and satellite tracking calculations.',
    category: 'space',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // HuggingFace Hub — ML Model & Dataset Registry (UC-367, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'hf.models',
    mcpName: 'hf.hub.models',
    title: 'Search ML Models',
    description:
      'Search 1M+ ML models on HuggingFace Hub by name, task (text-generation, image-classification, translation), or library (transformers, diffusers). Returns model ID, downloads, likes, pipeline tag. Sorted by downloads.',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hf.model_details',
    mcpName: 'hf.hub.model_details',
    title: 'ML Model Details',
    description:
      'Get full metadata for a HuggingFace model — downloads, likes, tags, library, author, pipeline task, model card data. Use model_id from hf.models search (e.g. "meta-llama/Llama-3.3-70B-Instruct").',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hf.datasets',
    mcpName: 'hf.hub.datasets',
    title: 'Search ML Datasets',
    description:
      'Search 200K+ datasets on HuggingFace Hub by name or keyword. Returns dataset ID, downloads, likes, tags. Covers NLP, vision, audio, tabular datasets. Sorted by downloads.',
    category: 'developer',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // USGS Water Services — real-time streamflow & water levels (UC-369)
  // ---------------------------------------------------------------------------
  {
    toolId: 'water.sites',
    mcpName: 'water.usgs.sites',
    title: 'Search USGS Water Monitoring Sites',
    description:
      'Search 1.5M+ USGS water monitoring sites by US state, county FIPS, bounding box, or site number. Returns site ID, station name, coordinates, altitude, HUC watershed code. Use site numbers with water.realtime for live data (USGS)',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'water.realtime',
    mcpName: 'water.usgs.realtime',
    title: 'Get Real-Time Water Data',
    description:
      'Get real-time streamflow (ft^3/s), gage height (ft), water temperature, and conductance for a USGS monitoring site. Updated every 15 minutes. Covers rivers, streams, lakes, reservoirs across the US. Use water.sites to find site numbers (USGS)',
    category: 'world',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // World Bank Indicators — global development data (UC-372)
  // ---------------------------------------------------------------------------
  {
    toolId: 'worldbank.indicators',
    mcpName: 'worldbank.dev.indicators',
    title: 'Search Development Indicators',
    description:
      'Search 16,000+ World Bank development indicators by keyword or topic — GDP, population, poverty, education, health, environment, trade. Returns indicator ID, name, source, description, topics. Use indicator IDs with finance.country_data for time-series data (World Bank, CC BY 4.0)',
    category: 'finance',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // CDC Open Data — US public health statistics (UC-371)
  // ---------------------------------------------------------------------------
  {
    toolId: 'cdc.datasets',
    mcpName: 'cdc.health.datasets',
    title: 'Search CDC Health Datasets',
    description:
      'Search 1,400+ CDC public health datasets — COVID-19, chronic disease, vaccination, mortality, birth/death statistics, environmental health. Returns dataset ID, name, description, category. Use dataset IDs with cdc.query to fetch data (US Gov)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cdc.query',
    mcpName: 'cdc.health.query',
    title: 'Query CDC Dataset',
    description:
      'Query a specific CDC dataset using SoQL filters — filter by state, year, age group, condition. Returns structured rows with column names. Supports WHERE, SELECT, ORDER, GROUP BY. Use cdc.datasets to find dataset IDs first (US Gov, Socrata SODA API)',
    category: 'health',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // DBLP — Computer Science bibliography (UC-370)
  // ---------------------------------------------------------------------------
  {
    toolId: 'dblp.search',
    mcpName: 'dblp.cs.search',
    title: 'Search CS Papers',
    description:
      'Search 7M+ computer science publications on DBLP by title, keyword, or topic. Returns title, authors, venue (NeurIPS, ICML, CVPR, ACL, etc.), year, DOI. The largest CS-specific bibliography — covers journals, conferences, and workshops (DBLP, CC0)',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'dblp.author',
    mcpName: 'dblp.cs.author',
    title: 'Search CS Authors',
    description:
      'Search 3M+ computer science authors on DBLP. Returns author name, DBLP PID, profile URL, aliases, affiliations. Use for finding researchers, checking publication records, or discovering collaborators (DBLP, CC0)',
    category: 'education',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // NOAA Tides & Currents — tide predictions + water levels (UC-374)
  // ---------------------------------------------------------------------------
  {
    toolId: 'tides.predictions',
    mcpName: 'tides.noaa.predictions',
    title: 'Get Tide Predictions',
    description:
      'Get tide predictions for a NOAA station — high/low tides, hourly, or 6-minute intervals. Returns predicted water level in feet or meters. Covers US coastlines, rivers, Great Lakes. Station IDs: 8518750 (NYC), 9414290 (SF), 8443970 (Boston) (NOAA, US Gov)',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tides.water_levels',
    mcpName: 'tides.noaa.water_levels',
    title: 'Get Real-Time Water Levels',
    description:
      'Get real-time observed water levels from a NOAA station — latest reading or recent history. Returns water level in feet or meters with quality flags. Updated every 6 minutes. Covers US coastlines, rivers, Great Lakes (NOAA, US Gov)',
    category: 'world',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // Met Museum — Open Access art collection (UC-373)
  // ---------------------------------------------------------------------------
  {
    toolId: 'met.search',
    mcpName: 'met.art.search',
    title: 'Search Met Museum Artworks',
    description:
      'Search 470,000+ artworks at The Metropolitan Museum of Art by keyword, artist, medium, department, date range, or geography. Returns object IDs — use met.details for full metadata and images. CC0 public domain (Met Museum)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'met.details',
    mcpName: 'met.art.details',
    title: 'Get Artwork Details',
    description:
      'Get full details for a Met Museum artwork by object ID — title, artist, date, medium, dimensions, department, culture, provenance, high-res image URLs, public domain status. Use met.search to find object IDs first (Met Museum, CC0)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'met.departments',
    mcpName: 'met.collection.departments',
    title: 'List Met Museum Departments',
    description:
      'List all 19 curatorial departments at The Metropolitan Museum of Art with their IDs and names — American Decorative Arts, Egyptian Art, European Paintings, Greek and Roman Art, Modern Art, and more. Use department IDs with met.browse to explore a collection area or with met.search to filter searches. CC0 public domain (Met Museum)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'met.browse',
    mcpName: 'met.collection.browse',
    title: 'Browse Met Museum Department',
    description:
      'Browse all artworks in a Met Museum department by department ID, with pagination. Returns a page of object IDs — use met.details to fetch full artwork metadata for each ID. Use met.departments to get department IDs (e.g. 10=Egyptian Art, 11=European Paintings, 21=Modern Art). CC0 public domain (Met Museum)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // Rijksmuseum — Dutch national museum art collection (UC-379)
  // ---------------------------------------------------------------------------
  {
    toolId: 'rijks.search',
    mcpName: 'rijks.art.search',
    title: 'Search Rijksmuseum Collection',
    description:
      'Search 800,000+ artworks at the Rijksmuseum (Dutch national museum) by title, description, creation date, or object number. Returns Linked Open Data object IDs — use rijks.details for full metadata. Covers Rembrandt, Vermeer, Van Gogh, and centuries of Dutch art. CC-BY license (Rijksmuseum)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'rijks.details',
    mcpName: 'rijks.art.details',
    title: 'Get Rijksmuseum Artwork Details',
    description:
      'Get full details for a Rijksmuseum artwork by object ID — title (multiple languages), object number, creation date, production location, materials, dimensions, current gallery location. Linked Art JSON-LD format (CIDOC CRM). Use rijks.search to find object IDs first (Rijksmuseum, CC-BY)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // Cleveland Museum of Art — Open Access collection (UC-381)
  // ---------------------------------------------------------------------------
  {
    toolId: 'cma.search',
    mcpName: 'cma.art.search',
    title: 'Search Cleveland Museum Collection',
    description:
      'Search 64,000+ artworks at the Cleveland Museum of Art by keyword, artist, type, or department. Filter for CC0-only (commercial-free) images. Returns artwork IDs, title, artist, date, license status, image URLs. Use cma.artwork for full details (CMA, CC0)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cma.artwork',
    mcpName: 'cma.art.details',
    title: 'Get CMA Artwork Details',
    description:
      'Get full details for a Cleveland Museum artwork by ID — title, artist, nationality, date, medium, dimensions, culture, provenance, license status (CC0/restricted), image URLs (web + full resolution). Use cma.search to find artwork IDs first (CMA, CC0)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cma.artwork_search',
    mcpName: 'cma.artwork.search',
    title: 'Search Cleveland Museum Artworks',
    description:
      'Search 64,000+ artworks at the Cleveland Museum of Art by keyword, artist, type, or culture. Returns title, artist, date, medium, image URLs, and CC0 license status. Use cma.artwork_detail for full record (CMA Open Access)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cma.artwork_detail',
    mcpName: 'cma.artwork.detail',
    title: 'Get Cleveland Museum Artwork Detail',
    description:
      'Get complete metadata for a Cleveland Museum artwork by accession number — artist, date, medium, dimensions, culture, provenance, exhibition history, image URLs (web + print). Use cma.artwork_search to find accession numbers (CMA Open Access)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cma.creator_search',
    mcpName: 'cma.creator.search',
    title: 'Search Cleveland Museum Creators',
    description:
      'Search artists, sculptors, and makers in the Cleveland Museum of Art collection. Returns creator name, nationality, birth/death dates, and count of works in the collection. Use accession numbers from results with cma.artwork_detail (CMA Open Access)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cma.exhibition_search',
    mcpName: 'cma.exhibition.search',
    title: 'Search Cleveland Museum Exhibitions',
    description:
      'Search past and current exhibitions at the Cleveland Museum of Art. Returns exhibition title, date range, description, and featured artworks. Use for art history research and provenance verification (CMA Open Access)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // Smithsonian Institution — 19 museums, 11M+ Open Access records (UC-382)
  // ---------------------------------------------------------------------------
  {
    toolId: 'smithsonian.search',
    mcpName: 'smithsonian.collection.search',
    title: 'Search Smithsonian Collections',
    description:
      'Full-text search across 11M+ records from 19 Smithsonian museums — art, artifacts, scientific specimens, archives. Filter by type (objects/species/archives/books/online_media/events/places), sort by relevancy/newest/updated/random, and CC0-only by default. Covers National Museum of Natural History, Air and Space, American Art, Portrait Gallery, Freer|Sackler, and more (Smithsonian Open Access, CC0 subset)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'smithsonian.record',
    mcpName: 'smithsonian.collection.record',
    title: 'Get Smithsonian Record Details',
    description:
      'Get full record for a Smithsonian Open Access item by ID — title, unit code (which of 19 museums), license (CC0 flag), record_link (canonical URL), data_source, online media (images/audio/video), freetext metadata, indexed structured fields. Use smithsonian.search to find IDs first (Smithsonian, CC0 subset)',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // USDA Soil Data Access — SSURGO soil survey, US Gov open data (UC-386)
  // ---------------------------------------------------------------------------
  {
    toolId: 'soil.properties',
    mcpName: 'soil.survey.properties',
    title: 'Get Soil Properties by Location',
    description:
      'Get USDA SSURGO soil properties for a US location by lat/lon (WGS84). Returns dominant component(s) with depth-stratified horizons including drainage class, taxonomic class, pH, organic matter %, and sand/silt/clay percentages per horizon. Coverage: US continental + Alaska + Hawaii + territories; international/water/unsurveyed points return empty components array. Authoritative source: NRCS Soil Data Access (no auth, unlimited free, US Gov open data)',
    category: 'world',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // Razorpay IFSC — Indian bank branch lookup (UC-425)
  // ---------------------------------------------------------------------------
  {
    toolId: 'razorpayifsc.lookup',
    mcpName: 'razorpay.ifsc.lookup',
    title: 'Razorpay IFSC Bank Lookup',
    description:
      'Look up Indian bank branch details (name, address, IFSC capabilities like UPI/NEFT/RTGS/IMPS) by IFSC code. Free, MIT-licensed open data covering all Indian banks.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // Lichess — Chess platform: profiles, top players, daily puzzle (UC-416)
  // ---------------------------------------------------------------------------
  {
    toolId: 'lichess.user_profile',
    mcpName: 'lichess.user.profile',
    title: 'Lichess User Profile',
    description:
      "Get a Lichess user's profile — username, ratings across variants (bullet/blitz/rapid/classical/correspondence/puzzle), games played, online status, profile bio, country, language.",
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'lichess.top_players',
    mcpName: 'lichess.players.top',
    title: 'Lichess Top Players',
    description:
      'Top N players in a chess variant (bullet, blitz, rapid, classical, ultraBullet, chess960, crazyhouse, antichess, atomic, horde, kingOfTheHill, racingKings, threeCheck). Returns username, rating, country.',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'lichess.daily_puzzle',
    mcpName: 'lichess.puzzle.daily',
    title: 'Lichess Daily Puzzle',
    description:
      "Get today's Lichess daily puzzle — puzzle ID, FEN position, solution moves, theme, rating difficulty.",
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // Chess.com — World's largest chess platform: profiles, stats, titled players (UC-417)
  // ---------------------------------------------------------------------------
  {
    toolId: 'chesscom.player_profile',
    mcpName: 'chesscom.player.profile',
    title: 'Chess.com Player Profile',
    description:
      "Get a Chess.com player's profile — username, country, title (GM/IM/FM), join date, online status, followers, league. Distinct from Lichess: Chess.com is the world's largest chess platform with 100M+ users.",
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'chesscom.player_stats',
    mcpName: 'chesscom.player.stats',
    title: 'Chess.com Player Stats',
    description:
      "Get a Chess.com player's rating + record across all time controls (rapid, blitz, bullet, daily, daily960, tactics, lessons, puzzle_rush). Returns highest rating, current rating, win/loss/draw counts.",
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'chesscom.titled_players',
    mcpName: 'chesscom.players.titled',
    title: 'Chess.com Titled Players List',
    description:
      'List all titled players on Chess.com by title (GM, WGM, IM, WIM, FM, WFM, NM, WNM, CM, WCM). Returns array of usernames.',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // NOAA Aviation Weather Center (AWC) — METAR/TAF/SIGMET aviation weather (UC-422)
  // ---------------------------------------------------------------------------
  {
    toolId: 'awc.metar',
    mcpName: 'aviation.metar.current',
    title: 'Aviation METAR Weather Report',
    description:
      'Current METAR (METeorological Aerodrome Report) for one or more airports — official aviation weather observations (wind, visibility, sky condition, temperature, dewpoint, altimeter, remarks). Updates every 1 hour, more often when conditions change rapidly.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'awc.taf',
    mcpName: 'aviation.taf.forecast',
    title: 'Aviation TAF Terminal Forecast',
    description:
      'TAF (Terminal Aerodrome Forecast) for an airport — aviation forecast valid for next 24-30 hours with wind, visibility, weather phenomena, and sky conditions in 6-hour windows. Updates 4× daily.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'awc.sigmet',
    mcpName: 'aviation.sigmet.alerts',
    title: 'Aviation SIGMET / AIRMET Hazard Alerts',
    description:
      'Active SIGMET (SIGnificant METeorological information) and AIRMET reports — flight safety hazards including thunderstorms, turbulence, icing, volcanic ash, dust storms, mountain obscuration. Used by pilots and dispatchers for go/no-go decisions.',
    category: 'weather',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // UK Food Standards Agency (FSA) — Food Hygiene Rating Scheme (UC-429)
  // ---------------------------------------------------------------------------
  {
    toolId: 'ukfsa.establishment_search',
    mcpName: 'ukfsa.establishments.search',
    title: 'UK FSA Food Business Search',
    description:
      'Search UK food businesses by name, address, postcode, or local authority. Returns the official Food Hygiene Rating Scheme score (0-5), business type, last inspection date, and full address. Covers 500K+ premises across England, Wales, Northern Ireland (Scotland has separate FHIS — pass/improvement required).',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ukfsa.establishment_details',
    mcpName: 'ukfsa.establishments.detail',
    title: 'UK FSA Food Business Details',
    description:
      'Detailed record for one UK food premise by FSA ID — full scheme breakdown (hygiene/structural/management scores), confidence in management score, exact inspection date, local authority code, business type taxonomy.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ukfsa.local_authorities',
    mcpName: 'ukfsa.authorities.list',
    title: 'UK FSA Local Authorities',
    description:
      'List all UK local authorities that participate in the Food Hygiene Rating Scheme (or Scottish FHIS) — name, code, total establishments count, scheme type (FHRS=England/Wales/NI 0-5 rating, FHIS=Scotland pass/improvement).',
    category: 'health',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // GOV.UK Content API — Cabinet Office, 700K+ UK government documents (UC-430)
  // ---------------------------------------------------------------------------
  {
    toolId: 'govuk.search',
    mcpName: 'govuk.content.search',
    title: 'GOV.UK Content Search',
    description:
      'Full-text search across all 700K+ GOV.UK documents — guidance pages, news articles, statistics releases, organisation pages, ministerial pages, statutory instruments. Filter by content type, organisation, topic. Distinct from UK FSA (food ratings only) — this covers ALL government publications.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'govuk.content',
    mcpName: 'govuk.content.fetch',
    title: 'GOV.UK Document Content',
    description:
      'Fetch full content of a GOV.UK page by its base path — title, publication date, organisation, full HTML body (or structured fields per content type), related documents.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'govuk.organisations',
    mcpName: 'govuk.organisations.list',
    title: 'GOV.UK Organisations Directory',
    description:
      'List or search UK government organisations (ministerial departments, executive agencies, NDPBs, public corporations) — name, web URL, parent department, child organisations. 1100+ entries from Cabinet Office to local agencies.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // Statistics Sweden — SCB (UC-431)
  // ---------------------------------------------------------------------------
  {
    toolId: 'scb.catalog',
    mcpName: 'scb.catalog.browse',
    title: 'SCB Sweden Statistics Catalog',
    description:
      "Browse the SCB statistics database tree by path. Top-level categories: BE (population), AM (labour market), HE (households), NR (national accounts), PR (prices/inflation), MI (environment), AA (general), BO (housing), EN (energy), FM (financial markets), HA (trade), JO (agriculture), LE (living conditions). Returns child nodes (subcategories, type=l) or table descriptors at leaf nodes (type=t). Use empty path '' to get top-level. Navigate hierarchically to find tables for scb.table_metadata.",
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'scb.table_metadata',
    mcpName: 'scb.tables.metadata',
    title: 'SCB Sweden Table Metadata',
    description:
      "Get metadata for a specific SCB statistical table — title, dimensions (variables like Region, Alder/age, Kon/sex, Tid/year), valid value codes for each dimension, and latest update timestamp. Use this BEFORE scb.table_query to discover what filter values are accepted. Example path: 'BE/BE0101/BE0101A/BefolkningNy' (Sweden population by region/age/sex/year).",
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'scb.table_query',
    mcpName: 'scb.tables.query',
    title: 'SCB Sweden Table Query',
    description:
      "Run a statistical query against an SCB table — specify dimension filters to slice data by region, age, sex, year, etc. Returns JSON-stat2 format with labeled dimensions and numeric values. Always call scb.table_metadata first to discover valid dimension codes and value codes. Example: Sweden total population (Region='00', filter='vs:RegionRiket99'), latest year (Tid filter='top' values=['1']).",
    category: 'world',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // IRCTC Indian Railways via RapidAPI (UC-426)
  // ---------------------------------------------------------------------------
  {
    toolId: 'irctc.train_search',
    mcpName: 'irctc.trains.search',
    title: 'IRCTC Train Search Between Stations',
    description:
      'Search trains running between two Indian railway stations. Returns train number, name, departure/arrival time, distance, class availability (1A/2A/3A/SL/CC/EC), and running days (Mon-Sun).',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'irctc.train_status',
    mcpName: 'irctc.trains.status',
    title: 'IRCTC Live Train Running Status',
    description:
      'Get live running status of an Indian train for today or a specific date — current station, expected arrival/departure, delay in minutes, distance covered, full station-by-station schedule.',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'irctc.station_search',
    mcpName: 'irctc.stations.search',
    title: 'IRCTC Railway Station Lookup',
    description:
      'Search Indian Railways stations by name or partial code. Returns station code, full name, state. Use this to discover station codes for irctc.train_search/status.',
    category: 'travel',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // NIST National Vulnerability Database (NVD) (UC-413, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'nvd.cve_search',
    mcpName: 'nvd.cves.search',
    title: 'NIST NVD CVE Search',
    description:
      'Search the National Vulnerability Database for CVE records by keyword, vendor, product, CVSS severity, or publication date range. Returns CVE-ID, summary, CVSS v3 base score, severity (LOW/MEDIUM/HIGH/CRITICAL), affected CPE configurations, references. Distinct from OSV: NVD provides canonical NIST records with CVSS v3 scores, CWE weakness types, and CPE configurations.',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nvd.cve_detail',
    mcpName: 'nvd.cves.detail',
    title: 'NIST NVD CVE Detail',
    description:
      'Fetch the canonical NVD record for a specific CVE-ID — full English description, CVSS v3 + v2 vectors and scores, weakness types (CWE), affected CPE configurations with version ranges, and all references with tags. Example: CVE-2021-44228 for Log4Shell.',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nvd.cpe_search',
    mcpName: 'nvd.cpes.search',
    title: 'NIST NVD CPE Product Lookup',
    description:
      'Search the Common Platform Enumeration (CPE) dictionary for product identifiers used by CVEs. Returns CPE 2.3 URI (cpe:2.3:a:vendor:product:version:...), title, deprecation status. Use this to find the exact CPE string before searching CVEs by affected product.',
    category: 'developer',
    annotations: READ_ONLY,
  },

  // USAJOBS — Office of Personnel Management (UC-415, 3 tools)
  {
    toolId: 'usajobs.search',
    mcpName: 'usajobs.jobs.search',
    title: 'USAJOBS Federal Job Search',
    description:
      'Search US federal civil-service job postings — by keyword, location, pay grade (GS-1 to GS-15, SES), agency, position type. Returns position title, agency, location, salary range, grade, open period, application URL. USAJOBS is the ONLY source for US federal civil-service postings, distinct from BLS, ESCO, CareerJet, Adzuna, Reed, Jooble, Arbeitnow, Remotive, and TheirStack.',
    category: 'jobs',
    annotations: READ_ONLY,
  },
  {
    toolId: 'usajobs.position_detail',
    mcpName: 'usajobs.positions.detail',
    title: 'USAJOBS Position Detail',
    description:
      'Get full detail for a specific federal job posting by control number (PositionID) — full description, qualifications, duties, benefits summary, application instructions, security clearance level, telework eligibility.',
    category: 'jobs',
    annotations: READ_ONLY,
  },
  {
    toolId: 'usajobs.code_lists',
    mcpName: 'usajobs.codes.list',
    title: 'USAJOBS Reference Code Lists',
    description:
      'Fetch reference code lists used by USAJOBS — agency codes, pay grades, hiring paths, occupational series, security clearance levels, work schedules. Use to discover valid values for search filters.',
    category: 'jobs',
    annotations: READ_ONLY,
  },

  // NREL — AFDC + PVWatts (UC-414, 4 tools)
  {
    toolId: 'nrel.afdc_stations_nearest',
    mcpName: 'nrel.afdc.nearest',
    title: 'NREL AFDC — Nearest Alt-Fuel Stations',
    description:
      'Find the nearest alternative fuel stations to a given US location (latitude/longitude). Includes EV charging (Level 1/2/DC Fast), CNG, LNG, propane, biodiesel, hydrogen. Returns station name, address, network, plug types, hours, last verified date. US-specific; for global EV stations use openchargemap.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nrel.afdc_stations_search',
    mcpName: 'nrel.afdc.search',
    title: 'NREL AFDC — Alt-Fuel Stations Search',
    description:
      'Search US alt-fuel stations by ZIP, state, or city. Filterable by fuel type, EV network, connector type, and access level. Use for state-level analytics or city-wide EV infrastructure surveys; use afdc_stations_nearest for proximity search to a coordinate.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nrel.afdc_station_detail',
    mcpName: 'nrel.afdc.detail',
    title: 'NREL AFDC — Station Detail',
    description:
      'Get detailed record for one specific alt-fuel station by its AFDC station ID — operator info, full address, hours per day-of-week, EV charging speed breakdown (Level 1/2/DC Fast outlet counts), accepted payment methods, access restrictions.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nrel.pvwatts_estimate',
    mcpName: 'nrel.pvwatts.estimate',
    title: 'NREL PVWatts Solar PV Production Estimate',
    description:
      'Calculate monthly and annual AC energy production (kWh) for a residential or commercial solar PV system at any global location. Uses NSRDB satellite-derived solar resource data. Returns monthly AC/DC energy, capacity factor, plane-of-array irradiance, and solar radiation. Unique — no other tool in this catalog estimates solar PV output.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // CheckWX Aviation Weather (UC-423, 3 tools)
  {
    toolId: 'checkwx.metar_decoded',
    mcpName: 'checkwx.metar.decoded',
    title: 'CheckWX Decoded METAR',
    description:
      'Get current METAR for one or more airports as fully decoded JSON — wind (direction/speed/gust as separate fields), visibility (in SM and meters), sky conditions (cloud coverage + altitude as objects), temperature/dewpoint (°C and °F), altimeter (inHg and hPa), flight category (VFR/MVFR/IFR/LIFR). Saves agents from parsing raw METAR text.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'checkwx.taf_decoded',
    mcpName: 'checkwx.taf.decoded',
    title: 'CheckWX Decoded TAF',
    description:
      'Decoded TAF forecast for airports — issued time, valid window, per-period forecast objects (wind, visibility, weather conditions, sky). Each forecast change block parsed into structured JSON.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'checkwx.station_info',
    mcpName: 'checkwx.stations.info',
    title: 'CheckWX Station Information',
    description:
      'Airport/weather-station metadata by ICAO — name, IATA, latitude/longitude/elevation, country, city, time zone, runway info (count, longest length, surface).',
    category: 'weather',
    annotations: READ_ONLY,
  },

  // OpenDota — Dota 2 statistics (UC-418, 4 tools)
  {
    toolId: 'opendota.player_summary',
    mcpName: 'opendota.players.summary',
    title: 'OpenDota Player Summary',
    description:
      "Get a Dota 2 player's profile + summary stats by Steam Account ID — name, avatar, MMR estimate, total wins/losses, rank tier, last match time. Profile may be private (returns minimal info).",
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'opendota.player_matches',
    mcpName: 'opendota.players.matches',
    title: 'OpenDota Player Match History',
    description:
      'Recent match history for a Dota 2 player — array of matches with match_id, hero, kills/deaths/assists, duration, win/loss, party_size, game_mode, lobby_type. Sortable by date.',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'opendota.match_detail',
    mcpName: 'opendota.matches.detail',
    title: 'OpenDota Match Detail',
    description:
      'Full detail of one Dota 2 match — all 10 players with hero, items, K/D/A, gold/XP per minute, ability picks, team composition, game duration, winner. Heavy parse but rich data.',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'opendota.pro_teams',
    mcpName: 'opendota.proteams.list',
    title: 'OpenDota Pro Teams',
    description:
      'List professional Dota 2 teams with rating, wins/losses, last match time, logo URL, team_id, sponsor. Sorted by rating descending.',
    category: 'entertainment',
    annotations: READ_ONLY,
  },

  // AVWX Aviation Weather (UC-424, 3 tools)
  {
    toolId: 'avwx.notams',
    mcpName: 'avwx.notams.list',
    title: 'AVWX Parsed NOTAMs',
    description:
      'Active NOTAMs (Notice to Airmen) for one or more airports, parsed into structured fields — NOTAM ID, classification (FDC/D/U), type (runway closure, navaid out, airspace restriction, obstacle), effective period, summary text. Critical for flight planning. UNIQUE to AVWX — NOAA and CheckWX do NOT return parsed NOTAMs.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'avwx.pireps',
    mcpName: 'avwx.pireps.list',
    title: 'AVWX Parsed PIREPs',
    description:
      'Pilot Reports (PIREPs) near an airport, parsed — aircraft type, altitude, time, location, sky condition observed, turbulence, icing, weather. Source: pilots reporting in-flight conditions. Useful for hazard awareness.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'avwx.station_summary',
    mcpName: 'avwx.stations.summary',
    title: 'AVWX Station Summary',
    description:
      'Composite report for one airport — latest parsed METAR + TAF + station info (name, lat/lon/elev, type) in one call. Cheaper than three separate calls if you need the full picture.',
    category: 'weather',
    annotations: READ_ONLY,
  },

  // NIH Reporter (4) — UC-454
  {
    toolId: 'nihreporter.projects.search',
    mcpName: 'nihreporter.projects.search',
    title: 'NIH Grant Search',
    description:
      'Search NIH-funded research projects by keyword, disease, drug, or technique. Returns up to 25 grants per call with PI names, institution, award amount, fiscal year, activity code (R01/U54/F32/etc.), abstract excerpt, and a URL to the full project on reporter.nih.gov. Filter by NIH institute/agency (e.g. NCI, NIDDK, NIAID, NIMH) and fiscal year. Sorted by award amount descending.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nihreporter.projects.by_org',
    mcpName: 'nihreporter.projects.by_org',
    title: 'NIH Grants by Institution',
    description:
      'Find all NIH research grants awarded to a specific university, hospital, or research institute. Provide the institution name (partial uppercase match supported, e.g. "JOHNS HOPKINS", "MAYO CLINIC", "MIT"). Optionally filter by fiscal year or active status. Returns award amount, PI, title, and activity code.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nihreporter.projects.by_pi',
    mcpName: 'nihreporter.projects.by_pi',
    title: 'NIH Grants by Principal Investigator',
    description:
      "Find NIH-funded research projects by principal investigator (PI) last name. Optionally narrow by first name, fiscal year, or active status. Returns the researcher's funded projects with award amounts, institutions, titles, and abstract excerpts. Useful for biosketches, grant history lookups, and conflict-of-interest checks.",
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nihreporter.publications.by_project',
    mcpName: 'nihreporter.publications.by_project',
    title: 'NIH Grant Publications',
    description:
      'Retrieve PubMed IDs (PMIDs) of publications linked to a specific NIH core project number (e.g. "R01CA123456"). Returns up to 100 PMIDs per call with direct PubMed URLs. Use the core_project_num field from nihreporter.projects.search results. Chain with education.pubmed_search to fetch full titles and abstracts.',
    category: 'health',
    annotations: READ_ONLY,
  },
  // FCC Open Data (4) — UC-455
  {
    toolId: 'fcc.geo.block_fips',
    mcpName: 'fcc.geo.block_fips',
    title: 'FCC Census Block FIPS Lookup',
    description:
      'Look up the US Census Block FIPS code, county FIPS, and state for any US latitude/longitude coordinate using the FCC Census Block API. Returns the 15-digit Block FIPS (state + county + tract + block), bounding box, county name, and state code. Useful for determining which regulatory jurisdiction, broadband program, or census reporting area a location falls within. No API key required.',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'fcc.regulatory.proceedings',
    mcpName: 'fcc.regulatory.search_proceedings',
    title: 'FCC Regulatory Proceedings Search',
    description:
      'Search FCC regulatory proceedings and rulemaking dockets from the Electronic Comment Filing System (ECFS). Returns docket numbers, descriptions, bureaus, filing counts, and dates. Use to research telecom regulatory actions on topics like net neutrality, spectrum allocation, broadband deployment, and consumer protection. Filter by bureau (WC, MB, WTB, OET) or keyword.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'fcc.regulatory.filings',
    mcpName: 'fcc.regulatory.search_filings',
    title: 'FCC Regulatory Filings Search',
    description:
      'Search FCC regulatory filings, public comments, and orders within ECFS proceedings. Returns filer names, law firms, submission types, document links, and dates. Use to find public comments on FCC rules, industry petitions, and official orders. Filter by docket number (e.g. "17-108" for Restoring Internet Freedom, "22-461" for broadband) or browse recent filings.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'fcc.regulatory.proceeding_detail',
    mcpName: 'fcc.regulatory.proceeding_detail',
    title: 'FCC Proceeding Detail',
    description:
      'Get full details of a specific FCC proceeding by docket number from ECFS. Returns the description, bureau, type (Rulemaking vs Docket), open/closed status, filing count, and all key dates (created, NPRM, public notice). Use after fcc.regulatory.search_proceedings to get full details of a specific docket.',
    category: 'legal',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // NASA Exoplanet Archive (UC-456, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'nasaexoplanet.search',
    mcpName: 'nasaexoplanet.planets.search',
    title: 'Search Exoplanets',
    description:
      'Search NASA Exoplanet Archive for confirmed exoplanets by name, host star, discovery method, year range, radius, or mass. Returns orbital period, radius, mass, equilibrium temperature, discovery year and facility, and system distance. 6,298+ confirmed planets from Transit, Radial Velocity, Imaging, and Microlensing surveys (NASA Exoplanet Archive).',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nasaexoplanet.planet_detail',
    mcpName: 'nasaexoplanet.planets.detail',
    title: 'Exoplanet Detail',
    description:
      'Get full parameters for a specific exoplanet by exact name from NASA Exoplanet Archive. Returns orbital period, radius, mass, equilibrium temperature, insolation flux, semi-major axis, host star spectral type and temperature, sky coordinates (RA/Dec), and last parameter update date. Example planets: "HD 209458 b", "TRAPPIST-1 e", "Kepler-452 b" (NASA Exoplanet Archive).',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nasaexoplanet.habitable',
    mcpName: 'nasaexoplanet.planets.habitable',
    title: 'Habitable Zone Candidates',
    description:
      'Find potentially habitable exoplanets in the conservative habitable zone — planets with Earth-like radius (0.5–2.0 R⊕) and equilibrium temperature suitable for liquid water (180–310 K). Sorted by radius ascending. Returns radius, mass, orbital period, equilibrium temperature, insolation flux, and host star details. Customisable temperature and radius bounds for optimistic or strict filtering (NASA Exoplanet Archive — pscomppars table).',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nasaexoplanet.stats',
    mcpName: 'nasaexoplanet.planets.stats',
    title: 'Exoplanet Discovery Statistics',
    description:
      'Get discovery statistics for confirmed exoplanets aggregated by method, year, or facility. Group by "method" to see Transit vs Radial Velocity vs Imaging counts, "year" for annual discovery trends since 1988, or "facility" to rank observatories and missions (Kepler, TESS, Keck, etc.) by total discoveries (NASA Exoplanet Archive).',
    category: 'space',
    annotations: READ_ONLY,
  },
  // UN SDG API (5) — UC-457
  {
    toolId: 'unsdg.goals.list',
    mcpName: 'unsdg.goals.list',
    title: 'UN SDG Goals',
    description:
      'List all 17 UN Sustainable Development Goals (SDGs) with their official titles and full descriptions. Covers the complete 2030 Agenda: No Poverty, Zero Hunger, Good Health, Quality Education, Gender Equality, Clean Water, Clean Energy, Decent Work, Industry & Innovation, Reduced Inequalities, Sustainable Cities, Responsible Consumption, Climate Action, Life Below Water, Life on Land, Peace & Justice, and Partnerships. Use goal codes (1–17) as inputs to unsdg.targets.list and unsdg.indicators.list.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'unsdg.targets.list',
    mcpName: 'unsdg.targets.list',
    title: 'UN SDG Targets',
    description:
      'List all 169 UN SDG targets with their official descriptions. Optionally filter by goal number (1–17) to get only the targets for that goal. Each target has a code like "1.1", "3.3", or "13.2" that identifies it uniquely. Use target codes with unsdg.indicators.list to drill into specific measurement indicators.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'unsdg.indicators.list',
    mcpName: 'unsdg.indicators.list',
    title: 'UN SDG Indicators',
    description:
      'List UN SDG monitoring indicators with their series codes, tier classifications (Tier I = established methodology, Tier II = methodology in development, Tier III = no agreed methodology), and associated data series codes. Optionally filter by goal (1–17) or target (e.g. "3.3"). Series codes (e.g. "SI_POV_DAY1", "SH_STA_MORT") are the inputs to unsdg.data.query for fetching actual country-level time series data.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'unsdg.data.query',
    mcpName: 'unsdg.data.query',
    title: 'UN SDG Data Query',
    description:
      'Query UN SDG time-series indicator data by series code. Returns country-level or regional annual measurements for indicators like poverty rates, maternal mortality, CO2 emissions, literacy rates, and more. Filter by UN M49 geo area code (e.g. "356" for India, "840" for USA) and/or year range. Each record includes the geo area, year, value, source, and any disaggregation dimensions (age, sex, urbanization). Get series codes from unsdg.indicators.list; get geo area codes from unsdg.geo.countries.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'unsdg.geo.countries',
    mcpName: 'unsdg.geo.countries',
    title: 'UN SDG Geo Areas',
    description:
      'List all 460 countries, territories, and world regions available in the UN SDG database using UN M49 numeric codes. Includes individual countries (e.g. India = 356, USA = 840, Brazil = 76) as well as aggregate regions (e.g. Africa = 2, Asia = 142, Latin America = 419, Least Developed Countries = 199). Use these geo area codes with unsdg.data.query to filter data by location.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // DataCite (4) — UC-458
  {
    toolId: 'datacite.doi.search',
    mcpName: 'datacite.doi.search',
    title: 'DataCite DOI Search',
    description:
      'Search 70M+ DataCite-registered DOIs for research outputs: datasets, software, preprints, journal articles, dissertations, and more. Filter by keyword, resource type (dataset/software/preprint/etc.), publication year, repository (Zenodo, Figshare, Dryad), or funder. Returns normalized metadata including title, creators, publisher, year, abstract, license, subjects, and usage metrics (views, downloads, citations). Results include facets for resource types and top providers. DataCite covers outputs from 3,500+ repositories worldwide including arXiv, Zenodo, Mendeley Data, and IEEE DataPort.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'datacite.doi.lookup',
    mcpName: 'datacite.doi.lookup',
    title: 'DataCite DOI Lookup',
    description:
      'Get full metadata for a specific DataCite DOI. Returns the complete scholarly metadata record: title, all creators with ORCID identifiers and affiliations, publisher, publication year, resource type, abstract, subjects, license, funding references (funder name, award number), related identifiers, language, formats, usage metrics (views, downloads, citations), and registration/update timestamps. Accepts bare DOI (e.g. "10.5281/zenodo.3490396") or full URL form. Most Zenodo, Dryad, Figshare, and institutional repository DOIs are registered with DataCite.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'datacite.works.stats',
    mcpName: 'datacite.works.stats',
    title: 'DataCite Works Statistics',
    description:
      'Get aggregated statistics across DataCite research outputs. Returns total DOI count, breakdown by resource type (datasets 70M+, software, preprints, journal articles, dissertations), registration year distribution, top contributing organizations (arXiv, CERN/Zenodo, Figshare, Mendeley), and top repositories. Optionally scope to a keyword query or specific resource type/year to get focused analytics. Useful for understanding the research landscape in a topic area — e.g. how many climate datasets exist, which repositories host the most neuroscience data.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'datacite.client.search',
    mcpName: 'datacite.client.search',
    title: 'DataCite Repository Search',
    description:
      'Search the 3,500+ DataCite member repositories (called "clients") by name or keyword. Returns repository ID, name, symbol (short code like "cern.zenodo"), description, URL, and total DOI count. Repository IDs can be used with datacite.doi.search to filter results to a specific repository. Examples: Zenodo (cern.zenodo, 150K+ DOIs), figshare (figshare.ars, 42K+ DOIs), Mendeley Data (bl.mendeley, 10K+ DOIs), IEEE DataPort (ieee.dataport, 5K+ DOIs), Open Science Framework (cos.osf, 4K+ DOIs).',
    category: 'education',
    annotations: READ_ONLY,
  },

  // Statistics Norway / SSB (4) — UC-459
  {
    toolId: 'ssbnorway.search',
    mcpName: 'ssbnorway.data.search',
    title: 'SSB Norway Table Search',
    description:
      'Search 300K+ Statistics Norway (SSB) statistical tables by keyword. Returns matching table IDs, full titles, subject paths, relevance scores, and publication dates. SSB is the Norwegian national statistics authority and covers population, GDP, employment, prices, energy, immigration, health, education, trade, and more. Use the returned table ID with ssbnorway.data.metadata to discover dimension codes, then ssbnorway.data.query to fetch data. Example keywords: "population", "gdp", "unemployment", "cpi inflation", "exports", "immigration", "energy", "housing prices", "fertility".',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ssbnorway.metadata',
    mcpName: 'ssbnorway.data.metadata',
    title: 'SSB Norway Table Metadata',
    description:
      'Get the full metadata for a specific SSB table — dimension codes, valid value codes, and human-readable labels needed to construct a data query. Returns table title, last-updated timestamp, and an array of variables (dimensions) each with its code (e.g. "Region"), readable name, list of valid value codes, and corresponding labels. This is the required second step before querying data: call ssbnorway.data.search to find a table ID, then ssbnorway.data.metadata to learn the dimension codes and valid values, then ssbnorway.data.query to retrieve actual data. Common table IDs: "07459" (population by region/sex/age/year), "09842" (GDP per capita), "05111" (labour force), "03013" (CPI).',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ssbnorway.query',
    mcpName: 'ssbnorway.data.query',
    title: 'SSB Norway Table Data',
    description:
      'Fetch statistical data from a specific SSB Norway table using dimension filters. Returns a JSON-stat2 dataset with dimension labels, value arrays, and metadata (updated timestamp, source, notes). Use ssbnorway.data.search to find the table ID, ssbnorway.data.metadata to get valid dimension codes and values, then pass them here as a query array. Each filter specifies a dimension code and selected values. Use filter="item" with specific value codes to select rows, filter="top" with count to get the N most recent years. Unfiltered dimensions with elimination=true are aggregated into totals. Covers 1,900+ statistical domains across Norway.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ssbnorway.population',
    mcpName: 'ssbnorway.stats.population',
    title: 'SSB Norway Population Statistics',
    description:
      'Get Norwegian population statistics from the official SSB population register (table 07459). Returns total resident population by year as a JSON-stat2 dataset. Covers Norway as a whole (region_code="0") or any county/municipality by region code. Data goes back to 1986 and is updated annually (reference date January 1st each year). Region codes: "0" = whole country, "03" = Oslo, "11" = Rogaland, "15" = Møre og Romsdal, "18" = Nordland, "46" = Vestland, "50" = Trøndelag. Use ssbnorway.data.metadata on table 07459 to get all 994 municipality-level region codes. This is a simplified shortcut — for sex/age breakdowns use ssbnorway.data.query with table 07459 and the Kjonn/Alder dimension codes from ssbnorway.data.metadata.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // Statistics Denmark / StatBank (4) — UC-594
  {
    toolId: 'statistics-denmark.subjects',
    mcpName: 'statistics-denmark.data.subjects',
    title: 'Statistics Denmark Subject Areas',
    description:
      'List the subject/topic areas covered by Statistics Denmark (StatBank) — People, Labour and income, Economy, Social conditions, Education and research, Business, Transport, Culture and leisure, Environment and energy, About Statistics Denmark. Set recursive=true to drill down into the full nested topic tree (e.g. People → Population → Population figures) used to browse toward specific tables. Statistics Denmark (Danmarks Statistik) is the Danish national statistics authority.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'statistics-denmark.tables',
    mcpName: 'statistics-denmark.data.tables',
    title: 'Statistics Denmark Table Search',
    description:
      'Search or list Statistics Denmark (StatBank) statistical tables by keyword and/or subject area. Returns matching table IDs, full titles, measurement unit, last-updated timestamp, first/latest available period, and the dimension names each table can be broken down by. Use the returned table ID with statistics-denmark.data.table_info to discover dimension codes, then statistics-denmark.data.query to fetch data. Example keywords: "population", "gdp", "unemployment", "inflation", "immigration", "housing", "energy", "crime", "wages", "trade".',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'statistics-denmark.table_info',
    mcpName: 'statistics-denmark.data.table_info',
    title: 'Statistics Denmark Table Metadata',
    description:
      'Get the full metadata for a specific Statistics Denmark table — dimension codes, valid value codes, and human-readable labels needed to construct a data query. Returns table title, description, unit, last-updated timestamp, and an array of variables (dimensions) each with its code (e.g. "OMRÅDE" for region), readable name, and the list of valid value codes with labels. This is the required second step before querying data: call statistics-denmark.data.tables to find a table ID, then statistics-denmark.data.table_info to learn the dimension codes and valid values, then statistics-denmark.data.query to retrieve actual data. Common table IDs: "FOLK1A" (quarterly population by region/sex/age/marital status), "BEFOLK1" (annual population by sex/age since 1971), "AKU1" (labour force survey), "NAN1" (GDP and national accounts), "PRIS111" (consumer price index).',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'statistics-denmark.data',
    mcpName: 'statistics-denmark.data.query',
    title: 'Statistics Denmark Table Data',
    description:
      'Fetch statistical data from a specific Statistics Denmark table using dimension filters. Returns a JSON-stat dataset with dimension labels, a flat value array, and metadata (updated timestamp, source). Use statistics-denmark.data.tables to find the table ID, statistics-denmark.data.table_info to get valid dimension codes and values, then pass them here as a variables array — one entry per dimension you want to filter or break out by (e.g. region, sex, age, time). Any dimension left out is auto-aggregated to its total by StatBank. Use values:["*"] to include all values for a dimension (e.g. the full time series). Covers population, labour market, economy, social conditions, education, business, transport, culture, and environment statistics for Denmark.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // Overpass API (4)
  {
    toolId: 'overpass.amenities',
    mcpName: 'overpass.search.amenities',
    title: 'Find OSM Amenities in Bounding Box',
    description:
      'Search OpenStreetMap (OSM) for amenities of a specific type within a geographic bounding box. Returns name, coordinates, address, phone, website, and opening hours for each result. Covers restaurants, cafes, bars, banks, ATMs, pharmacies, hospitals, schools, universities, fuel stations, parking lots, hotels, supermarkets, post offices, police stations, cinemas, museums, and more. Data sourced from the global OpenStreetMap database via Overpass API — no authentication required. Ideal for finding local services near a point of interest.',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'overpass.pois_nearby',
    mcpName: 'overpass.search.nearby',
    title: 'Find POIs Near a Coordinate',
    description:
      'Find OpenStreetMap points of interest within a configurable radius (up to 5 km) around a latitude/longitude coordinate. Optionally filter by amenity type (e.g. "cafe", "atm", "pharmacy"). Without a filter, returns all amenities, tourism features, and shops in the area. Results include name, coordinates, address details, phone, website, and opening hours. Useful for answering "what is near me?" or "what restaurants are within 500 m of this hotel?". Data sourced from Overpass API (OpenStreetMap).',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'overpass.named_place',
    mcpName: 'overpass.search.named',
    title: 'Search Named Places and Landmarks',
    description:
      'Search OpenStreetMap for named geographic features — streets, parks, landmarks, rivers, mountains, districts, or any named OSM element — by partial name (case-insensitive). Optionally constrain results to a bounding box. Filter by element type: node (point features like fountains, statues), way (roads, paths, area outlines), relation (complex features like national parks, city boundaries), or all. Returns name, coordinates or centroid, place type, and all OSM tags. Useful for locating specific landmarks or verifying a place exists in a region.',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'overpass.public_transport',
    mcpName: 'overpass.search.transit',
    title: 'Find Public Transport Stops',
    description:
      'Find public transport infrastructure within a geographic bounding box. Supports bus stops, railway stations, subway/metro stations, tram stops, and ferry terminals. Returns stop name, transport type, coordinates, network/operator name, route reference, and wheelchair accessibility. Filter by transport type or fetch all transit infrastructure in the area. Data sourced from OpenStreetMap via Overpass API — especially comprehensive for European cities. Useful for trip planning, accessibility analysis, and finding the nearest metro or train station.',
    category: 'location',
    annotations: READ_ONLY,
  },

  // Zenodo (4) — UC-461
  {
    toolId: 'zenodo.search',
    mcpName: 'zenodo.records.search',
    title: 'Search Zenodo Research Records',
    description:
      'Search 3.5M+ open-access research outputs on Zenodo — publications, datasets, software, presentations, posters, videos, and more. Filter by type, access right (open/embargoed/restricted), and publication date range. Sort by relevance, recency, most-viewed, or most-downloaded. Each result includes DOI, title, creators, resource type, access right, keywords, view/download stats, and a direct URL. Zenodo is operated by CERN under the OpenAIRE program and hosts research from EU-funded projects, science institutions worldwide, and individual researchers. All metadata is CC0.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'zenodo.record',
    mcpName: 'zenodo.records.detail',
    title: 'Get Zenodo Record Details',
    description:
      'Get full metadata for a specific Zenodo research record by its numeric record ID. Returns title, DOI, creators with affiliations and ORCID, publication date, resource type, abstract/description, keywords, license, access right, related communities, file count, download and view statistics, and a link to the Zenodo page. Use zenodo.records.search to find record IDs, or extract the ID from a DOI like "10.5281/zenodo.10487285" → ID is 10487285. To list downloadable files, follow up with zenodo.records.files.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'zenodo.files',
    mcpName: 'zenodo.records.files',
    title: 'List Zenodo Record Files',
    description:
      'List all downloadable files for a Zenodo record. Returns filename, MIME type, size in bytes, checksum (MD5), and a direct download URL for each file. Zenodo records can contain multiple files (data CSVs, code archives, supplementary PDFs, images, etc.). Use zenodo.records.search or zenodo.records.detail to find the record ID, then call this tool to get the file manifest with direct download links. All files in open-access records are freely downloadable without authentication.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'zenodo.communities',
    mcpName: 'zenodo.communities.search',
    title: 'Search Zenodo Communities',
    description:
      'Search Zenodo communities — curated subject-specific collections maintained by researchers and institutions. Communities group related records by discipline, project, or institution (e.g. "astronomy", "bioinformatics", "EU Horizon projects", "CERN data"). Returns community ID, title, description, and URL. Each community has a dedicated landing page on Zenodo with all its member records. Use the community ID with the Zenodo website to browse records within a specific collection. Zenodo currently hosts 5,000+ communities covering all scientific disciplines.',
    category: 'education',
    annotations: READ_ONLY,
  },

  // NASA Technical Reports Server — NTRS (4) — UC-474
  {
    toolId: 'nasantrs.search',
    mcpName: 'nasantrs.reports.search',
    title: 'Search NASA Technical Reports',
    description:
      'Full-text search across 645,000+ NASA technical reports, conference papers, contractor reports, presentations, and memoranda spanning 1915 to present. Filter by NASA center (JPL, GSFC, JSC, MSFC, LaRC, ARC, GRC, KSC) and sort by relevance or date. Returns title, abstract, authors with affiliations, document type, publication date, subject categories, keywords, and direct PDF download URLs. Covers aeronautics, space exploration, Earth science, astrophysics, propulsion, materials science, robotics, and all NASA research domains. Free and open access — US Government public domain.',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nasantrs.report',
    mcpName: 'nasantrs.reports.detail',
    title: 'Get NASA Technical Report Details',
    description:
      'Get the full citation and metadata for a specific NASA technical report by its numeric NTRS ID. Returns complete record: title, full abstract, all authors with organizational affiliations, document type, NASA center, publication and submission dates, subject categories, keywords, report numbers, and direct PDF/fulltext download URLs. Use nasantrs.reports.search or nasantrs.reports.recent to find NTRS IDs, or extract the ID from the URL at ntrs.nasa.gov/citations/{id}. PDF download links point directly to the NASA server — freely accessible without authentication.',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nasantrs.recent',
    mcpName: 'nasantrs.reports.recent',
    title: 'Get Recent NASA Technical Reports',
    description:
      'Retrieve the most recently published NASA technical reports, sorted by public release date (newest first). Optionally filter by NASA center to monitor new publications from JPL, GSFC, JSC, MSFC, LaRC, ARC, GRC, or KSC. Returns title, release date, NASA center, document type, and NTRS ID for each report. Useful for tracking the latest NASA research across any discipline — space exploration, aeronautics, Earth science, technology development, and more. All documents are open access under US Government public domain.',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nasantrs.stats',
    mcpName: 'nasantrs.reports.stats',
    title: 'Get NASA Technical Reports Corpus Statistics',
    description:
      "Get aggregate statistics for the entire NASA Technical Reports Server corpus. Returns total document count (645,000+) and breakdowns by: document type (conference paper, contractor report, technical memorandum, presentation, reprint, etc.), subject category (astrophysics, aerodynamics, geophysics, propulsion, etc.), and NASA center (JPL, GSFC, LaRC, MSFC, ARC, JSC, etc.). Also returns the top research keywords across the corpus. Useful for understanding the scope and distribution of NASA's documented research output.",
    category: 'space',
    annotations: READ_ONLY,
  },

  // CERN Open Data (4)
  {
    toolId: 'cernopendata.search',
    mcpName: 'cernopendata.records.search',
    title: 'CERN Open Data Search',
    description:
      'Search 80,000+ particle physics records from the CERN Open Data portal, covering CMS, ATLAS, ALICE, LHCb, and legacy experiments. Filter by record type (Dataset, Documentation, Software, Supplementaries), experiment, and keyword. Each record includes title, type, experiment, publication date, availability, collision energy, abstract snippet, and collections. Supports pagination. Free, no auth required. Records include collision and simulated datasets in NanoAOD/MiniAOD/AOD format, plus educational resources, software, and documentation from the Large Hadron Collider era.',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cernopendata.detail',
    mcpName: 'cernopendata.records.detail',
    title: 'CERN Open Data Record Detail',
    description:
      'Fetch full metadata for a specific CERN Open Data record by its ID. Returns complete details: title, type, experiment, publication date, abstract (HTML stripped), collections, availability, collision energy and type, accelerator, authors with ORCIDs, file listing (up to 5 files with sizes and EOS URIs), keywords, license, run period, and external links. Use cernopendata.records.search or cernopendata.datasets.browse to discover record IDs. IDs can be numeric (e.g. "5209") or string anchors for glossary terms (e.g. "AOD"). Most datasets are CC0 or CC-BY licensed.',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cernopendata.datasets',
    mcpName: 'cernopendata.datasets.browse',
    title: 'CERN Open Data Datasets Browser',
    description:
      'Browse and filter CERN Open Data collision and simulated datasets by experiment, publication year, collision energy, and keyword. Returns only records of type Dataset (66,000+ datasets). Useful for finding specific NanoAOD or MiniAOD simulation samples, real collision data, or derived datasets for a given LHC run period. LHC Run 1 data: 2010–2012 at 7–8 TeV; Run 2 data: 2015–2016 at 13 TeV. Experiments: CMS (57K+), ALICE (171), ATLAS (184), LHCb (7K+), DELPHI (12K+). Supports pagination for large result sets.',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cernopendata.glossary',
    mcpName: 'cernopendata.glossary.lookup',
    title: 'CERN HEP Physics Glossary',
    description:
      'Look up particle physics and high-energy physics (HEP) terms from the CERN Open Data glossary of 1,000+ terms. Returns matching entries with the term name, all known aliases/synonyms, a plain-text definition, category (generic, cms, etc.), related terms (see_also), and Wikipedia/external links. Ideal for AI agents that need to explain or understand HEP concepts like "quark", "hadron", "luminosity", "trigger", "AOD", "CMSSW", "jet", "b-tagging", or any other particle physics terminology.',
    category: 'space',
    annotations: READ_ONLY,
  },

  // CelesTrak GP (4)
  {
    toolId: 'celestrak.tle',
    mcpName: 'celestrak.satellite.tle',
    title: 'Get Satellite Orbital Elements by NORAD ID',
    description:
      'Retrieve the current Two-Line Element (TLE) orbital data for a specific satellite using its NORAD catalog number. Returns the full GP (General Perturbations) element set: epoch, inclination, RAAN, eccentricity, argument of perigee, mean anomaly, mean motion (revolutions/day), B* drag coefficient, and computed orbital period in minutes. Data is sourced from the US Space Force 18th Space Control Squadron via CelesTrak. Useful for orbital mechanics calculations, satellite pass predictions, and tracking any of the 27,000+ catalogued space objects. Popular NORAD IDs: 25544 (ISS), 20580 (Hubble), 33591 (NOAA-18).',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'celestrak.search',
    mcpName: 'celestrak.satellite.search',
    title: 'Search Satellites by Name',
    description:
      'Search the NORAD satellite catalog by name substring (case-insensitive). Returns all satellites whose name contains the query string, each with NORAD catalog number, international designator (COSPAR ID), epoch, and full orbital element set. Useful for finding the NORAD IDs and TLEs of satellites by operator or mission name (e.g. "STARLINK" returns all ~6000 Starlink satellites, "NOAA" returns NOAA weather sats, "GPS" returns GPS block satellites, "FENGYUN" returns Chinese weather satellites, "ISS" returns ISS modules). Data from US Space Force via CelesTrak, no auth required.',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'celestrak.group',
    mcpName: 'celestrak.satellite.group',
    title: 'Get Satellite Group Orbital Elements',
    description:
      'Retrieve TLE orbital element sets for an entire predefined satellite group from CelesTrak. Returns all satellites in the group with NORAD catalog number, international designator, epoch, and full orbital parameters. Supported groups: "stations" (ISS, CSS, Tiangong), "starlink" (SpaceX constellation ~6000 sats), "active" (all active satellites ~7000), "gps-ops" (GPS operational), "glo-ops" (GLONASS), "galileo" (EU), "beidou" (Chinese), "weather" (all weather satellites), "noaa" (NOAA series), "goes" (GOES geostationary weather), "geo" (all geostationary), "amateur" (amateur radio), "cubesat" (CubeSats), "last-30-days" (recent launches), "iridium", "iridium-NEXT", "globalstar", "orbcomm", "oneweb", "intelsat", "ses", "planet", "spire". Data from US Space Force, no auth required.',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'celestrak.intdes',
    mcpName: 'celestrak.satellite.intdes',
    title: 'Get Satellite by International Designator',
    description:
      'Look up satellite orbital elements using the international designator (COSPAR ID / Harvard designation). Returns orbital element sets for all objects associated with the designator: primary payload (suffix A), rocket body (B), and debris fragments (C onward). Format is YYYY-NNNX where YYYY=launch year, NNN=launch number of year (zero-padded to 3 digits), X=piece letter. Examples: "1998-067A" (ISS ZARYA module launched 1998, 67th launch, primary payload), "1990-037B" (Hubble Space Telescope), "2019-029B" (Starlink batch 1 rocket body). Useful when you know the mission designator but not the NORAD catalog number. Data from US Space Force via CelesTrak.',
    category: 'space',
    annotations: READ_ONLY,
  },

  // NASA EONET v3 (4)
  {
    toolId: 'eonet.events',
    mcpName: 'eonet.events.list',
    title: 'List Natural Disaster Events',
    description:
      'Retrieve natural disaster and extreme weather events tracked by NASA Earth Observatory Natural Event Tracker (EONET). Returns events with geolocation, magnitude, data sources, and category. Supports filtering by status (open=ongoing, closed=resolved), event category (wildfires, severeStorms, volcanoes, earthquakes, floods, etc.), date range, data source, bounding box, and result count. Each event includes one or more geometry points with coordinates and timestamps. Ideal for real-time situational awareness, disaster monitoring, and geospatial analysis. Data sourced from GDACS, JTWC, USGS, IRWIN, FIRMS and 10+ other agencies. No auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'eonet.event_detail',
    mcpName: 'eonet.events.detail',
    title: 'Get Natural Event Detail',
    description:
      'Retrieve the full detail record for a specific NASA EONET natural disaster event by its EONET event ID (e.g. "EONET_20606"). Returns all geometry points (coordinates, magnitude, timestamps) for the entire event lifecycle, associated categories, and primary data source URLs. Useful for tracking the full track of a hurricane, the spread of a wildfire, or the progression of a flood. Obtain EONET IDs from the eonet.events.list tool.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'eonet.categories',
    mcpName: 'eonet.events.categories',
    title: 'List EONET Event Categories',
    description:
      'List all available natural event categories in the NASA EONET system with their IDs, titles, and descriptions. Returns all 13 categories: drought, dustHaze, earthquakes, floods, landslides, manmade, seaLakeIce, severeStorms, snow, tempExtremes, volcanoes, waterColor, wildfires. Use category IDs as the "category" filter in eonet.events.list and as the "category_id" parameter in eonet.events.layers. No auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'eonet.layers',
    mcpName: 'eonet.events.layers',
    title: 'Get EONET GIS Visualization Layers',
    description:
      'Retrieve GIS web service layers available for a specific EONET event category. Returns WMTS/WMS layer configurations from NASA GIBS (Global Imagery Browse Services) that can be used to visualize satellite imagery relevant to the event type (e.g. fire radiative power for wildfires, aerosol optical depth for dust/haze, sea surface temperature for storms). Each layer includes service URL, tile matrix set, and image format for integration with mapping tools like Leaflet, OpenLayers, or QGIS. Pass a category ID from eonet.events.categories.',
    category: 'world',
    annotations: READ_ONLY,
  },
  // RxNorm (4)
  {
    toolId: 'rxnorm.drug_search',
    mcpName: 'rxnorm.drugs.search',
    title: 'Search RxNorm Drugs by Name',
    description:
      'Search the NIH RxNorm drug database by generic name, brand name, or ingredient. Returns standardized drug concepts with their RxCUI identifiers, term types (ingredient, brand name, clinical drug, branded drug), and synonyms. RxNorm is the US standard drug nomenclature used by EHRs, pharmacies, and insurers. Use the RxCUI from results with rxnorm.drugs.properties and rxnorm.drugs.class for deeper drug information. Filter by term type (tty) to focus on ingredients (IN), brand names (BN), or clinical drug formulations (SCD/SBD).',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'rxnorm.rxcui_properties',
    mcpName: 'rxnorm.drugs.properties',
    title: 'Get RxNorm Drug Properties',
    description:
      'Retrieve detailed RxNorm properties for a drug concept identified by its RxCUI (RxNorm Concept Unique Identifier). Returns the canonical name, synonym, term type (TTY), language, and suppression status. The RxCUI is the definitive US drug identifier — used in medication reconciliation, clinical decision support, and insurance formularies. Obtain the RxCUI by searching with rxnorm.drugs.search first.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'rxnorm.ndc_lookup',
    mcpName: 'rxnorm.drugs.ndc_lookup',
    title: 'Look Up Drug by NDC Code',
    description:
      'Look up a drug product by its National Drug Code (NDC) to retrieve its RxNorm mapping and active status. The NDC is the 10- or 11-digit code printed on every US drug package. Returns the standardized 11-digit NDC, current active/inactive status in RxNorm, the mapped RxCUI, the concept name, and the data sources that include this NDC. Useful for medication verification, formulary checks, and cross-referencing between pharmacy systems and RxNorm.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'rxnorm.drug_class',
    mcpName: 'rxnorm.drugs.class',
    title: 'Get Drug Classification',
    description:
      'Retrieve pharmacological and therapeutic classifications for a drug by its RxCUI. Returns mappings to multiple classification systems: ATC (WHO Anatomical Therapeutic Chemical hierarchy used globally), VA Drug Class (US Veterans Affairs system), EPC (FDA Established Pharmacologic Class from drug labels), MOA (Mechanism of Action), and PE (Physiologic Effect). Useful for therapeutic substitution, formulary management, drug utilization reviews, and identifying drug classes for adverse event analysis. Each classification entry includes the class ID, name, type, relationship, and source system.',
    category: 'health',
    annotations: READ_ONLY,
  },
  // MyGene.info (4)
  {
    toolId: 'mygene.search',
    mcpName: 'mygene.genes.search',
    title: 'Search Genes by Keyword or Symbol',
    description:
      'Search the MyGene.info gene database by keyword, gene symbol, gene name, GO term, or any other gene annotation. Backed by NCBI Entrez Gene, Ensembl, UniProt, and other authoritative databases aggregated by the BioThings project. Returns NCBI Gene IDs, symbols, names, gene type, taxon, and summary text. Supports wildcard queries (e.g. "CDK*" returns all CDK family members) and species filtering. Use the returned Entrez Gene IDs with mygene.genes.info or mygene.genes.batch for full annotations including GO terms, KEGG/Reactome pathways, UniProt accessions, and genomic coordinates.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'mygene.gene_info',
    mcpName: 'mygene.genes.info',
    title: 'Get Comprehensive Gene Details',
    description:
      'Retrieve comprehensive annotation data for a single gene by its NCBI Entrez Gene ID or Ensembl gene ID. Returns the full gene record including: official symbol and name, gene type (protein-coding, ncRNA, pseudo, etc.), species taxon, gene summary, Ensembl transcript and protein IDs, UniProt Swiss-Prot accession, gene aliases, genomic coordinates (chromosome, start, end, strand), KEGG and Reactome pathway memberships, and Gene Ontology (GO) annotations across biological process, cellular component, and molecular function. Use mygene.genes.search or mygene.genes.symbol to discover Entrez Gene IDs first.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'mygene.batch_genes',
    mcpName: 'mygene.genes.batch',
    title: 'Batch Fetch Multiple Genes',
    description:
      'Retrieve annotation data for up to 1000 genes in a single request by providing a comma-separated list of NCBI Entrez Gene IDs or Ensembl gene IDs. Returns the same fields as mygene.genes.info for each gene: symbol, name, gene type, taxon, summary, Ensembl IDs, UniProt accession, genomic coordinates, and pathway memberships. Ideal for enriching gene lists from RNA-seq experiments, GWAS results, or drug target panels. Mix of NCBI Entrez and Ensembl IDs is supported in the same request.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'mygene.query_by_symbol',
    mcpName: 'mygene.genes.symbol',
    title: 'Look Up Gene by Official Symbol',
    description:
      'Find a gene by its official gene symbol with an exact match for a specific species. Returns a single best-matching gene with full annotation: NCBI Entrez Gene ID, Ensembl gene ID, gene name, type, taxon, summary, UniProt accession, genomic coordinates, pathway memberships, and GO terms. Faster and more precise than full-text search when the official symbol is known. Case-insensitive (BRCA1, brca1, Brca1 all match). For human genes, use HGNC symbols (e.g. "TP53", "EGFR", "KRAS", "VEGFA"). Results can be used directly with mygene.genes.batch for comparative multi-gene analysis.',
    category: 'health',
    annotations: READ_ONLY,
  },
  // MyVariant.info (4)
  {
    toolId: 'myvariant.search',
    mcpName: 'myvariant.variants.search',
    title: 'Search Genetic Variants',
    description:
      'Search the MyVariant.info database of 450M+ annotated human genetic variants using a flexible query syntax. Query by: dbSNP rsID (e.g. "rs58991260"), gene symbol (e.g. "dbsnp.gene.symbol:BRCA1"), ClinVar clinical significance (e.g. "clinvar.rcv.clinical_significance:Pathogenic"), CADD pathogenicity score (e.g. "cadd.phred:>30"), chromosomal position range (e.g. "chrom:17 AND hg19.start:[41196312 TO 41277500]"), or disease/phenotype keywords (e.g. "clinvar.rcv.conditions.name:breast cancer"). Each hit includes chromosome, genomic position (hg19/hg38), rsID, reference/alternate alleles, CADD PHRED score, ClinVar clinical significance, gnomAD allele frequency, and predicted functional consequences (SnpEff). Data integrates ClinVar, gnomAD, CADD, dbSNP, COSMIC, CIViC, ExAC, and 30+ annotation sources.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'myvariant.variant_info',
    mcpName: 'myvariant.variants.info',
    title: 'Get Variant Annotation Details',
    description:
      'Retrieve comprehensive annotation for a single genetic variant by its dbSNP rsID (e.g. "rs671") or HGVS genomic notation. Returns complete annotation from 30+ integrated databases: ClinVar clinical significance and disease conditions, CADD pathogenicity scores (raw + PHRED), gnomAD exome and genome allele frequencies across ancestry groups (AFR, EUR, EAS, AMR, ASJ), SnpEff predicted functional consequences with HGVS coding and protein notations, dbSNP allele frequency data, COSMIC somatic mutation records, CIViC clinical interpretations, and genomic coordinates in both GRCh37 (hg19) and GRCh38 (hg38). Essential for variant interpretation pipelines, pharmacogenomics analysis, and clinical variant classification (ACMG guidelines).',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'myvariant.batch_variants',
    mcpName: 'myvariant.variants.batch',
    title: 'Batch Fetch Variant Annotations',
    description:
      'Retrieve annotations for up to 1000 genetic variants in a single request by providing a comma-separated list of dbSNP rsIDs or HGVS variant IDs. Returns ClinVar significance, CADD scores, gnomAD allele frequencies, and functional consequence predictions for each variant in one call. Ideal for annotating VCF files, enriching GWAS hit lists, building polygenic risk score pipelines, or bulk pharmacogenomics analysis. Variants not found in the database are marked with found=false. Mix rsIDs from different chromosomes freely — no grouping by position required.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'myvariant.metadata',
    mcpName: 'myvariant.variants.metadata',
    title: 'Get MyVariant API Metadata',
    description:
      'Retrieve build metadata and data source statistics for the MyVariant.info API. Returns the current database build version (e.g. "20250624"), build date, total number of variant records, and a list of integrated annotation sources with their versions, URLs, and license information. Sources include ClinVar, gnomAD, CADD, dbSNP v156, COSMIC, CIViC, ExAC, GWAS Catalog, SnpEff, EVS, EMV, and 20+ additional variant databases. Use to verify data currency before running large annotation jobs or to cite specific source versions in research.',
    category: 'health',
    annotations: READ_ONLY,
  },

  // MyChem.info (4)
  {
    toolId: 'mychem.search',
    mcpName: 'mychem.chemicals.search',
    title: 'Search Chemical Compounds',
    description:
      'Search the MyChem.info database of 197M+ annotated chemical compounds using a flexible query syntax. Query by: common name (e.g. "aspirin"), IUPAC name (e.g. "acetylsalicylic acid"), InChIKey (e.g. "BSYNRYMUTXBXSQ-UHFFFAOYSA-N"), molecular formula (e.g. "C9H8O4"), ChEMBL ID (e.g. "CHEMBL25"), PubChem CID (e.g. "pubchem.cid:2244"), DrugBank ID (e.g. "DB00945"), or field-scoped queries (e.g. "drugbank.groups:approved AND chembl.max_phase:4"). Each result includes chemical names across databases (ChEBI, ChEMBL, DrugBank, PharmGKB), structural properties (molecular formula, weight, XLogP, H-bond donors/acceptors, TPSA, rotatable bonds), drug development phase, ATC classification codes, and approval status. Integrates DrugBank, ChEMBL, ChEBI, PubChem, PharmGKB, SIDER, DrugCentral, NDC, and 16+ annotation sources.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'mychem.annotation',
    mcpName: 'mychem.chemicals.annotation',
    title: 'Get Chemical Annotation Details',
    description:
      'Retrieve comprehensive annotation for a single chemical compound by its InChIKey (e.g. "BSYNRYMUTXBXSQ-UHFFFAOYSA-N"), ChEMBL ID (e.g. "CHEMBL25"), PubChem CID (e.g. "CID2244"), or DrugBank ID (e.g. "DB00945"). Returns complete annotation from 16+ integrated databases: ChEBI chemical definition, IUPAC name, and synonyms; ChEMBL clinical development phase (0–4), molecule type, ATC therapeutic classification, Lipinski Ro5 properties (MW, XLogP, HBD, HBA, PSA, rotatable bonds), black-box warning flag, and withdrawal status; PubChem structural identifiers (CID, molecular formula, molecular weight, InChI, SMILES, heavy atom count, complexity score); DrugBank approved indication, mechanism of action, drug targets with gene names and pharmacological actions; PharmGKB clinical pharmacogenomics annotation count; SIDER reported side effects; and NDC product codes. Essential for drug discovery, cheminformatics pipelines, pharmacogenomics analysis, and clinical safety review.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'mychem.batch_query',
    mcpName: 'mychem.chemicals.batch_query',
    title: 'Batch Query Chemical Compounds',
    description:
      'Retrieve annotations for up to 100 chemical compounds in a single request by providing an array of chemical names or identifiers. Returns ChEBI name, ChEMBL preferred name and clinical phase, PubChem CID, molecular formula and weight, DrugBank drug groups, and PharmGKB name for each compound in one call. Ideal for enriching compound lists from drug screening assays, annotating molecule libraries, building pharmacology databases, or cross-referencing chemicals across naming conventions (INN, brand names, IUPAC names). Compounds not found in any database are marked with found=false. Mix different name formats and identifiers freely in a single batch request.',
    category: 'health',
    annotations: READ_ONLY,
  },
  // US Drought Monitor (4)
  {
    toolId: 'drought.national_stats',
    mcpName: 'drought.national.stats',
    title: 'US National Drought Statistics',
    description:
      'Retrieve weekly US national drought statistics from the USDA/NOAA US Drought Monitor for a date range. Returns drought coverage by severity level (D0 Abnormally Dry through D4 Exceptional Drought) for CONUS and the total US (including Alaska/Hawaii/territories), reported as either square miles ("area") or percent of total land area ("percent"). Choose "cumulative" statistics_type to see how much area is in each level or worse (D1 includes D2+D3+D4); choose "categorical" for non-overlapping, mutually exclusive counts. Data is published weekly on Tuesdays — dates automatically snap to the nearest valid release. Maximum query window: 1 year. Useful for climate risk analysis, agricultural planning, and drought trend monitoring.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'drought.dsci',
    mcpName: 'drought.national.dsci',
    title: 'US Drought Severity and Coverage Index',
    description:
      'Retrieve the Drought Severity and Coverage Index (DSCI) for the US from the USDA/NOAA US Drought Monitor. DSCI is a single composite score per week ranging from 0 (no drought anywhere) to 500 (100% of the area in D4 Exceptional Drought), calculated as the weighted sum D0%×1 + D1%×2 + D2%×3 + D3%×4 + D4%×5. Returns DSCI values for both CONUS and the total US (including Alaska/Hawaii/territories) with a descriptive severity classification (none/low/moderate/severe/extreme/exceptional). Useful for tracking drought trends over time, comparing drought years, and integrating a single drought severity metric into dashboards or alerts.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'drought.county_stats',
    mcpName: 'drought.county.stats',
    title: 'US County Drought Statistics',
    description:
      'Retrieve weekly county-level drought statistics from the USDA/NOAA US Drought Monitor for a specific county or all counties in a US state. Pass a 5-digit FIPS code (e.g. "48113" for Dallas County TX, "06037" for Los Angeles County CA) to get a single county, or a 2-letter state abbreviation (e.g. "TX", "CA", "NE") to get all counties in that state. Returns drought severity by area (square miles) at each drought level (D0–D4) per week. Useful for granular agricultural impact assessment, insurance risk modeling, and local government drought planning.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'drought.weeks_in_drought',
    mcpName: 'drought.county.weeks',
    title: 'Counties by Weeks in Drought',
    description:
      'Find US counties that experienced at least N weeks of drought at or above a specified drought severity level during a given time period, using data from the USDA/NOAA US Drought Monitor. Filter by state (or all states), drought level (D0–D4), minimum weeks threshold, and whether to count consecutive or total (non-consecutive) weeks. Returns a list of matching counties with their FIPS codes, state, and week counts. Useful for identifying persistent drought-affected regions, prioritizing disaster relief, analyzing multi-year drought patterns, and supporting agricultural or water resource planning.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  // Europe PMC (4)
  {
    toolId: 'europepmc.search',
    mcpName: 'europepmc.literature.search',
    title: 'Search Biomedical Literature',
    description:
      'Search the Europe PubMed Central (Europe PMC) database of 42M+ biomedical articles, ' +
      'preprints, books, and patents from PubMed/MEDLINE, PubMed Central, and bioRxiv/medRxiv. ' +
      'Supports rich query syntax: free-text terms, field-specific filters ' +
      '(TITLE:"breast cancer", AUTH:"Smith J", JOURNAL:"Nature", DISEASE:"diabetes", ' +
      'MH:"neoplasms" for MeSH, GRANT_AGENCY:"Wellcome Trust", OPEN_ACCESS:Y), and Boolean ' +
      'operators (AND, OR, NOT). Sort by relevance, date, or citation count. ' +
      'Returns article metadata including PMID, DOI, title, authors, journal, year, abstract ' +
      '(with result_type=core), open-access status, and citation count.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'europepmc.article',
    mcpName: 'europepmc.literature.article',
    title: 'Get Biomedical Article Details',
    description:
      'Retrieve full bibliographic details for a specific biomedical article from Europe PMC ' +
      'by its unique identifier. Provide a PubMed ID (PMID) for journal articles in MEDLINE, ' +
      'a PMC ID for full-text articles in PubMed Central, or other source-specific IDs. ' +
      'Returns complete metadata: title, authors, journal, publication year, abstract, ' +
      'keywords, MeSH terms, DOI, open-access flag, PMC full-text availability, ' +
      'citation count, publication types, and affiliation. ' +
      'Use this after a search to retrieve the full record for a specific paper.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'europepmc.citations',
    mcpName: 'europepmc.literature.citations',
    title: 'Get Article Citations',
    description:
      'Retrieve a list of articles that cite a given biomedical publication in Europe PMC. ' +
      'Provide the article PMID (for PubMed/MEDLINE) or other source-specific ID. ' +
      'Returns the total citation count and bibliographic details for each citing article ' +
      '(title, authors, journal, year, PMID, DOI). Paginate through all citing articles ' +
      'with page_size and page parameters. Useful for forward citation tracking, ' +
      'identifying follow-up research, measuring impact of specific papers, and ' +
      'discovering related work published after the original article.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'europepmc.references',
    mcpName: 'europepmc.literature.references',
    title: 'Get Article References',
    description:
      'Retrieve the bibliography (reference list) of a biomedical article from Europe PMC. ' +
      'Provide the article PMID (for PubMed/MEDLINE) or other source-specific ID. ' +
      'Returns the total reference count and bibliographic details for each reference ' +
      '(title, authors, journal abbreviation, year, PMID, DOI where available). ' +
      'Paginate through all references with page_size and page parameters. ' +
      'Useful for backward citation tracking, understanding research foundations, ' +
      'identifying cited authors, and building citation networks.',
    category: 'health',
    annotations: READ_ONLY,
  },
  // ROR — Research Organization Registry (4)
  {
    toolId: 'ror.search',
    mcpName: 'ror.organizations.search',
    title: 'Search Research Organizations',
    description:
      'Search the Research Organization Registry (ROR) for research institutions, universities, ' +
      'hospitals, companies, government agencies, and funders by name, acronym, or keyword. ' +
      'ROR is the open community-driven registry of 110,000+ research organizations worldwide, ' +
      'maintained by DataCite, CrossRef, and the California Digital Library. Each organization ' +
      'has a unique persistent ROR ID (e.g. https://ror.org/042nb2s44 for MIT) used in scholarly ' +
      'metadata, grant systems, and repositories like PubMed, Zenodo, and DataCite. ' +
      'Returns up to 20 results per page with name, acronym, types (Education/Funder/Healthcare/etc.), ' +
      'status, country, city, founding year, and website. Use page parameter to paginate. ' +
      'Ideal for disambiguating author affiliations, validating institution names, and ' +
      'building bibliometric analyses of research output by organization.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ror.get',
    mcpName: 'ror.organizations.get',
    title: 'Get Research Organization by ROR ID',
    description:
      'Retrieve full details for a specific research organization from the Research Organization ' +
      'Registry (ROR) using its unique ROR identifier. Accepts the full URL format ' +
      '(https://ror.org/042nb2s44) or the short alphanumeric ID (042nb2s44). ' +
      'Returns comprehensive organization metadata including all name variants in multiple languages, ' +
      'organization type (Education, Funder, Healthcare, Company, Government, etc.), current status, ' +
      'founding year, primary location with coordinates, official website and Wikipedia URL, ' +
      'cross-registry identifiers (GRID, ISNI, Wikidata, FundRef), and parent/child/related ' +
      'organization relationships. Use after ror.organizations.search to get complete details for ' +
      'a found organization, or when you already know the ROR ID from scholarly metadata.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ror.filter',
    mcpName: 'ror.organizations.filter',
    title: 'Filter Research Organizations',
    description:
      'Filter the Research Organization Registry (ROR) by organization type, country, and/or ' +
      'status to browse subsets of the 110,000+ global research organizations. Supports combining ' +
      'multiple filters with an optional keyword query. Organization types include: Education ' +
      '(universities, colleges), Healthcare (hospitals, clinics), Company (industry research), ' +
      'Archive (data repositories, libraries), Nonprofit (NGOs, foundations), Government ' +
      '(agencies, national labs), Facility (research infrastructures, telescopes), Funder ' +
      '(grant agencies, funding bodies), and Other. Country is specified as ISO 3166-1 alpha-2 ' +
      'code (US, DE, GB, JP, CN, etc.). Returns total match count and up to 20 results per page ' +
      'with name, type, status, country, city, and website. Useful for generating lists of ' +
      'institutions in a specific country, enumerating funders by country, or counting research ' +
      'organizations by type.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ror.affiliation',
    mcpName: 'ror.organizations.affiliation',
    title: 'Match Affiliation String to Organizations',
    description:
      'Intelligently match a free-text affiliation string (as found in academic paper bylines or ' +
      'grant records) to research organizations in the ROR registry. Pass the raw affiliation text ' +
      'exactly as it appears — e.g. "Dept. of Physics, Univ. of California, Berkeley, CA, USA" or ' +
      '"Max-Planck-Institut für Astronomie, Heidelberg". ROR\'s affiliation matching algorithm ' +
      'performs substring detection, name-variant lookup, and scoring to identify candidate ' +
      'organizations. Returns each candidate with: confidence score (0–1), a "chosen" boolean ' +
      '(the best single match), matching_type (e.g. SINGLE SEARCH, COMMON TERMS), and the ' +
      "organization's ROR ID, canonical name, type, and country. " +
      'Ideal for metadata curation, ORCID affiliation disambiguation, funder acknowledgment ' +
      'normalization, and building organization-level research analytics from unstructured text.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'mychem.metadata',
    mcpName: 'mychem.chemicals.metadata',
    title: 'Get MyChem API Metadata',
    description:
      'Retrieve build metadata and data source statistics for the MyChem.info API. Returns the current database build version (e.g. "20260525"), build date, total number of chemical records (197M+), and a list of integrated annotation sources with their versions, URLs, and license information. Sources include DrugBank, ChEMBL, ChEBI, PubChem, PharmGKB, SIDER, DrugCentral, UMLS, NDC, UniChem, GSRS, FDA Orphan Drug, GtoPdb (pharmacology), AEOLUS (adverse events), GINAS, and UNII. Use to verify data currency before large annotation jobs or to cite specific source versions in research publications.',
    category: 'health',
    annotations: READ_ONLY,
  },

  // Catalogue of Life (4)
  {
    toolId: 'col.search',
    mcpName: 'col.species.search',
    title: 'Search Species in Catalogue of Life',
    description:
      'Search the Catalogue of Life (COL) for species, genera, families, and other taxa by ' +
      'scientific or common name. COL is the most comprehensive global index of known species, ' +
      'covering ~10 million extant and extinct taxa assembled from 600+ peer-reviewed checklists. ' +
      'Returns paginated results including taxon ID, scientific name with authorship, rank, ' +
      'taxonomic status (accepted/synonym), higher classification (kingdom through genus), ' +
      'and English vernacular names where available. Filter by taxonomic rank (SPECIES, GENUS, ' +
      'FAMILY, ORDER, CLASS, PHYLUM, KINGDOM) or status (accepted, synonym) to narrow results. ' +
      'Use the returned taxon ID with col.species.detail to retrieve full details, or ' +
      'col.species.children to list child taxa. Data is CC BY 4.0; cite as ' +
      '"Catalogue of Life (COL)" with the access date.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'col.detail',
    mcpName: 'col.species.detail',
    title: 'Get Taxon Details from Catalogue of Life',
    description:
      'Retrieve full taxonomic details for a specific taxon in the Catalogue of Life by its COL ' +
      'usage ID. Returns scientific name with authorship, taxonomic rank, acceptance status, ' +
      'extinction flag, parent taxon ID, scrutinizer (the expert who verified the record), ' +
      'scrutinizer date, and an external link to the COL web page for the taxon. ' +
      'Unlike col.species.search, the detail record does not include full higher-classification ' +
      'breadcrumbs — use the parent_id to walk the tree or pass the scientific name to ' +
      'col.species.search with rank=KINGDOM/PHYLUM etc. to retrieve ancestors. ' +
      'Obtain the taxon_id from a prior col.species.search or col.species.suggest call.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'col.suggest',
    mcpName: 'col.species.suggest',
    title: 'Autocomplete Species Name in Catalogue of Life',
    description:
      'Autocomplete a partial species or taxon name against the Catalogue of Life working draft, ' +
      'returning up to 25 ranked suggestions. Each suggestion includes the usage ID (for passing ' +
      'to col.species.detail or col.species.children), the matched name string, taxonomic rank, ' +
      'status (accepted/synonym), taxonomic group (e.g. "insects", "flowering plants", ' +
      '"birds"), higher-taxon context (e.g. "Hominidae"), and a human-readable suggestion string. ' +
      'Ideal for type-ahead name disambiguation in scientific workflows, species identification ' +
      'pipelines, or biodiversity data cleaning tasks. Optionally restrict suggestions to a ' +
      'specific rank (e.g. GENUS to return only genus-level matches).',
    category: 'world',
    annotations: READ_ONLY,
  },
  // Open Context (4)
  {
    toolId: 'opencontext.search',
    mcpName: 'opencontext.archaeology.search',
    title: 'Search Open Context Archaeological Records',
    description:
      'Full-text search across Open Context 200,000+ published archaeological records, ' +
      'including excavated objects (pottery, tools, bones, coins), site contexts (trenches, ' +
      'rooms, floors), media (photographs, 3D models, drawings), and field documents. ' +
      'Returns paginated list of matching items with label, URI, excavation project, geographic ' +
      'context (site → region hierarchy), latitude/longitude, date range (BCE/CE), item category, ' +
      'and a text snippet. Filter by item type (subjects/media/documents) or search all at once. ' +
      'Data is CC BY 4.0 from 220+ published excavation projects worldwide, maintained by the ' +
      'Alexandria Archive Institute. Response includes items per page and start offset for pagination.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'opencontext.detail',
    mcpName: 'opencontext.archaeology.detail',
    title: 'Get Open Context Item Detail',
    description:
      'Retrieve full archaeological record details for a specific Open Context item by UUID and ' +
      'type. Returns the complete structured data including: label, category (e.g. Pottery, Coin, ' +
      'Human Bone), Dublin Core metadata (title, issued date, modified date), full context path ' +
      '(geographic hierarchy: continent → country → site → trench → unit), latitude/longitude, ' +
      'temporal coverage with BCE/CE ranges and period labels, creator attribution, subject tags, ' +
      'project membership, license, and all project-defined observations (attributes and values ' +
      'recorded during excavation, such as fabric type, condition, size, vessel form, description). ' +
      'Obtain the UUID from the last path segment of any opencontext.archaeology.search result URI. ' +
      'Item types: "subjects" for excavated objects and site contexts (default), "projects" for ' +
      'excavation projects, "media" for images and 3D models, "documents" for field notes.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'opencontext.facets',
    mcpName: 'opencontext.archaeology.facets',
    title: 'Get Open Context Search Facets',
    description:
      'Retrieve aggregated facet statistics for a search query across Open Context without ' +
      'downloading individual records. Returns: total matched record count, query time, ' +
      'earliest and latest date range in BCE/CE across all matches, geographic distribution ' +
      '(continent-level facets with counts, e.g. Asia 99K, Europe 89K), item type breakdown ' +
      '(Subjects of Observation, Media, Documents, Projects), top matching excavation projects ' +
      'with counts, and linked-data description facets (Creator, License, Subject, etc.). ' +
      'Use this tool to quickly understand the scope and geographic/temporal distribution of ' +
      'archaeological records matching a query before retrieving individual items with ' +
      'opencontext.archaeology.search. Pass an empty string to get global database statistics.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'opencontext.projects',
    mcpName: 'opencontext.archaeology.projects',
    title: 'Search Open Context Excavation Projects',
    description:
      'Search for archaeological excavation projects and collections published in Open Context. ' +
      'Returns a paginated list of matching projects with label, URI, publication date, and last ' +
      'update date. Each project represents a distinct archaeological investigation — from major ' +
      'multi-season excavations (e.g. Petra Great Temple Excavations, Murlo, Kenan Tepe) to ' +
      'regional surveys (e.g. Eastern Korinthia Archaeological Survey) and collaborative datasets ' +
      '(e.g. Digital Index of North American Archaeology — DINAA). Use the returned URI path ' +
      'segment as the UUID in opencontext.archaeology.detail (with item_type="projects") to ' +
      'retrieve full project metadata including description, geographic coverage, contributors, ' +
      'and linked data. Combine with opencontext.archaeology.search to find specific item types ' +
      'within a known project (not yet supported via API — use facets for project-based counts).',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'col.children',
    mcpName: 'col.species.children',
    title: 'List Child Taxa in Catalogue of Life',
    description:
      'List the immediate child taxa of a given taxon in the Catalogue of Life taxonomic tree. ' +
      'For example: pass the ID for a family to get its genera; pass a genus ID to list its ' +
      'species; pass an order ID to enumerate its families. Returns paginated results with up ' +
      'to 100 children per call, each including taxon ID, scientific name, rank, status, ' +
      'and higher classification. Use offset for pagination over large groups (e.g. Coleoptera ' +
      'has 400K+ species). Obtain the taxon_id from col.species.search or col.species.suggest. ' +
      'CC BY 4.0 — ~10 million taxa across all kingdoms including Animalia, Plantae, Fungi, ' +
      'Bacteria, Archaea, Protista, Chromista, and Viruses.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // WTO Timeseries API (4) — UC-494
  {
    toolId: 'wto.trade_data',
    mcpName: 'wto.trade.data',
    title: 'Query WTO Trade and Tariff Time-Series Data',
    description:
      'Retrieve official World Trade Organization time-series data for trade and tariff ' +
      'indicators by reporting economy and year. Covers 58 indicators across three domains: ' +
      'tariff profiles (MFN applied/bound tariff averages, HS-level ad valorem duties by product), ' +
      'merchandise trade values (exports and imports by product group, quarterly and monthly), ' +
      'and commercial services trade (exports and imports by sector and partner). ' +
      'Returns structured data rows with indicator code, reporting economy, partner economy ' +
      '(for bilateral flows), product/sector classification, year, value, and unit. ' +
      'Example queries: US MFN applied tariff in 2022 (indicator TP_A_0010, reporter 840), ' +
      'China merchandise exports 2018-2022 (ITS_MTV_AX, reporter 156), ' +
      'EU commercial services exports (ITS_CS_AX6, reporter 097). ' +
      'Use wto.trade.indicators to discover indicator codes with their categories, units, ' +
      'and year ranges. Use wto.trade.reporters to look up 3-digit economy codes. ' +
      'Data is updated annually/quarterly by WTO Statistics Division. Free tier: 10 req/s.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'wto.indicators',
    mcpName: 'wto.trade.indicators',
    title: 'List WTO Trade and Tariff Indicators',
    description:
      'List all available World Trade Organization time-series indicators with metadata. ' +
      'Returns indicator code, name, category (TAR=tariff, ITS_M=merchandise trade, ' +
      'ITS_S=commercial services), subcategory, unit (e.g. percent, USD millions), ' +
      'frequency (annual/quarterly/monthly), year coverage (startYear–endYear), ' +
      'number of reporting economies covered, and estimated datapoint count. ' +
      'Use this tool before wto.trade.data to identify the correct indicator codes. ' +
      'Filter by topic_id (use wto.trade.topics to enumerate topic IDs) or by category code ' +
      '(TAR for tariff indicators, ITS_M for merchandise trade, ITS_S for services). ' +
      'Key indicators: TP_A_0010 (MFN applied tariff, all products), TP_B_0090 (bound tariff), ' +
      'ITS_MTV_AX (merchandise exports by product group, annual), ' +
      'ITS_CS_AX6 (commercial services exports by sector and partner). ' +
      'Returns the full catalogue of 58+ indicators maintained by the WTO Statistics Division.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'wto.reporters',
    mcpName: 'wto.trade.reporters',
    title: 'List WTO Reporting Economies',
    description:
      'List all 288 reporting economies (countries and economic groups) recognized by the WTO ' +
      'time-series database, with their 3-digit numeric codes, ISO 3-letter country codes, ' +
      'and display names. Use these codes in wto.trade.data reporter_codes and partner_codes ' +
      'parameters. Includes individual WTO members (e.g. 840=USA, 156=China, 276=Germany, ' +
      '392=Japan, 356=India, 036=Australia), geographic aggregates (e.g. 097=European Union, ' +
      '413=LDC group), and the world total (000=World). ' +
      'Filter results client-side by name substring (e.g. "Africa", "European", "United") ' +
      'to find the relevant codes for your query. ' +
      'Data sourced from the WTO Statistics Division; economy composition reflects WTO membership.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'wto.topics',
    mcpName: 'wto.trade.topics',
    title: 'List WTO Data Topic Categories',
    description:
      'List all WTO time-series database topic categories with their numeric IDs and names. ' +
      'Topics group related datasets — for example: World Tariff Profiles (topic 3), ' +
      'I-TIP non-tariff measures (topic 1), Merchandise Trade Values (topic 7), ' +
      'Commercial Services Trade (topic 12). ' +
      'Use the topic ID in wto.trade.indicators (topic_id parameter) to filter and discover ' +
      'the specific indicator codes available within that data domain. ' +
      'Returned topics correspond to the WTO Statistics Portal database groupings maintained ' +
      'by the WTO Statistics Division.',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // INSEE Sirene (4)
  {
    toolId: 'insee.company_by_siren',
    mcpName: 'insee.company.by_siren',
    title: 'Lookup French Company by SIREN',
    description:
      'Retrieve the official record of a French legal unit (company, association, sole trader) ' +
      'from the INSEE Sirene national registry using its 9-digit SIREN identifier. ' +
      'Returns the current company name, acronym, administrative status (active/ceased), ' +
      'NAF/APE activity code, legal category code, creation date, company-size band (TPE/PME/ETI/GE), ' +
      'and head-office NIC. ' +
      'The Sirene database covers all ~30M French legal units registered since 1973, updated daily. ' +
      'Use insee.establishment.by_siret for physical address and site-level details, or ' +
      'insee.company.search to find companies by name or activity code.',
    category: 'business',
    annotations: READ_ONLY,
  },
  {
    toolId: 'insee.establishment_by_siret',
    mcpName: 'insee.establishment.by_siret',
    title: 'Lookup French Establishment by SIRET',
    description:
      'Retrieve the official record of a French establishment (physical site/branch) from the ' +
      'INSEE Sirene registry using its 14-digit SIRET number (SIREN + NIC). ' +
      'Returns the establishment status (active/closed), NAF activity code, creation date, ' +
      'full postal address (street, postal code, city), head-office flag, and the parent ' +
      'company (legal unit) record. ' +
      'The Sirene database covers ~40M French establishments; address data is geocoded by INSEE. ' +
      'Use insee.company.by_siren to look up only the parent company, or ' +
      'insee.establishment.search to find establishments by postal code or city.',
    category: 'business',
    annotations: READ_ONLY,
  },
  {
    toolId: 'insee.search_companies',
    mcpName: 'insee.company.search',
    title: 'Search French Companies in Sirene',
    description:
      'Search French legal units (companies, associations, sole traders) in the INSEE Sirene ' +
      'national registry using a Lucene-style filter query. ' +
      'Supports filtering by company name (denominationUniteLegale), NAF activity code ' +
      '(activitePrincipaleUniteLegale, e.g. "62.01Z" for software publishing), ' +
      'administrative status (etatAdministratifUniteLegale: A=active, C=ceased), ' +
      'and legal category code (categorieJuridiqueUniteLegale, e.g. 5710 for SA). ' +
      'Combine clauses with AND / OR operators. Returns SIREN, name, acronym, status, ' +
      'NAF code, legal category, and creation date for each matching company. ' +
      'Use insee.company.by_siren to retrieve full details for a specific SIREN number.',
    category: 'business',
    annotations: READ_ONLY,
  },
  {
    toolId: 'insee.search_establishments',
    mcpName: 'insee.establishment.search',
    title: 'Search French Establishments in Sirene',
    description:
      'Search French establishments (physical sites, branches, stores) in the INSEE Sirene ' +
      'registry using a Lucene-style filter query. ' +
      'Supports filtering by postal code (codePostalEtablissement, e.g. "75008"), ' +
      'city name (libelleCommuneEtablissement, e.g. "PARIS"), ' +
      'NAF activity code (activitePrincipaleEtablissement, e.g. "47.11B" for supermarkets), ' +
      'status (etatAdministratifEtablissement: A=active, F=closed), ' +
      'and parent company name (denominationUniteLegale). ' +
      'Combine clauses with AND / OR operators. Returns SIRET, address, status, NAF code, ' +
      'head-office flag, and parent company summary for each matching establishment. ' +
      'Use insee.establishment.by_siret to retrieve full details for a specific SIRET.',
    category: 'business',
    annotations: READ_ONLY,
  },

  // Biodiversity Heritage Library (4)
  {
    toolId: 'bhl.literature.search',
    mcpName: 'bhl.literature.search',
    title: 'Search BHL Publications (Catalog)',
    description:
      'Search the Biodiversity Heritage Library catalog by keyword across title, author, ' +
      "subject, and publisher fields. BHL is the world's largest open-access library of " +
      'biodiversity literature — 60M+ pages of digitized natural-history books, journals, ' +
      'and manuscripts from 1469 to the present, all public domain. ' +
      'Returns item and title IDs, full title, authors, publisher, publication date, genre, ' +
      'and direct URLs to the digitized item and bibliography page. ' +
      'Use bhl.literature.fulltext to search within the scanned text of publications.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bhl.literature.fulltext',
    mcpName: 'bhl.literature.fulltext',
    title: 'Search BHL Full Text',
    description:
      'Search within the digitized full text of Biodiversity Heritage Library publications ' +
      'for a specific term or phrase. Unlike the catalog search, full-text search scans the ' +
      'OCR-transcribed content of scanned pages, making it possible to find publications ' +
      'that mention a specific organism, location, concept, or measurement even when the ' +
      'keyword does not appear in title or subject metadata. ' +
      'Returns matching publications with title, authors, publisher, date, and direct BHL URLs. ' +
      'Use bhl.literature.search for faster metadata-only catalog queries.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bhl.taxonomy.name_search',
    mcpName: 'bhl.taxonomy.name_search',
    title: 'Search BHL Taxonomic Names',
    description:
      'Search the Biodiversity Heritage Library for confirmed scientific (Latin) names ' +
      'matching a given taxonomic query. Useful for discovering historical name variants, ' +
      'author citations, and subspecies/variety designations for a taxon as recorded in ' +
      'classic natural-history literature. Returns a list of confirmed name strings ' +
      'in the form "Genus species Author, Year". ' +
      'Use bhl.literature.search with the confirmed name to find publications containing it.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bhl.literature.by_subject',
    mcpName: 'bhl.literature.by_subject',
    title: 'Browse BHL Subject Tags',
    description:
      'Browse the Biodiversity Heritage Library subject index to discover subject tags ' +
      'related to a natural-history discipline or concept (e.g. "ornithology", "botany", ' +
      '"entomology", "paleontology"). Returns a list of matching subject strings used to ' +
      'classify BHL holdings. Use the returned subjects as precise search terms in ' +
      'bhl.literature.search to retrieve publications filed under that subject heading.',
    category: 'education',
    annotations: READ_ONLY,
  },

  // Global Fishing Watch (4) — UC-497
  {
    toolId: 'gfw.vessel.search',
    mcpName: 'gfw.vessel.search',
    title: 'Search Fishing Vessels',
    description:
      'Search the Global Fishing Watch database for fishing and commercial vessels by name, ' +
      'MMSI (9-digit AIS identifier), IMO number, or call sign. Returns vessel identities with ' +
      'flag state, gear types (trawlers, longliners, purse seiners, etc.), ship types, and AIS ' +
      'transmission date ranges. GFW tracks 60,000+ active fishing vessels using satellite AIS ' +
      'data covering 2012–present. Optionally filter results by flag state using ISO 3-letter ' +
      'country code. Use gfw.vessel.details for full registry information.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'gfw.vessel.details',
    mcpName: 'gfw.vessel.details',
    title: 'Get Vessel Details',
    description:
      'Retrieve complete identity and activity profile for a specific vessel using its ' +
      'Global Fishing Watch vessel UUID. Returns self-reported AIS data (name, flag, MMSI, ' +
      'IMO, call sign), inferred gear and ship types from neural-network analysis of movement ' +
      'patterns, official registry records (where available), and AIS coverage statistics ' +
      '(total messages, positions, active date range). Vessel UUIDs are obtained from ' +
      'gfw.vessel.search.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'gfw.vessel.fishing_events',
    mcpName: 'gfw.vessel.fishing_events',
    title: 'Get Vessel Fishing Events',
    description:
      'Retrieve AIS-detected maritime events for a specific vessel — either fishing activity ' +
      'episodes or port visits. Fishing events capture when a vessel slowed and maneuvered in ' +
      'patterns consistent with active fishing (coordinates, duration, EEZ/RFMO/FAO area codes, ' +
      'distance from shore and port). Port visits capture anchorage and berthing stops (port ' +
      'name, flag, entry/exit times). Results are paginated; use offset for subsequent pages. ' +
      'Vessel UUID is obtained from gfw.vessel.search.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'gfw.ocean.fishing_effort',
    mcpName: 'gfw.ocean.fishing_effort',
    title: 'Analyze Fishing Effort',
    description:
      'Analyze fishing effort intensity across a geographic polygon for a specified date range, ' +
      'aggregated by gear type (trawlers, longliners, purse seiners, squid jiggers, etc.). ' +
      'Returns a grid of 0.1-degree cells with fishing hours and vessel counts per month or year, ' +
      "drawn from Global Fishing Watch's public AIS-based fishing effort dataset covering " +
      '2012–present. Useful for marine protected area monitoring, fisheries research, ' +
      'and vessel traffic analysis. Define the study area with a closed polygon in ' +
      '[longitude, latitude] coordinates.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // OpenStates (UC-498) — US state legislative data: bills, legislators, committees (4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'openstates.people_search',
    mcpName: 'openstates.legislature.people_search',
    title: 'Search State Legislators',
    description:
      'Search current US state legislators across all 50 states. Filter by state jurisdiction, ' +
      'name, political party, or district. Returns legislator profiles including name, party ' +
      'affiliation, chamber role (Senator/Representative/Delegate), district, jurisdiction, ' +
      'and profile image. Powered by OpenStates (open-data, CC-licensed). ' +
      'Use jurisdiction codes such as "ca" (California), "tx" (Texas), "ny" (New York).',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'openstates.bills_search',
    mcpName: 'openstates.legislature.bills_search',
    title: 'Search State Bills',
    description:
      'Search US state legislative bills by jurisdiction, keyword, session, or subject. ' +
      'Returns bill summaries with identifier, title, latest action, passage date, and link ' +
      'to the OpenStates detail page. Covers all 50 US states and territories. ' +
      'Filter by session (e.g. "20252026"), classification (bill/resolution), or subject tag. ' +
      'Use bills_detail to fetch full text, sponsors, and voting records.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'openstates.bill_detail',
    mcpName: 'openstates.legislature.bill_detail',
    title: 'Get Bill Details',
    description:
      'Get full details for a specific US state bill by jurisdiction, session, and bill identifier. ' +
      'Returns complete legislative history including all actions (committee referrals, readings, ' +
      'amendments, final votes), sponsor information, abstract/summary, and roll-call vote counts. ' +
      'Obtain jurisdiction and session from bills_search results. ' +
      'Example: jurisdiction="ca", session="20252026", bill_id="SB 700".',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'openstates.committees',
    mcpName: 'openstates.legislature.committees',
    title: 'List Legislative Committees',
    description:
      'List legislative committees for a US state, optionally filtered by chamber (upper/lower) ' +
      'or type (committee/subcommittee). Returns committee name, chamber, jurisdiction, and ' +
      'parent committee for subcommittees. Useful for identifying which committee oversees a ' +
      'policy area or finding where a bill is assigned. ' +
      'Use jurisdiction codes such as "ca", "tx", "ny".',
    category: 'legal',
    annotations: READ_ONLY,
  },

  // Victoria and Albert Museum (4)
  {
    toolId: 'vam.search',
    mcpName: 'vam.collections.search',
    title: 'V&A Collection Search',
    description:
      'Search 1M+ objects in the Victoria and Albert Museum collection by keyword, object type, ' +
      'date range, and display status. Returns object type, title, maker, date, place of origin, ' +
      'thumbnail URL, and IIIF image base for each result. Filter by on_display=true to find ' +
      'objects currently on display in London. Source: V&A public API (no auth required).',
    category: 'media',
    annotations: READ_ONLY,
  },
  {
    toolId: 'vam.object',
    mcpName: 'vam.collections.object',
    title: 'V&A Museum Object Details',
    description:
      'Get full details for a specific V&A museum object by its system number (e.g. "O429002"). ' +
      'Returns complete record: title, summary and physical descriptions, all makers with roles, ' +
      'materials, techniques, categories, styles, production date range, place of origin, ' +
      'gallery location, IIIF image URL, and direct link to the V&A collections page.',
    category: 'media',
    annotations: READ_ONLY,
  },
  {
    toolId: 'vam.by_maker',
    mcpName: 'vam.collections.by_maker',
    title: 'V&A Objects by Maker',
    description:
      'Search V&A collection objects created by a specific artist, designer, or maker. ' +
      'Returns objects with maker name, date, object type, place, thumbnail URL, and display ' +
      'status. Supports partial name matching. Examples: "Wedgwood" (1,300+ ceramics), ' +
      '"William Morris" (textiles/designs), "Constable" (paintings), "Beatrix Potter" (drawings).',
    category: 'media',
    annotations: READ_ONLY,
  },
  {
    toolId: 'vam.by_category',
    mcpName: 'vam.collections.by_category',
    title: 'V&A Objects by Category',
    description:
      'Browse V&A collection objects by museum category using a thesaurus ID. Major categories: ' +
      'THES48982 (Ceramics, 73K+), THES48917 (Paintings, 23K+), THES48968 (Designs, 25K+), ' +
      'THES48966 (Drawings, 18K+), THES48903 (Prints, 15K+), THES48885 (Textiles, 7K+), ' +
      'THES48910 (Photographs, 4K+), THES48920 (Metalwork, 4K+). ' +
      'Optionally refine with a keyword query and filter to on-display objects only.',
    category: 'media',
    annotations: READ_ONLY,
  },

  // PharmGKB (4)
  {
    toolId: 'pharmgkb.gene_search',
    mcpName: 'pharmgkb.pharmacology.gene_search',
    title: 'PharmGKB Gene Search',
    description:
      'Search PharmGKB for a pharmacogenomics gene by HGNC symbol (e.g. CYP2C9, CYP2D6, BRCA1, VKORC1, TPMT). ' +
      'Returns the PharmGKB gene ID, chromosomal location (GRCh38), strand, CPIC/AMP gene status, allele type, ' +
      'VIP tier, and plain-text clinical summary. CPIC genes have validated drug-dosing guidelines. ' +
      'AMP genes are on the AMP Tier I/II actionable list. Source: PharmGKB, CC BY-SA 4.0.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'pharmgkb.drug_search',
    mcpName: 'pharmgkb.pharmacology.drug_search',
    title: 'PharmGKB Drug Search',
    description:
      'Search the PharmGKB curated drug/chemical database by name (e.g. warfarin, clopidogrel, tamoxifen, codeine). ' +
      'Returns PharmGKB ID, canonical name, trade names, generic names, drug types, SMILES, InChI, ' +
      'ATC code, ChEBI ID, DrugBank ID, and pediatric annotation flag. ' +
      'PharmGKB covers 3,000+ pharmacologically relevant compounds with PGx relationships. Source: PharmGKB, CC BY-SA 4.0.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'pharmgkb.variant_lookup',
    mcpName: 'pharmgkb.pharmacology.variant_lookup',
    title: 'PharmGKB Variant Lookup',
    description:
      'Look up pharmacogenomic details for a genetic variant by dbSNP rsID (e.g. rs1799853 for CYP2C9*2, ' +
      'rs4244285 for CYP2C19*2, rs12248560 for CYP2C19*17). Returns variant ID, change classification ' +
      '(Missense/Synonymous/Intronic), clinical significance (drug-response/pathogenic), variant type (SNP/Indel), ' +
      'chromosomal position (GRCh38), associated genes, rarity flag, and ClinVar IDs. ' +
      'Focused on variants with known drug-response relevance. Source: PharmGKB, CC BY-SA 4.0.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'pharmgkb.drug_labels',
    mcpName: 'pharmgkb.pharmacology.drug_labels',
    title: 'PharmGKB Drug Label Annotations',
    description:
      'Retrieve pharmacogenomics (PGx) drug label annotations from regulatory agencies curated by PharmGKB. ' +
      'Supports FDA (500+ labels), EMA, PMDA (Japan), HCSC (Canada), SWISSMEDIC, and AEMPS (Spain). ' +
      'Each annotation links a drug label to PGx biomarkers, indicates whether it includes dosing guidance, ' +
      'whether an alternate drug is recommended, cancer-genome relevance, pediatric tags, and testing information. ' +
      'Filter to dosing-information-only labels for actionable prescribing guidance. Paginated (up to 100/page). ' +
      'Source: PharmGKB, CC BY-SA 4.0.',
    category: 'health',
    annotations: READ_ONLY,
  },
  // Brreg (4)
  {
    toolId: 'brreg.search',
    mcpName: 'brreg.registry.search',
    title: 'Brreg Company Search',
    description:
      "Search Norway's official business registry (Brønnøysundregistrene) for companies and organisations. " +
      'Filter by company name, municipality (4-digit code), organisation form (AS/ASA/ENK/NUF etc.), ' +
      'or NACE industry code. Returns organisation number, name, org form, VAT status, employee count, ' +
      'address, primary NACE industry code, and bankruptcy/winding-up flags. ' +
      'Over 1 million entities registered. Data is NLOD 2.0 (commercial use permitted). No API key required.',
    category: 'business',
    annotations: READ_ONLY,
  },
  {
    toolId: 'brreg.entity',
    mcpName: 'brreg.registry.entity',
    title: 'Brreg Entity Detail',
    description:
      'Retrieve full details for a specific Norwegian company or organisation by its 9-digit organisation number. ' +
      'Returns: name, organisation form, website, phone, email, employee count, registration date, ' +
      'founding date, VAT registration, bankruptcy/winding-up status, up to 3 NACE industry codes, ' +
      'municipality, postal address, business address, last annual report year, and parent entity. ' +
      'Ideal for KYB (Know Your Business) verification of Norwegian entities. ' +
      'Source: Brønnøysundregistrene, NLOD 2.0.',
    category: 'business',
    annotations: READ_ONLY,
  },
  {
    toolId: 'brreg.sub_units',
    mcpName: 'brreg.registry.sub_units',
    title: 'Brreg Sub-Units',
    description:
      'List all registered sub-units (underenheter) for a Norwegian parent company — branches, ' +
      'departments, production sites, and physical locations. Each sub-unit has its own organisation number, ' +
      'name, org form, NACE industry code, municipality, and employee count. ' +
      "Useful for mapping a company's operational footprint across Norway. " +
      'Large companies like Equinor or NHO can have hundreds of sub-units. Paginated (up to 50/page). ' +
      'Source: Brønnøysundregistrene, NLOD 2.0.',
    category: 'business',
    annotations: READ_ONLY,
  },
  {
    toolId: 'brreg.roles',
    mcpName: 'brreg.registry.roles',
    title: 'Brreg Company Roles',
    description:
      'Retrieve statutory management roles for a Norwegian company — board of directors (STYR), ' +
      'CEO/daily manager (DAGL), auditor (REVI), chairman (LEDE), deputy members, signature rights, ' +
      "and other registered positions. Each role entry includes the person's first/last name, birth year, " +
      "whether the role is still active, and (for corporate roles) the linked entity's org number and name. " +
      'Essential for due diligence, UBO (Ultimate Beneficial Owner) research, and corporate governance checks. ' +
      'Source: Brønnøysundregistrene, NLOD 2.0.',
    category: 'business',
    annotations: READ_ONLY,
  },
  // WoRMS — World Register of Marine Species (4)
  {
    toolId: 'worms.species.search',
    mcpName: 'worms.species.search',
    title: 'WoRMS Species Search',
    description:
      'Search 240K+ accepted marine species by scientific or partial name in the World Register of Marine Species (WoRMS). ' +
      'Returns AphiaID, accepted scientific name, authority, taxonomic status, kingdom/phylum/class/order/family/genus, ' +
      'LSID, and habitat flags (marine/brackish/freshwater/terrestrial/extinct). ' +
      'Supports fuzzy matching and optional restriction to marine-only taxa. ' +
      'Use the AphiaID from results with worms.species.details, worms.species.classification, or worms.species.vernaculars. ' +
      'Source: WoRMS Editorial Board, CC BY 4.0.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'worms.species.details',
    mcpName: 'worms.species.details',
    title: 'WoRMS Species Details',
    description:
      'Retrieve the full WoRMS Aphia record for a taxon by its AphiaID. ' +
      'Returns complete taxonomy (kingdom to genus), accepted name and authority, valid AphiaID for synonyms, ' +
      'citation string, LSID (life science identifier), habitat flags, and last-modified date. ' +
      'Use this to resolve synonym chains — if status is "unaccepted", valid_AphiaID points to the accepted taxon. ' +
      'Source: World Register of Marine Species, CC BY 4.0.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'worms.species.classification',
    mcpName: 'worms.species.classification',
    title: 'WoRMS Taxonomic Classification',
    description:
      'Get the full taxonomic classification tree for a marine taxon by AphiaID. ' +
      'Returns the complete nested hierarchy from Superdomain/Biota down to the queried taxon — ' +
      'each node has AphiaID, rank, and scientific name. ' +
      'Ideal for building taxonomic trees, verifying rank placement, or navigating the WoRMS backbone. ' +
      'Source: World Register of Marine Species, CC BY 4.0.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'worms.species.vernaculars',
    mcpName: 'worms.species.vernaculars',
    title: 'WoRMS Vernacular Names',
    description:
      'Retrieve all registered vernacular (common) names for a marine taxon by AphiaID across all languages. ' +
      'Each entry includes the common name, ISO language code, and full language name. ' +
      'For example, AphiaID 137102 (Orcinus orca) returns "killer whale" (English), "orca" (Spanish), "épaulard" (French), ' +
      'and dozens more. Useful for multilingual species identification, biodiversity apps, and natural-history content. ' +
      'Source: World Register of Marine Species, CC BY 4.0.',
    category: 'education',
    annotations: READ_ONLY,
  },
  // Bank of Canada (4)
  {
    toolId: 'bankofcanada.fx_rates',
    mcpName: 'bankofcanada.fx.rates',
    title: 'Bank of Canada CAD FX Rates',
    description:
      'Get Canadian dollar (CAD) exchange rates against major world currencies from the Bank of Canada Valet API. ' +
      'Returns daily average reciprocal rates: 1 CAD expressed in foreign currency units (e.g. FXCADUSD = 0.7061 means 1 CAD = 0.7061 USD). ' +
      'Default currencies: USD, EUR, GBP, JPY, AUD, CHF, MXN, SEK, NOK, HKD. ' +
      'Specify custom ISO 4217 codes via the currencies parameter. ' +
      'Fetch the latest rate (recent=1, default), N most-recent observations, or a date range (start_date + end_date). ' +
      'Data published on each Bank of Canada business day. ' +
      'Source: Bank of Canada, www.bankofcanada.ca — open data, attribution required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bankofcanada.policy_rate',
    mcpName: 'bankofcanada.rates.policy',
    title: 'Bank of Canada Policy & Prime Rate',
    description:
      'Get Bank of Canada overnight target rate and prime lending rate history from the Valet API. ' +
      'overnight_rate_pct (series V39079): the Bank of Canada target for the overnight rate — its primary monetary policy instrument. ' +
      'prime_rate_pct (series V80691311): the prime lending rate set by financial institutions as a function of the overnight rate. ' +
      'Rate changes occur on scheduled Bank of Canada announcement dates (approximately 8 times per year). ' +
      'Returns the 10 most-recent observations by default; use start_date/end_date for historical ranges going back to 1994. ' +
      'Essential for Canadian mortgage, loan, and bond analysis. ' +
      'Source: Bank of Canada, www.bankofcanada.ca — open data, attribution required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bankofcanada.inflation',
    mcpName: 'bankofcanada.rates.inflation',
    title: 'Bank of Canada Inflation (CPI)',
    description:
      'Get Canadian Consumer Price Index (CPI) inflation measures published by the Bank of Canada Valet API. ' +
      'Returns four monthly series as year-over-year percentage changes: ' +
      'total_cpi_yoy_pct (all-items CPI), core_cpi_yoy_pct (CPI excluding food and energy), ' +
      'cpiw_yoy_pct (CPIW — basket-weight-adjusted measure), cpi_median_yoy_pct (median year-over-year CPI change). ' +
      'Default: 12 most-recent monthly observations (one year). ' +
      'Use start_date/end_date for historical ranges. ' +
      "These are the Bank of Canada's key inflation tracking measures, used to assess achievement of the 2% inflation target. " +
      'Source: Bank of Canada, www.bankofcanada.ca — open data, attribution required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bankofcanada.series',
    mcpName: 'bankofcanada.data.series',
    title: 'Bank of Canada Valet Series Lookup',
    description:
      'Retrieve observations for any Bank of Canada Valet series by series code(s). ' +
      'Supports one or multiple comma-separated codes (e.g. "FXCADUSD,FXCADEUR" or "V39079"). ' +
      'Browse all available series at https://www.bankofcanada.ca/valet/lists/series/json — ' +
      'over 8,000 series covering FX rates, interest rates, inflation, commodity prices, credit aggregates, and more. ' +
      'Key codes: FXCADUSD (CAD/USD), V39079 (overnight target rate), V80691311 (prime rate), ' +
      'STATIC_TOTALCPICHANGE (total CPI % YoY), CPIW, CPI_MEDIAN, A.BCPI (annual commodity price index). ' +
      'Returns latest values, full series metadata, and history for the requested date range. ' +
      'Source: Bank of Canada, www.bankofcanada.ca — open data, attribution required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  // OpenSenseMap (4)
  {
    toolId: 'opensensemap.box_search',
    mcpName: 'opensensemap.boxes.search',
    title: 'OpenSenseMap Station Search',
    description:
      'Search OpenSenseMap crowdsourced environmental sensor stations by location, name, group tag, exposure type, or measured phenomenon. ' +
      'Returns up to 100 stations with their sensors and latest measurement values. ' +
      'OpenSenseMap hosts 15,000+ community-operated senseBox stations worldwide measuring PM2.5, temperature, humidity, UV, pressure, CO₂, and more. ' +
      'Location search: provide latitude+longitude to find stations within max_distance meters (default 5 km). ' +
      'Name search: pass name to filter by station name substring (e.g. "berlin", "school"). ' +
      'Phenomenon filter: use "Temperatur", "PM2.5", "rel. Luftfeuchte", "Luftdruck", or "UV-Intensität" to find stations measuring a specific sensor type. ' +
      'Exposure filter: "outdoor" for weather/air-quality monitors, "indoor" for home sensors. ' +
      'Each result includes station ID (use with box_detail or sensors_latest), coordinates, sensor list, and last measurement values. ' +
      'Data is PDDL 1.0 public domain, no attribution required. Source: https://opensensemap.org',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'opensensemap.box_detail',
    mcpName: 'opensensemap.boxes.detail',
    title: 'OpenSenseMap Station Detail',
    description:
      'Get full metadata and sensor list for a specific OpenSenseMap sensor station by its box ID. ' +
      'Returns station name, coordinates, exposure type, hardware model, creation date, and a complete list of all sensors with their IDs, titles, units, sensor types, and latest measurement values. ' +
      'Use this to discover the sensor IDs needed for sensor_timeseries calls. ' +
      'A station typically has 3–12 sensors covering combinations of: temperature (°C), relative humidity (%), air pressure (hPa), PM2.5 (µg/m³), PM10 (µg/m³), UV intensity (µW/cm²), illuminance (lx), CO₂ (ppm), and more. ' +
      'Obtain the box_id from box_search results. ' +
      'Source: OpenSenseMap, PDDL 1.0 public domain.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'opensensemap.sensors_latest',
    mcpName: 'opensensemap.sensors.latest',
    title: 'OpenSenseMap Latest Sensor Readings',
    description:
      'Get the latest measurement value for every sensor on an OpenSenseMap station in a single call. ' +
      'Returns all sensor readings simultaneously: temperature, humidity, pressure, PM2.5, PM10, UV, CO₂, and any other sensors installed on the station. ' +
      'Each reading includes sensor ID, title, unit, sensor type, current value, and timestamp of measurement. ' +
      'Sensors with no recent data show last_value: null. ' +
      'Use box_search or box_detail to find the box_id first, then use sensor IDs from results with sensor_timeseries for historical data. ' +
      'Ideal for real-time environmental monitoring dashboards. ' +
      'Source: OpenSenseMap, PDDL 1.0 public domain.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  // OpenFDA Medical Devices (UC-505) — 4 tools
  {
    toolId: 'openfda_devices.recalls',
    mcpName: 'openfda_devices.safety.recalls',
    title: 'FDA Medical Device Recalls',
    description:
      'Search FDA medical device recall records — 58,000+ recalls across all device types since 1976. ' +
      'Returns recall status (Ongoing/Terminated/Completed), reason for recall, affected product descriptions, ' +
      'recalling firm, distribution pattern, corrective action taken, and product codes. ' +
      'Filter by device name, firm, status, or date using Lucene syntax: device_name:"insulin pump" or recall_status:"Ongoing". ' +
      'Essential for medical device safety research, regulatory compliance, and patient risk assessment. ' +
      'Source: FDA CFRES database, US public domain.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'openfda_devices.clearances_510k',
    mcpName: 'openfda_devices.clearance.premarket_510k',
    title: 'FDA 510(k) Premarket Clearances',
    description:
      'Search FDA 510(k) premarket clearance submissions — 175,000+ cleared medical devices. ' +
      'Returns k_number, device name, applicant, decision (SESE=cleared), decision date, product code, ' +
      'advisory committee specialty, and clearance type (Traditional/Special/Abbreviated). ' +
      'Filter by device name, k-number, applicant, or product code. ' +
      'A 510(k) clearance means FDA determined the device is substantially equivalent to a legally marketed predicate device. ' +
      'Useful for market research, competitive analysis, and regulatory pathway planning. ' +
      'Source: FDA CDRH 510(k) database, US public domain.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'openfda_devices.adverse_events',
    mcpName: 'openfda_devices.safety.adverse_events',
    title: 'FDA Medical Device Adverse Events (MAUDE)',
    description:
      'Search FDA MAUDE database for medical device adverse event reports — 25M+ records of device malfunctions, injuries, and deaths. ' +
      'Returns event type (Malfunction/Injury/Death), device brand name, device class, manufacturer, ' +
      'report date, event date, event location, and report source type. ' +
      'Filter using Lucene syntax: device.brand_name:"pacemaker" or event_type:"Death". ' +
      'MAUDE (Manufacturer and User Facility Device Experience) is the primary FDA device safety surveillance database. ' +
      'Source: FDA MAUDE database, US public domain.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'openfda_devices.classification',
    mcpName: 'openfda_devices.reference.classification',
    title: 'FDA Medical Device Classification',
    description:
      'Search FDA medical device classification database — 7,000+ product codes with risk class and regulatory requirements. ' +
      'Returns device name, product code, device class (1=low/exempt, 2=moderate/510k, 3=high/PMA), ' +
      'medical specialty, regulation number, definition, life-sustain/implant flags. ' +
      'Filter by device name, product code, device class, or specialty description. ' +
      'Device class determines the regulatory pathway: Class I (General Controls), Class II (510k), Class III (PMA). ' +
      'Source: FDA CDRH device classification database, US public domain.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'opensensemap.sensor_timeseries',
    mcpName: 'opensensemap.sensors.timeseries',
    title: 'OpenSenseMap Sensor Time-Series Data',
    description:
      'Retrieve historical time-series measurements for a specific sensor on an OpenSenseMap station. ' +
      'Returns up to 10,000 measurement points (value + ISO 8601 timestamp) in reverse-chronological order (newest first). ' +
      'Specify box_id and sensor_id (both from box_search or sensors_latest), and optionally narrow the window with from_date/to_date in ISO 8601 format. ' +
      'Sensors on active stations record every 1–10 minutes, so a 24-hour window for a station with 5-min intervals yields ~288 data points. ' +
      'Useful for charting pollution spikes, computing daily averages, building climate datasets, or triggering alerts on threshold crossings. ' +
      'Supports any sensor type: PM2.5 (µg/m³), temperature (°C), relative humidity (%), air pressure (hPa), UV intensity, CO₂ (ppm), and more. ' +
      'Source: OpenSenseMap, PDDL 1.0 public domain.',
    category: 'weather',
    annotations: READ_ONLY,
  },

  // Open-Meteo Marine (UC-506) — 4 tools
  {
    toolId: 'marine.forecast',
    mcpName: 'marine.ocean.forecast',
    title: 'Marine Comprehensive Forecast',
    description:
      'Full hourly marine forecast at any ocean coordinate up to 16 days ahead. ' +
      'Returns all marine variables: significant wave height (m), mean wave direction (°), mean wave period (s), ' +
      'swell wave height (m), swell direction (°), swell period (s), and sea surface temperature (°C). ' +
      'Data is sourced from CMEMS ERA5 reanalysis and global wave models (ERA5-Ocean, MEPS, GFS). ' +
      'Ideal for offshore operations, ship routing, marine research, and multi-variable coastal planning. ' +
      'Supply latitude/longitude of an open-ocean or coastal point; land coordinates return null values. ' +
      'Source: Open-Meteo Marine API, CC BY 4.0, no authentication required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'marine.wave_conditions',
    mcpName: 'marine.ocean.waves',
    title: 'Marine Wave Conditions Forecast',
    description:
      'Hourly wave conditions forecast at an ocean coordinate — wave height (m), wave direction (°), and wave period (s) for up to 16 days. ' +
      'Wave height is significant wave height (average of the highest third of waves). ' +
      'Wave direction is the mean direction from which waves are coming (degrees clockwise from north). ' +
      'Wave period is the mean time between successive wave crests in seconds. ' +
      'Useful for surfing spot reports, ferry/vessel routing, coastal engineering assessments, and storm monitoring. ' +
      'Source: Open-Meteo Marine API, CC BY 4.0, no authentication required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'marine.swell_forecast',
    mcpName: 'marine.ocean.swell',
    title: 'Marine Swell Forecast',
    description:
      'Hourly swell forecast at an ocean coordinate — swell wave height (m), swell direction (°), and swell period (s) for up to 16 days. ' +
      'Swell consists of wind-generated waves that have propagated far from their origin, typically with longer periods (>10s) and more regular patterns than wind-sea. ' +
      'High-period swell (>12s) is ideal for surfing; low-period swell (<6s) indicates local chop. ' +
      'Swell direction indicates where the swell is coming from (degrees clockwise from north). ' +
      'Useful for surf forecasting, sailing passage planning, and aquaculture site assessment. ' +
      'Source: Open-Meteo Marine API, CC BY 4.0, no authentication required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'marine.sea_temperature',
    mcpName: 'marine.ocean.temperature',
    title: 'Sea Surface Temperature Forecast',
    description:
      'Hourly sea surface temperature (SST) forecast in degrees Celsius at an ocean coordinate for up to 16 days. ' +
      'SST is the temperature of the top layer of the ocean (~1m depth) and affects weather patterns, marine ecosystems, and fishing conditions. ' +
      'Useful for coral bleaching risk assessment, fishery management, coastal tourism planning, and climate monitoring. ' +
      'Returns time-indexed hourly values; null indicates no data (land areas or model gaps). ' +
      'Source: Open-Meteo Marine API, CC BY 4.0, no authentication required.',
    category: 'weather',
    annotations: READ_ONLY,
  },

  // MFAPI — India Mutual Funds (UC-507, 4 tools)
  {
    toolId: 'mfapi.scheme_search',
    mcpName: 'mfapi.schemes.search',
    title: 'India Mutual Fund Scheme Search',
    description:
      'Search across 37,000+ AMFI-registered India mutual fund schemes by name keyword. ' +
      'Returns matching scheme codes, names, and ISIN identifiers. ' +
      'Use the returned scheme_code to fetch current or historical NAV data. ' +
      'Supports partial matches — searching "HDFC" returns all HDFC schemes; "mid cap" returns all mid-cap funds. ' +
      'Data source: MFAPI (api.mfapi.in), MIT license, no authentication required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'mfapi.scheme_list',
    mcpName: 'mfapi.schemes.list',
    title: 'India Mutual Fund Scheme List',
    description:
      'Paginated list of all 37,000+ AMFI-registered India mutual fund schemes. ' +
      'Returns scheme codes, names, and ISIN identifiers for each page. ' +
      'Useful for bulk enumeration or building fund directories. ' +
      'Use mfapi.schemes.search for keyword-based lookup instead of iterating all pages. ' +
      'Data source: MFAPI (api.mfapi.in), MIT license, no authentication required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'mfapi.nav_latest',
    mcpName: 'mfapi.nav.latest',
    title: 'India Mutual Fund Latest NAV',
    description:
      'Get the most recent Net Asset Value (NAV) for an India mutual fund scheme by its AMFI scheme code. ' +
      'Returns the NAV in Indian Rupees (INR), the date of the NAV, and full scheme metadata including fund house, ' +
      'scheme type (Open/Close Ended), scheme category (Equity/Debt/Hybrid), and ISIN. ' +
      'NAVs are published by AMFI daily on business days; the returned date reflects the last published value. ' +
      'Use mfapi.schemes.search to find the scheme_code for a fund by name. ' +
      'Data source: MFAPI (api.mfapi.in), MIT license, no authentication required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'mfapi.nav_history',
    mcpName: 'mfapi.nav.history',
    title: 'India Mutual Fund NAV History',
    description:
      'Get historical Net Asset Value (NAV) records for an India mutual fund scheme, most recent first. ' +
      'Returns daily NAV values in Indian Rupees (INR) with dates. Some schemes have 20+ years of history. ' +
      'Useful for performance analysis, CAGR calculations, SIP return modelling, and trend visualization. ' +
      'Limit parameter controls how many records are returned (default 100, max 1000). ' +
      'Use mfapi.schemes.search to find the scheme_code for a fund by name. ' +
      'Data source: MFAPI (api.mfapi.in), MIT license, no authentication required.',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // EPA SDWIS — Safe Drinking Water Information System (UC-508, 4 tools)
  {
    toolId: 'sdwis.water_systems',
    mcpName: 'sdwis.water.systems',
    title: 'Search Public Water Systems',
    description:
      'Search EPA Safe Drinking Water Information System (SDWIS) for public water systems by state, ' +
      'system type (Community/Transient/Non-Transient), and activity status. Returns PWSID, system name, ' +
      'population served, service connections, water source type, and operator information. ' +
      'Covers 150,000+ US public water systems regulated under the Safe Drinking Water Act. ' +
      'Use sdwis.water.violations to check health violations for a specific system. ' +
      'Data source: EPA SDWIS Federal Reporting Services (data.epa.gov/efservice), US Gov public domain.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sdwis.violations',
    mcpName: 'sdwis.water.violations',
    title: 'Search Drinking Water Violations',
    description:
      'Search EPA SDWIS for drinking water violations by state and violation type. Returns violation code, ' +
      'health-based flag (MCL/Treatment Technique), contaminant code, compliance status, measured value, ' +
      'compliance period, return-to-compliance date, and public notification tier. ' +
      'Filter by health_based=true to focus on Maximum Contaminant Level (MCL) and Treatment Technique (TT) ' +
      'violations that directly endanger public health. Violation categories: MCL, TT, MRDL, MR, MON, RPT, PN. ' +
      'Use sdwis.water.enforcement to get enforcement actions associated with a PWSID from violations. ' +
      'Data source: EPA SDWIS Federal Reporting Services, US Gov public domain.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sdwis.enforcement',
    mcpName: 'sdwis.water.enforcement',
    title: 'Lookup Water System Enforcement Actions',
    description:
      'Look up EPA enforcement actions taken against public water systems under the Safe Drinking Water Act. ' +
      'Filter by PWSID (Public Water System Identifier) to get all enforcement history for a specific utility, ' +
      'or filter by enforcement action type code. Returns enforcement date, action type, and originator. ' +
      'Enforcement types include Formal Administrative Orders (EFG), Compliance Schedules, ' +
      'Referral to State, and Civil Penalties. ' +
      'Combine with sdwis.water.violations to understand the full compliance picture for a water system. ' +
      'Data source: EPA SDWIS Federal Reporting Services, US Gov public domain.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sdwis.service_areas',
    mcpName: 'sdwis.water.service_areas',
    title: 'Lookup Water System Service Areas',
    description:
      'Look up the geographic service areas of EPA-regulated public water systems. Returns counties, cities, ' +
      'and zip codes served by each utility, along with area type and tribal codes. ' +
      'Filter by state or county to discover which water systems serve a specific area. ' +
      'Filter by PWSID to get all geographic areas served by a specific utility. ' +
      'Useful for mapping water service boundaries, identifying utilities for an address, ' +
      'or understanding the geographic scope of a water quality issue. ' +
      'Data source: EPA SDWIS Federal Reporting Services Geographic Areas table, US Gov public domain.',
    category: 'health',
    annotations: READ_ONLY,
  },

  // BLS Macro — CPI, unemployment, payrolls, generic series (UC-509, 4 tools)
  {
    toolId: 'bls-macro.series',
    mcpName: 'bls.macro.series',
    title: 'BLS Time Series Lookup',
    description:
      'Fetch one or more U.S. Bureau of Labor Statistics (BLS) time series by series ID. ' +
      'Accepts up to 5 comma-separated series IDs and an optional year range (up to 10 years with a registered key). ' +
      'Returns chronological data points with year, period, period name, and numeric value. ' +
      'Common series IDs: CUUR0000SA0 (CPI All Items), LNS14000000 (Unemployment Rate), ' +
      'CES0000000001 (Total Nonfarm Payrolls), PRS85006092 (Nonfarm Business Productivity), ' +
      'CIU1010000000000A (Employment Cost Index). ' +
      'Find additional series IDs at bls.gov/data/. US Gov public domain, no upstream cost.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bls-macro.cpi',
    mcpName: 'bls.macro.cpi',
    title: 'Consumer Price Index (Inflation)',
    description:
      'Get U.S. Consumer Price Index (CPI-U) data by item category and year range. ' +
      'Returns monthly values, year-over-year percentage change, and a full data series. ' +
      'Categories: "all" = All Items (headline inflation), "food", "energy", "shelter", ' +
      '"core" = All Items Less Food and Energy. ' +
      'Covers data from 1913 (All Items) through the most recently released month. ' +
      'Ideal for inflation analysis, cost-of-living calculations, real-return adjustments, ' +
      'and economic research. Data source: BLS Consumer Expenditure Survey, CPI-U series (urban consumers).',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bls-macro.unemployment',
    mcpName: 'bls.macro.unemployment',
    title: 'U.S. Unemployment Rate',
    description:
      'Get U.S. national labor market data from the BLS Current Population Survey. ' +
      'Measures: "rate" = Unemployment Rate % (U-3, official), ' +
      '"participation" = Labor Force Participation Rate %, ' +
      '"employment_ratio" = Employment-Population Ratio %, ' +
      '"long_term" = Long-term Unemployed (27+ weeks, in thousands). ' +
      'Returns monthly data series with latest value and full history up to 10 years. ' +
      'Data goes back to 1948 for the unemployment rate. ' +
      'Use for macroeconomic research, labor market trend analysis, and policy evaluation.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bls-macro.payrolls',
    mcpName: 'bls.macro.payrolls',
    title: 'U.S. Nonfarm Payroll Employment',
    description:
      'Get U.S. nonfarm payroll employment data from the BLS Current Employment Statistics (CES) survey. ' +
      'Returns seasonally adjusted monthly payroll counts in thousands of jobs. ' +
      'Industries: "total" = Total Nonfarm, "private" = Total Private, "manufacturing", ' +
      '"construction", "professional" = Professional & Business Services, ' +
      '"healthcare" = Healthcare & Social Assistance, "retail" = Retail Trade, "finance" = Financial Activities. ' +
      'Monthly jobs report data — the most closely watched U.S. economic indicator. ' +
      'Use for labor market analysis, sector employment trends, and economic research.',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // MBTA Transit (UC-510) — 4 tools
  {
    toolId: 'mbta-transit.routes',
    mcpName: 'mbta.transit.routes',
    title: 'MBTA Routes List',
    description:
      'List Boston MBTA transit routes by type — subway (Red/Orange/Blue/Green lines), ' +
      'commuter rail (Providence, Fairmount, etc.), bus, and ferry. ' +
      'Returns route ID, long name, type label, direction names and destinations, fare class, and brand color. ' +
      'Route IDs returned here are used as filter inputs for mbta-transit.stops, mbta-transit.alerts, ' +
      'and mbta-transit.predictions. Filter by type: 0=Light Rail, 1=Heavy Rail/Subway, ' +
      '2=Commuter Rail, 3=Bus, 4=Ferry. MassDOT Open Data License, no upstream cost.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'mbta-transit.stops',
    mcpName: 'mbta.transit.stops',
    title: 'MBTA Stops & Stations',
    description:
      'Find Boston MBTA stops and stations — filter by route ID or by geographic coordinates + radius. ' +
      'Returns stop ID, name, latitude/longitude, municipality, vehicle type, platform info, ' +
      'and wheelchair boarding status. Stop IDs returned here are used as filter inputs for ' +
      'mbta-transit.alerts and mbta-transit.predictions. Use location_type=1 to return only ' +
      'major stations (parent stops); location_type=0 for individual platforms. ' +
      'Example: route="Red" returns all 22 Red Line stops from Alewife to Braintree/Ashmont. ' +
      'MassDOT Open Data License, no upstream cost.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'mbta-transit.alerts',
    mcpName: 'mbta.transit.alerts',
    title: 'MBTA Service Alerts',
    description:
      'Get active Boston MBTA service disruption alerts — delays, cancellations, detours, ' +
      'shuttle buses, station closures, and elevator/escalator outages. ' +
      'Returns alert header, effect type, cause, severity (0–10), lifecycle status, ' +
      'affected routes and stops, and active time period. ' +
      'Filter by route ID (e.g. "Red"), stop ID, minimum severity, lifecycle ' +
      '(ONGOING/UPCOMING/NEW), or effect type (DELAY/CANCELLATION/SHUTTLE/DETOUR/SUSPENSION). ' +
      'Severity 7+ = moderate disruption; 9–10 = major service change. ' +
      'MassDOT Open Data License, real-time data, no upstream cost.',
    category: 'world',
    annotations: READ_ONLY,
  },
  // UNHCR Population (4)
  {
    toolId: 'unhcr.population',
    mcpName: 'unhcr.population.statistics',
    title: 'UNHCR Refugee & Displacement Statistics',
    description:
      'Get UNHCR global or per-country refugee and displaced-person population statistics (1951–present). ' +
      'Returns refugee counts, asylum seekers, internally displaced persons (IDPs), stateless persons, ' +
      'other people of concern (OOC), other in need of protection (OIP), and host community (HST) figures. ' +
      'Filter by year (e.g. 2023), country of origin ISO3 code (e.g. SYR for Syria, AFG for Afghanistan, ' +
      'UKR for Ukraine), or country of asylum ISO3 (e.g. DEU, TUR, COL). ' +
      'Omit all filters for global aggregates across all years. Paginated; default 10 items. ' +
      'UNHCR Data License — open humanitarian data, no upstream cost.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'unhcr.solutions',
    mcpName: 'unhcr.population.solutions',
    title: 'UNHCR Durable Solutions Data',
    description:
      'Get UNHCR durable solutions data — voluntary repatriation (returned refugees), resettlement, ' +
      'and naturalization/citizenship grants for refugees and IDPs (1951–present). ' +
      'Durable solutions represent the three pathways out of displacement recognized by international law. ' +
      'Filter by year, country of origin ISO3 (coo), or country of asylum ISO3 (coa). ' +
      'Includes aggregate totals when available. Paginated; default 10 items. ' +
      'UNHCR Data License — open humanitarian data, no upstream cost.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'unhcr.asylum_applications',
    mcpName: 'unhcr.asylum.applications',
    title: 'UNHCR Asylum Applications',
    description:
      'Get UNHCR asylum application counts — number of new asylum claims filed by year and country. ' +
      'Data includes procedure type (G=Government, U=UNHCR), application type (N=New, A=Appeal), ' +
      'decision level (FI=First Instance, AR=Appeal/Review), and applicant category (P=Person). ' +
      'Filter by year, country of origin ISO3 (coo), or country of asylum ISO3 (coa). ' +
      'Covers 1951–present with totals when available. Paginated; default 10 items. ' +
      'UNHCR Data License — open humanitarian data, no upstream cost.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'unhcr.asylum_decisions',
    mcpName: 'unhcr.asylum.decisions',
    title: 'UNHCR Asylum Decisions',
    description:
      'Get UNHCR asylum decision outcomes — recognized refugees, other positive decisions, ' +
      'rejections, and closed/withdrawn cases by year and country. ' +
      'Includes recognition rate context: recognized + other_positive = total granted protection. ' +
      'Filter by year, country of origin ISO3 (coo), or country of asylum ISO3 (coa). ' +
      'Covers 1951–present with aggregate totals. Paginated; default 10 items. ' +
      'UNHCR Data License — open humanitarian data, no upstream cost.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'mbta-transit.predictions',
    mcpName: 'mbta.transit.predictions',
    title: 'MBTA Real-Time Predictions',
    description:
      'Get real-time arrival and departure predictions for Boston MBTA stops — ' +
      'live vehicle tracking data for subway, bus, commuter rail, and ferry. ' +
      'Returns predicted arrival_time, departure_time (ISO 8601), direction, ' +
      'status (e.g. "Boarding"), schedule relationship (SCHEDULED/SKIPPED/NO_DATA), ' +
      'and associated route, stop, trip, and vehicle IDs. ' +
      'Requires at least one filter: stop ID (e.g. "place-sstat" for South Station, ' +
      '"place-pktrm" for Park Street) or route ID. Use direction_id to filter inbound (1) ' +
      'vs outbound (0). MassDOT Open Data License, real-time live data, no upstream cost.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // GeoNames geographical database (UC-512, 4 tools)
  {
    toolId: 'geonames.place.search',
    mcpName: 'geonames.place.search',
    title: 'GeoNames Place Search',
    description:
      'Search the GeoNames geographical database for places, populated areas, mountains, rivers, ' +
      'and 12M+ geographical features worldwide. Filter by country (ISO-3166 2-letter code), ' +
      'feature class (A=administrative, P=populated place, T=mountain, H=water body, S=building/spot), ' +
      'and feature code (e.g. PPLC=capital, MT=mountain, STM=stream). ' +
      'Results include geoname_id, lat/lng, country, admin1/admin2, population, and Wikipedia link. ' +
      'Order by relevance (default), population, elevation, or Wikipedia linkage. ' +
      'Supports multilingual name lookup via lang parameter. CC BY 4.0 open data, no upstream cost.',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geonames.postal.lookup',
    mcpName: 'geonames.postal.lookup',
    title: 'GeoNames Postal Code Lookup',
    description:
      'Look up postal / ZIP codes and their place names across 100+ countries using the GeoNames database. ' +
      'Search by postal code (e.g. "10001" for NYC, "SW1A 1AA" for London, "75001" for Paris) ' +
      'or by place name. Returns matching postal codes with lat/lng, admin area names, ' +
      'and ISO-3166-2 subdivision codes. Use the country filter (ISO-3166 2-letter) to narrow results. ' +
      'Covers US, UK, Germany, France, Australia, Canada, Japan, India, Brazil, and 90+ more. ' +
      'CC BY 4.0 open data, no upstream cost.',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geonames.country.info',
    mcpName: 'geonames.country.info',
    title: 'GeoNames Country Info',
    description:
      'Get structured metadata for any country or all countries from the GeoNames database. ' +
      'Returns country code (ISO-3166 alpha-2/alpha-3/numeric), capital, continent, official languages, ' +
      'population, area in km², currency code, postal code format/regex, geoname_id, ' +
      'and a bounding box (north/south/east/west lat-lng). ' +
      'Omit country to retrieve all 250 countries in a single response. ' +
      'Supports localized country names via lang parameter. CC BY 4.0 open data, no upstream cost.',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geonames.place.timezone',
    mcpName: 'geonames.place.timezone',
    title: 'GeoNames Timezone Lookup',
    description:
      'Look up the timezone for any coordinates on Earth using the GeoNames database. ' +
      'Returns IANA timezone ID (e.g. "America/New_York", "Europe/London"), ' +
      'GMT offset, DST offset, raw (winter) offset, current local time, ' +
      "today's sunrise and sunset times (local), and the country at those coordinates. " +
      'Useful for scheduling tasks across time zones, converting UTC timestamps, ' +
      'or annotating location data with timezone context. CC BY 4.0 open data, no upstream cost.',
    category: 'location',
    annotations: READ_ONLY,
  },

  // UK National Grid Carbon Intensity (UC-513, 4 tools)
  {
    toolId: 'carbonintensity.current',
    mcpName: 'carbonintensity.energy.current',
    title: 'UK Carbon Intensity — Current',
    description:
      'Get the current national carbon intensity of UK electricity generation from the National Grid ESO. ' +
      'Returns the half-hour period timestamps, forecast intensity in gCO2/kWh, actual intensity in gCO2/kWh ' +
      '(when available), and a qualitative index (very low / low / moderate / high / very high). ' +
      'Data is updated every 30 minutes. Lower values indicate cleaner electricity — useful for smart ' +
      'energy scheduling, EV charging optimisation, and sustainability dashboards. CC BY 4.0, no upstream cost.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'carbonintensity.generation',
    mcpName: 'carbonintensity.energy.generation',
    title: 'UK Carbon Intensity — Generation Mix',
    description:
      'Get the current UK national electricity generation mix by fuel source from the National Grid ESO. ' +
      'Returns the percentage contribution of each fuel type: biomass, coal, imports, gas, nuclear, other, ' +
      'hydro, solar, and wind. Data is updated every 30 minutes. ' +
      'Useful for understanding real-time renewable vs fossil fuel share, carbon-aware computing, ' +
      'and energy transition analysis. CC BY 4.0, no upstream cost.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'carbonintensity.regional',
    mcpName: 'carbonintensity.energy.regional',
    title: 'UK Carbon Intensity — Regional Breakdown',
    description:
      'Get carbon intensity and generation mix for UK electricity distribution regions. ' +
      'Returns data for all 14–18 UK DNO (Distribution Network Operator) regions, or a single region ' +
      'by region ID (1=North Scotland, 2=South Scotland, 3=North West England, 4=North East England, ' +
      '5=Yorkshire, 6=North Wales & Mersey, 7=South Wales, 8=West Midlands, 9=East Midlands, ' +
      '10=East England, 11=South West England, 12=South England, 13=London, 14=South East England). ' +
      'Each region includes forecast intensity in gCO2/kWh, qualitative index, and generation mix percentages. ' +
      'Useful for location-aware carbon-minimising energy decisions. CC BY 4.0, no upstream cost.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'carbonintensity.forecast',
    mcpName: 'carbonintensity.energy.forecast',
    title: 'UK Carbon Intensity — 24-Hour Forecast',
    description:
      'Get the 24-hour ahead forecast of UK national carbon intensity from the National Grid ESO. ' +
      'Returns up to 48 half-hour periods (fully covering the next 24 hours), each with a forecast ' +
      'intensity in gCO2/kWh and a qualitative index (very low / low / moderate / high / very high). ' +
      'Use the optional periods parameter to limit results (e.g. periods=6 for 3 hours ahead). ' +
      'Ideal for scheduling carbon-intensive workloads, EV charging, or energy storage dispatch ' +
      'at the lowest-carbon future window. CC BY 4.0, no upstream cost.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // Open Topo Data (4)
  {
    toolId: 'opentopodata.point',
    mcpName: 'opentopodata.elevation.point',
    title: 'Open Topo Data — Single Point Elevation',
    description:
      'Get land surface elevation (metres above sea level) for a single latitude/longitude coordinate. ' +
      'Supports three global datasets: srtm90m (NASA SRTM 90m resolution, default), srtm30m (NASA SRTM 30m), ' +
      'and aster30m (ASTER 30m, best for high-altitude regions like Everest). ' +
      'Returns elevation in metres with the dataset name and the snapped coordinates. ' +
      'Use for terrain analysis, hiking route planning, flight-path clearance checks, and GIS workflows. ' +
      'MIT licence, no auth, no upstream cost.',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'opentopodata.batch',
    mcpName: 'opentopodata.elevation.batch',
    title: 'Open Topo Data — Batch Elevation Query',
    description:
      'Get land surface elevation for up to 100 lat/lon coordinates in a single request. ' +
      'All points share the same dataset (srtm90m default, srtm30m, or aster30m). ' +
      'Returns an array of results, each with elevation_m, lat, lon, and dataset. ' +
      'Ideal for elevation profiling along a route, contour-line computation, or bulk terrain analysis. ' +
      'MIT licence, no auth, no upstream cost.',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'opentopodata.high_res',
    mcpName: 'opentopodata.elevation.high_res',
    title: 'Open Topo Data — High-Resolution Regional Elevation',
    description:
      'Get high-resolution elevation for a single coordinate using regional datasets: ' +
      'ned10m (USGS National Elevation Dataset 10m, continental US only) or ' +
      'eudem25m (EU-DEM 25m, Europe only). ' +
      'Returns elevation in metres with dataset name. Use ned10m for US urban/terrain analysis ' +
      'and eudem25m for European geospatial workflows requiring higher accuracy than SRTM. ' +
      'MIT licence, no auth, no upstream cost.',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'opentopodata.ocean',
    mcpName: 'opentopodata.elevation.ocean',
    title: 'Open Topo Data — Ocean Depth (Bathymetry)',
    description:
      'Get ocean floor depth (metres, negative values below sea level) at a lat/lon coordinate ' +
      'using the GEBCO 2020 global bathymetric dataset (450m resolution). ' +
      'Returns depth in metres; negative values indicate depth below sea level, ' +
      'positive values indicate land elevation above sea level. ' +
      'Use for marine navigation planning, submarine cable routing, oceanographic research, ' +
      'and coastal engineering. MIT licence, no auth, no upstream cost.',
    category: 'location',
    annotations: READ_ONLY,
  },

  // MET Norway (UC-515) — Norwegian Meteorological Institute (4 tools)
  {
    toolId: 'metno.forecast',
    mcpName: 'metno.weather.forecast',
    title: 'MET Norway — 9-Day Hourly Weather Forecast',
    description:
      'Get a 9-day (216-hour) hourly weather forecast for any global lat/lon point from the ' +
      'Norwegian Meteorological Institute Locationforecast 2.0 model. ' +
      'Returns air temperature, wind speed/direction/gusts, cloud cover, humidity, pressure, UV index, ' +
      'precipitation amounts and probability, and symbolic weather codes (e.g. clearsky_day, rain). ' +
      'Global coverage. CC BY 4.0 + NLOD 2.0, no auth, no upstream cost.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'metno.nowcast',
    mcpName: 'metno.weather.nowcast',
    title: 'MET Norway — Precipitation Nowcast (2-Hour)',
    description:
      'Get a short-term precipitation nowcast with 5-minute intervals for the next ~2 hours ' +
      'from the Norwegian Meteorological Institute Nowcast 2.0 radar model. ' +
      'Returns precipitation rate, air temperature, wind speed/direction/gusts, relative humidity, ' +
      'UV index, and weather symbol codes. ' +
      'Coverage: Norway and Scandinavia (approx 53–90°N, 20°W–40°E). ' +
      'Ideal for hyperlocal outdoor activity planning, event logistics, and real-time rainfall monitoring. ' +
      'CC BY 4.0 + NLOD 2.0, no auth, no upstream cost.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'metno.alerts',
    mcpName: 'metno.weather.alerts',
    title: 'MET Norway — Active Weather Alerts',
    description:
      'Get all active weather alerts issued by the Norwegian Meteorological Institute for Norway. ' +
      'Alerts cover events such as gale, storm, heavy rain, snow, ice, avalanche, and fog. ' +
      'Each alert includes event type, awareness level (green/yellow/orange/red), severity, certainty, ' +
      'affected counties, description, consequences, and valid time interval. ' +
      'Filter by event type slug (wind, rain, snow, ice, fog, avalanche) or by county name. ' +
      'Returns English or Norwegian text. CC BY 4.0 + NLOD 2.0, no auth, no upstream cost.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'metno.sunrise',
    mcpName: 'metno.astronomy.sunrise',
    title: 'MET Norway — Sunrise, Sunset & Moon Times',
    description:
      'Get precise sunrise, sunset, solar noon, and solar midnight times for any global coordinate ' +
      'and date from the Norwegian Meteorological Institute Sunrise 3.0 API. ' +
      'For the Sun: returns sunrise time + azimuth, sunset time + azimuth, solar noon elevation and visibility. ' +
      'For the Moon: returns moonrise, moonset, high moon, low moon, and lunar phase (0–360°). ' +
      'Supports UTC offset for local time output. ' +
      'Global coverage; handles polar day/night (midnight sun / polar night). ' +
      'CC BY 4.0 + NLOD 2.0, no auth, no upstream cost.',
    category: 'weather',
    annotations: READ_ONLY,
  },

  // Frankfurter.dev (4)
  {
    toolId: 'frankfurter.latest',
    mcpName: 'frankfurter.currency.latest',
    title: 'Frankfurter — Latest ECB Exchange Rates',
    description:
      'Get the latest European Central Bank (ECB) reference exchange rates from Frankfurter.dev (api.frankfurter.dev/v1). ' +
      'Returns rates for 33 major currencies relative to a base currency (default EUR). ' +
      'Rates are updated each business day at ~16:00 CET by the ECB. ' +
      'Supports optional base currency override, target currency filter, and amount scaling for instant conversion. ' +
      'No auth required; public domain ECB data. ' +
      'Ideal for FX dashboards, invoicing, and multi-currency apps.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'frankfurter.historical',
    mcpName: 'frankfurter.currency.historical',
    title: 'Frankfurter — Historical ECB Rates by Date',
    description:
      'Retrieve ECB reference exchange rates for a specific historical date from Frankfurter.dev. ' +
      'Coverage starts from 1999-01-04 (Euro launch). ' +
      'If the requested date falls on a weekend or ECB holiday, the preceding business day is returned. ' +
      'Supports optional base currency, target currency filter, and amount scaling. ' +
      'Returns 33 major currencies: AUD, BRL, CAD, CHF, CNY, CZK, DKK, GBP, HKD, HUF, IDR, ILS, INR, ISK, JPY, KRW, MXN, MYR, NOK, NZD, PHP, PLN, RON, SEK, SGD, THB, TRY, USD, ZAR and more. ' +
      'No auth required; public domain ECB data.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'frankfurter.series',
    mcpName: 'frankfurter.currency.series',
    title: 'Frankfurter — ECB Rate Time Series',
    description:
      'Fetch a time series of ECB exchange rates between two dates from Frankfurter.dev. ' +
      'Returns a date-keyed map of rates covering every business day in the range. ' +
      'Coverage starts from 1999-01-04. Omit end_date to get rates through the latest available date. ' +
      'Narrow results to specific currencies with the symbols parameter to reduce response size. ' +
      'Use for trend analysis, backtesting, historical P&L calculations, and charting FX movements. ' +
      'No auth required; public domain ECB data.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'frankfurter.currencies',
    mcpName: 'frankfurter.currency.list',
    title: 'Frankfurter — List Supported Currencies',
    description:
      'Returns all 33 currencies supported by the Frankfurter.dev ECB exchange rate API with their full English names. ' +
      'Use this to discover valid currency codes before calling frankfurter.currency.latest, ' +
      'frankfurter.currency.historical, or frankfurter.currency.series. ' +
      'No parameters required. No auth; public domain ECB data.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  // SunriseSunset.io (4)
  {
    toolId: 'sunrisesunset.daily',
    mcpName: 'sunrisesunset.astronomy.daily',
    title: 'SunriseSunset — Daily Sun & Moon Times',
    description:
      'Get complete daily astronomical data for any lat/lng and date from SunriseSunset.io. ' +
      'Returns sunrise, sunset, dawn, dusk, first/last light, solar noon, golden hour, day length, ' +
      'nautical twilight, current sun altitude and azimuth, moonrise, moonset, moon phase name, ' +
      'moon illumination percentage, and lunar phase value (0–1 cycle). ' +
      'Supports "today", "tomorrow", or any YYYY-MM-DD date. ' +
      'Timezone auto-detected from coordinates or specify an IANA name. ' +
      'Time format: 12h, 24h, or Unix timestamps. No auth required; free commercial use.',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sunrisesunset.range',
    mcpName: 'sunrisesunset.astronomy.range',
    title: 'SunriseSunset — Date Range Sun & Moon Data',
    description:
      'Get sunrise/sunset/moon phase data for a date range of up to 365 days for any global coordinate. ' +
      'Returns an array of daily records each with: sunrise, sunset, solar noon, golden hour, day length, ' +
      'moon phase name, and moon illumination percentage. ' +
      'Useful for seasonal planning, photography planning, agriculture, and event scheduling. ' +
      'Specify date_start and date_end in YYYY-MM-DD format; max 365 days per call. ' +
      'No auth required; free commercial use. Source: SunriseSunset.io.',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sunrisesunset.moon_phase',
    mcpName: 'sunrisesunset.moon.phase',
    title: 'SunriseSunset — Moon Phase & Lunar Times',
    description:
      'Get moon phase, lunar illumination, and moonrise/moonset times for any location and date. ' +
      'Returns: moon phase name (New Moon, Waxing Crescent, First Quarter, Waxing Gibbous, Full Moon, ' +
      'Waning Gibbous, Last Quarter, Waning Crescent), phase value (0–1 cycle fraction), ' +
      'moon illumination percentage (0–100), moonrise time, moonset time, ' +
      'and flags for polar cases (moon_always_up / moon_always_down). ' +
      'No auth required; free commercial use. Source: SunriseSunset.io.',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sunrisesunset.sun_position',
    mcpName: 'sunrisesunset.sun.position',
    title: 'SunriseSunset — Sun Position & Golden Hour',
    description:
      'Get the current sun position (altitude and azimuth), sunrise/sunset compass bearings, ' +
      'golden hour window, and solar noon time for any location and date. ' +
      'Sun altitude is the elevation angle above the horizon (negative = below). ' +
      'Sun azimuth is the compass direction of the sun (0=North, 90=East, 180=South, 270=West). ' +
      'Golden hour is the last hour before sunset — ideal for photography. ' +
      'Includes dawn, dusk, and day length. ' +
      'Useful for solar panel orientation, photography planning, outdoor event scheduling, and navigation. ' +
      'No auth required; free commercial use. Source: SunriseSunset.io.',
    category: 'space',
    annotations: READ_ONLY,
  },

  // PokéAPI (UC-518, 4 tools)
  {
    toolId: 'pokeapi.pokemon',
    mcpName: 'pokeapi.pokemon.detail',
    title: 'PokéAPI — Pokemon Details',
    description:
      'Get detailed data for any of 1025+ Pokemon by name or Pokedex ID. ' +
      'Returns: types (e.g. fire/flying), base stats (HP, Attack, Defense, Sp.Atk, Sp.Def, Speed), ' +
      'abilities (including hidden ability), first 20 moves, height (dm), weight (hg), ' +
      'base experience, and sprite image URLs. ' +
      'Examples: "pikachu" (id 25), "charizard" (id 6), "mewtwo" (id 150), "eevee" (id 133). ' +
      'Hyphenated names accepted: "mr-mime", "tapu-koko", "jangmo-o". ' +
      'No auth required; fair-use free API. Source: PokéAPI (pokeapi.co).',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'pokeapi.species',
    mcpName: 'pokeapi.pokemon.species',
    title: 'PokéAPI — Pokemon Species Info',
    description:
      'Get species-level information for any Pokemon including Pokedex flavor text, ' +
      'genus (e.g. "Mouse Pokemon"), generation introduced, growth rate, capture rate, ' +
      'base happiness, gender ratio, egg groups, habitat, color, evolution chain URL, ' +
      'and flags for baby/legendary/mythical status. ' +
      'Flavor text is the description shown in the in-game Pokedex (English, from most recent main game). ' +
      'Gender rate: -1 = genderless, 0 = always male, 8 = always female, others are eighths female. ' +
      'Examples: "pikachu", "eevee", "mewtwo", "snorlax". ' +
      'No auth required; fair-use free API. Source: PokéAPI (pokeapi.co).',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'pokeapi.move',
    mcpName: 'pokeapi.move.detail',
    title: 'PokéAPI — Pokemon Move Details',
    description:
      'Get detailed data for any of 900+ Pokemon moves by name or move ID. ' +
      'Returns: type, damage class (physical/special/status), power, accuracy, PP (power points), ' +
      'priority, effect chance, short effect description, full effect text, target scope, ' +
      'generation introduced, and battle metadata (ailment, drain, healing, crit rate, flinch chance). ' +
      'Examples: "tackle" (power 40), "thunderbolt" (power 90, 10% paralysis), ' +
      '"surf" (power 90, hits all adjacent), "swords-dance" (status, raises Attack). ' +
      'Multi-word move names use hyphens: "ice-beam", "fire-blast", "hyper-beam". ' +
      'No auth required; fair-use free API. Source: PokéAPI (pokeapi.co).',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  // SA National Treasury Municipal Finance (UC-519, 4 tools)
  {
    toolId: 'samuni.municipalities',
    mcpName: 'samuni.reference.municipalities',
    title: 'SA Municipal — List Municipalities',
    description:
      'List all South African municipalities registered with the National Treasury. ' +
      'Returns up to 300 municipalities with demarcation code, name, province, category, ' +
      'phone number, and website URL. ' +
      'Filter by province code (EC, GP, KZN, WC, etc.) or category (A=Metro, B=Local, C=District). ' +
      'South Africa has 8 metropolitan (A), ~205 local (B), and 44 district (C) municipalities. ' +
      'Demarcation codes are needed for other samuni tools (e.g. CPT=Cape Town, JHB=Johannesburg, ' +
      'ETH=eThekwini/Durban, TSH=Tshwane, EKU=Ekurhuleni). ' +
      'No auth required. Source: SA National Treasury Municipal Finance Management Act (MFMA) data portal.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'samuni.audit_opinions',
    mcpName: 'samuni.finance.audit_opinions',
    title: 'SA Municipal — Audit Opinions',
    description:
      'Get Auditor-General of South Africa (AGSA) audit outcomes for municipalities. ' +
      'Opinion codes: clean=Clean Audit, unqualified_emphasis_of_matter=Unqualified with Emphasis of Matter, ' +
      'qualified=Qualified Opinion, adverse=Adverse Opinion, disclaimer=Disclaimer of Opinion. ' +
      'Returns year, opinion label, and PDF report URL. Filter by demarcation code and/or year. ' +
      'Data covers 2010-2024 for all 257 municipalities. ' +
      'Useful for transparency reporting, credit risk assessment, and governance analysis. ' +
      'No auth required. Source: SA National Treasury MFMA data portal.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'samuni.income_expenditure',
    mcpName: 'samuni.finance.income_expenditure',
    title: 'SA Municipal — Income & Expenditure',
    description:
      'Get income and expenditure (Statement of Financial Performance) data for a South African municipality. ' +
      'Returns audited actual (AUDA) annual line items from the mSCOA chart of accounts. ' +
      'Covers revenue sources (rates, grants, service charges) and expenditure categories ' +
      '(employee costs, repairs, capital transfers). ' +
      'Data is Section 71-level aggregation from 2019-20 onwards. ' +
      'Requires demarcation code (e.g. CPT, JHB, ETH, TSH, EKU, BUF). ' +
      'No auth required. Source: SA National Treasury MFMA incexp_v2 cube.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'samuni.officials',
    mcpName: 'samuni.reference.officials',
    title: 'SA Municipal — Officials Directory',
    description:
      'Get contact details for senior officials of a South African municipality. ' +
      'Returns role, name, title, email address, and phone number. ' +
      'Common roles: Mayor/Executive Mayor, Deputy Mayor/Executive Mayor, Municipal Manager, ' +
      'Chief Financial Officer, Speaker, Chief Audit Executive. ' +
      'Requires demarcation code (e.g. CPT=Cape Town, JHB=Johannesburg, ETH=eThekwini). ' +
      'No auth required. Source: SA National Treasury MFMA officials cube.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'pokeapi.type',
    mcpName: 'pokeapi.type.matchup',
    title: 'PokéAPI — Pokemon Type Matchup',
    description:
      'Get the full damage relation chart for any of the 18 Pokemon types. ' +
      'Returns offensive relations (double/half/no damage TO other types) and ' +
      'defensive relations (double/half/no damage FROM other types). ' +
      'Also returns the total count of Pokemon and moves of that type. ' +
      'Valid types: normal, fighting, flying, poison, ground, rock, bug, ghost, steel, ' +
      'fire, water, grass, electric, psychic, ice, dragon, dark, fairy. ' +
      'Useful for team building, battle strategy, and type-effectiveness calculators. ' +
      'No auth required; fair-use free API. Source: PokéAPI (pokeapi.co).',
    category: 'entertainment',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // TVMaze — TV Show Database (UC-520, 5 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'tvmaze.show_search',
    mcpName: 'tvmaze.shows.search',
    title: 'Search TV Shows',
    description:
      'Search 25,000+ TV shows by title — returns name, genres, status, network, rating, ' +
      'premiere/end dates, runtime, summary, and relevance score. ' +
      'Results ordered by relevance. Covers broadcast, cable, and streaming shows worldwide. ' +
      'No auth required. Source: TVmaze.com (CC BY-SA).',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tvmaze.show_details',
    mcpName: 'tvmaze.shows.details',
    title: 'Get TV Show Details',
    description:
      'Get full details for a TV show by TVMaze ID — genres, status, network/streaming channel, ' +
      'schedule (days/time), rating, premiere/end dates, runtime, IMDB/TheTVDB IDs, ' +
      'official site URL, and plain-text summary. ' +
      'Use show_search to find the TVMaze ID first. ' +
      'No auth required. Source: TVmaze.com (CC BY-SA).',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tvmaze.show_episodes',
    mcpName: 'tvmaze.shows.episodes',
    title: 'Get TV Show Episodes',
    description:
      'Get the complete episode list for a TV show — season/episode numbers, air dates, ' +
      'runtimes, episode ratings, and plain-text summaries. ' +
      'Filter by season number to get only episodes from a specific season. ' +
      'Optionally include special episodes. ' +
      'No auth required. Source: TVmaze.com (CC BY-SA).',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tvmaze.show_cast',
    mcpName: 'tvmaze.shows.cast',
    title: 'Get TV Show Cast',
    description:
      'Get the cast list for a TV show — actor names, birthdays, genders, countries, ' +
      'and the character they play (name + image). ' +
      'Flags whether the actor plays themselves or a voice role. ' +
      'No auth required. Source: TVmaze.com (CC BY-SA).',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tvmaze.schedule',
    mcpName: 'tvmaze.schedule.broadcast',
    title: 'TV Broadcast Schedule',
    description:
      'Get the TV broadcast schedule for a specific country and date — lists all episodes airing ' +
      'that day with show name, network/channel, air time, season/episode numbers, and ratings. ' +
      'Supports broadcast TV (default) or streaming/web channels (Netflix, Hulu, etc.). ' +
      'Country: ISO 3166-1 alpha-2 code (US, GB, AU, CA, DE, etc.). Date: YYYY-MM-DD (defaults to today). ' +
      'No auth required. Source: TVmaze.com (CC BY-SA).',
    category: 'entertainment',
    annotations: READ_ONLY,
  },

  // HackerNews Firebase (UC-521) — real-time HN stories, items, user profiles; CC BY 3.0, no auth
  {
    toolId: 'hackernews.top_stories',
    mcpName: 'hackernews.stories.top',
    title: 'HackerNews Top Stories',
    description:
      'Fetch the current top stories from Hacker News — returns up to 20 posts with title, URL, ' +
      'score, author, comment count, and submission time. The HN front page algorithm ranks by score ' +
      'and recency. Results reflect the live HackerNews ranking updated every few minutes. ' +
      'No auth required. Data: Hacker News (CC BY 3.0).',
    category: 'news',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hackernews.new_stories',
    mcpName: 'hackernews.stories.new',
    title: 'HackerNews New Stories',
    description:
      'Fetch the most recently submitted stories from Hacker News — up to 20 posts sorted by ' +
      'submission time (newest first). Useful for monitoring breaking tech news and community discussion ' +
      'before posts gain front-page visibility. Returns title, URL, author, score, and comment count. ' +
      'No auth required. Data: Hacker News (CC BY 3.0).',
    category: 'news',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hackernews.best_stories',
    mcpName: 'hackernews.stories.best',
    title: 'HackerNews Best Stories',
    description:
      'Fetch the best-rated stories from Hacker News — high-quality posts selected by the HN ' +
      '"best" feed algorithm which balances score, engagement, and editorial quality. ' +
      'Up to 20 stories with title, URL, author, score, and comment count. ' +
      'No auth required. Data: Hacker News (CC BY 3.0).',
    category: 'news',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hackernews.item_details',
    mcpName: 'hackernews.item.details',
    title: 'HackerNews Item Details',
    description:
      'Fetch full details for any HackerNews item by its integer ID — works for stories, comments, ' +
      'Ask HN posts, Show HN posts, jobs, and polls. Returns type, title, URL, author, score, ' +
      'body text (HTML-stripped), comment count, child comment IDs (up to 10), and direct HN link. ' +
      'No auth required. Data: Hacker News (CC BY 3.0).',
    category: 'news',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hackernews.user_profile',
    mcpName: 'hackernews.user.profile',
    title: 'HackerNews User Profile',
    description:
      'Fetch a HackerNews user profile by username — returns karma score, account creation date, ' +
      'about/bio text, and total submission count (stories + comments). Useful for checking contributor ' +
      'credibility or researching HN community members. ' +
      'No auth required. Data: Hacker News (CC BY 3.0).',
    category: 'news',
    annotations: READ_ONLY,
  },

  // HackerNews Algolia (UC-522) — full-text search over entire HN history; CC BY 3.0, no auth
  {
    toolId: 'hnalgolia.search',
    mcpName: 'hnalgolia.search.relevance',
    title: 'HN Algolia Search (Relevance)',
    description:
      'Full-text search over the entire HackerNews history ranked by relevance — covers 20+ years ' +
      'of tech stories, Ask HN threads, Show HN posts, and job listings. Returns title, URL, author, ' +
      'score, comment count, and submission time. Supports filtering by type (story/ask/show/job/poll). ' +
      'Powered by Algolia. No auth required. Data: Hacker News (CC BY 3.0).',
    category: 'news',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hnalgolia.search_recent',
    mcpName: 'hnalgolia.search.recent',
    title: 'HN Algolia Search (Recent)',
    description:
      'Full-text search over HackerNews history ranked by submission date (newest first) — ideal for ' +
      'finding the latest community discussions on any topic. Returns title, URL, author, score, and ' +
      'comment count. Supports filtering by type (story/ask/show/job/poll). ' +
      'No auth required. Data: Hacker News (CC BY 3.0).',
    category: 'news',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hnalgolia.search_comments',
    mcpName: 'hnalgolia.search.comments',
    title: 'HN Algolia Search Comments',
    description:
      'Search HackerNews comments by keyword — retrieves community opinions, technical insights, and ' +
      'discussions across the full HN history. Each result includes comment text (HTML-stripped), ' +
      'parent story context (title + URL), author, and direct HN link. ' +
      'No auth required. Data: Hacker News (CC BY 3.0).',
    category: 'news',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hnalgolia.item_details',
    mcpName: 'hnalgolia.item.details',
    title: 'HN Algolia Item Details',
    description:
      'Fetch full details for any HackerNews item by integer ID using the Algolia API — returns ' +
      'type, title, URL, author, score, body text, creation time, and the top 5 child comments. ' +
      'Works for stories, Ask HN, Show HN, comments, jobs, and polls. ' +
      'No auth required. Data: Hacker News (CC BY 3.0).',
    category: 'news',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hnalgolia.user_profile',
    mcpName: 'hnalgolia.user.profile',
    title: 'HN Algolia User Profile',
    description:
      'Fetch a HackerNews user profile via the Algolia API — returns username, karma score, and ' +
      'about/bio text (HTML-stripped). Lightweight alternative to the Firebase user endpoint. ' +
      'No auth required. Data: Hacker News (CC BY 3.0).',
    category: 'news',
    annotations: READ_ONLY,
  },

  // Wikipedia REST API (UC-523) — 5 tools
  {
    toolId: 'wikipedia.article.summary',
    mcpName: 'wikipedia.article.summary',
    title: 'Wikipedia Article Summary',
    description:
      'Fetch the introductory summary of any Wikipedia article — returns plain-text extract, ' +
      'short description, thumbnail image URL, Wikidata item ID, and the canonical article URL. ' +
      'Supports 55+ Wikipedia language editions via the optional language parameter. ' +
      'Ideal for quick entity lookups: people, places, concepts, events, organizations. ' +
      'No auth required. Data: Wikipedia contributors, CC BY-SA 4.0 (attribution included in response).',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'wikipedia.search.pages',
    mcpName: 'wikipedia.search.pages',
    title: 'Wikipedia Page Search',
    description:
      'Search Wikipedia for articles matching a keyword or phrase — returns ranked results with ' +
      'article titles, Wikidata descriptions, content excerpts, and thumbnail images. ' +
      'Supports 55+ language editions. Up to 50 results per query. ' +
      'No auth required. Data: Wikipedia contributors, CC BY-SA 4.0.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'wikipedia.article.media',
    mcpName: 'wikipedia.article.media',
    title: 'Wikipedia Article Media',
    description:
      'List all images and media files embedded in a Wikipedia article — returns file titles, ' +
      'type (image/video/audio), srcset URLs at multiple resolutions, and caption text. ' +
      'Useful for enriching responses with article visuals. ' +
      'No auth required. Data: Wikipedia contributors, CC BY-SA 4.0.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'wikipedia.feed.featured',
    mcpName: 'wikipedia.feed.featured',
    title: 'Wikipedia Daily Featured Content',
    description:
      "Fetch Wikipedia's daily curated highlights for any date — returns the Today's Featured " +
      'Article (with extract and thumbnail), the Featured Image of the Day (with artist credit), ' +
      'and the top 10 most-read articles. English only. ' +
      'No auth required. Data: Wikipedia contributors, CC BY-SA 4.0.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'wikipedia.feed.on_this_day',
    mcpName: 'wikipedia.feed.on_this_day',
    title: 'Wikipedia On This Day',
    description:
      'Retrieve historical events that occurred on a given month/day across all years — returns ' +
      'event text, year, and links to up to 3 related Wikipedia articles per event. ' +
      'Useful for history timelines, date-based trivia, and anniversary lookups. ' +
      'No auth required. Data: Wikipedia contributors, CC BY-SA 4.0.',
    category: 'education',
    annotations: READ_ONLY,
  },

  // iRail Belgium Rail (UC-524) — 5 tools
  {
    toolId: 'irail.stations',
    mcpName: 'irail.reference.stations',
    title: 'iRail Belgium Stations',
    description:
      'List all 700+ SNCB/NMBS Belgian railway stations with coordinates, or filter by name. ' +
      'Returns station ID, display name, standard name (Dutch/French), latitude, and longitude. ' +
      'Use station names from this list as input for liveboard and connections tools. ' +
      'No auth required. Data: iRail open data, Belgium national rail (SNCB/NMBS).',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'irail.liveboard',
    mcpName: 'irail.transit.liveboard',
    title: 'iRail Station Liveboard',
    description:
      'Get real-time departures or arrivals for a Belgian railway station — returns train ' +
      'number, destination/origin, scheduled time, delay in minutes, platform, cancellation ' +
      'status, and passenger occupancy level. Defaults to departures from current time. ' +
      'No auth required. Data: iRail real-time SNCB/NMBS Belgium train data.',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'irail.connections',
    mcpName: 'irail.transit.connections',
    title: 'iRail Train Connections',
    description:
      'Find train connections between two Belgian railway stations — returns up to 10 journeys ' +
      'with departure/arrival times, total duration, delays, transfer stations (vias), train ' +
      'numbers, platform numbers, and cancellation flags. Supports departure or arrival time ' +
      'selection. No auth required. Data: iRail real-time SNCB/NMBS Belgium train data.',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'irail.vehicle',
    mcpName: 'irail.transit.vehicle',
    title: 'iRail Train Vehicle Schedule',
    description:
      'Get the complete stop schedule for a specific Belgian train — returns all stations the ' +
      'train calls at with scheduled times, actual delays, platform numbers, occupancy levels, ' +
      'and whether the train has already departed each stop. Train IDs are returned by the ' +
      'liveboard and connections tools. No auth required. Data: iRail SNCB/NMBS Belgium.',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'irail.disturbances',
    mcpName: 'irail.transit.disturbances',
    title: 'iRail Service Disturbances',
    description:
      'Retrieve current service disruptions and alerts on the Belgian rail network — returns ' +
      'disturbance title, description (cause, affected lines, recovery status), type (disturbance ' +
      'or planned maintenance), timestamp, and a link for more information. Typically 0–50 active ' +
      'disturbances. No auth required. Data: iRail real-time SNCB/NMBS Belgium alerts.',
    category: 'travel',
    annotations: READ_ONLY,
  },

  // Norges Bank (4) — UC-525
  {
    toolId: 'norgesbank.fx.latest',
    mcpName: 'norgesbank.fx.latest',
    title: 'Norges Bank FX Rates (Latest)',
    description:
      'Get the latest official foreign-exchange rates published by Norges Bank (the Norwegian ' +
      'central bank) — up to 41 currencies quoted against NOK (Norwegian krone). Rates are ' +
      'business-day spot rates from the SDMX REST API. Filter to specific currencies via the ' +
      'optional currencies param (e.g. "USD,EUR,GBP"). No authentication required. Data: ' +
      'Norges Bank SDMX EXR dataflow, open government licence, unlimited.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'norgesbank.fx.history',
    mcpName: 'norgesbank.fx.history',
    title: 'Norges Bank FX Rate History',
    description:
      'Retrieve a historical time series of official Norges Bank exchange rates for any of the ' +
      '41 available currencies versus NOK. Specify a start/end date (ISO 8601, e.g. 2024-01-01) ' +
      'to get a custom range of business-day spot rates. Returns an array of {date, rate} pairs ' +
      'sorted ascending by date. Useful for charting NOK strength, backtesting currency strategies, ' +
      'or computing historical hedging costs. Data: Norges Bank SDMX EXR dataflow, no auth.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'norgesbank.rates.current',
    mcpName: 'norgesbank.rates.current',
    title: 'Norges Bank Key Policy Rates (Current)',
    description:
      'Get the current key policy interest rates set by Norges Bank: the key policy rate ' +
      '(deposit rate / styringsrente), overnight lending rate, and reserve rate. Returns the ' +
      'latest observed value for each rate type across daily and monthly frequencies. The ' +
      'key policy rate is the primary monetary policy instrument of Norway. No authentication ' +
      'required. Data: Norges Bank SDMX IR dataflow, open government licence, unlimited.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'norgesbank.rates.history',
    mcpName: 'norgesbank.rates.history',
    title: 'Norges Bank Interest Rate History',
    description:
      'Retrieve a historical time series of Norges Bank key policy interest rates. Choose rate ' +
      'type (SD = key policy rate, OL = overnight lending rate, RR = reserve rate), frequency ' +
      '(B = business daily, M = monthly, A = annual), and date range. Returns {date, rate} pairs ' +
      "sorted ascending. Useful for monetary-policy research, macro models, or comparing Norway's " +
      'rate cycle against other central banks. Data: Norges Bank SDMX IR dataflow, no auth.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  // Swiss FSO STAT-TAB (4)
  {
    toolId: 'swissfso.catalog.list',
    mcpName: 'swissfso.catalog.list',
    title: 'Swiss FSO Dataset Catalog',
    description:
      'Browse the Swiss Federal Statistical Office (BFS/FSO) STAT-TAB catalog of 648 statistical ' +
      'datasets. Filter by subject area using BFS subject codes: "01"=population, "03"=employment, ' +
      '"06"=industry, "07"=agriculture, "09"=construction, "10"=tourism, "13"=social-security, ' +
      '"14"=health, "15"=education, "21"=sustainability. Returns dataset IDs (database_id) needed ' +
      'for table.metadata and table.query. Data: Swiss OGD, no auth, commercial use permitted.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'swissfso.table.metadata',
    mcpName: 'swissfso.table.metadata',
    title: 'Swiss FSO Table Dimensions',
    description:
      'Get the variable dimensions and available filter values for any Swiss Federal Statistical ' +
      'Office (FSO/BFS) STAT-TAB dataset. Provide a database_id from catalog.list. Returns the ' +
      'table title, dimension codes, and all available value codes with German labels — needed to ' +
      'construct filters for table.query. Example: database_id "px-x-0304010000_201" returns ' +
      'year, region, industry, professional status, gender, and percentile dimensions for monthly ' +
      'gross wages. Data: Swiss OGD, no auth, commercial use permitted.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'swissfso.table.query',
    mcpName: 'swissfso.table.query',
    title: 'Swiss FSO Table Data Query',
    description:
      'Query data from any Swiss Federal Statistical Office (FSO/BFS) STAT-TAB dataset using ' +
      'dimension filters. Provide a database_id from catalog.list and optional filters (from ' +
      'table.metadata). Each filter specifies a dimension code and an array of value codes. ' +
      'Returns JSON-stat2 formatted data with dimension labels and numeric values. Note: variable ' +
      'codes and labels are in German (official FSO data language). Unfiltered dimensions return ' +
      'all values, so always filter time and region to keep responses manageable. Swiss OGD, no auth.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'swissfso.wages.monthly',
    mcpName: 'swissfso.wages.monthly',
    title: 'Swiss Monthly Gross Wages',
    description:
      'Get Swiss monthly gross wage statistics from the Federal Statistical Office (FSO/BFS) ' +
      'Salary Structure Survey. Returns nationwide median (or other percentile) monthly wages in ' +
      'CHF for all industries and professional levels combined. Available for biennial survey years ' +
      '2012–2024. Filter by gender (total/female/male) and percentile (median/P10/P25/P75/P90). ' +
      'Example: 2024 median wage overall ≈ CHF 6,502/month. Data: FSO Lohnstrukturerhebung, no auth.',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // US Treasury Fiscal Data (4)
  {
    toolId: 'treasuryfiscal.debt.current',
    mcpName: 'treasuryfiscal.debt.current',
    title: 'US National Debt — Current',
    description:
      'Get the official US national debt figures from the US Treasury (Debt to the Penny). ' +
      'Returns the total public debt outstanding broken into debt held by the public and ' +
      'intragovernmental holdings. Data is updated each business day. Specify `days` to retrieve ' +
      'a series (default 1 = latest day only). Latest figure: ~$39.3 trillion as of June 2026. ' +
      'Source: fiscaldata.treasury.gov — US Government open data, no auth, commercial use permitted.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'treasuryfiscal.rates.interest',
    mcpName: 'treasuryfiscal.rates.interest',
    title: 'US Treasury Average Interest Rates',
    description:
      'Get the average interest rates on outstanding US Treasury securities, published monthly. ' +
      'Returns rates for all security types: Treasury Bills, Notes, Bonds, TIPS, Floating Rate Notes ' +
      '(marketable) and Savings Bonds, Government Account Series (non-marketable). Filter by ' +
      'security_type (marketable/non-marketable/all). Use limit=15 for the latest monthly snapshot ' +
      'across all security types. Source: US Treasury Fiscal Data — avg_interest_rates, no auth.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'treasuryfiscal.yield.quarterly',
    mcpName: 'treasuryfiscal.yield.quarterly',
    title: 'US Treasury Quarterly Portfolio Yield',
    description:
      'Get the quarterly average yield of the US Treasury securities portfolio (Uniform Treasury ' +
      'Tax and Loan Program). Reports the annualized yield percentage for each fiscal quarter. ' +
      'Default returns the 8 most recent quarters (2 years). Example: Q1 2026 yield = 3.27%. ' +
      'Useful for tracking long-term trends in the cost of US government borrowing. ' +
      'Source: US Treasury Fiscal Data — utf_qtr_yields, no auth, commercial use permitted.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'treasuryfiscal.debt.expense',
    mcpName: 'treasuryfiscal.debt.expense',
    title: 'US Federal Interest Expense on Debt',
    description:
      'Get the monthly and fiscal-year-to-date interest expense on US federal debt, broken down ' +
      'by security type (Treasury Notes, Bonds, TIPS, Inflation Compensation on TIPS, FRN, ' +
      'Bills, Savings Bonds, etc.). Shows how much the US government pays each month to service ' +
      'its debt. Includes both accrued interest on public issues and intragovernmental holdings. ' +
      'Source: US Treasury Fiscal Data — interest_expense, no auth, commercial use permitted.',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // USDA AMS MARS MyMarketNews (4)
  {
    toolId: 'usdamars.list_reports',
    mcpName: 'usdamars.reports.list',
    title: 'List USDA Agricultural Market Reports',
    description:
      'List recently published USDA Agricultural Marketing Service (AMS) market news reports ' +
      'covering livestock, dairy, poultry, fruits, vegetables, grain, cotton, and specialty crops. ' +
      'Returns report metadata: ID, title, publication date, commodity period covered, and file ' +
      'type. Reports are published by USDA-accredited reporters at markets across the US. Use ' +
      'usdamars.reports.search to filter by commodity. Source: USDA AMS MyMarketNews — ' +
      'marsapi.ams.usda.gov, public domain, no auth.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'usdamars.get_report',
    mcpName: 'usdamars.reports.get',
    title: 'Get USDA Market Report Details',
    description:
      'Get metadata for a specific USDA AMS market news report by its numeric ID or slug ' +
      '(e.g. "nw_ls910"). Returns publication date, commodity period, report title, file type, ' +
      'and whether it is a correction or final report. Obtain report IDs from ' +
      'usdamars.reports.list or usdamars.reports.search. Source: USDA AMS MyMarketNews — ' +
      'marsapi.ams.usda.gov, public domain, no auth.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'usdamars.list_corrected',
    mcpName: 'usdamars.reports.corrected',
    title: 'List Corrected USDA Market Reports',
    description:
      'List USDA AMS market news reports that have been corrected or amended within the ' +
      'specified period. Corrections supersede previously published data and are important for ' +
      'accurate commodity price analysis. Covers livestock, dairy, poultry, produce, grain, and ' +
      'cotton markets. Use days=all to see the full correction history. Source: USDA AMS ' +
      'MyMarketNews — marsapi.ams.usda.gov, public domain, no auth.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'usdamars.search_reports',
    mcpName: 'usdamars.reports.search',
    title: 'Search USDA Agricultural Market Reports by Commodity',
    description:
      'Search USDA AMS market news reports by commodity or topic keyword within the title. ' +
      'Filter by terms like "cattle", "dairy", "pork", "lamb", "poultry", "egg", "fruit", ' +
      '"vegetable", "grain", "cotton", "boxed beef", or region names. Returns up to 50 matching ' +
      'reports from the last N days sorted by publication date. Source: USDA AMS MyMarketNews — ' +
      'marsapi.ams.usda.gov, public domain, no auth.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // ADS-B DB (UC-529) — 3 tools
  {
    toolId: 'adsbdb.aircraft_lookup',
    mcpName: 'adsbdb.aircraft.lookup',
    title: 'Lookup Aircraft by Mode-S or Registration',
    description:
      'Look up aircraft details by Mode-S transponder hex code (e.g. "400F6B") or ICAO ' +
      'registration mark (tail number, e.g. "G-RVCL", "N123AB"). Returns aircraft type, ICAO ' +
      'type designator, manufacturer, registered owner, country of registration, and photo URLs ' +
      'when available. Mode-S codes are 6-character hexadecimal unique to each aircraft; ' +
      'registrations follow national formats (N-prefix for US, G- for UK, etc.). Source: ' +
      'ADS-B DB — api.adsbdb.com, MIT license, no auth.',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'adsbdb.airline_lookup',
    mcpName: 'adsbdb.airline.lookup',
    title: 'Lookup Airline by ICAO or IATA Code',
    description:
      'Look up airline details by ICAO 3-letter code (e.g. "BAW" for British Airways, "UAL" ' +
      'for United Airlines) or IATA 2-letter code (e.g. "BA", "UA"). Returns airline name, both ' +
      'ICAO and IATA codes, country of registration, and radio telephony callsign used in ATC ' +
      'communications (e.g. "SPEEDBIRD" for British Airways). Useful for decoding transponder ' +
      'callsigns and identifying aircraft operators. Source: ADS-B DB — api.adsbdb.com, MIT ' +
      'license, no auth.',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'adsbdb.callsign_lookup',
    mcpName: 'adsbdb.callsign.lookup',
    title: 'Lookup Flight Route by Callsign',
    description:
      'Resolve a flight callsign (e.g. "BAW123", "UAL456") to its origin and destination ' +
      'airports plus operating airline. Returns full airport details: ICAO and IATA codes, ' +
      'name, municipality, country, coordinates, and elevation. Also returns airline name, ' +
      'codes, and ATC callsign. Callsigns combine the airline ICAO code with a flight number ' +
      'and are broadcast by ATC transponders. Useful for enriching ADS-B flight tracking data ' +
      'with route context. Source: ADS-B DB — api.adsbdb.com, MIT license, no auth.',
    category: 'travel',
    annotations: READ_ONLY,
  },

  // FAO FAOSTAT SDG API (5)
  {
    toolId: 'faostat.food_security',
    mcpName: 'faostat.agriculture.food_security',
    title: 'FAO Undernourishment (SDG 2.1.1)',
    description:
      'Retrieve prevalence of undernourishment (% of population) and count of undernourished ' +
      'people (millions) for any country over time. Data from FAO FAOSTAT — UN SDG Indicator 2.1.1. ' +
      'Covers 190+ countries, annual data since 2001. Accepts ISO alpha-2 (e.g. "IN"), alpha-3 ' +
      '(e.g. "IND"), or ISO numeric (e.g. "356") country codes.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'faostat.food_insecurity',
    mcpName: 'faostat.agriculture.food_insecurity',
    title: 'FAO Food Insecurity (SDG 2.1.2)',
    description:
      'Retrieve prevalence of moderate or severe food insecurity (%) for a country based on the ' +
      'Food Insecurity Experience Scale (FIES). Data from FAO FAOSTAT — UN SDG Indicator 2.1.2. ' +
      'Covers ~140 countries with FIES survey data. Accepts ISO alpha-2 (e.g. "ET"), alpha-3, or ' +
      'ISO numeric country codes.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'faostat.water_stress',
    mcpName: 'faostat.environment.water_stress',
    title: 'FAO Water Stress (SDG 6.4.2)',
    description:
      'Retrieve freshwater withdrawal as a percentage of available freshwater resources for a ' +
      'country. High values (>40%) indicate severe water stress. Data from FAO FAOSTAT — UN SDG ' +
      'Indicator 6.4.2. Covers 211 countries. Accepts ISO alpha-2 (e.g. "IN"), alpha-3, or ' +
      'ISO numeric country codes.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'faostat.forest_area',
    mcpName: 'faostat.environment.forest_area',
    title: 'FAO Forest Coverage (SDG 15.1.1)',
    description:
      'Retrieve forest area as a percentage of total land area and in hectares for any country. ' +
      'Data from FAO FAOSTAT — UN SDG Indicator 15.1.1. Covers 200+ countries, annual data. ' +
      'Accepts ISO alpha-2 (e.g. "BR"), alpha-3 (e.g. "BRA"), or ISO numeric country codes.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'faostat.food_loss',
    mcpName: 'faostat.agriculture.food_loss',
    title: 'FAO Food Loss Index (SDG 12.3.1)',
    description:
      'Retrieve the global food loss index and food loss percentage by food group (cereals, ' +
      'fruits & vegetables, meat, roots & tubers, pulses) for world regions. Data from FAO ' +
      'FAOSTAT — UN SDG Indicator 12.3.1. An index above 100 means more loss than the 2014-2016 ' +
      'baseline. Optionally filter by a specific year.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // ClinicalTrials.gov v2 (UC-531) — 4 tools
  {
    toolId: 'clinicaltrials.search',
    mcpName: 'clinicaltrials.trials.search',
    title: 'ClinicalTrials Search',
    description:
      'Search 400K+ clinical trials registered on ClinicalTrials.gov by condition, drug/intervention, ' +
      'sponsor, or keyword. Optionally filter by status (RECRUITING, COMPLETED, etc.) and phase ' +
      '(PHASE1–PHASE4). Returns NCT ID, title, status, phases, conditions, sponsor, enrollment, ' +
      'and start/completion dates. Supports pagination via page_token. Data from NIH US Gov (public domain).',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'clinicaltrials.study',
    mcpName: 'clinicaltrials.trials.detail',
    title: 'ClinicalTrials Study Detail',
    description:
      'Retrieve full details of a specific clinical trial by its NCT identifier (e.g. "NCT04368728"). ' +
      'Returns title, official title, status, sponsor, conditions, interventions, design info, ' +
      'enrollment, eligibility criteria (age/sex/health volunteer), primary and secondary outcomes, ' +
      'brief summary, and up to 10 study locations. Source: ClinicalTrials.gov v2 API (NIH, public domain).',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'clinicaltrials.recruiting',
    mcpName: 'clinicaltrials.trials.recruiting',
    title: 'ClinicalTrials Active Recruiting',
    description:
      'Find clinical trials currently open for enrollment (status=RECRUITING) for a given condition ' +
      'or drug. Optionally filter by phase (e.g. PHASE3 for large confirmatory trials). Returns NCT ID, ' +
      'title, phases, conditions, sponsor, enrollment target, and start/completion dates. ' +
      'Useful for patients or researchers seeking open studies. Source: ClinicalTrials.gov v2 (NIH, public domain).',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'clinicaltrials.stats',
    mcpName: 'clinicaltrials.trials.stats',
    title: 'ClinicalTrials Database Stats',
    description:
      'Get current statistics for the ClinicalTrials.gov database: total registered studies count ' +
      'and average record size in bytes. Useful for understanding data scale before bulk queries. ' +
      'Source: ClinicalTrials.gov v2 /stats/size endpoint (NIH US Gov, public domain, unlimited access).',
    category: 'health',
    annotations: READ_ONLY,
  },

  // Australian Bureau of Statistics — ABS (5)
  {
    toolId: 'abs.gdp',
    mcpName: 'abs.economy.gdp',
    title: 'Australian GDP',
    description:
      'Retrieve Australian Gross Domestic Product (GDP) data from the ABS National Accounts Key Aggregates ' +
      '(ANA_AGG). Returns quarterly chain volume measures (seasonally adjusted AUD millions), current price ' +
      'estimates, GDP per capita, GDP per hour worked, or hours worked in the market sector. Data spans from ' +
      '1959 onwards. Source: Australian Bureau of Statistics, CC BY 4.0, commercial use permitted.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'abs.cpi',
    mcpName: 'abs.economy.cpi',
    title: 'Australian CPI',
    description:
      'Retrieve Australia Consumer Price Index (CPI) data from the ABS CPI dataset. Returns the All Groups ' +
      'CPI as annual percentage change (year-on-year inflation), index numbers (base 2011–12 = 100), or ' +
      'period-on-period percentage change. Available nationally (weighted 8-city average) and for individual ' +
      'capital cities: Sydney, Melbourne, Brisbane, Adelaide, Perth, Hobart, Darwin, and Canberra. Monthly ' +
      'and quarterly frequency. Source: ABS Cat. 6401.0, CC BY 4.0.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'abs.labour_force',
    mcpName: 'abs.economy.labour_force',
    title: 'Australian Labour Force',
    description:
      'Retrieve Australian labour market statistics from the ABS Labour Force Survey (LF). Returns monthly ' +
      'seasonally adjusted data on unemployment rate (%), number of employed persons (thousands), ' +
      'participation rate (%), total labour force size, or civilian population aged 15+. Breakdowns available ' +
      'by sex (persons/males/females) and geography (Australia national or individual states and territories). ' +
      'Source: ABS Cat. 6202.0, CC BY 4.0.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'abs.population',
    mcpName: 'abs.demographics.population',
    title: 'Australian Population Estimates',
    description:
      'Retrieve quarterly Estimated Resident Population (ERP) for Australia from the ABS ERP_Q dataset. ' +
      'Returns total population counts, annual numeric change, or annual percentage change. Data covers all ' +
      'ages combined, broken down by sex (persons/males/females) and geography (Australia or individual ' +
      'states/territories: NSW, VIC, QLD, SA, WA, TAS, NT, ACT). Updated quarterly by the ABS. ' +
      'Source: ABS Demographic Statistics, CC BY 4.0.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'abs.trade',
    mcpName: 'abs.economy.trade',
    title: 'Australian Trade & Balance of Payments',
    description:
      'Retrieve Australia Balance of Payments (BOP) statistics from the ABS BOP dataset. Returns quarterly ' +
      'current prices or chain volume measures for key trade aggregates: current account balance, goods and ' +
      'services credits (exports), goods and services debits (imports), goods credits, goods debits, and ' +
      'primary income credits. Seasonally adjusted, trend, or original data. AUD millions. ' +
      'Source: ABS Cat. 5302.0, CC BY 4.0.',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // ONS UK Statistics (UC-533, 5 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'ons.datasets.list',
    mcpName: 'ons.datasets.list',
    title: 'ONS Datasets List',
    description:
      'List and search all 337+ datasets published by the UK Office for National Statistics (ONS) via the ' +
      'beta CMD API. Returns dataset IDs, titles, descriptions, last-updated timestamps, release frequencies, ' +
      'and national statistic flags. Use the keyword parameter to filter by topic (e.g. "gdp", "inflation", ' +
      '"population", "unemployment", "earnings"). Use dataset IDs with the other ons.* tools or the ONS ' +
      'Cantabular API. Source: ONS CMD API v1, Open Government Licence v3.0.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ons.stats.cpih',
    mcpName: 'ons.stats.cpih',
    title: 'ONS Consumer Prices Index (CPIH)',
    description:
      'Retrieve UK Consumer Prices Index Including Housing costs (CPIH) from the ONS. Monthly index values ' +
      '(2015=100) for the overall index or individual categories (food, energy, transport, etc.). Data goes ' +
      'back to 1988. Default returns the headline CPIH overall index (CP00) for the UK. Use the category ' +
      'parameter to drill into sub-categories such as "CP01" (food & beverages), "CP04" (housing & energy), ' +
      '"CP07" (transport). Returns up to 60 most recent months by default. ' +
      'Source: ONS dataset cpih01, OGL v3.0.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ons.stats.gdp',
    mcpName: 'ons.stats.gdp',
    title: 'ONS UK GDP Monthly Estimate',
    description:
      'Retrieve UK Gross Domestic Product (GDP) monthly estimates from the ONS. Seasonally adjusted index ' +
      '(2016=100) covering total economy (A--T) or specific sectors: Agriculture (A), Manufacturing (C), ' +
      'Construction (F), Index of Services (G-T), Production Industries (B--E). Monthly data from 1997. ' +
      'Default returns total monthly GDP. Use the sector parameter for industry-level breakdowns. ' +
      'Source: ONS dataset gdp-to-four-decimal-places, OGL v3.0.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ons.stats.unemployment',
    mcpName: 'ons.stats.unemployment',
    title: 'ONS UK Labour Market Statistics',
    description:
      'Retrieve UK labour market statistics from the ONS Labour Force Survey (LFS). Returns unemployment ' +
      'rate (%), employment rate, or economic inactivity rate for the UK, broken down by age group and sex. ' +
      'Data is three-month rolling averages (e.g. "Jan-Mar 2024"), seasonally adjusted. Default returns the ' +
      'overall unemployment rate (16+, all adults, seasonally adjusted rates). Use activity, age_group, sex ' +
      'parameters to filter. Source: ONS dataset labour-market, OGL v3.0.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ons.stats.population',
    mcpName: 'ons.stats.population',
    title: 'ONS UK Population Estimates',
    description:
      'Retrieve mid-year population estimates for the UK, England, Wales, or local authorities from the ONS. ' +
      'Annual estimates of usual resident population as at 30 June, by area, age group, and sex. Default ' +
      'returns total population for England and Wales (all ages, all sexes). Use geography parameter with ONS ' +
      'geography codes (K02000001=UK, K04000001=England & Wales, E92000001=England, W92000004=Wales) and age ' +
      'parameter for single-year-of-age breakdowns. Source: ONS mid-year population estimates, OGL v3.0.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // UN Comtrade Public Preview (UC-534) — 4 tools
  {
    toolId: 'comtrade.trade_data',
    mcpName: 'comtrade.trade.query',
    title: 'UN Comtrade Trade Data Query',
    description:
      'Query international merchandise trade statistics from the UN Comtrade database. Returns up to 500 ' +
      'records of imports and/or exports for a specific reporting country, reference period, commodity code, ' +
      'and partner country. Data covers 200+ reporter countries from 1962 (annual) and 2010 (monthly). ' +
      'Values in USD (primary value), CIF for imports, FOB for exports. Commodities classified by Harmonized ' +
      'System (HS) or SITC. Use reporter_code from comtrade.reporters, HS chapter codes (e.g. "84" for ' +
      'machinery, "27" for petroleum, "85" for electronics), and flow_code M=imports, X=exports. ' +
      'Source: UN Comtrade public preview API, no auth, 500 calls/day free.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'comtrade.availability',
    mcpName: 'comtrade.trade.availability',
    title: 'UN Comtrade Data Availability',
    description:
      'Check which trade datasets are available in UN Comtrade for a given reporter country and period. ' +
      'Returns dataset metadata including total record count, first/last release dates, and classification ' +
      'codes. Useful for discovering what data exists before querying comtrade.trade_data. Coverage varies ' +
      'by country — developed economies report more frequently and with fewer delays than others. ' +
      'Source: UN Comtrade public preview API, no auth.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'comtrade.metadata',
    mcpName: 'comtrade.trade.metadata',
    title: 'UN Comtrade Dataset Metadata',
    description:
      'Retrieve methodological metadata for a UN Comtrade dataset: the reporting currency, USD conversion ' +
      'factors applied (import/export), trade system used (General vs Special trade), import/export ' +
      'valuation method (CIF vs FOB), partner country attribution rules, and publication notes. Essential ' +
      'for understanding how to interpret the trade values in comtrade.trade_data results. Each country ' +
      'reports using its own methodology and currency — this endpoint reveals those details. ' +
      'Source: UN Comtrade public preview API, no auth.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'comtrade.reporters',
    mcpName: 'comtrade.reference.reporters',
    title: 'UN Comtrade Reporter Countries',
    description:
      'List all countries and country groups that report trade statistics to UN Comtrade. Returns the ' +
      'UN numeric reporter code, country name, ISO-2 and ISO-3 alpha codes needed for other comtrade tools. ' +
      'Use the search parameter to filter by country name or ISO code. Use include_groups=false to exclude ' +
      'aggregate regions (EU, ASEAN, World). Over 280 reporters including individual countries and economic ' +
      'blocs. Source: UN Comtrade reference data, no auth, static file.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // USDA LMPR Datamart (5)
  {
    toolId: 'lmpr.cattle_slaughter_prices',
    mcpName: 'lmpr.cattle.slaughter_prices',
    title: 'USDA Cattle Slaughter Prices',
    description:
      '5-Area daily weighted-average direct slaughter cattle prices (LM_CT100). Returns head counts, ' +
      'price ranges ($/cwt), and weighted averages by class (steer/heifer) and selling basis (live FOB, ' +
      'dressed delivered, dressed FOB). Covers TX/OK/NM, Kansas, Nebraska, Colorado, and Iowa/Minnesota ' +
      'feedlot regions combined. Published daily on USDA business days. Source: USDA Livestock Mandatory ' +
      'Price Reporting Datamart, US Government public domain.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'lmpr.hog_slaughter_prices',
    mcpName: 'lmpr.hog.slaughter_prices',
    title: 'USDA Hog Slaughter Prices',
    description:
      'National daily prior-day slaughtered swine prices (LM_HG201). Returns barrows/gilts head counts, ' +
      'negotiated base prices ($/cwt), carcass weight ranges, net price distribution (lean value, ' +
      'fat, bone, yield adjustments), and 14-day scheduled swine commitments. Covers Corn Belt and ' +
      'national markets. Published daily on USDA business days. Source: USDA LMPR Datamart, US Government ' +
      'public domain.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'lmpr.boxed_beef_cutout',
    mcpName: 'lmpr.beef.boxed_cutout',
    title: 'USDA Boxed Beef Cutout',
    description:
      'National weekly boxed beef cutout and individual cut prices (LM_XB459). Returns composite primal ' +
      'values (rib, chuck, round, loin, brisket, plate, flank), Choice and Select cutout values, ' +
      'individual box/cut prices by grade, ground beef, and trimming prices. Published Thursdays. ' +
      'Source: USDA LMPR Datamart, US Government public domain.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'lmpr.dairy_product_prices',
    mcpName: 'lmpr.dairy.product_prices',
    title: 'USDA Dairy Product Prices',
    description:
      'National weekly dairy products sales prices (DYWDAIRYPRODUCTSSALES). Returns mandatory-reporting ' +
      'prices and volumes for butter, 40-lb block cheddar cheese, 500-lb barrel cheddar, dry whey, and ' +
      'nonfat dry milk. Includes preliminary and final weekly prices used in FMMO pricing formulas. ' +
      'Published weekly by USDA Agricultural Marketing Service. Source: USDA LMPR Datamart, US Government ' +
      'public domain.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'lmpr.lamb_carcass_cutout',
    mcpName: 'lmpr.lamb.carcass_cutout',
    title: 'USDA Lamb Carcass Cutout',
    description:
      'National estimated lamb carcass cutout value (LM_XL502). Returns gross carcass value, foresaddle ' +
      'value (rib, shoulder, breast/neck), hindsaddle value (leg, loin), net carcass value, and other ' +
      'byproduct values (pelt, offal). Published daily on USDA business days. Source: USDA LMPR Datamart, ' +
      'US Government public domain.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // TreasuryDirect TA_WS (4)
  {
    toolId: 'treasurydirect.auction_results',
    mcpName: 'treasurydirect.auction.results',
    title: 'Treasury Auction Results',
    description:
      'Completed US Treasury security auction results by type and look-back period. Returns CUSIP, issue/maturity ' +
      'dates, high yield, high discount rate, bid-to-cover ratio, total accepted/tendered amounts, and auction ' +
      'format for Bills (4-52 week), Notes (2-10 year), Bonds (20-30 year), TIPS, FRN, and CMB. ' +
      'Source: TreasuryDirect TA_WS, US Government open data, no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'treasurydirect.upcoming_auctions',
    mcpName: 'treasurydirect.auction.upcoming',
    title: 'Upcoming Treasury Auctions',
    description:
      'Announced upcoming US Treasury security auctions not yet held. Returns the auction schedule including ' +
      'security type (Bill/Note/Bond), term, announcement date, auction date, and issue date for each ' +
      'forthcoming offering. Typically lists 1-2 weeks of upcoming auctions across all security types. ' +
      'Source: TreasuryDirect TA_WS, US Government open data, no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'treasurydirect.search_cusip',
    mcpName: 'treasurydirect.securities.search',
    title: 'Treasury Security CUSIP Lookup',
    description:
      'Look up a specific US Treasury security by its CUSIP identifier. Returns full auction and issuance ' +
      'details including security type, term, interest rate, maturity date, high yield, bid-to-cover ratio, ' +
      'and settlement information. CUSIPs for recent T-Bills typically start with "9127" or "9128". ' +
      'Source: TreasuryDirect TA_WS, US Government open data, no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'treasurydirect.tips_rates',
    mcpName: 'treasurydirect.rates.tips',
    title: 'TIPS Auction Rates and CPI Reference',
    description:
      'US Treasury Inflation-Protected Securities (TIPS) auction results with reference CPI data. Returns ' +
      'real yield (highYield), coupon rate (interestRate), reference CPI on issue date, index ratio, ' +
      'bid-to-cover ratio, and total accepted for each TIPS auction in the specified look-back window. ' +
      'Useful for tracking real interest rate trends and inflation breakeven calculations. ' +
      'Source: TreasuryDirect TA_WS, US Government open data, no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // OpenTopography (4)
  {
    toolId: 'opentopo.elevation_point',
    mcpName: 'opentopo.elevation.point',
    title: 'OpenTopography Point Elevation',
    description:
      'Query terrain elevation (in metres) at a specific latitude/longitude coordinate using ' +
      'global Digital Elevation Model (DEM) datasets. Supports SRTMGL1 (NASA SRTM 30m, default), ' +
      'COP30 (Copernicus 30m), AW3D30 (ALOS 30m), NASADEM (30m reprocessed), SRTM15Plus ' +
      '(500m global bathymetry), and more. Returns elevation_m plus dataset resolution info. ' +
      'Source: OpenTopography / USGS 3DEP, CC BY 4.0, free registration (5K req/day).',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'opentopo.elevation_area',
    mcpName: 'opentopo.elevation.area',
    title: 'OpenTopography Area Elevation Stats',
    description:
      'Get terrain elevation statistics (min, max, mean, range in metres) for a bounding box area ' +
      'using global DEM datasets. Maximum bounding box: 0.5° × 0.5° (~55km × 55km at equator). ' +
      'Returns min_m, max_m, mean_m, range_m, cell_count, valid_cells, nodata_cells, and resolution. ' +
      'Useful for hydrological analysis, terrain characterisation, and infrastructure siting. ' +
      'Source: OpenTopography / USGS 3DEP, CC BY 4.0, free registration (5K req/day).',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'opentopo.lidar_catalog',
    mcpName: 'opentopo.catalog.lidar',
    title: 'OpenTopography LiDAR Dataset Catalog',
    description:
      'Search the OpenTopography catalog for high-resolution LiDAR point cloud datasets covering a ' +
      'specified bounding box. LiDAR datasets provide centimetre-to-metre resolution 3D terrain data, ' +
      'primarily from USGS 3DEP surveys across the US. Returns dataset name, OpenTopography ID, ' +
      'DOI URL, acquisition date, spatial coverage bounds, and description. Essential for discovering ' +
      'available high-resolution terrain data before requesting downloads. ' +
      'Source: OpenTopography catalog, CC BY 4.0, free registration (5K req/day).',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'opentopo.dem_catalog',
    mcpName: 'opentopo.catalog.dem',
    title: 'OpenTopography DEM Raster Catalog',
    description:
      'Search the OpenTopography catalog for raster Digital Elevation Model (DEM) datasets covering ' +
      'a specified bounding box. Returns community-contributed and curated DEM datasets beyond the ' +
      'standard global datasets — including specialised regional surveys, UAV-derived models, and ' +
      'research DEMs. Returns dataset name, ID, DOI, format, creation date, and coverage bounds. ' +
      'Complements the standard elevation query tools by exposing niche high-resolution datasets. ' +
      'Source: OpenTopography catalog, CC BY 4.0, free registration (5K req/day).',
    category: 'world',
    annotations: READ_ONLY,
  },

  // OECD Statistics (5)
  {
    toolId: 'oecd.economy.gdp',
    mcpName: 'oecd.economy.gdp',
    title: 'OECD Annual GDP and National Accounts',
    description:
      'Fetch annual GDP and national accounts data for any OECD member country. Returns GDP at ' +
      'current USD exchange rates, gross operating surplus, compensation of employees, and other ' +
      'national accounts aggregates from the OECD National Accounts Main Aggregates database ' +
      '(NAMAIN10). Covers 38 OECD countries from the 1970s to the latest year. Data is sourced from ' +
      'official national statistics offices and harmonised to SNA 2008 standards. Each series includes ' +
      'the exact transaction code (e.g. B1GQ = GDP at market prices), sector, unit of measure ' +
      '(USD millions at exchange rates), and price base. ' +
      'Source: OECD SDMX API, CC BY 4.0, no auth required, unlimited.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'oecd.economy.unemployment',
    mcpName: 'oecd.economy.unemployment',
    title: 'OECD Monthly Unemployment Rate',
    description:
      'Retrieve monthly unemployment rates from the OECD Labour Force Survey (LFS) for any OECD ' +
      'member country. Returns the unemployment rate as a percentage of the labour force for persons ' +
      'aged 15+, total and by sex, with both seasonally adjusted and unadjusted series. Covers OECD ' +
      'members with typical lags of 1–3 months. The series use standardised ILO definitions of ' +
      'unemployment (persons without work, available, and actively seeking employment). Useful for ' +
      'tracking labour market conditions, comparing countries, and detecting recessions. ' +
      'Source: OECD SDMX API, CC BY 4.0, no auth required, unlimited.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'oecd.economy.inflation',
    mcpName: 'oecd.economy.inflation',
    title: 'OECD Consumer Price Index (CPI)',
    description:
      'Get consumer price index (CPI) data and year-on-year inflation rates for any OECD country. ' +
      'Returns all-items CPI growth rate (annual % change) based on the COICOP 1999 classification. ' +
      'Covers all 38 OECD members plus selected non-members at monthly frequency with typical lags ' +
      'of 2–4 weeks. Includes national CPI and Eurostat HICP (for EU members), broken down by ' +
      'expenditure category (food, energy, services, housing, transport, etc.). Essential for ' +
      'inflation monitoring, monetary policy analysis, and cost-of-living comparisons. ' +
      'Source: OECD SDMX API, CC BY 4.0, no auth required, unlimited.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'oecd.environment.emissions',
    mcpName: 'oecd.environment.emissions',
    title: 'OECD Greenhouse Gas Emissions',
    description:
      'Retrieve annual greenhouse gas (GHG) emissions data for any OECD country from the OECD ' +
      'Environment Policy and Progress indicators database. Returns CO2-equivalent emissions (in ' +
      'million tonnes) broken down by gas type (CO2, CH4, N2O, F-gases, etc.) and economic sector ' +
      '(energy, transport, agriculture, industry, waste, etc.). Covers OECD members from 1990 to ' +
      'the latest available year, with data aligned to IPCC inventory guidelines and UNFCCC reporting. ' +
      'Useful for climate policy analysis, carbon footprint comparisons, and tracking progress ' +
      'towards net-zero targets. ' +
      'Source: OECD ENV.EPI SDMX API, CC BY 4.0, no auth required, unlimited.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'oecd.economy.trade',
    mcpName: 'oecd.economy.trade',
    title: 'OECD Balance of Payments',
    description:
      'Retrieve Balance of Payments (BoP) data for any OECD member country. Returns current account ' +
      'balance, goods trade balance, services trade balance, and financial account indicators in ' +
      'USD millions. Based on IMF BPM6 standards and reported to the OECD. Covers 38 OECD countries ' +
      'at quarterly and annual frequency with typical lags of 3–6 months. Useful for macroeconomic ' +
      "analysis, currency risk assessment, and understanding a country's external position with the " +
      'rest of the world. Current account surplus = country exports more than it imports; deficit = ' +
      'imports exceed exports. ' +
      'Source: OECD SDMX API, CC BY 4.0, no auth required, unlimited.',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // Statistics Canada WDS (5)
  {
    toolId: 'statcan.catalogue_search',
    mcpName: 'statcan.catalogue.search',
    title: 'Statistics Canada — Table Search',
    description:
      'Search and discover Statistics Canada data tables (6,000+ available). Filter by keyword ' +
      'in the English table title, by Statistics Canada subject code (e.g. "14" for Labour, ' +
      '"16" for Prices and price indexes, "36" for National accounts), and by active vs. archived ' +
      'status. Returns table product IDs, CANSIM IDs, titles, date ranges, release frequency ' +
      '(annual/monthly/quarterly), and subject codes. Use the product_id from results to fetch ' +
      'full metadata (table_metadata) or time-series data (table_data). ' +
      'Source: Statistics Canada WDS, Canada Open Licence, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'statcan.table_metadata',
    mcpName: 'statcan.table.metadata',
    title: 'Statistics Canada — Table Metadata',
    description:
      'Retrieve full metadata for a Statistics Canada table by its 8-digit product ID. Returns ' +
      'table title, date range, release frequency, subject codes, survey codes, and complete ' +
      'dimension hierarchy including all member categories with their IDs and names. Dimensions ' +
      'contain the coordinate values needed to select specific time-series within the table ' +
      '(e.g. geography, industry, demographic group). Members are truncated to 50 per dimension. ' +
      'Use coordinate values to call table_data. Product IDs are visible in StatCan table URLs: ' +
      'www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=<productId>01. ' +
      'Source: Statistics Canada WDS, Canada Open Licence, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'statcan.series_info',
    mcpName: 'statcan.series.info',
    title: 'Statistics Canada — Series Info',
    description:
      'Get metadata for a specific Statistics Canada time-series (vector) by its vector ID. ' +
      'Returns the series title (e.g. "Ontario; Consumer Price Index, All items"), parent table ' +
      'product ID, coordinate within the table, release frequency, decimal precision, and whether ' +
      'the series is terminated. Vector IDs are 8–9 digit numbers assigned by Statistics Canada ' +
      'to uniquely identify each time series. Use series_data to retrieve actual observations. ' +
      'Source: Statistics Canada WDS, Canada Open Licence, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'statcan.series_data',
    mcpName: 'statcan.series.data',
    title: 'Statistics Canada — Series Data',
    description:
      'Retrieve the latest N data points for a Statistics Canada time series identified by vector ' +
      'ID. Returns chronological observations with reference period, value, and release timestamp. ' +
      'For annual series: latest_n=10 returns 10 years; for monthly series: 10 returns 10 months. ' +
      'Maximum 100 periods per call. Values represent the original unit (e.g. index points, ' +
      'thousands of persons, millions of CAD) with precision set by the series decimals field. ' +
      'Null values indicate suppressed or unavailable data for that period. ' +
      'Source: Statistics Canada WDS, Canada Open Licence, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'statcan.table_data',
    mcpName: 'statcan.table.data',
    title: 'Statistics Canada — Table Data by Coordinate',
    description:
      'Retrieve the latest N data points for a specific Statistics Canada time series identified ' +
      'by table product ID and dot-separated dimension coordinate. The coordinate selects one ' +
      'unique series within a multi-dimensional table (e.g. "1.12.0.0.0.0.0.0.0.0" selects ' +
      'Newfoundland probation rate). Use table_metadata to discover available coordinates from ' +
      'the dimension/member hierarchy. Returns reference periods, values, and release timestamps. ' +
      'Maximum 100 periods per call. ' +
      'Source: Statistics Canada WDS, Canada Open Licence, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // FBI Crime Data Explorer UCR (4)
  {
    toolId: 'fbi.national_offenses',
    mcpName: 'fbi.crime.national_offenses',
    title: 'FBI UCR — National Crime Statistics',
    description:
      'Retrieve monthly national Uniform Crime Reporting (UCR) crime statistics from the FBI Crime Data ' +
      'Explorer. Returns raw offense counts, rates per 100,000 population, and clearance counts by month ' +
      'for the requested offense type and date range. Offense types include violent-crime, property-crime, ' +
      'homicide, rape, robbery, aggravated-assault, burglary, larceny, motor-vehicle-theft, and arson. ' +
      'Data covers the full US participating law-enforcement agencies (95%+ population coverage). ' +
      'Source: FBI UCR / CDE, US Gov public domain, api.data.gov, no auth required.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'fbi.state_offenses',
    mcpName: 'fbi.crime.state_offenses',
    title: 'FBI UCR — State Crime Statistics vs National',
    description:
      'Retrieve monthly state-level UCR crime statistics from the FBI Crime Data Explorer, including a ' +
      'side-by-side national comparison. Returns offense counts, rates per 100,000 people, and clearance ' +
      'counts for both the requested state and the national average. Supports all 50 US states and DC ' +
      '(use 2-letter abbreviation, e.g. CA, TX, NY). Same 10 offense types as the national endpoint. ' +
      "Ideal for comparing a state's crime rate against the national benchmark. " +
      'Source: FBI UCR / CDE, US Gov public domain, no auth required.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'fbi.national_annual',
    mcpName: 'fbi.crime.national_annual',
    title: 'FBI UCR — National Annual Crime Trends',
    description:
      'Retrieve national year-over-year annual crime totals from FBI UCR data, aggregated from monthly ' +
      'reporting. Returns total offense counts, average rate per 100,000 population, total clearances, ' +
      'and clearance rate percentage for each calendar year. Supports date ranges spanning multiple ' +
      'decades (data available from 1979). Ideal for long-term trend analysis: "Has the US murder rate ' +
      'declined since the 1990s?" or "What are 10-year property crime trends?". ' +
      'Source: FBI UCR / CDE, US Gov public domain, no auth required.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'fbi.state_annual',
    mcpName: 'fbi.crime.state_annual',
    title: 'FBI UCR — State Annual Crime Trends vs National',
    description:
      'Retrieve state-level annual crime totals from FBI UCR data with national comparison, aggregated ' +
      'from monthly reporting. Returns year-by-year offense counts, rates, clearances, and clearance ' +
      'rates for both the specified state and the national average. Perfect for tracking state crime ' +
      'trends over time and comparing against the national picture. Supports 50 states + DC (2-letter ' +
      'code) and multi-decade date ranges back to 1979. ' +
      'Source: FBI UCR / CDE, US Gov public domain, no auth required.',
    category: 'legal',
    annotations: READ_ONLY,
  },

  // Swiss National Bank (4) — UC-541
  {
    toolId: 'swissnbm.fx_rates',
    mcpName: 'swissnbm.fx.rates',
    title: 'SNB — CHF FX Rates',
    description:
      'Retrieve Swiss National Bank official CHF exchange rates for 27 currencies including EUR, USD, ' +
      'GBP, JPY, CNY and more. Returns monthly average or end-of-month fixing values as reported by ' +
      'the SNB at 11 am. Covers historical series back to 1914 for major currencies; specify limit ' +
      'to control how many recent monthly periods are returned (default 24 months). Ideal for CHF ' +
      'valuation, Swiss currency analysis, and monetary research. ' +
      'Source: Swiss National Bank data.snb.ch (cube: devkum), Swiss OGD open license, no auth.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'swissnbm.policy_rate',
    mcpName: 'swissnbm.rates.policy',
    title: 'SNB — Policy Rate & Sight Deposit Rates',
    description:
      'Retrieve the current Swiss National Bank policy rate, SARON overnight fixing, special rate ' +
      '(Liquidity-Shortage Financing Facility), and interest rates on sight deposits (below and above ' +
      'threshold). Returns daily observations for the requested period. The SNB policy rate is the ' +
      'primary monetary policy instrument; as of June 2026 it stands at 0.0%. Essential for Swiss ' +
      'monetary policy analysis, CHF rate expectations, and fixed-income research. ' +
      'Source: Swiss National Bank data.snb.ch (cube: snbgwdzid), Swiss OGD open license, no auth.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'swissnbm.saron_rates',
    mcpName: 'swissnbm.rates.saron',
    title: 'SNB — SARON Reference Rates',
    description:
      'Retrieve Swiss Average Rate Overnight (SARON) and compound term rates published by the Swiss ' +
      'National Bank: overnight SARON, Tomorrow Next, 1-month, 3-month, and 6-month compound rates. ' +
      'SARON replaced LIBOR as the Swiss reference rate benchmark in 2021. Returns daily observations ' +
      'for the requested period. Vital for Swiss franc derivatives pricing, loan referencing, and ' +
      'interest rate risk analysis. ' +
      'Source: Swiss National Bank data.snb.ch (cube: zirepo), Swiss OGD open license, no auth.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'swissnbm.monetary_aggregates',
    mcpName: 'swissnbm.money.aggregates',
    title: 'SNB — Swiss Monetary Aggregates (M1/M2/M3)',
    description:
      'Retrieve Swiss monetary aggregate statistics published by the Swiss National Bank: currency in ' +
      'circulation, sight deposits, M1 (narrowest money), savings deposits, M2, time deposits, and M3 ' +
      '(broadest money supply). Values in CHF millions (level) or percent period-over-period change. ' +
      'Data updated monthly; most recent observations typically available with a 4–6 week lag. ' +
      'Ideal for Swiss monetary conditions analysis, inflation research, and macroeconomic studies. ' +
      'Source: Swiss National Bank data.snb.ch (cube: snbmonagg), Swiss OGD open license, no auth.',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // Eurostat SDMX 2.1 (UC-542) — 5 tools
  {
    toolId: 'eurostat2.fertility',
    mcpName: 'eurostat2.demographics.fertility',
    title: 'Eurostat — EU Fertility & Demographic Indicators',
    description:
      "Retrieve annual fertility and demographic indicators for EU/EEA countries from Eurostat's " +
      'SDMX 2.1 API (dataset: demo_find). Includes total fertility rate, mean age of women at ' +
      'childbirth, mean age at first/second/third birth, median age at childbirth, and share of ' +
      'non-marital births. Country parameter accepts ISO 3166-1 alpha-2 codes (DE, FR, IT, ES, PL) ' +
      'or EU aggregates (EU27_2020, EA20). Data covers 2018–present; updated annually. ' +
      'Source: Eurostat, CC BY 4.0, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'eurostat2.ghg_emissions',
    mcpName: 'eurostat2.environment.ghg',
    title: 'Eurostat — EU Greenhouse Gas Emissions',
    description:
      'Retrieve annual greenhouse gas emission inventories for EU/EEA countries from Eurostat ' +
      '(dataset: env_air_gge, SDMX 2.1). Reports total national emissions (excl. LULUCF memo items) ' +
      'in million tonnes CO2-equivalent. Covers GHG (all greenhouse gases combined), CO2, CH4, N2O, ' +
      'HFC, PFC, and SF6. Country accepts ISO 3166-1 alpha-2 codes (DE, FR, PL) or EU27_2020 ' +
      'aggregate. Data covers 1985–present (with 1–2 year lag); updated annually. ' +
      'Source: Eurostat/EEA air emission accounts, CC BY 4.0, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'eurostat2.rd_spending',
    mcpName: 'eurostat2.innovation.rd',
    title: 'Eurostat — EU R&D Expenditure (GERD)',
    description:
      'Retrieve annual Gross Domestic Expenditure on R&D (GERD) for EU/EEA countries from Eurostat ' +
      '(dataset: rd_e_gerdtot, SDMX 2.1). Covers total and sectoral breakdowns: business enterprise ' +
      '(BES), government (GOV), higher education (HES), and private non-profit (PNP). Unit can be ' +
      '% of GDP (PC_GDP), million EUR (MIO_EUR), or million national currency (MIO_NAC). Country ' +
      'accepts ISO 3166-1 alpha-2 codes (DE, SE, FI) or EU27_2020. ' +
      'Useful for innovation policy research and EU 3%-of-GDP R&D target monitoring. ' +
      'Source: Eurostat, CC BY 4.0, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'eurostat2.renewable_energy',
    mcpName: 'eurostat2.energy.renewable',
    title: 'Eurostat — EU Renewable Energy Consumption',
    description:
      'Retrieve annual renewable energy consumption data for EU/EEA countries from Eurostat ' +
      '(dataset: sdg_07_10, SDMX 2.1, SDG indicator 7.2.1). Reports primary energy consumption ' +
      'from renewable sources in Mtoe (million tonnes of oil equivalent), index (2005=100), or ' +
      'tonnes per capita. Covers solar, wind, hydro, geothermal, and biomass combined. Country ' +
      'accepts ISO 3166-1 alpha-2 codes (DE, SE, DK, AT) or EU27_2020. Data covers 2005–present. ' +
      'Useful for EU Green Deal and energy transition research. ' +
      'Source: Eurostat, CC BY 4.0, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'eurostat2.youth_employment',
    mcpName: 'eurostat2.employment.youth',
    title: 'Eurostat — EU Youth Employment Rate by Education',
    description:
      'Retrieve annual youth employment rate by educational attainment for EU/EEA countries from ' +
      'Eurostat (dataset: yth_empl_010, SDMX 2.1). Returns employment rate (% of age group) for ' +
      'youth aged 15–24 (default), 15–19, 15–29, 20–24, or 20–29, across all ISCED education ' +
      'levels combined. Country accepts ISO 3166-1 alpha-2 codes (DE, FR, ES, IT) or EU27_2020. ' +
      'Data covers 2005–present (with ~1 year lag). ' +
      'Useful for EU youth policy research, labour market analysis, and education-employment gap studies. ' +
      'Source: Eurostat LFS, CC BY 4.0, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // Australian Business Register (3)
  {
    toolId: 'abr.abn_lookup',
    mcpName: 'abr.business.abn_lookup',
    title: 'ABR — Australian Business ABN Lookup',
    description:
      'Resolve an Australian Business Number (ABN) to full entity details using the official ' +
      'Australian Business Register (ABR). Returns entity name, entity type (company, sole trader, ' +
      'partnership, government entity, etc.), ABN status (Active/Cancelled), GST registration date, ' +
      'registered address state and postcode, ACN (if a company), and all registered trading/business names. ' +
      'Covers 15M+ ABNs across all Australian states and territories. ' +
      'Data is live from the ATO-managed national register. Source: ABR, free registration, commercial use permitted.',
    category: 'business',
    annotations: READ_ONLY,
  },
  {
    toolId: 'abr.acn_lookup',
    mcpName: 'abr.business.acn_lookup',
    title: 'ABR — Australian Company ACN Lookup',
    description:
      'Resolve an Australian Company Number (ACN) or ASIC-registered number to full entity details ' +
      'via the Australian Business Register (ABR). Returns the linked ABN, entity name, company type, ' +
      'ABN status, GST registration, registered address, and all associated business names. ' +
      'ACN is a 9-digit number issued by ASIC to every registered Australian company. ' +
      'Use this when you have an ACN from an invoice, contract, or company extract and need to verify ' +
      'the entity against the national register. Source: ABR, free registration, commercial use permitted.',
    category: 'business',
    annotations: READ_ONLY,
  },
  {
    toolId: 'abr.name_search',
    mcpName: 'abr.business.name_search',
    title: 'ABR — Australian Business Name Search',
    description:
      'Search the Australian Business Register (ABR) by business name to find matching entities. ' +
      'Returns ranked matches with ABN, entity name, name type (Entity Name, Trading Name, Business Name), ' +
      'current status, registered state, and postcode. Supports partial name matching and relevance scoring. ' +
      'Optionally filter by Australian state (NSW, VIC, QLD, SA, WA, TAS, NT, ACT) or postcode. ' +
      'Returns up to 50 matches per call. Covers all 15M+ ABN-holders including companies, sole traders, ' +
      'partnerships, trusts, and government entities. Source: ABR, free registration, commercial use permitted.',
    category: 'business',
    annotations: READ_ONLY,
  },

  // Banco de México SIE (5)
  {
    toolId: 'banxico.fx.fix_rate',
    mcpName: 'banxico.fx.fix_rate',
    title: 'Banxico — USD/MXN FIX Exchange Rate',
    description:
      'Get the official Banco de México FIX USD/MXN exchange rate (serie SF43718). ' +
      'The FIX rate is published by Banxico daily and is used for settling obligations denominated ' +
      'in foreign currency in Mexico. Returns the latest observation or a historical date range ' +
      '(YYYY-MM-DD). Source: Banco de México SIE, official government data, free API.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'banxico.fx.rates',
    mcpName: 'banxico.fx.rates',
    title: 'Banxico — Multi-Currency MXN Rates',
    description:
      'Get current Banco de México reference exchange rates for USD, EUR, CAD, and GBP against ' +
      'the Mexican Peso (MXN) in a single call. Returns the latest published value for each currency ' +
      'with its date and series label. Useful for multi-currency MXN conversion and FX monitoring. ' +
      'Source: Banco de México SIE series SF43718 (USD), SF46410 (EUR), SF60632 (CAD), SF60633 (GBP).',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'banxico.rates.target',
    mcpName: 'banxico.rates.target',
    title: 'Banxico — Overnight Target Rate',
    description:
      'Get the Banco de México monetary policy overnight target interest rate (Tasa objetivo, ' +
      'serie SF61745). This is the key policy rate set by the Junta de Gobierno (JOGI) that anchors ' +
      'short-term peso borrowing costs. Returns the latest rate or a historical date range. ' +
      'Rate expressed in percent per annum. Source: Banco de México SIE, official government data.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'banxico.rates.tiie',
    mcpName: 'banxico.rates.tiie',
    title: 'Banxico — TIIE 28-Day Interbank Rate',
    description:
      'Get the TIIE (Tasa de Interés Interbancaria de Equilibrio) 28-day interbank offered rate ' +
      '(serie SF43783). TIIE is the primary benchmark for Mexican peso-denominated credit products ' +
      'including mortgages, business loans, and consumer lending. Returns the latest rate or a ' +
      'historical date range. Rate expressed in percent per annum. Source: Banco de México SIE.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'banxico.inflation.cpi',
    mcpName: 'banxico.inflation.cpi',
    title: 'Banxico — Mexico CPI / INPC Inflation',
    description:
      'Get the Mexico INPC (Índice Nacional de Precios al Consumidor) consumer price index ' +
      '(serie SP1, base Jul 2018 = 100). The INPC is the official inflation indicator produced by ' +
      'INEGI and published by Banxico. Returns the latest monthly index value or a historical range. ' +
      'Use this to track Mexican inflation trends or deflate peso-denominated series. ' +
      'Source: Banco de México SIE, official government data.',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // Bureau of Economic Analysis — BEA (5)
  {
    toolId: 'bea.gdp',
    mcpName: 'bea.national.gdp',
    title: 'BEA — US Real GDP Growth',
    description:
      'Retrieve US Real GDP growth rates from BEA NIPA Table T10101 (Fisher Quantity Index, ' +
      'percent change at annual rate). Returns quarterly or annual percent-change series for ' +
      'total GDP, personal consumption expenditures, gross private investment, exports, imports, ' +
      'and government spending. Official US national accounts data from the Bureau of Economic Analysis. ' +
      'Use for macro analysis, economic forecasting, and recession detection.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bea.personal_income',
    mcpName: 'bea.national.personal_income',
    title: 'BEA — US Personal Income & Outlays',
    description:
      'Retrieve US Personal Income and Outlays from BEA NIPA Table T20100 (millions of dollars). ' +
      'Covers total personal income, compensation of employees, proprietors income, rental income, ' +
      'personal interest income, dividends, personal taxes, disposable personal income, and ' +
      'personal savings. Annual or quarterly frequency, covering all years since 1929. ' +
      'Essential for consumer spending analysis and household financial health tracking.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bea.trade_balance',
    mcpName: 'bea.international.trade_balance',
    title: 'BEA — US International Trade Balance',
    description:
      'Retrieve US international trade balance data from the BEA International Transactions ' +
      'Accounts (ITA) dataset. Covers balance on goods and services, current account balance, ' +
      'goods imports/exports, services imports/exports, and 800+ additional ITA indicators. ' +
      'Filter by country (China, Canada, Mexico, EU, etc.) or use AllCountries for world totals. ' +
      'Values in millions of USD. Annual or quarterly frequency. Official BEA government data.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bea.state_gdp',
    mcpName: 'bea.regional.state_gdp',
    title: 'BEA — US State GDP by Industry',
    description:
      'Retrieve real GDP by US state from the BEA Regional Economic Accounts (CAGDP2 table). ' +
      'Returns GDP in thousands of dollars for all 50 states + DC + US total by year and industry ' +
      'component (agriculture, mining, manufacturing, finance, real estate, government, etc.). ' +
      'Use for state-level economic analysis, regional comparisons, and industry cluster research. ' +
      'GeoFips parameter supports individual state FIPS codes, all states, MSAs, or counties.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bea.industry_gdp',
    mcpName: 'bea.industry.value_added',
    title: 'BEA — GDP Value Added by Industry',
    description:
      'Retrieve value added by NAICS industry sector from the BEA GDP by Industry dataset ' +
      '(Table 1, billions of dollars). Shows how much each industry contributes to total US GDP. ' +
      'Covers all major NAICS sectors: agriculture, mining, utilities, construction, ' +
      'manufacturing, wholesale/retail, information, finance, real estate, healthcare, and government. ' +
      'Annual or quarterly frequency. Use for industry-level economic analysis and sector benchmarking.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  // Africa API (UC-546) — 5 tools
  {
    toolId: 'africa.countries.list',
    mcpName: 'africa.countries.list',
    title: 'Africa API — List African Countries',
    description:
      'List all 54 African countries with ISO codes, capitals, regional classifications, ' +
      'currencies, languages, area, timezone, and border countries. Optionally filter by ' +
      'sub-region: North Africa, West Africa, East Africa, Central Africa, or Southern Africa. ' +
      'Use as a discovery step to get country codes for other Africa API tools.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'africa.countries.signals',
    mcpName: 'africa.countries.signals',
    title: 'Africa API — Country Economic Signals',
    description:
      'Get a live macroeconomic snapshot for an African country. Returns 20–60 indicators ' +
      'across economy (GDP, inflation, trade), climate (precipitation, air quality), ' +
      'health (life expectancy, access to services), and demographic signals. ' +
      'Sources: World Bank WDI, IMF, UN, NASA POWER. Use country_code from africa.countries.list. ' +
      'Ideal for rapid country assessment and investment screening across 54 African nations.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'africa.markets.fx_rates',
    mcpName: 'africa.markets.fx_rates',
    title: 'Africa API — African FX Rates',
    description:
      'Get daily USD exchange rates for all 50+ African currencies. Returns current rate per USD ' +
      'for NGN (Nigerian naira), KES (Kenyan shilling), ZAR (South African rand), ' +
      'EGP (Egyptian pound), GHS (Ghanaian cedi), ETB (Ethiopian birr), MAD (Moroccan dirham), ' +
      'and all other African currency pairs. Rates updated daily. ' +
      "Filter by country code to get the rate for a specific country's currency.",
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'africa.data.indicator',
    mcpName: 'africa.data.indicator',
    title: 'Africa API — Economic Indicator Data',
    description:
      'Query a specific economic indicator time series for an African country. Supports 120+ metrics ' +
      'including GDP (gdp_usd), inflation rate (inflation_pct), GDP per capita (gdp_per_capita_usd), ' +
      'unemployment (unemployment_pct), trade balance (trade_balance_usd), ' +
      'foreign direct investment (fdi_inflows_usd), and more. ' +
      'Returns annual data sourced from World Bank, IMF, and UN. ' +
      'Omit start_year/end_year for latest value; supply both for a historical range (e.g. 2010–2024). ' +
      'Use africa.countries.signals to discover available metric_key values for a country.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'africa.politics.elections',
    mcpName: 'africa.politics.elections',
    title: 'Africa API — African Elections',
    description:
      'List presidential, parliamentary, and local government elections across all 54 African countries. ' +
      'Returns election scope (presidential/parliamentary/local), status (upcoming/completed/ongoing), ' +
      'dates, and country. Filter by country code, election status, or year range. ' +
      'Use status="upcoming" to find upcoming African elections relevant to political risk analysis ' +
      'or investment due diligence. Data sourced from Wikidata and official election commission records.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // HuggingFace Inference NLP (5)
  {
    toolId: 'hf_inference.sentiment',
    mcpName: 'hf_inference.nlp.sentiment',
    title: 'HuggingFace — Sentiment Analysis',
    description:
      'Classify the sentiment of a text using a HuggingFace NLP model via the Inference API. ' +
      'Returns a predicted label (positive, negative, or neutral) with a confidence score, ' +
      'plus scores for all classes. Default model (cardiffnlp/twitter-roberta-base-sentiment-latest) ' +
      'is optimized for social media and short-form text. Supports custom model override. ' +
      'Useful for customer feedback analysis, social media monitoring, and review classification.',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hf_inference.ner',
    mcpName: 'hf_inference.nlp.ner',
    title: 'HuggingFace — Named Entity Recognition',
    description:
      'Extract named entities — people (PER), locations (LOC), organizations (ORG), and miscellaneous (MISC) ' +
      '— from text using a BERT-based NER model via HuggingFace Inference API. ' +
      'Returns each detected entity with its type, confidence score, and character positions in the original text. ' +
      'Default model: dbmdz/bert-large-cased-finetuned-conll03-english (CoNLL-2003, English). ' +
      'Useful for document parsing, contact extraction, and knowledge graph construction.',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hf_inference.zero_shot',
    mcpName: 'hf_inference.nlp.zero_shot',
    title: 'HuggingFace — Zero-shot Text Classification',
    description:
      'Classify text into any custom set of categories without requiring model fine-tuning or training data. ' +
      'Provide a list of 2–20 candidate labels; the model determines which best describes the input text. ' +
      'Returns labels ranked by confidence score. Supports multi-label mode (text can match multiple categories). ' +
      'Default model: facebook/bart-large-mnli. ' +
      'Ideal for routing, content moderation, intent detection, and ad-hoc categorization tasks.',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hf_inference.translate',
    mcpName: 'hf_inference.nlp.translate',
    title: 'HuggingFace — Machine Translation',
    description:
      'Translate text between languages using the Helsinki-NLP opus-mt model family via HuggingFace Inference API. ' +
      'Covers 1,000+ language pairs (English to French, Spanish, German, Chinese, Japanese, Arabic, Russian, etc.). ' +
      'Specify target_lang as a 2-letter ISO 639-1 code (e.g. "fr", "es", "de", "zh", "ja"). ' +
      'The adapter automatically selects the opus-mt-{source}-{target} model. ' +
      'Useful for multilingual content pipelines, localization, and cross-language information retrieval.',
    category: 'developer',
    annotations: READ_ONLY,
  },
  // UN-Habitat Urban Indicators Database (4)
  {
    toolId: 'unhabitat.transport_access',
    mcpName: 'unhabitat.urban.transport_access',
    title: 'UN-Habitat — SDG 11.2.1 Public Transport Access',
    description:
      'Retrieve city-level data on the proportion of urban population with convenient access to public transport ' +
      '(SDG indicator 11.2.1). Covers 1,555 cities across all world regions from the UN-Habitat Urban Indicators Database. ' +
      'Filter by country, city name, or UN region. Returns access percentage and estimate source per city. ' +
      'Useful for urban mobility analysis, SDG 11 reporting, and comparing public transit equity across cities.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'unhabitat.land_consumption',
    mcpName: 'unhabitat.urban.land_consumption',
    title: 'UN-Habitat — SDG 11.3.1 Land Consumption Rates',
    description:
      'Retrieve city-level land consumption rate (LCR) versus population growth rate (PGR) data for SDG 11.3.1. ' +
      'Covers 581 cities with measurements for the 1990–2000 and 2000–2015 periods. ' +
      'A LCR/PGR ratio > 1 indicates urban sprawl (land expanding faster than population). ' +
      'Includes built-up area per capita (m²/person) at three time points. ' +
      'Filter by country, city, or UN region. Useful for sustainable urbanization and land-use planning analysis.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'unhabitat.open_spaces',
    mcpName: 'unhabitat.urban.open_spaces',
    title: 'UN-Habitat — SDG 11.7.1 Urban Open Spaces',
    description:
      'Retrieve the share of urban built-up area allocated to open public spaces (parks, plazas) and streets ' +
      '(SDG indicator 11.7.1). Covers 621 cities as of the 2020 measurement year. ' +
      'Returns percentage of open public space, street space, and combined open-and-street share, ' +
      'plus the population count with access to open public space. ' +
      'Filter by country, city, or UN region. Useful for green space equity, climate resilience, and liveability analysis.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'unhabitat.city_budget',
    mcpName: 'unhabitat.urban.city_budget',
    title: 'UN-Habitat — Global Municipal Budget Database',
    description:
      'Retrieve municipal budget and expenditure data from the UN-Habitat Global Municipal Database. ' +
      'Covers 1,207 cities worldwide with total budget (USD), budget per capita, capital expenditure, ' +
      'own-source revenue, and sector-wise expenditure percentages (education, health, transport, water, ' +
      'energy, sanitation, solid waste, public housing, streets, buildings). ' +
      'Filter by country, city, or UN region. Income group (low/lower-middle/upper-middle/high) included. ' +
      'Useful for comparative municipal finance analysis and urban governance research.',
    category: 'world',
    annotations: READ_ONLY,
  },
  // CORDIS EU Research (4)
  {
    toolId: 'cordis.project_search',
    mcpName: 'cordis.research.project_search',
    title: 'CORDIS — EU Research Project Search',
    description:
      'Search 80,000+ EU-funded research projects from Horizon Europe (2021–2027) and H2020 (2014–2020) ' +
      'using the CORDIS EURIO linked-data SPARQL endpoint. Filter by keywords in the project title, ' +
      'lifecycle status (SIGNED = active, CLOSED = completed, TERMINATED = cancelled), ' +
      'and start year range. Returns grant agreement ID, RCN, title, dates, and status. ' +
      'Use the `id` field with cordis.research.project_details to get full project data. ' +
      'Covers research in AI, climate, health, energy, space, digital, and all Horizon thematic clusters.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cordis.project_details',
    mcpName: 'cordis.research.project_details',
    title: 'CORDIS — EU Project Full Details',
    description:
      'Retrieve full details for a specific EU-funded research project by its grant agreement number. ' +
      'Returns project title, acronym, abstract (project description and scientific objectives), ' +
      'start and end dates, total EU funding in EUR, duration in months, signature date, ' +
      'project status, and the list of all participating organisations with their roles ' +
      '(coordinator vs participant). ' +
      'Use the Horizon Europe CORDIS project page URL for direct browser access. ' +
      'Grant IDs are typically 9-digit numbers (Horizon Europe) or 6-digit numbers (H2020).',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cordis.organisation_search',
    mcpName: 'cordis.research.organisation_search',
    title: 'CORDIS — EU Research Organisation Search',
    description:
      'Find universities, research institutes, companies, and SMEs registered in CORDIS as ' +
      'participants in EU-funded research. Search by organisation name fragment (case-insensitive). ' +
      'Optionally filter by ISO 2-letter country code. Returns CORDIS organisation ID (PIC number), ' +
      'legal name, country, website URL, and entity type (Organisation / ForProfitOrganisation / SME). ' +
      'Useful for partner discovery, consortium research, and EU research landscape mapping. ' +
      'Covers 72,000+ organisations across all EU member states and associated countries.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cordis.project_publications',
    mcpName: 'cordis.research.project_publications',
    title: 'CORDIS — EU Project Publications Search',
    description:
      'Search research publications (journal papers, conference proceedings) linked to EU-funded projects ' +
      'in the CORDIS linked-data knowledge graph. Filter by keyword in the publication title, ' +
      'or scope to a specific project by providing the grant agreement number. ' +
      'Returns publication identifier, full title, DOI (when available), publication date, ' +
      'and the RCN of the parent EU project. ' +
      'Covers 283,000+ journal papers and 92,000+ proceedings papers from Horizon/H2020 research.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hf_inference.summarize',
    mcpName: 'hf_inference.nlp.summarize',
    title: 'HuggingFace — Text Summarization',
    description:
      'Summarize a long text into a shorter, coherent paragraph using the facebook/bart-large-cnn model ' +
      'via HuggingFace Inference API. Trained on CNN/DailyMail news articles; works well for factual prose. ' +
      'Control output length with max_length (token cap) and min_length (token floor) parameters. ' +
      'Custom model override supported (e.g. google/pegasus-xsum for extreme single-sentence summaries). ' +
      'Useful for article digests, executive summaries, and reducing LLM context window usage.',
    category: 'developer',
    annotations: READ_ONLY,
  },
  // IRENA IRENASTAT (4) — UC-550
  {
    toolId: 'irena.capacity_country',
    mcpName: 'irena.energy.capacity_country',
    title: 'IRENA — Renewable Electricity Capacity by Country',
    description:
      'Query renewable and non-renewable electricity installed capacity (MW) for any country from the IRENA ' +
      'IRENASTAT database. Covers 226 countries and territories, 26 energy technologies (Total renewable energy, ' +
      'Solar photovoltaic, Wind, Hydropower, Bioenergy, Geothermal, etc.), on-grid and off-grid, from 2000 to 2025. ' +
      'Returns a time-series of MW values per year. Official IRENA data — the authoritative global source for ' +
      'renewable energy statistics used by the IPCC, IEA, and UN agencies.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'irena.generation_country',
    mcpName: 'irena.energy.generation_country',
    title: 'IRENA — Renewable Electricity Generation by Country',
    description:
      'Query electricity generation (GWh) by energy technology for any country from the IRENA IRENASTAT database. ' +
      'Covers 226 countries and territories, 21 technologies including Total renewable, Solar PV, Onshore and ' +
      'Offshore wind, Renewable hydropower, Bioenergy subcategories, Geothermal, Marine energy, and Total ' +
      'non-renewable. On-grid, off-grid, or combined. Annual data from 2000 to 2024. ' +
      'Essential for energy transition analysis, NDC tracking, and climate policy research.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'irena.capacity_region',
    mcpName: 'irena.energy.capacity_region',
    title: 'IRENA — Renewable Electricity Capacity by World Region',
    description:
      'Query renewable and non-renewable electricity installed capacity (MW) aggregated by IRENA world region ' +
      'from the IRENASTAT database. Regions: World, Africa, Asia, Europe, North America, South America, ' +
      'Middle East, Eurasia, Oceania, Central America and the Caribbean. ' +
      'Covers 13 technology categories from 2000 to 2025. Useful for comparing regional energy transition progress, ' +
      'identifying leading regions in solar/wind deployment, and tracking global renewable capacity milestones.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'irena.share_renewables',
    mcpName: 'irena.energy.share_renewables',
    title: 'IRENA — Renewable Energy Share of Electricity',
    description:
      'Query the share (%) of renewable energy in total electricity capacity or generation for any country ' +
      'or IRENA world region from the IRENASTAT database. Covers 233 countries/regions from 2000 to 2025. ' +
      'Choose indicator "generation" for the share of electricity actually produced from renewables, or ' +
      '"capacity" for the share of installed power plant capacity that is renewable. ' +
      'Key metric for energy transition tracking, SDG 7 (affordable clean energy) monitoring, and ' +
      'comparison against national climate targets (NDCs, net-zero commitments).',
    category: 'world',
    annotations: READ_ONLY,
  },
  // DOAJ — Directory of Open Access Journals (4)
  {
    toolId: 'doaj.journal_search',
    mcpName: 'doaj.journals.search',
    title: 'DOAJ — Search Open Access Journals',
    description:
      'Search the Directory of Open Access Journals (DOAJ) for peer-reviewed, fully open access journals. ' +
      'DOAJ indexes 20,000+ journals in 80+ languages from 129 countries — all free to read, CC-licensed, ' +
      'and vetted for quality. Query by topic, ISSN, publisher, or DOAJ query syntax. ' +
      'Returns title, ISSN, publisher, country, subject classification, license type, APC cost, ' +
      'preservation services (CLOCKSS, Portico, LOCKSS), and OA start year. ' +
      'Useful for finding publishing venues, checking journal legitimacy, and academic research.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'doaj.journal_detail',
    mcpName: 'doaj.journals.detail',
    title: 'DOAJ — Open Access Journal Detail',
    description:
      'Retrieve full metadata for a single open access journal from the Directory of Open Access Journals ' +
      'by its DOAJ journal ID. Returns comprehensive bibliographic and quality metadata including aims & scope URL, ' +
      'author instructions, peer-review process type, BOAI compliance status, APC pricing in EUR, ' +
      'preservation archiving services, and all ISSN variants. ' +
      'Use after doaj.journals.search to get complete details for a specific journal.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'doaj.article_search',
    mcpName: 'doaj.articles.search',
    title: 'DOAJ — Search Open Access Articles',
    description:
      'Search 10 million+ open access articles indexed by the Directory of Open Access Journals (DOAJ). ' +
      'All articles are from peer-reviewed journals with immediate free access (no embargo, no paywall). ' +
      'Query by topic, author, title, DOI, or DOAJ query syntax. ' +
      'Returns title, authors, journal, year, subjects, keywords, abstract (up to 500 chars), ' +
      'DOI, and full-text URL for direct access to the paper. ' +
      'Ideal for finding freely readable academic literature across any discipline.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'doaj.article_detail',
    mcpName: 'doaj.articles.detail',
    title: 'DOAJ — Open Access Article Detail',
    description:
      'Retrieve full metadata for a single open access article from the Directory of Open Access Journals ' +
      'by its DOAJ article ID. Returns complete bibliographic record including all authors, journal title, ' +
      'ISSN, publication year and month, subject classifications, full keyword list, full abstract, ' +
      'DOI, and direct full-text URL. ' +
      'Use after doaj.articles.search to get complete details for a specific article.',
    category: 'education',
    annotations: READ_ONLY,
  },
  // Cleveland Museum of Art Open Access (4)
  {
    toolId: 'clevelandart.artwork_search',
    mcpName: 'clevelandart.artwork.search',
    title: 'Cleveland Museum of Art — Search Artworks',
    description:
      'Search 68,000+ artworks in the Cleveland Museum of Art open access collection. ' +
      'Filter by keyword, artwork type (Painting, Drawing, Print, Sculpture, Photograph, Textile), ' +
      'museum department, and whether an image is available. ' +
      'Returns title, creator names, type, department, creation date, culture, technique, ' +
      'web-resolution image URL, and artwork page URL. ' +
      'All records are freely available under CC0 or CC BY — usable for research, education, and creative projects. ' +
      'Collections span ancient Egypt, medieval Europe, East Asian art, American modernism, and more.',
    category: 'media',
    annotations: READ_ONLY,
  },
  {
    toolId: 'clevelandart.artwork_detail',
    mcpName: 'clevelandart.artwork.detail',
    title: 'Cleveland Museum of Art — Artwork Detail',
    description:
      'Retrieve complete metadata for a single artwork by its numeric ID from the Cleveland Museum of Art collection. ' +
      'Returns full tombstone, tombstone text, creator biographies, medium/technique, measurements, provenance creditline, ' +
      'copyright status, gallery location, loan status, image URLs in web/print/full resolutions, ' +
      'and the CMA collection page URL. ' +
      'Use after clevelandart.artwork_detail to get the complete record for a specific work.',
    category: 'media',
    annotations: READ_ONLY,
  },
  {
    toolId: 'clevelandart.creator_search',
    mcpName: 'clevelandart.creator.search',
    title: 'Cleveland Museum of Art — Search Creators',
    description:
      'Search 9,200+ artists and creators in the Cleveland Museum of Art open access database. ' +
      'Find artists by name or nationality. Returns creator name, nationality, biography, ' +
      'birth/death years, and a list of artworks held by the CMA attributed to that creator. ' +
      'Covers painters, sculptors, printmakers, photographers, and craftspeople across all periods and cultures.',
    category: 'media',
    annotations: READ_ONLY,
  },
  {
    toolId: 'clevelandart.exhibition_search',
    mcpName: 'clevelandart.exhibition.search',
    title: 'Cleveland Museum of Art — Search Exhibitions',
    description:
      'Search 5,600+ exhibitions in the Cleveland Museum of Art historical archive. ' +
      'Find past and current exhibitions by keyword, and optionally filter to those held at the CMA itself. ' +
      'Returns exhibition title, organizer, opening and closing dates, and venue list with dates. ' +
      'Useful for art history research, provenance tracking, and understanding the institutional history of CMA artworks.',
    category: 'media',
    annotations: READ_ONLY,
  },

  // UniProt (4)
  {
    toolId: 'uniprot.protein_search',
    mcpName: 'science.uniprot.search',
    title: 'UniProt — Search Proteins',
    description:
      'Search the UniProt protein sequence database for proteins by name, gene, or organism. ' +
      "UniProt is the world's leading repository for protein sequences and functional annotations, " +
      'covering 250M+ sequences from Swiss-Prot (reviewed) and TrEMBL (unreviewed). ' +
      'Returns accession, protein name, organism, gene names, sequence length, review status, and annotation score. ' +
      'Supports field-specific queries (gene:TP53, organism:9606) and free-text search. ' +
      "Use reviewed:true to restrict to Swiss-Prot's manually curated, high-quality entries. " +
      'CC BY 4.0 — Universal Protein Resource (UniProt Consortium)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'uniprot.protein_entry',
    mcpName: 'science.uniprot.entry',
    title: 'UniProt — Protein Entry Details',
    description:
      'Get full annotation details for a protein by UniProt accession number (e.g. P69905, P01308). ' +
      'Returns protein name, EC numbers, alternative names, organism and lineage, gene names, ' +
      'sequence (first 200 aa), molecular weight, biological function, subcellular location, ' +
      'associated diseases, keywords, cross-references to PDB/Ensembl/RefSeq/OMIM/PubMed, and feature count. ' +
      'P69905 = hemoglobin alpha chain; P01308 = human insulin; P04637 = tumor suppressor p53 (TP53). ' +
      'CC BY 4.0 — Universal Protein Resource (UniProt Consortium)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'uniprot.protein_features',
    mcpName: 'science.uniprot.features',
    title: 'UniProt — Protein Sequence Features',
    description:
      'Get sequence-level annotations and functional features for a protein by UniProt accession. ' +
      'Returns active sites, binding sites, signal peptides, transmembrane regions, ' +
      'disulfide bonds, post-translational modifications, domain boundaries, secondary structure elements ' +
      '(helix, strand, turn), natural variants, and chain cleavage sites — all with exact sequence positions. ' +
      'Essential for structural biology, drug target analysis, and protein engineering workflows. ' +
      'CC BY 4.0 — Universal Protein Resource (UniProt Consortium)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'uniprot.taxonomy',
    mcpName: 'science.uniprot.taxonomy',
    title: 'UniProt — Taxonomy Search',
    description:
      'Search UniProt taxonomy to find organism names, NCBI taxonomy IDs, lineages, and protein counts. ' +
      'Returns taxon ID, scientific name, common name, taxonomic rank, full lineage path, ' +
      'and the number of reviewed (Swiss-Prot) and unreviewed (TrEMBL) proteins for that organism. ' +
      'Use to resolve organism names to taxonomy IDs for protein_search filtering ' +
      '(e.g. "human" → taxon_id 9606, "mouse" → 10090, "E. coli K12" → 83333). ' +
      'CC BY 4.0 — Universal Protein Resource (UniProt Consortium)',
    category: 'health',
    annotations: READ_ONLY,
  },

  // BioModels (4)
  {
    toolId: 'biomodels.model.search',
    mcpName: 'biomodels.model.search',
    title: 'BioModels — Search Biological Models',
    description:
      'Search the BioModels repository for peer-reviewed mathematical models of biological and biomedical systems. ' +
      "BioModels is the world's primary repository for quantitative kinetic models, hosted by EMBL-EBI. " +
      'Contains 3,200+ models in SBML format covering signaling pathways, metabolic networks, gene regulation, ' +
      'pharmacokinetics, circadian rhythms, disease dynamics (COVID-19, diabetes, cancer), and more. ' +
      'Returns model accession IDs (BIOMD prefix = curated, MODEL prefix = submitted), names, formats, ' +
      'submitter info, and URLs. Filter by curation status to restrict to manually validated models. ' +
      'CC0 Public Domain — European Bioinformatics Institute (EMBL-EBI)',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'biomodels.model.detail',
    mcpName: 'biomodels.model.detail',
    title: 'BioModels — Model Details',
    description:
      'Get full metadata for a specific BioModels mathematical model by accession ID ' +
      '(e.g. "BIOMD0000000001" for the Edelstein 1996 nicotinic acetylcholine receptor model). ' +
      'Returns model name, curation status, modelling approach (ODE, logical, stochastic), ' +
      'SBML format and version, description of the biological system, linked peer-reviewed publication ' +
      '(PubMed ID, journal, year, authors), contributor roles (curator, submitter, encoder), ' +
      'and model-level ontology annotations (GO terms, disease terms, taxonomy, pathway cross-references). ' +
      'Use biomodels.model.search first to discover accession IDs. ' +
      'CC0 Public Domain — EMBL-EBI BioModels Database',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'biomodels.model.files',
    mcpName: 'biomodels.model.files',
    title: 'BioModels — Model Download Files',
    description:
      'List all downloadable file representations for a BioModels model by accession ID. ' +
      'Returns the main SBML file (primary format, compatible with COPASI, libSBML, JWS Online, Tellurium), ' +
      'plus auto-generated alternative formats: BioPAX Level 2 and 3 (OWL/RDF for pathway databases), ' +
      'MATLAB/Octave simulation scripts (.m files), and any author-supplied supplementary files. ' +
      'Each entry includes filename, description, MIME type, file size in bytes, MD5 checksum, ' +
      'and the direct download URL. Use to retrieve simulation-ready model files for computational biology workflows. ' +
      'CC0 Public Domain — EMBL-EBI BioModels Database',
    category: 'health',
    annotations: READ_ONLY,
  },
  // Open-Meteo Air Quality (4)
  {
    toolId: 'openmeteoaq.current',
    mcpName: 'openmeteoaq.air.current',
    title: 'Open-Meteo — Current Air Quality',
    description:
      'Get real-time air quality conditions for any global location using Copernicus CAMS data. ' +
      'Returns PM10, PM2.5 (μg/m³), carbon monoxide, nitrogen dioxide, sulphur dioxide, ozone, ' +
      'aerosol optical depth, dust, UV index, ammonia, European AQI (0–500 CAQI scale), ' +
      'and US AQI (0–500+ EPA scale). No API key required. Coverage: global, hourly updates. ' +
      'Open-source Open-Meteo — CC BY 4.0.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'openmeteoaq.forecast',
    mcpName: 'openmeteoaq.air.forecast',
    title: 'Open-Meteo — Air Quality Forecast',
    description:
      'Get hourly air quality forecast (1–7 days ahead) for any global location. ' +
      'Returns time-series arrays for selected pollutants: PM10, PM2.5, NO2, ozone, SO2, CO, ' +
      'aerosol optical depth, dust, UV index, ammonia, European AQI, US AQI. ' +
      'Useful for trip planning, outdoor event scheduling, or health risk monitoring. ' +
      'Copernicus CAMS model, no auth. Open-Meteo CC BY 4.0.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'openmeteoaq.historical',
    mcpName: 'openmeteoaq.air.historical',
    title: 'Open-Meteo — Historical Air Quality',
    description:
      'Retrieve hourly historical air quality data for a date range at any global location. ' +
      'Returns PM10, PM2.5, ozone, nitrogen dioxide, European AQI, US AQI and other pollutants. ' +
      'Historical data available from 2022-01-01. Maximum query range ~1 year per call. ' +
      'Copernicus CAMS reanalysis, no auth. Open-Meteo CC BY 4.0.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'openmeteoaq.pollen',
    mcpName: 'openmeteoaq.air.pollen',
    title: 'Open-Meteo — Pollen Forecast',
    description:
      'Get current and forecast pollen concentrations (grains/m³) for any global location. ' +
      'Returns alder, birch, grass, mugwort, olive, and ragweed pollen — the six key allergens. ' +
      'Includes current reading plus hourly forecast for 1–7 days. ' +
      'Useful for allergy apps, outdoor scheduling, and health risk agents. ' +
      'Copernicus CAMS pollen model, no auth. Open-Meteo CC BY 4.0.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'biomodels.model.latest',
    mcpName: 'biomodels.model.latest',
    title: 'BioModels — Latest Curated Models',
    description:
      'List the most recently updated manually curated mathematical models in BioModels. ' +
      'Curated models (BIOMD prefix) are peer-validated: each has been reproduced, annotated with ' +
      'standard ontologies (Gene Ontology, KEGG, ChEBI, UniProt, PubMed), and verified to match ' +
      'the figures in the linked publication. Returns model accession IDs, names, format, ' +
      'submission date, last modification date, submitter, and model URL, sorted by last update descending. ' +
      'Use to discover newly added or recently revised biological models across all domains. ' +
      'CC0 Public Domain — EMBL-EBI BioModels Database',
    category: 'health',
    annotations: READ_ONLY,
  },
  // USGS HANS Volcano (6)
  {
    toolId: 'volcano.monitored',
    mcpName: 'volcano.status.monitored',
    title: 'USGS — Monitored Volcanoes',
    description:
      'Get all US volcanoes currently under active monitoring by the USGS Volcano Hazards Program. ' +
      'Returns ~69 volcanoes with current alert level (NORMAL/ADVISORY/WATCH/WARNING), aviation ' +
      'color code (GREEN/YELLOW/ORANGE/RED), observatory name, and the most recent notice URL. ' +
      'Monitoring requires ground-based instruments to be operational — some volcanoes may be ' +
      'temporarily excluded during equipment outages. ' +
      'Use as a first step to identify volcano IDs for detail/notice lookups. ' +
      'No auth — USGS public domain, data updated in real time as notices are issued.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'volcano.elevated',
    mcpName: 'volcano.status.elevated',
    title: 'USGS — Elevated Alert Volcanoes',
    description:
      'Get all US volcanoes currently in an elevated state (color code YELLOW, ORANGE, or RED; ' +
      'alert level ADVISORY, WATCH, or WARNING). Returns only volcanoes with active unrest or eruption. ' +
      'Includes volcano name, Smithsonian vnum, USGS volcano code, current alert level and color code, ' +
      'observatory, time of last notice, and notice URL. ' +
      'Returns an empty array when all monitored volcanoes are at NORMAL/GREEN status. ' +
      'Ideal for real-time hazard monitoring dashboards and aviation safety agents. ' +
      'No auth — USGS public domain, updated within minutes of official notice issuance.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'volcano.cap_alerts',
    mcpName: 'volcano.alerts.cap',
    title: 'USGS — CAP Volcanic Alerts',
    description:
      'Get Common Alerting Protocol (CAP) information for highly elevated volcanoes (ORANGE/WATCH ' +
      'or higher). CAP is the international emergency alert standard used by aviation authorities ' +
      'and civil protection agencies. Returns full CAP metadata: location (lat/lon/elevation), ' +
      'alert certainty, severity, urgency, synopsis text, expiry time, and previous alert state. ' +
      'Only volcanoes that have been at ORANGE or above at least once appear here. ' +
      'Use for integration with emergency management systems, aviation NOTAM workflows, or ' +
      'real-time public alerting pipelines. ' +
      'No auth — USGS public domain.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'volcano.us_catalog',
    mcpName: 'volcano.catalog.us',
    title: 'USGS — US Volcano Catalog',
    description:
      'Get the full catalog of all 170 US volcanoes tracked by the USGS Volcano Hazards Program. ' +
      'Includes Alaska, Hawaii, Cascades (Washington/Oregon/California), and other regions. ' +
      'Each entry contains: Smithsonian volcano number (vnum), USGS volcano code, region, ' +
      'GPS coordinates, elevation, NVEWS threat rating (Very High / High / Moderate / Low / Very Low), ' +
      'observatory contact, official volcano page URL, and image URL. ' +
      'Optionally filter by region substring (e.g. "Alaska", "Hawaii", "Cascades"). ' +
      'Use to enumerate all US volcanoes, discover IDs, or build regional hazard maps. ' +
      'No auth — USGS public domain.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'volcano.detail',
    mcpName: 'volcano.catalog.detail',
    title: 'USGS — Volcano Detail',
    description:
      'Get detailed information for a single US volcano by its USGS volcano code or Smithsonian vnum. ' +
      'Returns name, coordinates, elevation, region, NVEWS threat rating, observatory, ' +
      'plain-text description (HTML stripped), official volcano page URL, image URL, and ' +
      'links to the HANS hazard page and newest notice API. ' +
      'Use volcano.us_catalog or volcano.monitored to discover valid volcano IDs. ' +
      'Example: volcano_id="ak277" for Takawangha, "311120" for Great Sitkin. ' +
      'No auth — USGS public domain.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'volcano.latest_notice',
    mcpName: 'volcano.notices.latest',
    title: 'USGS — Latest Volcano Notice',
    description:
      'Get the text of the most recent official notice for a specific US volcano. ' +
      'USGS observatories issue daily updates, information statements, and activity alerts ' +
      'in a standardized format. Returns the notice as plain text (HTML stripped) and ' +
      'optionally the original HTML. ' +
      'Notices describe current volcanic activity: seismicity, deformation, emissions, ' +
      'lava flow extent, ash cloud height, and recommended actions. ' +
      'Use with volcano_id from volcano.monitored or volcano.us_catalog. ' +
      'No auth — USGS public domain, data updated as notices are issued.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // USGS NWIS Streamflow (UC-557) — 4 tools
  // ---------------------------------------------------------------------------
  {
    toolId: 'nwis.daily_values',
    mcpName: 'nwis.streamflow.daily_values',
    title: 'USGS NWIS — Daily Streamflow Values',
    description:
      'Get historical daily mean streamflow (discharge) values for a USGS gauge station over any date range. ' +
      'Returns one measurement per day (midnight UTC) in cubic feet per second (ft3/s). ' +
      'Also supports gage height (ft), water temperature (°C), specific conductance, and turbidity via parameter_cd. ' +
      'Ideal for trend analysis, drought monitoring, flood season review, and hydrology research. ' +
      'Coverage: 1,500+ active US streamflow stations, records from 1900s to present. ' +
      'Use water.sites to look up station numbers by state or bounding box. ' +
      'No auth — USGS public domain, unlimited calls.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nwis.annual_stats',
    mcpName: 'nwis.streamflow.annual_stats',
    title: 'USGS NWIS — Annual Streamflow Statistics',
    description:
      'Get year-by-year annual mean streamflow statistics for a USGS gauge station. ' +
      'Returns mean discharge (ft3/s) for each water year with records going back to 1900s at major stations. ' +
      'Useful for long-term hydrologic trend analysis, climate change assessment, and water resource planning. ' +
      'Typical major stations have 60–90 years of annual records. ' +
      'Use water.sites to look up station numbers by state or bounding box. ' +
      'No auth — USGS public domain, unlimited calls.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nwis.basin_conditions',
    mcpName: 'nwis.streamflow.basin_conditions',
    title: 'USGS NWIS — Basin-Wide Streamflow Conditions',
    description:
      'Get real-time streamflow readings for all active USGS gauge stations within a HUC-8 watershed basin. ' +
      'Returns current discharge (ft3/s) at every station in the basin — typically 5–40 sites — in a single call. ' +
      'Ideal for watershed-scale flood monitoring, drought assessment, and basin hydrology surveys. ' +
      'HUC-8 (8-digit Hydrologic Unit Code) defines a sub-basin level watershed (e.g. "02070008" = Potomac Basin). ' +
      'Find HUC codes at water.usgs.gov or use huc=XXXXXXXX for your area of interest. ' +
      'No auth — USGS public domain, updated every 15 minutes.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nwis.site_info',
    mcpName: 'nwis.streamflow.site_info',
    title: 'USGS NWIS — Gauge Station Metadata',
    description:
      'Get detailed metadata for a specific USGS hydrologic monitoring station: drainage area, HUC watershed code, ' +
      'precise coordinates, altitude, site type, state/county codes, and timezone. ' +
      'The drainage_area_sqmi field is critical for discharge-to-runoff calculations and flood frequency analysis. ' +
      'Complements water.sites (which searches by state/bounding box) by providing deep metadata for a known site. ' +
      'Use water.sites first to find the site_no, then call this for full station context. ' +
      'No auth — USGS public domain, unlimited calls.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // WHO Global Health Observatory OData (4)
  {
    toolId: 'who.indicator_search',
    mcpName: 'who.health.indicator_search',
    title: 'WHO GHO — Search Health Indicators',
    description:
      'Search the WHO Global Health Observatory catalog of 3,000+ health indicators by keyword. ' +
      'Returns indicator codes, full names, and definitions for topics like immunization, life expectancy, ' +
      'mortality, tuberculosis, malaria, maternal health, NCDs, and SDG health metrics. ' +
      'Use the returned indicator_code with who.indicator_data to retrieve actual values. ' +
      'No auth — WHO CC BY-NC-SA 3.0 IGO, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'who.indicator_data',
    mcpName: 'who.health.indicator_data',
    title: 'WHO GHO — Get Indicator Data',
    description:
      'Retrieve time-series values for a specific WHO Global Health Observatory indicator. ' +
      'Filter by country (ISO alpha-3), year range, and sex (both sexes, male, or female). ' +
      'Returns numeric values with confidence intervals for indicators such as life expectancy at birth ' +
      '(WHOSIS_000001), DTP3 immunization coverage (dptv), TB incidence (MDG_0000000020), and 3,000+ more. ' +
      'Use who.indicator_search to find indicator codes. No auth — unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'who.country_health',
    mcpName: 'who.health.country_data',
    title: 'WHO GHO — Country Health Data',
    description:
      'Get WHO health indicator data for a specific country. Specify a 3-letter ISO country code ' +
      'and optionally filter by indicator and year. Useful for country-level health profiles: ' +
      'life expectancy, immunization coverage, maternal mortality, disease burden, and SDG health targets. ' +
      'Use who.dimension_values with dimension="COUNTRY" to discover valid country codes. ' +
      'No auth — WHO public data, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'who.dimension_values',
    mcpName: 'who.health.dimension_values',
    title: 'WHO GHO — List Dimension Values',
    description:
      'List valid values for a WHO GHO dimension such as countries (COUNTRY), WHO regions (REGION), ' +
      'sex categories (SEX), age groups (AGEGROUP), or world bank income groups (WORLDBANKINCOMEGROUP). ' +
      'Essential for discovering valid filter values before querying indicator data. ' +
      'Returns codes and human-readable titles for all values in the dimension. ' +
      'No auth — WHO public reference data, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },

  // NLM ICD-11 Clinical Tables (4) — UC-560
  {
    toolId: 'icd11.search',
    mcpName: 'icd11.disease.search',
    title: 'NLM ICD-11 — Search Disease Codes',
    description:
      'Search the ICD-11 disease classification for diagnosis codes by clinical term. ' +
      'Returns matching ICD-11 codes with titles and code type (stem = primary diagnosis, extension = modifier/qualifier). ' +
      'Covers all 55,000+ ICD-11 codes including diseases, injuries, external causes, and functional assessments. ' +
      'Use for clinical coding, medical record classification, disease surveillance, and health informatics. ' +
      'No auth — US National Library of Medicine public domain, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'icd11.lookup',
    mcpName: 'icd11.disease.lookup',
    title: 'NLM ICD-11 — Look Up Specific Code',
    description:
      'Retrieve the title and classification type for a specific ICD-11 code. ' +
      'Returns the human-readable disease/condition name and whether the code is a primary stem code or an extension modifier. ' +
      'Use to validate ICD-11 codes, decode alphanumeric codes in clinical records, or verify correct code usage. ' +
      'Examples: BA00 → Essential hypertension, 5A10 → Type 1 diabetes mellitus, CA40 → Pneumonia. ' +
      'No auth — US National Library of Medicine public domain, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'icd11.autocomplete',
    mcpName: 'icd11.disease.autocomplete',
    title: 'NLM ICD-11 — Autocomplete Suggestions',
    description:
      'Get fast ICD-11 code autocomplete suggestions for a partial clinical term. ' +
      'Returns up to 10 matching codes and titles as the user types — ideal for building clinical coding interfaces, ' +
      'EHR integrations, or any application requiring responsive disease/diagnosis search. ' +
      'Input partial terms like "dia" → diabetes options, "hyp" → hypertension, "pneu" → pneumonia. ' +
      'No auth — US National Library of Medicine public domain, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'icd11.primary_search',
    mcpName: 'icd11.disease.primary_search',
    title: 'NLM ICD-11 — Search Primary Diagnosis Codes',
    description:
      'Search ICD-11 codes returning only primary (stem) diagnosis codes — filters out extension/modifier codes. ' +
      'Stem codes represent principal diagnoses and standalone conditions, while extension codes are qualifiers ' +
      '(severity, laterality, histopathology). Use this when you need clean primary diagnoses for: ' +
      'mortality coding, disease surveillance, DRG assignment, or primary diagnosis classification. ' +
      'No auth — US National Library of Medicine public domain, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },

  // CMU Delphi Epidata (4) — UC-559
  {
    toolId: 'delphi.fluview',
    mcpName: 'delphi.flu.fluview',
    title: 'CMU Delphi — CDC ILINet Flu Surveillance',
    description:
      'Retrieve weekly CDC ILINet influenza-like illness (ILI) surveillance data by US region. ' +
      'Covers national ("nat"), HHS regions (hhs1-hhs10), Census regions (cen1-cen9), and individual states. ' +
      'Returns weighted ILI (wILI) rate, unweighted ILI rate, patient counts, provider counts, ' +
      'and age-group breakdown (0-4, 5-24, 25-49, 50-64, 65+) for each epiweek. ' +
      'Historical data from 1997 onward. No auth — CMU Delphi open epidemiological data, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'delphi.flusurv',
    mcpName: 'delphi.flu.flusurv',
    title: 'CMU Delphi — FluSurv-NET Hospitalization Rates',
    description:
      'Retrieve CDC FluSurv-NET influenza hospitalization surveillance rates. ' +
      'Covers the national network ("network_all"), EIP sites ("network_eip"), IHSP sites ("network_ihsp"), ' +
      'and individual state networks. Returns hospitalization rates per 100,000 population overall and by ' +
      'age group (0-4, 5-17, 18-49, 50-64, 65+), sex (male, female), and flu type (A/B). ' +
      'Essential for tracking influenza severity and hospitalizations by season. ' +
      'No auth — CDC/CMU Delphi open data, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'delphi.covidcast',
    mcpName: 'delphi.covid.covidcast',
    title: 'CMU Delphi — COVID-19 Signal Data (COVIDcast)',
    description:
      'Access COVID-19 epidemiological signals from multiple data sources via CMU Delphi COVIDcast. ' +
      'Sources include: "jhu-csse" (JHU confirmed cases/deaths), "hhs" (HHS hospitalization admissions), ' +
      '"fb-survey" (COVID symptom surveys), "doctor-visits" (CLI doctor visits), and more. ' +
      'Signals can be filtered by geographic level (nation, state, county, MSA, HHS region) and date range. ' +
      'Returns signal value, standard error, sample size, and reporting lag. ' +
      'No auth — CMU Delphi open COVID surveillance data, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'delphi.covid_hosp',
    mcpName: 'delphi.covid.hospitalization',
    title: 'CMU Delphi — COVID-19 Hospitalization State Timeseries',
    description:
      'Retrieve daily COVID-19 hospitalization data from HHS Protect via CMU Delphi for US states. ' +
      'Returns adult and pediatric ICU/hospital patient counts, new daily admissions, and bed utilization ' +
      'metrics per state per day. Data available from 2020-07-15 onward. Supports multi-state queries ' +
      'and date ranges in YYYYMMDD format. Useful for tracking pandemic hospital burden over time. ' +
      'No auth — HHS/CMU Delphi open public health data, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },

  // CMS Provider Data (4) — UC-561
  {
    toolId: 'cms.hospital_search',
    mcpName: 'cms.hospital.search',
    title: 'CMS — US Hospital Search',
    description:
      'Search 5 400+ US hospitals in the CMS Provider Data catalog with quality star ratings (1–5 stars). ' +
      'Filter by state, city, ZIP code, hospital name, hospital type (Acute Care, Critical Access, Childrens, ' +
      'Psychiatric, Rehabilitation), and minimum overall rating. Returns CMS Certification Number (CCN), ' +
      'facility name, address, phone, hospital type, ownership, emergency services flag, and overall star rating. ' +
      'Star ratings are composite scores from CMS Hospital Compare — 5 stars = top quality. ' +
      'Covers all Medicare/Medicaid-certified hospitals. ' +
      'No auth — US Centers for Medicare & Medicaid Services public domain, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cms.nursing_home_search',
    mcpName: 'cms.nursing_home.search',
    title: 'CMS — US Nursing Home Search',
    description:
      'Search 14 600+ Medicare/Medicaid-certified nursing homes and long-term care facilities in the US ' +
      'with CMS 5-star quality ratings. Filter by state, city, ZIP code, name, minimum overall rating, ' +
      'and ownership type (for-profit, non-profit, government). Returns CMS Certification Number (CCN), ' +
      'provider name, address, phone, ownership, certified bed count, and four separate quality ratings: ' +
      'overall (1–5 stars), health inspection, staffing, and quality measures. ' +
      'Star ratings help families compare nursing homes objectively for long-term care placement. ' +
      'No auth — US Centers for Medicare & Medicaid Services public domain, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cms.home_health_search',
    mcpName: 'cms.home_health.search',
    title: 'CMS — US Home Health Agency Search',
    description:
      'Search 12 300+ Medicare-certified home health agencies across the US providing skilled nursing, ' +
      "physical therapy, occupational therapy, and speech pathology services in patients' homes. " +
      'Filter by state, city, ZIP code, agency name, and whether nursing care is offered. ' +
      'Returns CMS Certification Number (CCN), agency name, address, phone, ownership type, ' +
      'services offered (nursing, PT, OT), and CMS quality-of-patient-care star rating. ' +
      'Essential for patients transitioning from hospital to home, post-surgical recovery, ' +
      'or managing chronic conditions without nursing home admission. ' +
      'No auth — US Centers for Medicare & Medicaid Services public domain, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cms.dialysis_search',
    mcpName: 'cms.dialysis.search',
    title: 'CMS — US Dialysis Facility Search',
    description:
      'Search 7 500+ Medicare-certified dialysis (ESRD — End-Stage Renal Disease) facilities across the US ' +
      'with CMS 5-star quality ratings. Filter by state, city, ZIP code, facility name, and non-profit status. ' +
      'Returns CMS Certification Number (CCN), facility name, address, phone, profit/non-profit status, ' +
      'chain ownership flag, and 5-star quality rating from CMS ESRD Quality Incentive Program (QIP). ' +
      'Dialysis is required 3× per week for ESRD patients — finding a conveniently located, ' +
      'high-quality facility is critical for quality of life. Covers all DaVita, Fresenius, US Renal Care, ' +
      'and independent clinic locations. ' +
      'No auth — US Centers for Medicare & Medicaid Services public domain, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },

  // CPSC SaferProducts.gov (4)
  {
    toolId: 'cpsc.search',
    mcpName: 'cpsc.safety.search',
    title: 'CPSC — US Product Recall Search',
    description:
      'Search US Consumer Product Safety Commission (CPSC) recall notices by product name, ' +
      'product category, manufacturer, date range, hazard type, and country of origin. ' +
      'Returns matching recalls with title, description, hazards, remedy options, ' +
      'manufacturer details, and official recall URL from cpsc.gov. ' +
      'Database contains all recalls since 1974 — over 6 000 active recall records. ' +
      'Use to check whether a specific product or brand has been recalled for safety defects, ' +
      'fire hazards, choking risks, or other consumer safety issues. ' +
      'No auth — US Consumer Product Safety Act public domain data, unlimited free.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cpsc.detail',
    mcpName: 'cpsc.safety.detail',
    title: 'CPSC — US Recall Full Details',
    description:
      'Retrieve complete details for a single CPSC recall notice by its numeric RecallID or ' +
      'recall number string (e.g. "26582"). Returns the full record including: product descriptions, ' +
      'model numbers, units affected, hazard descriptions and types, injury reports, ' +
      'all remedy instructions, remedy options (refund/repair/replace), ' +
      'manufacturer and retailer names, importer and distributor information, ' +
      'manufacturer country, product UPCs, and all recall images with captions. ' +
      'Use after cpsc.safety.search to get complete details on a specific recall record. ' +
      'No auth — US Consumer Product Safety Act public domain data, unlimited free.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cpsc.recent',
    mcpName: 'cpsc.safety.recent',
    title: 'CPSC — Recent US Product Recalls',
    description:
      'Get the most recent US CPSC consumer product recall notices issued within the last N days. ' +
      'Returns recalls ordered newest-first with title, affected products, hazards, ' +
      'remedy options, and manufacturer details. ' +
      'Optionally filter by CPSC product category (e.g. "Toys", "Furniture", "Power Tools"). ' +
      'Ideal for safety monitoring agents, compliance dashboards, and consumer protection workflows ' +
      'that need to track new recall announcements on a daily or weekly basis. ' +
      'No auth — US Consumer Product Safety Act public domain data, unlimited free.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cpsc.by_manufacturer',
    mcpName: 'cpsc.safety.by_manufacturer',
    title: 'CPSC — Recalls by Manufacturer',
    description:
      'Retrieve all CPSC consumer product recall notices for a specific manufacturer or brand name. ' +
      'Returns the full recall history for companies like Samsung, Polaris, Kidde, IKEA, or any ' +
      'manufacturer that has issued CPSC recalls. Supports optional date range filtering. ' +
      'Returns recall title, products, hazards, remedy options, and recall dates. ' +
      'Essential for supply chain due diligence, vendor safety audits, product liability research, ' +
      'and regulatory compliance checks on specific manufacturers or brands. ' +
      'No auth — US Consumer Product Safety Act public domain data, unlimited free.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // NRC Power Reactor Status (4)
  {
    toolId: 'nrc.current_status',
    mcpName: 'nrc.reactor.current_status',
    title: 'NRC — US Nuclear Reactor Current Status',
    description:
      'Get the latest daily power output for all ~95 US commercial nuclear reactor units as reported by the ' +
      "US Nuclear Regulatory Commission (NRC). Returns each reactor's current power level as a percentage " +
      'of licensed thermal power (0–100%), operational status (full_power / reduced_power / shutdown), ' +
      'and fleet-wide summary counts. Data is updated each business day M–F and reflects the previous ' +
      "day's reported capacity. Essential for US energy grid monitoring, nuclear generation capacity " +
      'dashboards, and power market analysis. ' +
      'No auth — US NRC public domain data (Atomic Energy Act), unlimited free.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nrc.reactor_history',
    mcpName: 'nrc.reactor.history',
    title: 'NRC — Nuclear Reactor Power History',
    description:
      'Retrieve up to 365 days of daily power output history for a specific US nuclear reactor unit. ' +
      'Provide the full NRC unit name (e.g. "Diablo Canyon 1", "Watts Bar 2") and the number of days ' +
      'to look back. Returns a chronological series of power percentages and status labels, ' +
      'enabling trend analysis, outage detection, maintenance window identification, and capacity ' +
      'factor calculation for individual reactors. Covers all units in the NRC 365-day rolling file. ' +
      'No auth — US NRC public domain data (Atomic Energy Act), unlimited free.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nrc.outages',
    mcpName: 'nrc.reactor.outages',
    title: 'NRC — Nuclear Reactor Outages & Reduced Power',
    description:
      'Identify US nuclear reactors currently operating below a specified power threshold. ' +
      'By default returns all reactors not at full power (below 100%). Set max_power=0 to see only ' +
      'fully-shutdown reactors, or max_power=50 to find reactors at half-power or less. ' +
      'Results include power percentage and status (reduced_power or shutdown) sorted lowest-power first. ' +
      'Useful for energy grid impact assessment, nuclear capacity risk monitoring, and real-time ' +
      'tracking of planned and unplanned reactor outages across the US fleet. ' +
      'No auth — US NRC public domain data (Atomic Energy Act), unlimited free.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nrc.annual_data',
    mcpName: 'nrc.reactor.annual_data',
    title: 'NRC — Nuclear Reactor Annual Historical Status',
    description:
      'Retrieve full-year historical power status data for US nuclear reactors from NRC annual archives. ' +
      'Data is available from 1999 through the current year. Optionally filter by reactor unit name ' +
      "to retrieve a single reactor's complete year record. Each record contains the date, unit name, " +
      'and power percentage (0–100%). Supports capacity factor analysis, long-term outage pattern ' +
      'research, nuclear energy generation modeling, and historical grid impact studies. ' +
      'Returns up to 1000 rows per call (full annual files contain 17K–35K rows). ' +
      'No auth — US NRC public domain data (Atomic Energy Act), unlimited free.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // BTS Transport (4)
  {
    toolId: 'bts.border_crossings',
    mcpName: 'bts.borders.crossings',
    title: 'BTS — US Border Crossing Entry Data',
    description:
      'Query monthly US border crossing statistics from the Bureau of Transportation Statistics. ' +
      'Filter by border (US-Canada or US-Mexico), crossing type (Trucks, Personal Vehicles, Pedestrians, Buses, Trains, etc.), ' +
      'port name, and date range. Data covers all official land ports of entry updated monthly. ' +
      'Source: BTS Border Crossing Entry Data (Socrata keg4-3bc2). No auth — US Gov public domain.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bts.tsi',
    mcpName: 'bts.transport.tsi',
    title: 'BTS — Transportation Services Index',
    description:
      'Retrieve the BTS Transportation Services Index (TSI), a monthly economic indicator measuring ' +
      'the volume of freight and passenger transportation services across all modes. Returns total TSI, ' +
      'freight TSI, passenger TSI, plus component indices (vehicle miles traveled, rail carloads, transit, ' +
      'petroleum/gas pipelines). Base year 2000=100. Data from 2000 to present. ' +
      'Source: BTS TSI dataset (Socrata bw6n-ddqk). No auth — US Gov public domain.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bts.freight_indicators',
    mcpName: 'bts.freight.indicators',
    title: 'BTS — Supply Chain & Freight Indicators',
    description:
      'Access weekly and monthly supply chain performance indicators from BTS, including containerized ' +
      'import/export volumes at US ports, railroad terminal dwell times, truck speeds at bottleneck locations, ' +
      'freight rates (Shanghai–LA), vessel waiting times, carrier employment, and the Freight Transportation ' +
      'Services Index. Filter by indicator name (partial match), year, or date range. ' +
      'Source: BTS Supply Chain and Freight Indicators (Socrata y5ut-ibwt). No auth — US Gov public domain.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bts.aviation_traffic',
    mcpName: 'bts.aviation.traffic',
    title: 'BTS — US Aviation Traffic by Airport (T100)',
    description:
      'Query T100 airline segment statistics from BTS giving passenger counts, departures, seats, ' +
      'load factor, and payload by US airport. Filter by IATA airport code (e.g. ATL, JFK, LAX, ORD) ' +
      'and year/period (annual "2025" or quarterly "2026M1-3"). Data covers all US commercial service ' +
      'airports through the most recent quarter. ' +
      'Source: BTS T100 Segment Summary By Origin Airport (Socrata r495-tyji). No auth — US Gov public domain.',
    category: 'world',
    annotations: READ_ONLY,
  },
  // CDC Chronic Disease Indicators (UC-565) — 4 tools
  {
    toolId: 'cdc_chronic.indicators',
    mcpName: 'cdc_chronic.disease.indicators',
    title: 'CDC — Chronic Disease Indicators Query',
    description:
      'Query the CDC U.S. Chronic Disease Indicators (CDI) dataset covering 19 chronic disease topics ' +
      '(diabetes, cardiovascular, cancer, asthma, tobacco, alcohol, arthritis, COPD, mental health, etc.) ' +
      'across all 50 US states + DC and national level. Filter by topic ID (e.g. DIA, CVD, TOB), specific ' +
      'question ID, state abbreviation (e.g. CA, TX, US for national), year range, and demographic stratification ' +
      '(Overall, Female, Male, age groups, race/ethnicity). Returns prevalence rates, confidence intervals, ' +
      'data source, and stratification. 398K records, data through 2023. ' +
      'Source: CDC CDI Socrata dataset hksd-2xuw. No auth — US Gov public domain.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cdc_chronic.topics',
    mcpName: 'cdc_chronic.disease.topics',
    title: 'CDC — Chronic Disease Topics & Questions',
    description:
      'List all available chronic disease topics and their associated indicator questions in the CDC CDI dataset. ' +
      'Returns topic IDs (e.g. DIA=Diabetes, CVD=Cardiovascular, TOB=Tobacco) and question IDs ' +
      '(e.g. DIA01=Diabetes prevalence, TOB04=Cigarette smoking, CVD01=High blood pressure) needed for ' +
      'other cdc_chronic tools. Optionally filter to a single topic. 19 topics, 100+ indicator questions. ' +
      'Source: CDC CDI Socrata dataset hksd-2xuw. No auth — US Gov public domain.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cdc_chronic.state_compare',
    mcpName: 'cdc_chronic.disease.state_compare',
    title: 'CDC — Chronic Disease State-by-State Comparison',
    description:
      'Compare a chronic disease indicator across all US states for a given year. Returns the value for each ' +
      'state (prevalence %, rate, or count) plus the 5 highest and 5 lowest states for quick ranking. ' +
      'Requires a question_id (e.g. "DIA01" for diabetes prevalence, "TOB04" for smoking, "CVD01" for high ' +
      'blood pressure). Optional year (default most recent 2023) and demographic stratification. ' +
      'Useful for geographic health disparity analysis and policy research. ' +
      'Source: CDC CDI Socrata dataset hksd-2xuw. No auth — US Gov public domain.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cdc_chronic.trend',
    mcpName: 'cdc_chronic.disease.trend',
    title: 'CDC — Chronic Disease Trend Over Years',
    description:
      'Retrieve multi-year trend data for a specific chronic disease indicator at the national or state level. ' +
      'Returns annual values with confidence intervals so you can track how a metric changes over time ' +
      '(e.g. declining smoking rates, rising obesity, improving diabetes control). Filter by question ID, ' +
      'location (state abbreviation or "US" for national), demographic subgroup, and value type ' +
      '(crude prevalence, age-adjusted prevalence, rate per 100K, number). Data from ~2010 to 2023. ' +
      'Source: CDC CDI Socrata dataset hksd-2xuw. No auth — US Gov public domain.',
    category: 'health',
    annotations: READ_ONLY,
  },

  // OpenSky Network ADS-B (UC-566) — 4 tools
  {
    toolId: 'opensky.states_bbox',
    mcpName: 'opensky.traffic.states_bbox',
    title: 'OpenSky — Live Aircraft in Bounding Box',
    description:
      'Retrieve real-time ADS-B state vectors for all aircraft currently within a geographic bounding box. ' +
      'Returns ICAO24 transponder address, callsign, origin country, position (lat/lon), barometric altitude, ' +
      'velocity, heading, vertical rate, squawk code, and position source (ADS-B/MLAT/FLARM). ' +
      'Data is updated every ~10 seconds from the OpenSky community network of ~5,000 ADS-B receivers. ' +
      'Specify lamin/lomin/lamax/lomax in decimal degrees. Limit per call: 1,000 aircraft (use smaller bbox for dense airspace). ' +
      'Source: OpenSky Network — opensky-network.org. No auth, open access.',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'opensky.aircraft_state',
    mcpName: 'opensky.traffic.aircraft_state',
    title: 'OpenSky — Current State for Specific Aircraft',
    description:
      'Get the current real-time ADS-B state vector for a single aircraft identified by its ICAO 24-bit hex address (e.g. 3c6444). ' +
      'Returns position, altitude, speed, heading, vertical rate, squawk, origin country, and whether on ground. ' +
      'If the aircraft is not currently tracked (landed, out of range, or transponder off) the response includes found=false. ' +
      'ICAO24 addresses can be looked up from aircraft registrations (e.g. N-number, D- prefix). ' +
      'Useful for tracking a specific flight in real time. ' +
      'Source: OpenSky Network — opensky-network.org. No auth, open access.',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'opensky.states_country',
    mcpName: 'opensky.traffic.states_country',
    title: 'OpenSky — Live Aircraft by Origin Country',
    description:
      'Get real-time ADS-B state vectors for all aircraft currently registered to a specific origin country (e.g. Germany, United States). ' +
      "Filters the global ADS-B feed by the aircraft's registered country of origin from ICAO24 address blocks. " +
      'Optionally narrow the geographic area using a bounding box (lamin/lomin/lamax/lomax). ' +
      'Returns ICAO24, callsign, position, altitude, velocity, and heading for each matching aircraft. ' +
      'Useful for counting or mapping the live air traffic of a specific country. ' +
      'Source: OpenSky Network — opensky-network.org. No auth, open access.',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'opensky.aircraft_track',

    mcpName: 'opensky.traffic.aircraft_track',
    title: 'OpenSky — Flight Track / Trajectory for Aircraft',
    description:
      'Retrieve the flight trajectory (sequence of GPS waypoints) for a specific aircraft identified by its ICAO24 hex address. ' +
      'Each waypoint contains Unix timestamp, latitude, longitude, barometric altitude (meters), true track angle, and on-ground flag. ' +
      'Use time=0 or omit for the current active flight track. Requires the aircraft to be actively tracked by the OpenSky network. ' +
      'Useful for reconstructing a flight path, computing distance flown, or detecting airport arrivals and departures. ' +
      'Source: OpenSky Network — opensky-network.org. No auth, open access.',
    category: 'travel',
    annotations: READ_ONLY,
  },

  // NOAA CO-OPS Tides & Currents (UC-567) — 4 tools
  {
    toolId: 'coops.predictions',
    mcpName: 'coops.tides.predictions',
    title: 'NOAA CO-OPS — Tide High/Low Predictions',
    description:
      'Get predicted high and low tide times and heights for any NOAA CO-OPS tide gauge station in the US, Puerto Rico, Pacific Islands, and Great Lakes. ' +
      'Returns a chronological list of high (H) and low (L) tides with UTC timestamps and water heights. ' +
      'Specify a station_id (e.g. 8443970 for Boston, 9414290 for San Francisco, 8518750 for New York) and optional date range (default: next 7 days). ' +
      'Datum defaults to MLLW (Mean Lower Low Water) — the reference datum used on NOAA nautical charts. ' +
      'Data is generated from harmonic tide predictions. Useful for sailing, fishing, coastal engineering, and flood planning. ' +
      'Source: NOAA Center for Operational Oceanographic Products and Services (CO-OPS) — tidesandcurrents.noaa.gov. No auth, US Gov public domain.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'coops.water_level',
    mcpName: 'coops.tides.water_level',
    title: 'NOAA CO-OPS — Observed Water Level',
    description:
      'Get verified observed water level readings (at 6-minute intervals) from a NOAA CO-OPS tide gauge station. ' +
      'Returns time-series data with UTC timestamps, water height in feet or meters relative to the chosen datum, and data quality flags. ' +
      'Specify station_id and optional date range (default: last 24 hours, max range 31 days). ' +
      'Datum defaults to MLLW. Observed data may lag real-time by up to 6 minutes; use coops.tides.predictions for future forecasts. ' +
      'Useful for flood monitoring, storm surge analysis, historical tide research, and comparing observed vs. predicted tides. ' +
      'Source: NOAA CO-OPS — tidesandcurrents.noaa.gov. No auth, US Gov public domain.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'coops.stations',
    mcpName: 'coops.tides.stations',
    title: 'NOAA CO-OPS — List Tide Gauge Stations',
    description:
      'List active NOAA CO-OPS tide gauge stations with their IDs, names, coordinates, and metadata. ' +
      'Over 300 stations covering US coastal states, Puerto Rico, Pacific Islands, and the Great Lakes. ' +
      'Filter by state abbreviation (e.g. CA, FL, NY) to find local stations. ' +
      'Returns station_id, name, latitude, longitude, state, timezone, tidal flag, and forecast availability. ' +
      'Use the returned station_id values with coops.tides.predictions, coops.tides.water_level, and coops.tides.conditions. ' +
      'Source: NOAA CO-OPS — tidesandcurrents.noaa.gov. No auth, US Gov public domain.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'coops.conditions',
    mcpName: 'coops.tides.conditions',
    title: 'NOAA CO-OPS — Marine Meteorological Conditions',
    description:
      'Get observed meteorological data from a NOAA CO-OPS station. Supports five products: ' +
      'air_temperature (°F or °C), water_temperature (sea surface °F or °C), air_pressure (millibars), ' +
      'humidity (relative humidity %), and wind (speed and direction — available at select stations). ' +
      'Returns 6-minute interval readings for the specified date range (default: last 24 hours) plus the most recent reading for quick lookups. ' +
      'Note: not all stations have all sensors — if a product is unavailable at the requested station, the API returns an error. ' +
      'Try station 8443970 (Boston) for air_temperature, 9414290 (San Francisco) for water_temperature. ' +
      'Source: NOAA CO-OPS — tidesandcurrents.noaa.gov. No auth, US Gov public domain.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  // Transport for London — TfL Open Data (4)
  {
    toolId: 'tfl.line_status',
    mcpName: 'tfl.transit.line_status',
    title: 'TfL — Real-Time London Line Status',
    description:
      'Get real-time service status for all Transport for London (TfL) lines including Tube, Overground, Elizabeth line, DLR, bus, tram, and cable car. ' +
      'Returns the current operational status (Good Service, Minor Delays, Severe Delays, Part Suspended, etc.) and the reason for any disruption. ' +
      'Filter by specific modes (tube, overground, elizabeth-line, dlr, bus, tram, cable-car, river-bus) and choose to show only disrupted lines. ' +
      'Returns total line count, how many are disrupted, and per-line status with severity score (0=closed, 10=good). ' +
      'Useful for journey planning, commuter alerts, and real-time London transport monitoring. ' +
      'Source: TfL Unified API — api.tfl.gov.uk. No auth required, TfL Open Data CC-BY.',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tfl.arrivals',
    mcpName: 'tfl.transit.arrivals',
    title: 'TfL — Live Arrivals at London Stop',
    description:
      'Get live arrival predictions for a specific TfL line at a London stop or station. ' +
      'Returns upcoming trains sorted by soonest arrival, with destination, platform, direction, and minutes until arrival. ' +
      'Requires a line_id (e.g. central, bakerloo, jubilee, victoria, elizabeth, dlr, overground) and a NAPTAN stop_id ' +
      '(e.g. 940GZZLUHPK for Holland Park, 940GZZLUKSX for Kings Cross). ' +
      'Arrival predictions update every 30 seconds from the TfL real-time feed. ' +
      'Use direction=inbound/outbound to filter by travel direction. ' +
      'Source: TfL Unified API — api.tfl.gov.uk. No auth required, TfL Open Data CC-BY.',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tfl.journey_plan',
    mcpName: 'tfl.transit.journey_plan',
    title: 'TfL — London Journey Planner',
    description:
      'Plan a multi-modal journey between any two London locations using the TfL journey planner. ' +
      'Accepts free-text addresses, NAPTAN stop IDs, ICS station codes, or lat/lon coordinates as origin and destination. ' +
      'Returns up to 3 journey options with legs, modes (tube, bus, walking, overground, etc.), departure/arrival times, and turn-by-turn summaries. ' +
      'Optionally specify preferred modes (e.g. tube,bus), date (YYYYMMDD), and time (HHMM) for departing or arriving at a specific time. ' +
      'Covers all TfL services: Tube, Overground, Elizabeth line, DLR, bus, tram, river bus, and walking. ' +
      'Source: TfL Unified API — api.tfl.gov.uk. No auth required, TfL Open Data CC-BY.',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'tfl.bike_points',
    mcpName: 'tfl.transit.bike_points',
    title: 'TfL — Santander Cycles Bike Point Availability',
    description:
      'Get real-time availability of Santander Cycles (formerly Boris Bikes) at all 800+ docking stations across London. ' +
      'Returns for each station: name, coordinates, number of available bikes (standard + e-bikes), empty docks, and total dock capacity. ' +
      'Optionally filter by station name keyword (e.g. Waterloo, Hyde Park, Soho, Paddington). ' +
      'Availability updates approximately every 2 minutes from the TfL live feed. ' +
      'Useful for cycle hire planning, last-mile commuting, and real-time docking station capacity monitoring. ' +
      'Source: TfL Unified API — api.tfl.gov.uk. No auth required, TfL Open Data CC-BY.',
    category: 'travel',
    annotations: READ_ONLY,
  },

  // National Bridge Inventory — FHWA/USDOT (4) — UC-569
  {
    toolId: 'nbi.search',
    mcpName: 'nbi.infrastructure.search',
    title: 'NBI — Search US Bridges by State and Condition',
    description:
      'Search the National Bridge Inventory (NBI) for highway bridges in a US state, with optional filter by overall condition ' +
      '(Good / Fair / Poor). Returns up to 200 bridges per call, sorted by lowest sufficiency rating first. ' +
      'Each result includes: structure number, location, feature below (river/road), facility carried, coordinates, ' +
      'year built/reconstructed, overall bridge condition, deck/superstructure/substructure ratings (0–9 scale), ' +
      'operating load rating (tons), max span length (m), deck width (m), average daily traffic, open/posted/closed status, ' +
      'sufficiency rating, and scour-critical classification. ' +
      'Covers 621,000+ bridges on public roads across all 50 states plus territories. ' +
      'Data: FHWA NBI as of June 2023, updated annually. No auth required — USDOT public domain.',
    category: 'infrastructure',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nbi.bridge_detail',
    mcpName: 'nbi.infrastructure.bridge_detail',
    title: 'NBI — Detailed Bridge Record by Structure Number',
    description:
      'Retrieve the full NBI record for a specific US highway bridge identified by state FIPS code and NBI structure number. ' +
      'Returns all inspection and inventory fields: condition ratings (deck, superstructure, substructure, channel, culvert), ' +
      'load ratings (operating and inventory, in tons), structural evaluation, waterway adequacy, posting/closure status, ' +
      'scour-critical rating, deck area (m²), approach details, owner and maintenance agency, functional classification, ' +
      'design load, deck structure/surface/membrane type, improvement costs, inspection frequency and date, ' +
      'fracture-critical designation, federal lands flag, and skew angle. ' +
      'Use nbi.search or nbi.nearby to discover structure numbers before calling this tool. ' +
      'Data: FHWA NBI as of June 2023. No auth required — USDOT public domain.',
    category: 'infrastructure',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nbi.nearby',
    mcpName: 'nbi.infrastructure.nearby',
    title: 'NBI — Find Bridges Near a Location',
    description:
      'Find US highway bridges within a specified radius (up to 50 miles) of a latitude/longitude coordinate. ' +
      'Results are sorted by lowest sufficiency rating ascending (most at-risk bridges first). ' +
      'Returns the same core fields as nbi.search: structure number, location, feature below, coordinates, ' +
      'condition (Good/Fair/Poor), deck/superstructure/substructure ratings, operating load rating, ' +
      'max span length, deck width, average daily traffic, open/posted/closed status, and scour classification. ' +
      'Useful for infrastructure planning, site assessments, disaster response routing, and proximity analysis. ' +
      'Covers all 621,000+ US highway bridges. No auth required — USDOT/FHWA public domain data.',
    category: 'infrastructure',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nbi.condition_stats',
    mcpName: 'nbi.infrastructure.condition_stats',
    title: 'NBI — Bridge Condition Statistics for a State',
    description:
      'Get aggregated bridge condition statistics for all highway bridges in a given US state. ' +
      'Returns counts and percentages for each condition category: Good, Fair, Poor, and Unknown/Not-applicable. ' +
      'This summary matches the metrics used in the FHWA annual Bridge Conditions report and Congressional infrastructure reporting. ' +
      'A bridge is classified as Structurally Deficient if rated Poor. As of June 2023, ~7% of US bridges (43,000+) are in Poor condition. ' +
      'Useful for state-level infrastructure health dashboards, policy analysis, and funding prioritization. ' +
      'Data: FHWA NBI June 2023. No auth required — USDOT public domain.',
    category: 'infrastructure',
    annotations: READ_ONLY,
  },

  // Bright Sky DWD (4)
  {
    toolId: 'brightsky.current',
    mcpName: 'brightsky.weather.current',
    title: 'Bright Sky — Current Weather in Germany',
    description:
      'Get current weather conditions for any location in Germany from the nearest DWD (Deutscher Wetterdienst) station. ' +
      'Returns: temperature (°C), humidity, dew point, pressure (hPa), cloud cover, visibility, wind speed/direction, ' +
      'wind gusts, precipitation in the last 10/30/60 minutes, sunshine duration, solar radiation, and weather condition ' +
      '(dry, fog, rain, sleet, snow, hail, thunderstorm). ' +
      'Source: official German Weather Service real-time observations. Coverage: Germany only. ' +
      'No API key required — open DWD data via Bright Sky (MIT licence).',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'brightsky.observations',
    mcpName: 'brightsky.weather.observations',
    title: 'Bright Sky — Hourly Weather Observations / Forecast for Germany',
    description:
      'Get hourly weather observations or forecast for any location in Germany from DWD (Deutscher Wetterdienst). ' +
      'Pass a past date to retrieve historical observations; pass a future date to retrieve the DWD numerical forecast. ' +
      'Each hour includes: temperature, dew point, humidity, pressure, cloud cover, visibility, precipitation, ' +
      'sunshine, wind speed/direction, wind gusts, precipitation probability, solar irradiance, and condition icon. ' +
      'Returns up to 10 days of data (240 hourly records). ' +
      'No API key required — open DWD data via Bright Sky (MIT licence).',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'brightsky.alerts',
    mcpName: 'brightsky.weather.alerts',
    title: 'Bright Sky — DWD Severe Weather Alerts for Germany',
    description:
      'Get active DWD (Deutscher Wetterdienst) severe weather alerts and warnings for any location in Germany. ' +
      'Identifies the warn cell (administrative district) for the given coordinates and returns all current alerts ' +
      'with: event type (e.g. thunderstorm, heavy rain, frost, storm), severity (Minor/Moderate/Severe/Extreme), ' +
      'urgency, certainty, onset/expiry times, headline, description, and recommended action in English. ' +
      'Returns an empty list when no warnings are active. ' +
      'No API key required — open DWD data via Bright Sky (MIT licence).',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'brightsky.stations',
    mcpName: 'brightsky.stations.nearby',
    title: 'Bright Sky — Find Nearby DWD Weather Stations',
    description:
      'Find DWD (Deutscher Wetterdienst) weather stations near a given latitude/longitude in Germany. ' +
      "Returns each station's DWD station ID, WMO station ID, name, coordinates, elevation, observation type " +
      '(current / recent / historical / forecast), date range of available records, and distance from the query point. ' +
      'Useful for discovering which stations cover a location before querying observations or synop data. ' +
      'No distance filter by default — returns all matching sources sorted by proximity. ' +
      'No API key required — open DWD data via Bright Sky (MIT licence).',
    category: 'weather',
    annotations: READ_ONLY,
  },
  // Statistics Finland PxWeb (4)
  {
    toolId: 'statfin.consumer_price_index',
    mcpName: 'statfin.economy.consumer_price_index',
    title: 'Statistics Finland — Consumer Price Index (CPI)',
    description:
      'Get Finland Consumer Price Index (CPI) monthly data from Statistics Finland (Stat.fi). ' +
      'Returns index point values for the chosen base year (default 2015=100) for the last N months. ' +
      'Available base years: 1972, 1977, 1981, 1985, 1990, 1995, 2000, 2005, 2010, 2015, 2025. ' +
      'Monthly time series back to 1972. Data updated monthly by Statistics Finland. ' +
      'No API key required — official Finnish government open data (CC BY 4.0).',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'statfin.population',
    mcpName: 'statfin.demographics.population',
    title: 'Statistics Finland — Population of Finland',
    description:
      'Get the historical and current population of Finland on 31 December each year. ' +
      'Returns annual population figures (total, male, or female) for up to 276 years back to 1750. ' +
      'Includes the latest official figure, e.g. 5,652,881 persons at end of 2025. ' +
      'Data from Statistics Finland population register — authoritative national headcount. ' +
      'No API key required — official Finnish government open data (CC BY 4.0).',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'statfin.unemployment',
    mcpName: 'statfin.economy.unemployment',
    title: 'Statistics Finland — Unemployed Jobseekers in Finland',
    description:
      'Get the number of unemployed jobseekers registered at Finnish Employment and Economic Development Offices ' +
      '(TE-services) at the end of each month for the whole country. ' +
      'Returns monthly figures from 2008 onwards. Latest data: ~325,000–360,000 persons. ' +
      'Source: Ministry of Economic Affairs and Employment (TEM) via Statistics Finland PxWeb. ' +
      'No API key required — official Finnish government open data (CC BY 4.0).',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'statfin.table_search',
    mcpName: 'statfin.statistics.table_search',
    title: 'Statistics Finland — List Statistical Tables',
    description:
      'List all available data tables in a Statistics Finland (StatFin) category. ' +
      'Use this to discover what datasets are published in a given statistical domain. ' +
      'Returns table IDs, titles, and last-updated timestamps. ' +
      'Category examples: "khi" (consumer prices), "vaerak" (population), "tyonv" (unemployment), ' +
      '"synt" (births), "kans" (citizenships), "kbar" (consumer confidence), "rki" (building cost index), ' +
      '"ilma" (air transport), "matk" (accommodation statistics). ' +
      'The table IDs returned can be queried via the Statistics Finland PxWeb API at ' +
      'https://pxdata.stat.fi/PxWeb/api/v1/en/StatFin/{category}/{table_id}. ' +
      'No API key required — official Finnish government open data (CC BY 4.0).',
    category: 'world',
    annotations: READ_ONLY,
  },

  // DBnomics (UC-572) — 4 tools
  {
    toolId: 'dbnomics.providers',
    mcpName: 'dbnomics.data.providers',
    title: 'DBnomics — List Statistical Data Providers',
    description:
      'List all statistical data providers available on DBnomics — the unified gateway to 93+ national and international agencies. ' +
      'Includes IMF, World Bank (WB), OECD, Eurostat, ECB, BIS, UN, ILO, CEPII, and many more. ' +
      'Returns provider codes, full names, and regions. ' +
      'Use the returned provider codes with dbnomics.data.datasets to explore available datasets. ' +
      'DBnomics aggregates over 46,000 datasets and 1.7 billion time series from official statistical sources. ' +
      'No API key required — open data under CC-BY 4.0.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'dbnomics.datasets',
    mcpName: 'dbnomics.data.datasets',
    title: 'DBnomics — List Datasets for a Provider',
    description:
      'List all datasets published by a specific statistical agency on DBnomics. ' +
      'For example: provider WB has WDI (World Development Indicators, 396K+ series); ' +
      'provider OECD has QNA (quarterly national accounts), KEI, MEI, and 200+ more; ' +
      'provider IMF has WEO, BOP, IFS; Eurostat has 1,000+ datasets. ' +
      'Returns dataset codes, names, and series counts. ' +
      'Use the returned dataset codes with dbnomics.data.series to browse available time series. ' +
      'First call dbnomics.data.providers to get valid provider codes. ' +
      'No API key required — open data under CC-BY 4.0.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'dbnomics.series',
    mcpName: 'dbnomics.data.series',
    title: 'DBnomics — Browse Series in a Dataset',
    description:
      'List all time series available in a specific dataset on DBnomics, with pagination. ' +
      'Each series has a unique code, human-readable name, frequency, and dimension labels. ' +
      'Examples: WB/WDI contains NY.GDP.MKTP.CD (nominal GDP) for 200+ countries; ' +
      'OECD/QNA contains quarterly GDP growth for OECD members; ' +
      'EUROSTAT/nama_10_gdp contains GDP component breakdowns by EU country. ' +
      'Use the returned series codes with dbnomics.data.fetch_series to retrieve actual data. ' +
      'Supports pagination via limit (max 200) and offset. ' +
      'No API key required — open data under CC-BY 4.0.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'dbnomics.fetch_series',
    mcpName: 'dbnomics.data.fetch_series',
    title: 'DBnomics — Fetch Time-Series Data',
    description:
      'Fetch the full time-series history for a specific series from DBnomics. ' +
      'Returns an array of {period, value} observations covering up to decades of data. ' +
      'Periods are formatted as YYYY for annual, YYYY-QN for quarterly, YYYY-MM for monthly. ' +
      'Example: provider=WB, dataset=WDI, series=A-US.NY.GDP.MKTP.CD → US nominal GDP in current USD annually. ' +
      'Example: provider=OECD, dataset=QNA, series=USA.B1GQ.LNBARSA.Q → US real GDP quarterly. ' +
      'Use last_n_periods to limit output to the most recent N observations. ' +
      'Covers data from IMF, World Bank, OECD, Eurostat, ECB, BIS, ILO, and 85+ other agencies. ' +
      'No API key required — open data under CC-BY 4.0.',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // SMHI Open Data — Sweden Weather (4)
  {
    toolId: 'smhi.forecast',
    mcpName: 'smhi.weather.forecast',
    title: 'SMHI — Point Weather Forecast',
    description:
      'Get an 82-step hourly weather forecast (~10 days) for any point in Europe from the Swedish Meteorological and Hydrological Institute (SMHI). ' +
      "Uses SMHI's high-resolution NWP model (snow1g) covering most of Europe at ~2.5 km grid spacing. " +
      'Each hourly step includes 25 parameters: air temperature (°C), wind speed (m/s), wind direction (°), ' +
      'wind gust (m/s), relative humidity (%), sea-level pressure (hPa), visibility (km), ' +
      'thunderstorm probability (%), cloud cover (%), precipitation amount (mm/h, with min/max/median), ' +
      'precipitation probability (%), frozen precipitation probability (%), symbol_code (WMO weather symbol 1–27). ' +
      'Swedish weather symbol codes: 1=clear sky, 2=nearly clear, 3=variable cloudiness, 4=half-cloudy, ' +
      '5=cloudy, 6=overcast, 7=fog, 8=light rain, 9=moderate rain, 10=heavy rain, ' +
      '11=thunderstorm, 12=light sleet, 13=moderate sleet, 14=heavy sleet, ' +
      '15=light snow, 16=moderate snow, 17=heavy snow. ' +
      'No API key required — SMHI open data, Creative Commons BY 4.0.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'smhi.fire_risk',
    mcpName: 'smhi.weather.fire_risk',
    title: 'SMHI — Fire Weather Index Forecast',
    description:
      'Get the 7-day daily fire weather risk forecast for a location in Sweden from SMHI. ' +
      'Provides the Canadian Forest Fire Weather Index (FWI) system adapted for Swedish conditions. ' +
      'Returns per-day values for: fwiindex (composite fire danger 1–6 scale), ' +
      'grassfire (grass fire risk 1–6), forestdry (forest drought index), ' +
      'fwi (Fire Weather Index), isi (Initial Spread Index), bui (Build-Up Index), ' +
      'ffmc (Fine Fuel Moisture Code), dmc (Duff Moisture Code), dc (Drought Code), ' +
      'plus weather inputs: t (temperature °C), ws (wind speed m/s), wd (wind direction °), ' +
      'r (relative humidity %), and accumulated precipitation over 1/2/3/5/7/10/14/20/30/40/50/60 days. ' +
      'fwiindex scale: 1=Very low, 2=Low, 3=Moderate, 4=High, 5=Very high, 6=Extreme. ' +
      'Covers Sweden only (lat 55–70°N, lon 10–30°E). ' +
      'No API key required — SMHI open data, Creative Commons BY 4.0.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'smhi.warnings',
    mcpName: 'smhi.weather.warnings',
    title: 'SMHI — Active Weather Warnings for Sweden',
    description:
      'Get all currently active official weather warnings issued by SMHI for Sweden. ' +
      'Returns event type, warning level, affected areas, and time windows in English. ' +
      'Warning levels: MESSAGE (advisory), YELLOW (moderate risk), ORANGE (significant risk), RED (extreme risk). ' +
      'Event types include: WIND (storm), PRECIPITATION (heavy rain/snow), THUNDERSTORM, ' +
      'SNOWFALL, SLEET, FIRE (wildfire risk), FROST, FOG, HIGH_TEMPERATURE, ' +
      'LOW_SEA_LEVEL, HIGH_SEA_LEVEL, WATER_SHORTAGE, WIND_SEA, AVALANCHE. ' +
      'Each warning specifies the Swedish counties (Länen) and municipalities affected. ' +
      'SMHI is the official Swedish meteorological authority — these are the same warnings issued to ' +
      'emergency services and broadcast to the Swedish public. ' +
      'No API key required — SMHI open data, Creative Commons BY 4.0.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'smhi.observations',
    mcpName: 'smhi.weather.observations',
    title: 'SMHI — Weather Station Observations',
    description:
      'Get weather observations from a specific SMHI monitoring station in Sweden — ' +
      'current readings or time-series history (up to several months). ' +
      'SMHI operates 1000+ stations from southern Malmö to Abisko in the Arctic Circle. ' +
      'Stations measure different parameters: major airports (Stockholm-Arlanda, Göteborg-Landvetter) ' +
      'typically have temperature, wind, humidity, pressure, and visibility; ' +
      'automated rural stations may have just temperature and precipitation. ' +
      'Returns timestamp, numeric value, unit, and quality flag (G=approved, Y=provisional). ' +
      'Common station IDs: "97400" = Stockholm-Arlanda, "98230" = Stockholm-Observatoriekullen, ' +
      '"72630" = Göteborg, "61740" = Malmö, "188800" = Abisko (Lapland). ' +
      'Common parameter IDs: "1" = temperature (°C), "4" = wind speed (m/s), ' +
      '"6" = humidity (%), "9" = pressure (hPa), "39" = dew-point (°C). ' +
      'No API key required — SMHI open data, Creative Commons BY 4.0.',
    category: 'weather',
    annotations: READ_ONLY,
  },

  // Digital Public Library of America (4)
  {
    toolId: 'dpla.items.search',
    mcpName: 'dpla.archives.search',
    title: 'DPLA — Search Digitized Items',
    description:
      'Search 50M+ digitized items from US libraries, archives, and museums via the Digital Public Library of America. ' +
      'Filter by media type (image, text, sound, moving image), date range, US state, or contributing institution. ' +
      'Results include title, creator, date, type, subject tags, rights, and direct links to the original item and thumbnail. ' +
      'Sources include the Smithsonian, Library of Congress, NYPL, state digitization programs, and 2,000+ contributing institutions. ' +
      'Returns facets for top subjects, providers, and types within the result set.',
    category: 'media',
    annotations: READ_ONLY,
  },
  {
    toolId: 'dpla.items.detail',
    mcpName: 'dpla.archives.detail',
    title: 'DPLA — Fetch Item by ID',
    description:
      'Fetch the full metadata record for a specific DPLA item by its 32-character hex identifier. ' +
      'Returns complete fields: title, creator, date, type, format, subject tags, language, rights category, ' +
      'contributing institution, original item URL, and thumbnail URL. ' +
      'Use after a search call to retrieve complete details for a specific digitized object.',
    category: 'media',
    annotations: READ_ONLY,
  },
  {
    toolId: 'dpla.items.by_subject',
    mcpName: 'dpla.archives.by_subject',
    title: 'DPLA — Browse Items by Subject',
    description:
      'Browse digitized items from US archives by subject or topic keyword using DPLA subject vocabulary. ' +
      'Subjects include broad categories (Women, Architecture, Photography) and historical topics ' +
      '(Civil War, Native Americans, Abolitionists). Optionally filter by media type. ' +
      'Returns paginated list of matching items with title, creator, date, type, thumbnail, and direct URL.',
    category: 'media',
    annotations: READ_ONLY,
  },
  {
    toolId: 'dpla.items.facets',
    mcpName: 'dpla.archives.facets',
    title: 'DPLA — Get Top Facets',
    description:
      'Get top facet counts (subjects, providers/institutions, media types, US states) across the entire DPLA ' +
      'collection or scoped to a search query. Useful for discovering what subject areas, contributing libraries, ' +
      'or media types dominate a given topic. Returns ranked term lists with counts for four dimensions: ' +
      'subject, provider, type, and state.',
    category: 'media',
    annotations: READ_ONLY,
  },

  // NOAA Aviation Weather Center (4)
  {
    toolId: 'aviationweather.metar',
    mcpName: 'aviationweather.observation.metar',
    title: 'Aviation Weather — METAR Observation',
    description:
      'Fetch the latest METAR (Meteorological Aerodrome Report) for one or more ICAO airport stations. ' +
      'Returns decoded fields: temperature, dewpoint, wind direction and speed, visibility, altimeter setting, ' +
      'sea-level pressure, sky cover, cloud layers, present weather, and flight category (VFR/MVFR/IFR/LIFR). ' +
      'Also includes the raw METAR string. Data updated every 20–60 minutes. ' +
      'Source: NOAA Aviation Weather Center — US Government public domain, no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aviationweather.taf',
    mcpName: 'aviationweather.forecast.taf',
    title: 'Aviation Weather — TAF Forecast',
    description:
      'Retrieve the Terminal Aerodrome Forecast (TAF) for one or more ICAO airport stations. ' +
      'A TAF covers a 24–30 hour window and includes time-bracketed forecast periods with expected ' +
      'wind, visibility, weather phenomena (rain, fog, snow), and cloud layers. ' +
      'Returns decoded period-by-period breakdown plus the raw TAF bulletin string. ' +
      'Issued every 6 hours from major airports. ' +
      'Source: NOAA Aviation Weather Center — US Government public domain, no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aviationweather.pirep',
    mcpName: 'aviationweather.observation.pirep',
    title: 'Aviation Weather — Pilot Reports (PIREPs)',
    description:
      'Retrieve Pilot Reports (PIREPs) near a given ICAO station within a configurable radius and time window. ' +
      'PIREPs are real-time in-flight observations filed by pilots capturing actual icing severity, ' +
      'turbulence intensity, visibility, cloud bases and tops, and conditions at flight level. ' +
      'Returns decoded fields: flight level, icing and turbulence extents, and raw PIREP text. ' +
      'Useful for pre-flight planning, route analysis, and verifying forecast accuracy. ' +
      'Source: NOAA Aviation Weather Center — US Government public domain, no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'aviationweather.stations',
    mcpName: 'aviationweather.reference.stations',
    title: 'Aviation Weather — Station Lookup',
    description:
      'Look up aviation weather observation stations by ICAO identifier(s), bounding box, or US state. ' +
      'Returns station metadata: ICAO, IATA, FAA, and WMO identifiers; site name; coordinates; elevation; ' +
      'country/state; and observation types supported (METAR, TAF, PIREP). ' +
      'Useful for discovering station identifiers before calling METAR or TAF tools. ' +
      'Provide one of: ids (comma-separated ICAO codes), bbox (minLat,minLon,maxLat,maxLon), or state (2-letter US). ' +
      'Source: NOAA Aviation Weather Center — US Government public domain, no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },

  // OBIS — Ocean Biodiversity Information System (UC-576, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'obis.occurrence_search',
    mcpName: 'obis.marine.occurrence_search',
    title: 'OBIS — Marine Species Occurrence Search',
    description:
      'Search 100M+ marine species occurrence records in the Ocean Biodiversity Information System (OBIS). ' +
      'Filter by scientific name, WoRMS AphiaID, geographic coordinates with radius, or year range. ' +
      'Each record includes GPS coordinates, observation year, depth, sea-surface temperature, dataset source, ' +
      'and full taxonomic classification (kingdom→species). ' +
      'Covers all ocean environments: pelagic, benthic, coastal, deep-sea. ' +
      'Source: OBIS — free, CC BY 4.0, no auth required.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'obis.taxon_search',
    mcpName: 'obis.marine.taxon_search',
    title: 'OBIS — Marine Taxon Lookup',
    description:
      'Look up marine species taxonomy in the World Register of Marine Species (WoRMS) via OBIS. ' +
      'Search by scientific name (genus, species, or higher taxon) to retrieve the full taxonomic hierarchy ' +
      '(kingdom through species), WoRMS AphiaID, taxonomic status, accepted name, authorship, ' +
      'and habitat flags (marine / brackish / freshwater). Also returns common (vernacular) names. ' +
      'Source: OBIS + WoRMS — free, CC BY 4.0, no auth required.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'obis.checklist',
    mcpName: 'obis.marine.checklist',
    title: 'OBIS — Marine Species Checklist',
    description:
      'Generate a species checklist from OBIS occurrence data for a given taxon group or geographic area. ' +
      'Returns a ranked list of species with occurrence record counts, full taxonomy ' +
      '(phylum/class/order/family/genus), WoRMS AphiaID, and marine/brackish habitat flags. ' +
      'Filter by parent taxon (e.g. "Mollusca" for all molluscs), WoRMS AphiaID, or OBIS area ID. ' +
      'Useful for biodiversity assessments, EIA surveys, and species inventories. ' +
      'Source: OBIS — free, CC BY 4.0, no auth required.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'obis.dataset_search',
    mcpName: 'obis.marine.dataset_search',
    title: 'OBIS — Marine Dataset Search',
    description:
      'Find marine biodiversity datasets in the OBIS network by species name or geographic area. ' +
      'Returns dataset metadata: title, abstract, record count, citation, and source URL. ' +
      'Useful for discovering primary data sources, citing specific surveys, and understanding ' +
      'data provenance for a species or region. ' +
      'The OBIS network aggregates 4,200+ datasets from 900+ institutions worldwide. ' +
      'Source: OBIS — free, CC BY 4.0, no auth required.',
    category: 'education',
    annotations: READ_ONLY,
  },

  // EPA ECHO (4)
  {
    toolId: 'echo.facility_search',
    mcpName: 'echo.compliance.facility_search',
    title: 'EPA ECHO — Facility Search',
    description:
      'Search EPA-regulated facilities across all environmental programs by ZIP code or facility name. ' +
      'Returns facility name, address, coordinates, industry codes (SIC/NAICS), program flags ' +
      '(CAA, CWA, RCRA, SDWA, TRI, GHG), total penalties assessed, inspection count, and ' +
      'formal/informal action counts. Use zip_code for location-based discovery, or facility_name ' +
      'with state for targeted searches. Covers 1M+ regulated US facilities. ' +
      'Source: EPA ECHO (Enforcement and Compliance History Online) — US Gov public domain, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'echo.facility_detail',
    mcpName: 'echo.compliance.facility_detail',
    title: 'EPA ECHO — Facility Detail',
    description:
      'Retrieve detailed compliance profile for a specific EPA-regulated facility by Registry ID. ' +
      'Returns full address with county, coordinates, SIC/NAICS codes, HUC watershed code, ' +
      'federal facility status, facility creation/termination dates, and a complete list of ' +
      'environmental program interests (e.g. "CAA Stationary Source", "NPDES Permit"). ' +
      'Registry IDs are obtained from echo.compliance.facility_search results. ' +
      'Essential for due diligence, ESG screening, and permit verification. ' +
      'Source: EPA ECHO — US Gov public domain, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'echo.air_facilities',
    mcpName: 'echo.compliance.air_facilities',
    title: 'EPA ECHO — Air Program Facilities',
    description:
      'Search facilities regulated under the Clean Air Act (CAA) by ZIP code or facility name. ' +
      'Returns facility name, address, coordinates, CAA permit types and status, quarters of ' +
      'noncompliance, inspection count, and High Priority Violation (HPV) flag. ' +
      'Ideal for air quality compliance monitoring, permit research, and environmental due diligence. ' +
      'Use zip_code for location search or facility_name with state for targeted search. ' +
      'Source: EPA ECHO Air program data — US Gov public domain, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'echo.violations',
    mcpName: 'echo.compliance.violations',
    title: 'EPA ECHO — Facility Violations & Enforcement',
    description:
      'Retrieve enforcement actions and violation history for a specific EPA-regulated facility. ' +
      'Returns enforcement activity type, action type, settlement date, federal and state penalties ' +
      'assessed, supplemental environmental project (SEP) amounts, and affected program codes ' +
      '(e.g. CAA, CWA, RCRA). ' +
      'Registry IDs are obtained from echo.compliance.facility_search results. ' +
      'Critical for environmental liability assessment, ESG due diligence, and compliance monitoring. ' +
      'Source: EPA ECHO — US Gov public domain, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // NASA CMR (4)
  {
    toolId: 'nasa-cmr.search_collections',
    mcpName: 'nasa-cmr.datasets.search',
    title: 'NASA CMR — Search Earth Science Datasets',
    description:
      'Search NASA Common Metadata Repository (CMR) for Earth science satellite datasets and ' +
      'collections. Filter by keyword, data provider (ORNL_DAAC, GES_DISC, LPDAAC_ECS, PODAAC, ' +
      'NSIDC_ECS), temporal range, spatial bounding box, and processing level. ' +
      'Returns concept IDs, titles, summaries, data centers, temporal coverage, and access flags. ' +
      'CMR indexes 45,000+ collections covering climate, land, atmosphere, ocean, cryosphere, ' +
      'and biosphere from 60+ NASA data archives. Concept IDs from results feed into ' +
      'nasa-cmr.datasets.detail and nasa-cmr.granules.search. ' +
      'Source: NASA CMR — US Gov public domain, no auth required.',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nasa-cmr.collection_detail',
    mcpName: 'nasa-cmr.datasets.detail',
    title: 'NASA CMR — Collection Metadata Detail',
    description:
      'Retrieve full UMM (Universal Metadata Model) metadata for a specific NASA CMR collection ' +
      'identified by its concept ID (e.g. "C2515837343-GES_DISC"). ' +
      'Returns abstract, version, processing level, temporal extents, observing platforms and ' +
      'instruments, science keywords (GCMD taxonomy: category/topic/term), DOI, related URLs, ' +
      'and data center information. Concept IDs are obtained from nasa-cmr.datasets.search results. ' +
      'Essential for understanding dataset scope, instrument provenance, and citation details ' +
      'before downloading granules. ' +
      'Source: NASA CMR — US Gov public domain, no auth required.',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nasa-cmr.search_granules',
    mcpName: 'nasa-cmr.granules.search',
    title: 'NASA CMR — Search Data Granules',
    description:
      'Search for individual data granules (files) within a NASA CMR collection. ' +
      'Filter by collection concept ID or short name (e.g. "MOD09GA"), temporal range, ' +
      'spatial bounding box, and day/night acquisition flag. ' +
      'Returns granule IDs, titles, acquisition times, cloud cover percentage, file size (MB), ' +
      'online access status, browse image availability, and direct download URLs. ' +
      'Granules are the individual science data files (HDF, NetCDF, GeoTIFF) that agents ' +
      'can download for analysis. Use nasa-cmr.datasets.search first to find the collection ' +
      'concept ID, then use this tool to locate specific files by time/area. ' +
      'Source: NASA CMR — US Gov public domain, no auth required.',
    category: 'space',
    annotations: READ_ONLY,
  },
  // ChEMBL (4)
  {
    toolId: 'chembl.molecule_search',
    mcpName: 'chembl.molecules.search',
    title: 'ChEMBL — Search Drug Molecules',
    description:
      'Search the ChEMBL database for drug molecules and bioactive compounds by name, ' +
      'clinical development phase, and molecular type. ' +
      'Returns molecular formula, molecular weight, lipophilicity (ALogP), ' +
      'hydrogen bond donors/acceptors, polar surface area, Lipinski rule-of-5 violations, ' +
      'canonical SMILES structure, InChIKey, oral/parenteral/topical flags, ' +
      'ATC classification codes, and clinical approval year. ' +
      'max_phase=4 for approved drugs, max_phase_gte=3 for late-stage candidates. ' +
      'ChEMBL covers 2.9M+ molecules sourced from 88K+ peer-reviewed publications. ' +
      'Source: EMBL-EBI ChEMBL — CC BY-SA 3.0, no auth required.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'chembl.molecule_detail',
    mcpName: 'chembl.molecules.detail',
    title: 'ChEMBL — Molecule Detail by ID',
    description:
      'Retrieve full structural and pharmacological data for a specific ChEMBL molecule. ' +
      'Returns canonical SMILES, standard InChI, InChIKey, molecular formula, exact weight, ' +
      'ALogP, polar surface area, hydrogen bond count, QED drug-likeness score (0–1), ' +
      'Lipinski rule-of-5 violations, black box warning flag, natural product flag, ' +
      'clinical phase (max_phase), first approval year, ATC codes, and administration routes. ' +
      'Use chembl.molecules.search to discover ChEMBL IDs (format: CHEMBL25, CHEMBL521). ' +
      'Source: EMBL-EBI ChEMBL — CC BY-SA 3.0, no auth required.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'chembl.target_search',
    mcpName: 'chembl.targets.search',
    title: 'ChEMBL — Search Biological Targets',
    description:
      'Search for biological drug targets (proteins, enzymes, receptors, ion channels) ' +
      'in the ChEMBL database by name, target type, and source organism. ' +
      'Returns target ChEMBL ID, preferred name, target classification ' +
      '(SINGLE PROTEIN, PROTEIN COMPLEX, PROTEIN FAMILY, etc.), ' +
      'organism, UniProt accession numbers, and gene symbols. ' +
      'Use returned target_chembl_id with chembl.activity.bioactivity to retrieve ' +
      'all compounds tested against a target and their potency values. ' +
      'ChEMBL covers 18,500+ targets from 650+ organisms. ' +
      'Source: EMBL-EBI ChEMBL — CC BY-SA 3.0, no auth required.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'chembl.bioactivity',
    mcpName: 'chembl.activity.bioactivity',
    title: 'ChEMBL — Bioactivity Measurements',
    description:
      'Retrieve bioactivity data (potency measurements) for a drug molecule or biological target ' +
      "from ChEMBL's curated assay database. " +
      'Returns activity type (IC50, Ki, EC50, Kd, MIC, GI50), measured value and units, ' +
      'relation operator (<, =, >), pChEMBL value (−log10 molar, comparable across assay types), ' +
      'assay ChEMBL ID, assay description, and source document ChEMBL ID. ' +
      'Filter by activity_type (e.g. "IC50") to focus on one measurement class. ' +
      'Requires at least one of: molecule_chembl_id (compound-centric) or ' +
      'target_chembl_id (target-centric, all inhibitors). ' +
      'ChEMBL contains 20M+ curated bioactivity measurements from scientific literature. ' +
      'Source: EMBL-EBI ChEMBL — CC BY-SA 3.0, no auth required.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nasa-cmr.list_providers',
    mcpName: 'nasa-cmr.providers.list',
    title: 'NASA CMR — List Data Providers',
    description:
      'List all data centers and archive providers registered in the NASA CMR system. ' +
      'Returns provider IDs (e.g. GES_DISC, ORNL_DAAC, LPDAAC_ECS, PODAAC, NSIDC_ECS, ' +
      'LAADS, ASDC, GHRC_DAAC), organization names, URLs, roles, and consortium memberships. ' +
      'Use provider IDs as the "provider" parameter in nasa-cmr.datasets.search to scope ' +
      'dataset discovery to a specific NASA archive center. ' +
      'There are approximately 60 active providers covering distinct Earth science disciplines. ' +
      'Source: NASA CMR — US Gov public domain, no auth required.',
    category: 'space',
    annotations: READ_ONLY,
  },

  // MedlinePlus Connect (UC-580) — 4 tools
  {
    toolId: 'medlineplus.icd10_lookup',
    mcpName: 'medlineplus.clinical.icd10_lookup',
    title: 'MedlinePlus Connect — ICD-10 Code Lookup',
    description:
      'Look up patient-friendly health information for an ICD-10-CM diagnosis code via the ' +
      'NLM MedlinePlus Connect service. ' +
      'Returns MedlinePlus topic titles, URLs, and plain-language summaries for conditions ' +
      'matching the code (e.g. E11 → Type 2 Diabetes, J18.9 → Pneumonia, I21 → Myocardial Infarction). ' +
      'Supports English and Spanish responses (language=es). ' +
      'Used in EHR/clinical contexts to link clinical codes to patient education materials. ' +
      'Source: US NLM MedlinePlus Connect — public domain, no auth, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'medlineplus.icd9_lookup',
    mcpName: 'medlineplus.clinical.icd9_lookup',
    title: 'MedlinePlus Connect — ICD-9 Code Lookup',
    description:
      'Look up patient-friendly health information for an ICD-9-CM diagnosis code via the ' +
      'NLM MedlinePlus Connect service. ' +
      'Returns MedlinePlus topic titles, URLs, and plain-language summaries for conditions ' +
      'matching the code (e.g. 250 → Diabetes mellitus, 410 → Acute myocardial infarction). ' +
      'Useful for legacy EHR systems still using ICD-9-CM coding. ' +
      'Supports English and Spanish responses (language=es). ' +
      'Source: US NLM MedlinePlus Connect — public domain, no auth, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'medlineplus.snomed_lookup',
    mcpName: 'medlineplus.clinical.snomed_lookup',
    title: 'MedlinePlus Connect — SNOMED CT Lookup',
    description:
      'Look up patient-friendly health information for a SNOMED CT clinical concept via the ' +
      'NLM MedlinePlus Connect service. ' +
      'Returns MedlinePlus topic titles, URLs, and plain-language summaries for conditions ' +
      'matching the concept (e.g. 44054006 → Diabetes mellitus type 2, 22298006 → Myocardial infarction, ' +
      '195967001 → Asthma). ' +
      'Provide the optional display_name to improve match accuracy. ' +
      'Supports English and Spanish responses (language=es). ' +
      'Source: US NLM MedlinePlus Connect — public domain, no auth, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'medlineplus.rxnorm_lookup',
    mcpName: 'medlineplus.clinical.rxnorm_lookup',
    title: 'MedlinePlus Connect — RxNorm Drug Lookup',
    description:
      'Look up patient-friendly drug information for an RxNorm concept ID (RXCUI) via the ' +
      'NLM MedlinePlus Connect service. ' +
      'Returns MedlinePlus drug topic titles, URLs, and plain-language summaries for medications ' +
      'matching the concept (e.g. 161 → Aspirin, 5640 → Ibuprofen, 723 → Metformin, ' +
      '29046 → Lisinopril, 41493 → Atorvastatin). ' +
      'Provide the optional display_name to improve match accuracy. ' +
      'Supports English and Spanish responses (language=es). ' +
      'Source: US NLM MedlinePlus Connect — public domain, no auth, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // Orphadata — Rare Disease Knowledge Base (UC-581, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'orphadata.disease_lookup',
    mcpName: 'orphadata.raredisease.disease_lookup',
    title: 'Orphadata Rare Disease Lookup',
    description:
      'Search Orphanet rare disease database by disease name and retrieve cross-references to major medical coding systems. ' +
      'Returns ORPHAcode, full disease definition, synonyms, and validated cross-references to ICD-10, ICD-11, OMIM, MONDO, MeSH, MedDRA, UMLS, and Orphanet URL. ' +
      'Covers 4,245+ rare diseases. Supports 12 languages (en, fr, de, es, it, pt, nl, pl, cs, tr, uk, zh). ' +
      'Source: Orphadata / Orphanet — CC BY 4.0, no auth, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'orphadata.disease_epidemiology',
    mcpName: 'orphadata.raredisease.disease_epidemiology',
    title: 'Orphadata Rare Disease Epidemiology',
    description:
      'Get prevalence and incidence data for a rare disease by its Orphanet ORPHAcode. ' +
      'Returns prevalence records with geographic area (Europe, Worldwide, US, UK, etc.), measurement type (point prevalence, birth prevalence, annual incidence), ' +
      'prevalence class (e.g. 1-5/10,000), numeric mean value, and PMID citations from peer-reviewed literature. ' +
      'Source: Orphadata / Orphanet — CC BY 4.0, no auth, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'orphadata.disease_phenotypes',
    mcpName: 'orphadata.raredisease.disease_phenotypes',
    title: 'Orphadata Rare Disease Phenotypes',
    description:
      'Get clinical signs and symptoms (HPO phenotypes) for a rare disease by its Orphanet ORPHAcode. ' +
      'Returns HPO identifiers and terms annotated with frequency categories (Very frequent 99-80%, Frequent 79-30%, Occasional 29-5%) ' +
      'and whether each sign is a diagnostic criterion. Up to 68+ HPO terms per disease, cited from PubMed. ' +
      'Source: Orphadata / Orphanet — CC BY 4.0, no auth, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'orphadata.disease_natural_history',
    mcpName: 'orphadata.raredisease.disease_natural_history',
    title: 'Orphadata Rare Disease Natural History',
    description:
      'Get genetic inheritance mode and clinical timeline for a rare disease by its Orphanet ORPHAcode. ' +
      'Returns inheritance modes (e.g. Autosomal dominant, X-linked recessive, Mitochondrial), ' +
      'average age of onset (e.g. Neonatal, Infancy, All ages), and disease group/typology classification. ' +
      'Supports 12 languages (en, fr, de, es, it, pt, nl, pl, cs, tr, uk, zh). ' +
      'Source: Orphadata / Orphanet — CC BY 4.0, no auth, unlimited free.',
    category: 'health',
    annotations: READ_ONLY,
  },

  // CBS Netherlands (UC-582) — Statistics Netherlands OData API (4)
  {
    toolId: 'cbs.catalog_search',
    mcpName: 'cbs.catalog.search',
    title: 'CBS Netherlands Catalog Search',
    description:
      'Search the Statistics Netherlands (CBS) open data catalog of 5900+ statistical datasets covering ' +
      'population, economy, labor market, health, education, environment, and more. ' +
      'Returns table identifiers needed for table_info, table_properties, and table_data queries. ' +
      'Filter by keyword (e.g. "bevolking", "werkloosheid", "bbp"), publication frequency (annual/quarterly/monthly), ' +
      'or language. Results ordered by most recently updated. ' +
      'Source: opendata.cbs.nl — CC BY 4.0, no auth, unlimited free access.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cbs.table_info',
    mcpName: 'cbs.table.info',
    title: 'CBS Netherlands Table Info',
    description:
      'Get metadata for a specific CBS Netherlands statistical table by its identifier (e.g. "83583NED"). ' +
      'Returns full title, description, time period covered (e.g. 2010–2024), publication frequency, ' +
      'number of records, data source, output status (provisional/final), and the API URL for data access. ' +
      'Use catalog_search first to discover table identifiers. ' +
      'Source: opendata.cbs.nl — CC BY 4.0, no auth, unlimited free access.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cbs.table_properties',
    mcpName: 'cbs.table.properties',
    title: 'CBS Netherlands Table Properties',
    description:
      'Get the column schema for a CBS Netherlands statistical table — dimension keys, topic keys, ' +
      'data types (TimeDimension, GeoDimension, Topic, TopicGroup), titles, units, and decimal precision. ' +
      'Essential before querying table_data: reveals the exact field names and filter values available. ' +
      'For example, a population table has Perioden (time), RegioS (region), and numeric topic columns. ' +
      'Source: opendata.cbs.nl — CC BY 4.0, no auth, unlimited free access.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cbs.table_data',
    mcpName: 'cbs.table.data',
    title: 'CBS Netherlands Table Data',
    description:
      'Query statistical data from a CBS Netherlands table using OData filters. ' +
      'Supports $filter (e.g. "Perioden eq \'2023JJ00\'" for annual 2023, "RegioS eq \'NL00  \'" for national), ' +
      '$select (specific columns), $top (max 100 records), and $skip (pagination). ' +
      'Returns typed data rows with all dimension and topic values. ' +
      'Use table_properties first to discover available columns and valid filter values. ' +
      'Annual period codes use format YYYY + JJ00 (e.g. 2023JJ00). ' +
      'Source: opendata.cbs.nl — CC BY 4.0, no auth, unlimited free access.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // ADB KIDB — Asian Development Bank Key Indicators Database (UC-583, 4 tools)
  {
    toolId: 'adbkidb.dataflows_list',
    mcpName: 'adbkidb.explore.dataflows',
    title: 'ADB KIDB — List Dataflows',
    description:
      'List the 62 available dataflow categories in the ADB Key Indicators Database (KIDB). ' +
      'Covers macroeconomic and social statistics for 50 Asia-Pacific economies. ' +
      'Dataflows are hierarchical topic groups: People (PPL), Economy and Output (EO), ' +
      'Money Finance and Prices (MFP), Government and Governance (GG), Globalization (GLB), ' +
      'Energy and Electricity (EGELC), Transport and Communication (TC), ' +
      'Environment and Climate Change (ENV), and Sustainable Development Goals (SDG_01–SDG_17). ' +
      'Use the returned code with adbkidb.indicators to discover indicator codes, ' +
      'then adbkidb.data to fetch actual values. ' +
      'Source: kidb.adb.org — Asian Development Bank open data, no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'adbkidb.indicators',
    mcpName: 'adbkidb.explore.indicators',
    title: 'ADB KIDB — List Indicators',
    description:
      'List all available indicators within an ADB KIDB dataflow. ' +
      'Returns indicator codes, names, and descriptions for a given topic category. ' +
      'For example, dataflow EO_NA returns GDP, GVA, investment, and savings indicators ' +
      'with codes like NGDP_XDC (GDP at current prices) and NGDP_RPCH (real GDP growth). ' +
      'Use the returned codes with adbkidb.data to query actual time-series observations. ' +
      'Typical dataflow codes: PPL_POP (population), EO_NA (national accounts), ' +
      'MFP_XR (exchange rates), GLB_ET (external trade), ENV_CC (climate data). ' +
      'Source: kidb.adb.org — Asian Development Bank open data, no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'adbkidb.data',
    mcpName: 'adbkidb.data.query',
    title: 'ADB KIDB — Query Economic Data',
    description:
      'Fetch annual macroeconomic time-series data from the ADB Key Indicators Database for any combination ' +
      'of Asian Development Bank member economies and SDMX indicators. ' +
      'Returns structured observations with values, units, data sources, and footnotes. ' +
      'Covers GDP, population, inflation, exchange rates, trade, energy, SDGs, and 700+ other indicators ' +
      'for 50 Asia-Pacific economies (China=PRC, India=IND, Japan=JPN, Indonesia=INO, etc.) from 1960s onward. ' +
      'Workflow: (1) adbkidb.dataflows_list to pick a topic, (2) adbkidb.indicators to find indicator codes, ' +
      '(3) this tool to fetch values. ' +
      'Example: dataflow=EO_NA, indicator_codes=[NGDP_XDC], economy_codes=[PRC,IND], start_year=2015 ' +
      'returns GDP at current prices for China and India from 2015 to present. ' +
      'Source: kidb.adb.org SDMX v3.0 API — ADB open data, no auth, 20 req/min.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'adbkidb.economies',
    mcpName: 'adbkidb.explore.economies',
    title: 'ADB KIDB — List Member Economies',
    description:
      'List the 50 ADB member economy codes used to query the Key Indicators Database. ' +
      "Returns each economy's 3-letter code and full name. " +
      'These codes are used as economy_codes in adbkidb.data queries. ' +
      'Key codes: PRC (China), IND (India), JPN (Japan), INO (Indonesia), KOR (Korea), ' +
      'PAK (Pakistan), BAN (Bangladesh), PHI (Philippines), VIE (Viet Nam), THA (Thailand). ' +
      'Note: China is PRC (not CHN), Indonesia is INO (not IDN), Bangladesh is BAN (not BGD). ' +
      'Source: kidb.adb.org — Asian Development Bank member economy reference.',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // Open Trivia Database (4)
  {
    toolId: 'opentdb.questions',
    mcpName: 'opentdb.trivia.questions',
    title: 'Open Trivia DB — Get Questions',
    description:
      'Fetch random trivia questions from the Open Trivia Database. ' +
      'Returns up to 50 questions per call with category, difficulty, correct answer, ' +
      'incorrect answers, and a shuffled all_answers list for quiz presentation. ' +
      'HTML entities are decoded automatically. ' +
      'Filter by category (use opentdb.trivia.categories to get IDs), difficulty (easy/medium/hard), ' +
      'and type (multiple-choice or True/False). ' +
      'Examples: 10 general knowledge questions (no params), 5 hard science questions (category=17, amount=5, difficulty=hard), ' +
      'True/False history questions (category=23, type=boolean). ' +
      'Source: opentdb.com — CC BY-SA 4.0, user-contributed, 5000+ verified questions, 24 categories, free unlimited.',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'opentdb.categories',
    mcpName: 'opentdb.trivia.categories',
    title: 'Open Trivia DB — List Categories',
    description:
      'List all 24 trivia categories available in the Open Trivia Database with their numeric IDs. ' +
      'Categories include General Knowledge (9), Entertainment: Books (10), Film (11), Music (12), ' +
      'Musicals & Theatres (13), Television (14), Video Games (15), Board Games (16), ' +
      'Science & Nature (17), Computers (18), Mathematics (19), Mythology (20), Sports (21), ' +
      'Geography (22), History (23), Politics (24), Art (25), Celebrities (26), ' +
      'Animals (27), Vehicles (28), Comics (29), Gadgets (30), Japanese Anime & Manga (31), ' +
      "Cartoon & Animations (32). Use returned IDs as the 'category' parameter in opentdb.trivia.questions. " +
      'Source: opentdb.com — CC BY-SA 4.0, free unlimited.',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'opentdb.category_count',
    mcpName: 'opentdb.trivia.category_count',
    title: 'Open Trivia DB — Category Question Count',
    description:
      'Get the number of verified trivia questions available in a specific category, ' +
      'broken down by difficulty (easy, medium, hard). ' +
      'Useful for checking availability before requesting questions with opentdb.trivia.questions — ' +
      'if you request more questions than exist in a filtered query, the API returns empty results. ' +
      'Example: category 9 (General Knowledge) has ~469 verified questions. ' +
      'Source: opentdb.com — CC BY-SA 4.0, free unlimited.',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'opentdb.global_count',
    mcpName: 'opentdb.trivia.global_count',
    title: 'Open Trivia DB — Global Question Statistics',
    description:
      'Get global question counts across the entire Open Trivia Database: ' +
      'total questions, verified (live and servable), pending (under review), and rejected, ' +
      'with a per-category breakdown. ' +
      'Useful for understanding database coverage — typically 5000+ verified questions ' +
      'spread across 24 categories. ' +
      'Note: only verified questions are returned by opentdb.trivia.questions. ' +
      'Source: opentdb.com — CC BY-SA 4.0, free unlimited.',
    category: 'entertainment',
    annotations: READ_ONLY,
  },

  // Jolpica F1 (UC-585) — 4 tools
  {
    toolId: 'f1.races.schedule',
    mcpName: 'f1.races.schedule',
    title: 'F1 Race Schedule',
    description:
      'Get the Formula 1 race calendar for any season from 1950 to the current year. ' +
      'Returns each Grand Prix with round number, race name, circuit, location, race date/time (UTC), ' +
      'qualifying date/time, and sprint date when applicable. ' +
      'Omit the season parameter to get the current season schedule. ' +
      'Data source: Jolpica F1 (Ergast-compatible API) — free, unlimited, no auth required.',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'f1.races.results',
    mcpName: 'f1.races.results',
    title: 'F1 Race Results',
    description:
      'Get the finishing results for a specific Formula 1 race: final classified positions, ' +
      'driver name, constructor, grid position, laps completed, finish status (Finished/DNF/DSQ/+N Laps), ' +
      'points scored, finish time, and fastest lap time and rank. ' +
      'Defaults to the most recently completed race (round=last) of the current season. ' +
      'Specify season + round to fetch any race back to 1950. ' +
      'Data source: Jolpica F1 (Ergast-compatible API) — free, unlimited, no auth required.',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'f1.standings.drivers',
    mcpName: 'f1.standings.drivers',
    title: 'F1 Driver Championship Standings',
    description:
      'Get Formula 1 World Drivers Championship standings for any season. ' +
      'Returns each driver ranked by points, with their constructor, nationality, wins count, ' +
      'and total championship points as of the latest completed round. ' +
      'Omit the season parameter to get current live standings. ' +
      'Historical seasons available back to 1950. ' +
      'Data source: Jolpica F1 (Ergast-compatible API) — free, unlimited, no auth required.',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'f1.standings.constructors',
    mcpName: 'f1.standings.constructors',
    title: 'F1 Constructor Championship Standings',
    description:
      'Get Formula 1 World Constructors Championship standings for any season. ' +
      'Returns each team (constructor) ranked by points, with nationality, total wins, ' +
      'and championship points as of the latest completed round. ' +
      'Omit the season parameter to get current live standings. ' +
      'Historical seasons available back to 1958 (first constructor championship). ' +
      'Data source: Jolpica F1 (Ergast-compatible API) — free, unlimited, no auth required.',
    category: 'entertainment',
    annotations: READ_ONLY,
  },

  // TheSportsDB (UC-586) — 4 tools
  {
    toolId: 'thesportsdb.team_search',
    mcpName: 'thesportsdb.teams.search',
    title: 'Sports Team Search',
    description:
      'Search for a sports team by name across all sports (soccer, basketball, NFL, NHL, baseball, rugby, etc.). ' +
      'Returns team profile including sport type, primary league with league ID, stadium, location, country, ' +
      'founding year, website, and badge/logo URL. Use the returned league_id to retrieve past or upcoming ' +
      'match results via the events_past and events_next tools. ' +
      'Data source: TheSportsDB — free public sports database, no auth required.',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'thesportsdb.player_search',
    mcpName: 'thesportsdb.players.search',
    title: 'Sports Player Search',
    description:
      'Search for a professional sports player by name across all sports. ' +
      'Returns player profile including current team, sport, position, nationality, date of birth, ' +
      'active status, gender, and player photo URLs (thumbnail and cutout). ' +
      'Supports partial name matching. Multiple results are returned when the name is ambiguous. ' +
      'Data source: TheSportsDB — free public sports database, no auth required.',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'thesportsdb.events_past',
    mcpName: 'thesportsdb.events.past',
    title: 'Past League Match Results',
    description:
      'Get the most recent completed match results for a sports league, identified by its TheSportsDB league ID. ' +
      'Returns match events with home/away teams, scores, round number, date, time, venue, and result string. ' +
      'Common league IDs: 4328 (English Premier League), 4387 (NBA), 4391 (NFL), 4380 (MLB), 4335 (Scottish Premier League). ' +
      'Obtain league IDs from team_search results (the league_id field). ' +
      'Data source: TheSportsDB — free public sports database, no auth required.',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'thesportsdb.events_next',
    mcpName: 'thesportsdb.events.next',
    title: 'Upcoming League Match Schedule',
    description:
      'Get the next scheduled matches for a sports league, identified by its TheSportsDB league ID. ' +
      'Returns upcoming events with home/away teams, scheduled date, kickoff time, round number, venue, ' +
      'and team badge URLs. Status field indicates scheduling state (NS = not started, PPD = postponed). ' +
      'Common league IDs: 4328 (English Premier League), 4387 (NBA), 4391 (NFL), 4380 (MLB), 4335 (Scottish Premier League). ' +
      'Obtain league IDs from team_search results (the league_id field). ' +
      'Data source: TheSportsDB — free public sports database, no auth required.',
    category: 'entertainment',
    annotations: READ_ONLY,
  },

  // EUR-Lex Cellar (4)
  {
    toolId: 'eurlex.legislation.search',
    mcpName: 'eurlex.legislation.search',
    title: 'Search EU Legislation',
    description:
      'Search the official EUR-Lex Cellar SPARQL endpoint for EU legislative acts by keyword in English titles. ' +
      'Returns matching regulations, directives, and decisions with CELEX identifier, date, English title, ' +
      'in-force status, Cellar URI, and a direct EUR-Lex URL. ' +
      'Examples: keyword="artificial intelligence" returns the EU AI Act (32024R1689); ' +
      'keyword="GDPR" returns the General Data Protection Regulation (32016R0679). ' +
      'Results are ordered by most recent date first. Optionally restrict to acts published on or after from_date. ' +
      'CELEX format: 3 + 4-digit year + type letter (R=Regulation, L=Directive, D=Decision) + number. ' +
      'Data source: EU Publications Office EUR-Lex Cellar — official EU law repository, no auth required, open access.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'eurlex.legislation.recent',
    mcpName: 'eurlex.legislation.recent',
    title: 'Recent EU Legislation',
    description:
      'Get the most recently published EU legislative acts from EUR-Lex Cellar. ' +
      'Returns acts ordered by publication date descending with CELEX identifier, date, English title ' +
      '(where available), in-force status, Cellar URI, and direct EUR-Lex URL. ' +
      'Covers all secondary EU legislation (regulations, directives, decisions) published within the ' +
      'specified number of days. Default look-back is 30 days; max 365 days. ' +
      'Data source: EU Publications Office EUR-Lex Cellar — official EU law repository, no auth required, open access.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'eurlex.legislation.detail',
    mcpName: 'eurlex.legislation.detail',
    title: 'EU Legal Act Detail',
    description:
      'Retrieve full metadata for a specific EU legal act identified by its CELEX number from EUR-Lex Cellar. ' +
      'Returns CELEX identifier, publication date, English title, in-force status, Cellar URI, and direct EUR-Lex URL. ' +
      'CELEX examples: "32024R1689" (EU AI Act), "32016R0679" (GDPR), "32023R1115" (EU Deforestation Regulation), ' +
      '"32022R2065" (Digital Services Act), "32020R0852" (EU Taxonomy Regulation). ' +
      'CELEX format: sector digit (3 = secondary EU law) + 4-digit year + ' +
      'type letter (R=Regulation, L=Directive, D=Decision) + sequential number. ' +
      'Returns found=false if the CELEX number does not exist in EUR-Lex Cellar. ' +
      'Data source: EU Publications Office EUR-Lex Cellar — official EU law repository, no auth required, open access.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'eurlex.legislation.by_type',
    mcpName: 'eurlex.legislation.by_type',
    title: 'Browse EU Legislation by Type',
    description:
      'Browse EU legislative acts by document type (regulation, directive, or decision) from EUR-Lex Cellar. ' +
      'Returns acts with CELEX identifier, publication date, English title, in-force status, Cellar URI, ' +
      'and direct EUR-Lex URL, ordered by most recent date first. ' +
      'Regulations are directly applicable in all EU member states without national implementation; ' +
      'directives set binding objectives but require member state transposition; ' +
      'decisions are binding on specific addressees (states, companies, or individuals). ' +
      'Use from_year to restrict to acts published from that year onwards (e.g. 2020 for recent acts). ' +
      'Data source: EU Publications Office EUR-Lex Cellar — official EU law repository, no auth required, open access.',
    category: 'legal',
    annotations: READ_ONLY,
  },

  // European Parliament (4) — UC-588
  {
    toolId: 'eu_parliament.meps.list',
    mcpName: 'eu_parliament.meps.list',
    title: 'List EU Parliament MEPs',
    description:
      'List Members of the European Parliament (MEPs) currently serving in the active parliamentary term. ' +
      'Filter by country (ISO 3166-1 alpha-2 code), political group (PPE, S-D, RENEW, VERTS-ALE, ECR, THE-LEFT, ID, NI), ' +
      "or gender. Returns each MEP's numeric CODICT identifier, full name, family name, given name, " +
      'country of representation, and political group abbreviation. ' +
      'Use the returned identifier with the meps.details tool to fetch the full membership history. ' +
      'Supports pagination via limit (max 100) and offset. ' +
      'Data source: European Parliament Open Data API v2 — CC BY 4.0, no auth required.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'eu_parliament.meps.details',
    mcpName: 'eu_parliament.meps.details',
    title: 'Get MEP Profile and Memberships',
    description:
      'Retrieve the full profile and complete parliamentary membership history of a specific MEP by their ' +
      "numeric CODICT identifier. Returns the MEP's name, date of birth, gender, and all committee, " +
      'political group, intergroup, and delegation memberships with start/end dates and roles. ' +
      'Use the meps.list tool to look up MEP identifiers. ' +
      "Useful for understanding an MEP's committee responsibilities, political affiliations over time, " +
      'and interparliamentary delegation work. ' +
      'Data source: European Parliament Open Data API v2 — CC BY 4.0, no auth required.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'eu_parliament.legislation.adopted_texts',
    mcpName: 'eu_parliament.legislation.adopted_texts',
    title: 'List EP Adopted Legislative Texts',
    description:
      'List legislative texts adopted (voted into law) by the European Parliament plenary. ' +
      'Returns document identifiers, adoption dates, parliamentary term, parent procedure references, ' +
      'and Eurovoc subject thematic codes. ' +
      'Filter by parliamentary term (e.g. term 10 = 2024–2029 legislature). ' +
      'The most recent adopted texts appear first. ' +
      'Use the document ID (e.g. TA-10-2025-0181) to look up the full text on EUR-Lex (eurlex.legislation.detail tool). ' +
      'Supports pagination via limit (max 100) and offset. ' +
      'Data source: European Parliament Open Data API v2 — CC BY 4.0, no auth required.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'eu_parliament.legislation.procedures',
    mcpName: 'eu_parliament.legislation.procedures',
    title: 'List EP Legislative Procedures',
    description:
      'List European Parliament legislative procedures (the full legislative tracks that produce EU law). ' +
      "Returns each procedure's unique EP reference (e.g. 1972/0003(COD)), procedure type code, " +
      'and human-readable label. ' +
      'Filter by parliamentary term or procedure type: COD (ordinary legislative — co-decision with Council), ' +
      'CNS (consultation), BUD (budgetary), INI (own-initiative resolution), RSP (response resolution). ' +
      'Supports pagination via limit (max 100) and offset. ' +
      'Data source: European Parliament Open Data API v2 — CC BY 4.0, no auth required.',
    category: 'legal',
    annotations: READ_ONLY,
  },

  // UK Legislation (4) — UC-589
  {
    toolId: 'ukleg.legislation.search',
    mcpName: 'ukleg.legislation.search',
    title: 'Search UK Legislation',
    description:
      'Search the UK statute book (legislation.gov.uk) for Acts of Parliament, Statutory Instruments, ' +
      'and other UK legislation by title keywords, type, and year. ' +
      'Returns matching legislation items with title, type (e.g. UK Public General Act), year, chapter number, ' +
      'description/long title, enactment date, subject categories, and direct URL to the full text. ' +
      'Supports all UK jurisdictions: England, Wales, Scotland (Scottish Parliament Acts), and Northern Ireland. ' +
      'Common types: ukpga (UK Public General Acts — major Acts of Parliament), uksi (UK Statutory Instruments), ' +
      'asp (Acts of the Scottish Parliament), asc (Acts of Senedd Cymru), nia (Northern Ireland Assembly Acts). ' +
      'Results are paginated (20 per page). Use page parameter to navigate. ' +
      'Data source: legislation.gov.uk — The National Archives, Open Government Licence v3.0, no auth required.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ukleg.legislation.details',
    mcpName: 'ukleg.legislation.details',
    title: 'Get UK Legislation Details',
    description:
      'Get detailed metadata and the full table of contents (section list) for a specific piece of UK legislation ' +
      'identified by its type, year, and chapter/number. ' +
      'Returns the title, document type, legislative status (enacted/revised), enactment date, ' +
      'last modification date, territorial extent (E+W+S+N.I. or narrower), paragraph counts, ' +
      'and the complete structured list of parts, chapters, and sections with their numbers, titles, and URLs. ' +
      'Use ukleg.legislation.search to find the correct type, year, and number for an act. ' +
      'Example: type=ukpga, year=2008, number=27 retrieves the Climate Change Act 2008. ' +
      'Example: type=ukpga, year=2018, number=12 retrieves the Data Protection Act 2018. ' +
      'Data source: legislation.gov.uk — The National Archives, Open Government Licence v3.0, no auth required.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ukleg.legislation.recent',
    mcpName: 'ukleg.legislation.recent',
    title: 'Get Recent UK Legislation',
    description:
      'Get the most recently published or updated pieces of UK legislation. ' +
      'Returns recently enacted Acts, Statutory Instruments, and other legislation with title, type, ' +
      'year, chapter number, publication date, and brief description. ' +
      'Filter by legislation category: use primary for Acts of Parliament, secondary for Statutory Instruments, ' +
      'or specific type codes (ukpga, uksi, asp, asc, nia). ' +
      'Useful for tracking new laws, regulatory changes, and parliamentary activity. ' +
      'Data source: legislation.gov.uk — The National Archives, Open Government Licence v3.0, no auth required.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ukleg.legislation.sections',
    mcpName: 'ukleg.legislation.sections',
    title: 'List UK Legislation Sections',
    description:
      'Get the complete list of sections, parts, and schedules (table of contents) for a specific piece of UK legislation. ' +
      'Returns each section with its type (section, schedule, part), number, title, and URL to the full section text. ' +
      'Use this to navigate the structure of an Act before retrieving specific provisions. ' +
      'Requires the legislation type, year, and chapter number (use ukleg.legislation.search to find these). ' +
      'Example: type=ukpga, year=2023, number=55 returns all sections of the Online Safety Act 2023. ' +
      'Example: type=ukpga, year=1998, number=42 returns sections of the Human Rights Act 1998. ' +
      'Data source: legislation.gov.uk — The National Archives, Open Government Licence v3.0, no auth required.',
    category: 'legal',
    annotations: READ_ONLY,
  },

  // OFAC Sanctions List (UC-590) — 4 tools
  {
    toolId: 'ofac.sdn.search',
    mcpName: 'ofac.sdn.search',
    title: 'Search OFAC SDN List',
    description:
      'Search the US Treasury OFAC Specially Designated Nationals and Blocked Persons (SDN) list by name. ' +
      'Returns matching entities with their entity number, type (individual/entity/vessel/aircraft), ' +
      'sanctions program code, title, and remarks. ' +
      'Filter by type (individual, entity, vessel, aircraft) and/or sanctions program (IRAN, RUSSIA, CUBA, SDN, DPRK, CYBER, etc.). ' +
      'Use this for AML/KYC compliance screening, sanctions risk assessment, and due diligence workflows. ' +
      'Matching is case-insensitive substring search — search by any distinctive part of the name. ' +
      'Use ofac.meta.programs to see all available program codes. ' +
      'Data source: US Treasury OFAC — public domain, updated on business days. No API key required.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ofac.sdn.aliases',
    mcpName: 'ofac.sdn.aliases',
    title: 'Get OFAC Entity Aliases',
    description:
      'Get all known aliases (alternate names) for a specific OFAC SDN entity by its entity number. ' +
      'Returns each alias with its type (aka = also known as, fka = formerly known as, nka = now known as) and the alternate name. ' +
      'Use ofac.sdn.search first to find the entity number (ent_num) for the entity you are screening. ' +
      'Aliases are critical for comprehensive sanctions screening — sanctioned entities often operate under multiple names. ' +
      'Example: entity 36 (AEROCARIBBEAN AIRLINES) has alias "AERO-CARIBBEAN". ' +
      'Data source: OFAC SDN Alternate Names List — US Treasury, public domain.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ofac.meta.programs',
    mcpName: 'ofac.meta.programs',
    title: 'List OFAC Sanctions Programs',
    description:
      'Get the complete list of active OFAC sanctions programs with entity counts from the SDN list. ' +
      'Returns each program code (e.g. IRAN, RUSSIA, CUBA, SDN, DPRK, CYBER, UKRAINE-EO13685, GLOMAG) ' +
      'and the number of entities designated under that program. ' +
      'Use program codes returned here as the "program" filter in ofac.sdn.search. ' +
      'Data source: OFAC SDN List — US Treasury, public domain, updated on business days.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ofac.meta.publication_info',
    mcpName: 'ofac.meta.publication_info',
    title: 'Get OFAC List Publication Info',
    description:
      'Get publication metadata for the OFAC SDN (Specially Designated Nationals) list, ' +
      'including the last modification date and SHA-256 integrity digest. ' +
      'Use this to check when the list was last updated before running compliance screening. ' +
      'The SDN list is updated on US business days as new designations, revocations, and amendments are made. ' +
      'Data source: US Treasury OFAC — public domain, no auth required.',
    category: 'legal',
    annotations: READ_ONLY,
  },

  // P2PQuake — api.p2pquake.net (UC-592, 3 tools)
  {
    toolId: 'p2pquake.recent_quakes',
    mcpName: 'p2pquake.seismic.recent_quakes',
    title: 'Japan Recent Earthquakes',
    description:
      'Get recent earthquake reports issued by the Japan Meteorological Agency (JMA) via the P2PQuake network. ' +
      'Returns seismic events with epicenter name, coordinates, depth, Richter magnitude, ' +
      'maximum JMA intensity (Shindo scale 1–7), tsunami advisory status, ' +
      'and per-prefecture/city observation points. ' +
      'Filter by minimum/maximum seismic intensity, magnitude, prefecture (JIS code 1–47), or report type. ' +
      'Sort newest-first (default) or oldest-first. ' +
      'JMA intensity scale: 10=Shindo1, 20=Shindo2, ..., 60=Shindo6w, 65=Shindo6s, 70=Shindo7. ' +
      'Tsunami status: None | Checking | NonEffective | Watch | Warning. ' +
      'Data source: P2PQuake — community-operated JMA relay, open data, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'p2pquake.tsunami_warnings',
    mcpName: 'p2pquake.seismic.tsunami_warnings',
    title: 'Japan Tsunami Warnings',
    description:
      'Get current and recent tsunami warning/advisory bulletins issued by JMA via the P2PQuake network. ' +
      'Returns warning grade per coastal area (MajorWarning/Warning/Watch), immediate-danger flag, ' +
      'estimated wave height, expected first-arrival time, and the triggering earthquake details. ' +
      'Cancelled bulletins are included with cancelled=true for audit trails. ' +
      'Coverage: all Pacific, Sea of Japan, and Inland Sea coastal areas of Japan. ' +
      'Typical warning lifecycle: FirstReport → Update → AllClear. ' +
      'Use this tool for real-time tsunami monitoring in Japan. ' +
      'Data source: P2PQuake — community-operated JMA relay, open data, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'p2pquake.quake_history',
    mcpName: 'p2pquake.seismic.quake_history',
    title: 'Japan Earthquake History',
    description:
      'Search historical JMA earthquake records via the P2PQuake history endpoint. ' +
      'Supports pagination, intensity and magnitude filters, and prefecture filtering for deeper analysis. ' +
      'Returns epicenter name, coordinates, depth, Richter magnitude, max JMA intensity label, ' +
      'domestic tsunami advisory, report type, and observation point count. ' +
      'Use this for trend analysis, seismic risk assessment, or retrieving older events not in the recent feed. ' +
      'Filter examples: min_scale=60 for Shindo 6+ events, min_magnitude=7.0 for major quakes, ' +
      'prefecture=13 for Tokyo area events. ' +
      'Data source: P2PQuake — community-operated JMA relay, open data, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // Japan Postal Codes — postcode.teraren.com (UC-591, 3 tools)
  {
    toolId: 'postcode-japan.lookup',
    mcpName: 'postcode-japan.postal.lookup',
    title: 'Japan Postcode Lookup',
    description:
      'Look up a Japanese postal address by its 7-digit postcode. ' +
      'Returns prefecture, city, suburb, and street-level address in Japanese kanji, ' +
      'hiragana/katakana readings, and romaji, plus JIS administrative code and GPS coordinates. ' +
      'Accepts codes with or without hyphen (e.g. "1500001" or "150-0001"). ' +
      'Coverage: all ~124,000 active Japan Post postcodes, updated regularly. ' +
      'Data source: postcode.teraren.com — MIT license, no auth required.',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'postcode-japan.search',
    mcpName: 'postcode-japan.postal.search',
    title: 'Japan Postcode Search',
    description:
      'Search Japanese postcodes by free-text query, prefecture code (1–47), or city name. ' +
      'Returns matching postcodes with full address in kanji, kana, and romaji, plus coordinates. ' +
      'Useful for address autocomplete, geocoding Japanese locations, and finding all postcodes ' +
      'in a given area. Queries can mix Japanese (kanji/kana) and romaji. ' +
      'Filter by prefecture JIS code (e.g. 13 for Tokyo, 27 for Osaka) or city name in Japanese. ' +
      'Data source: postcode.teraren.com — MIT license, no auth required.',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'postcode-japan.prefectures',
    mcpName: 'postcode-japan.reference.prefectures',
    title: 'Japan Prefecture List',
    description:
      'Get the complete list of all 47 Japanese prefectures with JIS codes, ' +
      'official names in kanji, hiragana, katakana, and English, plus geographic region. ' +
      'Use prefecture codes returned here as the "prefecture" filter in the postcode-japan.postal.search tool. ' +
      'Data source: postcode.teraren.com — MIT license, no auth required.',
    category: 'location',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // JMA Bosai — Japan Meteorological Agency (UC-593, 5 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'jma-bosai.forecast',
    mcpName: 'jma-bosai.weather.forecast',
    title: 'JMA Weather Forecast',
    description:
      'Get the official 3-day weather forecast from the Japan Meteorological Agency (JMA) ' +
      'for a specified area code (prefecture/region). Returns weather descriptions, wind conditions, ' +
      'wave heights, precipitation probability (%), and temperature (°C) per time period. ' +
      'Pass a 6-digit JMA area code (e.g. 130000 for Tokyo, 270000 for Osaka). ' +
      'Use jma-bosai.reference.areas to look up valid area codes. ' +
      'Data: JMA official forecast — Japanese Government open data, no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'jma-bosai.overview',
    mcpName: 'jma-bosai.weather.overview',
    title: 'JMA Weather Overview',
    description:
      'Get the official meteorological overview text from the Japan Meteorological Agency (JMA) ' +
      'for a specified area. Returns a headline and a full narrative weather summary in Japanese ' +
      '(the official JMA text as issued). Useful for understanding the weather situation context ' +
      'beyond just codes and temperatures. ' +
      'Pass a 6-digit JMA area code (e.g. 130000 for Tokyo, 270000 for Osaka). ' +
      'Data: JMA official overview — Japanese Government open data, no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'jma-bosai.warnings',
    mcpName: 'jma-bosai.weather.warnings',
    title: 'JMA Active Weather Warnings',
    description:
      'Get all currently active weather warnings and advisories issued by the Japan Meteorological ' +
      'Agency (JMA) for a specified area. Returns warning codes, statuses (issued / continuing / lifted), ' +
      'and a headline summary. Warning code meanings: 02=Wind, 03=Wave, 04=Thunderstorm, 05=Heavy Rain, ' +
      '06=Windstorm, 10=Tsunami, 12=Snow, 14=Avalanche, 15=Flood, 20=High Wave, etc. ' +
      'Pass a 6-digit JMA area code (e.g. 130000 for Tokyo). ' +
      'Data: JMA official warnings — Japanese Government open data, no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'jma-bosai.earthquakes',
    mcpName: 'jma-bosai.seismic.recent',
    title: 'JMA Recent Earthquakes',
    description:
      'Get the most recent earthquakes reported by the Japan Meteorological Agency (JMA). ' +
      'Returns epicenter name (English and Japanese), magnitude, JMA seismic intensity (Shindo scale 1–7), ' +
      'coordinates, depth (km), and occurrence time in ISO 8601. ' +
      'Filter by minimum magnitude to focus on significant events. ' +
      'JMA Shindo scale: 1=barely felt, 4=hanging objects swing strongly, 5+=damage possible, 7=catastrophic. ' +
      'Complements p2pquake.seismic.recent (community network) with the official government feed. ' +
      'Data: JMA official seismic data — Japanese Government open data, no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'jma-bosai.areas',
    mcpName: 'jma-bosai.reference.areas',
    title: 'JMA Area Reference List',
    description:
      'Get the complete list of Japan Meteorological Agency (JMA) forecast area codes with ' +
      'Japanese and English names. Returns all 58 JMA offices/regions with 6-digit codes needed by ' +
      'jma-bosai.weather.forecast, jma-bosai.weather.overview, and jma-bosai.weather.warnings. ' +
      'Filter by English name keyword (e.g. "tokyo", "osaka") to find the right code. ' +
      'Example codes: 130000=Tokyo, 270000=Osaka, 230000=Aichi (Nagoya), 400000=Fukuoka. ' +
      'Data: JMA area constants — Japanese Government open data, no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'destatis.gdp',
    mcpName: 'destatis.finance.gdp',
    title: 'Germany GDP & National Accounts',
    description:
      'Get German gross domestic product and gross value added from official national accounts ' +
      '(Statistisches Bundesamt GENESIS-Online table 81000-0001). Annual series, nominal and ' +
      'price-adjusted. Filter by startyear/endyear (e.g. 2015-2025). ' +
      'Data: German Federal Statistical Office, DL-DE/BY-2-0 open data licence.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'destatis.population',
    mcpName: 'destatis.reference.population',
    title: 'Germany Population by Reference Date',
    description:
      'Get official German population figures by reference date (Statistisches Bundesamt GENESIS-Online ' +
      'table 12411-0001), including results based on the 2011 and 2022 census. Annual series from 1950. ' +
      'Filter by startyear/endyear. Data: German Federal Statistical Office, DL-DE/BY-2-0 open data licence.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'destatis.prices',
    mcpName: 'destatis.finance.cpi',
    title: 'Germany Consumer Price Index',
    description:
      'Get the official German consumer price index and annual change (Statistisches Bundesamt ' +
      'GENESIS-Online table 61111-0001), base year 2020=100. Filter by startyear/endyear. ' +
      'Data: German Federal Statistical Office, DL-DE/BY-2-0 open data licence.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'destatis.trade',
    mcpName: 'destatis.finance.trade',
    title: 'Germany Foreign Trade (Exports/Imports)',
    description:
      'Get official German foreign trade statistics — export and import net mass and value, ' +
      'including value in US dollars (Statistisches Bundesamt GENESIS-Online table 51000-0001). ' +
      'Annual series from 1950. Filter by startyear/endyear. ' +
      'Data: German Federal Statistical Office, DL-DE/BY-2-0 open data licence.',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // ECB Data Portal — official Statistical Data Warehouse (UC-595, 4 tools)
  // Distinct from finance.ecb_rates (Frankfurter-mirrored exchange rates, UC-016):
  // this is the ECB's own SDMX-JSON API covering monetary policy + macro series.
  {
    toolId: 'ecb-rates.key_rates',
    mcpName: 'ecb-rates.policy.key_rates',
    title: 'ECB Key Interest Rates',
    description:
      'Get official European Central Bank key interest rates: the deposit facility rate ' +
      '(rate banks earn on overnight deposits with the Eurosystem), main refinancing rate (MRO), ' +
      'or marginal lending facility rate (overnight borrowing rate). Daily series. ' +
      'Filter by rate_type, and either last_n_observations or start_period/end_period. ' +
      'Data: ECB Statistical Data Warehouse (data-api.ecb.europa.eu), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ecb-rates.hicp_inflation',
    mcpName: 'ecb-rates.macro.hicp_inflation',
    title: 'Euro Area HICP Inflation Rate',
    description:
      'Get the euro area Harmonised Index of Consumer Prices (HICP) all-items annual rate of ' +
      "change — the ECB's official inflation measure used for its 2% target. Monthly series. " +
      'Filter by last_n_observations or start_period/end_period. ' +
      'Data: ECB Statistical Data Warehouse (data-api.ecb.europa.eu), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ecb-rates.money_supply',
    mcpName: 'ecb-rates.macro.money_supply',
    title: 'Euro Area M3 Money Supply',
    description:
      'Get the euro area M3 monetary aggregate — outstanding amount at end of period, working-day ' +
      'and seasonally adjusted, in EUR. M3 is the broad money supply measure the ECB monitors ' +
      'as a reference value for monetary policy. Monthly series. ' +
      'Filter by last_n_observations or start_period/end_period. ' +
      'Data: ECB Statistical Data Warehouse (data-api.ecb.europa.eu), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ecb-rates.yield_curve',
    mcpName: 'ecb-rates.macro.yield_curve',
    title: 'Euro Area Government Bond Yield Curve',
    description:
      'Get the euro area AAA-rated government bond spot yield curve rate for a given maturity ' +
      '(1, 5, 10, or 30 years). Business-day series used as a euro area risk-free benchmark. ' +
      'Filter by tenor_years, and either last_n_observations or start_period/end_period. ' +
      'Data: ECB Statistical Data Warehouse (data-api.ecb.europa.eu), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // --- UC-596: INE (Instituto Nacional de Estadística, Spain) — 4 tools ---
  // Official Spanish national statistics API (servicios.ine.es/wstempus), no auth.
  {
    toolId: 'ine.operations',
    mcpName: 'ine.reference.operations',
    title: 'INE Statistical Operations',
    description:
      'Search or list Spanish INE (national statistics institute) statistical operations — ' +
      'the top-level catalog of official series like IPC (Consumer Price Index), EPA (Labour ' +
      'Force Survey), or population census. Filter by name/code with query, or omit to list ' +
      'all ~110 available operations. Use the returned operation code with ine.tables. ' +
      'Data: servicios.ine.es (INE Tempus3 API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ine.tables',
    mcpName: 'ine.reference.tables',
    title: 'INE Tables for an Operation',
    description:
      'List the published data tables for a Spanish INE statistical operation (e.g. "IPC", ' +
      '"EPA"), including periodicity, publication name, and start period. Use an operation_code ' +
      'from ine.operations. Data: servicios.ine.es (INE Tempus3 API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ine.series_metadata',
    mcpName: 'ine.series.metadata',
    title: 'INE Series Metadata',
    description:
      'Get metadata for a Spanish INE time series by its series_code — name, decimals, ' +
      'periodicity (monthly/quarterly/annual), parent operation, and publication. ' +
      'Data: servicios.ine.es (INE Tempus3 API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ine.series_data',
    mcpName: 'ine.series.data',
    title: 'INE Series Data',
    description:
      'Get observation values for a Spanish INE time series by its series_code — e.g. IPC206449 ' +
      'for the national CPI monthly change. Filter by last_n (most recent N observations, ' +
      'default 10, max 100) or a start_date/end_date range (YYYYMMDD). Values include the ' +
      'period label, year, and whether the observation is provisional or final. ' +
      'Data: servicios.ine.es (INE Tempus3 API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // --- UC-602: INE Chile (Instituto Nacional de Estadísticas, Chile SIMEL) — 3 tools ---
  // Official Chilean labour-market statistics SDMX REST API (sdmx.ine.gob.cl), no auth.
  {
    toolId: 'ine-chile.dataflows',
    mcpName: 'ine-chile.reference.dataflows',
    title: 'INE Chile SIMEL Dataflows',
    description:
      'Search or list Chilean SIMEL (labour-market information system) dataflows — the ~204 ' +
      'official indicator series covering employment, unemployment, wages, pensions, and gender ' +
      'gaps, split by demographic and geographic breakdowns. Filter by name/id with query, or ' +
      'omit to list all. Use the returned dataflow_id with ine-chile.structure and ine-chile.data. ' +
      'Data: sdmx.ine.gob.cl (INE Chile SDMX API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ine-chile.structure',
    mcpName: 'ine-chile.reference.structure',
    title: 'INE Chile SIMEL Dataflow Structure',
    description:
      'Get the dimensions and valid codes for a Chilean SIMEL dataflow_id (e.g. "DF_NOCU_SEXO") ' +
      '— area, frequency, indicator, and breakdown dimensions (sex, age, region, etc.) each with ' +
      'their code list. Use this to interpret the dimension labels returned by ine-chile.data. ' +
      'Data: sdmx.ine.gob.cl (INE Chile SDMX API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ine-chile.data',
    mcpName: 'ine-chile.series.data',
    title: 'INE Chile SIMEL Dataflow Data',
    description:
      'Get observation values for a Chilean SIMEL dataflow_id (e.g. "DF_NOCU_SEXO" for employed ' +
      'persons by sex). Filter by last_n_observations (most recent N per series, default 10, ' +
      'max 100) or a start_period/end_period range (e.g. "2020", "2020-01"). Each series is ' +
      'labeled with its dimension values (sex, region, etc.) and a list of period/value pairs. ' +
      'Data: sdmx.ine.gob.cl (INE Chile SDMX API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // --- UC-597: CrossRef — 4 tools ---
  // Official scholarly metadata registry API (api.crossref.org), no auth.
  {
    toolId: 'crossref.works_search',
    mcpName: 'crossref.works.search',
    title: 'CrossRef Works Search',
    description:
      'Search 150M+ scholarly works (journal articles, books, conference papers, datasets) by ' +
      'title, author, or full text. Returns DOI, title, authors, publisher, container (journal/book) ' +
      'title, published date, citation count, and abstract. Complements education.doi_lookup ' +
      '(which resolves a single known DOI) by letting agents discover DOIs from a text query. ' +
      'Data: api.crossref.org (CrossRef REST API), no auth required, CC0 metadata.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'crossref.journal_lookup',
    mcpName: 'crossref.journals.lookup',
    title: 'CrossRef Journal Lookup',
    description:
      'Get metadata for an academic journal by its ISSN — title, publisher, subject areas, and ' +
      "DOI coverage counts (current, backfile, total). Useful for verifying a journal's publisher " +
      'or gauging its publication volume. Data: api.crossref.org (CrossRef REST API), no auth required.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'crossref.funder_search',
    mcpName: 'crossref.funders.search',
    title: 'CrossRef Funder Search',
    description:
      'Search the CrossRef Funder Registry (open registry of ~30K research funding organizations, ' +
      'based on the Funder Registry / ROR data) by name. Returns funder ID (DOI-based), canonical ' +
      'and alternate names, location, and URI — used to trace grant funding acknowledged in ' +
      'published papers. Data: api.crossref.org (CrossRef REST API), no auth required.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'crossref.member_search',
    mcpName: 'crossref.members.search',
    title: 'CrossRef Member/Publisher Search',
    description:
      'Search the CrossRef member registry (17K+ registered publishers and societies) by name. ' +
      'Returns member ID, primary name, location, DOI prefixes, and DOI coverage counts. Useful for ' +
      "identifying a publisher's CrossRef member ID or checking publication volume. " +
      'Data: api.crossref.org (CrossRef REST API), no auth required.',
    category: 'education',
    annotations: READ_ONLY,
  },

  // --- UC-598: Unpaywall — 1 tool ---
  // Open-access full-text finder API (api.unpaywall.org), no auth (courtesy contact email only).
  {
    toolId: 'unpaywall.oa_lookup',
    mcpName: 'unpaywall.oa.lookup',
    title: 'Unpaywall Open-Access Lookup',
    description:
      'Look up the open-access status of a scholarly work by DOI and get a direct link to a free, ' +
      'legal full-text copy if one exists — aggregated from 50K+ publisher and repository sources ' +
      '(institutional repositories, PubMed Central, arXiv, publisher OA pages). Returns oa_status ' +
      '(gold/green/hybrid/bronze/closed), the best OA location (PDF URL, license, host type, version), ' +
      'and all known OA locations. Complements education.doi_lookup and crossref.works_search (which ' +
      'return bibliographic metadata, not full-text availability). Data: api.unpaywall.org, no auth ' +
      'required (an internal contact email is sent per API terms, not a user credential).',
    category: 'education',
    annotations: READ_ONLY,
  },

  // --- UC-599: Wikimedia Commons — 4 tools ---
  // Media archive API (commons.wikimedia.org/w/api.php), no auth (User-Agent identification only).
  {
    toolId: 'wikimedia-commons.search',
    mcpName: 'wikimedia-commons.media.search',
    title: 'Wikimedia Commons Media Search',
    description:
      'Search Wikimedia Commons (100M+ freely-licensed images, audio, and video files) by keyword. ' +
      'Returns matching file titles, page IDs, a stripped text snippet, file size, last-edit timestamp, ' +
      'and the Commons description-page URL. Use wikimedia-commons.file_info afterwards for full ' +
      'license, dimensions, and download URL. Data: commons.wikimedia.org (MediaWiki Action API), no ' +
      'auth required.',
    category: 'media',
    annotations: READ_ONLY,
  },
  {
    toolId: 'wikimedia-commons.file_info',
    mcpName: 'wikimedia-commons.media.info',
    title: 'Wikimedia Commons File Info',
    description:
      'Get full metadata for a specific Wikimedia Commons file by title (e.g. "File:Example.jpg"): ' +
      'direct download URL, dimensions, size, MIME type, description, artist/credit, license name and ' +
      'URL, capture date, and category list. Use after wikimedia-commons.search or ' +
      'wikimedia-commons.category_files to resolve a title into a usable, licensed download link. ' +
      'Data: commons.wikimedia.org (MediaWiki Action API), no auth required.',
    category: 'media',
    annotations: READ_ONLY,
  },
  {
    toolId: 'wikimedia-commons.category_files',
    mcpName: 'wikimedia-commons.media.category',
    title: 'Wikimedia Commons Category Files',
    description:
      'List media files inside a Wikimedia Commons category (e.g. "Category:Eiffel Tower"), with a ' +
      'pagination cursor for large categories. Returns file titles, page IDs, and description-page ' +
      'URLs — useful for browsing a curated topic/collection instead of free-text search. Data: ' +
      'commons.wikimedia.org (MediaWiki Action API), no auth required.',
    category: 'media',
    annotations: READ_ONLY,
  },
  {
    toolId: 'wikimedia-commons.random',
    mcpName: 'wikimedia-commons.media.random',
    title: 'Wikimedia Commons Random Media',
    description:
      'Get a random sample of Wikimedia Commons media files (titles, page IDs, and description-page ' +
      'URLs). Useful for discovery, sampling, or "surprise me" style prompts. Data: ' +
      'commons.wikimedia.org (MediaWiki Action API), no auth required.',
    category: 'media',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Standard Ebooks — Free Public-Domain Literature (UC-600, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'standard-ebooks.search',
    mcpName: 'standard-ebooks.books.search',
    title: 'Search Standard Ebooks',
    description:
      'Search the Standard Ebooks catalog of carefully typeset, public-domain ebooks by title, ' +
      'author, or subject keyword. Returns title, author, language, description, subjects, cover ' +
      'image URL, and direct download links (EPUB, advanced EPUB, Kobo Kepub, Kindle AZW3, XHTML). ' +
      'Sortable by newest, author name, reading ease, length, or popularity. Data: ' +
      'standardebooks.org OPDS 2.0 JSON feed, no auth required.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'standard-ebooks.new_releases',
    mcpName: 'standard-ebooks.books.new_releases',
    title: 'Standard Ebooks New Releases',
    description:
      'Get the most recently released Standard Ebooks (up to the latest 15), most-recent first. ' +
      'Returns title, author, publish date, summary, subjects, cover image URL, and direct download ' +
      'links (EPUB, advanced EPUB, Kobo Kepub, Kindle AZW3, XHTML). Data: standardebooks.org Atom ' +
      'feed, no auth required.',
    category: 'education',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // INDEC Georef — Argentina Geographic Reference (UC-603, 5 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'indec-georef.geocode',
    mcpName: 'indec-georef.location.geocode',
    title: 'Geocode Argentine Address',
    description:
      'Forward geocode an Argentine street address (e.g. "Av Corrientes 1000") to matching ' +
      'locations with lat/lon coordinates, street name/number, province, department, and locality. ' +
      'Returns multiple candidates when the address matches more than one place nationwide. Data: ' +
      'apis.datos.gob.ar/georef (INDEC — Instituto Nacional de Estadística y Censos), no auth required.',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'indec-georef.reverse_geocode',
    mcpName: 'indec-georef.location.reverse_geocode',
    title: 'Reverse Geocode Argentine Coordinates',
    description:
      'Reverse geocode a lat/lon coordinate pair within Argentina to its administrative location — ' +
      'province, department, and municipality. Data: apis.datos.gob.ar/georef (INDEC), no auth required.',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'indec-georef.provincias',
    mcpName: 'indec-georef.admin.provinces',
    title: 'List Argentine Provinces',
    description:
      "List or search Argentina's 24 provinces (incl. Ciudad Autónoma de Buenos Aires) by name. " +
      'Returns id, name, and centroid coordinates for each. Data: apis.datos.gob.ar/georef (INDEC), ' +
      'no auth required.',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'indec-georef.departamentos',
    mcpName: 'indec-georef.admin.departments',
    title: 'Search Argentine Departments',
    description:
      "Search Argentina's second-level administrative divisions (departments/partidos) by name, " +
      'optionally scoped to a province. Returns id, name, parent province, and centroid coordinates. ' +
      'Data: apis.datos.gob.ar/georef (INDEC), no auth required.',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'indec-georef.localidades',
    mcpName: 'indec-georef.admin.localities',
    title: 'Search Argentine Localities',
    description:
      'Search Argentine localities (cities/towns) by name, optionally scoped to a province. Returns ' +
      'id, name, category, parent province/department/municipality, and centroid coordinates. Data: ' +
      'apis.datos.gob.ar/georef (INDEC), no auth required.',
    category: 'location',
    annotations: READ_ONLY,
  },
  // EnviroAtlas EPA (3)
  {
    toolId: 'enviroatlas.communities',
    mcpName: 'enviroatlas.communities.list',
    title: 'List EnviroAtlas Pilot Communities',
    description:
      'List or search the 32 US communities covered by EPA EnviroAtlas block-group ecosystem-service ' +
      'data (e.g. "Des Moines, IA", "Chicago, IL"). Returns community code, name, and census block group ' +
      'count for each. Call this first to find valid community codes/names for the other EnviroAtlas ' +
      'tools. Data: enviroatlas.epa.gov (US EPA), no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'enviroatlas.block_group_metrics',
    mcpName: 'enviroatlas.metrics.block_group',
    title: 'Get Block-Group Ecosystem-Service Metrics',
    description:
      'Get EPA EnviroAtlas ecosystem-service and environmental-health metrics for the census block ' +
      'group containing a lat/lon point — tree cover, green space, impervious area, air pollutant ' +
      'removal, carbon storage/sequestration, flood risk, heat reduction, and park/water-view access. ' +
      'Only covers the 32 EPA pilot communities (see enviroatlas.communities); returns covered=false ' +
      'outside them. Data: enviroatlas.epa.gov (US EPA), no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'enviroatlas.community_summary',
    mcpName: 'enviroatlas.metrics.community_summary',
    title: 'Get Community Ecosystem-Service Summary',
    description:
      'Get aggregate EPA EnviroAtlas ecosystem-service statistics across all census block groups in an ' +
      'EnviroAtlas pilot community — average tree cover/impervious/green space percent, total ' +
      'population, total carbon stored and sequestration value, and average flood-risk population ' +
      'percent. Data: enviroatlas.epa.gov (US EPA), no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // Federal Register API (UC-605, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'federalregister.search',
    mcpName: 'federalregister.documents.search',
    title: 'Search Federal Register Documents',
    description:
      'Search official US Federal Register documents (final rules, proposed rules, notices, ' +
      'presidential documents) by full-text term, agency, document type, and publication date range. ' +
      'Returns document number, title, abstract, type, agencies, and links. Data: federalregister.gov ' +
      '(GPO/NARA), no auth required.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'federalregister.document',
    mcpName: 'federalregister.documents.detail',
    title: 'Get Federal Register Document Detail',
    description:
      'Get full detail for a single Federal Register document by its document number — abstract, ' +
      'action, agencies, CFR references, docket IDs, effective date, comment deadline, citation, and ' +
      'links to HTML/PDF/XML full text. Data: federalregister.gov (GPO/NARA), no auth required.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'federalregister.agencies',
    mcpName: 'federalregister.agencies.search',
    title: 'Search Federal Agencies',
    description:
      'Search or list US federal government agencies tracked by the Federal Register (name, short ' +
      'name, slug, parent agency). Use the returned slug to filter federalregister.search by agency. ' +
      'Data: federalregister.gov (GPO/NARA), no auth required.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  {
    toolId: 'federalregister.public_inspection',
    mcpName: 'federalregister.documents.public_inspection',
    title: 'Get Upcoming Public Inspection Documents',
    description:
      'Get documents currently on public inspection at the Federal Register — filed but not yet ' +
      'officially published, available ahead of their scheduled publication date. Optionally filter ' +
      'by agency name. Data: federalregister.gov (GPO/NARA), no auth required.',
    category: 'legal',
    annotations: READ_ONLY,
  },
  // Ensembl (2)
  {
    toolId: 'ensembl.gene_lookup',
    mcpName: 'science.ensembl.gene_lookup',
    title: 'Look Up Gene by Symbol',
    description:
      'Look up a gene by symbol (e.g. "BRCA1", "TP53") in any of 300+ vertebrate and non-vertebrate ' +
      'species. Returns Ensembl gene ID, genomic coordinates, biotype, description, and (optionally) ' +
      'the full list of transcripts with their coordinates. Data: rest.ensembl.org (EMBL-EBI / ' +
      'Wellcome Sanger Institute), no auth required.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ensembl.sequence_region',
    mcpName: 'science.ensembl.sequence_region',
    title: 'Get Genomic Sequence for Region',
    description:
      'Retrieve the raw DNA sequence for a genomic region (e.g. "17:7668402-7687550" on GRCh38). ' +
      'Returns the nucleotide sequence, molecule type, and sequence length. Useful for primer design, ' +
      'variant context, and comparative sequence analysis. Data: rest.ensembl.org (EMBL-EBI / ' +
      'Wellcome Sanger Institute), no auth required.',
    category: 'health',
    annotations: READ_ONLY,
  },
  // CVE Program / MITRE (2)
  {
    toolId: 'cve-mitre.record',
    mcpName: 'cve-mitre.cves.record',
    title: 'Get Canonical CVE Record',
    description:
      'Fetch the full canonical CVE record as published by the assigning CNA (CVE Numbering ' +
      'Authority) in CVE JSON 5.x format — title, description, affected vendor/product/version ' +
      'ranges, CVSS score/vector (if scored), CWE weakness types, and references. This is the ' +
      "authoritative source record; distinct from nvd.cves.detail, which serves NIST's " +
      'downstream-enriched copy (added CPE configurations, NVD-analyst CVSS). Example: ' +
      'CVE-2021-44228 (Log4Shell). Data: cveawg.mitre.org (CVE Program, MITRE Corporation), no auth required.',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cve-mitre.id_status',
    mcpName: 'cve-mitre.cves.id_status',
    title: 'Check CVE ID Reservation Status',
    description:
      "Check a CVE ID's current lifecycle state (RESERVED, PUBLISHED, or REJECTED) and which CNA " +
      'owns/assigned it, even for IDs that have been reserved but have no published record yet. ' +
      'NVD has no equivalent — it only indexes published records. Data: cveawg.mitre.org ' +
      '(CVE Program, MITRE Corporation), no auth required.',
    category: 'developer',
    annotations: READ_ONLY,
  },
  // USGS Mineral Resources Data System (1)
  {
    toolId: 'usgs-mrds.search_by_area',
    mcpName: 'usgs-mrds.deposits.search_by_area',
    title: 'Search Mineral Deposits By Area',
    description:
      'Search the USGS Mineral Resources Data System (MRDS) for mineral deposits, mines, and ' +
      'prospects within a geographic bounding box (min/max latitude and longitude). Returns deposit ' +
      'ID, site name, development status, commodity codes, and precise coordinates — useful for ' +
      'regional mineral exploration and mapping. Data: mrdata.usgs.gov (USGS Mineral Resources ' +
      'Program), no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  // NOAA NCEI Paleoclimatology (2)
  {
    toolId: 'paleoclimate.study_search',
    mcpName: 'paleoclimate.study.search',
    title: 'Search Paleoclimate Studies',
    description:
      'Search NOAA NCEI Paleoclimatology studies by free text, continent/region, and/or record type ' +
      '(ice cores, tree rings, corals, climate reconstructions, paleoceanography, and more). Returns ' +
      'study ID, name, DOI, investigators, year range, and site locations — useful for finding ' +
      'historical climate reconstructions and proxy records. Data: www.ncei.noaa.gov/access/paleo-search ' +
      '(NOAA National Centers for Environmental Information), no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'paleoclimate.study_detail',
    mcpName: 'paleoclimate.study.detail',
    title: 'Get Paleoclimate Study Detail',
    description:
      'Get full detail for a single NOAA NCEI Paleoclimatology study by NOAA Study ID, including ' +
      'investigators, publications, site coordinates, and per-site data tables with direct download ' +
      'links to the underlying proxy data files. Data: www.ncei.noaa.gov/access/paleo-search ' +
      '(NOAA National Centers for Environmental Information), no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  // PLOS Search API (2)
  {
    toolId: 'plos-search.search',
    mcpName: 'plos-search.article.search',
    title: 'Search PLOS Open-Access Articles',
    description:
      'Search the full open-access PLOS research corpus (PLOS ONE, Biology, Medicine, Genetics, ' +
      'Computational Biology, Pathogens, Neglected Tropical Diseases, Global Public Health, Digital ' +
      'Health, Climate, Mental Health, Water, Sustainability and Transformation) by free text or ' +
      'Solr field query, with optional journal filter and sort. Returns DOI, title, journal, authors, ' +
      'abstract, and subjects for each match. Data: api.plos.org, no auth required.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'plos-search.article_detail',
    mcpName: 'plos-search.article.detail',
    title: 'Get PLOS Article Detail',
    description:
      'Get full detail for a single open-access PLOS article by DOI, including title, journal, ' +
      'publication date, authors, abstract, and subject tags. Data: api.plos.org, no auth required.',
    category: 'education',
    annotations: READ_ONLY,
  },
  // NSF Awards Search API (2)
  {
    toolId: 'nsf-awards.search',
    mcpName: 'nsf-awards.grants.search',
    title: 'Search NSF Research Awards',
    description:
      'Search US National Science Foundation funded research awards by keyword, recipient ' +
      'institution name, US state, CFDA program number, and award date range. Returns award ID, ' +
      'title, awardee, principal investigator, dates, funding amount, program, and an abstract ' +
      'excerpt for each match. Data: api.nsf.gov (National Science Foundation), no auth required.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'nsf-awards.award_detail',
    mcpName: 'nsf-awards.grants.detail',
    title: 'Get NSF Award Detail',
    description:
      'Get full detail for a single NSF research award by award ID, including the complete ' +
      'abstract, principal investigator and co-PI contacts, program officer, directorate/division, ' +
      'funding by fiscal year, and award dates. Data: api.nsf.gov (National Science Foundation), no ' +
      'auth required.',
    category: 'education',
    annotations: READ_ONLY,
  },
  // USGS The National Map (TNM) Access API (2)
  {
    toolId: 'usgs-nationalmap.search_products',
    mcpName: 'usgs-nationalmap.products.search',
    title: 'Search USGS National Map Products',
    description:
      'Search the USGS The National Map product catalog within a bounding box for downloadable ' +
      'geospatial data — topographic maps, elevation/lidar, hydrography, imagery, boundaries, and ' +
      'structures. Optional keyword, dataset name, and file format filters. Returns title, format, ' +
      'file size, publication date, and direct download URL for each match. Data: ' +
      'tnmaccess.nationalmap.gov (USGS National Geospatial Program), no auth required.',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'usgs-nationalmap.list_datasets',
    mcpName: 'usgs-nationalmap.products.list_datasets',
    title: 'List USGS National Map Datasets',
    description:
      'List the geospatial dataset collections available from The National Map (e.g. US Topo, ' +
      '3D Elevation Program, Hydrography, Imagery, National Structures), with category, refresh ' +
      'cycle, available formats, and info URL for each. Use dataset titles from this tool as the ' +
      '`datasets` filter for usgs-nationalmap.search_products. Data: tnmaccess.nationalmap.gov ' +
      '(USGS National Geospatial Program), no auth required.',
    category: 'location',
    annotations: READ_ONLY,
  },
  // SEC EDGAR company facts API (3)
  {
    toolId: 'sec-edgar.company_lookup',
    mcpName: 'sec-edgar.company.lookup',
    title: 'Look Up SEC-Registered Company',
    description:
      'Resolve a stock ticker symbol (exact match) or company name substring to a SEC Central ' +
      'Index Key (CIK) — the identifier required by all other sec-edgar tools. Returns matching ' +
      'company name, ticker, and CIK. Data: www.sec.gov (US Securities and Exchange Commission ' +
      'EDGAR system), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sec-edgar.filings',
    mcpName: 'sec-edgar.filings.list',
    title: 'Get SEC Company Filings',
    description:
      "Get a company's recent SEC filings (10-K annual reports, 10-Q quarterly reports, 8-K " +
      'current reports, proxy statements, insider transaction forms, etc.) plus basic entity ' +
      'profile — legal name, SIC industry classification, exchanges, fiscal year end. Optional ' +
      'filter by form type. Each filing includes filing date, accession number, and a direct ' +
      'document URL. Requires a CIK from sec-edgar.company_lookup. Data: data.sec.gov (US ' +
      'Securities and Exchange Commission EDGAR system), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'sec-edgar.financial_concept',
    mcpName: 'sec-edgar.financials.concept',
    title: 'Get SEC XBRL Financial Concept',
    description:
      'Get the historical time series for a single standardized XBRL financial concept ' +
      '(e.g. Assets, Liabilities, Revenues, NetIncomeLoss, StockholdersEquity) as reported by a ' +
      'company across its SEC filings — one value per fiscal period with the filing it came from. ' +
      'Sourced directly from structured XBRL data extracted from 10-K/10-Q filings, not free text. ' +
      'Requires a CIK from sec-edgar.company_lookup. Data: data.sec.gov (US Securities and Exchange ' +
      'Commission EDGAR system), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  // USGS Elevation Point Query Service (UC-613)
  {
    toolId: 'usgs-epqs.elevation',
    mcpName: 'usgs-epqs.elevation.point',
    title: 'USGS Elevation Point Query',
    description:
      'Get ground surface elevation for a single latitude/longitude coordinate from the USGS 3D ' +
      'Elevation Program (3DEP) — the authoritative US Government digital elevation model, with ' +
      'resolution as fine as 1 meter in many areas. Returns elevation in meters or feet, the ' +
      'source raster resolution, and optionally the DEM acquisition date. Continental US + ' +
      'territories only (no ocean or international coverage). Data: epqs.nationalmap.gov (USGS ' +
      '3D Elevation Program), no auth required.',
    category: 'location',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // CFPB Consumer Complaint Database API (UC-614, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'cfpb-complaints.search',
    mcpName: 'cfpb-complaints.complaints.search',
    title: 'Search CFPB Consumer Complaints',
    description:
      'Search the US Consumer Financial Protection Bureau public complaint database of 17M+ ' +
      'consumer complaints against financial companies (banks, credit reporting agencies, debt ' +
      'collectors, lenders). Filter by product, company, US state, issue, company response, ' +
      'timeliness, whether a narrative was provided, and date range, or full-text search consumer ' +
      'narratives. Returns complaint records with product/issue category, company, state, dates, and ' +
      'company response. Data: consumerfinance.gov (CFPB), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cfpb-complaints.trends',
    mcpName: 'cfpb-complaints.complaints.trends',
    title: 'CFPB Consumer Complaint Volume Trends',
    description:
      'Get the time-series trend of CFPB consumer complaint volume — weekly, monthly, or yearly ' +
      'buckets — optionally filtered by product, company, or US state, and optionally broken down ' +
      '(e.g. by sub-product or issue when a lens is specified). Useful for spotting spikes in ' +
      'complaints against a company or product over time. Data: consumerfinance.gov (CFPB), no auth ' +
      'required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'cfpb-complaints.geo_states',
    mcpName: 'cfpb-complaints.complaints.by_state',
    title: 'CFPB Consumer Complaints by US State',
    description:
      'Get per-US-state consumer complaint counts from the CFPB complaint database, with each ' +
      "state's top complaint products and issues, optionally filtered by date range, product, or " +
      'company. Useful for geographic analysis of consumer financial complaints. Data: ' +
      'consumerfinance.gov (CFPB), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // EMSC FDSN Event Web Service (UC-615, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'emsc.search_earthquakes',
    mcpName: 'emsc.seismic.search',
    title: 'Search EMSC Real-Time Earthquakes',
    description:
      'Search the European-Mediterranean Seismological Centre (EMSC) real-time seismicity catalog ' +
      '(EMSC-RTS) by time range, bounding box or point+radius, magnitude range, and depth range. ' +
      'A distinct regional network from USGS, often lower-latency for Euro-Mediterranean events, ' +
      'with per-event reporting-agency attribution. Returns event ID, time, magnitude, location, ' +
      'depth, region name, and reporting agency for each match. Data: seismicportal.eu (EMSC), no ' +
      'auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'emsc.event_detail',
    mcpName: 'emsc.seismic.event_detail',
    title: 'Get EMSC Earthquake Event Detail',
    description:
      'Get full detail for a single earthquake event from the EMSC real-time seismicity catalog by ' +
      'its event ID (unid), as returned by emsc.search_earthquakes. Optionally include all reported ' +
      'magnitude estimates and origin solutions, not just the preferred ones. Data: seismicportal.eu ' +
      '(EMSC), no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // Current UV Index API (UC-616, 1 tool)
  // ---------------------------------------------------------------------------
  {
    toolId: 'currentuvindex.uv_index',
    mcpName: 'currentuvindex.weather.uv_index',
    title: 'Get Current UV Index and Forecast',
    description:
      'Get the current UV Index, an hourly forecast for the next ~120 hours, and up to 24 hours of ' +
      'recent history for any latitude/longitude worldwide. Each data point includes a WHO/EPA risk ' +
      'category (Low, Moderate, High, Very High, Extreme). Also returns the peak forecasted UV Index ' +
      'and when it occurs. Data: currentuvindex.com, CC BY 4.0 license, no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // GUS Poland BDL / Bank Danych Lokalnych API (UC-617, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'gus-poland.subjects',
    mcpName: 'gus-poland.reference.subjects',
    title: 'Browse GUS Poland BDL Subject Tree',
    description:
      "Browse the topic hierarchy of Poland's official Local Data Bank (Bank Danych Lokalnych, " +
      'GUS statistics office) — prices, demography, finance, environment, labour market, and more. ' +
      'Omit parent_id to list the 33 root topics, or pass a parent_id to list its children. Leaf ' +
      'subjects (has_variables=true) can be passed to gus-poland.variables. Data: bdl.stat.gov.pl ' +
      '(GUS BDL API v1), no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'gus-poland.variables',
    mcpName: 'gus-poland.reference.variables',
    title: 'Search GUS Poland BDL Variables',
    description:
      'Search for Polish official statistical variables by keyword (e.g. "population", ' +
      '"unemployment", "average salary"), or list all variables under a subject_id from ' +
      "gus-poland.subjects. Returns each variable's numeric variable_id and measurement unit, " +
      'for use with gus-poland.data. Data: bdl.stat.gov.pl (GUS BDL API v1), no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'gus-poland.data',
    mcpName: 'gus-poland.series.data',
    title: 'Get GUS Poland BDL Statistical Data',
    description:
      'Get statistical values for a variable_id from gus-poland.variables, broken down by ' +
      'territorial unit. Use unit_level (0=Poland, 1=macroregion, 2=voivodeship, 3=region, ' +
      '4=subregion, 5=powiat, 6=gmina, 7=locality; default 2) to get all units at that level, or ' +
      'a specific unit_id (12-digit TERYT code, e.g. "000000000000" for all of Poland) for one ' +
      "unit's full series. Optionally filter by year(s). Data: bdl.stat.gov.pl (GUS BDL API v1), " +
      'no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // iNaturalist API (UC-620, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'inaturalist.taxa_search',
    mcpName: 'inaturalist.taxa.search',
    title: 'Search iNaturalist Species and Taxa',
    description:
      'Look up a species or other taxon by common or scientific name, e.g. "monarch butterfly" or ' +
      '"Quercus". Returns matching taxa with their taxon_id (for use with ' +
      'inaturalist.observations_search and inaturalist.species_counts), taxonomic rank, common name, ' +
      'total observation count, extinct/threatened flags, and a reference photo. Data: ' +
      'iNaturalist.org global citizen-science community, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'inaturalist.observations_search',
    mcpName: 'inaturalist.observations.search',
    title: 'Search iNaturalist Wildlife Observations',
    description:
      'Search real-world wildlife sightings logged by the iNaturalist community, filterable by ' +
      'species (taxon_name or taxon_id), place (place_id from inaturalist.places_search), a ' +
      'lat/lng radius, date range, and data quality grade (research/needs_id/casual). Returns each ' +
      "observation's species guess, taxon info, observed date, location, observer, and photo. Data: " +
      'iNaturalist.org global citizen-science community, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'inaturalist.species_counts',
    mcpName: 'inaturalist.observations.species_counts',
    title: 'Get Most-Observed Species in a Place',
    description:
      'Get a biodiversity summary for a place (place_id from inaturalist.places_search): the ' +
      'species most frequently observed there, ranked by observation count, optionally filtered to ' +
      'a taxon group (e.g. only birds) and/or a date range. Useful for surveying local wildlife or ' +
      'flora. Data: iNaturalist.org global citizen-science community, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'inaturalist.places_search',
    mcpName: 'inaturalist.places.search',
    title: 'Search iNaturalist Places',
    description:
      'Look up an iNaturalist place_id by name, e.g. "Berlin" or "Yellowstone National Park", for ' +
      'use with inaturalist.observations_search and inaturalist.species_counts. Returns matching ' +
      'places with their place_id, display name, and place type (e.g. town, county, park). Data: ' +
      'iNaturalist.org global citizen-science community, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // Figshare API (UC-621, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'figshare.search',
    mcpName: 'figshare.articles.search',
    title: 'Search Figshare Research Articles',
    description:
      "Search Figshare's open research repository for datasets, figures, papers, preprints, " +
      'media, and other research outputs, e.g. "soil moisture" or "gene expression". Filter by ' +
      'free-text query, exact DOI, or research output type (dataset, figure, journal_contribution, ' +
      "preprint, thesis, software, etc.), sorted by publication date. Returns each article's id " +
      '(for use with figshare.article_details), title, DOI, item type, publish date, and URL. Data: ' +
      'Figshare.com, CC-licensed research outputs, no auth required.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'figshare.article_details',
    mcpName: 'figshare.articles.details',
    title: 'Get Figshare Article Details',
    description:
      'Get full metadata for a Figshare research article by its article_id (from figshare.search): ' +
      'description, citation, authors with ORCID IDs, tags, subject categories, license, version, ' +
      'publish/modified dates, and downloadable files with direct download URLs, sizes, and MIME ' +
      'types. Data: Figshare.com, CC-licensed research outputs, no auth required.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'figshare.categories',
    mcpName: 'figshare.taxonomy.categories',
    title: 'Browse Figshare Subject Categories',
    description:
      'Browse or search Figshare\'s subject taxonomy (2000+ categories, e.g. "Ecohydrology", ' +
      '"Agricultural biotechnology") used to classify research articles. Optionally filter by a ' +
      'free-text title query. Returns category id, title, parent_id, and taxonomy path — useful ' +
      'for understanding how Figshare organizes research by subject area. Data: Figshare.com, no ' +
      'auth required.',
    category: 'education',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // OpenAIRE Graph API (UC-622, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'openaire.search',
    mcpName: 'openaire.products.search',
    title: 'Search OpenAIRE Research Products',
    description:
      'Search the OpenAIRE Graph — a research-literature graph aggregating metadata from ' +
      'thousands of repositories, journals, and archives worldwide — for publications, datasets, ' +
      'software, and other research outputs, e.g. "climate change adaptation" or "CRISPR gene ' +
      'editing". Filter by free-text query and/or output type. Returns each product\'s id (for use ' +
      'with openaire.product_details), title, authors, publication date, publisher, language, open ' +
      'access status, and DOI. Data: OpenAIRE Graph API, EU-funded open science infrastructure, no ' +
      'auth required.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'openaire.product_details',
    mcpName: 'openaire.products.details',
    title: 'Get OpenAIRE Research Product Details',
    description:
      'Get full metadata for an OpenAIRE research product by its product_id (from ' +
      'openaire.search): title, description, full author list, publication date, publisher, ' +
      'language, best open access right, source repositories, and persistent identifiers (DOIs). ' +
      'Data: OpenAIRE Graph API, EU-funded open science infrastructure, no auth required.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'openaire.project_search',
    mcpName: 'openaire.projects.search',
    title: 'Search OpenAIRE Research Projects',
    description:
      'Search OpenAIRE for funded research projects by free-text query across title, acronym, ' +
      'and keywords, e.g. "renewable energy" or "H2020". Returns project code, acronym, title, ' +
      'website, start/end dates, call identifier, keywords, summary, and funder details (funding ' +
      'body, jurisdiction, funding stream). Data: OpenAIRE Graph API, EU-funded open science ' +
      'infrastructure, no auth required.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'openaire.organization_search',
    mcpName: 'openaire.organizations.search',
    title: 'Search OpenAIRE Research Organizations',
    description:
      'Search OpenAIRE for research organizations (universities, funders, institutes) by legal ' +
      'or alternative name, e.g. "CERN" or "University of Oxford". Returns organization id, legal ' +
      'name, short name, alternative names, website, and country. Data: OpenAIRE Graph API, ' +
      'EU-funded open science infrastructure, no auth required.',
    category: 'education',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // GEBCO Bathymetry (UC-623, 2 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'gebco.elevation_point',
    mcpName: 'gebco.elevation.point',
    title: 'Get GEBCO Point Elevation',
    description:
      'Get the seafloor depth or land elevation at a single latitude/longitude point from the ' +
      'GEBCO global bathymetric grid (General Bathymetric Chart of the Oceans, IHO/IOC Seabed ' +
      '2030 project). Returns elevation in meters relative to sea level — negative for ocean ' +
      'depth, positive for land height, e.g. -5943 near the Mariana Trench or 2947 in the ' +
      'Himalayan foothills. Optionally query "sub_ice_topo" to get bedrock topography beneath ' +
      'Antarctic/Greenland ice sheets instead of the ice surface. Data: GEBCO WMS, public domain, ' +
      'no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'gebco.elevation_profile',
    mcpName: 'gebco.elevation.profile',
    title: 'Get GEBCO Elevation Profile',
    description:
      'Get seafloor depth or land elevation for up to 15 latitude/longitude points in one call ' +
      'from the GEBCO global bathymetric grid — useful for building a depth/elevation profile ' +
      'along a route or transect (e.g. a shipping lane or hiking trail). Returns elevation in ' +
      'meters relative to sea level for each point, in the same order as the input. Optionally ' +
      'query "sub_ice_topo" to get bedrock topography beneath ice sheets instead of the ice ' +
      'surface. Data: GEBCO WMS, public domain, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // EBI Metagenomics / MGnify API (UC-624, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'ebi-metagenomics.study_search',
    mcpName: 'ebi-metagenomics.studies.search',
    title: 'Search MGnify Metagenomic Studies',
    description:
      "Search EBI's MGnify metagenomics archive for studies by free-text query (name/abstract/" +
      'bioproject) and/or biome lineage (e.g. "root:Host-associated:Human"). Returns each study\'s ' +
      'accession, name, abstract, bioproject, sequencing centre, sample count, last-update date, and ' +
      'associated biome lineages. Data: EMBL-EBI MGnify (www.ebi.ac.uk/metagenomics), no auth required.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ebi-metagenomics.study_detail',
    mcpName: 'ebi-metagenomics.studies.detail',
    title: 'Get MGnify Study Detail',
    description:
      'Get full detail for one MGnify study by its accession (e.g. "MGYS00006862") from ' +
      'ebi-metagenomics.study_search: study name, abstract, bioproject, secondary accession, ' +
      'sequencing centre, sample count, privacy/release status, data origination, and biome ' +
      'lineages. Data: EMBL-EBI MGnify (www.ebi.ac.uk/metagenomics), no auth required.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ebi-metagenomics.sample_list',
    mcpName: 'ebi-metagenomics.samples.list',
    title: 'List Samples for a MGnify Study',
    description:
      'List the biological samples belonging to a MGnify study (study_accession from ' +
      "ebi-metagenomics.study_search or ebi-metagenomics.study_detail). Returns each sample's " +
      'accession, name, description, BioSample ID, latitude/longitude, geographic location, ' +
      'collection date, environment biome/feature/material, host taxon ID, species, and metadata ' +
      'key/value pairs. Data: EMBL-EBI MGnify (www.ebi.ac.uk/metagenomics), no auth required.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ebi-metagenomics.biome_browse',
    mcpName: 'ebi-metagenomics.biomes.browse',
    title: 'Browse MGnify Biome Classification Tree',
    description:
      "Browse MGnify's environment classification tree starting at a given lineage — returns the " +
      'queried biome plus every descendant beneath it (not just immediate children), e.g. lineage ' +
      '"root" for the entire tree or "root:Host-associated" for just that subtree. Returns each ' +
      "biome's lineage, name, and sample count — use the returned lineage as the biome_lineage " +
      'filter in ebi-metagenomics.study_search. Data: EMBL-EBI MGnify (www.ebi.ac.uk/metagenomics), ' +
      'no auth required.',
    category: 'health',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // IMF DataMapper API (UC-434, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'imf.gdp_growth',
    mcpName: 'imf.macro.gdp_growth',
    title: 'Get IMF Real GDP Growth',
    description:
      'Get real GDP growth rate (annual percent change) from the IMF World Economic Outlook (WEO) ' +
      'for one or more countries, including IMF forward projections. Filter by ISO 3166-1 alpha-3 ' +
      'country code(s) and/or a year range; omit filters to get all 190+ countries plus regional/' +
      'income-group aggregates. Data: IMF DataMapper (www.imf.org), CC BY 4.0, no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'imf.inflation',
    mcpName: 'imf.macro.inflation',
    title: 'Get IMF Inflation Rate',
    description:
      'Get inflation rate (average consumer prices, annual percent change) from the IMF World ' +
      'Economic Outlook (WEO) for one or more countries, including IMF forward projections. Filter ' +
      'by ISO 3166-1 alpha-3 country code(s) and/or a year range; omit filters to get all 190+ ' +
      'countries plus regional/income-group aggregates. Data: IMF DataMapper (www.imf.org), CC BY ' +
      '4.0, no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'imf.fiscal_balance',
    mcpName: 'imf.macro.fiscal_balance',
    title: 'Get IMF Government Fiscal Balance',
    description:
      'Get general government net lending/borrowing (fiscal balance, percent of GDP) from the IMF ' +
      'World Economic Outlook (WEO) for one or more countries, including IMF forward projections. ' +
      'Filter by ISO 3166-1 alpha-3 country code(s) and/or a year range; omit filters to get all ' +
      '190+ countries plus regional/income-group aggregates. Data: IMF DataMapper (www.imf.org), ' +
      'CC BY 4.0, no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'imf.current_account',
    mcpName: 'imf.macro.current_account',
    title: 'Get IMF Current Account Balance',
    description:
      'Get current account balance (percent of GDP) from the IMF World Economic Outlook (WEO) for ' +
      'one or more countries, including IMF forward projections. Filter by ISO 3166-1 alpha-3 ' +
      'country code(s) and/or a year range; omit filters to get all 190+ countries plus regional/' +
      'income-group aggregates. Data: IMF DataMapper (www.imf.org), CC BY 4.0, no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // ECDC COVID-19 Surveillance (UC-625, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'ecdc-surveillance.cases_deaths',
    mcpName: 'ecdc-surveillance.covid.cases_deaths',
    title: 'Get ECDC COVID-19 Cases & Deaths',
    description:
      'Get historical weekly COVID-19 case and death counts by country from ECDC (European Centre ' +
      'for Disease Prevention and Control) TESSy surveillance data. Filter by country name or ISO3 ' +
      'code, optionally by indicator (cases/deaths) and ISO week. Covers 2020-W01 through 2023-W47 ' +
      'only — ECDC discontinued routine COVID-19 reporting in December 2023, so this reflects the ' +
      'final frozen historical dataset, not live surveillance. Data: ECDC opendata, CC BY 4.0, no auth required.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ecdc-surveillance.testing_rate',
    mcpName: 'ecdc-surveillance.covid.testing_rate',
    title: 'Get ECDC COVID-19 Testing Rate',
    description:
      'Get historical weekly COVID-19 testing volume and positivity rate by country from ECDC TESSy ' +
      'surveillance data. Filter by country name or ISO2 code, optionally by ISO week. Covers ' +
      '2020-W01 through 2023-W47 only — ECDC discontinued routine COVID-19 reporting in December ' +
      '2023, so this reflects the final frozen historical dataset, not live surveillance. Data: ECDC ' +
      'opendata, CC BY 4.0, no auth required.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ecdc-surveillance.hospital_icu',
    mcpName: 'ecdc-surveillance.covid.hospital_icu',
    title: 'Get ECDC COVID-19 Hospital & ICU Rates',
    description:
      'Get historical daily hospital/ICU occupancy and weekly new admission rates per 100k for ' +
      'COVID-19 by country from ECDC surveillance data. Filter by country name, optionally by one of ' +
      'four indicators (daily hospital occupancy, daily ICU occupancy, weekly hospital admissions per ' +
      '100k, weekly ICU admissions per 100k). Covers 2020-W01 through 2023-W47 only — ECDC ' +
      'discontinued routine COVID-19 reporting in December 2023, so this reflects the final frozen ' +
      'historical dataset, not live surveillance. Data: ECDC opendata, CC BY 4.0, no auth required.',
    category: 'health',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // transport.rest — Berlin/Brandenburg Public Transit (UC-626, 4 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'transport-rest.location_search',
    mcpName: 'transport-rest.transit.search_locations',
    title: 'Search Transit Stops & Addresses',
    description:
      'Search for public transit stops/stations, addresses, or points of interest in Berlin/' +
      'Brandenburg by name (e.g. "Alexanderplatz"). Returns location IDs and coordinates to use with ' +
      'departures, journey planning, and nearby-stop lookups. Data: v6.bvg.transport.rest (community ' +
      'HAFAS wrapper for BVG), no auth required, 100 req/min.',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'transport-rest.nearby_stops',
    mcpName: 'transport-rest.transit.nearby_stops',
    title: 'Find Nearby Transit Stops',
    description:
      'Find public transit stops/stations near a latitude/longitude coordinate in Berlin/Brandenburg, ' +
      'sorted by walking distance. Useful for "what transit is near this address" queries. Data: ' +
      'v6.bvg.transport.rest (community HAFAS wrapper for BVG), no auth required, 100 req/min.',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'transport-rest.stop_departures',
    mcpName: 'transport-rest.transit.departures',
    title: 'Get Real-Time Stop Departures',
    description:
      'Get real-time upcoming departures (line, direction, platform, delay) for a Berlin/Brandenburg ' +
      'transit stop within a time window. Stop ID comes from transport-rest.transit.search_locations ' +
      'or transport-rest.transit.nearby_stops. Data: v6.bvg.transport.rest (community HAFAS wrapper ' +
      'for BVG), no auth required, 100 req/min.',
    category: 'travel',
    annotations: READ_ONLY,
  },
  {
    toolId: 'transport-rest.journey_search',
    mcpName: 'transport-rest.transit.plan_journey',
    title: 'Plan Transit Journey',
    description:
      'Plan a public transit journey between two Berlin/Brandenburg stops, with leg-by-leg routing ' +
      '(lines, transfers, real-time delays, duration). Stop IDs come from ' +
      'transport-rest.transit.search_locations or transport-rest.transit.nearby_stops. Data: ' +
      'v6.bvg.transport.rest (community HAFAS wrapper for BVG), no auth required, 100 req/min.',
    category: 'travel',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // Meteostat — Weather Station Observations (UC-627, 5 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'meteostat.stations_nearby',
    mcpName: 'meteostat.stations.nearby',
    title: 'Find Nearby Weather Stations',
    description:
      'Find Meteostat weather stations near a latitude/longitude coordinate, sorted by distance. ' +
      'Returns station IDs to use with station_info and the daily/monthly/hourly observation ' +
      'tools. Data: Meteostat open station directory (CC BY 4.0), no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'meteostat.station_info',
    mcpName: 'meteostat.stations.info',
    title: 'Get Weather Station Metadata',
    description:
      'Get metadata for a Meteostat weather station by ID: name, country/region, coordinates, ' +
      'timezone, and the date ranges of available hourly/daily/monthly data. Station ID comes ' +
      'from meteostat.stations_nearby. Data: Meteostat (CC BY 4.0), no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'meteostat.daily_data',
    mcpName: 'meteostat.observations.daily',
    title: 'Get Daily Weather Observations',
    description:
      'Get a full calendar year of daily weather observations (temperature, precipitation, ' +
      'wind, pressure, sunshine, cloud cover) for a Meteostat weather station. Station ID comes ' +
      'from meteostat.stations_nearby. Data: Meteostat, aggregated from national weather ' +
      'services (CC BY 4.0), no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'meteostat.monthly_data',
    mcpName: 'meteostat.observations.monthly',
    title: 'Get Monthly Weather History',
    description:
      'Get the full monthly weather history (mean/min/max temperature, precipitation, pressure, ' +
      'sunshine) for a Meteostat weather station — can span many decades for long-running ' +
      'stations. Station ID comes from meteostat.stations_nearby. Data: Meteostat (CC BY 4.0), ' +
      'no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'meteostat.hourly_data',
    mcpName: 'meteostat.observations.hourly',
    title: 'Get Hourly Weather Observations',
    description:
      'Get hourly weather observations (temperature, humidity, precipitation, wind, pressure, ' +
      'cloud cover, weather condition code) for a Meteostat weather station over a date range of ' +
      'up to 7 days within a single calendar year. Station ID comes from meteostat.stations_nearby. ' +
      'Use meteostat.daily_data for longer time spans. Data: Meteostat (CC BY 4.0), no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },

  // ---------------------------------------------------------------------------
  // Copernicus Data Space Ecosystem — Sentinel Satellite Imagery (UC-628, 3 tools)
  // ---------------------------------------------------------------------------
  {
    toolId: 'copernicus-sentinel.search_scenes',
    mcpName: 'copernicus-sentinel.imagery.search',
    title: 'Search Sentinel Satellite Scenes',
    description:
      'Search the Copernicus Data Space Ecosystem STAC catalog for Sentinel satellite scenes ' +
      'covering an area and date range, with optional maximum cloud cover filter and sort by ' +
      'date or cloudiness. Returns scene IDs, acquisition time, cloud cover, and a quicklook ' +
      'thumbnail URL for each match. Data: ESA/EU Copernicus Sentinel program, public STAC ' +
      'catalog, no auth required.',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'copernicus-sentinel.scene_detail',
    mcpName: 'copernicus-sentinel.imagery.detail',
    title: 'Get Sentinel Scene Metadata',
    description:
      'Get full metadata for one Sentinel satellite scene: acquisition time, footprint, platform, ' +
      'instrument, product type, cloud/snow cover, orbit state, and the list of available spectral ' +
      'band assets plus a public quicklook thumbnail URL. Collection and item_id come from ' +
      'copernicus-sentinel.search_scenes. Data: ESA/EU Copernicus, public STAC catalog, no auth ' +
      'required.',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'copernicus-sentinel.list_collections',
    mcpName: 'copernicus-sentinel.imagery.collections',
    title: 'List Sentinel Imagery Collections',
    description:
      'Browse the Copernicus Data Space Ecosystem STAC catalog of satellite/product collections ' +
      '(Sentinel-1 radar, Sentinel-2 optical, Sentinel-3 ocean/land, Sentinel-5P atmosphere, ' +
      'Sentinel-6 altimetry, plus Copernicus contributing missions and derived land/emergency ' +
      'products), filterable by keyword. Use the returned collection IDs with search_scenes and ' +
      'scene_detail. Data: ESA/EU Copernicus, public STAC catalog, no auth required.',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'oecd-data.dataflows',
    mcpName: 'oecd-data.reference.dataflows',
    title: 'OECD Dataflows',
    description:
      'Search or list OECD statistical dataflows — ~1500 official series across every OECD ' +
      'directorate (national accounts, employment, education, environment, tax, trade, health, ' +
      'social indicators, and more). Filter by name/id with query and/or by directorate with ' +
      'agency_id (e.g. "OECD.SDD.STES"), or omit both to list all (capped to 200 results). Use ' +
      'the returned agency_id + dataflow_id with oecd-data.structure and oecd-data.data. ' +
      'Data: sdmx.oecd.org (OECD SDMX public REST API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'oecd-data.structure',
    mcpName: 'oecd-data.reference.structure',
    title: 'OECD Dataflow Structure',
    description:
      'Get the dimensions and valid codes for an OECD dataflow (agency_id + dataflow_id from ' +
      'oecd-data.dataflows, e.g. "OECD.SDD.STES" + "DSD_STES@DF_CLI" for composite leading ' +
      'indicators) — reference area, frequency, measure, and breakdown dimensions each with their ' +
      'code list. Use this to interpret the dimension labels returned by oecd-data.data, or to ' +
      'build a narrower key filter. Data: sdmx.oecd.org (OECD SDMX public REST API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'oecd-data.data',
    mcpName: 'oecd-data.series.data',
    title: 'OECD Dataflow Data',
    description:
      'Get observation values for an OECD dataflow (agency_id + dataflow_id from ' +
      'oecd-data.dataflows). Optionally narrow with a dot-separated SDMX key (from ' +
      'oecd-data.structure) or fetch all series with the default key "all". Filter by ' +
      'last_n_observations (most recent N per series, default 10, max 100) or a ' +
      'start_period/end_period range (e.g. "2020", "2020-01"). Each series is labeled with its ' +
      'dimension values (country, measure, etc.) and a list of period/value pairs. ' +
      'Data: sdmx.oecd.org (OECD SDMX public REST API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'world-bank-cckp.climate_normal',
    mcpName: 'world-bank-cckp.climate.normal',
    title: 'Climate Historical Normal',
    description:
      'Get the observed historical baseline climatology (1995-2014 average) for a country: mean ' +
      'temperature (tas), max/min temperature (tasmax/tasmin), or precipitation (pr). Choose ' +
      'annual, monthly, or seasonal aggregation. Use "all_countries" or "region_XXX" as country ' +
      'to fetch every country/sub-region in one call. Data: World Bank Climate Change Knowledge ' +
      'Portal (CMIP6 model ensemble), no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'world-bank-cckp.climate_projection',
    mcpName: 'world-bank-cckp.climate.projection',
    title: 'Climate Future Projection',
    description:
      'Get a CMIP6 future climate projection for a country: mean temperature (tas), max/min ' +
      'temperature (tasmax/tasmin), or precipitation (pr), under an SSP emission scenario ' +
      '(ssp126 low / ssp245 intermediate / ssp370 high / ssp585 very high) and a future 20-year ' +
      'window (2020-2039 through 2080-2099). Choose annual, monthly, or seasonal aggregation. ' +
      'Data: World Bank Climate Change Knowledge Portal (CMIP6 model ensemble), no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'world-bank-cckp.extreme_indices',
    mcpName: 'world-bank-cckp.climate.extremes',
    title: 'Climate Extreme Indices',
    description:
      'Get a derived extreme-climate index for a country: hot days over 35C/40C (hd35/hd40), ' +
      'frost days (fd), max consecutive dry/wet days (cdd/cwd), heavy precipitation days over ' +
      '20mm (r20mm), or tropical nights (tr23). Defaults to the 1995-2014 observed baseline ' +
      '(scenario "historical"), or pass an SSP scenario + future period for a projection. ' +
      'Data: World Bank Climate Change Knowledge Portal (CMIP6 model ensemble), no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },

  // geoBoundaries (3)
  {
    toolId: 'geoboundaries.boundary.detail',
    mcpName: 'geoboundaries.boundary.detail',
    title: 'Administrative Boundary Detail',
    description:
      "Get metadata for one country's administrative boundary at a given level: official name, " +
      'admin unit count, area/perimeter stats, source, license, and download URLs for the full ' +
      'GeoJSON, simplified GeoJSON, TopoJSON, and a preview PNG. Levels: ADM0 (country outline), ' +
      'ADM1 (state/province), ADM2 (county/district), ADM3-ADM5 (finer, country-dependent). ' +
      'Geometry is NOT embedded in the response (files can exceed 10MB) — fetch the returned URL ' +
      'directly for the shapes. Data: geoBoundaries (William & Mary geoLab), no auth required.',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geoboundaries.boundary.list_countries',
    mcpName: 'geoboundaries.boundary.list_countries',
    title: 'List Countries At Boundary Level',
    description:
      "List every country's administrative boundary metadata at one level (ADM0 country outline " +
      'by default, or ADM1-ADM5 for finer subdivisions where available): ISO3 code, name, admin ' +
      'unit count, continent/region, and geometry download URLs. Useful for discovering coverage ' +
      'before requesting a single country with geoboundaries.boundary.detail. Data: geoBoundaries ' +
      '(William & Mary geoLab), no auth required.',
    category: 'location',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geoboundaries.boundary.available_levels',
    mcpName: 'geoboundaries.boundary.available_levels',
    title: 'Available Boundary Levels For Country',
    description:
      'Check which administrative levels (ADM0 through ADM5) exist for a given country, with the ' +
      'local admin name and unit count at each available level (e.g. Kenya has ADM0-ADM2 only; ' +
      'France has ADM0-ADM4). Call this before geoboundaries.boundary.detail to avoid requesting ' +
      'a level that does not exist for that country. Data: geoBoundaries (William & Mary geoLab), ' +
      'no auth required.',
    category: 'location',
    annotations: READ_ONLY,
  },

  // Wikimedia Analytics (4)
  {
    toolId: 'wikimedia-analytics.pageviews_aggregate',
    mcpName: 'wikimedia-analytics.pageviews.aggregate',
    title: 'Wikipedia Pageviews Aggregate',
    description:
      'Get total pageview counts for a Wikimedia project (e.g. en.wikipedia, de.wikipedia, ' +
      'commons.wikimedia) over a date range, bucketed daily or monthly. Filter by access method ' +
      '(desktop, mobile-web, mobile-app, or all-access) and traffic agent (user, spider, ' +
      'automated, or all-agents). Data: Wikimedia Analytics REST API (wikimedia.org/api/rest_v1), ' +
      'no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'wikimedia-analytics.pageviews_top',
    mcpName: 'wikimedia-analytics.pageviews.top',
    title: 'Wikipedia Top Viewed Articles',
    description:
      'List the most-viewed articles on a Wikimedia project for a single day, or for a full month ' +
      'with day="all-days". Returns each article title, view count, and rank. Filter by access ' +
      'method (desktop, mobile-web, mobile-app, or all-access). Data: Wikimedia Analytics REST API ' +
      '(wikimedia.org/api/rest_v1), no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'wikimedia-analytics.pageviews_per_article',
    mcpName: 'wikimedia-analytics.pageviews.per_article',
    title: 'Wikipedia Article Pageview History',
    description:
      'Get pageview history for one specific article on a Wikimedia project over a date range, ' +
      'bucketed daily or monthly. Filter by access method and traffic agent. Use after ' +
      'wikimedia-analytics.pageviews_top to track trend history for a discovered article. Data: ' +
      'Wikimedia Analytics REST API (wikimedia.org/api/rest_v1), no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'wikimedia-analytics.edits_aggregate',
    mcpName: 'wikimedia-analytics.edits.aggregate',
    title: 'Wikipedia Edit Count Aggregate',
    description:
      'Get total edit counts for a Wikimedia project over a date range, bucketed daily or ' +
      'monthly. Filter by editor type (anonymous, group-bot, name-bot, user, or ' +
      'all-editor-types) and page type (content, non-content, or all-page-types). Data: Wikimedia ' +
      'Analytics REST API (wikimedia.org/api/rest_v1), no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // Bank of England Statistical Interactive Database (4)
  {
    toolId: 'bank-of-england.bank_rate',
    mcpName: 'bank-of-england.rates.bank_rate',
    title: 'BoE Official Bank Rate',
    description:
      'Daily history of the Bank of England Official Bank Rate (the UK base interest rate ' +
      'set by the Monetary Policy Committee), series IUDBEDR. Returns the most recent N days ' +
      '(default 90, max 1825). Data: Bank of England Statistical Interactive Database ' +
      '(bankofengland.co.uk/boeapps/database), no auth required, UK Open Government Licence v3.0.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bank-of-england.sonia_rate',
    mcpName: 'bank-of-england.rates.sonia',
    title: 'BoE SONIA Overnight Rate',
    description:
      'Daily history of SONIA (Sterling Overnight Index Average), the Bank of England-administered ' +
      'reference rate for unsecured overnight sterling lending, series IUDSOIA. Returns the most ' +
      'recent N days (default 90, max 1825). Data: Bank of England Statistical Interactive Database ' +
      '(bankofengland.co.uk/boeapps/database), no auth required, UK Open Government Licence v3.0.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bank-of-england.money_supply_m4',
    mcpName: 'bank-of-england.money.m4_growth',
    title: 'BoE M4 Money Supply Growth',
    description:
      "Monthly 12-month growth rate of UK M4 money supply (monetary financial institutions' " +
      'sterling M4 liabilities to the private sector), seasonally adjusted, series LPMVQJW. Returns ' +
      'the most recent N months (default 24, max 120). Data: Bank of England Statistical Interactive ' +
      'Database (bankofengland.co.uk/boeapps/database), no auth required, UK Open Government Licence v3.0.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bank-of-england.mortgage_rate_2y_fixed',
    mcpName: 'bank-of-england.rates.mortgage_2y_fixed',
    title: 'BoE 2-Year Fixed Mortgage Rate',
    description:
      'Monthly average quoted UK household interest rate for a 2-year fixed-rate mortgage at 75% ' +
      'loan-to-value, series IUMBV34. Returns the most recent N months (default 24, max 120). Data: ' +
      'Bank of England Statistical Interactive Database (bankofengland.co.uk/boeapps/database), no ' +
      'auth required, UK Open Government Licence v3.0.',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // --- UC-634: CrossRef Data Citations — 3 tools ---
  // Article<->dataset citation-link API (api.crossref.org/beta/datacitations), no auth. Replaced
  // the sunset (2026-04-23) Event Data API. Complements crossref.works_search (bibliographic
  // metadata) with the citation RELATIONSHIP graph between papers and the datasets they cite.
  {
    toolId: 'crossref-datacitations.dataset_citations',
    mcpName: 'crossref-datacitations.citations.to_dataset',
    title: 'CrossRef Papers Citing a Dataset',
    description:
      'Find scholarly works (journal articles, preprints) that cite a given dataset DOI. Returns ' +
      "each citing work's DOI, work type, publisher member ID, and the citation timestamp. Useful " +
      'for measuring dataset reuse/impact or tracing which papers relied on a specific dataset. ' +
      'Data: api.crossref.org/beta/datacitations (CrossRef Data Citations API), no auth required, ' +
      'CC0 metadata, ~5-day delay between deposit and API appearance.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'crossref-datacitations.article_datasets',
    mcpName: 'crossref-datacitations.citations.from_article',
    title: 'CrossRef Datasets Cited by an Article',
    description:
      'Find datasets (Crossref-DOI or DataCite-DOI) cited by a given scholarly work DOI. Returns ' +
      "each cited dataset's DOI, registration agency (Crossref/DataCite), and the citation " +
      'timestamp. Useful for surfacing the underlying data behind a paper for reproducibility or ' +
      'follow-up analysis. Data: api.crossref.org/beta/datacitations (CrossRef Data Citations API), ' +
      'no auth required, CC0 metadata.',
    category: 'education',
    annotations: READ_ONLY,
  },
  {
    toolId: 'crossref-datacitations.recent_citations',
    mcpName: 'crossref-datacitations.citations.browse',
    title: 'CrossRef Recent Data Citation Events',
    description:
      'Browse article-to-dataset citation events by creation-date range and/or publisher member ID, ' +
      'without needing a known DOI. Useful for monitoring newly-deposited data citations from a ' +
      'specific publisher or time window. Data: api.crossref.org/beta/datacitations (CrossRef Data ' +
      'Citations API), no auth required, CC0 metadata, ~5-day delay between deposit and API ' +
      'appearance.',
    category: 'education',
    annotations: READ_ONLY,
  },

  // Wikimedia REST Content API (4)
  {
    toolId: 'wikimedia-rest.page_summary',
    mcpName: 'wikimedia-rest.pages.summary',
    title: 'Wikipedia Page Summary',
    description:
      'Get the intro extract, short description, thumbnail, and canonical article URL for a ' +
      'Wikipedia article by title. Select the language edition with lang (default en, e.g. de, ' +
      'fr, ja). Data: Wikipedia REST API (wikipedia.org/api/rest_v1), no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'wikimedia-rest.search_page',
    mcpName: 'wikimedia-rest.pages.search',
    title: 'Wikipedia Full-Text Search',
    description:
      'Full-text search across Wikipedia article titles and content. Returns matching page ' +
      'titles, highlighted excerpts, short descriptions, and thumbnails, ranked by relevance. ' +
      'Select the language edition with lang (default en). Data: MediaWiki REST API ' +
      '(wikipedia.org/w/rest.php/v1), no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'wikimedia-rest.on_this_day',
    mcpName: 'wikimedia-rest.feed.on_this_day',
    title: 'Wikipedia On This Day',
    description:
      'Get historical events, births, deaths, holidays, or editor-selected highlights that ' +
      'occurred on a given month/day across history, as curated by Wikipedia. Select category ' +
      'with type (births, deaths, events, holidays, selected) and the language edition with ' +
      'lang (default en). Data: Wikipedia REST API (wikipedia.org/api/rest_v1/feed/onthisday), ' +
      'no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'wikimedia-rest.media_list',
    mcpName: 'wikimedia-rest.pages.media_list',
    title: 'Wikipedia Page Media List',
    description:
      'List all images, audio, and video files referenced in a Wikipedia article, with source ' +
      'URLs and gallery/lead-image flags. Select the language edition with lang (default en). ' +
      'Data: Wikipedia REST API (wikipedia.org/api/rest_v1/page/media-list), no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'freetogame.game_list',
    mcpName: 'freetogame.games.list',
    title: 'FreeToGame Game List',
    description:
      'Browse the free-to-play PC and browser game catalog. Filter by platform (pc, browser, ' +
      'all), category/genre (mmorpg, shooter, battle-royale, etc.), and sort order ' +
      '(release-date, popularity, alphabetical, relevance). Returns title, genre, platform, ' +
      'publisher, developer, release date, and profile URL for each game. Data: FreeToGame API ' +
      '(freetogame.com/api), no auth required.',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'freetogame.game_detail',
    mcpName: 'freetogame.games.detail',
    title: 'FreeToGame Game Detail',
    description:
      'Get full details for a single free-to-play game by ID: status, full description, ' +
      'minimum system requirements, and screenshots. Data: FreeToGame API ' +
      '(freetogame.com/api), no auth required.',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'freetogame.filter_by_tag',
    mcpName: 'freetogame.games.filter_by_tag',
    title: 'FreeToGame Filter By Tag',
    description:
      'Filter free-to-play games by a single gameplay/genre tag (e.g. mmorpg, pvp, anime, ' +
      'battle-royale), combined with optional platform and sort order filters. Distinct from ' +
      'game_list category filtering — same tag vocabulary but a dedicated advanced-filter ' +
      'endpoint. Data: FreeToGame API (freetogame.com/api), no auth required.',
    category: 'entertainment',
    annotations: READ_ONLY,
  },
  {
    toolId: 'duckduckgo.instant_answer',
    mcpName: 'duckduckgo.search.instant_answer',
    title: 'DuckDuckGo Instant Answer',
    description:
      'Get a DuckDuckGo Instant Answer digest for a query: Wikipedia-sourced abstract, direct ' +
      'answer (for calculations/conversions/facts), dictionary definition, entity type, and ' +
      'infobox key-value facts when available. Best for quick factual lookups on well-known ' +
      'topics, people, places, and things. Data: DuckDuckGo Instant Answer API ' +
      '(api.duckduckgo.com), no auth required.',
    category: 'search',
    annotations: READ_ONLY,
  },
  {
    toolId: 'duckduckgo.related_topics',
    mcpName: 'duckduckgo.search.related_topics',
    title: 'DuckDuckGo Related Topics',
    description:
      'Get DuckDuckGo related/disambiguation topics for a query — a flattened list of related ' +
      'concepts, categories, or alternate meanings, each with a title and DuckDuckGo link. ' +
      'Useful for exploring ambiguous or broad queries (e.g. a name that maps to multiple ' +
      'people, or a category like "coffee"). Data: DuckDuckGo Instant Answer API ' +
      '(api.duckduckgo.com), no auth required.',
    category: 'search',
    annotations: READ_ONLY,
  },

  // --- UC-638: Humanitarian Data Exchange (HDX) — 4 tools ---
  // Public CKAN Action API (data.humdata.org/api/3/action) run by UN OCHA, no auth. Catalog
  // metadata for 27,000+ humanitarian datasets (population, displacement, food security, health,
  // conflict) contributed by UN agencies, NGOs, and governments. Only HDX's own catalog metadata
  // (titles, descriptions, resource pointers) is exposed here — individual resource file content
  // carries per-contributor licensing, checked via license_title/license_url in dataset_detail.
  {
    toolId: 'hdx.dataset_search',
    mcpName: 'hdx.datasets.search',
    title: 'HDX Dataset Search',
    description:
      'Search the Humanitarian Data Exchange catalog for datasets by free-text query, country, ' +
      "and/or publishing organization. Returns each dataset's id, title, notes, organization, " +
      'resource count, dataset date range, license, and tags. Covers population, displacement, ' +
      'food security, health, conflict, and climate data for humanitarian response. Data: HDX ' +
      'CKAN Action API (data.humdata.org), no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hdx.dataset_detail',
    mcpName: 'hdx.datasets.detail',
    title: 'HDX Dataset Detail',
    description:
      'Get full metadata for a single HDX dataset by id or URL slug: description, publishing ' +
      'organization, covered locations, tags, update frequency, license, source, and the full ' +
      'list of downloadable resources (name, format, download URL, size). Use hdx.dataset_search ' +
      'first to find a dataset id. Data: HDX CKAN Action API (data.humdata.org), no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hdx.location_list',
    mcpName: 'hdx.reference.locations',
    title: 'HDX Location List',
    description:
      'List countries/regions tracked on HDX with their published dataset count, optionally ' +
      'filtered by a name substring. Use the returned location id as the `country` filter for ' +
      'hdx.dataset_search. Data: HDX CKAN Action API (data.humdata.org), no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hdx.organization_list',
    mcpName: 'hdx.reference.organizations',
    title: 'HDX Organization List',
    description:
      'List humanitarian organizations publishing data on HDX (UN agencies, NGOs, governments, ' +
      'clusters) with their published dataset count, optionally filtered by a name substring. Use ' +
      'the returned slug as the `organization` filter for hdx.dataset_search. Data: HDX CKAN ' +
      'Action API (data.humdata.org), no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // --- UC-639: Google "COVID-19 Open Data" — 3 tools ---
  // Public Google Cloud Storage bucket (storage.googleapis.com/covid19-open-data) with static
  // CSV dumps, no auth. FROZEN dataset — Google discontinued real-time updates on 2022-09-15;
  // data remains available but will not receive further updates (same pattern as ecdc-surveillance
  // UC-625). location_history projects the raw 700+ column joined CSV down to ~12 curated core
  // fields — demographic/policy/search-trends covariates are never exposed.
  {
    toolId: 'global-health-covid.location_search',
    mcpName: 'global-health-covid.epidemiology.location_search',
    title: 'COVID-19 Location Search',
    description:
      'Search/list COVID-19 tracked locations (countries, states/provinces, counties, localities) ' +
      'by free-text name, ISO country code, and/or administrative aggregation level. Returns each ' +
      "location's key, names, and level — use the returned location_key with " +
      'global-health-covid.latest_snapshot or global-health-covid.location_history. Data: Google ' +
      '"COVID-19 Open Data" (storage.googleapis.com/covid19-open-data), no auth required. ' +
      'HISTORICAL DATA ONLY — frozen since 2022-09-15.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'global-health-covid.latest_snapshot',
    mcpName: 'global-health-covid.epidemiology.latest_snapshot',
    title: 'COVID-19 Latest Snapshot',
    description:
      'Get the latest known COVID-19 statistics for one location from one dataset: epidemiology ' +
      '(cases/deaths/tests), hospitalizations (hospital/ICU/ventilator patient counts), or ' +
      'vaccinations (vaccination totals). Use global-health-covid.location_search first to find a ' +
      'valid location_key. Returns found=false with no error if the location has no row in that ' +
      'dataset. Data: Google "COVID-19 Open Data" (storage.googleapis.com/covid19-open-data), no ' +
      'auth required. HISTORICAL DATA ONLY — frozen since 2022-09-15, "latest" means latest ' +
      'available before the freeze, not real-time.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'global-health-covid.location_history',
    mcpName: 'global-health-covid.epidemiology.location_history',
    title: 'COVID-19 Location History',
    description:
      'Get the full daily historical COVID-19 time series for one location, optionally windowed ' +
      'by start_date/end_date. Returns a curated subset of core fields per day: cases, deaths, ' +
      'hospitalizations, and vaccination totals (both new and cumulative), plus population. Does ' +
      'NOT return the raw upstream dataset which includes 700+ demographic/policy/search-trend ' +
      'columns. Use global-health-covid.location_search first to find a valid location_key. Data: ' +
      'Google "COVID-19 Open Data" (storage.googleapis.com/covid19-open-data), no auth required. ' +
      'HISTORICAL DATA ONLY — coverage ends ~2022-09, frozen dataset.',
    category: 'health',
    annotations: READ_ONLY,
  },

  // --- UC-640: Malaria Atlas Project (MAP) — 4 tools ---
  // Public GeoServer WFS 2.0 API (data.malariaatlas.org/geoserver/ows) run by the University of
  // Oxford Malaria Atlas Project, no auth. Point-level parasite-rate surveys, admin1 confirmed-case
  // estimates (1980-2017), Anopheles mosquito vector-occurrence records, and a country reference
  // list. Full admin-boundary polygon geometry is never returned — only curated non-geometry fields.
  {
    toolId: 'malaria-atlas.parasite_rate_survey',
    mcpName: 'malaria-atlas.epidemiology.parasite_rate_survey',
    title: 'Malaria Parasite Rate Survey',
    description:
      'Search point-level malaria parasite-rate survey records for P. falciparum (pf) or P. vivax ' +
      '(pv): site location, survey period, number examined, positive count, and parasite rate (pr), ' +
      'optionally filtered by country. Data: Malaria Atlas Project GeoServer WFS ' +
      '(data.malariaatlas.org), no auth required.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'malaria-atlas.case_estimates',
    mcpName: 'malaria-atlas.epidemiology.case_estimates',
    title: 'Malaria Case Estimates by Region',
    description:
      'Get modeled confirmed malaria case counts (P. falciparum or P. vivax) per admin1 region ' +
      '(state/province) and year for a country, covering 1980-2017, alongside total population for ' +
      'that region/year. Use malaria-atlas.country_list first to find a valid ISO3 country code. ' +
      'Data: Malaria Atlas Project GeoServer WFS (data.malariaatlas.org), no auth required.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'malaria-atlas.vector_occurrence',
    mcpName: 'malaria-atlas.entomology.vector_occurrence',
    title: 'Anopheles Vector Occurrence',
    description:
      'Search Anopheles mosquito vector-occurrence records: collection site, survey period, ' +
      'species identification, and sampling method, optionally filtered by country and/or a ' +
      'species-name substring (e.g. "gambiae"). Data: Malaria Atlas Project GeoServer WFS ' +
      '(data.malariaatlas.org), no auth required.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'malaria-atlas.country_list',
    mcpName: 'malaria-atlas.reference.country_list',
    title: 'Malaria Atlas Country List',
    description:
      'List countries covered by Malaria Atlas Project admin boundaries with their ISO3/ISO2 codes ' +
      'and name, optionally filtered by a name substring. Use the returned iso code as the ' +
      '`country` filter for the other malaria-atlas tools. Data: Malaria Atlas Project GeoServer ' +
      'WFS (data.malariaatlas.org), no auth required.',
    category: 'health',
    annotations: READ_ONLY,
  },

  // --- UC-641: Government of Canada Open Data (open-canada) — 4 tools ---
  // Public CKAN Action API (open.canada.ca/data/api/3/action) run by the Government of Canada, no
  // auth. Federal/provincial dataset search + detail, subject-topic taxonomy (19 fixed categories,
  // since this portal doesn't use CKAN groups), and publishing department/agency list. All content
  // licensed under the Open Government Licence - Canada (commercial reuse permitted).
  {
    toolId: 'open-canada.dataset_search',
    mcpName: 'open-canada.datasets.search',
    title: 'Canada Open Data Search',
    description:
      'Search the Government of Canada open data catalog by free text, topic subject, and/or ' +
      'publishing department, returning dataset id, title, notes, organization, subjects, and ' +
      'release/modified dates. Use open-canada.subject_list or open-canada.organization_list to find ' +
      'valid filter slugs. Data: open.canada.ca CKAN Action API, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'open-canada.dataset_detail',
    mcpName: 'open-canada.datasets.detail',
    title: 'Canada Open Data Dataset Detail',
    description:
      'Get full metadata for one Government of Canada open dataset by id: title, notes, organization, ' +
      'subjects, keywords, license, jurisdiction, and the full resource list (name, format, download ' +
      'URL, size) for that dataset. Data: open.canada.ca CKAN Action API, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'open-canada.subject_list',
    mcpName: 'open-canada.reference.subject_list',
    title: 'Canada Open Data Subject List',
    description:
      'List the Government of Canada open data subject taxonomy (e.g. "health_and_safety", ' +
      '"nature_and_environment") with the current dataset count per subject, optionally filtered by a ' +
      'substring. Use the returned subject slug as the `subject` filter for ' +
      'open-canada.dataset_search. Data: open.canada.ca CKAN Action API, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'open-canada.organization_list',
    mcpName: 'open-canada.reference.organization_list',
    title: 'Canada Open Data Organization List',
    description:
      'List federal/provincial departments and agencies publishing on the Government of Canada open ' +
      'data portal, with dataset counts, optionally filtered by a name substring. Use the returned ' +
      'org slug as the `organization` filter for open-canada.dataset_search. Data: open.canada.ca ' +
      'CKAN Action API, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // --- UC-642: EU Open Data Portal (data-europa) — 4 tools ---
  // Public Hub-Search API (data.europa.eu/api/hub/search) run by the Publications Office of the
  // EU, no auth. Aggregates 1M+ datasets from national/regional open-data portals across the
  // EU/EEA plus EU institutions. Most metadata fields are multilingual (~25 languages per field)
  // — normalized output flattens every field to a single locale (default English).
  {
    toolId: 'data-europa.dataset_search',
    mcpName: 'data-europa.datasets.search',
    title: 'EU Open Data Search',
    description:
      'Search the EU Open Data Portal catalog (1M+ datasets aggregated from national and regional ' +
      'EU/EEA open-data portals plus EU institutions) by free text, country, and/or DCAT-AP theme, ' +
      'returning dataset id, localized title/description, source catalogue, country, categories, ' +
      'and available distribution formats. Use data-europa.theme_list for valid theme codes. Data: ' +
      'data.europa.eu Hub-Search API, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'data-europa.dataset_detail',
    mcpName: 'data-europa.datasets.detail',
    title: 'EU Open Data Dataset Detail',
    description:
      'Get full metadata for one EU Open Data Portal dataset by id: localized title/description, ' +
      'source catalogue, tags, license, and the full distribution list (format, download URL, ' +
      'license, release/update dates). Data: data.europa.eu Hub-Search API (CKAN-compatible shim), ' +
      'no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'data-europa.theme_list',
    mcpName: 'data-europa.reference.theme_list',
    title: 'EU Open Data Theme List',
    description:
      'List the 14 fixed DCAT-AP data themes used by the EU Open Data Portal (e.g. "ENVI" for ' +
      'Environment, "HEAL" for Health, "ECON" for Economy and finance) with localized labels. Use ' +
      'the returned theme code as the `theme` filter for data-europa.dataset_search. Data: ' +
      'data.europa.eu Hub-Search API, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'data-europa.catalogue_list',
    mcpName: 'data-europa.reference.catalogue_list',
    title: 'EU Open Data Catalogue List',
    description:
      'List the ~211 national, regional, and EU-institution data catalogues (portal source ids, ' +
      'e.g. "gdi-de", "govdata", "geocat-li") that feed the EU Open Data Portal, optionally ' +
      'filtered by an id substring. Data: data.europa.eu Hub-Search API, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  // Macrostrat (4)
  {
    toolId: 'macrostrat.columns_search',
    mcpName: 'macrostrat.geology.columns_search',
    title: 'Macrostrat Stratigraphic Column Search',
    description:
      'Search worldwide stratigraphic columns (a summary of the rock units at one location) by ' +
      'point location (lat/lng), stratigraphic name, chronostratigraphic time interval, ' +
      'lithology, or geologic age (Ma). Returns column IDs, names, coordinates, area, and ' +
      'thickness — use the returned col_id with macrostrat.units_search or ' +
      'macrostrat.fossils_search. Data: macrostrat.org/api/v2, no auth required, CC BY 4.0.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'macrostrat.units_search',
    mcpName: 'macrostrat.geology.units_search',
    title: 'Macrostrat Geologic Unit Search',
    description:
      'Get the rock units (formation/member/group names, top/bottom age in millions of years, ' +
      'thickness, lithology, and depositional environment) that make up a stratigraphic column, ' +
      'looked up by col_id (from macrostrat.columns_search) or by a lat/lng point. Data: ' +
      'macrostrat.org/api/v2, no auth required, CC BY 4.0.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'macrostrat.geologic_map_units',
    mcpName: 'macrostrat.geology.map_units',
    title: 'Macrostrat Bedrock Geologic Map Units',
    description:
      'Get the bedrock geologic map unit(s) at a specific point location (surface geology): ' +
      'formation/unit name, dominant lithology, description, age range, and recommended map ' +
      'color, sourced from compiled state/national geologic maps. Data: macrostrat.org/api/v2 ' +
      '/geologic_units/map, no auth required, CC BY 4.0.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'macrostrat.fossils_search',
    mcpName: 'macrostrat.geology.fossils_search',
    title: 'Macrostrat Fossil Collection Search',
    description:
      'Get Paleobiology Database (PBDB) fossil collections matched to a Macrostrat stratigraphic ' +
      'column or rock unit, looked up by col_id or unit_id (from macrostrat.columns_search / ' +
      'macrostrat.units_search), optionally narrowed by chronostratigraphic interval name. ' +
      'Returns collection names, ages, and PBDB occurrence counts. Data: macrostrat.org/api/v2, ' +
      'no auth required, CC BY 4.0.',
    category: 'world',
    annotations: READ_ONLY,
  },
  // GeoDIVA / Alaska Volcano Observatory (3)
  {
    toolId: 'geodiva.volcano_list',
    mcpName: 'geodiva.geology.volcano_list',
    title: 'GeoDIVA Alaska Volcano List',
    description:
      "Browse Alaska's 356 volcanoes from the AVO GeoDIVA database, optionally filtered by " +
      'NVEWS threat level, geologic age class, monitored-network status, or a name substring. ' +
      'Returns volcano ID, VNUM, name, type, composition, and threat rating for each match. ' +
      'Data: geodiva.avo.alaska.edu, no auth required, US Government public domain.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geodiva.volcano_detail',
    mcpName: 'geodiva.geology.volcano_detail',
    title: 'GeoDIVA Volcano Detail',
    description:
      'Get full detail for a single Alaska volcano — geology, composition, age, threat rating, ' +
      'and a narrative description — looked up by volcano ID (e.g. "ak52"), VNUM, or name. ' +
      'Data: geodiva.avo.alaska.edu, no auth required, US Government public domain.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geodiva.eruption_search',
    mcpName: 'geodiva.geology.eruption_search',
    title: 'GeoDIVA Eruption History Search',
    description:
      'Search documented eruptions for an Alaska volcano by volcano_id (from ' +
      'geodiva.volcano_list), a specific eruption_id, or a start/end date range (years or ' +
      'ISO dates, including negative/BCE years for prehistoric eruptions). Returns eruption ' +
      'name, narrative description, and start/end date fields. Data: geodiva.avo.alaska.edu, ' +
      'no auth required, US Government public domain.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // Launch Library 2 / The Space Devs (4)
  {
    toolId: 'launch-library-2.upcoming_launches',
    mcpName: 'launch-library-2.launches.upcoming',
    title: 'Launch Library 2 Upcoming Launches',
    description:
      'List upcoming global orbital launches — mission name, launch service provider, rocket ' +
      'configuration, launch window, pad/location, and status — optionally filtered by a free-text ' +
      'search across mission/rocket/agency names. Data: ll.thespacedevs.com (The Space Devs), no ' +
      'auth required; free tier is throttled to 15 requests/hour shared across all APIbase agents, ' +
      'so results are cached for 30 minutes.',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'launch-library-2.launch_detail',
    mcpName: 'launch-library-2.launches.detail',
    title: 'Launch Library 2 Launch Detail',
    description:
      'Get full detail for a single launch by its UUID (from ' +
      'launch-library-2.upcoming_launches results) — mission description, orbit, rocket and pad ' +
      'detail, launch provider, imagery, and probability/weather notes. Data: ll.thespacedevs.com ' +
      '(The Space Devs), no auth required; free tier is throttled to 15 requests/hour shared ' +
      'across all APIbase agents, so results are cached for 1 hour.',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'launch-library-2.astronaut_search',
    mcpName: 'launch-library-2.astronauts.search',
    title: 'Launch Library 2 Astronaut Search',
    description:
      'Search the global astronaut roster by name — returns astronaut name, active/retired ' +
      'status, and sponsoring space agency, optionally filtered by a free-text search. Data: ' +
      'll.thespacedevs.com (The Space Devs), no auth required; free tier is throttled to 15 ' +
      'requests/hour shared across all APIbase agents, so results are cached for 24 hours.',
    category: 'space',
    annotations: READ_ONLY,
  },
  {
    toolId: 'launch-library-2.agency_search',
    mcpName: 'launch-library-2.agencies.search',
    title: 'Launch Library 2 Agency Search',
    description:
      'Search space agencies and commercial launch operators by name — returns agency type ' +
      '(government/commercial/multinational), country, founding year, and description, ' +
      'optionally filtered by a free-text search. Data: ll.thespacedevs.com (The Space Devs), no ' +
      'auth required; free tier is throttled to 15 requests/hour shared across all APIbase ' +
      'agents, so results are cached for 24 hours.',
    category: 'space',
    annotations: READ_ONLY,
  },

  // Socrata Open Data (SODA) (3)
  {
    toolId: 'socrata.dataset_search',
    mcpName: 'socrata.datasets.search',
    title: 'Socrata Dataset Search',
    description:
      'Search the Socrata Discovery API — a single cross-portal catalog covering thousands of ' +
      'independently-hosted government/civic open-data portals worldwide (NYC, HHS, states, ' +
      'counties, and more) — by free-text query, portal domain, category, and/or tags. Returns ' +
      "each dataset's id, name, description, hosting domain, category, tags, license, and URL. " +
      'Use the returned domain + id with socrata.dataset_metadata or socrata.query_dataset. ' +
      'Data: api.us.socrata.com, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'socrata.dataset_metadata',
    mcpName: 'socrata.datasets.detail',
    title: 'Socrata Dataset Metadata',
    description:
      'Get full metadata and column schema for one dataset on a specific Socrata portal — ' +
      'description, attribution, tags, view/download counts, last data update time, and the ' +
      'full column list (name, field name, data type, description). Use ' +
      'socrata.dataset_search first to find a domain + dataset_id. Data: per-portal Socrata ' +
      'views API (e.g. data.cityofnewyork.us), no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'socrata.query_dataset',
    mcpName: 'socrata.datasets.query',
    title: 'Socrata Dataset Query',
    description:
      "Run a SoQL query against a specific dataset's actual data rows on a Socrata portal — " +
      'supports $select, $where, $order, $group, $limit, and $offset clauses (see ' +
      'socrata.dataset_metadata for column names). Returns the matching rows as JSON. Use ' +
      'socrata.dataset_search first to find a domain + dataset_id. Data: per-portal Socrata ' +
      'resource API (e.g. data.cityofnewyork.us), no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // NCBI E-utilities Taxonomy (3)
  {
    toolId: 'ncbi-eutils.taxonomy_search',
    mcpName: 'ncbi-eutils.taxonomy.search',
    title: 'NCBI Taxonomy Search',
    description:
      'Search the NCBI Taxonomy database by organism scientific or common name (e.g. ' +
      '"Panthera leo" or "African elephant"). Returns matching NCBI TaxIDs plus the query ' +
      'translation NCBI actually ran. Use a returned tax_id with ncbi-eutils.taxonomy_summary ' +
      'or ncbi-eutils.taxonomy_lineage. Data: eutils.ncbi.nlm.nih.gov (US National Library of ' +
      'Medicine, public domain), no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ncbi-eutils.taxonomy_summary',
    mcpName: 'ncbi-eutils.taxonomy.summary',
    title: 'NCBI Taxonomy Summary',
    description:
      'Get the scientific name, common name, taxonomic rank, and division for one NCBI ' +
      'TaxID. Use ncbi-eutils.taxonomy_search first to find a tax_id. For the full ' +
      'kingdom-to-species classification tree, use ncbi-eutils.taxonomy_lineage instead. ' +
      'Data: eutils.ncbi.nlm.nih.gov, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ncbi-eutils.taxonomy_lineage',
    mcpName: 'ncbi-eutils.taxonomy.lineage',
    title: 'NCBI Taxonomy Lineage',
    description:
      'Get the full taxonomic classification tree for one NCBI TaxID — every ancestor rank ' +
      'from domain/kingdom down to the organism itself (e.g. Eukaryota > Metazoa > Chordata > ' +
      'Mammalia > Carnivora > Felidae > Panthera > Panthera leo), plus scientific name, common ' +
      'name, and parent TaxID. Use ncbi-eutils.taxonomy_search first to find a tax_id. Data: ' +
      'eutils.ncbi.nlm.nih.gov, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // HDX Humanitarian API v2 (4)
  {
    toolId: 'hdx-hapi.operational_presence',
    mcpName: 'hdx-hapi.coordination.operational_presence',
    title: 'HDX HAPI Operational Presence (3W)',
    description:
      'Get "who\'s doing what, where" (3W) humanitarian response data — which organizations ' +
      'are active in which sector (Health, Nutrition, WASH, etc.) and location. Filter by ' +
      'location_code (ISO3), sector_name, org_name, admin1_name, and admin_level. Data: ' +
      'HDX Humanitarian API (hapi.humdata.org), run by UN OCHA Centre for Humanitarian Data, ' +
      'CC BY 4.0, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hdx-hapi.humanitarian_needs',
    mcpName: 'hdx-hapi.coordination.humanitarian_needs',
    title: 'HDX HAPI Humanitarian Needs (PIN)',
    description:
      'Get People-in-Need (PIN) figures broken down by sector, category (age/gender/disability), ' +
      'and population_status (affected/in-need/targeted/reached). Filter by location_code (ISO3), ' +
      'sector_name, population_status, admin1_name, and admin_level. Data: HDX Humanitarian API ' +
      '(hapi.humdata.org), run by UN OCHA Centre for Humanitarian Data, CC BY 4.0, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hdx-hapi.baseline_population',
    mcpName: 'hdx-hapi.geography.baseline_population',
    title: 'HDX HAPI Baseline Population',
    description:
      'Get baseline population demographics broken down by gender and age range for a country ' +
      'or subnational admin area. Filter by location_code (ISO3), gender, age_range, admin1_name, ' +
      'and admin_level. Data: HDX Humanitarian API (hapi.humdata.org), run by UN OCHA Centre for ' +
      'Humanitarian Data, CC BY 4.0, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hdx-hapi.food_security',
    mcpName: 'hdx-hapi.food.security_ipc',
    title: 'HDX HAPI Food Security (IPC)',
    description:
      'Get IPC (Integrated Food Security Phase Classification) data — population counts by ' +
      'food-insecurity phase (1=minimal to 5=catastrophe), current and projected. Filter by ' +
      'location_code (ISO3), ipc_phase, admin1_name, and admin_level. Data: HDX Humanitarian API ' +
      '(hapi.humdata.org), run by UN OCHA Centre for Humanitarian Data, CC BY 4.0, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geonet-nz.quake_search',
    mcpName: 'geonet-nz.quakes.search',
    title: 'GeoNet NZ Quake Search',
    description:
      'Search recent New Zealand earthquakes by minimum shaking intensity. Returns quakes that ' +
      'may have caused shaking greater than or equal to the given MMI (Modified Mercalli ' +
      'Intensity, -1 to 8) in the NZ region during the last 365 days (max 100 results), with ' +
      'time, location, depth, magnitude, and locality. Data: GeoNet (api.geonet.org.nz), run by ' +
      'GNS Science, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geonet-nz.quake_detail',
    mcpName: 'geonet-nz.quakes.detail',
    title: 'GeoNet NZ Quake Detail',
    description:
      'Get full detail for a single New Zealand earthquake by its GeoNet publicID (e.g. ' +
      '"2014p715167") — origin time, depth, magnitude, locality, MMI shaking, and quality ' +
      '(best/preliminary/automatic/deleted). Data: GeoNet (api.geonet.org.nz), run by GNS ' +
      'Science, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geonet-nz.quake_stats',
    mcpName: 'geonet-nz.quakes.stats',
    title: 'GeoNet NZ Quake Statistics',
    description:
      'Get New Zealand earthquake-rate statistics — magnitude-count breakdown over the last 7, ' +
      '28, and 365 days, plus a daily earthquake-count time series. Optionally filter the ' +
      'magnitude-count breakdown to one window with the days parameter. Data: GeoNet ' +
      '(api.geonet.org.nz), run by GNS Science, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'geonet-nz.volcano_alert_level',
    mcpName: 'geonet-nz.volcano.alert_level',
    title: 'GeoNet NZ Volcanic Alert Level',
    description:
      "Get the current Volcanic Alert Level and aviation colour code for New Zealand's 12 " +
      'monitored volcanoes (e.g. Ruapehu, White Island/Whakaari, Taupo), including current ' +
      'activity summary and most-likely-hazards description. Optionally filter to a single ' +
      'volcano_id. Data: GeoNet (api.geonet.org.nz), run by GNS Science, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  // BGS OGC API (4)
  {
    toolId: 'bgs-ogcapi.geology_bedrock',
    mcpName: 'bgs-ogcapi.geology.bedrock',
    title: 'BGS Bedrock Geology Lookup',
    description:
      'Look up bedrock geology (lithology, rock unit name, and geological age range) near a ' +
      'point in Great Britain, from the BGS 1:625,000 generalised digital geological map. ' +
      "Returns each matching bedrock unit's lexicon name, rock composition, and time period " +
      '(e.g. Eocene, Cretaceous). Data: British Geological Survey (ogcapi.bgs.ac.uk), Open ' +
      'Government Licence, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bgs-ogcapi.earthquake_search',
    mcpName: 'bgs-ogcapi.hazards.earthquake_search',
    title: 'BGS UK Earthquake Search',
    description:
      'Search UK earthquakes by area (lat/lng + radius), year, and minimum magnitude. Set ' +
      'period to "modern" (default, instrument-recorded since 1970) or "historical" (pre-1970 ' +
      'UK Historical Earthquakes catalogue). Returns event date/time, depth, local magnitude ' +
      '(ML), and intensity. Data: British Geological Survey (ogcapi.bgs.ac.uk), Open ' +
      'Government Licence, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bgs-ogcapi.borehole_search',
    mcpName: 'bgs-ogcapi.geology.borehole_search',
    title: 'BGS Borehole Index Search',
    description:
      'Search the Single Onshore Borehole Index (SOBI) — over 1 million UK borehole, shaft, ' +
      'and well site-investigation records — near a point. Returns reference number, site ' +
      'name, grid reference, depth, and a scan URL where available. Data: British Geological ' +
      'Survey (ogcapi.bgs.ac.uk), Open Government Licence, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bgs-ogcapi.landslide_search',
    mcpName: 'bgs-ogcapi.hazards.landslide_search',
    title: 'BGS National Landslide Database Search',
    description:
      'Search the National Landslide Database for recorded UK landslide events near a point. ' +
      'Returns landslide name, locality details, and known-date range where recorded. Data: ' +
      'British Geological Survey (ogcapi.bgs.ac.uk), Open Government Licence, no auth ' +
      'required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  // --- UC-651: ILOSTAT SDMX public REST API (3 tools) ---
  {
    toolId: 'ilostat.dataflows',
    mcpName: 'ilostat.reference.dataflows',
    title: 'ILOSTAT Dataflows',
    description:
      'Search or list ILOSTAT labor-statistics dataflows — ~1200 official series from the ' +
      'International Labour Organization covering employment, unemployment, wages, working ' +
      'time, labour force participation, informality, and child labour. Filter by name/id with ' +
      'query, or omit to list all (capped to 200 results). Use the returned dataflow_id with ' +
      'ilostat.structure and ilostat.data. Data: sdmx.ilo.org (ILOSTAT SDMX public REST API), ' +
      'no auth required.',
    category: 'jobs',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ilostat.structure',
    mcpName: 'ilostat.reference.structure',
    title: 'ILOSTAT Dataflow Structure',
    description:
      'Get the dimensions and valid codes for an ILOSTAT dataflow (dataflow_id from ' +
      'ilostat.dataflows, e.g. "DF_EMP_TEMP_SEX_AGE_NB" for employment by sex and age) — ' +
      'reference area, frequency, measure, sex, and age dimensions each with their code list. ' +
      'Use this to interpret the dimension labels returned by ilostat.data, or to build a ' +
      'narrower key filter. Data: sdmx.ilo.org (ILOSTAT SDMX public REST API), no auth ' +
      'required.',
    category: 'jobs',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ilostat.data',
    mcpName: 'ilostat.series.data',
    title: 'ILOSTAT Dataflow Data',
    description:
      'Get observation values for an ILOSTAT dataflow (dataflow_id from ilostat.dataflows). ' +
      'Use key (from ilostat.structure) to filter by country/frequency/measure/sex/age, e.g. ' +
      '"USA.A....." for United States annual data, all other dimensions unfiltered. Control ' +
      'the time range with start_period/end_period or last_n_observations. Data: sdmx.ilo.org ' +
      '(ILOSTAT SDMX public REST API), no auth required.',
    category: 'jobs',
    annotations: READ_ONLY,
  },

  // Australian Government Open Data (4) — UC-652
  {
    toolId: 'au-data-gov.dataset_search',
    mcpName: 'au-data-gov.datasets.search',
    title: 'Australia Open Data Search',
    description:
      'Search the Australian Government open data catalog (data.gov.au) by free text and/or ' +
      'publishing agency, returning dataset id, title, notes, organization, and modified date. ' +
      'Use au-data-gov.organization_search to find valid agency filter slugs. Data: data.gov.au ' +
      'CKAN Action API, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'au-data-gov.dataset_detail',
    mcpName: 'au-data-gov.datasets.detail',
    title: 'Australia Open Data Dataset Detail',
    description:
      'Get full metadata for one Australian Government open dataset by id: title, notes, ' +
      'organization, tags, license, and the full resource list (name, format, download URL, ' +
      'size) for that dataset. Data: data.gov.au CKAN Action API, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'au-data-gov.subject_list',
    mcpName: 'au-data-gov.reference.subject_list',
    title: 'Australia Open Data Subject List',
    description:
      'List the Australian Government open data AGIFT subject taxonomy (e.g. ' +
      '"health_and_safety", "nature_and_environment") with the current dataset count per subject, ' +
      'optionally filtered by a substring. Browse-only reference (not usable as a dataset_search ' +
      'filter on this portal). Data: data.gov.au CKAN Action API, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'au-data-gov.organization_search',
    mcpName: 'au-data-gov.reference.organization_search',
    title: 'Australia Open Data Organization Search',
    description:
      'Look up Australian federal/state/territory agencies and organizations publishing on the ' +
      'open data portal by name, returning id, slug, and title. Use the returned slug as the ' +
      '`organization` filter for au-data-gov.dataset_search. Data: data.gov.au CKAN Action API, ' +
      'no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // UKHSA Data Dashboard (2) — UC-653
  {
    toolId: 'ukhsa-dashboard.browse',
    mcpName: 'ukhsa-dashboard.catalog.browse',
    title: 'UKHSA Dashboard Browse',
    description:
      'Browse the UK Health Security Agency data dashboard drill-down catalog: themes -> ' +
      'sub_themes -> topics -> geography_types -> geographies -> metrics. Call with no params ' +
      'to list themes, then pass increasingly specific params (theme, sub_theme, topic, ' +
      'geography_type, geography) to drill down one level at a time until you reach a metric ' +
      'name usable with ukhsa-dashboard.metric_data. Data: api.ukhsa-dashboard.data.gov.uk, ' +
      'UK Open Government Licence v3.0, no auth required.',
    category: 'health',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ukhsa-dashboard.metric_data',
    mcpName: 'ukhsa-dashboard.metrics.data',
    title: 'UKHSA Dashboard Metric Data',
    description:
      'Get paginated timeseries data points for one UK health surveillance metric (cases, ' +
      'deaths, healthcare admissions, testing, vaccinations, etc.) at a specific geography, ' +
      'identified by the full theme/sub_theme/topic/geography_type/geography/metric path from ' +
      'ukhsa-dashboard.browse. Optional filters: year, epiweek, exact date, age band, sex, ' +
      'stratum, and reporting-delay-period flag. Data: api.ukhsa-dashboard.data.gov.uk, UK Open ' +
      'Government Licence v3.0, no auth required.',
    category: 'health',
    annotations: READ_ONLY,
  },

  // Environment Agency Hydrology (4) — UC-654
  {
    toolId: 'ea-hydrology.station_search',
    mcpName: 'ea-hydrology.stations.search',
    title: 'EA Hydrology Station Search',
    description:
      'Search the UK Environment Agency hydrology monitoring network for river, groundwater, ' +
      'and rainfall stations, filterable by river name, freetext label search, or what the ' +
      'station measures (waterFlow, waterLevel, rainfall, temperature, groundwaterLevel). ' +
      'Returns station_id, name, river/catchment, coordinates, and measure count — use the ' +
      'station_id with ea-hydrology.station_measures to see its available data series. Data: ' +
      'environment.data.gov.uk/hydrology, UK Open Government Licence v3.0, no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ea-hydrology.station_measures',
    mcpName: 'ea-hydrology.stations.measures',
    title: 'EA Hydrology Station Measures',
    description:
      'List the data series (measures) recorded at one EA hydrology station — e.g. 15-minute ' +
      'instantaneous flow, daily mean/min/max level, daily total rainfall — identified by the ' +
      'station_id from ea-hydrology.station_search. Optional parameter filter (flow, level, ' +
      'rainfall, TEMPERATURE — note TEMPERATURE is uppercase upstream). Returns measure_id, ' +
      'period, value type, and unit for each series — use measure_id with ' +
      'ea-hydrology.readings_latest or ea-hydrology.readings_range. Data: ' +
      'environment.data.gov.uk/hydrology, UK Open Government Licence v3.0, no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ea-hydrology.readings_latest',
    mcpName: 'ea-hydrology.readings.latest',
    title: 'EA Hydrology Latest Reading',
    description:
      'Get the most recent reading (date, value, quality flag) for one EA hydrology data ' +
      'series, identified by the measure_id from ea-hydrology.station_measures. Data: ' +
      'environment.data.gov.uk/hydrology, UK Open Government Licence v3.0, no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ea-hydrology.readings_range',
    mcpName: 'ea-hydrology.readings.range',
    title: 'EA Hydrology Readings Range',
    description:
      'Get a date-ranged time series of readings (date, value, quality, completeness) for one ' +
      'EA hydrology data series, identified by the measure_id from ' +
      'ea-hydrology.station_measures. Requires min_date and max_date (YYYY-MM-DD, inclusive). ' +
      'Data: environment.data.gov.uk/hydrology, UK Open Government Licence v3.0, no auth ' +
      'required.',
    category: 'weather',
    annotations: READ_ONLY,
  },

  // Statbel beSTAT (4) — UC-655
  {
    toolId: 'statbel.list_views',
    mcpName: 'statbel.catalog.list_views',
    title: 'Statbel List Views',
    description:
      'Browse the Statbel beSTAT catalog of ~1300 curated, ready-to-query views (cross-tabs of ' +
      'Belgian official statistics), filterable by locale (fr/nl/de/en) and a case-insensitive ' +
      'name search. Each view exists as a separate record per language. Returns view_id, name, ' +
      'locale, and the backing data_source_id — use view_id with statbel.view_data to fetch the ' +
      'actual figures. Data: bestat.statbel.fgov.be, Belgian statistics office, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'statbel.view_data',
    mcpName: 'statbel.catalog.view_data',
    title: 'Statbel View Data',
    description:
      'Fetch the full set of fact rows (flat cross-tab, columns vary per view) for one Statbel ' +
      'beSTAT view, identified by the view_id from statbel.list_views. Data: ' +
      'bestat.statbel.fgov.be, Belgian statistics office, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'statbel.list_datasources',
    mcpName: 'statbel.catalog.list_datasources',
    title: 'Statbel List Datasources',
    description:
      'Browse the ~180 raw Statbel datasources that back the curated views, filterable by a ' +
      'case-insensitive name/description search and by supported language. Returns ' +
      'datasource_id, name, description, and supported locales — use datasource_id with ' +
      'statbel.datasource_detail for full metadata. Data: bestat.statbel.fgov.be, Belgian ' +
      'statistics office, no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'statbel.datasource_detail',
    mcpName: 'statbel.catalog.datasource_detail',
    title: 'Statbel Datasource Detail',
    description:
      'Get full metadata (multilingual descriptions, supported locales, category, last data ' +
      'and metadata update timestamps) for one Statbel datasource, identified by the ' +
      'datasource_id from statbel.list_datasources. An invalid or unpublished id returns an ' +
      'empty upstream response. Data: bestat.statbel.fgov.be, Belgian statistics office, no ' +
      'auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // ISTAT SDMX public REST API (3) — UC-656
  {
    toolId: 'istat.dataflows',
    mcpName: 'istat.reference.dataflows',
    title: 'ISTAT Dataflows',
    description:
      'Search or list ISTAT economic/social-statistics dataflows — ~4900 official series from ' +
      'the Italian National Institute of Statistics covering population, prices, labour, ' +
      'agriculture, trade, and national accounts. Filter by name/id with query, or omit to list ' +
      'all (capped to 200 results). Use the returned dataflow_id with istat.structure and ' +
      'istat.data. Data: esploradati.istat.it (ISTAT SDMX public REST API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'istat.structure',
    mcpName: 'istat.reference.structure',
    title: 'ISTAT Dataflow Structure',
    description:
      'Get the dimensions and valid codes for an ISTAT dataflow (dataflow_id from ' +
      'istat.dataflows, e.g. "101_1015_DF_DCSP_COLTIVAZIONI_1" for crop areas and production) — ' +
      'frequency, territory, and measure dimensions each with their code list (capped to 200 ' +
      'codes per dimension, with a total_codes count). Use this to interpret the dimension ' +
      'labels returned by istat.data, or to build a narrower key filter. Data: ' +
      'esploradati.istat.it (ISTAT SDMX public REST API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'istat.data',
    mcpName: 'istat.series.data',
    title: 'ISTAT Dataflow Data',
    description:
      'Get observation values for an ISTAT dataflow (dataflow_id from istat.dataflows). Use key ' +
      '(from istat.structure) to filter by frequency/territory/measure, e.g. "A.IT...." for ' +
      'Italy annual data, all other dimensions unfiltered — an unscoped key can match thousands ' +
      'of series. Control the time range with start_period/end_period or last_n_observations ' +
      '(max 20). Data: esploradati.istat.it (ISTAT SDMX public REST API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },

  // MSC GeoMet (4)
  {
    toolId: 'msc-geomet.climate_stations',
    mcpName: 'msc-geomet.climate.stations',
    title: 'Canadian Climate Station Search',
    description:
      'Search the Environment and Climate Change Canada climate station catalog by province/ ' +
      "territory or bounding box. Returns each station's CLIMATE_IDENTIFIER (needed for " +
      'msc-geomet.climate_daily), coordinates, elevation, and its daily/hourly record date ' +
      'ranges. Data: api.weather.gc.ca (MSC GeoMet OGC API - Features), no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'msc-geomet.climate_daily',
    mcpName: 'msc-geomet.climate.daily',
    title: 'Canadian Daily Climate Observations',
    description:
      'Get daily climate observations (mean/min/max temperature, precipitation, rain, snow, ' +
      'snow on ground, max wind gust, heating/cooling degree days) for a Canadian station by ' +
      'CLIMATE_IDENTIFIER (from msc-geomet.climate_stations), optionally scoped to a start_date/ ' +
      'end_date range. Data: api.weather.gc.ca (MSC GeoMet OGC API - Features), no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'msc-geomet.hydrometric_realtime',
    mcpName: 'msc-geomet.hydrometric.realtime',
    title: 'Canadian Real-Time River and Lake Levels',
    description:
      'Get real-time water level (m) and discharge (m3/s) readings for a Canadian river or ' +
      'lake by hydrometric station_number, sorted most-recent-first. Readings are typically ' +
      'reported every 5 minutes for stations with real-time telemetry. Data: api.weather.gc.ca ' +
      '(MSC GeoMet OGC API - Features, sourced from HYDAT/WSC), no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },
  {
    toolId: 'msc-geomet.aqhi_observations',
    mcpName: 'msc-geomet.aqhi.observations',
    title: 'Canadian Air Quality Health Index Observations',
    description:
      'Get real-time Air Quality Health Index (AQHI, 1-10+ scale) observations for a Canadian ' +
      'monitoring location by location_id, or the latest reading from every monitored location ' +
      'across Canada if location_id is omitted. Data: api.weather.gc.ca (MSC GeoMet OGC API - ' +
      'Features), no auth required.',
    category: 'weather',
    annotations: READ_ONLY,
  },

  // INE Portugal (2)
  {
    toolId: 'ine-portugal.indicator_data',
    mcpName: 'ine-portugal.stats.indicator_data',
    title: 'Portuguese Official Statistics Indicator Data',
    description:
      'Get observation data for a Statistics Portugal (INE) indicator by its 7-digit varcd ' +
      'code (e.g. "0008273" for resident population by NUTS region, sex and age group). ' +
      'Optionally filter by up to 6 generic dimensions (Dim1 is usually the reference period, ' +
      'the rest are indicator-specific, e.g. geography/sex/age) — get valid codes first from ' +
      'ine-portugal.indicator_metadata. There is no upstream search/catalog endpoint, so the ' +
      'varcd must already be known. Data: www.ine.pt (Statistics Portugal open JSON indicator ' +
      'API), no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ine-portugal.indicator_metadata',
    mcpName: 'ine-portugal.stats.indicator_metadata',
    title: 'Portuguese Official Statistics Indicator Metadata',
    description:
      'Get metadata for a Statistics Portugal (INE) indicator by its 7-digit varcd code: full ' +
      'name, periodicity, unit, decimal precision, first/last available period, and every ' +
      'dimension with its valid filter codes. Call this BEFORE ine-portugal.indicator_data to ' +
      'discover which Dim1..Dim6 codes are valid for the indicator. Data: www.ine.pt ' +
      '(Statistics Portugal open JSON indicator API), no auth required.',
    category: 'world',
    annotations: READ_ONLY,
  },

  // Deutsche Bundesbank SDMX public REST API (3) — UC-659
  {
    toolId: 'bundesbank-timeseries.dataflows',
    mcpName: 'bundesbank-timeseries.reference.dataflows',
    title: 'Bundesbank Dataflows',
    description:
      'Search or list Deutsche Bundesbank economic time-series dataflows — ~94 official series ' +
      'covering exchange rates, interest rates, money supply, prices, and balance of payments. ' +
      'Filter by name/id with query, or omit to list all. Use the returned dataflow_id with ' +
      'bundesbank-timeseries.structure and bundesbank-timeseries.data. Data: ' +
      'api.statistiken.bundesbank.de (Bundesbank SDMX 2.1 REST API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bundesbank-timeseries.structure',
    mcpName: 'bundesbank-timeseries.reference.structure',
    title: 'Bundesbank Dataflow Structure',
    description:
      'Get the dimensions and valid codes for a Bundesbank dataflow (dataflow_id from ' +
      'bundesbank-timeseries.dataflows, e.g. "BBEX3" for exchange rates) in SDMX key position ' +
      'order, each with its code list (capped to 200 codes per dimension, with a total_codes ' +
      'count). Required to build the fully-specified "key" for bundesbank-timeseries.data. Data: ' +
      'api.statistiken.bundesbank.de (Bundesbank SDMX 2.1 REST API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'bundesbank-timeseries.data',
    mcpName: 'bundesbank-timeseries.series.data',
    title: 'Bundesbank Dataflow Data',
    description:
      'Get observation values for a Bundesbank dataflow (dataflow_id from ' +
      'bundesbank-timeseries.dataflows). key is REQUIRED and must be a fully dot-specified SDMX ' +
      'series key with no empty segments (from bundesbank-timeseries.structure), e.g. ' +
      '"D.USD.EUR.BB.AC.000" for the daily EUR/USD reference rate — an unscoped key would match ' +
      'every series in the dataflow and is rejected. Control the time range with start_period/ ' +
      'end_period or last_n_observations (max 100). Data: api.statistiken.bundesbank.de ' +
      '(Bundesbank SDMX 2.1 REST API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  // INE Spain (4)
  {
    toolId: 'ine-spain.operations',
    mcpName: 'ine-spain.reference.operations',
    title: 'INE Spain Operation Catalog',
    description:
      'Browse the catalog of 109 published Spanish official statistical operations (e.g. IPC = ' +
      'Consumer Price Index, EPA = Labour Force Survey). Optional search filters by name substring. ' +
      'Returns operation_code for use in ine-spain.tables. Data: servicios.ine.es (Instituto ' +
      'Nacional de Estadística Tempus3 API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ine-spain.tables',
    mcpName: 'ine-spain.reference.tables',
    title: 'INE Spain Tables for Operation',
    description:
      'List the published data tables under a Spanish statistical operation (operation_code from ' +
      'ine-spain.operations, e.g. "IPC" or "EPA"). Returns table_id, name, and covered period for ' +
      'use in ine-spain.table_data. Data: servicios.ine.es (INE Tempus3 API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ine-spain.table_data',
    mcpName: 'ine-spain.series.table_data',
    title: 'INE Spain Table Data',
    description:
      'Get the most-recent data points (1-6 periods, default 1) for EVERY series in a table ' +
      '(table_id from ine-spain.tables). Tables can bundle hundreds of series, so periods is capped ' +
      'tightly — use ine-spain.series_data for a longer single-series history. Data: servicios.ine.es ' +
      '(INE Tempus3 API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'ine-spain.series_data',
    mcpName: 'ine-spain.series.data',
    title: 'INE Spain Series Data',
    description:
      'Get up to 100 most-recent data points plus rich metadata (period name, provisional flag) for ' +
      'ONE specific series (series_code, e.g. "IPC251856" — from an ine-spain.table_data result COD ' +
      'field or the INE website). An unrecognized series_code returns an empty upstream response. ' +
      'Data: servicios.ine.es (INE Tempus3 API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  // CZSO — Czech Statistical Office VDB open-data catalog (3) — UC-664
  {
    toolId: 'czso.dataset_list',
    mcpName: 'czso.reference.dataset_list',
    title: 'CZSO Dataset Catalog',
    description:
      'Browse the Czech Statistical Office open-data catalog (~1000 datasets: demographics, ' +
      'prices, census, territorial statistics). Optional id_prefix substring filter narrows by ' +
      'dataset id — CZSO has no full-text search. Returns dataset_id + title + temporal coverage ' +
      'for use in czso.dataset_metadata and czso.dataset_data. Data: vdb.czso.cz (Czech ' +
      'Statistical Office open-data catalog), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'czso.dataset_metadata',
    mcpName: 'czso.reference.dataset_metadata',
    title: 'CZSO Dataset Metadata',
    description:
      'Get full metadata for one CZSO dataset (dataset_id from czso.dataset_list) — description, ' +
      'update frequency, temporal coverage, tags, and the resource list (download URL + format) ' +
      'needed before calling czso.dataset_data. Data: vdb.czso.cz (Czech Statistical Office ' +
      'open-data catalog), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'czso.dataset_data',
    mcpName: 'czso.series.dataset_data',
    title: 'CZSO Dataset Data',
    description:
      "Fetch rows from a CZSO dataset's CSV data file (dataset_id from czso.dataset_list). " +
      'Column names vary per dataset (e.g. "vuzemi_txt" for territory, "rok" for year) — call ' +
      'once without filter_column to see the header, then narrow with filter_column + ' +
      'filter_value (substring match). Rows capped 1-500 (default 50). Datasets whose only ' +
      'resource is not CSV (e.g. ZIP) are rejected with a pointer to the raw download URL. Data: ' +
      'vdb.czso.cz (Czech Statistical Office open-data catalog), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  // Statistik Austria — data.statistik.gv.at open-data portal (4) — UC-665
  {
    toolId: 'statistik-austria.dataset_search',
    mcpName: 'statistik-austria.reference.dataset_search',
    title: 'Statistik Austria Dataset Search',
    description:
      'Browse/search the Statistik Austria open-data catalog (~540 datasets: population, ' +
      'prices, labour market, foreign trade, industry indices). Optional search substring ' +
      'filters on title or dataset_id, case-insensitive — Statistik Austria has no full-text ' +
      'search API. Returns dataset_id + title for use in statistik-austria.dataset_metadata and ' +
      'statistik-austria.dataset_data. Data: data.statistik.gv.at (Statistik Austria), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'statistik-austria.dataset_metadata',
    mcpName: 'statistik-austria.reference.dataset_metadata',
    title: 'Statistik Austria Dataset Metadata',
    description:
      'Get full metadata for one Statistik Austria dataset (dataset_id from ' +
      'statistik-austria.dataset_search) — title, notes, tags, license, update frequency, ' +
      'resource list, column meanings (attribute_description), and the category_dimensions ' +
      'list needed for statistik-austria.category_codes. Data: data.statistik.gv.at (Statistik ' +
      'Austria), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'statistik-austria.dataset_data',
    mcpName: 'statistik-austria.series.dataset_data',
    title: 'Statistik Austria Dataset Data',
    description:
      "Fetch rows from a Statistik Austria dataset's CSV data file (dataset_id from " +
      'statistik-austria.dataset_search). Column codes are opaque (e.g. "C-STAATS-0", ' +
      '"F-VESTE_AM") — use statistik-austria.dataset_metadata for column meanings and ' +
      'statistik-austria.category_codes to decode category values (e.g. "STAATS-9"). Rows ' +
      'capped 1-200 (default 20). Data: data.statistik.gv.at (Statistik Austria), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'statistik-austria.category_codes',
    mcpName: 'statistik-austria.reference.category_codes',
    title: 'Statistik Austria Category Codes',
    description:
      "Decode a categorical column's codes into German + English display names (e.g. " +
      '"STAATS-9" -> "Insgesamt" / "Total"). Requires dataset_id and dimension_code (format ' +
      '"C-{NAME}-{N}", from statistik-austria.dataset_metadata\'s category_dimensions list). ' +
      'Data: data.statistik.gv.at (Statistik Austria), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  // Hungary KSH — Központi Statisztikai Hivatal open-data portal (3) — UC-666
  {
    toolId: 'hungary-ksh.dataset_search',
    mcpName: 'hungary-ksh.reference.dataset_search',
    title: 'Hungary KSH Dataset Search',
    description:
      'Search/browse the 13 High-Value Datasets published by the Hungarian Central Statistical ' +
      'Office (population, national accounts, prices, industrial production, tourism, etc. — the ' +
      'full EU-mandated HVD category list, not a paginated catalog). Optional query substring ' +
      'filters hu+en titles/keywords/themes. Returns dataset_id + title for use in ' +
      'hungary-ksh.dataset_metadata and hungary-ksh.dataset_data. Data: data.ksh.hu (KSH), no ' +
      'auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hungary-ksh.dataset_metadata',
    mcpName: 'hungary-ksh.reference.dataset_metadata',
    title: 'Hungary KSH Dataset Metadata',
    description:
      'Get full metadata for one KSH dataset (dataset_id from hungary-ksh.dataset_search) — ' +
      'title, description, and the distribution list (distribution_id, format CSV/XML, download ' +
      'URL, temporal coverage, license) needed before calling hungary-ksh.dataset_data. Data: ' +
      'data.ksh.hu (KSH), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'hungary-ksh.dataset_data',
    mcpName: 'hungary-ksh.series.dataset_data',
    title: 'Hungary KSH Dataset Data',
    description:
      'Fetch rows from one KSH dataset distribution (dataset_id + distribution_id from ' +
      'hungary-ksh.dataset_metadata). Distributions are semicolon-delimited CSV or SDMX-ML XML — ' +
      'both parsed into the same header + rows shape. Column names vary per distribution (e.g. ' +
      '"GEO", "TIME", "SEX", "OBS_VALUE") — call once without filter_column to see the header, ' +
      'then narrow with filter_column + filter_value (substring match). Rows capped 1-500 ' +
      '(default 50). Distributions above 5MB are rejected with a pointer to the raw download URL. ' +
      'Data: data.ksh.hu (KSH), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  // Slovakia Statistics — Statistical Office of the Slovak Republic "DATAcube." (3) — UC-667
  {
    toolId: 'slovakia-statistics.dataset_search',
    mcpName: 'slovakia-statistics.reference.dataset_search',
    title: 'Slovakia Statistics Dataset Search',
    description:
      'Search/browse the 675 statistical tables published by the Statistical Office of the ' +
      'Slovak Republic ("DATAcube.") — population, earnings, prices, labour market, households, ' +
      'and more. Optional query substring filters table labels and cube codes (no full-text ' +
      'search endpoint upstream — filtered client-side). Returns cube_code + dimension_codes for ' +
      'use in slovakia-statistics.dataset_metadata and slovakia-statistics.dataset_data. Data: ' +
      'data.statistics.sk (JSON-stat 2.0 REST API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'slovakia-statistics.dataset_metadata',
    mcpName: 'slovakia-statistics.reference.dataset_metadata',
    title: 'Slovakia Statistics Dataset Metadata',
    description:
      'Get the dimensions and valid value codes for one DATAcube table (cube_code from ' +
      'slovakia-statistics.dataset_search) — every dimension (e.g. year, region, indicator, sex) ' +
      'with its full list of selectable codes and labels, needed to build the "selections" ' +
      'object for slovakia-statistics.dataset_data. Data: data.statistics.sk, no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'slovakia-statistics.dataset_data',
    mcpName: 'slovakia-statistics.series.dataset_data',
    title: 'Slovakia Statistics Dataset Data',
    description:
      'Fetch data rows from one DATAcube table (cube_code + selections from ' +
      'slovakia-statistics.dataset_metadata — one value per dimension, supports single codes, ' +
      'comma lists, ranges, "lastN", and "*" wildcards). Returns one row per data point with each ' +
      "dimension's code + label and the value. Rows capped 1-1000 (default 200). Data: " +
      'data.statistics.sk, no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  // Latvia Statistics — Central Statistical Bureau of Latvia PXWeb API (3) — UC-668
  {
    toolId: 'latvia-statistics.catalog',
    mcpName: 'latvia-statistics.reference.catalog',
    title: 'Latvia Statistics Catalog Browse',
    description:
      "Browse the Central Statistical Bureau of Latvia's statistics database tree by path. " +
      'Top-level categories: POP (population), EMP (labour market), VES (social security and ' +
      'health), IZG (education, culture and science), VEK (economy), TIR (trade and services), ' +
      'ENT (business), IKT (information technologies), ENV (environment), FIN (indicators of ' +
      'well-being and equality). Returns child nodes (subcategories, type=l) or table ' +
      "descriptors at leaf nodes (type=t). Use empty path '' to get top-level categories. " +
      'Navigate hierarchically until type=t nodes appear, then use ' +
      'latvia-statistics.table_metadata. Data: data.stat.gov.lv (PXWeb API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'latvia-statistics.table_metadata',
    mcpName: 'latvia-statistics.reference.table_metadata',
    title: 'Latvia Statistics Table Metadata',
    description:
      'Get metadata for a specific Latvia statistics table — title, dimensions (e.g. ' +
      'INDICATOR, TIME, ContentsCode), valid value codes for each dimension, and latest update ' +
      'timestamp. Use this BEFORE latvia-statistics.table_query to discover accepted filter ' +
      "values. Example path: 'POP/IR/IRS/IRS010' (population at the beginning of year, key " +
      'vital statistics). Data: data.stat.gov.lv, no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'latvia-statistics.table_query',
    mcpName: 'latvia-statistics.series.table_query',
    title: 'Latvia Statistics Table Query',
    description:
      'Run a statistical query against a Latvia statistics table — specify dimension filters ' +
      'to slice data by indicator, time period, region, etc. Returns JSON-stat2 format with ' +
      'labeled dimensions and numeric values. Always call latvia-statistics.table_metadata ' +
      'first to discover valid dimension codes and value codes. Example: population at start ' +
      "of year (INDICATOR='POP_SY'), latest year (TIME filter='top' values=['1']). Data: " +
      'data.stat.gov.lv, no auth required, CC BY 4.0 (Central Statistical Bureau of Latvia).',
    category: 'finance',
    annotations: READ_ONLY,
  },
  // Iceland Statistics — Statistics Iceland (Hagstofa Íslands) PXWeb API (3) — UC-669
  {
    toolId: 'iceland-statistics.catalog',
    mcpName: 'iceland-statistics.reference.catalog',
    title: 'Iceland Statistics Catalog Browse',
    description:
      "Browse Statistics Iceland's (Hagstofa Íslands) statistics database tree by path. " +
      'Top-level databases: Atvinnuvegir (industries/sectors: fisheries, agriculture, tourism), ' +
      'Efnahagur (economy: prices, national accounts, public finance, trade), Ibuar (population: ' +
      'migration, births/deaths, family, elections, census), Samfelag (society: labour market, ' +
      'education, wages, health, culture, justice), Umhverfi (environment: land, air quality, ' +
      'energy, transport). Returns child nodes (subcategories, type=l) or table descriptors at ' +
      "leaf nodes (type=t). Use empty path '' to get the top-level databases. Navigate " +
      'hierarchically until type=t nodes appear, then use iceland-statistics.table_metadata. ' +
      'Data: px.hagstofa.is (PXWeb API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'iceland-statistics.table_metadata',
    mcpName: 'iceland-statistics.reference.table_metadata',
    title: 'Iceland Statistics Table Metadata',
    description:
      'Get metadata for a specific Iceland statistics table — title, dimensions (e.g. Ár/Year, ' +
      'Eining/Unit), valid value codes for each dimension, and latest update timestamp. Use this ' +
      'BEFORE iceland-statistics.table_query to discover accepted filter values. Example path: ' +
      "'Ibuar/mannfjoldi/1_yfirlit/yfirlit_mannfjolda/MAN00000.px' (population key figures since " +
      '1703). Data: px.hagstofa.is, no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'iceland-statistics.table_query',
    mcpName: 'iceland-statistics.series.table_query',
    title: 'Iceland Statistics Table Query',
    description:
      'Run a statistical query against an Iceland statistics table — specify dimension filters ' +
      'to slice data by year, unit, and other indicators. Returns JSON-stat2 format with labeled ' +
      'dimensions and numeric values. Always call iceland-statistics.table_metadata first to ' +
      "discover valid dimension codes and value codes (often Icelandic words, e.g. 'Ár' for " +
      "year). Example: population 1 January (Eining='0'), 3 most recent years (Ár filter='top' " +
      "values=['3']). Data: px.hagstofa.is, no auth required, CC BY 4.0 (Statistics Iceland).",
    category: 'finance',
    annotations: READ_ONLY,
  },
  // Estonia Statistics — Statistics Estonia (Statistikaamet) PXWeb API (3) — UC-670
  {
    toolId: 'estonia-statistics.catalog',
    mcpName: 'estonia-statistics.reference.catalog',
    title: 'Estonia Statistics Catalog Browse',
    description:
      "Browse Statistics Estonia's (Statistikaamet) statistics database tree by path. " +
      'Top-level databases: keskkond (environment), majandus (economy), rahvastik (population: ' +
      'migration, births/deaths, family), sotsiaalelu (social life: labour market, education, ' +
      'health), eri-valdkondade-statistika (multidomain statistics), rahvaloendus (population ' +
      'and housing census), Lepetatud_tabelid (discontinued datasets). Returns child nodes ' +
      "(subcategories, type=l) or table descriptors at leaf nodes (type=t). Use empty path '' " +
      'to get the top-level databases. Navigate hierarchically until type=t nodes appear, then ' +
      'use estonia-statistics.table_metadata. Data: andmed.stat.ee (PXWeb API), no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'estonia-statistics.table_metadata',
    mcpName: 'estonia-statistics.reference.table_metadata',
    title: 'Estonia Statistics Table Metadata',
    description:
      'Get metadata for a specific Estonia statistics table — title, dimensions (e.g. ' +
      'Aasta/Year, Näitaja/Indicator), valid value codes for each dimension, and latest update ' +
      'timestamp. Use this BEFORE estonia-statistics.table_query to discover accepted filter ' +
      "values. Example path: 'rahvastik/rahvastikunaitajad-ja-koosseis/" +
      "demograafilised-pehinaitajad/RV030.PX' (births, deaths and natural increase). " +
      'Data: andmed.stat.ee, no auth required.',
    category: 'finance',
    annotations: READ_ONLY,
  },
  {
    toolId: 'estonia-statistics.table_query',
    mcpName: 'estonia-statistics.series.table_query',
    title: 'Estonia Statistics Table Query',
    description:
      'Run a statistical query against an Estonia statistics table — specify dimension filters ' +
      'to slice data by year and indicator. Returns JSON-stat2 format with labeled dimensions ' +
      'and numeric values. Always call estonia-statistics.table_metadata first to discover ' +
      "valid dimension codes and value codes (often Estonian words, e.g. 'Aasta' for year). " +
      "Example: births/deaths/natural increase (Näitaja='1','2','3'), most recent year (Aasta " +
      "filter='top' values=['1']). Data: andmed.stat.ee, no auth required, CC BY-SA 4.0 " +
      '(Statistics Estonia).',
    category: 'finance',
    annotations: READ_ONLY,
  },
  // ---------------------------------------------------------------------------
  // Ф5 physical-device MCP layer -- device.list/state/command (2026-09-02)
  // Generic vendor-agnostic projection; Tuya is the only connected vendor
  // cloud this cycle (see adapters/device-tuya). Requires the caller to
  // have already linked a vendor account via /connect/device/tuya/start.
  // ---------------------------------------------------------------------------
  {
    toolId: 'device.list',
    mcpName: 'device.registry.list',
    title: 'List Connected Devices',
    description:
      "List every physical device reachable through the calling agent's own linked vendor accounts (Tuya first). Returns each device's vendor id, name, category, and online status, grouped by connection_id. Empty if the agent has not linked any vendor account yet -- see /connect/device/vendors.",
    category: 'device',
    annotations: READ_ONLY,
  },
  {
    toolId: 'device.state',
    mcpName: 'device.registry.state',
    title: 'Get Device State',
    description:
      'Read the current state (data points) of one physical device the calling agent owns via a linked vendor connection. Requires connection_id (from device.list) and device_id.',
    category: 'device',
    annotations: READ_ONLY,
  },
  {
    toolId: 'device.command',
    mcpName: 'device.registry.command',
    title: 'Send Device Command',
    description:
      "⚡ ACTION: Send a command to a physical device the calling agent owns via a linked vendor connection (e.g. turn a plug on/off, set an AC temperature). Numeric setpoints are bounds-checked against the device class's configured safety limits (config/device-classes.json); some device classes require confirm:true. Requires connection_id, device_id, command, value.",
    category: 'device',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
];
