/**
 * MCP tool adapter (§12.42, §6.14).
 *
 * Maps all 30 platform tools to MCP server tool registrations.
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

  // Polymarket (7)
  { toolId: 'polymarket.search', description: 'Search prediction markets on Polymarket' },
  {
    toolId: 'polymarket.market_detail',
    description: 'Get detailed info about a prediction market',
  },
  { toolId: 'polymarket.prices', description: 'Get current prices for prediction markets' },
  { toolId: 'polymarket.price_history', description: 'Get price history for a prediction market' },
  { toolId: 'polymarket.get_orderbook', description: 'Get order book for a prediction market' },
  { toolId: 'polymarket.trending', description: 'Get trending prediction markets' },
  { toolId: 'polymarket.leaderboard', description: 'Get Polymarket trader leaderboard' },

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
