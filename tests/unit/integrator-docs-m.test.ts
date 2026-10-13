/** T-0386: guide pages in design M (Docs Article): TOC, steps, code blocks, tables, error cards. */
import express from 'express';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createIntegratorRouter, PLATFORMS } from '../../src/shop/routes/integrator.router';
import { docToHtml } from '../../src/shop/integrator/md';

jest.mock('../../src/config', () => ({ config: {} }));

const GUIDES = ['docs', 'agent-guide', 'buyers', 'wallet', 'why-base-tempo'];
let server: ReturnType<express.Express['listen']>;
let base: string;
beforeAll(() => {
  const app = express();
  app.use(createIntegratorRouter({ limit: 10_000 }));
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
const get = async (path: string, accept = 'text/html') =>
  (await fetch(`${base}${path}`, { headers: { accept } })).text();

describe('integrator guide pages, design M', () => {
  it('DM1: every guide and platform page uses the docs shell and docs stylesheet', async () => {
    for (const p of [
      ...GUIDES.map((g) => `/integrator/${g}`),
      ...PLATFORMS.map((n) => `/integrator/platforms/${n}`),
    ]) {
      const t = await get(p);
      expect([p, t.includes('class="container dx-shell"')]).toEqual([p, true]);
      expect([p, t.includes('<div class="dx">')]).toEqual([p, true]);
      expect([p, t.includes('.dx-main h2')]).toEqual([p, true]);
      expect([p, t.slice(t.indexOf('<div class="dx">')).includes('<script')]).toEqual([p, false]);
    }
  });

  it('DM2: the table of contents is built from the real h2/h3, desktop and phone variants', async () => {
    const t = await get('/integrator/docs');
    const heads = [...t.matchAll(/<h([23]) id="([^"]+)">/g)].map((m) => m[2]);
    expect(heads.length).toBeGreaterThan(10);
    const side = /<aside class="dx-side">([\s\S]*?)<\/aside>/.exec(t)![1];
    const fold = /<details class="dx-fold">([\s\S]*?)<\/details>/.exec(t)![1];
    for (const id of ['registration--terms', 'errors', 'pii', 'webhooks']) {
      expect(side).toContain(`href="#${id}"`);
      expect(fold).toContain(`href="#${id}"`);
    }
    expect(side).toContain('class="l3" href="#errors"');
  });

  it('DM3: numbered steps, code blocks with a copy button, real tables in a scroll wrapper', async () => {
    const t = await get('/integrator/docs');
    expect(t).toContain('<ol class="dx-steps">');
    expect(t).toMatch(
      /<div class="dx-code"><div class="dx-code-bar"><span>sh<\/span><button type="button" class="dx-copy"/,
    );
    expect(t).toContain('<div class="m-table-wrap"><table class="m-table m-table--cards">');
    expect(t).not.toMatch(/<p>\| /);
    expect(t).toContain('<td data-label="MCP tool">');
  });

  it('DM4: raw anchors become elements; error sections become cards', async () => {
    const docs = await get('/integrator/docs');
    expect(docs).toContain('<a id="country_not_supported"></a>');
    expect(docs).not.toContain('&lt;a id=');
    expect(docs).toMatch(
      /<div class="dx-err"><a id="country_not_supported"><\/a><p><strong><code>country_not_supported<\/code>/,
    );
    const guide = await get('/integrator/agent-guide');
    expect(guide).toContain('<div class="dx-errs">');
    expect(guide).toMatch(
      /<div class="dx-err">\n<h3 id="quote_expired"><code>quote_expired<\/code><\/h3>/,
    );
    expect(guide.match(/<div class="dx-err">/g)!.length).toBeGreaterThanOrEqual(10);
    // the cards do not flood the contents list
    expect(/<aside class="dx-side">([\s\S]*?)<\/aside>/.exec(guide)![1]).not.toContain(
      '#quote_expired',
    );
  });

  it('DM5: Markdown variants are the unchanged source files', async () => {
    for (const g of GUIDES) {
      const md = await get(`/integrator/${g}`, 'text/markdown');
      expect(md).toContain(
        readFileSync(resolve(__dirname, `../../static/integrator/${g}.md`), 'utf-8').split('\n')[0],
      );
      expect(md).not.toContain('dx-');
    }
  });

  it('DM6: short pages get no table of contents; escaped pipes and tables render', () => {
    const t = docToHtml('# T\n\nBody.\n\n## A\n\nx\n');
    expect(t).not.toContain('dx-side');
    const tbl = docToHtml('# T\n\n| a | b |\n| - | - |\n| `x\\|y` | 2 |\n');
    expect(tbl).toContain('<td data-label="a"><code>x|y</code></td>');
  });
});
