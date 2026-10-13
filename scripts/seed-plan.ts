/**
 * T-0333: pure planning helpers shared by scripts/seed.ts (--only / --dry-run) and
 * scripts/check-seed-drift.ts. No DB client is imported here; callers pass one in.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

export interface YamlTool {
  tool_id: string;
  name: string;
  provider: string;
  price_usd: string;
  cache_ttl: number;
  upstream_cost_usd?: string;
  capability?: string;
  scope?: string;
}

export interface SeedRow {
  tool_id: string;
  name: string;
  provider: string;
  status: 'healthy' | 'unavailable';
  price_usd: string;
  cache_ttl: number;
  upstream_cost_usd: string | null;
  category: string;
  namespace: string;
  capability: string | null;
  scope: string | null;
}

const UNPRICED_CACHE_TTL = 3600;

export function loadYamlTools(path?: string): YamlTool[] {
  const p = path ?? resolve(__dirname, '..', 'config', 'tool_provider_config.yaml');
  return (parse(readFileSync(p, 'utf-8')) as { tools: YamlTool[] }).tools;
}

export function namespaceOf(toolId: string, provider: string): string {
  return toolId.includes('.') ? toolId.split('.')[0] : provider;
}

/** A provider has a cost model when any of its YAML tools declares upstream_cost_usd ("0" = free). */
export function providersWithCostModel(tools: readonly YamlTool[]): Set<string> {
  return new Set(tools.filter((t) => t.upstream_cost_usd !== undefined).map((t) => t.provider));
}

/**
 * Status for a newly seeded tool. `healthy` only when a positive price is configured AND the
 * provider has upstream cost info (or is explicitly free = "0"); otherwise `unavailable`, so a
 * paid tool is never sold at $0 or without a margin basis (tool-status.stage.ts margin floor).
 */
export function newToolStatus(
  tool: YamlTool,
  costModel: ReadonlySet<string>,
): 'healthy' | 'unavailable' {
  const price = Number(tool.price_usd);
  return Number.isFinite(price) && price > 0 && costModel.has(tool.provider)
    ? 'healthy'
    : 'unavailable';
}

export interface ExistingToolRow {
  tool_id: string;
  status: string;
  price_usd: unknown;
}

/**
 * Fields that revive an unpriced placeholder row once the YAML prices it. Price 0 + unavailable
 * is exactly the placeholder shape planSeedRows writes for unpriced tools; any row a human or the
 * autopilot set unavailable carries a real price and is never touched. 'seed' satisfies the
 * migration-0014 trigger (status_source + status_reason required) and, unlike 'manual', stays
 * eligible for the autopilot reconciler (scripts/autopilot/incident-engine.py status_source LAW).
 */
export function reviveFields(
  existing: ExistingToolRow | undefined,
  tool: YamlTool,
  costModel: ReadonlySet<string>,
): { status: 'healthy'; status_source: 'seed'; status_reason: string } | Record<string, never> {
  if (
    existing &&
    existing.status === 'unavailable' &&
    Number(String(existing.price_usd)) === 0 &&
    newToolStatus(tool, costModel) === 'healthy'
  ) {
    return {
      status: 'healthy',
      status_source: 'seed',
      status_reason:
        'seed: priced in config/tool_provider_config.yaml (was unpriced placeholder at $0)',
    };
  }
  return {};
}

export function planSeedRows(
  tools: readonly YamlTool[],
  categories: ReadonlyMap<string, string>,
  ids: readonly string[],
): SeedRow[] {
  const byId = new Map(tools.map((t) => [t.tool_id, t]));
  const costModel = providersWithCostModel(tools);
  return ids.map((id) => {
    const category = categories.get(id);
    if (!category) throw new Error(`seed --only: '${id}' has no TOOL_DEFINITIONS entry`);
    const t = byId.get(id);
    if (!t) {
      // Defined in code but no price configured yet (e.g. clevelandart.*): seed it as
      // `unavailable` at price 0 so it is visible to ops but never sold; the operator sets the
      // price in config/tool_provider_config.yaml and re-seeds. Never a $0 *selling* tool.
      return {
        tool_id: id,
        name: id,
        provider: id.split('.')[0],
        status: 'unavailable',
        price_usd: '0',
        cache_ttl: UNPRICED_CACHE_TTL,
        upstream_cost_usd: null,
        category,
        namespace: id.split('.')[0],
        capability: null,
        scope: null,
      } as SeedRow;
    }
    if ((t.capability === undefined) !== (t.scope === undefined)) {
      throw new Error(`seed --only: '${id}' declares only one of capability/scope`);
    }
    return {
      tool_id: id,
      name: t.name,
      provider: t.provider,
      status: newToolStatus(t, costModel),
      price_usd: t.price_usd,
      cache_ttl: t.cache_ttl,
      upstream_cost_usd: t.upstream_cost_usd ?? null,
      category,
      namespace: namespaceOf(id, t.provider),
      capability: t.capability ?? null,
      scope: t.scope ?? null,
    };
  });
}

export interface ToolWriter {
  tool: { create: (args: { data: SeedRow }) => Promise<unknown> };
}

/**
 * Seeds exactly `ids`. Existing rows are never touched (--only is for newly seeded tools; it
 * must not revive/overwrite status of a live row). Dry-run performs zero writes.
 */
export async function seedOnly(
  db: ToolWriter & { tool: { findMany: (a: unknown) => Promise<{ tool_id: string }[]> } },
  rows: readonly SeedRow[],
  dryRun: boolean,
): Promise<{ created: string[]; skipped: string[] }> {
  const existing = new Set(
    (
      await db.tool.findMany({
        where: { tool_id: { in: rows.map((r) => r.tool_id) } },
        select: { tool_id: true },
      })
    ).map((r) => r.tool_id),
  );
  const created: string[] = [];
  const skipped: string[] = [];
  for (const row of rows) {
    if (existing.has(row.tool_id)) {
      skipped.push(row.tool_id);
      continue;
    }
    if (!dryRun) await db.tool.create({ data: row });
    created.push(row.tool_id);
  }
  return { created, skipped };
}

export interface DriftEntry {
  tool_id: string;
  provider: string;
  category: string;
  price_usd: string | null;
  has_cost_model: boolean;
}

export function computeDrift(
  defs: readonly { toolId: string; category: string }[],
  dbIds: ReadonlySet<string>,
  yamlTools: readonly YamlTool[],
): DriftEntry[] {
  const byId = new Map(yamlTools.map((t) => [t.tool_id, t]));
  const costModel = providersWithCostModel(yamlTools);
  return defs
    .filter((d) => !dbIds.has(d.toolId))
    .map((d) => {
      const y = byId.get(d.toolId);
      const provider = y?.provider ?? namespaceOf(d.toolId, d.toolId);
      return {
        tool_id: d.toolId,
        provider,
        category: d.category,
        price_usd: y?.price_usd ?? null,
        has_cost_model: costModel.has(provider),
      };
    })
    .sort((a, b) => a.tool_id.localeCompare(b.tool_id));
}
