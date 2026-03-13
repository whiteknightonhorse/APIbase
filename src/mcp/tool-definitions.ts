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

  // Aviasales (7)
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
    toolId: 'aviasales.hotel_search',
    mcpName: 'aviasales.hotels.search',
    title: 'Search Hotels',
    description: 'Search for hotels in a city',
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
];
