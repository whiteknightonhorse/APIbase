import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createLegalRouter } from '../../src/shop/routes/legal.router';
import { legalDocLayout } from '../../src/shop/legal/legal-layout';
import { LEGAL_DOC_IDS, readLegalFile } from '../../src/shop/legal/legal-docs';

jest.mock('../../src/config', () => ({ config: {} }));

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('T-0387 legal pages in design M', () => {
  for (const f of ['terms', 'privacy', 'policy-moderation']) {
    it(`${f}: the contents list matches the real h2 headings, both copies`, () => {
      const html = read(`static/${f}.html`);
      const h2 = [...html.matchAll(/<h2 id="([^"]+)">([^<]*)<\/h2>/g)].map((m) => [m[1], m[2]]);
      expect(h2.length).toBeGreaterThan(3);
      expect(new Set(h2.map((x) => x[0])).size).toBe(h2.length);
      expect(html.match(/<h2[ >]/g)).toHaveLength(h2.length);
      const navs = [
        ...html.matchAll(/<nav class="lg-toc" aria-label="On this page">([\s\S]*?)<\/nav>/g),
      ];
      expect(navs).toHaveLength(2);
      for (const n of navs) {
        const links = [...n[1].matchAll(/<a href="#([^"]+)">([^<]*)<\/a>/g)].map((m) => [
          m[1],
          m[2],
        ]);
        expect(links).toEqual(h2);
      }
    });

    it(`${f}: layout markers, no terminal chrome, no legacy inline styling`, () => {
      const html = read(`static/${f}.html`);
      expect(html).toContain('<div class="container lg" id="main-content">');
      expect(html).toContain('<li aria-current="page">');
      expect(html).toContain('class="lg-badge"');
      expect(html).not.toMatch(/STATUS: ONLINE|BUILD: v|uptime-counter|class="footer"|boot-screen/);
      const style = /<style>([\s\S]*?)<\/style>/.exec(html)![1];
      expect(style.split('/*site-nav*/')[0].trim()).toBe('');
    });
  }

  it('the generated stats bar keeps the markup sync-counts and home-facts rewrite', () => {
    for (const f of ['terms', 'privacy', 'policy-moderation']) {
      expect(read(`static/${f}.html`)).toMatch(
        /<div class="sys-monitor">\s*<span class="prompt">><\/span> <span class="label">SYSTEM<\/span>[\s\S]*?<span class="sys-cursor"><\/span>/,
      );
    }
  });

  it('legalDocLayout lifts the h1, ids every h2 uniquely and builds the contents from them', () => {
    const out = legalDocLayout(
      '<h1>T v1</h1>\n<p>x</p>\n<h2>1. A &amp; B</h2>\n<h2>1. A &amp; B</h2>\n<h2></h2>',
    );
    expect(out.h1).toBe('<h1>T v1</h1>');
    expect(out.toc.map((t) => t.id)).toEqual(['1-a-b', '1-a-b-2', 'section']);
    expect(out.content).not.toContain('<h1>');
    expect(out.content).toContain('<h2 id="1-a-b-2">');
  });

  it('/legal/:doc renders version and effective badges from the registry file, contents from its headings', async () => {
    const app = express();
    app.use(createLegalRouter({ db: {} as never }));
    const server = app.listen(0);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for (const id of LEGAL_DOC_IDS) {
      const file = readLegalFile(id);
      const html = await (await fetch(`${base}/legal/${id}`)).text();
      expect(html).toContain(`<span class="lg-badge">Version ${file.version}</span>`);
      expect(html).toContain(
        `<span class="lg-badge">Effective ${file.effective_from.slice(0, 10)}</span>`,
      );
      const headings = file.body_md.match(/^## .+$/gm) ?? [];
      const links = html.match(/<a href="#[^"]+">/g) ?? [];
      expect(links.length).toBe(headings.length * 2);
      expect(html).toContain('class="container lg" id="main-content"');
      expect(html).not.toContain('<main>');
    }
    await new Promise((r) => server.close(r));
  });
});
