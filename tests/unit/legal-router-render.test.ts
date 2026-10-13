import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createLegalRouter } from '../../src/shop/routes/legal.router';
import { LEGAL_DOC_IDS, LEGAL_DIR } from '../../src/shop/legal/legal-docs';

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
      expect(html).toContain('<nav><a class="brand" href="/">APIbase.pro</a>');
      expect(html).toContain('<a href="/integrator">Integrator</a>');
      for (const href of ['/terms', '/privacy', '/contact', '/legal']) {
        expect(html).toContain(`<footer class="footer">`);
        expect(html).toContain(`<a href="${href}">`);
      }
    }
    await s.close();
  });

  it('nav matches the /integrator layout nav', () => {
    const layout = readFileSync(join(ROOT, 'static/integrator/_layout.html'), 'utf-8');
    const nav = /<nav>.*<\/nav>/.exec(layout)![0];
    const src = readFileSync(join(ROOT, 'src/shop/routes/legal.router.ts'), 'utf-8');
    for (const href of [...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1])) {
      expect(src).toContain(`href="${href}"`);
    }
  });

  it('the .md body (hashed) is served byte-identical to the file', async () => {
    const s = await serve({ db: {} as never });
    for (const id of LEGAL_DOC_IDS) {
      const body = Buffer.from(await (await fetch(`${s.base}/legal/${id}.md`)).arrayBuffer());
      expect(createHash('sha256').update(body).digest('hex')).toBe(
        sha(join(LEGAL_DIR, `${id}.md`)),
      );
    }
    await s.close();
  });

  it('index.json lists terms/privacy with the sha256 of the HTML, marked registry:false', async () => {
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
      expect(e.sha256).toBe(sha(join(ROOT, `static/${id}.html`)));
    }
  });
});
