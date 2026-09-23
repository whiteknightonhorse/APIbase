/**
 * gen-mcp-tree-candidate.ts — candidate `category.provider.action` MCP name tree (T-0183).
 *
 * WHY: disputes/0180-smithery-naming-score-98-to-100.ruling-1.md §4 item 2. Smithery scores
 * Naming on the shape of the live `tools/list` tree (root = first dot-segment). Today's roots
 * are a mix of provider names (tmdb, foursquare, ...) and category names (gov, science, ...)
 * with 344 roots total and 257 middle segments that only ever have one leaf -- both patterns
 * the ruling identifies as penalized ("flat lists and over-nested paths both reduce the
 * score"). This generates a CANDIDATE tree only: root = category, middle = provider (the
 * toolId prefix), leaf = action (the rest of toolId). Nothing here renames anything live --
 * see the ⛔ Границы in the task brief: mcpName in prod, REST /api/v1/tools, and toolId are
 * all untouched. Ruling item 3 (private Smithery proof) consumes this candidate next; prod
 * cutover (items 4-5) waits on that proof succeeding.
 *
 * Root rule (per disputes/0183-mcp-tree-candidate-generator.ruling-1.md, rejecting attempt 1's
 * use of the raw `category` field): reuse the ~62 EXISTING categorical mcpName roots first --
 * roots already used today by at least one tool whose mcpName root differs from that tool's
 * own toolId provider (e.g. brasilapi.cep already ships as mcpName `gov.brasilapi.cep`, so
 * `gov` is an existing categorical root, not invented here). A provider is pinned to whichever
 * existing categorical root its own tools already use most (ties broken alphabetically). Only
 * providers with NO tool currently under an existing categorical root fall back to the
 * tool-definitions `category` field (again: primary category by count, ties alphabetical).
 * This is a strictly narrower vocabulary than attempt 1's 25 raw `category` values -- e.g.
 * `chem` (toolId prefix) already ships under mcpName root `science`, so it stays `science`,
 * not `health` as attempt 1 produced by reading its `category` field instead.
 *
 * Usage: npx tsx scripts/gen-mcp-tree-candidate.ts
 * Read-only against source: does not touch tool-definitions.ts, mcpName, or the DB. Writes:
 *   scripts/out/mcp-tree-candidate.csv  -- one row per tool: toolId, old mcpName, new mcpName,
 *                                          category, provider, action, root_source
 *   scripts/out/mcp-tree-candidate.md   -- tree statistics + the ruling's acceptance gate
 */
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { TOOL_DEFINITIONS } from '../src/mcp/tool-definitions';

const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'scripts/out');

type RootSource = 'mcpname_reuse' | 'category_fallback';

interface Candidate {
  toolId: string;
  oldMcpName: string;
  root: string;
  provider: string;
  action: string;
  newMcpName: string;
  rootSource: RootSource;
}

