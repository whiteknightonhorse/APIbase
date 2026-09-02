import { type Stage, ok, err, type PipelineError } from '../types';
import { getPrisma } from '../../services/prisma.service';
import { logger } from '../../config/logger';
import marginConfig from '../../config/margin.json';

/**
 * TOOL_STATUS stage (§12.43 stage 5, §12.114).
 * Check tool exists and is not unavailable.
 *
 * In-memory cache: all 122 tools loaded at startup, refreshed every 60s.
 * Tool data only changes via manual re-seed — 60s staleness is acceptable.
 *
 * F1/C-4 (2026-09-01): also enforces the runtime margin gate — no confirmed
 * payment >= upstream cost + margin, no call to the provider. This is the
 * code-level version of the invariant; nothing about it lives in a role
 * prompt. `upstream_cost_usd` is nullable (NULL = not yet migrated, see
 * config/tool_provider_config.yaml + scripts/migrate-upstream-cost.py); the
 * gate only fires for rows where it has been explicitly set, so populating
 * it is a safe incremental rollout rather than a flag day. A tool that
 * fails the gate is served nowhere near the provider — a separate hourly
 * cron (scripts/margin-gate-alerts.py, same pattern as
 * provider-limit-alerts.py) re-derives the same violation from the DB and
 * files/updates a deduped GitHub issue; the hot path never calls out.
 *
 * F6 (2026-09-02): MARGIN_MULTIPLIER used to be a second hardcoded `1.3` in
 * scripts/margin-gate-alerts.py, independent of this one -- the same policy
 * constant in two places with no link between them. Both now read
 * config/margin.json, one source for TS and Python.
 */

const MARGIN_MULTIPLIER: number = marginConfig.MARGIN_MULTIPLIER;

// ---------------------------------------------------------------------------
// In-memory tool cache
// ---------------------------------------------------------------------------

interface ToolCacheEntry {
  tool_id: string;
  status: string;
  price_usd: number;
  cache_ttl: number;
  upstream_cost_usd: number | null;
  // Optional (not required) so existing test helpers seeding a synthetic
  // cache entry without it (margin-gate.test.ts) keep compiling; real
  // DB-loaded rows always set it.
  provider?: string;
}

const toolCache = new Map<string, ToolCacheEntry>();
let refreshTimer: ReturnType<typeof setInterval> | null = null;

async function loadToolCache(): Promise<void> {
  const tools = await getPrisma().tool.findMany({
    select: {
      tool_id: true,
      status: true,
      price_usd: true,
      cache_ttl: true,
      upstream_cost_usd: true,
      provider: true,
    },
  });

  toolCache.clear();
  for (const t of tools) {
    toolCache.set(t.tool_id, {
      tool_id: t.tool_id,
      status: t.status,
      price_usd: Number(t.price_usd),
      cache_ttl: t.cache_ttl,
      upstream_cost_usd: t.upstream_cost_usd === null ? null : Number(t.upstream_cost_usd),
      provider: t.provider,
    });
  }

  logger.info({ count: toolCache.size }, 'Tool cache refreshed');
}

/**
 * Initialize the tool cache. Call before app.listen().
 * Starts a 60s refresh interval.
 */
export async function initToolCache(): Promise<void> {
  await loadToolCache();

  refreshTimer = setInterval(() => {
    loadToolCache().catch((err) => {
      logger.warn({ err }, 'Tool cache refresh failed — retaining stale data');
    });
  }, 60_000);
  refreshTimer.unref();
}

/** Returns tool IDs whose DB status is not 'unavailable'. Used by MCP tool registration. */
export function getActiveToolIds(): Set<string> {
  const active = new Set<string>();
  for (const [id, entry] of toolCache) {
    if (entry.status !== 'unavailable') {
      active.add(id);
    }
  }
  return active;
}

/**
 * Returns the cached price (in USD) for a tool, or undefined if the tool
 * is not in the cache. Read-side only — used by middleware that needs the
 * price BEFORE the pipeline runs (e.g. MPP HMAC verification, which signs
 * over the actual amount and must be reconstructed server-side).
 */
