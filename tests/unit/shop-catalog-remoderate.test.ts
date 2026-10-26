/** T-0315 RM1-RM6: layer-1 re-moderation when the rule files change (TEST_DATABASE_URL, disposable). */
import * as rules from '../../src/shop/moderation/product-rules';
import {
  backfillContentHashes,
  computeRulesHash,
  run,
  type RulesHashStore,
} from '../../src/jobs/catalog-remoderate.job';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import type { ShopTx } from '../../src/shop/db';
import { client, dbDescribe, migrate, mkMerchant } from './helpers/shop-db';

jest.mock('../../src/config', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/services/redis.service', () => ({ ensureRedisConnected: jest.fn() }));

dbDescribe('catalog-remoderate job (T-0315)', () => {
  const db = client();
  let merchant: string;
  let stored: string | null;
  const store: RulesHashStore = {
    get: async () => stored,
    set: async (h) => {
      stored = h;
    },
  };
  let productQueries: number;
  let failOnProductQuery = 0;
  const deps = (): ShopDeps => {
    const tx = (q: string, v: unknown[]) => {
      if (/FROM shop_products/.test(q)) {
        productQueries++;
        if (failOnProductQuery && productQueries === failOnProductQuery) {
          throw new Error('boom');
        }
      }
      return v;
    };
    const wrap = (t: unknown): ShopTx =>
      ({
        $queryRawUnsafe: async (q: string, ...v: unknown[]) => {
          tx(q, v);
          return (t as any).$queryRawUnsafe(q, ...v);
        },
        $executeRawUnsafe: async (q: string, ...v: unknown[]) =>
          (t as any).$executeRawUnsafe(q, ...v),
      }) as ShopTx;
    return {
      db: wrap(db),
      transaction: async (fn: (t: ShopTx) => Promise<unknown>) =>
        db.$transaction((t) => fn(wrap(t))),
    } as unknown as ShopDeps;
  };

  const mk = async (sku: string, title: string, status = 'ok', category = 'sporting-goods') => {
    const r = await db.$queryRawUnsafe<Array<{ product_id: string }>>(
      `INSERT INTO shop_products (merchant_id, sku, title, price_usd, category, moderation_status, updated_at)
       VALUES ($1::uuid, $2, $3, 5, $4, $5, now() - interval '1 day') RETURNING product_id`,
      merchant,
      sku,
      title,
      category,
      status,
    );
    return r[0].product_id;
  };
  const row = async (id: string) =>
    (
      await db.$queryRawUnsafe<Array<{ moderation_status: string; fresh: boolean }>>(
        `SELECT moderation_status, updated_at > now() - interval '1 hour' AS fresh FROM shop_products WHERE product_id = $1::uuid`,
        id,
      )
    )[0];

  beforeAll(async () => {
    // client() above already pinned the env datasource to the test URL, which migrate()'s guard refuses.
    delete process.env.DATABASE_URL;
    migrate();
    merchant = await mkMerchant(db);
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe(`DELETE FROM outbox WHERE event_type = 'shop.catalog.rejected'`);
    await db.$executeRawUnsafe(`DELETE FROM shop_moderation_reviews`);
    await db.$executeRawUnsafe(`DELETE FROM shop_products`);
    stored = 'stale-hash';
    productQueries = 0;
    failOnProductQuery = 0;
  });
  afterAll(() => db.$disconnect());

  it('RM1 hash equal -> no product queries', async () => {
    await mk('a', 'Skates');
    stored = computeRulesHash();
    const res = await run(deps(), { store });
    expect(res.skipped).toBe(true);
    expect(productQueries).toBe(0);
  });

  it('RM2 changed rules: only the newly prohibited item is rejected', async () => {
    const bad = await mk('bad', 'Premium cocaine kit');
    const g1 = await mk('g1', 'Skates');
    const g2 = await mk('g2', 'Helmet');
    const res = await run(deps(), { store });
    expect(res).toMatchObject({ skipped: false, scanned: 3, rejected: 1, flagged: 0 });
    expect(await row(bad)).toEqual({ moderation_status: 'rejected', fresh: true });
    expect(await row(g1)).toEqual({ moderation_status: 'ok', fresh: false });
    expect(await row(g2)).toEqual({ moderation_status: 'ok', fresh: false });
    const reviews = await db.$queryRawUnsafe<Array<Record<string, string>>>(
      `SELECT scope, layer, verdict, product_id FROM shop_moderation_reviews`,
    );
    expect(reviews).toEqual([
      { scope: 'product', layer: 'rules', verdict: 'reject', product_id: bad },
    ]);
    const ob = await db.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM outbox WHERE event_type = 'shop.catalog.rejected'`,
    );
    expect(ob).toHaveLength(1);
    expect(stored).toBe(computeRulesHash());
  });

  it('RM8 (T-0568) remoderate scans the texts moderationTexts() returns, instant payload included', async () => {
    const { encryptSecret } = await import('../../src/services/secret-crypto.service');
    const id = await mk('pay', 'Skates');
    await db.$executeRawUnsafe(
      `UPDATE shop_products SET fulfillment_payload_encrypted = $2 WHERE product_id = $1::uuid`,
      id,
      encryptSecret('Premium cocaine kit', 'k'.repeat(40)),
    );
    const spy = jest.spyOn(rules, 'moderationTexts');
    try {
      const res = await run(deps(), { store });
      expect(res.rejected).toBe(1);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Skates', instant_payload: 'Premium cocaine kit' }),
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('RM9 (T-0568) backfill fills content_hash on products and their reviews', async () => {
    const id = await mk('bf', 'Skates');
    await db.$executeRawUnsafe(
      `INSERT INTO shop_moderation_reviews (merchant_id, scope, product_id, layer, verdict)
       VALUES ($1::uuid, 'product', $2::uuid, 'llm', 'reject')`,
      merchant,
      id,
    );
    expect(await backfillContentHashes(deps())).toBe(1);
    const r = await db.$queryRawUnsafe<Array<{ a: string; b: string }>>(
      `SELECT p.content_hash a, r.content_hash b FROM shop_products p, shop_moderation_reviews r WHERE p.product_id = $1::uuid`,
      id,
    );
    expect(r[0].a).toMatch(/^[0-9a-f]{64}$/);
    expect(r[0].b).toBe(r[0].a);
  });

  it('RM3 flagged item with now-clean text stays flagged', async () => {
    const f = await mk('f', 'Skates', 'flagged');
    await run(deps(), { store });
    expect((await row(f)).moderation_status).toBe('flagged');
  });

  it('RM4 second run changes nothing', async () => {
    await mk('bad', 'Premium cocaine kit');
    await run(deps(), { store });
    const res = await run(deps(), { store });
    expect(res.skipped).toBe(true);
    const n = await db.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT count(*) AS c FROM shop_moderation_reviews`,
    );
    expect(Number(n[0].c)).toBe(1);
  });

  it('RM5 rejected items are not scanned', async () => {
    await mk('r', 'Skates', 'rejected');
    const res = await run(deps(), { store });
    expect(res.scanned).toBe(0);
  });

  it('RM6 failure on the 2nd batch -> hash not stored', async () => {
    await mk('a', 'Skates');
    await mk('b', 'Helmet');
    await mk('c', 'Gloves');
    failOnProductQuery = 2;
    await expect(run(deps(), { store, batchSize: 1 })).rejects.toThrow('boom');
    expect(stored).toBe('stale-hash');
  });
});
