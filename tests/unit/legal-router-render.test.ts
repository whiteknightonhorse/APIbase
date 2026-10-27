import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import {
  createLegalRouter,
  legalBodyOf,
  staticPageEntries,
} from '../../src/shop/routes/legal.router';
import { LEGAL_DOC_IDS, LEGAL_DIR } from '../../src/shop/legal/legal-docs';
import { SITE_NAV } from '../../src/shop/page-meta';

jest.mock('../../src/config', () => ({ config: {} }));

const ROOT = join(__dirname, '../..');

async function serve(opts: Parameters<typeof createLegalRouter>[0]) {
  const app = express();
  app.use(createLegalRouter(opts));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

describe('T-0343 /legal page chrome', () => {
  it('every document has canonical, description, title, nav and footer links', async () => {
    const s = await serve({ db: {} as never });
    for (const id of LEGAL_DOC_IDS) {
      const html = await (await fetch(`${s.base}/legal/${id}`)).text();
      expect(html).toContain(`<link rel="canonical" href="https://apibase.pro/legal/${id}">`);
      expect(html).toMatch(/<meta name="description" content="[^"]+">/);
      expect(html).toMatch(/<title>[A-Z][A-Za-z ]+ — APIbase legal<\/title>/);
      expect(html).not.toContain(`<title>${id} —`);
      expect(html).toContain('<meta property="og:title"');
      expect(html).toContain('<meta property="og:image" content="https://apibase.pro/og-image.png');
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
      expect(html).toContain(SITE_NAV);
      for (const href of ['/terms', '/privacy', '/contact', '/legal']) {
        expect(html).toContain(`<footer class="site-footer">`);
        expect(html).toContain(`<a href="${href}">`);
      }
    }
    await s.close();
  });

  it('legal.router.ts carries no header markup or css of its own', () => {
    const src = readFileSync(join(ROOT, 'src/shop/routes/legal.router.ts'), 'utf-8');
    expect(src).not.toContain('<nav');
    expect(src).not.toContain('nav{');
  });

  it('the .md twin is the file with the fee token rendered; the registry hash stays over the file', async () => {
    const s = await serve({ db: {} as never });
    for (const id of LEGAL_DOC_IDS) {
      const raw = readFileSync(join(LEGAL_DIR, `${id}.md`), 'utf-8');
      const body = await (await fetch(`${s.base}/legal/${id}.md`)).text();
      expect(body).not.toContain('{{INTEGRATOR_FEE_PCT}}');
      expect(body).toBe(raw.replace(/\{\{INTEGRATOR_FEE_PCT\}\}/g, '0% during the pilot'));
    }
    const ma = await (await fetch(`${s.base}/legal/merchant-agreement.md`)).text();
    expect(ma).toContain('Fee: 0% during the pilot, minimum $0.05');
    await s.close();
  });

  it('index.json lists terms/privacy with the sha256 of the legal text, marked registry:false', async () => {
    const db = { $queryRawUnsafe: async () => [] } as never;
    const s = await serve({ db });
    const idx = (await (await fetch(`${s.base}/legal/index.json`)).json()) as Array<{
      doc_id: string;
      sha256: string;
      url: string;
      registry?: boolean;
    }>;
    await s.close();
    for (const id of ['terms', 'privacy']) {
      const e = idx.find((x) => x.doc_id === id)!;
      expect(e).toMatchObject({ url: `/${id}`, registry: false });
      expect(e.sha256).toBe(
        createHash('sha256')
          .update(legalBodyOf(readFileSync(join(ROOT, `static/${id}.html`), 'utf-8')))
          .digest('hex'),
      );
      expect(e).toMatchObject({ version: '2.0', effective_from: '2026-11-26' });
    }
  });
});

describe('T-0343 image contents', () => {
  it('Dockerfile copies terms.html and privacy.html in both stages', () => {
    const df = readFileSync(join(ROOT, 'docker/Dockerfile'), 'utf8');
    const n = df
      .split('\n')
      .filter((l) => /^COPY static\/terms\.html static\/privacy\.html /.test(l));
    expect(n).toHaveLength(2);
  });

  it('missing static page is a hard error, not a silent omission', () => {
    expect(() => staticPageEntries('/nonexistent-dir')).toThrow(/missing from image/);
  });
});

describe('T-0582 L-09 legal hash covers the legal text only', () => {
  const page = (ticker: string, word: string) =>
    '<html><div class="sys-monitor">PRV:<strong>401</strong></div><div class="lg-doc"><p>' +
    `We ${word} you. 1387 tools from 401 providers.</p></div>` +
    `<p class="lg-facts"><span>${ticker}</span></p><footer>f</footer></html>`;
  const h = (x: string) => createHash('sha256').update(legalBodyOf(x)).digest('hex');

  it('changing the ticker or the counts leaves the hash unchanged', () => {
    expect(h(page('1387 tools | 401 providers', 'serve'))).toBe(
      h(
        page('1400 tools | 405 providers', 'serve').replace(
          '1387 tools from 401',
          '1400 tools from 405',
        ),
      ),
    );
  });

  it('changing one word of the legal text changes the hash', () => {
    expect(h(page('t', 'serve'))).not.toBe(h(page('t', 'sell')));
  });

  it('a page without the legal body is an error, not an empty hash', () => {
    expect(() => legalBodyOf('<html></html>')).toThrow(/lg-doc/);
  });
});
