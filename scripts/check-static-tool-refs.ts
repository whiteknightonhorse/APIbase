/**
 * check-static-tool-refs.ts (F5 gate).
 *
 * WHY: connect.html -- the single most conversion-critical page on the site, the
 * literal "copy this and go" starter example -- called `tools/coingecko.get_price/call`
 * twice. That tool_id does not exist; the real one is `crypto.get_price`. Nothing caught
 * it because nothing ever compared what static/*.html actually tells visitors to call
 * against the real tool catalog.
 *
 * This extracts every `tools/<id>/call` reference from every static/*.html page and
 * checks each `<id>` against TOOL_DEFINITIONS (the same source of truth every other
 * tool-count/catalog gate in this repo uses) -- imported directly, not regex-guessed
 * from source, so it can never drift from what the server actually serves.
 *
 * Usage: npx tsx scripts/check-static-tool-refs.ts
 * Exit 0 = every referenced tool_id is real. Exit 1 = a stale/typo'd id found, printed.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { TOOL_DEFINITIONS } from '../src/mcp/tool-definitions';

const STATIC_DIR = join(__dirname, '../static');
const TOOL_REF_RE = /tools\/([a-zA-Z0-9_.]+)\/call/g;

function main(): number {
  const realIds = new Set(TOOL_DEFINITIONS.map((d) => d.toolId));
  const htmlFiles = readdirSync(STATIC_DIR).filter((f) => f.endsWith('.html'));

  const violations: string[] = [];
  for (const file of htmlFiles) {
    const text = readFileSync(join(STATIC_DIR, file), 'utf8');
    const seen = new Set<string>();
    for (const match of text.matchAll(TOOL_REF_RE)) {
      const toolId = match[1];
      if (seen.has(toolId)) continue;
      seen.add(toolId);
      if (!realIds.has(toolId)) {
        violations.push(
          `static/${file}: references 'tools/${toolId}/call' -- no such tool_id in TOOL_DEFINITIONS`,
        );
      }
    }
  }

  if (violations.length > 0) {
    console.error('check-static-tool-refs: BLOCKED - stale tool_id reference(s) in static/*.html:');
    for (const v of violations) console.error(`  ${v}`);
    console.error(
      '\nFix: use the real tool_id from src/mcp/tool-definitions.ts (TOOL_DEFINITIONS).',
    );
    return 1;
  }

  console.log(
    `check-static-tool-refs: OK - every tools/<id>/call reference in static/*.html is a real tool_id (${htmlFiles.length} pages checked)`,
  );
  return 0;
}

process.exit(main());
