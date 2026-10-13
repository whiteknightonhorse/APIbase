import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
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
const site_m_css = readFileSync(join(ROOT, 'static/assets/site-m.css'), 'utf-8');

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
      edit('static/why.html', (s) => s.replace('1100px', '1099px'));
      edit('static/about.html', (s) => s.replace(/<meta name="viewport"[^>]*>\n?/, ''));

      // T-0383: the stylesheet version in the header fragment follows the file; a stale one is caught.
      writeFileSync(join(tmp, 'static/assets/site-m.css'), `${site_m_css}\n/* edit */\n`);

      const bad = run(tmp, 'check');
      expect(bad.status).toBe(1);
      expect(bad.stdout).toContain('static/dashboard.html: site nav differs');
      expect(bad.stdout).toContain('static/why.html: site nav css differs');
      expect(bad.stdout).toContain('static/about.html: no viewport');
      expect(bad.stdout).toContain('config/site-nav.html: site-m.css version is stale');

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

  it('f: fetch mode asks for text/html', async () => {
    const page =
      `<html><head><meta name="viewport" content="width=device-width"><style>\n/*site-nav*/\n${css.trim()}\n/*/site-nav*/\n</style></head>` +
      `<body>\n<!--site-nav-->\n${fragment.trim()}\n<!--/site-nav-->\n</body></html>`;
    const serve = async (negotiate: boolean) => {
      const accepts: string[] = [];
      const server = createServer((req, res) => {
        accepts.push(String(req.headers.accept));
        if (negotiate && req.url === '/x' && String(req.headers.accept).includes('text/html')) {
          res.setHeader('content-type', 'text/html');
          res.end(page);
        } else {
          res.setHeader('content-type', 'application/json');
          res.end('{"endpoint":"x"}');
        }
      });
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
      return { server, accepts, port: (server.address() as { port: number }).port };
    };
    const fetchCheck = (root: string, port: number) =>
      new Promise<{ status: number | null; stdout: string }>((resolve) => {
        const child = spawn('python3', ['-I', join(ROOT, 'scripts/site-nav.py'), 'check'], {
          env: {
            ...process.env,
            ROOT: root,
            SITE_NAV_BASE: `http://127.0.0.1:${port}`,
            SITE_NAV_PATHS: '/x',
            SITE_NAV_RETRIES: '1',
          },
        });
        let stdout = '';
        child.stdout.on('data', (d) => (stdout += d));
        child.on('close', (status) => resolve({ status, stdout }));
      });
    const tmp = mkdtempSync(join(tmpdir(), 'site-nav-'));
    try {
      mkdirSync(join(tmp, 'static'));
      mkdirSync(join(tmp, 'config'));
      cpSync(join(ROOT, 'config/site-nav.html'), join(tmp, 'config/site-nav.html'));
      cpSync(join(ROOT, 'config/site-nav.css'), join(tmp, 'config/site-nav.css'));
      mkdirSync(join(tmp, 'static/assets'));
      cpSync(join(ROOT, 'static/assets/site-m.css'), join(tmp, 'static/assets/site-m.css'));

      const good = await serve(true);
      try {
        const r = await fetchCheck(tmp, good.port);
        expect(r.status).toBe(0);
        expect(r.stdout).toContain('pages checked = 1, failures = 0');
        expect(good.accepts.length).toBeGreaterThan(0);
        for (const a of good.accepts) expect(a).toMatch(/text\/html/);
      } finally {
        good.server.close();
      }

      const bad = await serve(false);
      try {
        const r = await fetchCheck(tmp, bad.port);
        expect(r.status).toBe(1);
        expect(r.stdout).toContain('/x: no markers');
      } finally {
        bad.server.close();
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('e: brand + nav-full and the Menu panel carry the same 14 links, one row from 1100 px', () => {
    const hrefs = (s: string) => [...s.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    const brand = /<a class="brand" href="([^"]*)">APIbase\.pro<\/a>/.exec(fragment)![1];
    const full = /<nav class="nav-full"[^>]*>([\s\S]*?)<\/nav>/.exec(fragment)![1];
    const burger = /<nav class="burger-links"[^>]*>([\s\S]*?)<\/nav>/.exec(fragment)![1];
    expect([brand, ...hrefs(full)]).toHaveLength(14);
    expect(brand).toBe('/');
    expect(hrefs(burger)).toEqual([brand, ...hrefs(full)]);
    expect(css).toMatch(
      /@media\(min-width:1100px\)\{[^}]*\.nav-full\{display:flex\}[^}]*\.nav-burger\{display:none\}/,
    );
    expect(/\.burger-links a\{[^}]*\}/.exec(css)![0]).toContain('min-height:48px');
  });

  it('g: design M header: no brackets, pipes or glow; Menu is keyboard operable with aria-expanded', () => {
    expect(css).not.toMatch(/content:\s*'[\[\]|]/);
    expect(css).not.toMatch(/text-shadow|glow|#00ff41/);
    expect(fragment).toContain('<summary>Menu</summary>');
    expect(fragment).toContain('aria-expanded');
    expect(fragment).toContain('Escape');
    expect(fragment).toMatch(/<link rel="stylesheet" href="\/assets\/site-m\.css\?v=[0-9a-f]{8}">/);
  });
});
