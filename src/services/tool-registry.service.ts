import { toolSchemas } from '../schemas/index';
import { TOOL_DEFINITIONS } from '../mcp/tool-definitions';
import { zodToJsonSchema } from '../utils/zod-to-json-schema';
import { getPrisma } from './prisma.service';
import { ensureRedisConnected } from './redis.service';
import { buildToolQuality, type ToolQualityResult } from './tool-quality.service';

/**
 * Tool registry service (§6.15, §12.114, §12.39).
 *
 * Provides tool catalog queries from PostgreSQL.
 * Public catalog: GET /api/tools — flat list with Cache-Control.
 * Paginated list: GET /api/v1/tools — default 1000 (all tools), cursor available.
 * Single tool: GET /api/v1/tools/:toolId (Cache-Control max-age lowered to 300 — ZZ-03-03).
 */

// Exported (ZZ-03-05): discovery.service.ts's `discover()` prices results the same way this
// catalog does — one ratio/tier formula, not two that can silently drift apart.
export const CACHE_HIT_PRICE_RATIO = 0.1; // 10% of full price (§12.173)

// ZZ-03-03: the version tag on every `quality.method` this service produces —
// bump it if the scoring formula or the shape it emits ever changes, so a
// caller can tell "no measurement" apart from "measured by a method whose
// numbers no longer mean what they used to".
const QUALITY_METHOD = 'apibase-rs/1';

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
// Types
// ---------------------------------------------------------------------------

/**
 * ZZ-03-03 (03-SPECIFICATION.md Q-1): live provider- and tool-level quality,
 * additive on every catalog entry. Two independently-null halves — a
 * provider that has never been probed and a tool that has never been called
 * are different facts, surfaced as two different `null`s, never collapsed
 * into one fabricated "no data" shape (T-2's own law, same one ZZ-03-02's
 * `buildToolQuality` was built to enforce for the tool half alone).
 */
export interface ToolQuality {
  method: string;
  provider: {
    /** 0-100, §20. null = AP-9's daily calc has never run for this provider — never a fabricated 0. */
    score: number | null;
    /** UNKNOWN | HEALTHY | DEGRADED | DOWN (F1). null = no provider_status row yet. */
    state: string | null;
    /** Non-RESOLVED incidents for this provider right now. Real 0 is real data, not "unmeasured". */
    open_incidents: number;
    /** ISO timestamp of the last active/passive probe. null = never probed. */
    last_probe_at: string | null;
    /** ISO timestamp `score` was last (re)computed — may be non-null even when `score` itself is null
     *  (a completed calculation that found nothing measurable, §20). null = the calc has never run. */
    score_as_of: string | null;
  };
  /** Same shape `buildToolQuality()` returns per tool_id — null = no traffic in the window. */
  tool: ToolQualityResult | null;
}

const EMPTY_PROVIDER_QUALITY: ToolQuality['provider'] = {
  score: null,
  state: null,
  open_incidents: 0,
  last_probe_at: null,
  score_as_of: null,
};

