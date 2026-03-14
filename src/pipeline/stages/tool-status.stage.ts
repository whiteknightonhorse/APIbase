import { type Stage, ok, err, type PipelineError } from '../types';
import { getPrisma } from '../../services/prisma.service';
import { logger } from '../../config/logger';

/**
 * TOOL_STATUS stage (§12.43 stage 5, §12.114).
 * Check tool exists and is not unavailable.
 *
 * In-memory cache: all 122 tools loaded at startup, refreshed every 60s.
 * Tool data only changes via manual re-seed — 60s staleness is acceptable.
 */

// ---------------------------------------------------------------------------
// In-memory tool cache
// ---------------------------------------------------------------------------

interface ToolCacheEntry {
  tool_id: string;
  status: string;
  price_usd: number;
  cache_ttl: number;
}

const toolCache = new Map<string, ToolCacheEntry>();
let refreshTimer: ReturnType<typeof setInterval> | null = null;

async function loadToolCache(): Promise<void> {
  const tools = await getPrisma().tool.findMany({
    select: { tool_id: true, status: true, price_usd: true, cache_ttl: true },
  });

  toolCache.clear();
  for (const t of tools) {
    toolCache.set(t.tool_id, {
      tool_id: t.tool_id,
      status: t.status,
      price_usd: Number(t.price_usd),
      cache_ttl: t.cache_ttl,
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

/** Stop the refresh timer (graceful shutdown). */
export function stopToolCacheRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
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

    ctx.toolPrice = tool.price_usd;
    ctx.toolCacheTtl = tool.cache_ttl;

    return ok(ctx);
  },
};
