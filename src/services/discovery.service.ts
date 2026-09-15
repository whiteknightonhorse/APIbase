import { z } from 'zod';
import { getPrisma } from './prisma.service';
import { ensureRedisConnected } from './redis.service';
import {
  buildToolQuality,
  QUALITY_WINDOW_HOURS,
  type ToolQualityResult,
} from './tool-quality.service';
import { CACHE_HIT_PRICE_RATIO, priceTier } from './tool-registry.service';
import { config } from '../config/index';
import { getMppConfig } from '../config/mpp.config';
import { TOOL_DEFINITIONS } from '../mcp/tool-definitions';
import { toolSchemas } from '../schemas/index';
import { extractKeywords, scoreTool } from '../mcp/keyword-match';
import type { McpToolDefinition } from '../mcp/types';

/**
 * Discovery service (ZZ-03-05, 03-SPECIFICATION.md P-1/M-1).
 *
 * `discover(query)` is the ONE ranking implementation shared by three thin surfaces (zz-03
 * Q1 ruling-1, "P0 — Discovery contract (одна функция, три тонких поверхности)"):
 *   - MCP tool `apibase.discover` (src/adapters/apibase/index.ts, runs in the pipeline like
 *     any other tool — one execution_ledger row per call, price_usd 0)
 *   - REST `GET /api/v1/discover` (src/routes/tools.router.ts)
 *   - the `discover_tools` prompt (src/mcp/prompt-adapter.ts), which renders its text from
 *     this same JSON instead of scoring on its own
 *
 * Response shape is the ruling's "Минимальный контракт ответа", field for field. See
 * `disputes/zz-03-apibase-design.q-1.ruling-1.md` for the source text this was built against.
 */

