import { PrismaClient } from '@prisma/client';

/**
 * Tool registry service (§6.15, §12.114, §12.39).
 *
 * Provides tool catalog queries from PostgreSQL.
 * Public catalog: GET /api/tools — flat list with Cache-Control.
 * Paginated list: GET /api/v1/tools — cursor-based, default 50, max 100.
 * Single tool: GET /api/v1/tools/:toolId.
 */

const CACHE_HIT_PRICE_RATIO = 0.1; // 10% of full price (§12.173)

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
    description: tool.name,
    endpoint: `/api/v1/tools/${tool.tool_id}`,
    method: 'POST',
    category: tool.tool_id.includes('.') ? tool.tool_id.split('.')[0] : tool.provider,
    pricing: {
      price_usd: priceUsd,
      cache_hit_price_usd: cacheHitPrice,
    },
    input_schema: {},
    status: tool.status,
  };
}

// ---------------------------------------------------------------------------
// Public catalog (§6.15)
// ---------------------------------------------------------------------------

export async function getPublicCatalog(): Promise<PublicCatalog> {
  const db = getPrisma();
  const tools = await db.tool.findMany({ orderBy: { tool_id: 'asc' } });

  return {
    platform: 'APIbase',
    version: '1.0',
    updated_at: new Date().toISOString(),
    total: tools.length,
    tools: tools.map(toEntry),
  };
}

// ---------------------------------------------------------------------------
// Paginated list (§12.39 — cursor pagination, default 50, max 100)
// ---------------------------------------------------------------------------

export async function getToolsPaginated(
  cursor: string | null,
  limit: number,
): Promise<PaginatedTools> {
  const db = getPrisma();
  const take = Math.min(Math.max(limit, 1), 100);

  let decodedCursor: string | null = null;
  if (cursor) {
    try {
      decodedCursor = Buffer.from(cursor, 'base64').toString('utf8');
    } catch {
      // Invalid cursor — start from beginning
    }
  }

  const tools = await db.tool.findMany({
    where: decodedCursor ? { tool_id: { gt: decodedCursor } } : undefined,
    orderBy: { tool_id: 'asc' },
    take: take + 1,
  });

  const hasMore = tools.length > take;
  const page = hasMore ? tools.slice(0, take) : tools;
  const nextCursor =
    hasMore && page.length > 0
      ? Buffer.from(page[page.length - 1].tool_id).toString('base64')
      : null;

  return {
    data: page.map(toEntry),
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
