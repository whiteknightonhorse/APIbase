/** T-0397: storefront product tiles carry an icon and the buy button never wraps. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { shopHtml } from '../../src/shop/storefront/storefront.view';
import type { PublicProduct, PublicShop } from '../../src/shop/storefront/storefront.service';

jest.mock('../../src/config/index', () => ({ config: {} }));
jest.mock('../../src/config', () => ({ config: {} }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const shop = {
  slug: 'any-shop',
  name: 'Any Shop',
  category: 'digital-goods',
  site_url: 'https://example.com',
  domain_verified: false,
  policy: {},
  reputation: {},
} as unknown as PublicShop;
const titles = ['Starter bundle', 'City guide', 'Monthly subscription', 'Old town tour', 'Widget'];
const products: PublicProduct[] = titles.map((title, i) => ({
  sku: `s${i}`,
  title,
  price_usd: '1.00',
  availability: 'in_stock',
  requires_pii: [],
  fulfillment_mode: 'instant',
}));
const css = readFileSync(resolve(__dirname, '../../static/assets/site-m.css'), 'utf-8');

describe('T-0397 storefront tiles', () => {
  it('every product tile contains an inline svg, distinct per kind, no empty tile', () => {
    const html = shopHtml(shop, products);
    const tiles = html.split('<div class="card pcard">').slice(1);
    expect(tiles).toHaveLength(5);
    for (const t of tiles) expect(t.split('<a class="ptitle"')[0]).toMatch(/<svg\b[\s\S]*<\/svg>/);
    const shapes = tiles.map((t) => /<g [^>]*>(.*?)<\/g>/.exec(t)?.[1]);
    expect(new Set(shapes).size).toBe(5);
  });
  it('buy button is nowrap, full width; grid min card width is 220px', () => {
    expect(css).toMatch(/\.ig \.buy summary\.btn\{[^}]*width:100%[^}]*white-space:nowrap/);
    expect(css).toMatch(/\.ig \.pgrid\{[^}]*minmax\(min\(100%,220px\),1fr\)/);
  });
});
