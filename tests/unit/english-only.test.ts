/** ENGLISH-ONLY-1006 gate: no Cyrillic in tracked public surfaces, src, docs, tests, templates. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCOPE = [
  'static/',
  'src/',
  'docs/',
  'tests/',
  'nginx/',
  '.github/',
  'config/integrator/',
  'scripts/autopilot/templates/',
  'scripts/check-english-only-static.py',
  'README.md',
  'CLAUDE.md',
];
const BINARY_EXT = /\.(png|jpe?g|gif|ico|woff2?|mp4|pdf)$/i;
const CYRILLIC = /[\u0400-\u04FF]/;

function listFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z', '--', ...SCOPE], {
    cwd: ROOT,
    maxBuffer: 64 * 1024 * 1024,
  })
    .toString('utf8')
    .split('\0')
    .filter((f) => f && !BINARY_EXT.test(f));
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
    text.split('\n').forEach((line, i) => {
      if (CYRILLIC.test(line)) hits.push(`${f}:${i + 1}:${line.trim().slice(0, 120)}`);
    });
  }
  return { checked, hits };
}

describe('english-only gate', () => {
  const { checked, hits } = scan(listFiles());

  it('EO0: the file list is not empty (>= 200 files checked)', () => {
    expect(checked).toBeGreaterThanOrEqual(200);
  });

  it('EO1: no Cyrillic in any checked file', () => {
    expect(hits.join('\n')).toBe('');
  });
});
