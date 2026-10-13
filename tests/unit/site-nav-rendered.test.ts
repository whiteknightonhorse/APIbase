/** T-0368: every server-rendered page carries the one site header, once, first in the document. */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createIntegratorRouter } from '../../src/shop/routes/integrator.router';
import { createLegalRouter } from '../../src/shop/routes/legal.router';
import { LEGAL_DOC_IDS } from '../../src/shop/legal/legal-docs';
import { onboardRouter } from '../../src/routes/onboard.router';
import { SITE_NAV, SITE_NAV_CSS } from '../../src/shop/page-meta';
import {
  cartHtml,
  productHtml,
  shopHtml,
  shopsHtml,
} from '../../src/shop/storefront/storefront.view';
import type {
  CartLine,
  PublicProduct,
  PublicProductCard,
  PublicShop,
} from '../../src/shop/storefront/storefront.service';

jest.mock('../../src/config', () => ({ config: {} }));
jest.mock('../../src/config/index', () => ({ config: {} }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/onboard.service', () => ({
  checkIpRateLimit: jest.fn(),
  createSubmission: jest.fn(),
}));

const count = (s: string, needle: string) => s.split(needle).length - 1;

let server: ReturnType<express.Express['listen']>;
let base: string;
beforeAll(() => {
  const app = express();
  app.use(createIntegratorRouter({ limit: 10_000 }));
  app.use(createLegalRouter({ db: {} as never }));
  app.use(onboardRouter);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
const get = async (path: string) => {
  const r = await fetch(`${base}${path}`, { headers: { accept: 'text/html' } });
  expect([path, r.status]).toEqual([path, 200]);
  return r.text();
};

const expectHeader = (path: string, html: string) => {
  expect([path, count(html, SITE_NAV)]).toEqual([path, 1]);
  expect([path, count(html, SITE_NAV_CSS)]).toEqual([path, 1]);
  expect([path, html.includes('<meta name="viewport"')]).toEqual([path, true]);
  const first = html.indexOf('<nav');
  expect(first).toBeGreaterThan(html.indexOf('<!--site-nav-->'));
  expect(first).toBeLessThan(html.indexOf('<!--/site-nav-->'));
};

describe('T-0368 rendered pages share the site header', () => {
  it('integrator pages: header once, then the integrator sub-nav', async () => {
    for (const p of [
      '/integrator',
      '/integrator/platforms/shopify',
      '/integrator/why-base-tempo',
    ]) {
      const html = await get(p);
      expectHeader(p, html);
      expect([p, html.indexOf('nav-sub') > html.indexOf('<!--/site-nav-->')]).toEqual([p, true]);
    }
  });

  it('legal pages: header once, no sub-nav', async () => {
    for (const id of LEGAL_DOC_IDS) {
      const p = `/legal/${id}`;
      const html = await get(p);
      expectHeader(p, html);
      expect(html).not.toContain('nav-sub');
    }
  });

  it('/onboard: header once, no sub-nav, social preview meta', async () => {
    const html = await get('/onboard');
    expectHeader('/onboard', html);
    expect(html).not.toContain('nav-sub');
    expect(html).toContain('<meta property="og:image"');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
  });

  it('storefront pages carry the header and the sub-nav', () => {
    const shop: PublicShop = {
      slug: 'fx-shop',
      name: 'Fixture Shop',
      category: 'books',
      site_url: 'https://fx.example.com',
      domain_verified: false,
      reputation: {},
      policy: { confirm_sla_h: 48 },
    };
    const products: PublicProduct[] = [
      {
        sku: 'A-1',
        title: 'Alpha',
        price_usd: '1.50',
        availability: 'in_stock',
        requires_pii: [],
        fulfillment_mode: 'instant',
      },
    ];
    const card: PublicProductCard = {
      ...products[0],
      description: 'Plain description',
      category: 'books',
      images: [],
      tax_included: true,
      tax_note: null,
      refund_policy: { refund_window_days: 14, returns_accepted: true },
    };
    const lines: CartLine[] = [
      { sku: 'A-1', title: 'Alpha', qty: 2, unit_price_usd: '1.50', line_total_usd: '3.00' },
    ];
    const pages = [
      shopsHtml({ shops: [shop], page: 1, page_size: 50, total: 1 }),
      shopHtml(shop, products),
      productHtml(shop, card),
      cartHtml(shop, lines, '3.00'),
    ];
    for (const html of pages) {
      expect(count(html, SITE_NAV)).toBe(1);
      expect(html).toContain('nav-sub');
    }
  });
});
