/** T-0537: each storefront product page carries its own meta description (noindex stays). No DB. */
import { productHtml } from '../../src/shop/storefront/storefront.view';
import type { PublicProductCard, PublicShop } from '../../src/shop/storefront/storefront.service';

jest.mock('../../src/config', () => ({ config: {} }));
jest.mock('../../src/config/index', () => ({ config: {} }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('T-0537 product meta description', () => {
  it('two products of one shop render different meta descriptions and a fallback for an empty one', () => {
    const shop: PublicShop = {
      slug: 'fx-shop',
      name: 'Fixture Shop',
      category: 'books',
      site_url: 'https://fx.example.com',
      domain_verified: false,
      reputation: {},
      policy: { confirm_sla_h: 48 },
    };
    const card = (sku: string, title: string, description: string): PublicProductCard => ({
      sku,
      title,
      price_usd: '1.50',
      availability: 'in_stock',
      requires_pii: [],
      fulfillment_mode: 'instant',
      description,
      category: 'books',
      images: [],
      tax_included: true,
      tax_note: null,
      refund_policy: { refund_window_days: 14, returns_accepted: true },
    });
    const desc = (h: string) => /<meta name="description" content="([^"]*)"/.exec(h)![1];
    const a = productHtml(
      shop,
      card(
        'A-1',
        'Alpha Notebook',
        'A hardcover notebook with 200 dotted pages and a ribbon bookmark for daily notes.',
      ),
    );
    const b = productHtml(
      shop,
      card(
        'B-2',
        'Beta Pen',
        'A refillable steel pen with a 0.5 mm tip that writes smoothly on any paper stock.',
      ),
    );
    const c = productHtml(shop, card('C-3', 'Gamma Case', '  '));
    expect(desc(a)).not.toBe(desc(b));
    expect(desc(a)).toContain('hardcover notebook');
    expect(desc(c)).toContain('Gamma Case — Fixture Shop on APIbase Integrator');
    expect(a).toContain('<meta name="robots" content="noindex, follow">');
  });
});
