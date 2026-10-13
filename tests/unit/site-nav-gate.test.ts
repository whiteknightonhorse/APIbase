import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderPage } from '../../scripts/gen-catalog-page';

const ROOT = join(__dirname, '../..');
const run = (root: string, cmd: 'check' | 'apply') =>
  spawnSync(
    'python3',
    ['-I', join(ROOT, 'scripts/site-nav.py'), cmd, ...(cmd === 'check' ? ['--no-fetch'] : [])],
    {
      env: { ...process.env, ROOT: root },
      encoding: 'utf-8',
    },
  );
const fragment = readFileSync(join(ROOT, 'config/site-nav.html'), 'utf-8');
const css = readFileSync(join(ROOT, 'config/site-nav.css'), 'utf-8');

describe('T-0367 site header gate', () => {
  it('a: the repo passes with at least 18 pages', () => {
    const r = run(ROOT, 'check');
    expect(r.stdout).toMatch(/failures = 0/);
    expect(Number(/pages checked = (\d+)/.exec(r.stdout)![1])).toBeGreaterThanOrEqual(18);
    expect(r.status).toBe(0);
  });

  it('b+c: mutations are caught, apply repairs the nav and css but not the viewport', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'site-nav-'));
    try {
      cpSync(join(ROOT, 'static'), join(tmp, 'static'), { recursive: true });
      mkdirSync(join(tmp, 'config'));
      cpSync(join(ROOT, 'config/site-nav.html'), join(tmp, 'config/site-nav.html'));
      cpSync(join(ROOT, 'config/site-nav.css'), join(tmp, 'config/site-nav.css'));
      const edit = (p: string, f: (s: string) => string) => {
        const file = join(tmp, p);
        const before = readFileSync(file, 'utf-8');
        const after = f(before);
        expect(after).not.toBe(before);
        writeFileSync(file, after);
      };
      edit('static/dashboard.html', (s) => s.replace('<a href="/integrator">Integrator</a>\n', ''));
      edit('static/why.html', (s) => s.replace('768px', '767px'));
      edit('static/about.html', (s) => s.replace(/<meta name="viewport"[^>]*>\n?/, ''));

      const bad = run(tmp, 'check');
      expect(bad.status).toBe(1);
      expect(bad.stdout).toContain('static/dashboard.html: site nav differs');
      expect(bad.stdout).toContain('static/why.html: site nav css differs');
      expect(bad.stdout).toContain('static/about.html: no viewport');

      const fixed = run(tmp, 'apply');
      expect(fixed.status).toBe(0);
      const after = run(tmp, 'check');
      expect(after.stdout).not.toContain('static/dashboard.html');
      expect(after.stdout).not.toContain('static/why.html');
      expect(after.stdout).toContain('static/about.html: no viewport');
      expect(after.stdout).toMatch(/failures = 1/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('d: the catalog producer carries the fragment and the css block', () => {
    const page = renderPage([{ provider: 'x', tools: 1 }]);
    expect(page).toContain(`<!--site-nav-->\n${fragment.trim()}\n<!--/site-nav-->`);
    expect(page).toContain(`/*site-nav*/\n${css.trim()}\n/*/site-nav*/`);
  });

  it('e: nav-full and burger carry the same 14 links, css keeps the burger rules', () => {
    const hrefs = (s: string) => [...s.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    const full = /<nav class="nav-full"[^>]*>([\s\S]*?)<\/nav>/.exec(fragment)![1];
    const burger = /<div class="burger-links">([\s\S]*?)<\/div>/.exec(fragment)![1];
    expect(hrefs(full)).toHaveLength(14);
    expect(hrefs(full)[0]).toBe('/');
    expect(hrefs(burger)).toEqual(hrefs(full));
    expect(css).toMatch(
      /@media\(max-width:768px\)\{[^}]*nav\.nav-full\{display:none\}[^}]*\.nav-burger\{display:block\}/,
    );
    expect(/\.burger-links a\{[^}]*\}/.exec(css)![0]).toContain('min-height:44px');
  });
});
