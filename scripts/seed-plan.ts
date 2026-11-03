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
  upstream_cost_model?: string;
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

export interface RetiredInfo {
  since: string;
}

/** T-0660: providers whose provider-limits.json entry carries a `retired` object. */
export function retiredProviders(limits: unknown): Map<string, RetiredInfo> {
  const out = new Map<string, RetiredInfo>();
  if (typeof limits !== 'object' || limits === null) return out;
  for (const [name, entry] of Object.entries(limits as Record<string, unknown>)) {
    const r = (entry as { retired?: unknown } | null)?.retired;
    if (typeof r === 'object' && r !== null) {
      const since = (r as { since?: unknown }).since;
      out.set(name, { since: typeof since === 'string' ? since : 'unknown' });
    }
  }
  return out;
}

export function loadRetiredProviders(path?: string): Map<string, RetiredInfo> {
  const p = path ?? resolve(__dirname, '..', 'src', 'config', 'provider-limits.json');
  return retiredProviders(JSON.parse(readFileSync(p, 'utf-8')));
}

export function retiredLine(name: string, n: number, info: RetiredInfo): string {
  return `[seed] skipped retired provider ${name} (${n} tools, provider-limits.json retired.since ${info.since})`;
}

/** cost_source for a YAML-recorded cost: 'yaml:<model>', 'yaml' when the model is absent;
 *  T-0655: 'upstream_402' for a tool whose provider's own 402 APIbase pays per call. */
