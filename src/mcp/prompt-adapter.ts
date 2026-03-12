/**
 * MCP prompt adapter — workflow prompts for AI agents.
 *
 * Registers reusable prompt templates that guide agents through
 * multi-tool workflows on the APIbase platform.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Register all workflow prompts on an McpServer instance.
 */
export function registerPrompts(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK generics cause deep type recursion with Zod schemas
  const srv = server as any;

  // --- Flight search workflow ---
  srv.prompt(
    'find_cheapest_flight',
    'Search for the cheapest flights between two airports and confirm pricing',
    {
      origin: z.string().describe('Origin airport IATA code (e.g. JFK)'),
      destination: z.string().describe('Destination airport IATA code (e.g. CDG)'),
      date: z.string().describe('Departure date in YYYY-MM-DD format'),
    },
    (args: { origin: string; destination: string; date: string }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Find the cheapest flight from ${args.origin} to ${args.destination} on ${args.date}.`,
              '',
              'Steps:',
              `1. Use amadeus.flight_search with origin="${args.origin}", destination="${args.destination}", departure_date="${args.date}", max_results=5`,
              '2. Compare the results by price and number of stops',
              '3. For the cheapest option, use amadeus.flight_price to confirm the final price',
              '4. Present a summary: airline, departure/arrival times, stops, and confirmed price',
            ].join('\n'),
          },
        },
      ],
    }),
  );

  // --- Crypto market overview workflow ---
  srv.prompt(
    'crypto_market_overview',
    'Get a comprehensive overview of the cryptocurrency market',
    () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              'Give me a comprehensive crypto market overview.',
              '',
              'Steps:',
              '1. Use crypto.global to get total market cap, 24h volume, and BTC dominance',
              '2. Use coingecko.get_market with sort_by="market_cap_desc", limit=10 for top coins',
              '3. Use crypto.trending to see what coins are trending right now',
              '4. Summarize: overall market health, top movers, and notable trends',
            ].join('\n'),
          },
        },
      ],
    }),
  );

  // --- Prediction market research workflow ---
  srv.prompt(
    'prediction_market_research',
    'Research a topic on Polymarket prediction markets',
    {
      topic: z.string().describe('Topic to research (e.g. US election, Bitcoin price)'),
    },
    (args: { topic: string }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Research prediction markets about: ${args.topic}`,
              '',
              'Steps:',
              `1. Use polymarket.search with query="${args.topic}", sort_by="volume", limit=5`,
              '2. For each relevant market, use polymarket.market_detail to get full details',
              '3. Use polymarket.prices on the most active market to get current probabilities',
              '4. Summarize: what the market predicts, confidence levels, and trading volume',
            ].join('\n'),
          },
        },
      ],
    }),
  );
}
