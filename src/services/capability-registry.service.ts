import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

/**
 * Capability registry (T-0207, ZZ-03-07, 03-SPECIFICATION.md R-2 / Q2 ruling-1 variant D, R2/P1).
 *
 * "Declared equivalence + advisory routing": capability/scope/same_upstream_as are declared BY
 * A HUMAN in config/tool_provider_config.yaml (Q2 ruling-1 поправка 4 — equivalence can NOT be
 * derived from tool_id/name, regional providers look like global ones and aren't). This module
 * is the one place that YAML is parsed at runtime, so every consumer (alternatives.service.ts,
 * the two Prometheus counters) reads the exact same source scripts/seed.ts backfills
 * tools.capability/tools.scope from — never a second, driftable copy.
 *
 * `same_upstream_as` deliberately has no DB column (see schema.prisma's Tool model comment): it
 * is an exclusion list, not a fact about one row, and is only ever consulted here.
 */

export interface CapabilityEntry {
  tool_id: string;
  provider: string;
  /** null = not part of a declared capability group. */
  capability: string | null;
  /** 'global' or 'regional:<CODE>'. null iff capability is also null. */
  scope: string | null;
  /** Other tool_ids that hit the identical upstream endpoint — never suggested as alternatives. */
  same_upstream_as: readonly string[];
}

interface ToolYamlRow {
  tool_id: string;
  provider: string;
  capability?: string;
  scope?: string;
  same_upstream_as?: string[];
}

function loadCapabilityMap(): ReadonlyMap<string, CapabilityEntry> {
  const configPath = resolve(__dirname, '..', '..', 'config', 'tool_provider_config.yaml');
  const raw = readFileSync(configPath, 'utf-8');
  const parsed = parse(raw) as { tools: ToolYamlRow[] };

  const map = new Map<string, CapabilityEntry>();
  for (const row of parsed.tools) {
    map.set(row.tool_id, {
      tool_id: row.tool_id,
      provider: row.provider,
      capability: row.capability ?? null,
      scope: row.scope ?? null,
      same_upstream_as: row.same_upstream_as ?? [],
    });
  }
  return map;
}

// Loaded once at module load — same posture as src/mcp/tool-definitions.ts and
// config/margin.json. config/tool_provider_config.yaml only changes via a deploy (new
// onboarding), never at runtime, so there is no refresh interval here unlike the DB-backed
// tool-status.stage.ts cache.
const CAPABILITY_MAP: ReadonlyMap<string, CapabilityEntry> = loadCapabilityMap();

/** Returns the declared capability entry for a tool_id, or undefined if the tool_id is unknown
 *  to the YAML catalog (e.g. a stale/removed tool_id). A known tool_id with no declared
 *  capability group still returns an entry — just with capability/scope both null. */
export function getCapabilityEntry(toolId: string): CapabilityEntry | undefined {
  return CAPABILITY_MAP.get(toolId);
}

/**
 * Symmetric closure of `same_upstream_as`: a declaration only needs to be written on ONE side
 * of a pair (e.g. finance.ecb_rates -> [frankfurter.latest]) but must exclude in both
 * directions — frankfurter.latest must never suggest finance.ecb_rates back either.
 */
export function getSameUpstreamSet(toolId: string): ReadonlySet<string> {
  const set = new Set<string>();
  const entry = CAPABILITY_MAP.get(toolId);
  if (entry) {
    for (const id of entry.same_upstream_as) set.add(id);
  }
  for (const [id, other] of CAPABILITY_MAP) {
    if (other.same_upstream_as.includes(toolId)) set.add(id);
  }
  return set;
}

/** All tool_ids sharing a given capability slug (used by tests and by demand-measurement
 *  counters that need to know a capability's full membership, not just one tool's). */
export function getToolIdsForCapability(capability: string): readonly string[] {
  const ids: string[] = [];
  for (const [id, entry] of CAPABILITY_MAP) {
    if (entry.capability === capability) ids.push(id);
  }
  return ids;
}

/** Distinct capability slugs with >=1 declared member. Test-only convenience for asserting
 *  against "16 measured groups" without hardcoding the list twice. */
export function getAllCapabilities(): readonly string[] {
  return Array.from(new Set(Array.from(CAPABILITY_MAP.values()).map((e) => e.capability))).filter(
    (c): c is string => c !== null,
  );
}
