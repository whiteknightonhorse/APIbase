/** T-INT-07 QT1-QT12 against a real Postgres (TEST_DATABASE_URL, disposable). */
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { QuoteError } from '../../src/shop/quote.errors';
import { ShopGateError } from '../../src/shop/auth/terms.guard';
import {
  cancelOrder,
  computeFeeCents,
  countPaidTestOrders24h,
  createQuote,
  getQuote,
} from '../../src/shop/quote.service';
import { createOrderRouter } from '../../src/shop/routes/order.router';
import { forMcp } from '../../src/shop/tools/order.tools';
import { toMicroUsdc } from '../../src/config/x402.config';
import { client, dbDescribe, migrate, mkMerchant } from './helpers/shop-db';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';

jest.mock('../../src/config', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/config/x402.config', () => ({
  ...jest.requireActual('../../src/config/x402.config'),
  getX402Config: () => ({
    network: 'eip155:8453',
    usdcAddress: '0xUSDC',
    paymentAddress: '0xPLATFORMPAYTO',
  }),
}));
jest.mock('../../src/services/moderation-ban.service', () => ({
  checkBan: jest.fn(async () => ({ banned: false, retryAfterSecs: 0 })),
}));
const idemStore = new Map<string, { status: string; code?: number; body?: string }>();
jest.mock('../../src/services/idempotency.service', () => ({
  checkIdempotency: async (a: string, k: string) => {
    const r = idemStore.get(`${a}:${k}`);
    if (!r) return { action: 'proceed' };
    if (r.status === 'PENDING') return { action: 'conflict', retryAfter: 2 };
    return { action: 'return_cached', statusCode: r.code, body: r.body };
  },
  setPending: async (a: string, k: string) =>
    void idemStore.set(`${a}:${k}`, { status: 'PENDING' }),
  finalizeIdempotency: async (
    a: string,
    k: string,
    _e: string,
    s: string,
    code: number,
    body: string,
  ) => void idemStore.set(`${a}:${k}`, { status: s, code, body }),
  clearIdempotency: async (a: string, k: string) => void idemStore.delete(`${a}:${k}`),
}));

type Row = Record<string, any>;
const E = process['env'];

