/**
 * MCP tool adapter (§12.42, §6.14).
 *
 * Maps all 34 platform tools to MCP server tool registrations.
 * Each tool call routes through the full 13-stage pipeline.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toolSchemas } from '../schemas/index';
import { createPipelineContext } from '../pipeline/types';
import { runPipeline } from '../pipeline/pipeline';
import { logger } from '../config/logger';
import type { McpToolDefinition } from './types';

/**
 * Static tool definitions for all 30 tools.
 */
export const TOOL_DEFINITIONS: McpToolDefinition[] = [
  // Weather (7)
  { toolId: 'weather.get_current', description: 'Get current weather conditions for a location' },
  { toolId: 'weather.get_forecast', description: 'Get weather forecast for a location' },
  { toolId: 'weather.get_alerts', description: 'Get active weather alerts for a location' },
  {
    toolId: 'weather.get_history',
    description: 'Get historical weather data for a location and date',
  },
  { toolId: 'weather.air_quality', description: 'Get air quality index for a location' },
  { toolId: 'weather.geocode', description: 'Geocode a location query to coordinates' },
  { toolId: 'weather.compare', description: 'Compare weather across multiple locations' },

  // Crypto (9)
  { toolId: 'crypto.get_price', description: 'Get current prices for cryptocurrencies' },
  { toolId: 'coingecko.get_market', description: 'Get cryptocurrency market data by category' },
  { toolId: 'crypto.coin_detail', description: 'Get detailed information about a cryptocurrency' },
  { toolId: 'crypto.price_history', description: 'Get price history for a cryptocurrency' },
  { toolId: 'crypto.trending', description: 'Get trending cryptocurrencies' },
  { toolId: 'crypto.global', description: 'Get global cryptocurrency market statistics' },
  { toolId: 'crypto.dex_pools', description: 'Get DEX liquidity pool data' },
  { toolId: 'crypto.token_by_address', description: 'Get token info by contract address' },
  { toolId: 'crypto.search', description: 'Search for cryptocurrencies by name or symbol' },

  // Polymarket (12: 7 read-only + 5 trading)
  { toolId: 'polymarket.search', description: 'Search prediction markets on Polymarket' },
  {
    toolId: 'polymarket.market_detail',
    description: 'Get detailed info about a prediction market',
  },
  { toolId: 'polymarket.prices', description: 'Get midpoint price for a prediction market token' },
  { toolId: 'polymarket.price_history', description: 'Get price history for a prediction market' },
  { toolId: 'polymarket.get_orderbook', description: 'Get order book for a prediction market' },
  { toolId: 'polymarket.trending', description: 'Get trending prediction markets' },
  { toolId: 'polymarket.place_order', description: 'Place a limit order on Polymarket' },
  { toolId: 'polymarket.cancel_order', description: 'Cancel an open order on Polymarket' },
  { toolId: 'polymarket.open_orders', description: 'Get open orders on Polymarket' },
  { toolId: 'polymarket.trade_history', description: 'Get trade history on Polymarket' },
  { toolId: 'polymarket.balance', description: 'Get balance/allowance on Polymarket' },

  // Sabre GDS (4)
  { toolId: 'sabre.search_flights', description: 'Search for real-time flight offers with prices between airports (Sabre GDS)' },
  { toolId: 'sabre.destination_finder', description: 'Find cheapest flight destinations from an origin airport' },
  { toolId: 'sabre.airline_lookup', description: 'Look up airline details by IATA or ICAO code' },
  { toolId: 'sabre.travel_themes', description: 'Get travel theme categories (beach, skiing, romantic, etc.)' },

  // Amadeus Travel APIs (7)
  { toolId: 'amadeus.flight_search', description: 'Search for real-time flight offers between airports with prices, airlines, stops, and duration (Amadeus)' },
  { toolId: 'amadeus.flight_price', description: 'Confirm and get final pricing for a flight offer from Amadeus flight search' },
  { toolId: 'amadeus.flight_status', description: 'Get real-time status of a specific flight — delays, cancellations, gate info (Amadeus)' },
  { toolId: 'amadeus.airport_search', description: 'Search airports and cities by keyword or IATA code with autocomplete (Amadeus)' },
  { toolId: 'amadeus.airport_nearest', description: 'Find nearest airports by geographic coordinates (Amadeus)' },
  { toolId: 'amadeus.airport_routes', description: 'Get all direct flight destinations from an airport (Amadeus)' },
  { toolId: 'amadeus.airline_lookup', description: 'Look up airline details by IATA or ICAO code (Amadeus)' },

  // Aviasales (7)
  { toolId: 'aviasales.search_flights', description: 'Search for flights between airports' },
  { toolId: 'aviasales.price_calendar', description: 'Get flight price calendar for a route' },
  { toolId: 'aviasales.cheap_flights', description: 'Find cheapest flights from an origin' },
  { toolId: 'aviasales.popular_routes', description: 'Get popular flight routes from an origin' },
  { toolId: 'aviasales.hotel_search', description: 'Search for hotels in a city' },
  { toolId: 'aviasales.nearby_destinations', description: 'Find nearby flight destinations' },
  { toolId: 'aviasales.airport_lookup', description: 'Look up airport by name or code' },
];

/**
 * Register all platform tools on an McpServer instance.
 *
 * Each tool callback creates a PipelineContext and runs the 13-stage pipeline.
 * The API key is injected into synthetic headers so the AUTH stage validates it.
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

    const toolId = def.toolId;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK generics cause deep type recursion with complex Zod shapes
    (server.registerTool as any)(
      toolId,
      { description: def.description, inputSchema: shape },
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
