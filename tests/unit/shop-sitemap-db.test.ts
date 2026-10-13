/** T-0358: sitemap index/shards against real Postgres (TEST_DATABASE_URL, disposable). */
import type { ShopTx } from '../../src/shop/db';
import {
  resetSitemapCache,
  shopSitemapIndex,
  shopSitemapShard,
} from '../../src/shop/storefront/storefront.service';
import { client, dbDescribe, migrate, mkMerchant } from './helpers/shop-db';

jest.mock('../../src/config', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

dbDescribe('shop sitemap against real Postgres (T-0358)', () => {
  const db = client();
  const tx = db as unknown as ShopTx;
  const ids: string[] = [];

  const activate = (id: string, date: string) =>
    db.$executeRawUnsafe(
      `UPDATE shop_merchants SET status='active', created_at=$1::timestamptz WHERE merchant_id=$2::uuid`,
      date,
      id,
    );
  const slugOf = async (id: string) =>
    (
      await db.$queryRawUnsafe<Array<{ slug: string }>>(
        `SELECT slug FROM shop_merchants WHERE merchant_id=$1::uuid`,
        id,
      )
    )[0].slug;

  beforeAll(() => migrate());
  beforeEach(() => resetSitemapCache());
  afterAll(async () => {
    for (const id of ids) {
      await db.$executeRawUnsafe(`DELETE FROM shop_merchants WHERE merchant_id=$1::uuid`, id);
    }
    await db.$disconnect();
  });

  it('a. no active merchants -> empty index, no shard 1', async () => {
    ids.push(await mkMerchant(db));
    const xml = await shopSitemapIndex(tx);
    expect(xml).toContain('<sitemapindex');
    expect(xml).not.toContain('<sitemap>');
    resetSitemapCache();
    expect(await shopSitemapShard(tx, 1)).toBeNull();
  });

  it('b/c. active merchants drive index lastmod and shard 1; pending is absent', async () => {
    const a = await mkMerchant(db);
    const b = await mkMerchant(db);
    const pending = await mkMerchant(db);
    ids.push(a, b, pending);
    await activate(a, '2026-09-01');
    await activate(b, '2026-09-15');
    const idx = await shopSitemapIndex(tx);
    expect(idx.match(/<sitemap>/g)).toHaveLength(1);
    expect(idx).toContain('/sitemap-shops-1.xml</loc>');
    expect(idx).toContain('<lastmod>2026-09-15</lastmod>');
    resetSitemapCache();
    const shard = (await shopSitemapShard(tx, 1)) as string;
    const locs = [...shard.matchAll(/\/m\/([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([await slugOf(a), await slugOf(b)].sort());
    expect(shard).not.toContain(await slugOf(pending));
    resetSitemapCache();
    expect(await shopSitemapShard(tx, 2)).toBeNull();
  });
});
