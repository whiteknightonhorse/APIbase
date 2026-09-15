/**
 * MCP prompt adapter — workflow prompts for AI agents.
 *
 * Registers reusable prompt templates that guide agents through
 * multi-tool workflows on the APIbase platform.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOL_DEFINITIONS } from './tool-definitions';
import { discover, type DiscoverResult } from '../services/discovery.service';
import type { McpToolDefinition } from './types';

/* ------------------------------------------------------------------ */
/*  discover_tools — progressive disclosure helper                    */
/*                                                                     */
/*  ZZ-03-05 (zz-03 Q1 ruling-1): this prompt is now a thin wrapper    */
/*  around discovery.service.ts's discover() — same ranking, same     */
/*  quality/availability data as the apibase.discover MCP tool and    */
/*  GET /api/v1/discover, rendered as text instead of JSON. Kept       */
/*  registered for backward compatibility (existing clients that      */
/*  already call this prompt); it is no longer the only discovery     */
/*  surface an agent can reach — see apibase.discover.                */
/* ------------------------------------------------------------------ */

/** Build category → tool[] index once at startup. Categories auto-derived from tool definitions.
 *  Used only for the "no args" category listing and to validate an unknown ?category= up front
 *  — the actual ranking/filtering below all goes through discover(). */
function buildCategoryIndex(): Map<string, McpToolDefinition[]> {
  const idx = new Map<string, McpToolDefinition[]>();
  for (const t of TOOL_DEFINITIONS) {
    const cat = t.category ?? 'other';
    let arr = idx.get(cat);
    if (!arr) {
      arr = [];
      idx.set(cat, arr);
    }
    arr.push(t);
  }
  return idx;
}

const categoryIndex = buildCategoryIndex();

/** Sorted category names — auto-derived, no hardcoded list. */
const CATEGORIES = [...categoryIndex.keys()].sort();

const MAX_RESULTS = 18;

/** Format a discover() result for text output, with related tools and required params. */
function formatDiscoverResult(r: DiscoverResult): string {
  const paramHint = r.input_required.length > 0 ? ` (params: ${r.input_required.join(', ')})` : '';
  let line = `- ${r.mcp_name}: ${r.title}${paramHint} [$${r.price.price_usd}, ${r.category}]`;
  if (r.related.length > 0) {
    const hints = r.related
      .slice(0, 3)
      .map((rel) => `${rel.tool_id} (${rel.reason})`)
      .join(', ');
    line += `\n  → Related: ${hints}`;
  }
  return line;
}

/** Produce the discover_tools response text — renders discover()'s JSON, doesn't rank on its own. */
async function discoverTools(args: { task?: string; category?: string }): Promise<string> {
  const task = args.task?.trim() || undefined;
  const category = args.category?.trim().toLowerCase() || undefined;

  if (category && !categoryIndex.has(category)) {
    return [
      `No tools found for category "${category}".`,
      '',
      `Available categories: ${CATEGORIES.join(', ')}`,
    ].join('\n');
  }

  // --- No args: return category index (pure browsing aid, no ranking involved) ---
  if (!task && !category) {
    const lines = [
      `APIbase Tool Catalog — ${TOOL_DEFINITIONS.length} tools across ${CATEGORIES.length} categories:`,
      '',
    ];
    for (const cat of CATEGORIES) {
      const count = categoryIndex.get(cat)?.length ?? 0;
      if (count > 0) lines.push(`- ${cat}: ${count} tools`);
    }
    lines.push(
      '',
      'Use discover_tools with category="<name>" or task="<description>" to find relevant tools,',
      'or call the apibase.discover tool directly for the full JSON contract (pricing, payment',
      'rails, live availability, quality).',
      'All tools remain callable via tools/call regardless of discovery.',
      '',
      'APIbase provides real-world API data (flights, stocks, weather, jobs, products).',
      'Pair with Playwright (browser) and Context7 (docs) for a complete agent toolkit.',
    );
    return lines.join('\n');
  }

  const resp = await discover({ intent: task, category, limit: MAX_RESULTS });

  if (resp.results.length === 0) {
    return [
      category && task
        ? `No tools in "${category}" matched "${task}".`
        : category
          ? `No tools found for category "${category}".`
          : `No tools matched "${task}".`,
      '',
      `Try browsing by category: ${CATEGORIES.join(', ')}`,
    ].join('\n');
  }

  const header =
    category && task
      ? `Tools in "${category}" for "${task}" (${resp.results.length}):`
      : category
        ? `Tools in "${category}" (${resp.results.length}):`
        : `Tools for "${task}" (top ${resp.results.length}):`;

  const lines = [header, '', ...resp.results.map(formatDiscoverResult)];
  if (resp.truncated) {
    lines.push(
      `... and ${resp.total_matches - resp.results.length} more — combine with category= or narrow the intent`,
    );
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */

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
              `1. Use amadeus.flights.search with origin="${args.origin}", destination="${args.destination}", departure_date="${args.date}", max_results=5`,
              '2. Compare the results by price and number of stops',
              '3. For the cheapest option, use amadeus.flights.price to confirm the final price',
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
              '1. Use crypto.global.stats to get total market cap, 24h volume, and BTC dominance',
              '2. Use crypto.market.overview with sort_by="market_cap_desc", limit=10 for top coins',
              '3. Use crypto.trending.get to see what coins are trending right now',
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
              `1. Use polymarket.market.search with query="${args.topic}", sort_by="volume", limit=5`,
              '2. For each relevant market, use polymarket.market.detail to get full details',
              '3. Use polymarket.market.prices on the most active market to get current probabilities',
              '4. Summarize: what the market predicts, confidence levels, and trading volume',
            ].join('\n'),
          },
        },
      ],
    }),
  );

  // --- Tool discovery (progressive disclosure) ---
  srv.prompt(
    'discover_tools',
    `Browse ${TOOL_DEFINITIONS.length} tools by category or task description. Returns relevant tools without loading all definitions into context.`,
    {
      task: z
        .string()
        .optional()
        .describe('Describe what you want to do (e.g. "search flights from NYC to London")'),
      category: z
        .string()
        .optional()
        .describe(`Filter by category: ${CATEGORIES.join(', ')}`),
    },
    async (args: { task?: string; category?: string }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: await discoverTools(args),
          },
        },
      ],
    }),
  );
}
