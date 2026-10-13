/** T-0391: /shops, /m/<slug>, /integrator, /integrator/connect in design M: parity, no placeholders, finished example card. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createIntegratorRouter } from '../../src/shop/routes/integrator.router';
import {
  cartHtml,
  productHtml,
  shopHtml,
  shopsHtml,
} from '../../src/shop/storefront/storefront.view';
import type {
  PublicProduct,
  PublicProductCard,
  PublicShop,
} from '../../src/shop/storefront/storefront.service';

jest.mock('../../src/config/index', () => ({ config: {} }));
jest.mock('../../src/config', () => ({ config: {} }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const ROOT = resolve(__dirname, '../..');
const SCRIPT = join(ROOT, 'scripts/page-parity.py');
const PLACEHOLDER = /\[[A-Z][A-Z0-9 _/-]*[A-Z0-9]\]/;

const visibleText = (html: string) =>
  html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');

const demo: PublicShop = {
  slug: 'apibase-demo',
  name: 'APIbase Demo Shop',
  category: 'digital-goods',
  site_url: 'https://apibase.pro',
  domain_verified: false,
  // a different instant than the snapshot: parity must treat ISO timestamps as one token
  reputation: {
    as_of: '2027-01-02T03:04:05.678Z',
    refund_rate: 0.5,
    dispute_rate: 0.5,
    orders_closed: 2,
    closed_on_time_pct: 100,
  },
  policy: { confirm_sla_h: 48 },
  provek: { declared: true, listed: true, registry_url: 'https://provek.dev/data/registry.json' },
};
const titles = [
  'APIbase agent commerce bundle',
  'APIbase daily brief (subscription)',
  'APIbase agent commerce guide',
  'APIbase demo tour (passport required)',
  'Verify import item',
];
const skus = ['demo-bundle', 'demo-daily', 'demo-guide', 'demo-tour', 'v12-import-ok'];
const products: PublicProduct[] = titles.map((title, i) => ({
  sku: skus[i],
  title,
  price_usd: i === 0 ? '5.00' : '1.00',
  availability: 'in_stock',
  requires_pii: [],
  fulfillment_mode: 'instant',
}));
const card: PublicProductCard = {
  ...products[0],
  description: 'A guide',
  category: 'digital-goods',
  images: [],
  tax_included: false,
  tax_note: null,
  refund_policy: { refund_window_days: 14, returns_accepted: true },
};
const listing = {
  shops: [demo, { ...demo, slug: 'opus-test-shop', name: 'Opus Test Shop' }],
  page: 1,
  page_size: 50,
  total: 2,
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

describe('T-0391 storefront and integrator in design M', () => {
  it('M1: page-parity passes for /shops and /m/apibase-demo (ISO timestamps ignored)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'site-m-sf-'));
    try {
      writeFileSync(join(dir, 'm_apibase-demo.html'), shopHtml(demo, products));
      writeFileSync(join(dir, 'shops.html'), shopsHtml(listing));
      const r = spawnSync(
        'python3',
        ['-I', SCRIPT, 'shops', 'm_apibase-demo', '--render', '--rendered-dir', dir],
        { env: { ...process.env, ROOT }, encoding: 'utf-8' },
      );
      expect(r.stdout.split('\n').filter((l) => l.startsWith('PARITY_FAIL'))).toEqual([]);
      expect(r.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('M2: no [PRODUCT IMAGE], [PRICE] or other [UPPERCASE] placeholder on any page', async () => {
    const pages: Record<string, string> = {
      shops: shopsHtml(listing),
      shop: shopHtml(demo, products),
      product: productHtml(demo, card),
      cart: cartHtml(demo, [], '0.00'),
    };
    for (const p of ['/integrator', '/integrator/connect'])
      pages[p] = await (await fetch(`${base}${p}`)).text();
    for (const f of ['index', 'about', 'pricing', 'catalog', 'contact', 'connect', 'why'])
      pages[`static/${f}`] = readFileSync(join(ROOT, 'static', `${f}.html`), 'utf-8');
    for (const [name, html] of Object.entries(pages)) {
      const t = visibleText(html);
      expect([name, t.includes('[PRODUCT IMAGE]'), t.includes('[PRICE]')]).toEqual([
        name,
        false,
        false,
      ]);
      expect([name, PLACEHOLDER.exec(t)?.[0]]).toEqual([name, undefined]);
    }
  });

  it('M3: the integrator example is a finished product card with an inline SVG', async () => {
    const t = await (await fetch(`${base}/integrator`)).text();
    const sec = /<section id="demo-shop">([\s\S]*?)<\/section>/.exec(t)![1];
    expect(sec).toContain('<svg class="ig-pimg"');
    expect(sec).not.toMatch(/<img|https?:\/\/[^"]*\.(png|jpe?g|svg)/);
    expect(sec).toContain('APIbase agent commerce bundle');
    expect(sec).toContain('5.00 USDC');
    expect(sec).toContain('your-shop.example');
    expect(sec).toContain('Illustration — try the real flow in the demo shop');
    expect(sec).toMatch(
      /<a class="m-btn m-btn--primary" href="\/m\/apibase-demo">Buy with your AI agent<\/a>/,
    );
    expect(sec).toContain('<a href="/m/apibase-demo">demo shop</a>');
  });

  it('M4: adjacent buttons sit in a gap row on the pages of this card', async () => {
    const t = await (await fetch(`${base}/integrator`)).text();
    expect(t).toContain('<p class="btn-row"><a class="btn p" href="/integrator/connect">');
    const c = await (await fetch(`${base}/integrator/connect`)).text();
    expect(c).toContain('<p class="btn-row"><a class="lp-cta" href="https://metamask.app.link');
    expect(shopHtml(demo, products)).toContain('<div class="btn-row"><a class="btn p"');
    expect(shopsHtml(listing)).toContain(
      '<div class="btn-row"><a class="btn p" href="/integrator/connect">',
    );
    const css = readFileSync(join(ROOT, 'static/assets/site-m.css'), 'utf-8');
    expect(css).toMatch(/\.ig \.btn-row\{display:flex;flex-wrap:wrap;gap:12px/);
  });
});