function main(): void {
  // Step 1: the existing categorical mcpName-root vocabulary -- any root that at least one
  // tool (from ANY provider) already uses while that tool's own toolId provider is something
  // else. This is the "62 existing categorical roots" from the ruling, derived from data, not
  // hand-picked.
  const categoricalRoots = new Set<string>();
  for (const d of TOOL_DEFINITIONS) {
    const mcpRoot = (d.mcpName ?? d.toolId).split('.')[0];
    const provider = d.toolId.split('.')[0];
    if (mcpRoot !== provider) categoricalRoots.add(mcpRoot);
  }

  // Step 2: per-provider tally of how many of ITS OWN tools already sit under one of the
  // existing categorical roots (an mcpRoot that happens to equal the provider's own name only
  // counts if that same root is independently categorical for some OTHER provider too -- e.g.
  // `weather` provider's own tools count toward root `weather` because other providers already
  // use `weather` as a category root; this is what preserves the flagged
  // `weather.weather.*` duplicate-segment case instead of special-casing it away).
  const providerRootCounts = new Map<string, Map<string, number>>();
  for (const d of TOOL_DEFINITIONS) {
    const mcpRoot = (d.mcpName ?? d.toolId).split('.')[0];
    const provider = d.toolId.split('.')[0];
    if (!categoricalRoots.has(mcpRoot)) continue;
    if (!providerRootCounts.has(provider)) providerRootCounts.set(provider, new Map());
    const counts = providerRootCounts.get(provider)!;
    counts.set(mcpRoot, (counts.get(mcpRoot) ?? 0) + 1);
  }

  const primaryCategoricalRoot = new Map<string, string>();
  for (const [provider, counts] of providerRootCounts) {
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    primaryCategoricalRoot.set(provider, ranked[0][0]);
  }

  // Step 3: fallback -- providers with zero tools under an existing categorical root use their
  // primary `category` field value instead (same tie-break as attempt 1, just scoped to the
  // providers that have no better option).
  const providerCategoryFieldCounts = new Map<string, Map<string, number>>();
  for (const d of TOOL_DEFINITIONS) {
    const provider = d.toolId.split('.')[0];
    if (primaryCategoricalRoot.has(provider)) continue;
    const category = d.category ?? 'uncategorized';
    if (!providerCategoryFieldCounts.has(provider))
      providerCategoryFieldCounts.set(provider, new Map());
    const counts = providerCategoryFieldCounts.get(provider)!;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const primaryCategoryFieldRoot = new Map<string, string>();
  for (const [provider, counts] of providerCategoryFieldCounts) {
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    primaryCategoryFieldRoot.set(provider, ranked[0][0]);
  }

  const rootOf = (provider: string): { root: string; source: RootSource } =>
    primaryCategoricalRoot.has(provider)
      ? { root: primaryCategoricalRoot.get(provider)!, source: 'mcpname_reuse' }
      : { root: primaryCategoryFieldRoot.get(provider)!, source: 'category_fallback' };

  const candidates: Candidate[] = TOOL_DEFINITIONS.map((d) => {
    const [provider, ...rest] = d.toolId.split('.');
    const action = rest.join('_');
    const { root, source } = rootOf(provider);
    return {
      toolId: d.toolId,
      oldMcpName: d.mcpName ?? d.toolId,
      root,
      provider,
      action,
      newMcpName: `${root}.${provider}.${action}`,
      rootSource: source,
    };
  });

  const roots = new Set(candidates.map((c) => c.root));
  const rootsFromReuse = new Set(
    candidates.filter((c) => c.rootSource === 'mcpname_reuse').map((c) => c.root),
  );
  const rootsFromFallback = new Set(
    candidates.filter((c) => c.rootSource === 'category_fallback').map((c) => c.root),
  );
  const providersFromReuse = new Set(primaryCategoricalRoot.keys()).size;
  const providersFromFallback = new Set(primaryCategoryFieldRoot.keys()).size;

  const bucketCounts = new Map<string, number>();
  for (const c of candidates) {
    const key = `${c.root}.${c.provider}`;
    bucketCounts.set(key, (bucketCounts.get(key) ?? 0) + 1);
  }
  const singleLeafBuckets = [...bucketCounts.values()].filter((n) => n === 1).length;

  const providerTotalCounts = new Map<string, number>();
  for (const d of TOOL_DEFINITIONS) {
    const provider = d.toolId.split('.')[0];
    providerTotalCounts.set(provider, (providerTotalCounts.get(provider) ?? 0) + 1);
  }
  const singleToolProviders = [...providerTotalCounts.values()].filter((n) => n === 1).length;

  const multiRootProviders = [...providerRootCounts.values()].filter((m) => m.size > 1).length;

  // Observation only, not a gate: providers ARE their root for some tools (weather, crypto,
  // ...) -- e.g. `weather.get_current` -> `weather.weather.get_current`, a duplicated segment.
  // The ruling explicitly says leave this as-is (already flagged), so it's kept visible here
  // rather than silently collapsed.
  const duplicateSegmentProviders = new Set(
    candidates.filter((c) => c.provider === c.root).map((c) => c.provider),
  );
  const duplicateSegmentTools = candidates.filter((c) => c.provider === c.root).length;

  const newNames = new Set(candidates.map((c) => c.newMcpName));
  const duplicateNewNames = candidates.length - newNames.size;

  mkdirSync(OUT_DIR, { recursive: true });

  const csvEscape = (v: string): string => (v.includes(',') ? `"${v}"` : v);
  const csvLines = [
    'tool_id,old_mcp_name,new_mcp_name,root,provider,action,root_source',
    ...candidates.map((c) =>
      [c.toolId, c.oldMcpName, c.newMcpName, c.root, c.provider, c.action, c.rootSource]
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
    'Source: disputes/0180-smithery-naming-score-98-to-100.ruling-1.md §4 item 2, corrected per',
    'disputes/0183-mcp-tree-candidate-generator.ruling-1.md (attempt 1 used the raw `category`',
    'field for the root; this attempt reuses the existing categorical mcpName roots first and',
    'only falls back to `category` for providers that have no existing categorical root).',
    'Generated by `npx tsx scripts/gen-mcp-tree-candidate.ts`. Candidate only — does not touch',
    'mcpName, DB, or tool-definitions.ts. Full old→new table: mcp-tree-candidate.csv.',
    '',
    `- tools: ${candidates.length}`,
    `- roots (total): ${roots.size} — gate ≤ ~50: ${rootsPass ? 'PASS' : 'FAIL'}`,
    `  - roots reused from existing categorical mcpName roots: ${rootsFromReuse.size} ` +
      `(${providersFromReuse} providers, ${candidates.filter((c) => c.rootSource === 'mcpname_reuse').length} tools)`,
    `  - roots from \`category\` field fallback (no existing categorical root): ${rootsFromFallback.size} ` +
      `(${providersFromFallback} providers, ${candidates.filter((c) => c.rootSource === 'category_fallback').length} tools)`,
    `- distinct (root.provider) 2nd-level nodes: ${bucketCounts.size}`,
    `- single-leaf 2nd-level nodes: ${singleLeafBuckets}`,
    `- single-tool providers (baseline, structurally unavoidable singletons): ${singleToolProviders}`,
    `  — gate single-leaf nodes ≤ single-tool providers: ${singleLeafPass ? 'PASS' : 'FAIL'}`,
    `- duplicate new mcpNames (must be 0): ${duplicateNewNames}`,
    `- providers spanning >1 existing categorical root, re-homed to their primary one: ${multiRootProviders}`,
    `- observation (not a gate, left as-is per ruling): providers whose name equals their root, ` +
      `e.g. weather -> weather.weather.get_current: ${duplicateSegmentProviders.size} providers, ` +
      `${duplicateSegmentTools} tools (${[...duplicateSegmentProviders].sort().join(', ')})`,
    '',
    `Overall: ${overallPass ? 'PASS' : 'FAIL'}`,
    ...(rootsPass
      ? []
      : [
          '',
          '**Roots gate FAIL, documented (not silently forced to pass):** the existing',
          'categorical mcpName-root vocabulary already has 61 distinct words in production data',
          '(finer-grained than the 25-value `category` field), so honestly reusing all of it, as',
          'this correction requires, already exceeds the ~50 target from ruling 0180 §4 item 2',
          'before even adding the 7 category-field-only fallback roots that have no existing',
          'categorical counterpart (device, education, entertainment, infrastructure, location,',
          'marketing, news). Attempt 1 got a false PASS at 25 roots only by ignoring 36 of those',
          '61 existing words (including `gov`, `science`, `environment`) and using the raw',
          '`category` field instead, which is exactly what disputes/0183-mcp-tree-candidate-',
          'generator.ruling-1.md rejected. This generator does not merge/prune the 61 to force a',
          'pass — that would reintroduce the same kind of undocumented root-selection judgment',
          'call. Left for whoever runs item 3 (private Smithery proof) to decide whether 68 roots',
          'still scores well, or whether the ~50 target itself needs revisiting given the real',
          'shape of the existing mcpName data.',
        ]),
  ];
  writeFileSync(resolve(OUT_DIR, 'mcp-tree-candidate.md'), statsLines.join('\n') + '\n');

  for (const line of statsLines) console.log(line);
}

main();
