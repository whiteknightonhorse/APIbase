/**
 * T-0844: one listing rule. A merchant is listed only when status = 'active' AND domain_verified;
 * discover kind=merchant and listShops answer the same for one shared fixture, and an unverified
 * shop stays reachable by direct link (/m/<slug>) without the discover sentence.
 */
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createStorefrontRouter } from '../../src/shop/routes/storefront.router';
import { listShops } from '../../src/shop/storefront/storefront.service';
import { discover } from '../../src/services/discovery.service';
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

dbDescribe('one listing rule (T-0844)', () => {
  const prisma = client();
  const tag = Date.now().toString(36);
  const word = `zorblax${tag}`;
  const slugV = `lv-${tag}`;
  const slugU = `lu-${tag}`;
  let server: Server;
  let base = '';

  const mk = async (slug: string, verified: boolean) => {
    const r = await prisma.$queryRawUnsafe<Array<{ merchant_id: string }>>(
      `INSERT INTO shop_merchants (slug, name, category, country, wallet_address, payout_wallet_base,
          payout_wallet_tempo, contact_email, site_url, status, domain_verified, policy)
       VALUES ($1, $2, 'sporting-goods', 'US', $3, '0xb', '0xt', 'x@private.example',
               'https://shop.example', 'active', $4, '{}'::jsonb) RETURNING merchant_id`,
      slug,
      `Shop ${slug}`,
      `0x${slug}`,
      verified,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_products (merchant_id, sku, title, price_usd, is_test, moderation_status)
       VALUES ($1::uuid, 'p1', $2, 5::numeric, false, 'ok')`,
      r[0].merchant_id,
      `Item ${word}`,
    );
  };

  beforeAll(async () => {
    migrate();
    await mk(slugV, true);
    await mk(slugU, false);
    const app = express();
    app.use(createStorefrontRouter({ limit: 60, db: prisma as never }));
    server = await new Promise<Server>((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.close();
    await prisma.$disconnect();
  });

  it('discover offers the verified merchant and not the unverified twin', async () => {
    const r = await discover({ intent: `item ${word}`, kind: 'merchant' } as never, {
      shopDb: prisma as never,
    });
    const slugs = JSON.stringify(r);
    expect(slugs).toContain(slugV);
    expect(slugs).not.toContain(slugU);
  });

  it('listShops gives the same answer for the same two merchants', async () => {
    const l = await listShops(prisma as never, 1);
    const slugs = l.shops.map((s) => s.slug);
    expect(slugs).toContain(slugV);
    expect(slugs).not.toContain(slugU);
  });

  it('the unverified shop page still answers 200 with the warning and no discover sentence', async () => {
    const u = await fetch(`${base}/m/${slugU}`);
    expect(u.status).toBe(200);
    const h = await u.text();
    expect(h).toContain('Not yet in apibase.discover or /shops: the domain is not verified.');
    expect(h).toContain('unverified_domain');
    expect(h).not.toContain('Agents also find this shop with apibase.discover');
    const v = await (await fetch(`${base}/m/${slugV}`)).text();
    expect(v).toContain('Agents also find this shop with apibase.discover');
  });
});
