/**
 * T-INT-22 PH1-PH6: physical orders (shipping option, delivery slot hold, shipping_address
 * envelope, ship -> deliver -> close, SLA events) against a real Postgres (TEST_DATABASE_URL,
 * disposable). Orders are placed in the wanted state with SQL; everything else is the real service.
 */
import { runShopSlaSweeper } from '../../src/jobs/shop-sla-sweeper.job';
import { confirmMerchantOrder, shipMerchantOrder } from '../../src/shop/order-lifecycle.service';
import { getOrderView } from '../../src/shop/order-payment.service';
import { checkPiiForPay } from '../../src/shop/pii/pii.service';
import { createQuote } from '../../src/shop/quote.service';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { client, dbDescribe, migrate, mkMerchant } from './helpers/shop-db';

jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/moderation-ban.service', () => ({
  checkBan: jest.fn(async () => ({ banned: false, retryAfterSecs: 0 })),
}));

type Row = Record<string, any>;
const H = 3_600_000;
const D = 24 * H;
const PAYER = '0x00000000000000000000000000000000000a11ce';
const OPTIONS = [
  { id: 'std', label: 'Standard', price_usd: '4.50', regions: ['US'] },
  { id: 'exp', label: 'Express', price_usd: '12.00' },
];
const SLOTS = [
  { id: 'mon', label: 'Monday morning' },
  { id: 'tue', label: 'Tuesday morning' },
  { id: 'wed', label: 'Wednesday morning' },
];

