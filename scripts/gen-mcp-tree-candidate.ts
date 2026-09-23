/**
 * gen-mcp-tree-candidate.ts — candidate `category.provider.action` MCP name tree (T-0183).
 *
 * WHY: disputes/0180-smithery-naming-score-98-to-100.ruling-1.md §4 item 2. Smithery scores
 * Naming on the shape of the live `tools/list` tree (root = first dot-segment). Today's roots
 * are a mix of provider names (tmdb, foursquare, ...) and category names (weather, gov, ...)
 * with 344 roots total and 257 middle segments that only ever have one leaf -- both patterns
 * the ruling identifies as penalized ("flat lists and over-nested paths both reduce the
 * score"). This generates a CANDIDATE tree only: root = category (the existing `category`
 * field, reused as-is, never invented), middle = provider (the toolId prefix), leaf = action
 * (the rest of toolId). Nothing here renames anything live -- see the ⛔ Границы in the task
 * brief: mcpName in prod, REST /api/v1/tools, and toolId are all untouched. Ruling item 3
 * (private Smithery proof) consumes this candidate next; prod cutover (items 4-5) waits on
 * that proof succeeding.
 *
 * Rule for the middle segment: one category per PROVIDER, not per tool. 11 providers (e.g.
 * `fcc`, `brasilapi`) have tools scattered across more than one category today; grouping by
 * tool's own category would split such a provider into two `category.provider` nodes, at
 * least one of them an avoidable singleton leaf even though the provider has several tools
 * overall. Each provider is instead pinned to its PRIMARY category (the category holding the
 * most of that provider's tools; ties broken alphabetically for a deterministic result), so a
 * provider's tools always land under one `category.provider` node together.
 *
 * Usage: npx tsx scripts/gen-mcp-tree-candidate.ts
 * Read-only against source: does not touch tool-definitions.ts, mcpName, or the DB. Writes:
 *   scripts/out/mcp-tree-candidate.csv  -- one row per tool: toolId, old mcpName, new mcpName
 *   scripts/out/mcp-tree-candidate.md   -- tree statistics + the ruling's acceptance gate
 */
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { TOOL_DEFINITIONS } from '../src/mcp/tool-definitions';

const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'scripts/out');

interface Candidate {
  toolId: string;
  oldMcpName: string;
  category: string;
  provider: string;
  action: string;
  newMcpName: string;
}

function main(): void {
  const providerCategoryCounts = new Map<string, Map<string, number>>();
  for (const d of TOOL_DEFINITIONS) {
    const provider = d.toolId.split('.')[0];
    const category = d.category ?? 'uncategorized';
    if (!providerCategoryCounts.has(provider)) providerCategoryCounts.set(provider, new Map());
    const counts = providerCategoryCounts.get(provider)!;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  const primaryCategory = new Map<string, string>();
  for (const [provider, counts] of providerCategoryCounts) {
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    primaryCategory.set(provider, ranked[0][0]);
  }

  const candidates: Candidate[] = TOOL_DEFINITIONS.map((d) => {
    const [provider, ...rest] = d.toolId.split('.');
    const action = rest.join('_');
    const category = primaryCategory.get(provider)!;
    return {
      toolId: d.toolId,
      oldMcpName: d.mcpName ?? d.toolId,
      category,
      provider,
      action,
      newMcpName: `${category}.${provider}.${action}`,
    };
  });

  const roots = new Set(candidates.map((c) => c.category));

  const bucketCounts = new Map<string, number>();
  for (const c of candidates) {
    const key = `${c.category}.${c.provider}`;
    bucketCounts.set(key, (bucketCounts.get(key) ?? 0) + 1);
  }
  const singleLeafBuckets = [...bucketCounts.values()].filter((n) => n === 1).length;

  const providerTotalCounts = new Map<string, number>();
  for (const d of TOOL_DEFINITIONS) {
    const provider = d.toolId.split('.')[0];
    providerTotalCounts.set(provider, (providerTotalCounts.get(provider) ?? 0) + 1);
  }
  const singleToolProviders = [...providerTotalCounts.values()].filter((n) => n === 1).length;

  const multiCategoryProviders = [...providerCategoryCounts.values()].filter(
    (m) => m.size > 1,
  ).length;

  // Observation only, not a gate: 8 providers ARE their category (weather, crypto, ...) --
  // e.g. `weather.get_current` -> `weather.weather.get_current`, a duplicated segment. The
  // ruling doesn't rule on this case; leaving it visible for the item-3 Smithery proof to
  // judge rather than silently collapsing it here.
  const duplicateSegmentProviders = new Set(
    candidates.filter((c) => c.provider === c.category).map((c) => c.provider),
  );
  const duplicateSegmentTools = candidates.filter((c) => c.provider === c.category).length;

  const newNames = new Set(candidates.map((c) => c.newMcpName));
  const duplicateNewNames = candidates.length - newNames.size;

  mkdirSync(OUT_DIR, { recursive: true });

  const csvEscape = (v: string): string => (v.includes(',') ? `"${v}"` : v);
  const csvLines = [
    'tool_id,old_mcp_name,new_mcp_name,category,provider,action',
    ...candidates.map((c) =>
      [c.toolId, c.oldMcpName, c.newMcpName, c.category, c.provider, c.action]
        .map(csvEscape)
        .join(','),
    ),
  ];
  writeFileSync(resolve(OUT_DIR, 'mcp-tree-candidate.csv'), csvLines.join('\n') + '\n');

  const rootsPass = roots.size <= 50;
  const singleLeafPass = singleLeafBuckets <= singleToolProviders;
  const overallPass = rootsPass && singleLeafPass && duplicateNewNames === 0;

  const statsLines = [
    '# MCP tree candidate — statistics (T-0183)',
    '',
    'Source: disputes/0180-smithery-naming-score-98-to-100.ruling-1.md §4 item 2.',
    'Generated by `npx tsx scripts/gen-mcp-tree-candidate.ts`. Candidate only — does not touch',
    'mcpName, DB, or tool-definitions.ts. Full old→new table: mcp-tree-candidate.csv.',
    '',
    `- tools: ${candidates.length}`,
    `- roots (categories used): ${roots.size} — gate ≤ ~50: ${rootsPass ? 'PASS' : 'FAIL'}`,
    `- distinct (category.provider) 2nd-level nodes: ${bucketCounts.size}`,
    `- single-leaf 2nd-level nodes: ${singleLeafBuckets}`,
    `- single-tool providers (baseline, structurally unavoidable singletons): ${singleToolProviders}`,
    `  — gate single-leaf nodes ≤ single-tool providers: ${singleLeafPass ? 'PASS' : 'FAIL'}`,
    `- duplicate new mcpNames (must be 0): ${duplicateNewNames}`,
    `- providers spanning >1 category, re-homed to their primary category: ${multiCategoryProviders}`,
    `- observation (not a gate): providers whose name equals their category, e.g. weather -> ` +
      `weather.weather.get_current: ${duplicateSegmentProviders.size} providers, ${duplicateSegmentTools} tools ` +
      `(${[...duplicateSegmentProviders].sort().join(', ')})`,
    '',
    `Overall: ${overallPass ? 'PASS' : 'FAIL'}`,
  ];
  writeFileSync(resolve(OUT_DIR, 'mcp-tree-candidate.md'), statsLines.join('\n') + '\n');

  for (const line of statsLines) console.log(line);
}

main();
