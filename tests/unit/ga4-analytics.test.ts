/** T-0375: GA4 snippet on human HTML pages only, CSP allowance in the host nginx config. */
import express from 'express';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createIntegratorRouter } from '../../src/shop/routes/integrator.router';
import { shopHtml, llmsTxt, shopMarkdown } from '../../src/shop/storefront/storefront.view';
import type { PublicShop } from '../../src/shop/storefront/storefront.service';

jest.mock('../../src/config', () => ({ config: {} }));
jest.mock('../../src/config/index', () => ({ config: {} }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const ROOT = resolve(__dirname, '../..');
const rd = (p: string) => readFileSync(resolve(ROOT, p), 'utf-8');
const count = (s: string, sub: string) => s.split(sub).length - 1;
const ID = 'G-7XPJP2FV9H';

const shop: PublicShop = {
  slug: 'fx-shop',
  name: 'Fixture Shop',
  category: 'books',
  site_url: 'https://fx.example.com',
  domain_verified: false,
  reputation: {},
  policy: { confirm_sla_h: 48 },
};

let server: ReturnType<express.Express['listen']>;
let base: string;
beforeAll(() => {
  const app = express();
  app.use(createIntegratorRouter({ limit: 10_000 }));
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
const get = async (path: string, accept?: string) =>
  (await fetch(`${base}${path}`, accept ? { headers: { accept } } : undefined)).text();

describe('T-0375 GA4', () => {
  it('(a) config/ga4.html carries the measurement ID and the helper', () => {
    const s = rd('config/ga4.html');
    expect(s).toContain(ID);
    expect(s).toContain('window.apibaseTrack');
    expect(s).not.toContain('<!--ga4-->');
  });

  it('(b) human pages contain the marker block exactly once', async () => {
    const pages = [
      await get('/integrator'),
      await get('/integrator/connect'),
      shopHtml(shop, []),
      rd('static/index.html'),
    ];
    for (const p of pages) {
      expect(count(p, '<!--ga4-->')).toBe(1);
      expect(count(p, '<!--/ga4-->')).toBe(1);
      expect(count(p, `id=${ID}`)).toBe(1);
    }
    const snip = rd('config/ga4.html').trim();
    expect(rd('static/index.html')).toContain(snip);
  });

  it('(c) agent surfaces carry no GA', async () => {
    const outs = [
      await get('/integrator/llms.txt'),
      await get('/integrator', 'text/markdown'),
      await get('/integrator/connect', 'text/markdown'),
      llmsTxt(shop, []),
      shopMarkdown(shop, []),
      rd('static/integrator/index.md'),
    ];
    for (const o of outs) expect(o).not.toContain('googletagmanager');
  });

  it('(d) nginx CSP allows the GA origins', () => {
    const line = rd('nginx/apibase-host.conf')
      .split('\n')
      .find((l) => l.includes('Content-Security-Policy'))!;
    const dir = (n: string) => line.split(';').find((d) => d.trim().startsWith(n))!;
    expect(dir('script-src')).toContain('https://www.googletagmanager.com');
    for (const o of [
      'https://www.googletagmanager.com',
      'https://*.google-analytics.com',
      'https://*.analytics.google.com',
    ])
      expect(dir('connect-src')).toContain(o);
    for (const o of ['https://www.googletagmanager.com', 'https://*.google-analytics.com'])
      expect(dir('img-src')).toContain(o);
  });

  it('(e) T-0384a: nginx CSP lets the page load its own stylesheet and fonts', () => {
    for (const f of ['nginx/apibase-host.conf', 'deploy/sandbox/nginx-sandbox.conf']) {
      const line = rd(f)
        .split('\n')
        .find((l) => l.includes('Content-Security-Policy'))!;
      const dir = (n: string) => line.split(';').find((d) => d.trim().startsWith(n))!;
      expect(dir('style-src')).toContain("'self'");
      expect(dir('style-src')).toContain("'unsafe-inline'");
      expect(dir('font-src')).toContain("'self'");
    }
  });
});