dbDescribe('physical orders', () => {
  const prisma = client();
  const deps: ShopDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: { incr: async () => 1, expire: async () => 1 } as never,
  };
  let n = 0;
  const tag = () => `${Date.now().toString(36)}p${n++}`;
  const q = (sql: string, ...v: unknown[]) => prisma.$queryRawUnsafe<Row[]>(sql, ...v);
  const x = (sql: string, ...v: unknown[]) => prisma.$executeRawUnsafe(sql, ...v);
  const buyer = () => ({ identity: `agent:${tag()}` });

  beforeAll(() => migrate());
  afterAll(() => prisma.$disconnect());

  async function merchant(policy: object = {}) {
    const m = await mkMerchant(prisma, tag());
    for (const doc_id of ['merchant-agreement', 'aup', 'dpa', 'refund-framework']) {
      const have = await q(`SELECT 1 FROM shop_legal_docs WHERE doc_id = $1`, doc_id);
      if (have.length === 0) {
        await x(
          `INSERT INTO shop_legal_docs (doc_id, version, sha256, url, effective_from, body_md)
           VALUES ($1, 'ph', $2, $3, now() - interval '1 day', 'b')`,
          doc_id,
          doc_id.padEnd(64, '0'),
          `/legal/${doc_id}`,
        );
      }
    }
    await x(
      `INSERT INTO shop_acceptances (merchant_id, doc_id, version, sha256, method, signer, signature, message)
       SELECT DISTINCT ON (doc_id) $1::uuid, doc_id, version, sha256, 'wallet_signature', 's', 'sig', 'm'
         FROM shop_legal_docs WHERE doc_id IN ('merchant-agreement','aup','dpa','refund-framework')
        ORDER BY doc_id, effective_from DESC`,
      m,
    );
    await x(
      `UPDATE shop_merchants SET status = 'active', policy = $2::jsonb, created_at = now() - interval '90 days'
        WHERE merchant_id = $1::uuid`,
      m,
      JSON.stringify(policy),
    );
    return m;
  }
  async function product(m: string, o: { slots?: boolean; mode?: string; days?: number } = {}) {
    const sku = `sku-${tag()}`;
    await x(
      `INSERT INTO shop_products (merchant_id, sku, title, price_usd, available, category,
          fulfillment_mode, shipping_options, delivery_slots, refund_window_days, returns_accepted)
       VALUES ($1::uuid, $2, 'Lamp', 20, 50, 'home', $3, $4::jsonb, $5::jsonb, $6::int, true)`,
      m,
      sku,
      o.mode ?? 'physical',
      JSON.stringify(OPTIONS),
      JSON.stringify(o.slots ? SLOTS : []),
      o.days ?? 14,
    );
    return sku;
  }
  const quote = (m: string, sku: string, extra: Record<string, unknown> = {}, b = buyer()) =>
    createQuote(deps, m, b, { items: [{ sku, qty: 1 }], ...extra });
  const fail = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e) => e as Row,
    );
  /** A paid order of `sku` placed straight in `state` (SQL); returns its id. */
  async function order(m: string, sku: string, state: string, cols: Row = {}) {
    const quote_id = (
      await q(
        `INSERT INTO shop_quotes (merchant_id, buyer_identity, items, subtotal, total_usd, expires_at, status)
         VALUES ($1::uuid, 'agent:ph', $2::jsonb, 20, 20, now() + interval '10 minutes', 'paid')
         RETURNING quote_id`,
        m,
        JSON.stringify([{ sku, qty: 1 }]),
      )
    )[0].quote_id;
    return (
      await q(
        `INSERT INTO shop_orders (quote_id, merchant_id, state, total_usd, payer_wallet, settled_at,
                                  ship_due_at, delivery_eta, close_after)
         VALUES ($1::uuid, $2::uuid, $3, 20, $4, now() - interval '1 day',
                 $5::timestamptz, $6::timestamptz, $7::timestamptz)
         RETURNING order_id`,
        quote_id,
        m,
        state,
        PAYER,
        cols.ship_due_at ?? null,
        cols.delivery_eta ?? null,
        cols.close_after ?? null,
      )
    )[0].order_id as string;
  }
  const row = async (id: string) =>
    (await q(`SELECT * FROM shop_orders WHERE order_id = $1::uuid`, id))[0];
  const events = (id: string) =>
    q(
      `SELECT to_state, reason, actor FROM shop_order_events WHERE order_id = $1::uuid ORDER BY seq`,
      id,
    );
  const outbox = async (type: string, id: string) =>
    Number(
      (
        await q(
          `SELECT count(*)::int AS c FROM outbox WHERE event_type = $1 AND payload->>'order_id' = $2`,
          type,
          id,
        )
      )[0].c,
    );
  const iso = (ms: number) => new Date(ms).toISOString();

  it('PH1: physical quote needs a catalog shipping_option; the price lands in shipping and total', async () => {
    const m = await merchant();
    const sku = await product(m);
    const none = await fail(quote(m, sku));
    expect(none?.status).toBe(422);
    expect(none?.message).toMatch(/shipping_option is required/);
    const unknown = await fail(quote(m, sku, { shipping_option: 'drone' }));
    expect(unknown?.status).toBe(422);

    const r = await quote(m, sku, { shipping_option: 'std' });
    expect(r.total_usd).toBe(24.5);
    expect(r.shipping_usd).toBe(4.5);
    expect(r.shipping_option).toBe('std');
    expect(r.requires_pii).toContain('shipping_address');
    const saved = (
      await q(
        `SELECT shipping::float8 AS s, subtotal::float8 AS sub, total_usd::float8 AS t, shipping_option
           FROM shop_quotes WHERE quote_id = $1::uuid`,
        r.quote_id,
      )
    )[0];
    expect(saved).toMatchObject({ s: 4.5, sub: 20, t: 24.5, shipping_option: 'std' });

    const digital = await product(m, { mode: 'merchant' });
    const bad = await fail(quote(m, digital, { shipping_option: 'std' }));
    expect(bad?.status).toBe(422);
  });

  it('PH2: two quotes for one slot -> one 200, one 409 with free alternatives; expiry frees it', async () => {
    const m = await merchant();
    const sku = await product(m, { slots: true });
    const missing = await fail(quote(m, sku, { shipping_option: 'std' }));
    expect(missing?.status).toBe(422);

    const first = await quote(m, sku, { shipping_option: 'std', delivery_slot: 'mon' });
    expect(first.delivery_slot).toBe('mon');
    const second = await fail(quote(m, sku, { shipping_option: 'std', delivery_slot: 'mon' }));
    expect(second?.status).toBe(409);
    expect(second?.error_code).toBe('slot_unavailable');
    expect(second?.extra?.alternatives ?? second?.alternatives).toEqual([SLOTS[1], SLOTS[2]]);
    // the 409 left nothing behind: no quote, no order, no hold from the loser
    expect(
      Number(
        (
          await q(
            `SELECT count(*)::int AS c FROM shop_inventory_reservations WHERE product_id =
           (SELECT product_id FROM shop_products WHERE merchant_id = $1::uuid AND sku = $2) AND kind = 'slot'`,
            m,
            sku,
          )
        )[0].c,
      ),
    ).toBe(1);

    // the first quote's TTL passes (before any sweeper run): the slot is free again
    await x(
      `UPDATE shop_quotes SET expires_at = now() - interval '1 second' WHERE quote_id = $1::uuid`,
      first.quote_id,
    );
    await x(
      `UPDATE shop_inventory_reservations SET expires_at = now() - interval '1 second' WHERE quote_id = $1::uuid`,
      first.quote_id,
    );
    const again = await quote(m, sku, { shipping_option: 'std', delivery_slot: 'mon' });
    expect(again.delivery_slot).toBe('mon');
  });

  it('PH3: pay without the shipping_address envelope -> 422 pii_required', async () => {
    const m = await merchant();
    const sku = await product(m);
    const r = await quote(m, sku, { shipping_option: 'exp' });
    expect(r.requires_pii).toEqual(['shipping_address']);
    const [{ requires_pii }] = await q(
      `SELECT requires_pii FROM shop_quotes WHERE quote_id = $1::uuid`,
      r.quote_id,
    );
    const refusal = await checkPiiForPay(
      prisma as never,
      { merchant_id: m, requires_pii },
      new Map(),
      true,
    );
    expect(refusal).toMatchObject({ code: 422, error: 'pii_required' });
    expect(refusal?.extra.required).toEqual(['shipping_address']);
  });

  it('PH4: order_confirm sets ship_due_at; order_ship -> SHIPPED, tracking and eta in order.get', async () => {
    const m = await merchant({ ship_sla_h: 24 });
    const sku = await product(m);
    const id = await order(m, sku, 'PAID');
    // PAID cannot ship
    expect((await fail(shipMerchantOrder(deps, m, id, {})))?.error_code).toBe('not_shippable');
    await confirmMerchantOrder(deps, m, id);
    const c = await row(id);
    expect(c.state).toBe('CONFIRMED');
    expect(new Date(c.ship_due_at).getTime() - Date.now()).toBeGreaterThan(23 * H);
    expect(new Date(c.ship_due_at).getTime() - Date.now()).toBeLessThan(25 * H);

    expect(
      (await fail(shipMerchantOrder(deps, m, id, { delivery_eta: iso(Date.now() + 3 * D) })))
        ?.status,
    ).toBe(422);
    const eta = iso(Date.now() + 3 * D);
    const s = await shipMerchantOrder(deps, m, id, {
      tracking: { carrier: 'DHL', number: 'JD014600', url: 'https://track.example/JD014600' },
      delivery_eta: eta,
    });
    expect(s.state).toBe('SHIPPED');
    const after = await row(id);
    expect(after.ship_due_at).toBeNull();
    const view = await getOrderView(prisma as never, id, 'wallet:none');
    expect(view.state).toBe('SHIPPED');
    expect(view.tracking).toEqual({
      carrier: 'DHL',
      number: 'JD014600',
      url: 'https://track.example/JD014600',
    });
    expect(new Date(view.delivery_eta as Date).toISOString()).toBe(eta);
    expect((await events(id)).map((e) => e.to_state)).toEqual(['CONFIRMED', 'SHIPPED']);
    expect(await outbox('shop.order.shipped', id)).toBe(1);

    // repeating is a no-op; delivered_at -> DELIVERED, refund window starts
    expect((await shipMerchantOrder(deps, m, id, {})).state).toBe('SHIPPED');
    const d = await shipMerchantOrder(deps, m, id, { delivered_at: iso(Date.now()) });
    expect(d.state).toBe('DELIVERED');
    const done = await row(id);
    expect(new Date(done.close_after).getTime() - Date.now()).toBeGreaterThan(13 * D);
    expect(await outbox('shop.order.delivered', id)).toBe(1);

    // another merchant's order is 404; a digital order cannot be shipped
    const other = await merchant();
    expect((await fail(shipMerchantOrder(deps, other, id, {})))?.status).toBe(404);
    const dsku = await product(m, { mode: 'merchant' });
    const did = await order(m, dsku, 'CONFIRMED');
    expect((await fail(shipMerchantOrder(deps, m, did, {})))?.error_code).toBe('not_shippable');
  });

  it('PH5: sweeper: SHIPPED with eta 8 days ago -> DELIVERED; close_after passed -> CLOSED', async () => {
    const m = await merchant();
    const sku = await product(m, { days: 10 });
    const late = await order(m, sku, 'SHIPPED', { delivery_eta: iso(Date.now() - 8 * D) });
    const fresh = await order(m, sku, 'SHIPPED', { delivery_eta: iso(Date.now() - 2 * D) });
    const due = await order(m, sku, 'DELIVERED', { close_after: iso(Date.now() - H) });
    const r = await runShopSlaSweeper(deps, Date.now());
    expect(r.orders_delivered).toBeGreaterThanOrEqual(1);
    const l = await row(late);
    expect(l.state).toBe('DELIVERED');
    expect(new Date(l.close_after).getTime() - Date.now()).toBeGreaterThan(9 * D);
    expect((await events(late)).map((e) => [e.to_state, e.reason, e.actor])).toEqual([
      ['DELIVERED', 'auto_delivered', 'system'],
    ]);
    expect((await row(fresh)).state).toBe('SHIPPED');
    expect((await row(due)).state).toBe('CLOSED');
    // a rerun changes nothing
    await runShopSlaSweeper(deps, Date.now());
    expect((await events(late)).length).toBe(1);
  });

  it('PH6: ship_due_at passed without SHIPPED -> one shop.order.ship_overdue', async () => {
    const m = await merchant();
    const sku = await product(m);
    const id = await order(m, sku, 'CONFIRMED', { ship_due_at: iso(Date.now() - H) });
    const ok = await order(m, sku, 'CONFIRMED', { ship_due_at: iso(Date.now() + H) });
    await runShopSlaSweeper(deps, Date.now());
    await runShopSlaSweeper(deps, Date.now() + 10 * 60_000);
    expect(await outbox('shop.order.ship_overdue', id)).toBe(1);
    expect(await outbox('shop.order.ship_overdue', ok)).toBe(0);
    expect((await events(id)).filter((e) => e.reason === 'ship_overdue').length).toBe(1);
    expect((await row(id)).state).toBe('CONFIRMED');
  });
});
