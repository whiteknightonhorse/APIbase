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
      'Search for real-time flight offers between airports with prices, airlines, stops, and duration (Amadeus)',
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
      'List all published AI marketing pages for a website with URLs, titles, and publish dates (AIPush)',
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
      'Start a full AI market intelligence report for any website. Provide a URL (e.g. "https://stripe.com") — the system crawls the site, extracts value propositions and services, identifies competitors, scores them, finds keyword gaps and market opportunities. Returns report_id — poll with aipush.market_report_status. Takes ~2 minutes. Cost: $29.99 (AIPush MIP)',
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
      'Create a short URL from any long URL. Optional custom slug. Returns short link at apibase.short.gy. 1,000 free links/month (Short.io)',
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
      'Take a screenshot of any URL — returns image URL. Chrome-based rendering, supports full-page capture, custom viewport, ad blocking, cookie banner removal. Waits for JS-heavy SPAs to load (ApiFlash)',
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
      'Send SMS message to any phone number worldwide. Requires a Twilio phone number as sender. Returns message SID and delivery status. $0.0083/SMS US outbound (Twilio)',
    category: 'messaging',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },

  // ---------------------------------------------------------------------------
  // Stability AI — Image Generation (UC-080, 1 tool)
  // ---------------------------------------------------------------------------
  {
    toolId: 'stability.generate',
    mcpName: 'ai.image.generate',
    title: 'Generate Image (Stability AI)',
    description:
      'Generate images from text prompts using Stable Diffusion — supports style presets (anime, cinematic, pixel-art, photographic...), aspect ratios, negative prompts. Returns base64 PNG data URI. Powered by Stability AI',
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
      'Send transactional email — plain text or HTML body, multiple recipients, reply-to. Requires verified sender domain. 3,000 free emails/month (Resend)',
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
      'Create a managed headless browser session on Browserbase infrastructure. Returns session ID and WebSocket connect URL for Puppeteer/Playwright. Choose region (US/EU/Asia) and optional residential proxy. Sessions auto-expire after 5 minutes of inactivity (Browserbase)',
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
      'Send a text message to a Telegram user or group chat. Supports Markdown (*bold*, _italic_, `code`, [link](url)) and HTML formatting. Max 4096 chars. Perfect for alerts, notifications, reports (Telegram Bot API)',
    category: 'messaging',
    annotations: TRADING,
  },
  {
    toolId: 'telegram.send_photo',
    mcpName: 'messaging.telegram.send_photo',
    title: 'Send Telegram Photo',
    description:
      'Send a photo to a Telegram chat with optional caption. Provide image URL — supports JPG, PNG, GIF up to 10MB (Telegram Bot API)',
    category: 'messaging',
    annotations: TRADING,
  },
  {
    toolId: 'telegram.send_document',
    mcpName: 'messaging.telegram.send_document',
    title: 'Send Telegram Document',
    description:
      'Send a file/document to a Telegram chat — PDF, CSV, ZIP, any format up to 50MB. Perfect for sending reports, data exports, generated files (Telegram Bot API)',
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
      'Purchase and register a domain name (1-10 years). Includes free WHOIS privacy protection. Domain is registered instantly. Prices: .com ~$21, .org ~$12, .dev ~$18, .io ~$42 (NameSilo)',
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
      'Create a new DNS record (A, AAAA, CNAME, MX, TXT) for a Cloudflare zone. Set content (IP/hostname), TTL, and CDN proxy status. Returns new record ID (Cloudflare)',
    category: 'infrastructure',
    annotations: TRADING,
  },
  {
    toolId: 'cloudflare.dns_delete',
    mcpName: 'infra.cloudflare.dns_delete',
    title: 'Delete DNS Record',
    description:
      'Delete a DNS record from a Cloudflare zone by record ID. Removes the record immediately (Cloudflare)',
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
      'Purge Cloudflare CDN cache — all cached files or specific URLs (max 30). Forces CDN to fetch fresh content from origin server (Cloudflare)',
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
      'Execute source code in a sandboxed environment — 71 programming languages supported (Python, JavaScript, Java, C++, Go, Rust, C#, Bash, Ruby, PHP, and 60+ more). Returns stdout, stderr, execution time, and memory usage. Safe sandboxed execution with CPU/memory limits. Use code.languages to get language IDs (Judge0 CE)',
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
      'Extract raw HTML from any URL — cheapest web scraping API ($0.00013 for simple sites). Returns decoded HTML content, HTTP status code, and content length. Use for data extraction, content analysis, or price monitoring. Handles anti-bot protection automatically (Zyte)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'scrape.browser',
    mcpName: 'web.scrape.browser',
    title: 'Browser-Rendered Page HTML',
    description:
      'Render a URL with headless browser and return JS-rendered HTML. Use for SPAs, React/Vue apps, or pages with dynamic content that raw HTTP cannot capture. Returns fully rendered DOM as HTML text (Zyte)',
    category: 'developer',
    annotations: READ_ONLY,
  },
  {
    toolId: 'scrape.screenshot',
    mcpName: 'web.scrape.screenshot',
    title: 'Web Page Screenshot',
    description:
      'Capture a full-page screenshot of any URL — returns base64-encoded PNG image. Use for visual verification, monitoring, or archiving. Headless browser renders the page before capture (Zyte)',
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
      'Register a tracking number to begin monitoring shipment status. Auto-detects carrier from 3,200+ supported carriers worldwide (UPS, FedEx, DHL, USPS, China Post, Royal Mail, etc.). Must be called before tracking.status. Returns detected carrier and registration status. Consumes quota — 200 free/month (17TRACK)',
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
      'Execute up to 20 tool calls in a single request with parallel execution (max 10 concurrent). Each call runs the full pipeline independently with its own billing. Returns array of results with per-call status, data, cost, and duration. Save 5x round-trips vs sequential calls. Batch wrapper is free — you pay only for individual tool calls (APIbase)',
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
      'Generate a captioned meme image from a template ID + top/bottom text. Returns direct image URL. Use imgflip.memes to find template IDs. 100K+ templates available (Imgflip)',
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
];
