/**
 * MCP prompt adapter — workflow prompts for AI agents.
 *
 * Registers reusable prompt templates that guide agents through
 * multi-tool workflows on the APIbase platform.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOL_DEFINITIONS } from './tool-definitions';
import type { McpToolDefinition } from './types';

/* ------------------------------------------------------------------ */
/*  discover_tools — progressive disclosure helper                    */
/* ------------------------------------------------------------------ */

/** Build category → tool[] index once at startup. Categories auto-derived from tool definitions. */
function buildCategoryIndex(): Map<string, McpToolDefinition[]> {
  const idx = new Map<string, McpToolDefinition[]>();
  for (const t of TOOL_DEFINITIONS) {
    const cat = t.category ?? 'other';
    let arr = idx.get(cat);
    if (!arr) { arr = []; idx.set(cat, arr); }
    arr.push(t);
  }
  return idx;
}

const categoryIndex = buildCategoryIndex();

/** Sorted category names — auto-derived, no hardcoded list. */
const CATEGORIES = [...categoryIndex.keys()].sort();

/** Simple keyword scoring: count keyword hits in title + description + category. */
function scoreByTask(tool: McpToolDefinition, keywords: string[]): number {
  const haystack = [
    tool.title ?? '',
    tool.description,
    tool.category ?? '',
    tool.toolId,
  ].join(' ').toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (haystack.includes(kw)) score++;
  }
  return score;
}

/** Extract meaningful keywords from a task description. */
function extractKeywords(task: string): string[] {
  const stopwords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'and', 'or', 'not', 'no', 'but', 'if', 'so', 'as', 'it',
    'do', 'does', 'did', 'will', 'would', 'can', 'could', 'should',
    'has', 'have', 'had', 'i', 'me', 'my', 'we', 'our', 'you',
    'your', 'he', 'she', 'they', 'them', 'this', 'that', 'what',
    'which', 'how', 'get', 'find', 'search', 'look', 'up', 'about',
    'some', 'any', 'all', 'want', 'need',
  ]);
  return task
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopwords.has(w));
}

const MAX_RESULTS = 18;

/** Format a tool entry for text output. */
function formatTool(t: McpToolDefinition): string {
  const name = t.mcpName ?? t.toolId;
  return `- ${name}: ${t.description.slice(0, 120)}`;
}

/** Produce the discover_tools response text. */
function discoverTools(args: { task?: string; category?: string }): string {
  // --- Filter by category ---
  if (args.category) {
    const cat = args.category.toLowerCase().trim();
    const tools = categoryIndex.get(cat);
    if (!tools || tools.length === 0) {
      return [
        `No tools found for category "${cat}".`,
        '',
        `Available categories: ${CATEGORIES.join(', ')}`,
      ].join('\n');
    }
    const lines = [`Tools in "${cat}" (${tools.length}):`, ''];
    for (const t of tools.slice(0, MAX_RESULTS)) lines.push(formatTool(t));
    if (tools.length > MAX_RESULTS) lines.push(`... and ${tools.length - MAX_RESULTS} more`);
    return lines.join('\n');
  }

  // --- Keyword search by task ---
  if (args.task) {
    const keywords = extractKeywords(args.task);
    if (keywords.length === 0) {
      return 'Could not extract keywords from task. Try a more specific description or use category filter.';
    }
    const scored = TOOL_DEFINITIONS
      .map(t => ({ tool: t, score: scoreByTask(t, keywords) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS);

    if (scored.length === 0) {
      return [
        `No tools matched "${args.task}".`,
        '',
        `Try browsing by category: ${CATEGORIES.join(', ')}`,
      ].join('\n');
    }
    const lines = [`Tools for "${args.task}" (top ${scored.length}):`, ''];
    for (const s of scored) lines.push(formatTool(s.tool));
    return lines.join('\n');
  }

  // --- No args: return category index ---
  const lines = [
    `APIbase Tool Catalog — ${TOOL_DEFINITIONS.length} tools across ${CATEGORIES.length} categories:`,
    '',
  ];
  for (const cat of CATEGORIES) {
    const count = categoryIndex.get(cat)?.length ?? 0;
    if (count > 0) lines.push(`- ${cat}: ${count} tools`);
  }
  lines.push('', 'Use discover_tools with category="<name>" or task="<description>" to find relevant tools.');
  lines.push('All tools remain callable via tools/call regardless of discovery.');
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
      task: z.string().optional().describe('Describe what you want to do (e.g. "search flights from NYC to London")'),
      category: z.string().optional().describe(`Filter by category: ${CATEGORIES.join(', ')}`),
    },
    (args: { task?: string; category?: string }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: discoverTools(args),
          },
        },
      ],
    }),
  );
}
