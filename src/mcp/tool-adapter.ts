/**
 * MCP tool adapter (§12.42, §6.14).
 *
 * Maps all platform tools to MCP server tool registrations.
 * Each tool call routes through the full 13-stage pipeline.
 *
 * mcpName = 3-level dot-notation for MCP clients (Smithery quality score).
 * toolId  = 2-level internal pipeline ID (DB, adapters, schemas).
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toolSchemas } from '../schemas/index';
import { createPipelineContext } from '../pipeline/types';
import { runPipeline } from '../pipeline/pipeline';
import { logger } from '../config/logger';
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
];

/**
 * Register all platform tools on an McpServer instance.
 *
 * Each tool callback creates a PipelineContext and runs the 13-stage pipeline.
 * The API key is injected into synthetic headers so the AUTH stage validates it.
 *
 * MCP clients see mcpName (3-level), pipeline uses toolId (2-level).
 */
export function registerTools(server: McpServer, apiKey: string, requestId: string): void {
  for (const def of TOOL_DEFINITIONS) {
    const schema = toolSchemas[def.toolId];
    if (!schema) {
      logger.warn({ tool_id: def.toolId }, 'No schema found for tool, skipping MCP registration');
      continue;
    }

    // Extract raw shape from ZodObject for MCP SDK registerTool
    const shape =
      schema instanceof z.ZodObject ? (schema.shape as Record<string, z.ZodTypeAny>) : undefined;

    if (!shape) {
      logger.warn({ tool_id: def.toolId }, 'Schema is not a ZodObject, skipping MCP registration');
      continue;
    }

    const mcpName = def.mcpName || def.toolId;
    const toolId = def.toolId;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK generics cause deep type recursion with complex Zod shapes
    (server.registerTool as any)(
      mcpName,
      {
        title: def.title,
        description: def.description,
        inputSchema: shape,
        annotations: def.annotations,
      },
      async (args: Record<string, unknown>) => {
        const ctx = createPipelineContext(requestId, 'POST', '/mcp', args, {
          authorization: `Bearer ${apiKey}`,
        });
        ctx.toolId = toolId;

        const result = await runPipeline(ctx);

        if (result.ok) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result.value.responseBody),
              },
            ],
          };
        }

        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: result.error.error,
                message: result.error.message,
                request_id: requestId,
              }),
            },
          ],
        };
      },
    );
  }
}
