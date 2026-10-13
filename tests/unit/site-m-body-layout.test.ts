/** T-0383a: terminal-era body flex centring must not return; it lays header/content/footer out as a row. */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const STATIC = join(ROOT, 'static');

function pages(): string[] {
  const out = readdirSync(STATIC)
    .filter((f) => f.endsWith('.html'))
    .map((f) => join(STATIC, f));
  out.push(join(STATIC, 'video/index.html'));
  return out.filter((f) => readFileSync(f, 'utf-8').includes('site-m.css'));
}

/** Declarations of every plain `body{...}` rule (not .x body, not a descendant selector). */
function bodyRules(css: string): string[] {
  const rules: string[] = [];
  const re = /(^|[{};\s,])body\s*\{([^}]*)\}/g;
  for (let m = re.exec(css); m; m = re.exec(css)) rules.push(m[2]);
  return rules;
}

const BAD = /display\s*:\s*(inline-)?(flex|grid)|justify-content|align-items/;

describe('site-m body layout (T-0383a)', () => {
  const files = pages();
  it('finds the pages that link site-m.css', () => {
    expect(files.length).toBeGreaterThanOrEqual(15);
  });
  it.each(files.map((f) => [f.slice(ROOT.length + 1), f]))('%s has no body flex rule', (_n, f) => {
    for (const r of bodyRules(readFileSync(f, 'utf-8'))) expect(r).not.toMatch(BAD);
  });
  it.each([['static/integrator/_theme.css'], ['scripts/gen-catalog-page.ts']])(
    '%s has no body flex rule',
    (rel) => {
      for (const r of bodyRules(readFileSync(join(ROOT, rel), 'utf-8'))) expect(r).not.toMatch(BAD);
    },
  );
  it('site-m.css guards body against stray page styles', () => {
    const css = readFileSync(join(STATIC, 'assets/site-m.css'), 'utf-8');
    expect(css).toMatch(/display:block!important/);
    expect(css).toMatch(/justify-content:normal!important/);
    expect(css).toMatch(/align-items:normal!important/);
  });
});
