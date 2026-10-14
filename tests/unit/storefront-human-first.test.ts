/** T-0378 (no database): storefront shows a human banner and the product grid first; agent details sit in #for-agents. */
import { shopHtml } from '../../src/shop/storefront/storefront.view';
import type { PublicProduct, PublicShop } from '../../src/shop/storefront/storefront.service';

jest.mock('../../src/config/index', () => ({ config: {} }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const shop = (over: Partial<PublicShop> = {}): PublicShop => ({
  slug: 'fx-shop',
  name: 'Fixture Shop',
  category: 'books',
  site_url: 'https://fx.example.com',
  domain_verified: true,
  reputation: { orders_completed: 3 },
  policy: { confirm_sla_h: 48 },
  provek: { declared: true, listed: false, registry_url: null },
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
];
const demo = () => shopHtml(shop({ slug: 'apibase-demo', name: 'APIbase Demo' }), products);
const plain = () => shopHtml(shop(), products);
const agentsPart = (h: string) => h.slice(h.indexOf('<details id="for-agents">'));

describe('T-0378 storefront human-first', () => {
  it('banner precedes the first product card, demo store only', () => {
    const h = demo();
    expect(h).toContain('This is a demo store.');
    expect(h.indexOf('<div class="demo-banner">')).toBeLessThan(h.indexOf('class="card pcard"'));
    expect(h).toContain('/integrator?utm_source=demo_store&amp;utm_medium=banner');
    expect(h).toContain("apibaseTrack('demo_store_view'");
    expect(h).toContain('Operated by the APIbase team (demo).');
    const p = plain();
    expect(p).not.toContain('<div class="demo-banner">');
    expect(p).not.toContain('demo_store_view');
    expect(p).not.toContain('Operated by the APIbase team');
    expect(p).toContain('belong to the same owner');
  });

  it('every machine element survives; agent details are collapsed at the bottom', () => {
    for (const h of [demo(), plain()]) {
      expect(h).toContain('<script type="application/ld+json">');
      expect(h).toContain('<link rel="alternate" type="application/json" href="/m/');
      const a = agentsPart(h);
      expect(a.startsWith('<details id="for-agents"><summary>For AI agents</summary>')).toBe(true);
      expect(a).not.toContain('<details id="for-agents" open');
      for (const n of ['/mcp/m/', 'agent.json', 'llms.txt', 'provek.json', 'Policy', 'Reputation'])
        expect(a).toContain(n);
      expect(h.indexOf('class="card pcard"')).toBeLessThan(h.indexOf('id="for-agents"'));
    }
  });

  it('product card has a copy panel and no raw ISO timestamps are visible', () => {
    const h = demo();
    expect(h).toContain('Buy Alpha from apibase.pro/m/apibase-demo');
    expect(h).toContain('Copy</button>');
    const visible = h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
    expect(visible).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(Buffer.byteLength(h)).toBeLessThan(80 * 1024);
  });

  it('mutation guard: the JSON-LD check goes red without the script', () => {
    expect(
      demo().replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ''),
    ).not.toContain('application/ld+json');
  });
});

describe('T-0403 fmtUtc', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { fmtUtc } = require('../../src/shop/storefront/storefront.view');
  it('renders an ISO datetime as readable UTC inside <time>', () => {
    expect(fmtUtc('2026-10-14T05:15:02.156960+00:00')).toBe(
      '<time datetime="2026-10-14T05:15:02+00:00">14 Oct 2026, 05:15 UTC</time>',
    );
  });
  it('normalises an offset to UTC', () => {
    expect(fmtUtc('2026-10-14T07:15:00+02:00')).toContain('>14 Oct 2026, 05:15 UTC<');
  });
  it('leaves non-datetimes escaped and unchanged', () => {
    expect(fmtUtc('3 <b>')).toBe('3 &lt;b&gt;');
    expect(fmtUtc('2026-10-14')).toBe('2026-10-14');
    expect(fmtUtc(['x'])).toBe('x');
  });
});
