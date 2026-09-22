import { getCapabilityEntry, getSameUpstreamSet } from './capability-registry.service';
import { getToolCacheEntries } from '../pipeline/stages/tool-status.stage';
import { logger } from '../config/logger';

/**
 * Advisory alternatives (T-0207, ZZ-03-07, 03-SPECIFICATION.md R-2).
 *
 * "Совещательный роутинг": on a catalog lookup or a failed call, tell the agent which OTHER
 * tool_ids serve the same declared capability and scope right now — the agent decides whether
 * to call one, and pays that tool's own price (Q3 operator ruling 2026-09-15: never silently
 * switch, never charge a different price than the tool actually called). Nothing here changes
 * schema, price, or the ledger — see R2's own "ничего не подменяет автоматически".
 */

export interface AlternativeTool {
  tool_id: string;
  provider: string;
  price_usd: number;
  status: string;
  scope: string | null;
}

/** Minimal shape computeAlternatives() needs — deliberately decoupled from ToolCacheEntry so
 *  the matching rules can be unit-tested with plain fixtures, no DB/YAML/Redis involved. */
export interface AlternativeCandidate {
  tool_id: string;
  provider: string;
  capability: string | null;
  scope: string | null;
  status: string;
  price_usd: number;
}

/**
 * A candidate is scope-compatible with the requesting tool when it can actually serve the same
 * request the requesting tool would have:
 *   - a 'global' candidate always qualifies (superset of any region).
 *   - a 'regional:<X>' candidate only qualifies for a request of the EXACT same region — never
 *     for a 'global' request (Критерий готовности: "региональный эквивалент не предлагается
 *     для глобального запроса") and never for a different region.
 *   - a missing scope on either side (null — incomplete registry data) never matches: an
 *     unscoped tool is not safely known to cover anything, so it is excluded rather than
 *     guessed into either bucket.
 */
export function isScopeCompatible(
  requestScope: string | null,
  candidateScope: string | null,
): boolean {
  if (!requestScope || !candidateScope) return false;
  if (candidateScope === 'global') return true;
  if (requestScope === 'global') return false;
  return requestScope === candidateScope;
}

/**
 * Pure matching core — no I/O. `requesting` is the tool the agent actually called/looked up;
 * `candidates` is every other known tool (capability may be null for most — those are dropped
 * immediately); `sameUpstreamIds` is `getSameUpstreamSet(requesting.tool_id)`'s output, callers
 * pass it in so this function stays synchronous and independently testable.
 */
export function computeAlternatives(
  requesting: AlternativeCandidate,
  candidates: readonly AlternativeCandidate[],
  sameUpstreamIds: ReadonlySet<string>,
): AlternativeTool[] {
  if (!requesting.capability) return [];

  return candidates
    .filter((c) => c.tool_id !== requesting.tool_id)
    .filter((c) => c.capability === requesting.capability)
    .filter((c) => c.status !== 'unavailable') // Критерий готовности: unavailable никогда не предлагается
    .filter((c) => !sameUpstreamIds.has(c.tool_id)) // Критерий готовности: same_upstream_as никогда не предлагается
    .filter((c) => isScopeCompatible(requesting.scope, c.scope))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'healthy' ? -1 : 1;
      if (a.price_usd !== b.price_usd) return a.price_usd - b.price_usd;
      return a.tool_id.localeCompare(b.tool_id); // deterministic tiebreak
    })
    .map((c) => ({
      tool_id: c.tool_id,
      provider: c.provider,
      price_usd: c.price_usd,
      status: c.status,
      scope: c.scope,
    }));
}

/**
 * Production wrapper: joins the YAML-declared capability/scope registry with the live
 * DB-backed tool cache (status/price, refreshed every 60s by tool-status.stage.ts) to answer
 * "what else can serve this request right now". Returns [] for a tool with no declared
 * capability — the overwhelming majority of the catalog (≈4% of tools are in a capability
 * group today, Q2 ruling-1 поправка 1) — never an error.
 */
export async function getAlternativesForTool(toolId: string): Promise<AlternativeTool[]> {
  const capEntry = getCapabilityEntry(toolId);
  if (!capEntry || !capEntry.capability) return [];

  // Advisory-only (R2's own "ничего не подменяет автоматически") — a cache/DB hiccup here must
  // never break the caller's actual response (catalog entry, 503/502/504 body). Same "degrade
  // to no data rather than throw" posture toEntries() already takes for a Redis outage.
  let cacheEntries: Awaited<ReturnType<typeof getToolCacheEntries>>;
  try {
    cacheEntries = await getToolCacheEntries();
  } catch (error) {
    logger.warn({ err: error, tool_id: toolId }, 'getAlternativesForTool: tool cache unavailable');
    return [];
  }
  const cacheById = new Map(cacheEntries.map((e) => [e.tool_id, e]));
  const self = cacheById.get(toolId);

  const requesting: AlternativeCandidate = {
    tool_id: toolId,
    provider: capEntry.provider,
    capability: capEntry.capability,
    scope: capEntry.scope,
    status: self?.status ?? 'healthy',
    price_usd: self?.price_usd ?? 0,
  };

  const candidates: AlternativeCandidate[] = [];
  for (const entry of cacheEntries) {
    if (entry.tool_id === toolId) continue;
    const other = getCapabilityEntry(entry.tool_id);
    if (!other || !other.capability) continue;
    candidates.push({
      tool_id: entry.tool_id,
      provider: other.provider,
      capability: other.capability,
      scope: other.scope,
      status: entry.status,
      price_usd: entry.price_usd,
    });
  }

  const sameUpstreamIds = getSameUpstreamSet(toolId);
  return computeAlternatives(requesting, candidates, sameUpstreamIds);
}

/** The capability slug for a tool_id, or null. Shared by the two Prometheus counters
 *  (apibase_call_attempted_total / apibase_call_lost_with_alternative_total) so both read the
 *  exact same registry this module already depends on. */
export function getCapabilityForTool(toolId: string): string | null {
  return getCapabilityEntry(toolId)?.capability ?? null;
}
