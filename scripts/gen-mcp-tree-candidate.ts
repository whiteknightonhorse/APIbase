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
 * Root rule (per disputes/0183-mcp-tree-candidate-generator.ruling-2.md, rejecting attempt 2's
 * "any mcpName root whose provider differs from the toolId provider counts as categorical"):
 * an existing mcpName root only counts as a genuine EXISTING CATEGORICAL ROOT if at least two
 * DISTINCT toolId-providers already ship tools under it today (e.g. `gov` today carries
 * ukpolice, brasilapi, ibge, sg and fec -- 5 providers, clearly a shared category; `weather`
 * carries weather, weather_alerts, airnow and weatherapi -- 4 providers, so the
 * `weather.weather.*` duplicate-segment case is legitimately kept). Attempt 2's rule
 * (mcpRoot != own-provider) wrongly treated single-provider RENAMES as categories -- e.g.
 * `razorpay` was only ever used by provider `razorpayifsc` (a rename, not a category), same for
 * `mbta`<-mbta-transit, `nominatim`<-nominatim-osm, `datausa`<-data-usa, `bls`<-bls-macro,
 * `test`<-random -- and it also kept 29 single-provider "category-shaped" words (`currency`,
 * `world`, `tax`, `translate`, ...) as roots even though exactly one provider sits under each,
 * i.e. exactly the "chains without branching" shape ruling 0180 penalizes. Requiring >=2
 * distinct providers per root removes both failure modes from the same data, no hand-picked
 * list: a provider is pinned to whichever qualifying (>=2-provider) root its own tools already
 * use most (ties broken alphabetically); only providers with NO tool under a qualifying root
 * fall back to the tool-definitions `category` field (primary category by count, ties
 * alphabetical) -- same fallback attempt 1/2 already used, just scoped to fewer providers now
 * that the categorical vocabulary is verified-shared instead of merely non-matching.
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
  // Step 1: the existing categorical mcpName-root vocabulary -- a root qualifies only if at
  // least two DISTINCT toolId-providers already ship tools under it today (see header comment:
  // this is what tells a real shared category like `gov`/`weather` apart from a single-provider
  // rename like `razorpay`<-razorpayifsc or a single-provider "category-shaped" word like
  // `currency`<-exchangerate). Built from ALL tools, including ones whose own provider name
  // happens to equal the root -- that's exactly how `weather` (providers weather,
  // weather_alerts, airnow, weatherapi) legitimately qualifies while still preserving the
  // flagged `weather.weather.*` duplicate-segment case, with no special-casing needed.
  const rootProviders = new Map<string, Set<string>>();
  for (const d of TOOL_DEFINITIONS) {
    const mcpRoot = (d.mcpName ?? d.toolId).split('.')[0];
    const provider = d.toolId.split('.')[0];
    if (!rootProviders.has(mcpRoot)) rootProviders.set(mcpRoot, new Set());
    rootProviders.get(mcpRoot)!.add(provider);
  }
  const categoricalRoots = new Set(
    [...rootProviders.entries()]
      .filter(([, providers]) => providers.size >= 2)
      .map(([root]) => root),
  );

  // Step 2: per-provider tally of how many of ITS OWN tools already sit under one of the
  // qualifying (>=2-provider) categorical roots.
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

  // Root-level singleton chains: roots with exactly ONE distinct provider under them -- the
  // other penalized shape from ruling 0180 §1 ("корней ровно с одним потомком 2-го уровня",
  // 173 today) that attempt 2 left unmeasured (disputes/0183-mcp-tree-candidate-generator.
  // ruling-2.md point 2). Baseline: `category` field values used by exactly one provider across
  // ALL tools -- even a perfect root choice can't branch a category that only one provider is
  // ever tagged with, so this is the structurally-unavoidable floor, same role
  // `singleToolProviders` plays for the leaf gate above.
  const rootProviderSets = new Map<string, Set<string>>();
  for (const c of candidates) {
    if (!rootProviderSets.has(c.root)) rootProviderSets.set(c.root, new Set());
    rootProviderSets.get(c.root)!.add(c.provider);
  }
  const singletonRoots = [...rootProviderSets.entries()].filter(([, p]) => p.size === 1);

  const categoryProviderSets = new Map<string, Set<string>>();
  for (const d of TOOL_DEFINITIONS) {
    const provider = d.toolId.split('.')[0];
    const category = d.category ?? 'uncategorized';
    if (!categoryProviderSets.has(category)) categoryProviderSets.set(category, new Set());
    categoryProviderSets.get(category)!.add(provider);
  }
  const singleProviderCategoryValues = [...categoryProviderSets.values()].filter(
    (p) => p.size === 1,
  ).length;

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
  const singletonRootPass = singletonRoots.length <= singleProviderCategoryValues;
  const overallPass = rootsPass && singleLeafPass && singletonRootPass && duplicateNewNames === 0;

  const statsLines = [
    '# MCP tree candidate — statistics (T-0183)',
    '',
    'Source: disputes/0180-smithery-naming-score-98-to-100.ruling-1.md §4 item 2, corrected per',
    'disputes/0183-mcp-tree-candidate-generator.ruling-2.md (attempt 2 treated any mcpName root',
    'whose provider differed from the toolId provider as "categorical", which wrongly counted',
    'single-provider renames like razorpay<-razorpayifsc and single-provider "category-shaped"',
    'words like currency<-exchangerate as roots. This attempt requires >=2 DISTINCT providers',
    'already under a root before reusing it, and only falls back to `category` for providers',
    'with no such qualifying root).',
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
    `- roots with exactly 1 provider (singleton chains, no branching): ${singletonRoots.length}` +
      (singletonRoots.length
        ? ` (${singletonRoots
            .map(([r]) => r)
            .sort()
            .join(', ')})`
        : ''),
    `- category-field values with exactly 1 provider (baseline, structurally unavoidable): ${singleProviderCategoryValues}`,
    `  — gate singleton-root chains ≤ that baseline: ${singletonRootPass ? 'PASS' : 'FAIL'}`,
    `- observation (not a gate, left as-is per ruling): providers whose name equals their root, ` +
      `e.g. weather -> weather.weather.get_current: ${duplicateSegmentProviders.size} providers, ` +
      `${duplicateSegmentTools} tools (${[...duplicateSegmentProviders].sort().join(', ')})`,
    '',
    `Overall: ${overallPass ? 'PASS' : 'FAIL'}`,
  ];
  writeFileSync(resolve(OUT_DIR, 'mcp-tree-candidate.md'), statsLines.join('\n') + '\n');

  for (const line of statsLines) console.log(line);
}

main();