export function getToolPriceUsd(toolId: string): number | undefined {
  return toolCache.get(toolId)?.price_usd;
}

/**
 * Returns the tool's provider id (e.g. 'telegram'), or undefined if the
 * tool is not in the cache. Used by MODERATION (F2/C-2) to classify a
 * request as action/outbound vs data/read before running the content check.
 */
export function getToolProvider(toolId: string): string | undefined {
  return toolCache.get(toolId)?.provider;
}

/**
 * True if the tool fails the margin gate (price_usd < upstream_cost_usd * 1.3).
 * A tool with no upstream_cost_usd on record (not yet migrated) never fails —
 * see module doc. Exported for the adversarial test suite and for reuse by
 * anything that needs to pre-check margin without running the full pipeline.
 */
export function failsMarginGate(
  entry: Pick<ToolCacheEntry, 'price_usd' | 'upstream_cost_usd'>,
): boolean {
  if (entry.upstream_cost_usd === null) return false;
  // Prices are USD to 8 decimal places (DB: Decimal(18,8)) but live in JS as
  // IEEE754 doubles here — 0.001 * 1.3 === 0.0013000000000000002, so a naive
  // "<" would reject a tool priced at EXACTLY the break-even point. Round the
  // required minimum to 8dp before comparing; a 1e-9 tolerance is far below
  // any real price granularity, so it can't be used to sneak under the gate.
  const required = Math.round(entry.upstream_cost_usd * MARGIN_MULTIPLIER * 1e8) / 1e8;
  return entry.price_usd < required - 1e-9;
}

/** Stop the refresh timer (graceful shutdown). */
export function stopToolCacheRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

/** Test-only: seed/override a cache entry without touching the DB. */
export function __setToolCacheEntryForTest(entry: ToolCacheEntry): void {
  toolCache.set(entry.tool_id, entry);
}

/** Test-only: remove a cache entry. */
export function __deleteToolCacheEntryForTest(toolId: string): void {
  toolCache.delete(toolId);
}

/** Test-only (F6): expose the actual runtime value for the single-source cross-check. */
export function __getMarginMultiplierForTest(): number {
  return MARGIN_MULTIPLIER;
}

// ---------------------------------------------------------------------------
// Pipeline stage
// ---------------------------------------------------------------------------

export const toolStatusStage: Stage = {
  name: 'TOOL_STATUS',

  async execute(ctx) {
    if (!ctx.toolId) {
      return err<PipelineError>({ code: 400, error: 'bad_request', message: 'Missing tool_id' });
    }

    // Lazy fallback: if cache not yet initialized, load synchronously
    if (toolCache.size === 0) {
      await loadToolCache();
    }

    const tool = toolCache.get(ctx.toolId);

    if (!tool) {
      return err<PipelineError>({
        code: 404,
        error: 'not_found',
        message: `Tool not found: ${ctx.toolId}`,
      });
    }

    if (tool.status === 'unavailable') {
      return err<PipelineError>({
        code: 503,
        error: 'provider_unavailable',
        message: `Tool ${ctx.toolId} is currently unavailable`,
        retryAfter: 30,
      });
    }

    if (failsMarginGate(tool)) {
      logger.error(
        {
          tool_id: tool.tool_id,
          price_usd: tool.price_usd,
          upstream_cost_usd: tool.upstream_cost_usd,
          required_min:
            tool.upstream_cost_usd !== null ? tool.upstream_cost_usd * MARGIN_MULTIPLIER : null,
        },
        `Margin gate: refusing to serve ${tool.tool_id} — price below cost + margin`,
      );
      return err<PipelineError>({
        // Client-visible code deliberately reuses 'provider_unavailable' — the
        // client-facing surface must not leak that a margin gate exists or
        // which SKU tripped it. 'margin_gate' only appears in the server log
        // line above (and in the DB state scripts/margin-gate-alerts.py reads).
        code: 503,
        error: 'provider_unavailable',
        message: `Tool ${ctx.toolId} is currently unavailable`,
        retryAfter: 30,
      });
    }

    ctx.toolPrice = tool.price_usd;
    ctx.toolCacheTtl = tool.cache_ttl;

    return ok(ctx);
  },
};