export function yamlCostSource(model: string | undefined): string {
  if (model === 'upstream_402') return 'upstream_402';
  return model ? `yaml:${model}` : 'yaml';
}

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
  retired: ReadonlyMap<string, RetiredInfo> = new Map(),
): SeedRow[] {
  const byId = new Map(tools.map((t) => [t.tool_id, t]));
  const costModel = providersWithCostModel(tools);
  return ids.map((id) => {
    const category = categories.get(id);
    if (!category) throw new Error(`seed --only: '${id}' has no TOOL_DEFINITIONS entry`);
    const t = byId.get(id);
    const prov = t?.provider ?? id.split('.')[0];
    const ret = retired.get(prov);
    if (ret) {
      const n = tools.filter((x) => x.provider === prov).length;
      throw new Error(`seed --only: ${retiredLine(prov, n, ret).replace('[seed] ', '')}`);
    }
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

// ---------------------------------------------------------------------------
// T-0660: full upsert (shared by scripts/seed.ts and the unit tests)
// ---------------------------------------------------------------------------

export interface FullSeedTool extends YamlTool {
  same_upstream_as?: string[];
}

export interface DbToolRow {
  tool_id: string;
  name: string;
  status: string;
  price_usd: unknown;
  cache_ttl: number;
  upstream_cost_usd: unknown;
  cost_source: string | null;
}

export interface FullSeedDb {
  tool: {
    findMany: (a: unknown) => Promise<DbToolRow[]>;
    upsert: (a: unknown) => Promise<unknown>;
  };
}

export interface FullSeedResult {
  count: number;
  skippedRetired: number;
  summary: string | null;
}

const num = (v: unknown): number => Number(String(v));
const sameNum = (a: unknown, b: unknown): boolean => num(a) === num(b);

export async function seedTools(
  db: FullSeedDb,
  tools: readonly FullSeedTool[],
  categories: ReadonlyMap<string, string>,
  retired: ReadonlyMap<string, RetiredInfo>,
  dryRun: boolean,
  log: (line: string) => void = () => undefined,
): Promise<FullSeedResult> {
  const existing = new Map(
    (
      await db.tool.findMany({
        select: {
          tool_id: true,
          name: true,
          status: true,
          price_usd: true,
          cache_ttl: true,
          upstream_cost_usd: true,
          cost_source: true,
        },
      })
    ).map((r) => [r.tool_id, r]),
  );
  const costModel = providersWithCostModel(tools);

  const skippedBy = new Map<string, number>();
  for (const t of tools)
    if (retired.has(t.provider)) skippedBy.set(t.provider, (skippedBy.get(t.provider) ?? 0) + 1);
  for (const [name, n] of skippedBy) log(retiredLine(name, n, retired.get(name) as RetiredInfo));
  const skippedRetired = [...skippedBy.values()].reduce((a, b) => a + b, 0);

  let count = 0;
  let changed = 0;
  const c = { price: 0, cost: 0, cost_source: 0, nameTtl: 0, revive: 0 };
  for (const tool of tools) {
    if (retired.has(tool.provider)) continue;
    const category = categories.get(tool.tool_id);
    if (!category) {
      throw new Error(
        `seedTools: '${tool.tool_id}' is in config/tool_provider_config.yaml but has no ` +
          `TOOL_DEFINITIONS entry (src/mcp/tool-definitions.ts) - cannot derive category.`,
      );
    }
    const namespace = namespaceOf(tool.tool_id, tool.provider);
    if ((tool.capability === undefined) !== (tool.scope === undefined)) {
      throw new Error(
        `seedTools: '${tool.tool_id}' declares only one of capability/scope - both or neither ` +
          `are required (config/tool_provider_config.yaml).`,
      );
    }
    const ex = existing.get(tool.tool_id);
    const revive = reviveFields(ex, tool, costModel);
    const hasCost = tool.upstream_cost_usd !== undefined;
    const source = yamlCostSource(tool.upstream_cost_model);

    if (dryRun) {
      if (!ex) {
        log(
          `${tool.tool_id} CREATE price ${tool.price_usd} cost ${tool.upstream_cost_usd ?? 'NULL'}`,
        );
        changed++;
      } else {
        const diffs: string[] = [];
        if (!sameNum(ex.price_usd, tool.price_usd)) {
          diffs.push(`${tool.tool_id} price_usd ${String(ex.price_usd)} -> ${tool.price_usd}`);
          c.price++;
        }
        if (hasCost) {
          if (
            ex.upstream_cost_usd === null ||
            !sameNum(ex.upstream_cost_usd, tool.upstream_cost_usd)
          ) {
            diffs.push(
              `${tool.tool_id} upstream_cost_usd ${ex.upstream_cost_usd === null ? 'NULL' : String(ex.upstream_cost_usd)} -> ${tool.upstream_cost_usd}`,
            );
            c.cost++;
          }
          if (ex.cost_source !== source) {
            diffs.push(`${tool.tool_id} cost_source ${ex.cost_source ?? 'NULL'} -> ${source}`);
            c.cost_source++;
          }
        }
        if (ex.name !== tool.name || ex.cache_ttl !== tool.cache_ttl) {
          diffs.push(
            `${tool.tool_id} name/cache_ttl ${ex.name}/${ex.cache_ttl} -> ${tool.name}/${tool.cache_ttl}`,
          );
          c.nameTtl++;
        }
        if ('status' in revive) {
          diffs.push(`${tool.tool_id} status ${ex.status} -> healthy (revive)`);
          c.revive++;
        }
        for (const d of diffs) log(d);
        if (diffs.length > 0) changed++;
      }
      count++;
      continue;
    }

    await db.tool.upsert({
      where: { tool_id: tool.tool_id },
      create: {
        tool_id: tool.tool_id,
        name: tool.name,
        provider: tool.provider,
        status: 'healthy',
        price_usd: tool.price_usd,
        cache_ttl: tool.cache_ttl,
        upstream_cost_usd: tool.upstream_cost_usd ?? null,
        ...(hasCost ? { cost_source: source } : {}),
        category,
        namespace,
        capability: tool.capability ?? null,
        scope: tool.scope ?? null,
      },
      update: {
        name: tool.name,
        price_usd: tool.price_usd,
        cache_ttl: tool.cache_ttl,
        // Omit (not null) when absent from YAML: a re-seed must not revert a bounded migration pass.
        ...(hasCost ? { upstream_cost_usd: tool.upstream_cost_usd, cost_source: source } : {}),
        category,
        namespace,
        capability: tool.capability ?? null,
        scope: tool.scope ?? null,
        ...revive,
      },
    });
    count++;
  }

  let summary: string | null = null;
  if (dryRun) {
    summary =
      `would change: ${changed} tools (price ${c.price}, cost ${c.cost}, cost_source ${c.cost_source}, ` +
      `name/ttl ${c.nameTtl}, revive ${c.revive}); skipped retired: ${skippedRetired}`;
    log(summary);
  }
  return { count, skippedRetired, summary };
}
