import { PrismaClient } from '@prisma/client';
import { toolSchemas } from '../schemas/index';
import { TOOL_DEFINITIONS } from '../mcp/tool-definitions';
import { zodToJsonSchema } from '../utils/zod-to-json-schema';

/**
 * Tool registry service (§6.15, §12.114, §12.39).
 *
 * Provides tool catalog queries from PostgreSQL.
 * Public catalog: GET /api/tools — flat list with Cache-Control.
 * Paginated list: GET /api/v1/tools — default 1000 (all tools), cursor available.
 * Single tool: GET /api/v1/tools/:toolId.
 */

const CACHE_HIT_PRICE_RATIO = 0.1; // 10% of full price (§12.173)

// ---------------------------------------------------------------------------
// Pre-computed lookup maps (built once at module load, not per-request)
// ---------------------------------------------------------------------------

const TOOL_SCHEMAS_JSON: ReadonlyMap<string, Record<string, unknown>> = (() => {
  const map = new Map<string, Record<string, unknown>>();
  for (const [toolId, schema] of Object.entries(toolSchemas)) {
    try {
      map.set(toolId, zodToJsonSchema(schema));
    } catch {
      // Skip tools with unconvertible schemas — they get empty {}
    }
  }
  return map;
})();

const TOOL_DESCRIPTIONS: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const def of TOOL_DEFINITIONS) {
    map.set(def.toolId, def.description);
  }
  return map;
})();

// ---------------------------------------------------------------------------
// Lazy PrismaClient singleton
// ---------------------------------------------------------------------------

let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolCatalogEntry {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  method: string;
  category: string;
  pricing: { price_usd: number; cache_hit_price_usd: number };
  /**
   * Price tier — agents can filter by tier without knowing exact thresholds.
   * micro: < $0.01 (typical micropayment, all 479+ free/paid-tier tools)
   * standard: $0.01–$0.99 (heavy data tools, e.g. domain WHOIS, scraping)
   * premium: $1+ (transactional tools — domain registration, ad spend pass-through)
   */
  tier: 'micro' | 'standard' | 'premium';
  /**
   * Minimum on-chain USDC balance an agent should have to call this tool.
   * Equals price_usd for cache-miss; cache-hit costs the same when paid via
   * x402/MPP rail (full sticker — cache discount is balance-tier only).
   */
  min_balance_usd: number;
  input_schema: Record<string, unknown>;
  status: string;
}

export interface PublicCatalog {
  platform: string;
  version: string;
  updated_at: string;
  total: number;
  tools: ToolCatalogEntry[];
}

export interface PaginatedTools {
  data: ToolCatalogEntry[];
  total: number;
  pagination: {
    cursor: string | null;
    has_more: boolean;
    limit: number;
  };
}

// ---------------------------------------------------------------------------
// Mapping (DB row → catalog entry)
// ---------------------------------------------------------------------------

function toEntry(tool: {
  tool_id: string;
  name: string;
  provider: string;
  status: string;
  price_usd: unknown;
}): ToolCatalogEntry {
  const priceUsd = Number(tool.price_usd);
  const cacheHitPrice =
    priceUsd === 0 ? 0 : Math.round(priceUsd * CACHE_HIT_PRICE_RATIO * 1e8) / 1e8;

  return {
    id: tool.tool_id,
    name: tool.name,
    description: TOOL_DESCRIPTIONS.get(tool.tool_id) ?? tool.name,
    endpoint: `/api/v1/tools/${tool.tool_id}`,
    method: 'POST',
    category: tool.tool_id.includes('.') ? tool.tool_id.split('.')[0] : tool.provider,
    pricing: {
      price_usd: priceUsd,
      cache_hit_price_usd: cacheHitPrice,
    },
    tier: priceTier(priceUsd),
    min_balance_usd: priceUsd,
    input_schema: TOOL_SCHEMAS_JSON.get(tool.tool_id) ?? {},
    status: tool.status,
  };
}

function priceTier(p: number): 'micro' | 'standard' | 'premium' {
  if (p < 0.01) return 'micro';
  if (p < 1) return 'standard';
  return 'premium';
}

// ---------------------------------------------------------------------------
// Public catalog (§6.15)
// ---------------------------------------------------------------------------

export async function getPublicCatalog(): Promise<PublicCatalog> {
  const db = getPrisma();
  const tools = await db.tool.findMany({
    where: { status: { not: 'unavailable' } },
    orderBy: { tool_id: 'asc' },
  });

  return {
    platform: 'APIbase',
    version: '1.0',
    updated_at: new Date().toISOString(),
    total: tools.length,
    tools: tools.map(toEntry),
  };
}

// ---------------------------------------------------------------------------
// Paginated list (§12.39 — default 1000, cursor available, max 1000)
// ---------------------------------------------------------------------------

export async function getToolsPaginated(
  cursor: string | null,
  limit: number,
  filters: { maxPrice?: number; tier?: 'micro' | 'standard' | 'premium' } = {},
): Promise<PaginatedTools> {
  const db = getPrisma();
  const take = Math.min(Math.max(limit, 1), 1000);

  let decodedCursor: string | null = null;
  if (cursor) {
    try {
      decodedCursor = Buffer.from(cursor, 'base64').toString('utf8');
    } catch {
      // Invalid cursor — start from beginning
    }
  }

  // Build price-range filter from either max_price or tier (tier wins).
  let priceFilter: { lte?: number; lt?: number; gte?: number } | undefined;
  if (filters.tier === 'micro') priceFilter = { lt: 0.01 };
  else if (filters.tier === 'standard') priceFilter = { gte: 0.01, lt: 1 };
  else if (filters.tier === 'premium') priceFilter = { gte: 1 };
  else if (typeof filters.maxPrice === 'number') priceFilter = { lte: filters.maxPrice };

  const statusFilter: Record<string, unknown> = { status: { not: 'unavailable' } };
  if (priceFilter) statusFilter.price_usd = priceFilter;

  const [tools, total] = await Promise.all([
    db.tool.findMany({
      where: decodedCursor ? { tool_id: { gt: decodedCursor }, ...statusFilter } : statusFilter,
      orderBy: { tool_id: 'asc' },
      take: take + 1,
    }),
    db.tool.count({ where: statusFilter }),
  ]);

  const hasMore = tools.length > take;
  const page = hasMore ? tools.slice(0, take) : tools;
  const nextCursor =
    hasMore && page.length > 0
      ? Buffer.from(page[page.length - 1].tool_id).toString('base64')
      : null;

  return {
    data: page.map(toEntry),
    total,
    pagination: {
      cursor: nextCursor,
      has_more: hasMore,
      limit: take,
    },
  };
}

// ---------------------------------------------------------------------------
// Single tool (§12.114)
// ---------------------------------------------------------------------------

export async function getToolById(toolId: string): Promise<ToolCatalogEntry | null> {
  const db = getPrisma();
  const tool = await db.tool.findUnique({ where: { tool_id: toolId } });
  if (!tool) return null;
  return toEntry(tool);
}
