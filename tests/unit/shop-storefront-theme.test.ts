/** T-INT-35 SV1-SV9 (no database): storefront pages wear the terminal theme and point at /mcp/m/<slug>. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  agentJson,
  cartHtml,
  cartMarkdown,
  llmsTxt,
  productHtml,
  productMarkdown,
  shopHtml,
  shopMarkdown,
  shopsHtml,
  shopsMarkdown,
} from '../../src/shop/storefront/storefront.view';
import type {
  CartLine,
  PublicProduct,
  PublicProductCard,
  PublicShop,
} from '../../src/shop/storefront/storefront.service';

// storefront.service pulls the env-validated config in through catalog.service; the view needs none of it.
jest.mock('../../src/config/index', () => ({ config: {} }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const CYRILLIC = new RegExp(String.raw`[\u0400-\u04FF]`);
const MCP = 'https://apibase.pro/mcp/m/fx-shop';
const shop = (over: Partial<PublicShop> = {}): PublicShop => ({
  slug: 'fx-shop',
  name: 'Fixture <b>Shop</b>',
  category: 'books',
  site_url: 'https://fx.example.com',
  domain_verified: false,
  reputation: {},
  policy: { confirm_sla_h: 48, foo_bar: 'x' },
  ...over,
});
const products: PublicProduct[] = [
  {
    sku: 'A-1',
    title: 'Alpha',
    price_usd: '1.50',
    availability: 'in_stock',
    requires_pii: [],
    fulfillment_mode: 'instant',
  },
  {
    sku: 'B-2',
    title: 'Beta',
    price_usd: '2.00',
    availability: 'out_of_stock',
    requires_pii: [],
    fulfillment_mode: 'physical',
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
const listing = { shops: [shop()], page: 1, page_size: 50, total: 1 };

const htmls = (s = shop()) => ({
  shops: shopsHtml(listing),
  shop: shopHtml(s, products),
  product: productHtml(s, card),
  cart: cartHtml(s, lines, '3.00'),
});
const allOutputs = (s = shop()): string[] => [
  ...Object.values(htmls(s)),
  shopsMarkdown(listing),
  shopMarkdown(s, products),
  productMarkdown(s, card),
  cartMarkdown(s, lines, '3.00'),
  JSON.stringify(agentJson(s, products)),
  llmsTxt(s, products),
];
const ldTargets = (h: string) =>
  [...h.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].flatMap(
    (m) => JSON.stringify(JSON.parse(m[1])).match(/"target":"[^"]+"/g) ?? [],
  );

describe('T-INT-35 storefront terminal theme', () => {
  it('SV1: every HTML page wears the terminal shell and no foreign style or font', () => {
    for (const h of Object.values(htmls())) {
      for (const n of [
        '<div class="window">',
        '<div class="titlebar">',
        '<nav><a class="brand"',
        "font-family:'JetBrains Mono','Fira Code','Cascadia Code','Courier New',monospace",
        '<div class="footer">',
        'Sell to AI agents',
      ])
        expect(h).toContain(n);
      for (const n of [
        'ui-monospace',
        '#4cc2ff',
        '#0b0e11',
        'fonts.googleapis',
        '<link rel="stylesheet"',
      ])
        expect(h).not.toContain(n);
    }
  });

  it('SV2: the storefront MCP URL is /mcp/m/<slug>, never the shared /mcp', () => {
    // the two /shops listing outputs name no single shop, so they carry no URL at all
    for (const [i, o] of allOutputs().entries()) {
      if (i !== 0 && i !== 4) expect(o).toContain(MCP);
      expect(o).not.toMatch(/https:\/\/apibase\.pro\/mcp(?![/\w])/);
    }
    expect(agentJson(shop(), products).mcp_url).toBe(MCP);
    const h = htmls();
    for (const x of [h.product, h.shop])
      for (const t of ldTargets(x)) expect(t).toBe(`"target":"${MCP}"`);
    expect(ldTargets(h.shop).length).toBeGreaterThan(0);
    expect(ldTargets(h.product).length).toBeGreaterThan(0);
    const l = llmsTxt(shop(), products);
    expect(l.startsWith('# Fixture')).toBe(true);
    expect(l).toContain(`AI agents can buy here: connect to ${MCP}`);
  });

  it('SV3: reputation is data only, never invented', () => {
    const empty = shopHtml(shop({ reputation: {} }), products);
    expect(empty).not.toMatch(/review|rating|★|\[N\]|\[STATUS\]|\[SHORT DESCRIPTION\]/i);
    expect(empty).toContain('No reputation data yet');
    expect(empty).toContain('/integrator/check/fx-shop');
    const some = shopHtml(shop({ reputation: { orders_completed: 3 } }), products);
    expect(some).toContain('orders_completed');
    expect(some).toContain('<strong>3</strong>');
  });

  it('SV4: policy keys get human labels, unknown keys stay raw', () => {
    const h = shopHtml(shop(), products);
    expect(h).toContain('Order confirmation');
    expect(h).toContain('within 48 hours');
    expect(h).not.toContain('confirm_sla_h');
    expect(h).toContain('foo_bar');
    expect(shopMarkdown(shop(), products)).toContain('order confirmation: within 48 hours');
  });

  it('SV5: the sys-monitor line', () => {
    const m = shopHtml(shop(), products).match(/<div class="sys-monitor">.*?<\/div>/)![0];
    for (const n of [
      'SHOP:',
      'CATEGORY:',
      'ITEMS:</span><strong>2</strong>',
      'RAILS:',
      'CONFIRM SLA:</span><strong>48h</strong>',
    ])
      expect(m).toContain(n);
    expect(shopHtml(shop({ policy: {} }), products)).not.toContain('CONFIRM SLA');
  });

  it('SV6: seller data is escaped; titlebar shows the real path', () => {
    for (const h of Object.values(htmls())) {
      expect(h).toContain('&lt;b&gt;Shop&lt;/b&gt;');
      expect(h).not.toContain('<b>Shop</b>');
    }
    expect(shopHtml(shop(), products)).toContain('cat /srv/apibase/m/fx-shop | render');
  });

  it('SV7: noindex on product and cart only; cart text', () => {
    const h = htmls();
    const meta = '<meta name="robots" content="noindex, follow">';
    expect(h.product).toContain(meta);
    expect(h.cart).toContain(meta);
    expect(h.cart).toContain('shop.quote.create');
    expect(h.cart).toContain('No payment is taken in the browser.');
    expect(h.shop).not.toContain('noindex');
  });

  it('SV8: no Cyrillic in the storefront sources', () => {
    for (const f of [
      'src/shop/storefront/storefront.service.ts',
      'src/shop/storefront/storefront.view.ts',
      'src/shop/routes/storefront.router.ts',
      'tests/unit/shop-storefront-theme.test.ts',
    ])
      expect(readFileSync(resolve(__dirname, '../..', f), 'utf-8')).not.toMatch(CYRILLIC);
  });

  it('SV9: styles live in CSS only', () => {
    const root = resolve(__dirname, '../..');
    const router = readFileSync(resolve(root, 'src/shop/routes/storefront.router.ts'), 'utf-8');
    for (const n of ['<style', 'ui-monospace', 'function page']) expect(router).not.toContain(n);
    const view = readFileSync(resolve(root, 'src/shop/storefront/storefront.view.ts'), 'utf-8');
    expect(view).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});
