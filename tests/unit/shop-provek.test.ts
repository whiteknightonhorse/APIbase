/**
 * T-INT-44 PV1-PV6 against a real Postgres (TEST_DATABASE_URL, disposable): the optional Provek
 * declaration, evidence.json, the registry sync, and the disclosure line.
 */
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createStorefrontRouter } from '../../src/shop/routes/storefront.router';
import { createMerchantRouter } from '../../src/shop/routes/merchant.router';
import { issueKey } from '../../src/shop/auth/merchant-key.service';
import {
  runShopProvekRegistrySync,
  REGISTRY_MAX_BYTES,
  type FetchRegistry,
} from '../../src/jobs/shop-provek-registry-sync.job';
import { PROVEK_DISCLOSURE } from '../../src/shop/provek/provek.service';
import { discover } from '../../src/services/discovery.service';
import { searchCatalog } from '../../src/shop/catalog.read.service';
import { client, dbDescribe, migrate } from './helpers/shop-db';

jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: jest.fn(async () => ({ mget: async () => [] })),
}));
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({
  getToolCacheEntries: async () => [],
}));
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({ providerStatus: { findMany: async () => [] } }),
}));

const PRIVATE_MAIL = 'secret-mail@private.example';
const VERIFIED_WORD = /\bverified\b/i;

