import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fitDescription, fitTitle, SITE_FOOTER, SITE_NAV } from '../../src/shop/page-meta';
import { layout } from '../../src/shop/integrator/layout';

const ROOT = join(__dirname, '../..');
const run = (root: string) =>
  spawnSync('bash', [join(ROOT, 'scripts/check-page-meta.sh'), '--no-fetch'], {
    env: { ...process.env, ROOT: root },
    encoding: 'utf-8',
  });

describe('T-0344 page meta gate', () => {
  it('static/ passes the gate', () => {
    const r = run(ROOT);
    expect(r.stdout).toMatch(/failures = 0/);
    expect(r.status).toBe(0);
  });

  it('fails on a page without canonical and on one without a footer', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'page-meta-'));
    try {
      cpSync(join(ROOT, 'static'), join(tmp, 'static'), { recursive: true });
      cpSync(join(ROOT, 'config/page-footer.html'), join(tmp, 'config/page-footer.html'));
      const about = join(tmp, 'static/about.html');
      writeFileSync(about, readFileSync(about, 'utf-8').replace(/<link rel="canonical"[^>]*>/, ''));
      const why = join(tmp, 'static/why.html');
      writeFileSync(why, readFileSync(why, 'utf-8').replace(/<footer[\s\S]*?<\/footer>/, ''));
      const r = run(tmp);
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('static/about.html: no canonical');
      expect(r.stdout).toContain('static/why.html: no <footer>');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('the footer fragment links Terms, Privacy, Contact, Legal and the repository', () => {
    for (const href of ['/terms', '/privacy', '/contact', '/legal', 'https://github.com/']) {
      expect(SITE_FOOTER).toContain(`href="${href}`);
    }
  });

  it('fits titles and descriptions into the gate window', () => {
    expect(fitTitle('Cart').length).toBeGreaterThanOrEqual(20);
    expect(fitTitle('x'.repeat(200)).length).toBeLessThanOrEqual(65);
    expect(fitDescription('short').length).toBeGreaterThanOrEqual(70);
    expect(fitDescription('word '.repeat(100)).length).toBeLessThanOrEqual(160);
  });

  it('layout emits meta, escaped title, footer and, under /integrator, a breadcrumb', () => {
    const html = layout({
      title: 'A <b> page about things & stuff',
      path: '/integrator/x',
      body: '',
    });
    expect(html).toContain('<link rel="canonical" href="https://apibase.pro/integrator/x">');
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain(SITE_FOOTER);
    expect(html.split(SITE_NAV)).toHaveLength(2);
    expect(html).toContain('BreadcrumbList');
    expect(layout({ title: 'Shops page title here', path: '/shops', body: '' })).not.toContain(
      'BreadcrumbList',
    );
  });
});
