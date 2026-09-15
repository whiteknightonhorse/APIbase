import type Redis from 'ioredis';

/**
 * Tool Quality builder (T-2/Q-1: single source of truth for per-tool quality
 * data, fixes the fabricated-zero bug).
 *
 * `src/jobs/tool-quality.job.ts` writes `tool:quality:{toolId}` (15-min TTL,
 * 24h execution_ledger window) — this module is the ONLY place that reads it
 * back. Both `platform.tool_quality` and `platform.tool_rankings`
 * (`src/adapters/platform/index.ts`) call `buildToolQuality()` instead of
 * touching Redis directly, so there is exactly one place that decides what
 * "no data" means.
 *
 * Two distinct "no data" states, kept distinct rather than collapsed into a
 * fabricated 0 (Q-3 ruling-1, live Redis slice 2026-09-14: 966/1384 tools had
 * no key at all, and would have shown `uptime_pct: 0` — indistinguishable
 * from "100% failure"):
 *   - no key at all (never called in the last 24h, or the 15-min TTL simply
 *     expired between job ticks) -> the WHOLE entry is `null`.
 *   - a key exists but sample size is too small to trust a rate or a
 *     percentile (`calls < QUALITY_MIN_CALLS`) -> `calls` stays a real
 *     number, but `success_rate`/`p50_ms`/`p95_ms` are `null`.
 *
 * `buildToolQuality` never scans (`redis.keys()` is forbidden on the shared
 * prod instance) — callers pass the exact tool_ids they want and this does
 * one `MGET` for them. A caller that needs to sweep a large catalog (e.g.
 * `platform.tool_rankings`) is expected to page its own tool_id list and
 * call this once per page — "one MGET per page", not one scan for everything.
 */

export const QUALITY_KEY_PREFIX = 'tool:quality:';

/** Below this many calls in the window, a success rate or a latency
 *  percentile is noise, not signal (Q-1: "success_rate/p50/p95 = null пока
 *  calls < 10"). */
export const QUALITY_MIN_CALLS = 10;

/** Matches the aggregation window `tool-quality.job.ts` queries
 *  (`execution_ledger` last 24h) — kept here too so a result carries its own
 *  window without the caller having to know the job's internals. */
const QUALITY_WINDOW_HOURS = 24;

/** Shape `tool-quality.job.ts` writes to Redis. */
interface StoredToolQuality {
  tool_id: string;
  uptime_pct: number;
  p50_ms: number | null;
  p95_ms: number | null;
  error_rate: number;
  total_calls: number;
  success_calls: number;
  last_updated: string;
}

/** Per-tool quality result — same shape Q-1's catalog `quality.tool`
 *  sub-object uses, so that integration can embed this directly. */
export interface ToolQualityResult {
  window_h: number;
  calls: number;
  success_rate: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
  as_of: string;
}

/**
 * Look up quality data for a batch of tool_ids in one `MGET`. Returns a
 * tool_id-keyed object — every requested id is present as a key, mapping to
 * either a `ToolQualityResult` or `null` (no measurement).
 */
export async function buildToolQuality(
  redis: Redis,
  toolIds: string[],
): Promise<Record<string, ToolQualityResult | null>> {
  const result: Record<string, ToolQualityResult | null> = {};
  if (toolIds.length === 0) {
    return result;
  }

  const keys = toolIds.map((toolId) => `${QUALITY_KEY_PREFIX}${toolId}`);
  const values = await redis.mget(...keys);

  for (let i = 0; i < toolIds.length; i++) {
    const raw = values[i];
    if (!raw) {
      result[toolIds[i]] = null;
      continue;
    }

    let stored: StoredToolQuality;
    try {
      stored = JSON.parse(raw) as StoredToolQuality;
    } catch {
      // Corrupt/unexpected value — treat as no measurement rather than throw.
      result[toolIds[i]] = null;
      continue;
    }

    const calls = stored.total_calls ?? 0;
    const enoughSample = calls >= QUALITY_MIN_CALLS;

    result[toolIds[i]] = {
      window_h: QUALITY_WINDOW_HOURS,
      calls,
      success_rate: enoughSample ? stored.uptime_pct : null,
      p50_ms: enoughSample ? stored.p50_ms : null,
      p95_ms: enoughSample ? stored.p95_ms : null,
      as_of: stored.last_updated,
    };
  }

  return result;
}