// ZZ-03-01: single source of truth for category is TOOL_DEFINITIONS[].category (25 values at
// the time of writing) — bump this string only when that set of categories actually changes,
// same "explicit version tag, not a timestamp of last edit" pattern tool-quality.service.ts's
// QUALITY_METHOD uses. Not exported — DiscoverResponse.taxonomy_version is the public surface;
// re-export this if a future consumer (e.g. a sync-counts.sh check) needs to compare against it
// directly.
const TAXONOMY_VERSION = '2026-09-15';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const TOOL_DEF_BY_ID: ReadonlyMap<string, McpToolDefinition> = new Map(
  TOOL_DEFINITIONS.map((def) => [def.toolId, def]),
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoverQueryInput {
  intent?: string;
  category?: string;
  max_price_usd?: number;
  limit?: number;
  /** Default false — an unavailable tool cannot actually be called (tool-status.stage.ts
   *  rejects it with 503), so it is excluded from results unless explicitly asked for. */
  include_unavailable?: boolean;
}

export interface DiscoverMatch {
  score: number;
  matched_on: string[];
}

export interface DiscoverPrice {
  price_usd: number;
  cache_hit_price_usd: number;
  tier: 'micro' | 'standard' | 'premium';
  currency: 'USD';
}

export interface DiscoverPayment {
  rails: string[];
  min_balance_usd: number;
  x402: { network: string; asset: string };
  /** Present only when the MPP rail is actually enabled (config.MPP_ENABLED + wallet/key set)
   *  — never advertise a rail that would 500 if an agent tried it (same "no_data over a
   *  fabricated value" posture as `quality` below). */
  mpp?: { network: string; asset: string };
}

export interface DiscoverAvailability {
  tool_status: string;
  /** UNKNOWN | HEALTHY | DEGRADED | DOWN, or null when this provider has no provider_status
   *  row at all yet — a real, distinct fact, never guessed as HEALTHY. */
  provider_state: string | null;
  state_since: string | null;
  last_ok_at: string | null;
}

/** `no_data` never carries a fabricated number (acceptance criterion a) — only the two facts
 *  that are always knowable (the measurement window, and the provider-level score which is
 *  tracked independently of whether THIS tool has been called). */
export type DiscoverQuality =
  | {
      status: 'measured';
      window_h: number;
      uptime_pct: number;
      p50_ms: number | null;
      p95_ms: number | null;
      error_rate: number;
      total_calls: number;
      last_updated: string;
      provider_reliability_score: number | null;
    }
  | {
      status: 'no_data';
      window_h: number;
      provider_reliability_score: number | null;
    };

export interface DiscoverRelated {
  tool_id: string;
  reason: string;
}

export interface DiscoverResult {
  tool_id: string;
  mcp_name: string;
  title: string;
  category: string;
  namespace: string;
  provider: string;
  match: DiscoverMatch;
  price: DiscoverPrice;
  payment: DiscoverPayment;
  availability: DiscoverAvailability;
  quality: DiscoverQuality;
  input_required: string[];
  related: DiscoverRelated[];
}

export interface DiscoverResponse {
  query: {
    intent: string | null;
    category: string | null;
    max_price_usd: number | null;
    limit: number;
  };
  taxonomy_version: string;
  /** Always null until P1 (config/capabilities.yaml) ships — this task is P0 only. */
  capability: null;
  results: DiscoverResult[];
  total_matches: number;
  truncated: boolean;
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Query normalization
// ---------------------------------------------------------------------------

interface NormalizedQuery {
  intent?: string;
  category?: string;
  max_price_usd?: number;
  limit: number;
  include_unavailable: boolean;
}

function normalize(raw: DiscoverQueryInput): NormalizedQuery {
  const intent = raw.intent?.trim() || undefined;
  const category = raw.category?.trim().toLowerCase() || undefined;
  const max_price_usd =
    typeof raw.max_price_usd === 'number' && isFinite(raw.max_price_usd) && raw.max_price_usd >= 0
      ? raw.max_price_usd
      : undefined;
  const rawLimit =
    typeof raw.limit === 'number' && isFinite(raw.limit) ? Math.floor(raw.limit) : DEFAULT_LIMIT;
  const limit = Math.min(Math.max(rawLimit, 1), MAX_LIMIT);
  const include_unavailable = raw.include_unavailable === true;
  return { intent, category, max_price_usd, limit, include_unavailable };
}

// ---------------------------------------------------------------------------
// Provider state (one batched read per call, never per-row — same posture
// tool-registry.service.ts's buildProviderQualityMap takes)
// ---------------------------------------------------------------------------

interface ProviderState {
  state: string | null;
  state_since: string | null;
  last_ok_at: string | null;
  reliability_score: number | null;
}

async function buildProviderStateMap(providerNames: string[]): Promise<Map<string, ProviderState>> {
  const map = new Map<string, ProviderState>();
  if (providerNames.length === 0) {
    return map;
  }

  const db = getPrisma();
  const rows = await db.providerStatus.findMany({
    where: { provider: { in: providerNames } },
    select: {
      provider: true,
      state: true,
      state_since: true,
      last_ok_at: true,
      reliability_score: true,
    },
  });
  const byProvider = new Map(rows.map((r) => [r.provider, r]));

  for (const name of providerNames) {
    const r = byProvider.get(name);
    map.set(name, {
      state: r?.state ?? null,
      state_since: r?.state_since?.toISOString() ?? null,
      last_ok_at: r?.last_ok_at?.toISOString() ?? null,
      reliability_score: r?.reliability_score ?? null,
    });
  }

  return map;
}

/** Required (non-optional, no-default) top-level keys of a tool's Zod input schema. */
function getRequiredParams(toolId: string): string[] {
  const schema = toolSchemas[toolId];
  if (!(schema instanceof z.ZodObject)) {
    return [];
  }
  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  return Object.entries(shape)
    .filter(([, field]) => !field.isOptional())
    .map(([key]) => key);
}

// ---------------------------------------------------------------------------
// Result assembly
// ---------------------------------------------------------------------------

interface Candidate {
  tool_id: string;
  provider: string;
  status: string;
  category: string;
  namespace: string;
  name: string;
  priceUsd: number;
  def: McpToolDefinition;
  score: number;
  matchedOn: string[];
}

/**
 * Two independently-null "no data" causes collapse into the SAME `no_data` status here —
 * "never called" (`toolQuality === null`) and "called too few times to trust a rate"
 * (`toolQuality.success_rate === null`, tool-quality.service.ts's QUALITY_MIN_CALLS gate) are
 * both "nothing safe to show", which is exactly what acceptance criterion (a) requires: a
 * `no_data` entry never carries a number derived from a rate that was never trusted.
 */
function buildQuality(
  toolQuality: ToolQualityResult | null | undefined,
  providerReliabilityScore: number | null,
): DiscoverQuality {
  if (toolQuality != null && toolQuality.success_rate !== null) {
    const successRate = toolQuality.success_rate;
    return {
      status: 'measured',
      window_h: toolQuality.window_h,
      uptime_pct: successRate,
      p50_ms: toolQuality.p50_ms,
      p95_ms: toolQuality.p95_ms,
      error_rate: Math.round((100 - successRate) * 100) / 100,
      total_calls: toolQuality.calls,
      last_updated: toolQuality.as_of,
      provider_reliability_score: providerReliabilityScore,
    };
  }
  return {
    status: 'no_data',
    window_h: toolQuality?.window_h ?? QUALITY_WINDOW_HOURS,
    provider_reliability_score: providerReliabilityScore,
  };
}

function toDiscoverResult(
  c: Candidate,
  toolQuality: ToolQualityResult | null | undefined,
  providerState: ProviderState | undefined,
): DiscoverResult {
  const mppCfg = getMppConfig();
  const rails = ['x402'];
  if (mppCfg.enabled) rails.push('mpp');

  const cacheHitPriceUsd =
    c.priceUsd === 0 ? 0 : Math.round(c.priceUsd * CACHE_HIT_PRICE_RATIO * 1e8) / 1e8;

  return {
    tool_id: c.tool_id,
    mcp_name: c.def.mcpName ?? c.def.toolId,
    title: c.def.title ?? c.name,
    category: c.category,
    namespace: c.namespace,
    provider: c.provider,
    match: { score: c.score, matched_on: c.matchedOn },
    price: {
      price_usd: c.priceUsd,
      cache_hit_price_usd: cacheHitPriceUsd,
      tier: priceTier(c.priceUsd),
      currency: 'USD',
    },
    payment: {
      rails,
      min_balance_usd: c.priceUsd,
      x402: { network: config.X402_NETWORK, asset: 'USDC' },
      ...(mppCfg.enabled
        ? { mpp: { network: mppCfg.testnet ? 'tempo-testnet' : 'tempo', asset: 'USDC.e' } }
        : {}),
    },
    availability: {
      tool_status: c.status,
      provider_state: providerState?.state ?? null,
      state_since: providerState?.state_since ?? null,
      last_ok_at: providerState?.last_ok_at ?? null,
    },
    quality: buildQuality(toolQuality, providerState?.reliability_score ?? null),
    input_required: getRequiredParams(c.tool_id),
    related: (c.def.relatedTools ?? []).map((r) => ({ tool_id: r.toolId, reason: r.reason })),
  };
}

// ---------------------------------------------------------------------------
// discover()
// ---------------------------------------------------------------------------

export async function discover(raw: DiscoverQueryInput): Promise<DiscoverResponse> {
  const q = normalize(raw);
  const db = getPrisma();

  const where: Record<string, unknown> = q.include_unavailable
    ? {}
    : { status: { not: 'unavailable' } };
  if (q.category) where.category = q.category;
  if (typeof q.max_price_usd === 'number') where.price_usd = { lte: q.max_price_usd };

  const rows = await db.tool.findMany({
    where,
    select: {
      tool_id: true,
      provider: true,
      status: true,
      price_usd: true,
      category: true,
      namespace: true,
      name: true,
    },
  });

  const keywords = q.intent ? extractKeywords(q.intent) : [];

  const candidates: Candidate[] = [];
  for (const row of rows) {
    const def = TOOL_DEF_BY_ID.get(row.tool_id);
    // A yaml/DB row with no matching TOOL_DEFINITIONS entry is a broken catalog (same
    // invariant scripts/seed.ts's category backfill enforces at seed time) — skip rather
    // than guess a title/mcpName for it here.
    if (!def) continue;

    const { score, matchedOn } =
      keywords.length > 0 ? scoreTool(def, keywords) : { score: 0, matchedOn: [] as string[] };
    // With an intent given, only genuine matches count; without one, this is category/price
    // browsing and every row that passed the DB filters is a "match".
    if (keywords.length > 0 && score <= 0) continue;

    candidates.push({
      tool_id: row.tool_id,
      provider: row.provider,
      status: row.status,
      category: row.category,
      namespace: row.namespace,
      name: row.name,
      priceUsd: Number(row.price_usd),
      def,
      score,
      matchedOn,
    });
  }

  // One MGET for the whole candidate set, never one round-trip per tool (T-2 forbids a KEYS-style
  // scan; this is a lookup by a list of keys we already have, same posture as
  // tool-quality.service.ts's own buildToolQuality()).
  let qualityMap: Record<string, ToolQualityResult | null> = {};
  try {
    const redis = await ensureRedisConnected();
    qualityMap = await buildToolQuality(
      redis,
      candidates.map((c) => c.tool_id),
    );
  } catch {
    // Redis outage — every candidate falls through to `no_data` below rather than 500ing
    // (same posture tool-registry.service.ts's toEntries() takes).
  }

  // Stable order (acceptance criterion d): score desc, then measured-before-no_data, then
  // higher uptime first, then cheaper first, then tool_id as the final deterministic
  // tiebreak — no comparison here can return 0 for two different tool_ids.
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;

    const qa = qualityMap[a.tool_id];
    const qb = qualityMap[b.tool_id];
    const aRate = qa != null ? qa.success_rate : null;
    const bRate = qb != null ? qb.success_rate : null;
    const aMeasured = aRate !== null;
    const bMeasured = bRate !== null;
    if (aMeasured !== bMeasured) return aMeasured ? -1 : 1;
    if (aMeasured && bMeasured && aRate !== bRate) {
      return (bRate as number) - (aRate as number);
    }

    if (a.priceUsd !== b.priceUsd) return a.priceUsd - b.priceUsd;

    return a.tool_id < b.tool_id ? -1 : a.tool_id > b.tool_id ? 1 : 0;
  });

  const totalMatches = candidates.length;
  const sliced = candidates.slice(0, q.limit);

  const providerNames = Array.from(new Set(sliced.map((c) => c.provider)));
  const providerStateMap = await buildProviderStateMap(providerNames);

  const results = sliced.map((c) =>
    toDiscoverResult(c, qualityMap[c.tool_id], providerStateMap.get(c.provider)),
  );

  return {
    query: {
      intent: q.intent ?? null,
      category: q.category ?? null,
      max_price_usd: q.max_price_usd ?? null,
      limit: q.limit,
    },
    taxonomy_version: TAXONOMY_VERSION,
    capability: null,
    results,
    total_matches: totalMatches,
    truncated: totalMatches > results.length,
    generated_at: new Date().toISOString(),
  };
}
