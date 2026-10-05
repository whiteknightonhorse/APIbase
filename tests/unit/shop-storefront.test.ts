/**
 * T-INT-15 PG1-PG4, PG7-PG10 against a real Postgres (TEST_DATABASE_URL, disposable): public
 * storefront pages, §9.1 cross-tenant isolation, contact_email never published, domain proof.
 */
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createStorefrontRouter } from '../../src/shop/routes/storefront.router';
import { checkDomain, verifyMerchantDomain } from '../../src/jobs/shop-domain-verify.job';
import { client, dbDescribe, migrate } from './helpers/shop-db';

jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const PRIVATE_MAIL = 'secret-mail@private.example';

type Wk = (r: unknown) => Promise<{ status: number; body: string }>;

dbDescribe('public storefront (INT-15)', () => {
  const prisma = client();
  const tag = Date.now().toString(36);
  const slugA = `sa-${tag}`;
  const slugB = `sb-${tag}`;
  const slugGone = `sg-${tag}`;
  const slugSusp = `ss-${tag}`;
  let server: Server;
  let base = '';

  const mk = async (slug: string, status: string, verified = false) => {
    const r = await prisma.$queryRawUnsafe<Array<{ merchant_id: string }>>(
      `INSERT INTO shop_merchants (slug, name, category, country, wallet_address, payout_wallet_base,
          payout_wallet_tempo, contact_email, site_url, status, domain_verified, policy)
       VALUES ($1, $2, 'sporting-goods', 'US', $3, '0xb', '0xt', $4, 'https://shop.example', $5, $6,
               '{"returns":"30 days"}'::jsonb) RETURNING merchant_id`,
      slug,
      `Shop ${slug}`,
      `0x${slug}`,
      PRIVATE_MAIL,
      status,
      verified,
    );
    return r[0].merchant_id;
  };
  const prod = (
    merchant_id: string,
    sku: string,
    price: string,
    over: { is_test?: boolean; moderation_status?: string } = {},
  ) =>
    prisma.$executeRawUnsafe(
      `INSERT INTO shop_products (merchant_id, sku, title, price_usd, is_test, moderation_status)
       VALUES ($1::uuid, $2, $3, $4::numeric, $5, $6)`,
      merchant_id,
      sku,
      `Item ${sku}`,
      price,
      over.is_test ?? false,
      over.moderation_status ?? 'ok',
    );
  const get = (path: string, accept?: string) =>
    fetch(base + path, { headers: accept ? { accept } : {} });
  const listen = async (limit: number): Promise<Server> => {
    const app = express();
    app.use(createStorefrontRouter({ limit, db: prisma as never }));
    return new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
  };

  beforeAll(async () => {
    migrate();
    const idA = await mk(slugA, 'active', true);
    const idB = await mk(slugB, 'active');
    const idG = await mk(slugGone, 'deactivated');
    const idS = await mk(slugSusp, 'suspended');
    await prod(idA, 'a', '10.50');
    await prod(idA, 'b', '2.25');
    await prod(idA, 'hidden', '1', { moderation_status: 'flagged' });
    await prod(idA, 'testsku', '1', { is_test: true });
    await prod(idB, 'b-only', '99');
    await prod(idG, 'g', '5');
    await prod(idS, 's', '5');
    server = await listen(60);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.close();
    await prisma.$disconnect();
  });

  it('PG1 /m/<slug> is HTML, markdown on Accept, and no response carries contact_email', async () => {
    const html = await get(`/m/${slugA}`);
    expect(html.status).toBe(200);
    expect(html.headers.get('content-type')).toMatch(/text\/html/);
    const h = await html.text();
    expect(h).toContain(`Shop ${slugA}`);
    expect(h).toContain('"@type":"Organization"');
    expect(h).toContain('"@type":"Offer"');
    expect(h).not.toContain('Item hidden');
    expect(h).not.toContain('testsku');
    const md = await get(`/m/${slugA}`, 'text/markdown');
    expect(md.headers.get('content-type')).toMatch(/text\/markdown/);
    const m = await md.text();
    expect(m).toContain(`# Shop ${slugA}`);
    const everything = [
      h,
      m,
      await (await get(`/api/v1/shop/shops/${slugA}`)).text(),
      await (await get(`/api/v1/shop/shops/${slugA}/products`)).text(),
      await (await get(`/api/v1/shop/shops`)).text(),
      await (await get(`/shops`)).text(),
      await (await get(`/m/${slugA}/agent.json`)).text(),
      await (await get(`/m/${slugA}/llms.txt`)).text(),
      await (await get(`/m/${slugA}/p/a`)).text(),
      await (await get(`/m/${slugA}/cart?items=a:1`)).text(),
    ].join('\n');
    expect(everything).not.toContain('secret-mail');
    expect(everything).not.toContain('contact_email');
    expect(everything).toContain('https://shop.example'); // site_url IS published
  });

  it('PG2 /p/<sku>: noindex, follow + valid Product JSON-LD with BuyAction.target == mcp_url', async () => {
    const r = await get(`/m/${slugA}/p/a`);
    expect(r.status).toBe(200);
    const h = await r.text();
    expect(h).toContain('<meta name="robots" content="noindex, follow">');
    const ld = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(h);
    const j = JSON.parse(ld![1]);
    expect(j['@type']).toBe('Product');
    expect(j.offers['@type']).toBe('Offer');
    const agent = await (await get(`/m/${slugA}/agent.json`)).json();
    expect(j.offers.potentialAction).toEqual({ '@type': 'BuyAction', target: agent.mcp_url });
    expect((await get(`/m/${slugA}/p/hidden`)).status).toBe(404);
    expect((await get(`/m/${slugA}/p/testsku`)).status).toBe(404);
    expect(await (await get(`/m/${slugA}/p/a`, 'text/markdown')).text()).toContain('# Item a');
  });

  it('PG3 /cart: server-side prices, noindex, bad qty -> 400', async () => {
    const r = await get(`/m/${slugA}/cart?items=a:1,b:2`);
    expect(r.status).toBe(200);
    const h = await r.text();
    expect(h).toContain('content="noindex, follow"');
    expect(r.headers.get('x-robots-tag')).toBe('noindex');
    expect(h).toContain('$15.00'); // 10.50 + 2 x 2.25
    expect(h).toContain('shop.quote.create');
    expect((await get(`/m/${slugA}/cart?items=a:0`)).status).toBe(400);
    expect((await get(`/m/${slugA}/cart?items=a`)).status).toBe(400);
    expect((await get(`/m/${slugA}/cart`)).status).toBe(400);
    expect((await get(`/m/${slugA}/cart?items=nope:1`)).status).toBe(404);
    expect((await get(`/m/${slugA}/cart?items=b-only:1`)).status).toBe(404);
  });

  it('PG4 agent.json and llms.txt carry mcp_url', async () => {
    const a = await get(`/m/${slugA}/agent.json`);
    expect(a.status).toBe(200);
    const j = await a.json();
    expect(Object.keys(j).sort()).toEqual([
      'category',
      'mcp_url',
      'name',
      'payment',
      'policy',
      'products_sample',
      'rest_base',
      'slug',
    ]);
    expect(j.products_sample.length).toBeLessThanOrEqual(3);
    const l = await get(`/m/${slugA}/llms.txt`);
    expect(l.status).toBe(200);
    expect(await l.text()).toContain(`AI agents can buy here: connect to ${j.mcp_url}`);
  });

  it('PG7 deactivated / suspended -> 410 on every page; unknown -> 404', async () => {
    for (const s of [slugGone, slugSusp]) {
      for (const p of [
        `/m/${s}`,
        `/m/${s}/p/g`,
        `/m/${s}/cart?items=g:1`,
        `/m/${s}/agent.json`,
        `/m/${s}/llms.txt`,
        `/shops/${s}`,
        `/shops/${s}/products`,
        `/api/v1/shop/shops/${s}`,
      ]) {
        expect([p, (await get(p)).status]).toEqual([p, 410]);
      }
    }
    expect((await get('/m/no-such-shop')).status).toBe(404);
    const slugs: string[] = [];
    for (let pg = 1; ; pg++) {
      const idx = await (await get(`/api/v1/shop/shops?page=${pg}`)).json();
      expect(idx.page_size).toBe(50);
      slugs.push(...idx.shops.map((s: { slug: string }) => s.slug));
      if (pg * idx.page_size >= idx.total) break;
    }
    expect(slugs).toContain(slugA);
    expect(slugs).not.toContain(slugGone);
    expect(slugs).not.toContain(slugSusp);
  });

  it('PG8 the 61st request per minute on /m is 429', async () => {
    const s = await listen(60);
    try {
      const u = `http://127.0.0.1:${(s.address() as AddressInfo).port}/m/${slugA}`;
      let last = 0;
      for (let i = 0; i < 61; i++) {
        last = (await fetch(u)).status;
        if (i < 60) expect(last).toBe(200);
      }
      expect(last).toBe(429);
    } finally {
      s.close();
    }
  });

  it('PG9 §9.1 cross-tenant: /m/A holds no product of B; /shops/A/products only A', async () => {
    const page = await (await get(`/m/${slugA}`)).text();
    const md = await (await get(`/m/${slugA}`, 'text/markdown')).text();
    expect(page + md).not.toContain('b-only');
    expect(page).toContain('Item a');
    const j = await (await get(`/shops/${slugA}/products`)).json();
    expect(j.products.map((p: { sku: string }) => p.sku).sort()).toEqual(['a', 'b']);
    expect(await (await get(`/m/${slugB}`)).text()).toContain('b-only');
    expect((await get(`/m/${slugA}/p/b-only`)).status).toBe(404);
    expect(await (await get(`/m/${slugA}/agent.json`)).text()).not.toContain('b-only');
  });

  it('PG10 unverified domain is shown; the verify job flips the flag only on proof', async () => {
    const slugV = `sv-${tag}`;
    await mk(slugV, 'active', false);
    expect(await (await get(`/m/${slugV}`)).text()).toContain('unverified_domain');
    const wk =
      (r: { status: number; body: string }): Wk =>
      async () =>
        r;
    const deps = (fetchWellKnown: Wk, txt: string[][] = []) => ({
      db: prisma as never,
      resolve: async () => ['93.184.216.34'],
      resolveTxt: async () => txt,
      fetchWellKnown: fetchWellKnown as never,
    });
    expect(await verifyMerchantDomain(deps(wk({ status: 200, body: 'nothing' })), slugV)).toBe(
      false,
    );
    // a redirect is never followed: even a body naming the slug does not count
    expect(await verifyMerchantDomain(deps(wk({ status: 302, body: slugV })), slugV)).toBe(false);
    expect(await (await get(`/m/${slugV}`)).text()).toContain('unverified_domain');
    expect(await verifyMerchantDomain(deps(wk({ status: 200, body: `${slugV}\n` })), slugV)).toBe(
      true,
    );
    expect(await (await get(`/m/${slugV}`)).text()).not.toContain('unverified_domain');
    // proof withdrawn -> back to unverified
    expect(await verifyMerchantDomain(deps(wk({ status: 404, body: '' })), slugV)).toBe(false);
    // DNS TXT is the alternative proof
    const txt = [[`apibase-merchant=${slugV}`]];
    expect(await verifyMerchantDomain(deps(wk({ status: 404, body: '' }), txt), slugV)).toBe(true);
  });

  it('PG10 a non-public or non-https site_url never reaches the fetcher', async () => {
    const fetchWellKnown = jest.fn(async () => ({ status: 200, body: 'x' }));
    const rest = { resolveTxt: async () => [], fetchWellKnown };
    expect(
      await checkDomain('https://x.example', 'x', { ...rest, resolve: async () => ['10.0.0.1'] }),
    ).toBe(false);
    expect(
      await checkDomain('http://x.example', 'x', {
        ...rest,
        resolve: async () => ['93.184.216.34'],
      }),
    ).toBe(false);
    expect(fetchWellKnown).not.toHaveBeenCalled();
  });
});