/** Structural check of provek_declaration 1.1.0 (the shape of the platform's own provek.json). */
function expectValidDeclaration(d: Record<string, any>) {
  expect(d.provek_declaration).toBe('1.1.0');
  const a = d.accountability;
  expect(typeof a.claims_addressee.type).toBe('string');
  expect(typeof a.claims_addressee.contact).toBe('string');
  expect(typeof a.emergency_stop.exists).toBe('boolean');
  expect(typeof a.emergency_stop.holder).toBe('string');
  expect(typeof a.emergency_stop.mechanism).toBe('string');
  expect(typeof a.insurance.exists).toBe('boolean');
  expect(typeof a.dispute_path.type).toBe('string');
  expect(d.service.order_url).toMatch(/^https:\/\/apibase\.pro\/mcp\/m\//);
  expect(typeof d.service.offering).toBe('string');
  expect(d.service.pricing_url).toMatch(/^https:\/\/apibase\.pro\/m\//);
}

dbDescribe('Provek declaration + evidence (INT-44)', () => {
  const prisma = client();
  const tag = Date.now().toString(36);
  const slugA = `pa-${tag}`;
  const slugB = `pb-${tag}`;
  const slugOff = `po-${tag}`;
  const slugGone = `pg-${tag}`;
  const siteA = `https://a-${tag}.example`;
  let idA = '';
  let idB = '';
  let keyA = '';
  let server: Server;
  let base = '';
  let merchantServer: Server;
  let mbase = '';

  const mk = async (slug: string, status: string, site: string, provek: object | null) => {
    const r = await prisma.$queryRawUnsafe<Array<{ merchant_id: string }>>(
      `INSERT INTO shop_merchants (slug, name, category, country, wallet_address, payout_wallet_base,
          payout_wallet_tempo, contact_email, site_url, status, domain_verified, provek, reputation)
       VALUES ($1, $2, 'sporting-goods', 'US', $3, '0xb', '0xt', $4, $5, $6, TRUE, $7::jsonb,
               '{"closed_on_time_pct":98.5,"dispute_rate":0.01,"refund_rate":0.02,"orders_closed":40}'::jsonb)
       RETURNING merchant_id`,
      slug,
      `Shop ${slug}`,
      `0xwallet${slug}`,
      PRIVATE_MAIL,
      site,
      status,
      provek === null ? null : JSON.stringify(provek),
    );
    return r[0].merchant_id;
  };
  const stored = async (slug: string) =>
    (
      await prisma.$queryRawUnsafe<Array<{ provek: Record<string, unknown> | null }>>(
        `SELECT provek FROM shop_merchants WHERE slug = $1`,
        slug,
      )
    )[0].provek;
  const get = (path: string, accept?: string) =>
    fetch(base + path, { headers: accept ? { accept } : {} });
  const patch = (key: string, body: unknown) =>
    fetch(`${mbase}/api/v1/shop/merchants/me/provek`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    migrate();
    idA = await mk(slugA, 'active', siteA, null);
    idB = await mk(slugB, 'active', 'https://b.example', null);
    for (const id of [idA, idB]) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO shop_products (merchant_id, sku, title, price_usd) VALUES ($1::uuid, 's1', $2, 5)`,
        id,
        `rollerword${tag} gadget`,
      );
    }
    await mk(slugOff, 'active', 'https://off.example', { opt_in: false });
    await mk(slugGone, 'deactivated', 'https://gone.example', { opt_in: true });
    keyA = await issueKey(prisma as never, idA, ['catalog:write']);
    const app = express();
    app.use(
      createStorefrontRouter({
        db: prisma as never,
        check: async () => ({ connected: true, payment_verified: false }),
      }),
    );
    server = await new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const mapp = express();
    mapp.use(express.json());
    mapp.use(
      createMerchantRouter({
        db: prisma as never,
        transaction: (fn) => fn(prisma as never),
      }),
    );
    merchantServer = await new Promise((r) => {
      const s = mapp.listen(0, '127.0.0.1', () => r(s));
    });
    mbase = `http://127.0.0.1:${(merchantServer.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.close();
    merchantServer.close();
    await prisma.$disconnect();
  });

  it('PV1 opt_in=false -> 404; opt_in=true -> 200 valid declaration without contact_email', async () => {
    expect((await get(`/m/${slugA}/provek.json`)).status).toBe(404);
    expect((await get(`/m/${slugOff}/provek.json`)).status).toBe(404);
    const r = await patch(keyA, {
      opt_in: true,
      insurance: { exists: true, note: 'covers refunds up to $500' },
    });
    expect(r.status).toBe(200);
    const res = await get(`/m/${slugA}/provek.json`);
    expect(res.status).toBe(200);
    const text = await res.text();
    const d = JSON.parse(text);
    expectValidDeclaration(d);
    expect(d.accountability.claims_addressee).toEqual({ type: 'website', contact: siteA });
    expect(d.accountability.insurance).toEqual({ exists: true, note: 'covers refunds up to $500' });
    expect(d.accountability.dispute_path.url).toBe(`https://apibase.pro/m/${slugA}#disputes`);
    expect(d.service.offering).toBe(`Shop ${slugA}: sporting-goods via APIbase AI payment`);
    expect(d.operated_via.platform).toBe('APIbase');
    // claims_url overrides the site
    await patch(keyA, { opt_in: true, claims_url: 'https://claims.example/c' });
    const d2 = await (await get(`/m/${slugA}/provek.json`)).json();
    expect(d2.accountability.claims_addressee.contact).toBe('https://claims.example/c');
    expect(d2.accountability.insurance).toEqual({ exists: false });
    const everything = [
      text,
      await (await get(`/m/${slugA}`)).text(),
      await (await get(`/m/${slugA}`, 'text/markdown')).text(),
      await (await get(`/m/${slugA}/agent.json`)).text(),
      await (await get(`/api/v1/shop/shops/${slugA}`)).text(),
      await (await get(`/api/v1/shop/shops/${slugA}/evidence.json`)).text(),
      JSON.stringify(await (await patch(keyA, { opt_in: true })).json()),
    ].join('\n');
    expect(everything).not.toContain('secret-mail');
    expect(everything).not.toContain('contact_email');
  });

  it('PV1b PATCH validation: https only, note <= 140, boolean opt_in, no unknown keys', async () => {
    for (const body of [
      {},
      { opt_in: 'yes' },
      { opt_in: true, claims_url: 'http://x.example' },
      { opt_in: true, claims_url: 'javascript:alert(1)' },
      { opt_in: true, insurance: { exists: true, note: 'x'.repeat(141) } },
      { opt_in: true, insurance: { note: 'no flag' } },
      { opt_in: true, merchant_id: idB },
    ]) {
      expect((await patch(keyA, body)).status).toBe(422);
    }
    expect((await patch(keyA, { opt_in: true, insurance: { exists: false } })).status).toBe(200);
    const noScope = await issueKey(prisma as never, idA, ['orders:read']);
    expect((await patch(noScope, { opt_in: true })).status).toBe(403);
  });

  it('PV2 evidence.json: aggregates only, no 0x / @ / order_id; test-SKU orders are not counted', async () => {
    const r = await get(`/api/v1/shop/shops/${slugA}/evidence.json`);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toMatch(/max-age=60/);
    const text = await r.text();
    const j = JSON.parse(text);
    expect(j.slug).toBe(slugA);
    expect(j.reputation).toEqual({
      closed_on_time_pct: 98.5,
      dispute_rate: 0.01,
      refund_rate: 0.02,
      orders_closed: 40,
    });
    expect(j.domain_verified).toBe(true);
    expect(j.connected).toBe(true);
    expect(j.payment_verified).toBe(false);
    expect(j.provek).toEqual({ declared: true, listed: false, registry_url: null });
    expect(typeof j.active_since).toBe('string');
    expect(typeof j.as_of).toBe('string');
    expect(text).not.toContain('0x');
    expect(text).not.toContain('@');
    expect(text).not.toContain('order_id');
    expect((await get(`/api/v1/shop/shops/${slugGone}/evidence.json`)).status).toBe(410);
    expect((await get(`/api/v1/shop/shops/nope-${tag}/evidence.json`)).status).toBe(404);
    // an opted-out merchant still has evidence, with declared=false
    const off = await (await get(`/api/v1/shop/shops/${slugOff}/evidence.json`)).json();
    expect(off.provek).toEqual({ declared: false, listed: false, registry_url: null });
  });

  describe('PV3 registry sync', () => {
    const registry = (hosts: string[]) =>
      JSON.stringify({
        entries: hosts.map((h) => ({ domain: h, registry_url: `https://provek.dev/r/${h}` })),
      });
    const ok =
      (body: string, extra: Partial<Awaited<ReturnType<FetchRegistry>>> = {}): FetchRegistry =>
      async () => ({ status: 200, body, ...extra });
    const pub = async () => ['93.184.216.34'];

    beforeEach(async () => {
      await patch(keyA, { opt_in: true });
    });

    it('listed=true when the registry has the site host, false otherwise', async () => {
      const fetchRegistry = jest.fn(ok(registry([`a-${tag}.example`, 'other.example'])));
      const r = await runShopProvekRegistrySync({
        db: prisma as never,
        resolve: pub,
        fetchRegistry,
      });
      expect(r.failed).toBe(false);
      expect(await stored(slugA)).toMatchObject({
        opt_in: true,
        listed: true,
        registry_url: `https://provek.dev/r/a-${tag}.example`,
      });
      const j = await (await get(`/api/v1/shop/shops/${slugA}/evidence.json`, undefined)).json();
      expect(j.provek.declared).toBe(true);
      // not opted in -> untouched
      expect(await stored(slugB)).toBeNull();
      // registry without the host -> false again
      await runShopProvekRegistrySync({
        db: prisma as never,
        resolve: pub,
        fetchRegistry: ok(registry(['nobody.example'])),
      });
      expect(await stored(slugA)).toMatchObject({ listed: false, registry_url: null });
    });

    const seedListed = async () => {
      await prisma.$executeRawUnsafe(
        `UPDATE shop_merchants SET provek = provek || '{"listed":true,"registry_url":"https://provek.dev/r/keep"}'::jsonb WHERE slug = $1`,
        slugA,
      );
    };

    it('refuses a private address, a redirect and an oversize body; values stay', async () => {
      await seedListed();
      const fetchRegistry = jest.fn(ok(registry([])));
      const priv = await runShopProvekRegistrySync({
        db: prisma as never,
        resolve: async () => ['10.0.0.5'],
        fetchRegistry,
      });
      expect(priv.failed).toBe(true);
      expect(fetchRegistry).not.toHaveBeenCalled();
      const redirect = await runShopProvekRegistrySync({
        db: prisma as never,
        resolve: pub,
        fetchRegistry: async () => ({ status: 302, body: '' }),
      });
      expect(redirect.failed).toBe(true);
      const big = await runShopProvekRegistrySync({
        db: prisma as never,
        resolve: pub,
        fetchRegistry: ok('x'.repeat(REGISTRY_MAX_BYTES + 1024 * 1024)),
      });
      expect(big.failed).toBe(true);
      const bigFlag = await runShopProvekRegistrySync({
        db: prisma as never,
        resolve: pub,
        fetchRegistry: ok('', { oversize: true }),
      });
      expect(bigFlag.failed).toBe(true);
      const junk = await runShopProvekRegistrySync({
        db: prisma as never,
        resolve: pub,
        fetchRegistry: ok('not json'),
      });
      expect(junk.failed).toBe(true);
      expect(await stored(slugA)).toMatchObject({
        listed: true,
        registry_url: 'https://provek.dev/r/keep',
      });
    });
  });

  it('PV4 provek + disclosure only with opt_in; "verified" only when listed', async () => {
    await patch(keyA, { opt_in: false });
    const offHtml = await (await get(`/m/${slugA}`)).text();
    const offMd = await (await get(`/m/${slugA}`, 'text/markdown')).text();
    for (const t of [offHtml, offMd]) {
      expect(t).not.toMatch(/provek/i);
      expect(t).not.toContain(PROVEK_DISCLOSURE);
    }
    expect(offHtml).not.toContain('provek.json');
    const offAgent = await (await get(`/m/${slugA}/agent.json`)).json();
    expect(offAgent.provek).toBeUndefined();

    await patch(keyA, { opt_in: true });
    const html = await (await get(`/m/${slugA}`)).text();
    const md = await (await get(`/m/${slugA}`, 'text/markdown')).text();
    expect(html).toContain(
      `<link rel="alternate" type="application/json" href="/m/${slugA}/provek.json">`,
    );
    for (const t of [html, md]) {
      expect(t).toContain(PROVEK_DISCLOSURE);
      expect(t).toMatch(/not listed in the Provek registry/);
      expect(t).not.toMatch(VERIFIED_WORD);
    }
    const shopJson = await (await get(`/api/v1/shop/shops/${slugA}`)).json();
    expect(shopJson.provek).toEqual({ declared: true, listed: false, registry_url: null });
    const agent = await (await get(`/m/${slugA}/agent.json`)).json();
    expect(agent.provek).toEqual({ declared: true, listed: false, registry_url: null });

    await prisma.$executeRawUnsafe(
      `UPDATE shop_merchants SET provek = provek || '{"listed":true,"registry_url":"https://provek.dev/r/x"}'::jsonb WHERE slug = $1`,
      slugA,
    );
    const listedHtml = await (await get(`/m/${slugA}`)).text();
    expect(listedHtml).toMatch(VERIFIED_WORD);
    expect(listedHtml).toContain('https://provek.dev/r/x');
    expect(listedHtml).toContain(PROVEK_DISCLOSURE);
    // the status badge carries no number (SG-14)
    expect(listedHtml).not.toMatch(/Provek[^<]*\d/);

    // catalog.get / discover (kind: merchant)
    const card = (await searchCatalog(prisma as never, { merchant: slugA })).merchant;
    expect(card.provek).toEqual({
      declared: true,
      listed: true,
      registry_url: 'https://provek.dev/r/x',
    });
    expect(
      (await searchCatalog(prisma as never, { merchant: slugB })).merchant.provek,
    ).toBeUndefined();
    const hit = async (slug: string) =>
      (await discover({ intent: `rollerword${tag}` }, { shopDb: prisma as never })).results.find(
        (x) => x.kind === 'merchant' && x.slug === slug,
      ) as any;
    await expect(hit(slugA)).resolves.toMatchObject({
      provek: { declared: true, listed: true, registry_url: 'https://provek.dev/r/x' },
    });
    expect((await hit(slugB)).provek).toBeUndefined();
  });

  it('PV5 cross-tenant: a PATCH with key A never changes merchant B', async () => {
    const before = await stored(slugB);
    const r = await patch(keyA, { opt_in: true, merchant_id: idB });
    expect(r.status).toBe(422);
    await patch(keyA, { opt_in: true, claims_url: 'https://a-only.example' });
    expect(await stored(slugB)).toEqual(before);
    expect((await get(`/m/${slugB}/provek.json`)).status).toBe(404);
  });

  it('PV6 deactivated -> 410, even with opt_in=true', async () => {
    expect((await get(`/m/${slugGone}/provek.json`)).status).toBe(410);
  });
});
