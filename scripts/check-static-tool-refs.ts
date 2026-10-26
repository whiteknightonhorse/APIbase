/**
 * check-static-tool-refs.ts (F5 gate, T-0533 extension).
 *
 * WHY: connect.html -- the single most conversion-critical page on the site, the
 * literal "copy this and go" starter example -- called `tools/coingecko.get_price/call`
 * twice. That tool_id does not exist; the real one is `crypto.get_price`. Later the docs kept
 * naming amadeus.flight_search and nasa.apod, which exist but are unavailable. Nothing caught
 * either because nothing compared what the docs tell visitors to call against the catalog.
 *
 * This extracts every tool reference (`tools/<id>/call`, `"name": "<id>"`, `<id>` in backticks
 * where <id> starts with a known provider) from static/**\/*.{html,md,txt,json}, README.md and
 * docs/payments.md, and requires each id to be in TOOL_DEFINITIONS (the source of truth for the
 * tool-count gates) AND healthy: a row of scripts/discovery-snapshot.tsv, which lists exactly the
 * healthy tools. A provider going DOWN turns the docs red at the next cron on purpose.
 *
 * Generated files that list unavailable tools by design are skipped (SKIP_FILES / SKIP_DIRS).
 *
 * Usage: npx tsx scripts/check-static-tool-refs.ts
 * Exit 0 = every referenced tool_id is real and healthy. Exit 1 = stale/unhealthy id found, printed.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { TOOL_DEFINITIONS } from '../src/mcp/tool-definitions';

const ROOT = join(__dirname, '..');
const SKIP_DIRS = new Set(['video', 'node_modules']);
// Generated or by-design lists of tool ids (statuses, full catalogs, specs).
const SKIP_FILES = new Set([
  'static/.well-known/site-facts.json',
  'static/.well-known/openapi.json',
  'static/.well-known/openapi-discovery.json',
  'static/openapi.json',
  'static/catalog.html',
]);
const EXTS = /\.(html|md|txt|json)$/;
const EXTRA_FILES = ['README.md', 'docs/payments.md'];
const CALL_RE = /tools\/([a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+)\/call/g;
const NAME_RE = /(?:`|"name":\s*")([a-z0-9_]+\.[a-z0-9_]+)(?:`|")/g;

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(e)) walk(p, out);
    } else if (EXTS.test(e)) out.push(p);
  }
}

function main(): number {
  const defined = new Set(TOOL_DEFINITIONS.map((d) => d.toolId));
  const healthy = new Set(
    readFileSync(join(ROOT, 'scripts/discovery-snapshot.tsv'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('\t')[0]),
  );
  const providers = new Set([...defined, ...healthy].map((id) => id.split('.')[0]));

  const files: string[] = [];
  walk(join(ROOT, 'static'), files);
  for (const f of EXTRA_FILES) files.push(join(ROOT, f));

  const violations: string[] = [];
  let checked = 0;
  for (const file of files) {
    const rel = relative(ROOT, file);
    if (SKIP_FILES.has(rel)) continue;
    checked++;
    const text = readFileSync(file, 'utf8');
    const ids = new Set<string>();
    for (const m of text.matchAll(CALL_RE)) ids.add(m[1]);
    for (const m of text.matchAll(NAME_RE)) if (providers.has(m[1].split('.')[0])) ids.add(m[1]);
    for (const id of ids) {
      if (healthy.has(id)) continue;
      violations.push(
        defined.has(id)
          ? `${rel}: names '${id}' -- defined but not healthy (not in scripts/discovery-snapshot.tsv)`
          : `${rel}: names '${id}' -- no such tool_id in TOOL_DEFINITIONS`,
      );
    }
  }

  if (violations.length > 0) {
    console.error('check-static-tool-refs: BLOCKED - stale or unhealthy tool_id reference(s):');
    for (const v of violations) console.error(`  ${v}`);
    console.error(
      '\nFix: use a healthy tool_id (a row of scripts/discovery-snapshot.tsv, defined in src/mcp/tool-definitions.ts).',
    );
    return 1;
  }

  console.log(
    `check-static-tool-refs: OK - every tool reference is a real, healthy tool_id (${checked} files checked)`,
  );
  return 0;
}

process.exit(main());
