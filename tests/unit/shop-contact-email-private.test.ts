/**
 * T-0867 (REQ-AB-R5-5): the registration contact_email is private. A shop with a canary contact_email and an
 * empty support_email must not leak the canary through any buyer, agent or partner surface; once a support
 * email is set, merchant_contact.email is that address only. Real Postgres (TEST_DATABASE_URL, disposable).
 */
import express from 'express';
import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { discover } from '../../src/services/discovery.service';
import { getProduct, searchCatalog } from '../../src/shop/catalog.read.service';
import { getOrderView } from '../../src/shop/order-payment.service';
import { createHandoff, bindHandoff, readHandoff } from '../../src/shop/partner/handoff.service';
import { partnerQuotes } from '../../src/shop/partner/quote-outcomes-read.service';
import { createQuote } from '../../src/shop/quote.service';
import { createStorefrontRouter } from '../../src/shop/routes/storefront.router';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { client, dbDescribe, migrate } from './helpers/shop-db';

jest.mock('../../src/config', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/moderation-ban.service', () => ({
  checkBan: jest.fn(async () => ({ banned: false, retryAfterSecs: 0 })),
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

const CANARY = 'private-canary@m.example';
const SUPPORT = 'help@m.example';
const PAYER = '0x00000000000000000000000000000000000a11ce';
const BUYER = 'agent:canary-buyer';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const seen = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));