dbDescribe('shop quotes', () => {
  const prisma = client();
  const counters = new Map<string, number>();
  const deps: ShopDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: {
      incr: async (k: string) => {
        counters.set(k, (counters.get(k) ?? 0) + 1);
        return counters.get(k)!;
      },
      expire: async () => 1,
    } as never,
  };
  let n = 0;
  const tag = () => `${Date.now().toString(36)}q${n++}`;
  const buyer = () => ({ identity: `agent:${tag()}` });
  const PLATFORM = '0xPLATFORMPAYTO';
  const PAYOUT = '0x00000000000000000000000000000000000b0b0b';

  beforeAll(() => migrate());
  afterAll(() => prisma.$disconnect());
  beforeEach(() => {
    Object.assign(E, {
      INTEGRATOR_FEE_ENABLED: 'true',
      INTEGRATOR_BASE_ORDERS_ENABLED: 'true',
      MPP_ENABLED: 'true',
      INTEGRATOR_TEST_SKU_DAILY_CAP: '3',
    });
    idemStore.clear();
  });

  async function activate(merchant_id: string, over = '') {
    for (const doc_id of ['merchant-agreement', 'aup', 'dpa', 'refund-framework']) {
      const have = await prisma.$queryRawUnsafe<unknown[]>(
        `SELECT 1 FROM shop_legal_docs WHERE doc_id = $1`,
        doc_id,
      );
      if (have.length === 0) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO shop_legal_docs (doc_id, version, sha256, url, effective_from, body_md)
           VALUES ($1, 'int07', $2, $3, now() - interval '1 day', 'b')`,
          doc_id,
          doc_id.padEnd(64, '0'),
          `/legal/${doc_id}`,
        );
      }
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_acceptances (merchant_id, doc_id, version, sha256, method, signer, signature, message)
       SELECT DISTINCT ON (doc_id) $1::uuid, doc_id, version, sha256, 'wallet_signature', 's', 'sig', 'm'
         FROM shop_legal_docs WHERE doc_id IN ('merchant-agreement','aup','dpa','refund-framework')
        ORDER BY doc_id, effective_from DESC`,
      merchant_id,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE shop_merchants SET status = 'active', payout_wallet_base = $2 ${over}
        WHERE merchant_id = $1::uuid`,
      merchant_id,
      PAYOUT,
    );
  }
  const shop = async (over = '') => {
    const id = await mkMerchant(prisma, tag());
    await activate(id, over);
    return id;
  };
  const OLD = `, created_at = now() - interval '90 days'`;
  async function product(
    merchant_id: string,
    o: { sku?: string; price?: number; stock?: number | null; test?: boolean; cat?: string } = {},
  ) {
    const sku = o.sku ?? `sku-${tag()}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_products (merchant_id, sku, title, price_usd, available, is_test, category, fulfillment_mode)
       VALUES ($1::uuid, $2, 'Thing', $3::numeric, $4::int, $5, $6, 'instant')`,
      merchant_id,
      sku,
      o.price ?? 10,
      o.stock === undefined ? null : o.stock,
      o.test ?? false,
      o.cat ?? 'books',
    );
    return sku;
  }
  const q = (id: string, items: Array<{ sku: string; qty?: number }>, b = buyer()) =>
    createQuote(deps, id, b, { items: items.map((i) => ({ sku: i.sku, qty: i.qty ?? 1 })) });
  const fail = async (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e) => e,
    );
  const row = async (sql: string, ...v: unknown[]) =>
    (await prisma.$queryRawUnsafe<Row[]>(sql, ...v))[0];
  const fee = async (quote_id: string) =>
    (await row(`SELECT fee_usd::float8 AS f FROM shop_quotes WHERE quote_id = $1::uuid`, quote_id))
      .f;
  const reserved = async (m: string, sku: string) =>
    (
      await row(
        `SELECT reserved FROM shop_products WHERE merchant_id = $1::uuid AND sku = $2`,
        m,
        sku,
      )
    ).reserved;

  it('QT1: $89 -> total 89, fee 1.34 (0 when off); $3 -> 0.05; pay block', async () => {
    const m = await shop();
    const sku = await product(m, { price: 89 });
    const r = await q(m, [{ sku }]);
    expect(r.total_usd).toBe(89);
    expect(await fee(r.quote_id)).toBe(1.34);
    expect(r.pay.x402?.payTo).toBe(PAYOUT);
    expect(r.pay.x402?.payTo).not.toBe(PLATFORM);
    expect(r.pay.x402?.amount).toBe(toMicroUsdc(89));
    expect(r.pay.x402?.extra.quote_id).toBe(r.quote_id);
    expect(r.pay.mpp?.url.endsWith(`/api/v1/shop/quotes/${r.quote_id}/pay`)).toBe(true);
    expect(forMcp(r).pay.mpp).toBeUndefined();

    E.INTEGRATOR_FEE_ENABLED = 'false';
    expect(await fee((await q(m, [{ sku }])).quote_id)).toBe(0);

    E.INTEGRATOR_FEE_ENABLED = 'true';
    const cheap = await product(m, { price: 3 });
    expect(await fee((await q(m, [{ sku: cheap }])).quote_id)).toBe(0.05);
    expect(computeFeeCents(8900, false)).toBe(134);

    E.INTEGRATOR_BASE_ORDERS_ENABLED = 'false';
    const r4 = await q(m, [{ sku }]);
    expect('x402' in r4.pay).toBe(false);
  });

  it('QT2: $0.99 -> 422; test SKU alone ok (fee 0, is_test); mixed -> 422', async () => {
    const m = await shop();
    const cheap = await product(m, { price: 0.99 });
    const e = await fail(q(m, [{ sku: cheap }]));
    expect(e).toBeInstanceOf(QuoteError);
    expect(e.status).toBe(422);
    const t = await product(m, { sku: '__apibase_test', price: 0.01, test: true });
    const r = await q(m, [{ sku: t }]);
    expect(r.total_usd).toBe(0.01);
    const s = await row(`SELECT is_test FROM shop_quotes WHERE quote_id = $1::uuid`, r.quote_id);
    expect(s.is_test).toBe(true);
    expect(await fee(r.quote_id)).toBe(0);
    const ok = await product(m, { price: 5 });
    expect((await fail(q(m, [{ sku: t }, { sku: ok }]))).status).toBe(422);
    expect((await fail(q(m, [{ sku: t, qty: 2 }]))).status).toBe(422);
  });

  it('QT3: 3 PAID test orders in 24h -> 4th test quote 429; 25h ago does not count', async () => {
    const m = await shop();
    const t = await product(m, { sku: '__apibase_test', price: 0.01, test: true });
    const paid = async (ago: string) => {
      const qq = await row(
        `INSERT INTO shop_quotes (merchant_id, items, subtotal, total_usd, is_test, expires_at, status)
         VALUES ($1::uuid, '[]'::jsonb, 0.01, 0.01, true, now() + interval '1 hour', 'paid') RETURNING quote_id`,
        m,
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO shop_orders (quote_id, merchant_id, state, total_usd, created_at, settled_at)
         VALUES ($1::uuid, $2::uuid, 'PAID', 0.01, now() - $3::interval, now() - $3::interval)`,
        qq.quote_id,
        m,
        ago,
      );
    };
    await paid('25 hours');
    await paid('2 hours');
    await paid('3 hours');
    expect(await countPaidTestOrders24h(prisma as never, m)).toBe(2);
    expect((await q(m, [{ sku: t }])).total_usd).toBe(0.01);
    await paid('1 hour');
    expect(await countPaidTestOrders24h(prisma as never, m)).toBe(3);
    const e = await fail(q(m, [{ sku: t }]));
    expect(e).toBeInstanceOf(QuoteError);
    expect([e.status, e.error_code]).toEqual([429, 'test_sku_daily_cap']);
  });

  it('QT4: stock=1, two parallel quotes -> one 200, one 409 out_of_stock + alternatives', async () => {
    const m = await shop(OLD);
    const sku = await product(m, { stock: 1, cat: 'games' });
    await product(m, { cat: 'games' });
    const res = await Promise.allSettled([q(m, [{ sku }]), q(m, [{ sku }])]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rej = res.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rej.reason.status).toBe(409);
    expect(rej.reason.error_code).toBe('out_of_stock');
    expect(rej.reason.extra.alternatives.length).toBeGreaterThanOrEqual(1);
    expect(await reserved(m, sku)).toBe(1);
    const c = await row(
      `SELECT count(*)::int AS c FROM shop_quotes WHERE merchant_id = $1::uuid`,
      m,
    );
    expect(c.c).toBe(1);
  });

  it('QT5: expired quote -> getQuote 410 quote_expired with a new quote; old hold released', async () => {
    const m = await shop();
    const sku = await product(m, { stock: 1 });
    const r = await q(m, [{ sku }]);
    await prisma.$executeRawUnsafe(
      `UPDATE shop_quotes SET expires_at = now() - interval '1 minute' WHERE quote_id = $1::uuid`,
      r.quote_id,
    );
    const e = await fail(getQuote(deps, r.quote_id));
    expect(e).toBeInstanceOf(QuoteError);
    expect([e.status, e.error_code]).toEqual([410, 'quote_expired']);
    expect(e.extra.quote.quote_id).not.toBe(r.quote_id);
    const old = await row(
      `SELECT count(*)::int AS c FROM shop_inventory_reservations WHERE quote_id = $1::uuid`,
      r.quote_id,
    );
    expect(old.c).toBe(0);
    expect(
      (await row(`SELECT status FROM shop_quotes WHERE quote_id = $1::uuid`, r.quote_id)).status,
    ).toBe('expired');
    expect(
      (await row(`SELECT state FROM shop_orders WHERE order_id = $1::uuid`, r.order_id)).state,
    ).toBe('EXPIRED');
    expect(await reserved(m, sku)).toBe(1); // only the new quote holds the unit
    expect((await getQuote(deps, e.extra.quote.quote_id)).quote_id).toBe(e.extra.quote.quote_id);
  });

  it('QT6: pending merchant -> 428; deactivated -> 410', async () => {
    const pending = await mkMerchant(prisma, tag());
    const sku = await product(pending);
    const e = await fail(q(pending, [{ sku }]));
    expect(e).toBeInstanceOf(ShopGateError);
    expect([e.status, e.error_code]).toEqual([428, 'terms_not_accepted']);
    const m = await shop();
    const sku2 = await product(m);
    await prisma.$executeRawUnsafe(
      `UPDATE shop_merchants SET status = 'deactivated', status_reason = 'self' WHERE merchant_id = $1::uuid`,
      m,
    );
    expect((await fail(q(m, [{ sku: sku2 }]))).status).toBe(410);
  });

  it('QT7: cancel in QUOTED -> CANCELLED, quote cancelled, reserved 0, event QUOTED -> CANCELLED', async () => {
    const m = await shop();
    const sku = await product(m, { stock: 2 });
    const b = buyer();
    const r = await q(m, [{ sku }], b);
    expect(await reserved(m, sku)).toBe(1);
    expect((await fail(cancelOrder(deps, buyer(), r.order_id, 'x'))).status).toBe(404);
    expect(await cancelOrder(deps, b, r.order_id, 'changed my mind')).toEqual({
      order_id: r.order_id,
      state: 'CANCELLED',
    });
    expect(
      (await row(`SELECT status FROM shop_quotes WHERE quote_id = $1::uuid`, r.quote_id)).status,
    ).toBe('cancelled');
    expect(await reserved(m, sku)).toBe(0);
    const ev = await row(
      `SELECT from_state, to_state, reason FROM shop_order_events WHERE order_id = $1::uuid AND seq = 2`,
      r.order_id,
    );
    expect(ev).toMatchObject({
      from_state: 'QUOTED',
      to_state: 'CANCELLED',
      reason: 'changed my mind',
    });
    // after PAID the free cancel is closed
    const paid = await q(m, [{ sku }], b);
    await prisma.$executeRawUnsafe(
      `UPDATE shop_orders SET state = 'PAID' WHERE order_id = $1::uuid`,
      paid.order_id,
    );
    expect((await fail(cancelOrder(deps, b, paid.order_id, 'x'))).error_code).toBe(
      'not_cancellable',
    );
  });

  it('QT8: human confirmation above the limit; new merchant $250 -> 422 at cap 200', async () => {
    const m = await shop(
      `, created_at = now() - interval '90 days', limits = '{"human_confirm_above_usd": 50}'::jsonb`,
    );
    const big = await product(m, { price: 89 });
    const small = await product(m, { price: 20 });
    expect((await q(m, [{ sku: big }])).requires_human_confirmation).toBe(true);
    expect((await q(m, [{ sku: small }])).requires_human_confirmation).toBe(false);
    const nm = await shop();
    const huge = await product(nm, { price: 250 });
    const e = await fail(q(nm, [{ sku: huge }]));
    expect([e.status, e.error_code]).toEqual([422, 'new_merchant_cap']);
    await prisma.$executeRawUnsafe(
      `UPDATE shop_merchants SET reputation = '{"orders_closed": 10}'::jsonb WHERE merchant_id = $1::uuid`,
      nm,
    );
    expect((await q(nm, [{ sku: huge }])).total_usd).toBe(250);
  });

  it('QT9: the 31st quote within a minute from one identity -> 429', async () => {
    const m = await shop(OLD);
    const sku = await product(m, { price: 5 });
    const b = buyer();
    for (let i = 0; i < 30; i++) await q(m, [{ sku }], b);
    const e = await fail(q(m, [{ sku }], b));
    expect([e.status, e.error_code]).toEqual([429, 'rate_limited']);
    expect((await q(m, [{ sku }], buyer())).total_usd).toBe(5);
  }, 60_000);

  describe('REST', () => {
    let server: Server;
    let base: string;
    beforeAll(async () => {
      const app = express();
      app.use(express.json());
      app.use(createOrderRouter(deps));
      server = app.listen(0, '127.0.0.1');
      await new Promise((r) => server.once('listening', r));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(() => server.close());
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
      fetch(base + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    const slugOf = async (m: string) =>
      (await row(`SELECT slug FROM shop_merchants WHERE merchant_id = $1::uuid`, m)).slug;

    it('QT10: X-Idempotency-Key replay -> same quote_id, one reservation', async () => {
      const m = await shop();
      const sku = await product(m, { stock: 5 });
      const body = { merchant: await slugOf(m), items: [{ sku, qty: 1 }] };
      const a = await post('/api/v1/shop/quotes', body, { 'x-idempotency-key': 'k1' });
      const b = await post('/api/v1/shop/quotes', body, { 'x-idempotency-key': 'k1' });
      expect(a.status).toBe(201);
      const [ja, jb] = [await a.json(), await b.json()];
      expect(jb.quote_id).toBe(ja.quote_id);
      expect(await reserved(m, sku)).toBe(1);
      const got = await fetch(`${base}/api/v1/shop/quotes/${ja.quote_id}`);
      expect((await got.json()).quote_id).toBe(ja.quote_id);
      const c = await post(`/api/v1/shop/orders/${ja.order_id}/cancel`, { reason: 'bye' });
      expect((await c.json()).state).toBe('CANCELLED');
    });

    it('QT11: merchant A with the sku of merchant B -> 404', async () => {
      const a = await shop();
      const b = await shop();
      const skuB = await product(b);
      const r = await post('/api/v1/shop/quotes', {
        merchant: await slugOf(a),
        items: [{ sku: skuB, qty: 1 }],
      });
      expect(r.status).toBe(404);
    });
  });

  it('QT12: QUOTED order row + one event; fee_disclosed false', async () => {
    const m = await shop();
    const sku = await product(m);
    const r = await q(m, [{ sku }]);
    expect(r.fee_disclosed).toBe(false);
    expect('fee_usd' in r).toBe(false);
    expect(
      (await row(`SELECT state FROM shop_orders WHERE order_id = $1::uuid`, r.order_id)).state,
    ).toBe('QUOTED');
    const ev = await row(
      `SELECT count(*)::int AS c FROM shop_order_events WHERE order_id = $1::uuid`,
      r.order_id,
    );
    expect(ev.c).toBe(1);
  });
});
