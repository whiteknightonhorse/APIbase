/**
 * ENGLISH-ONLY-1006 gate: no Cyrillic anywhere in the tracked repository (`git ls-files`, minus binary
 * extensions), except three Telegram slots (ruling-2 section 2). The allowlist is three structural
 * rules for three files, not a list of paths:
 *   (a) config/autopilot/tg-strings.ru.json: flat object, ASCII keys, string values, Cyrillic only in values;
 *   (b) config/autopilot/routing.json: Cyrillic only in string elements of arrays under a `variants` key;
 *   (c) scripts/sync-counts-cron.sh: Cyrillic only after the first `calert "` on the line, with a
 *       prefix that has neither `#` nor Cyrillic.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const TG_STRINGS = 'config/autopilot/tg-strings.ru.json';
const ROUTING = 'config/autopilot/routing.json';
const SYNC_CRON = 'scripts/sync-counts-cron.sh';
const BINARY_EXT = /\.(png|jpe?g|gif|ico|woff2?|mp4|pdf)$/i;
const CYRILLIC = /[\u0400-\u04FF]/;
const KEY_RE = /^[A-Za-z0-9_.]+$/;

function listFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8')
    .split('\0')
    .filter((f) => f && !BINARY_EXT.test(f));
}

function snippet(line: string): string {
  return line.trim().slice(0, 120);
}

function scanTgStrings(text: string, hits: string[]): void {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    hits.push(`${TG_STRINGS}:invalid-json:${String(e)}`);
    return;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    hits.push(`${TG_STRINGS}:$:not a flat object`);
    return;
  }
  for (const [k, v] of Object.entries(data)) {
    if (!KEY_RE.test(k)) hits.push(`${TG_STRINGS}:${k}:key must match ${KEY_RE}`);
    if (typeof v !== 'string') hits.push(`${TG_STRINGS}:${k}:value must be a string`);
  }
}

function walkRouting(node: unknown, path: string, inVariants: boolean, hits: string[]): void {
  if (typeof node === 'string') {
    if (CYRILLIC.test(node) && !inVariants) hits.push(`${ROUTING}:${path}:${snippet(node)}`);
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => walkRouting(v, `${path}[${i}]`, inVariants, hits));
  } else if (node !== null && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (CYRILLIC.test(k)) hits.push(`${ROUTING}:${path}.${k}:Cyrillic in a key`);
      // only a direct `variants` array opens the allowance; nested objects close it again
      const opens = k === 'variants' && Array.isArray(v);
      walkRouting(v, `${path}.${k}`, opens, hits);
    }
  }
}

function scanRouting(text: string, hits: string[]): void {
  try {
    walkRouting(JSON.parse(text), '$', false, hits);
  } catch (e) {
    hits.push(`${ROUTING}:invalid-json:${String(e)}`);
  }
}

function scanSyncCron(text: string, hits: string[]): void {
  text.split('\n').forEach((line, i) => {
    if (!CYRILLIC.test(line)) return;
    const at = line.indexOf('calert "');
    const prefix = at >= 0 ? line.slice(0, at) : null;
    if (prefix === null || prefix.includes('#') || CYRILLIC.test(prefix)) {
      hits.push(`${SYNC_CRON}:${i + 1}:${snippet(line)}`);
    }
  });
}

function scan(files: string[]): { checked: number; hits: string[] } {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const hits: string[] = [];
  let checked = 0;
  for (const f of files) {
    let text: string;
    try {
      text = decoder.decode(readFileSync(join(ROOT, f)));
    } catch {
      continue; // deleted in the working tree, or not valid utf-8 (binary)
    }
    checked++;
    if (f === TG_STRINGS) scanTgStrings(text, hits);
    else if (f === ROUTING) scanRouting(text, hits);
    else if (f === SYNC_CRON) scanSyncCron(text, hits);
    else {
      text.split('\n').forEach((line, i) => {
        if (CYRILLIC.test(line)) hits.push(`${f}:${i + 1}:${snippet(line)}`);
      });
    }
  }
  return { checked, hits };
}

describe('english-only gate', () => {
  const { checked, hits } = scan(listFiles());

  it('EO0: the whole repository is scanned (>= 1000 files checked)', () => {
    expect(checked).toBeGreaterThanOrEqual(1000);
  });

  it('EO1: no Cyrillic outside the three Telegram slots', () => {
    expect(hits.join('\n')).toBe('');
  });
});