export interface ToolCatalogEntry {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  method: string;
  /** ZZ-03-01: single source of truth is TOOL_DEFINITIONS[].category (25 values). */
  category: string;
  /**
   * ZZ-03-01: the OLD prefix-derived value (tool_id.split('.')[0]) this field used to
   * report as `category` — kept under its own name so no existing consumer loses access
   * to it (see migration 0017, prisma/schema.prisma's Tool.namespace).
   */
  namespace: string;
  provider: string;
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
  /** ZZ-03-03: live provider- and tool-level quality. Additive — never breaks a pre-existing consumer. */
  quality: ToolQuality;
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

function toEntry(
  tool: {
    tool_id: string;
    name: string;
    provider: string;
    status: string;
    price_usd: unknown;
    category: string;
    namespace: string;
  },
  quality: ToolQuality,
): ToolCatalogEntry {
  const priceUsd = Number(tool.price_usd);
  const cacheHitPrice =
    priceUsd === 0 ? 0 : Math.round(priceUsd * CACHE_HIT_PRICE_RATIO * 1e8) / 1e8;

  return {
    id: tool.tool_id,
    name: tool.name,
    description: TOOL_DESCRIPTIONS.get(tool.tool_id) ?? tool.name,
    endpoint: `/api/v1/tools/${tool.tool_id}`,
    method: 'POST',
    category: tool.category,
    namespace: tool.namespace,
    provider: tool.provider,
    pricing: {
      price_usd: priceUsd,
      cache_hit_price_usd: cacheHitPrice,
    },
    tier: priceTier(priceUsd),
    min_balance_usd: priceUsd,
    input_schema: TOOL_SCHEMAS_JSON.get(tool.tool_id) ?? {},
    status: tool.status,
    quality,
  };
}

export function priceTier(p: number): 'micro' | 'standard' | 'premium' {
  if (p < 0.01) return 'micro';
  if (p < 1) return 'standard';
  return 'premium';
}

// ---------------------------------------------------------------------------
// ZZ-03-03: quality batch-builders. One provider_status+incidents lookup and
// one tool-quality MGET per catalog request, never per-row — same "batch the
// whole page, don't N+1 it" posture ZZ-03-02's buildToolQuality itself
// documents for platform.tool_rankings.
// ---------------------------------------------------------------------------

async function buildProviderQualityMap(
  providerNames: string[],
): Promise<Map<string, ToolQuality['provider']>> {
  const map = new Map<string, ToolQuality['provider']>();
  if (providerNames.length === 0) {
    return map;
  }

  const db = getPrisma();
  const [statuses, incidentCounts] = await Promise.all([
    db.providerStatus.findMany({ where: { provider: { in: providerNames } } }),
    db.incident.groupBy({
      by: ['provider'],
      where: { provider: { in: providerNames }, state: { not: 'RESOLVED' } },
      _count: { _all: true },
    }),
  ]);

  const statusByProvider = new Map(statuses.map((s) => [s.provider, s]));
  const openIncidentsByProvider = new Map(
    incidentCounts.map((row) => [row.provider, row._count._all]),
  );

  for (const name of providerNames) {
    const status = statusByProvider.get(name);
    // No provider_status row at all -> every field genuinely null/zero, not
    // a guess. A row that exists but was never scored/probed still reports
    // its real state (e.g. 'UNKNOWN') with score/probe fields null.
    map.set(name, {
      score: status?.reliability_score ?? null,
      state: status?.state ?? null,
      open_incidents: openIncidentsByProvider.get(name) ?? 0,
      last_probe_at: status?.last_probe_at?.toISOString() ?? null,
      score_as_of: status?.reliability_calculated_at?.toISOString() ?? null,
    });
  }

  return map;
}

async function toEntries(
  tools: Array<{
    tool_id: string;
    name: string;
    provider: string;
    status: string;
    price_usd: unknown;
    category: string;
    namespace: string;
  }>,
): Promise<ToolCatalogEntry[]> {
  if (tools.length === 0) {
    return [];
  }

  const toolIds = tools.map((t) => t.tool_id);
  const providerNames = Array.from(new Set(tools.map((t) => t.provider)));

  // Redis outage degrades quality.tool to null for the whole page rather
  // than 500ing the catalog — same "cache is a lens on durable truth, not a
  // dependency" posture dashboard.service.ts takes for provider health/limits.
  let toolQualityMap: Record<string, ToolQualityResult | null> = {};
  try {
    const redis = await ensureRedisConnected();
    toolQualityMap = await buildToolQuality(redis, toolIds);
  } catch {
    // fall through with the empty map — every tool_id looks up to `null` below.
  }

  const providerQualityMap = await buildProviderQualityMap(providerNames);

  return tools.map((tool) =>
    toEntry(tool, {
      method: QUALITY_METHOD,
      provider: providerQualityMap.get(tool.provider) ?? EMPTY_PROVIDER_QUALITY,
      tool: toolQualityMap[tool.tool_id] ?? null,
    }),
  );
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
    tools: await toEntries(tools),
  };
}

// ---------------------------------------------------------------------------
// Paginated list (§12.39 — default 1000, cursor available, max 2000)
// ---------------------------------------------------------------------------

export async function getToolsPaginated(
  cursor: string | null,
  limit: number,
  filters: {
    maxPrice?: number;
    tier?: 'micro' | 'standard' | 'premium';
    category?: string;
  } = {},
): Promise<PaginatedTools> {
  const db = getPrisma();
  const take = Math.min(Math.max(limit, 1), 2000);

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
  if (filters.category) statusFilter.category = filters.category;

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
    data: await toEntries(page),
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
  const [entry] = await toEntries([tool]);
  return entry;
}
