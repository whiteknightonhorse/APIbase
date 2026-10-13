/**
 * T-0353 gate: no hard-coded API-key literals or key fallbacks in tracked files under scripts/.
 * Catches `${PROVIDER_KEY_X:-<16+ chars>}` fallbacks and `SOME_KEY="<16+ chars>"` assignments.
 * Reports file:line and rule only, never the matched value.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SECRET_NAME = '[A-Za-z0-9_]*(?:KEY|TOKEN|SECRET)[A-Za-z0-9_]*';
// Documented placeholders (ak_live_0000..., ak_live_PLACEHOLDER, ak_live_test_...) are not secrets.
const LITERAL = '(?!ak_live_(?:0{4}|PLACEHOLDER|test_))[A-Za-z0-9._-]{16,}';
const RULES: Array<{ name: string; re: RegExp }> = [
  { name: 'fallback-literal', re: new RegExp(`\\$\\{${SECRET_NAME}:?-["']?${LITERAL}["']?\\}`) },
  { name: 'assigned-literal', re: new RegExp(`\\b${SECRET_NAME}=["']${LITERAL}["']`) },
];

export function findKeyLiterals(text: string): Array<{ line: number; rule: string }> {
  const hits: Array<{ line: number; rule: string }> = [];
  text.split('\n').forEach((l, i) => {
    for (const r of RULES) if (r.re.test(l)) hits.push({ line: i + 1, rule: r.name });
  });
  return hits;
}

describe('no key literals in scripts/', () => {
  it('tracked scripts carry no hard-coded key literal or fallback', () => {
    const files = execFileSync('git', ['ls-files', '-z', '--', 'scripts'], { cwd: ROOT })
      .toString('utf8')
      .split('\0')
      .filter((f) => f && !f.startsWith('scripts/night-orchestra/state/'));
    const offenders: string[] = [];
    for (const f of files) {
      let text: string;
      try {
        text = readFileSync(join(ROOT, f), 'utf8');
      } catch {
        continue;
      }
      for (const h of findKeyLiterals(text)) offenders.push(`${f}:${h.line} (${h.rule})`);
    }
    expect(offenders).toEqual([]);
  });

  it('detects a dummy 24-char fallback and assignment (mutation self-check)', () => {
    const dummy = 'abcdefghij0123456789wxyz';
    expect(findKeyLiterals(`K="\${PROVIDER_KEY_X:-${dummy}}"`)).toHaveLength(1);
    expect(findKeyLiterals(`API_KEY="${dummy}"`)).toHaveLength(1);
    expect(findKeyLiterals(': "${PROVIDER_KEY_X:?set PROVIDER_KEY_X}"')).toHaveLength(0);
  });
});