dbDescribe('T-0867 the registration contact email stays private', () => {
  const prisma = client();
  const q = (sql: string, ...v: unknown[]) =>
    prisma.$queryRawUnsafe<Array<Record<string, any>>>(sql, ...v);
  const deps: ShopDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: { incr: async () => 1, expire: async () => 1 } as never,
  };
  const tag = Date.now().toString(36);
  const slug = `cc-${tag}`;
  const sku = `sku-${tag}`;
  let merchant_id = '';
  let order_id = '';
  let server: Server;
  let base = '';

  beforeAll(async () => {
    migrate();
    merchant_id = (
      await q(
        `INSERT INTO shop_merchants (slug, name, category, country, wallet_address, payout_wallet_base,
            payout_wallet_tempo, contact_email, support_email, site_url, status, domain_verified, provek, created_at)
         VALUES ($1, $2, 'sporting-goods', 'US', $3, '0x00000000000000000000000000000000000b0b0b', '0xt', $4,
                 NULL, 'https://x.example', 'active', TRUE, '{"opt_in":true}'::jsonb, now() - interval '90 days')
         RETURNING merchant_id::text`,
        slug,
        `Shop ${slug}`,
        `0xwallet${tag}`,
        CANARY,
      )
    )[0].merchant_id;
    for (const doc_id of ['merchant-agreement', 'aup', 'dpa', 'refund-framework']) {
      if ((await q(`SELECT 1 FROM shop_legal_docs WHERE doc_id = $1`, doc_id)).length === 0) {
        await q(
          `INSERT INTO shop_legal_docs (doc_id, version, sha256, url, effective_from, body_md)
           VALUES ($1, 'cc', $2, $3, now() - interval '1 day', 'b')`,
          doc_id,
          doc_id.padEnd(64, '0'),
          `/legal/${doc_id}`,
        );
      }
    }
    await q(
      `INSERT INTO shop_acceptances (merchant_id, doc_id, version, sha256, method, signer, signature, message)
       SELECT DISTINCT ON (doc_id) $1::uuid, doc_id, version, sha256, 'wallet_signature', 's', 'sig', 'm'
         FROM shop_legal_docs WHERE doc_id IN ('merchant-agreement','aup','dpa','refund-framework')
        ORDER BY doc_id, effective_from DESC`,
      merchant_id,
    );
    await q(
      `INSERT INTO shop_products (moderation_status, merchant_id, sku, title, price_usd, available, category)
       VALUES ('ok', $1::uuid, $2, $3, 5, 10, 'books')`,
      merchant_id,
      sku,
      `canaryword${tag} gadget`,
    );
    const quote = (
      await q(
        `INSERT INTO shop_quotes (merchant_id, buyer_identity, items, subtotal, total_usd, expires_at, status)
         VALUES ($1::uuid, $2, $3::jsonb, 5, 5, now() + interval '10 minutes', 'paid') RETURNING quote_id::text`,
        merchant_id,
        BUYER,
        JSON.stringify([{ sku, qty: 1 }]),
      )
    )[0].quote_id;
    order_id = (
      await q(
        `INSERT INTO shop_orders (quote_id, merchant_id, state, total_usd, payer_wallet, settled_at)
         VALUES ($1::uuid, $2::uuid, 'PAID', 5, $3, now() - interval '1 hour') RETURNING order_id::text`,
        quote,
        merchant_id,
        PAYER,
      )
    )[0].order_id;
    await q(
      `INSERT INTO shop_partner_grants (merchant_id, partner_id, key_hash, scopes, mode)
       VALUES ($1::uuid, 'soukbase', NULL, ARRAY['catalog:write','webhooks:write','quotes:read'], 'partner')`,
      merchant_id,
    );
    Object.assign(process.env, {
      INTEGRATOR_BASE_ORDERS_ENABLED: 'true',
      INTEGRATOR_FEE_ENABLED: 'false',
      INTEGRATOR_TEST_SKU_DAILY_CAP: '30',
      PUBLIC_BASE_URL: 'https://apibase.pro',
    });
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
  });
  afterAll(async () => {
    server.close();
    await prisma.$disconnect();
  });

  const get = async (path: string, accept?: string) =>
    (await fetch(base + path, { headers: accept ? { accept } : {} })).text();

  it('no buyer, agent or partner surface carries the contact email while support_email is empty', async () => {
    const quote = await createQuote(
      deps,
      merchant_id,
      { identity: 'agent:q' },
      { items: [{ sku, qty: 1 }] },
    );
    const surfaces: Record<string, string> = {
      quote: seen(quote),
      order_payer: seen(await getOrderView(prisma as never, order_id, BUYER)),
      order_stranger: seen(await getOrderView(prisma as never, order_id, 'agent:stranger')),
      order_wallet: seen(
        await getOrderView(prisma as never, order_id, `wallet:${sha(PAYER.toLowerCase())}`),
      ),
      storefront_html: await get(`/m/${slug}`),
      storefront_md: await get(`/m/${slug}`, 'text/markdown'),
      storefront_agent_json: await get(`/m/${slug}/agent.json`),
      storefront_card: await get(`/api/v1/shop/shops/${slug}`),
      catalog_get: seen(await getProduct(prisma as never, { merchant: slug, sku })),
      catalog_search: seen(await searchCatalog(prisma as never, { merchant: slug })),
      discover: seen(await discover({ intent: `canaryword${tag}` }, { shopDb: prisma as never })),
      provek: await get(`/m/${slug}/provek.json`),
      partner_quotes: seen(
        await partnerQuotes(prisma as never, { id: 'soukbase', name: 'Soukbase' }, slug, {}),
      ),
    };
    expect(surfaces.provek).toContain('provek_declaration');
    expect(surfaces.discover.length).toBeGreaterThan(2);
    expect(surfaces.order_payer).toContain('site_url');
    for (const [name, text] of Object.entries(surfaces)) {
      expect([name, text.includes(CANARY)]).toEqual([name, false]);
    }
    expect(JSON.parse(surfaces.order_payer).merchant_contact).toEqual({
      site_url: 'https://x.example',
    });
  });

  it('readHandoff never returns the e-mail, before or after registration binds the handoff', async () => {
    const h = await createHandoff(prisma as never, 'soukbase', {
      seller_ref: 'canary-ref',
      prefill: { contact_email: CANARY },
      expected_wallet: null,
      mode: 'register',
      grant_requested: false,
    });
    expect(seen(await readHandoff(prisma as never, 'soukbase', h.handoff_id))).not.toContain(
      CANARY,
    );
    await bindHandoff(prisma as never, h.handoff_id, merchant_id, slug, `0xwallet${tag}`);
    expect(seen(await readHandoff(prisma as never, 'soukbase', h.handoff_id))).not.toContain(
      CANARY,
    );
  });

  it('with a support_email, merchant_contact.email is that address only', async () => {
    await q(
      `UPDATE shop_merchants SET support_email = $2 WHERE merchant_id = $1::uuid`,
      merchant_id,
      SUPPORT,
    );
    const view = await getOrderView(prisma as never, order_id, BUYER);
    expect(view.merchant_contact).toEqual({ email: SUPPORT, site_url: 'https://x.example' });
    expect(seen(view)).not.toContain(CANARY);
    const wallet = await getOrderView(
      prisma as never,
      order_id,
      `wallet:${sha(PAYER.toLowerCase())}`,
    );
    expect(wallet.merchant_contact?.email).toBe(SUPPORT);
    expect(seen(wallet)).not.toContain(CANARY);
  });
});
