/**
 * T-INT-12 LC1-LC11: order.get / order.cancel after PAID, the merchant order tools and the
 * `shop-sla-sweeper` job, against a real Postgres (TEST_DATABASE_URL, disposable). No chain, no
 * facilitator: orders are placed in the wanted state with SQL, everything else is the real service.
 */
import { createHash, randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { runShopSlaSweeper } from '../../src/jobs/shop-sla-sweeper.job';
import { issueKey } from '../../src/shop/auth/merchant-key.service';
import { transition } from '../../src/shop/order-state';
import { confirmPayment, getOrderView } from '../../src/shop/order-payment.service';
import { cancelOrder, createQuote } from '../../src/shop/quote.service';
import { registerMerchantTools } from '../../src/shop/tools/merchant.tools';
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
const PAYER = '0x00000000000000000000000000000000000a11ce';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const H = 3_600_000;

dbDescribe('order lifecycle, merchant order tools, SLA sweeper', () => {
  const prisma = client();
  const deps: ShopDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: { incr: async () => 1, expire: async () => 1 } as never,
  };
  let n = 0;
  const tag = () => `${Date.now().toString(36)}l${n++}`;
  const q = (sql: string, ...v: unknown[]) => prisma.$queryRawUnsafe<Row[]>(sql, ...v);
  const x = (sql: string, ...v: unknown[]) => prisma.$executeRawUnsafe(sql, ...v);
  const outbox = async (type: string, key: string, id: string) =>
    Number(
      (
        await q(
          `SELECT count(*)::int AS c FROM outbox WHERE event_type = $1 AND payload->>'${key}' = $2`,
          type,
          id,
        )
      )[0].c,
    );
  const overdueEvents = (id: string) => outbox('shop.order.confirm_overdue', 'order_id', id);
  const past = (hours: number) => new Date(Date.now() - hours * H).toISOString();

  beforeAll(() => migrate());
  afterAll(() => prisma.$disconnect());

  async function merchant(policy: object = {}) {
    const m = await mkMerchant(prisma, tag());
    await x(
      `UPDATE shop_merchants SET status = 'active', policy = $2::jsonb WHERE merchant_id = $1::uuid`,
      m,
      JSON.stringify(policy),
    );
    return m;
  }
  async function product(
    m: string,
    o: { returns?: boolean; days?: number | null; mode?: string } = {},
  ) {
    const sku = `sku-${tag()}`;
    await x(
      `INSERT INTO shop_products (merchant_id, sku, title, price_usd, available, category,
                                  fulfillment_mode, returns_accepted, refund_window_days)
       VALUES ($1::uuid, $2, 'T', 5, 10, 'books', $5, $3, $4::int)`,
      m,
      sku,
      o.returns ?? false,
      o.days === undefined ? 14 : o.days,
      o.mode ?? 'merchant',
    );
    return sku;
  }
  /** An order in `state`, paid by agent `buyer` (items: one SKU of the merchant). */
  async function order(
    m: string,
    state: string,
    o: {
      sku?: string;
      buyer?: string;
      waive?: boolean;
      confirmDue?: string;
      closeAfter?: string;
      settledAgo?: string;
    } = {},
  ) {
    const sku = o.sku ?? (await product(m));
    const quote = (
      await q(
        `INSERT INTO shop_quotes (merchant_id, buyer_identity, items, subtotal, total_usd, expires_at,
                                  status, waive_withdrawal)
         VALUES ($1::uuid, $2, $3::jsonb, 5, 5, now() + interval '10 minutes', 'paid', $4)
         RETURNING quote_id`,
        m,
        o.buyer ?? 'agent:none',
        JSON.stringify([{ sku, qty: 1 }]),
        o.waive ?? false,
      )
    )[0].quote_id;
    return (
      await q(
        `INSERT INTO shop_orders (quote_id, merchant_id, state, total_usd, payer_wallet, settled_at,
                                  confirm_due_at, close_after)
         VALUES ($1::uuid, $2::uuid, $3, 5, $4, now() - $5::interval, $6::timestamptz, $7::timestamptz)
         RETURNING order_id`,
        quote,
        m,
        state,
        PAYER,
        o.settledAgo ?? '1 hour',
        o.confirmDue ?? null,
        o.closeAfter ?? null,
      )
    )[0].order_id as string;
  }
  const state = async (id: string) =>
    (await q(`SELECT state FROM shop_orders WHERE order_id = $1::uuid`, id))[0].state;
  const reasonOf = async (m: string) =>
    (await q(`SELECT status_reason FROM shop_merchants WHERE merchant_id = $1::uuid`, m))[0]
      .status_reason;

  async function connect(apiKey: string) {
    const server = new McpServer({ name: 't', version: '0' });
    registerMerchantTools(server, apiKey, 'req-1', deps);
    const c = new Client({ name: 'c', version: '0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), c.connect(b)]);
    return async (name: string, args: Row = {}) => {
      const r: any = await c.callTool({ name, arguments: args });
      return { isError: !!r.isError, body: JSON.parse(r.content[0].text) };
    };
  }
  const keyOf = (m: string, scopes?: string[]) => deps.transaction((tx) => issueKey(tx, m, scopes));

  it('LC1: merchant A cannot confirm or list merchant B orders (404, not listed)', async () => {
    const a = await merchant();
    const b = await merchant();
    const oa = await order(a, 'PAID', { confirmDue: past(-40) });
    const ob = await order(b, 'PAID');
    const call = await connect(await keyOf(a));
    const bad = await call('shop.merchant.order_confirm', { order_id: ob });
    expect(bad.isError).toBe(true);
    expect(bad.body.error_code).toBe('not_found');
    expect(await state(ob)).toBe('PAID');
    const ids = (await call('shop.merchant.orders_list', {})).body.orders.map(
      (o: Row) => o.order_id,
    );
    expect(ids).toContain(oa);
    expect(ids).not.toContain(ob);
    expect((await call('shop.merchant.order_confirm', { order_id: oa })).body.state).toBe(
      'CONFIRMED',
    );
    expect((await call('shop.merchant.order_confirm', { order_id: oa })).body.state).toBe(
      'CONFIRMED',
    );
    expect(
      (await q(`SELECT confirm_due_at FROM shop_orders WHERE order_id = $1::uuid`, oa))[0],
    ).toEqual({ confirm_due_at: null });
  });

  it('LC1b: state/since filters, keyset cursor, scopes', async () => {
    const a = await merchant();
    const ids = [await order(a, 'PAID'), await order(a, 'PAID'), await order(a, 'CONFIRMED')];
    const call = await connect(await keyOf(a));
    const p1 = await call('shop.merchant.orders_list', { limit: 2 });
    expect(p1.body.orders).toHaveLength(2);
    expect(p1.body.next_cursor).toBeTruthy();
    const p2 = await call('shop.merchant.orders_list', { limit: 2, cursor: p1.body.next_cursor });
    expect(p2.body.orders).toHaveLength(1);
    expect(p2.body.next_cursor).toBeNull();
    const all = [...p1.body.orders, ...p2.body.orders].map((o: Row) => o.order_id);
    expect(new Set(all)).toEqual(new Set(ids));
    const confirmed = await call('shop.merchant.orders_list', { state: 'CONFIRMED' });
    expect(confirmed.body.orders.map((o: Row) => o.order_id)).toEqual([ids[2]]);
    expect((await call('shop.merchant.orders_list', { state: 'NOPE' })).body.error_code).toBe(
      'validation_failed',
    );
    expect(
      (await call('shop.merchant.orders_list', { since: '2999-01-01T00:00:00Z' })).body.orders,
    ).toEqual([]);
    const readOnlyElsewhere = await connect(await keyOf(a, ['catalog:write']));
    expect((await readOnlyElsewhere('shop.merchant.orders_list', {})).body.error_code).toBe(
      'forbidden',
    );
  });

  it('LC2: PAID + 49 h -> one confirm_overdue; 5 min later none; 24 h later a second', async () => {
    const m = await merchant();
    const id = await order(m, 'PAID', { confirmDue: past(1) });
    const r1 = await runShopSlaSweeper(deps);
    expect(r1.confirm_overdue).toBeGreaterThanOrEqual(1);
    expect(await overdueEvents(id)).toBe(1);
    await runShopSlaSweeper(deps, Date.now() + 5 * 60_000);
    expect(await overdueEvents(id)).toBe(1);
    await runShopSlaSweeper(deps, Date.now() + 25 * H);
    expect(await overdueEvents(id)).toBe(2);
    const marks = await q(
      `SELECT payload->>'repeat' AS r FROM shop_order_events
        WHERE order_id = $1::uuid AND reason = 'confirm_overdue' ORDER BY seq`,
      id,
    );
    expect(marks.map((e) => e.r)).toEqual(['0', '1']);
    expect(await state(id)).toBe('PAID');
  });

  it('LC3: three late orders in a row -> unresponsive, quote 410 until cleared', async () => {
    const m = await merchant();
    await x(
      `UPDATE shop_merchants SET payout_wallet_base = '0x00000000000000000000000000000000000b0b0b',
              created_at = now() - interval '90 days' WHERE merchant_id = $1::uuid`,
      m,
    );
    for (const doc_id of ['merchant-agreement', 'aup', 'dpa', 'refund-framework']) {
      if ((await q(`SELECT 1 FROM shop_legal_docs WHERE doc_id = $1`, doc_id)).length === 0) {
        await x(
          `INSERT INTO shop_legal_docs (doc_id, version, sha256, url, effective_from, body_md)
           VALUES ($1, 'int12', $2, $3, now() - interval '1 day', 'b')`,
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
    const sku = await product(m);
    for (let i = 0; i < 3; i++) {
      await order(m, 'PAID', { sku, confirmDue: past(1), settledAgo: `${50 + i} hours` });
    }
    Object.assign(process.env, {
      INTEGRATOR_BASE_ORDERS_ENABLED: 'true',
      INTEGRATOR_FEE_ENABLED: 'false',
      INTEGRATOR_TEST_SKU_DAILY_CAP: '30',
      PUBLIC_BASE_URL: 'https://apibase.pro',
    });
    const quote = () => createQuote(deps, m, { identity: 'agent:q' }, { items: [{ sku, qty: 1 }] });
    await expect(quote()).resolves.toBeTruthy();
    await runShopSlaSweeper(deps);
    expect(await reasonOf(m)).toBe('unresponsive');
    await expect(quote()).rejects.toMatchObject({ status: 410 });
    await x(`UPDATE shop_merchants SET status_reason = NULL WHERE merchant_id = $1::uuid`, m);
    await expect(quote()).resolves.toBeTruthy();
  });

  it('LC3b: an on-time merchant confirm in between breaks the streak', async () => {
    const m = await merchant();
    await order(m, 'PAID', { confirmDue: past(1), settledAgo: '70 hours' });
    const on = await order(m, 'PAID', { settledAgo: '60 hours' });
    await deps.transaction((tx) => transition(tx, on, 'CONFIRMED', { actor: 'merchant' }));
    await order(m, 'PAID', { confirmDue: past(1), settledAgo: '50 hours' });
    await order(m, 'PAID', { confirmDue: past(1), settledAgo: '40 hours' });
    await runShopSlaSweeper(deps);
    expect(await reasonOf(m)).toBeNull();
  });

  it('LC4: close_after passed -> CLOSED; nothing leaves CLOSED', async () => {
    const m = await merchant();
    const id = await order(m, 'FULFILLED', { closeAfter: past(1) });
    const open = await order(m, 'FULFILLED', { closeAfter: past(-1) });
    await runShopSlaSweeper(deps);
    expect(await state(id)).toBe('CLOSED');
    expect(await state(open)).toBe('FULFILLED');
    expect(
      (await q(`SELECT actor, reason FROM shop_order_events WHERE order_id = $1::uuid`, id))[0],
    ).toEqual({ actor: 'system', reason: 'close_after' });
    for (const to of ['REFUND_PENDING', 'DISPUTED', 'PAID', 'CLOSED'] as const) {
      await expect(
        deps.transaction((tx) => transition(tx, id, to, { actor: 'system' })),
      ).rejects.toMatchObject({ code: 'TERMINAL' });
    }
  });

  describe('LC5 cancel after PAID', () => {
    const who = (identity: string) => ({ identity }) as never;
    it('PAID -> REFUND_PENDING + shop_refunds(buyer, requested, due +7d)', async () => {
      const m = await merchant();
      const b = `agent:${tag()}`;
      const id = await order(m, 'PAID', { buyer: b });
      const r = await cancelOrder(deps, who(b), id, 'changed my mind');
      expect(r.state).toBe('REFUND_PENDING');
      const refund = (await q(`SELECT * FROM shop_refunds WHERE order_id = $1::uuid`, id))[0];
      expect(refund).toMatchObject({ requested_by: 'buyer', status: 'requested' });
      expect(Number(refund.amount_usd)).toBe(5);
      const days = (new Date(refund.due_at).getTime() - Date.now()) / (24 * H);
      expect(days).toBeGreaterThan(6.9);
      expect(days).toBeLessThan(7.1);
      expect(await outbox('shop.refund.requested', 'order_id', id)).toBe(1);
      expect((await cancelOrder(deps, who(b), id, 'again')).refund_id).toBe(refund.refund_id);
      expect(await q(`SELECT 1 FROM shop_refunds WHERE order_id = $1::uuid`, id)).toHaveLength(1);
    });
    it('a stranger gets 404', async () => {
      const m = await merchant();
      const id = await order(m, 'PAID', { buyer: 'agent:owner' });
      await expect(cancelOrder(deps, who('agent:other'), id, 'x')).rejects.toMatchObject({
        status: 404,
      });
      expect(await state(id)).toBe('PAID');
    });
    it('FULFILLED with waive_withdrawal -> 409', async () => {
      const m = await merchant();
      const b = `agent:${tag()}`;
      const sku = await product(m, { returns: true });
      const id = await order(m, 'FULFILLED', { sku, buyer: b, waive: true });
      await expect(cancelOrder(deps, who(b), id, 'x')).rejects.toMatchObject({
        status: 409,
        error_code: 'not_cancellable',
      });
      expect(await state(id)).toBe('FULFILLED');
    });
    it('CONFIRMED: returns_accepted=false -> 409 with the policy; true -> REFUND_PENDING', async () => {
      const m = await merchant();
      const b = `agent:${tag()}`;
      const no = await order(m, 'CONFIRMED', { buyer: b, sku: await product(m) });
      await expect(cancelOrder(deps, who(b), no, 'x')).rejects.toMatchObject({
        status: 409,
        extra: { refund_policy: { returns_accepted: false } },
      });
      expect(await state(no)).toBe('CONFIRMED');
      const sku = await product(m, { returns: true });
      const yes = await order(m, 'CONFIRMED', { buyer: b, sku });
      expect((await cancelOrder(deps, who(b), yes, 'x')).state).toBe('REFUND_PENDING');
    });
    it('window passed -> 409', async () => {
      const m = await merchant();
      const b = `agent:${tag()}`;
      const sku = await product(m, { returns: true, days: 3 });
      const id = await order(m, 'DELIVERED', { buyer: b, sku, settledAgo: '10 days' });
      await expect(cancelOrder(deps, who(b), id, 'x')).rejects.toMatchObject({ status: 409 });
    });
  });

  it('LC6: order.get fulfillment/merchant_contact only for the payer, not in CLOSED', async () => {
    const m = await merchant();
    await x(
      `UPDATE shop_merchants SET contact_email = 'shop@m.example' WHERE merchant_id = $1::uuid`,
      m,
    );
    const b = `agent:${tag()}`;
    const id = await order(m, 'PAID', { buyer: b });
    await x(`UPDATE shop_orders SET fulfillment_payload_enc = NULL WHERE order_id = $1::uuid`, id);
    const stranger = await getOrderView(prisma as never, id, 'agent:stranger');
    expect(stranger).not.toHaveProperty('merchant_contact');
    expect(stranger).not.toHaveProperty('fulfillment');
    expect(stranger).not.toHaveProperty('documents');
    const mine = await getOrderView(prisma as never, id, b);
    expect(mine.merchant_contact).toEqual({
      email: 'shop@m.example',
      site_url: 'https://x.example',
    });
    expect(mine.tracking).toBeNull();
    expect(mine.refund_policy).toBeTruthy();
    expect(Array.isArray(mine.events)).toBe(true);
    const byWallet = await getOrderView(prisma as never, id, `wallet:${sha(PAYER.toLowerCase())}`);
    expect(byWallet.merchant_contact?.email).toBe('shop@m.example');
    await x(`UPDATE shop_orders SET state = 'CLOSED' WHERE order_id = $1::uuid`, id);
    expect(await getOrderView(prisma as never, id, b)).not.toHaveProperty('merchant_contact');
    await expect(getOrderView(prisma as never, randomUUID(), b)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('LC7: expired quote -> expired, reservation gone, available restored, order EXPIRED', async () => {
    const m = await merchant();
    const sku = await product(m);
    const qid = (
      await q(
        `INSERT INTO shop_quotes (merchant_id, items, subtotal, total_usd, expires_at, status)
         VALUES ($1::uuid, '[]'::jsonb, 1, 1, now() - interval '1 minute', 'open') RETURNING quote_id`,
        m,
      )
    )[0].quote_id;
    const pid = (await q(`SELECT product_id FROM shop_products WHERE sku = $1`, sku))[0].product_id;
    await x(`UPDATE shop_products SET reserved = 2 WHERE product_id = $1::uuid`, pid);
    await x(
      `INSERT INTO shop_inventory_reservations (merchant_id, product_id, qty, quote_id, expires_at)
       VALUES ($1::uuid, $2::uuid, 2, $3::uuid, now() - interval '1 minute')`,
      m,
      pid,
      qid,
    );
    const oid = (
      await q(
        `INSERT INTO shop_orders (quote_id, merchant_id, state, total_usd)
         VALUES ($1::uuid, $2::uuid, 'QUOTED', 1) RETURNING order_id`,
        qid,
        m,
      )
    )[0].order_id;
    await runShopSlaSweeper(deps);
    await runShopSlaSweeper(deps);
    const quote = await q(`SELECT status FROM shop_quotes WHERE quote_id = $1::uuid`, qid);
    expect(quote[0].status).toBe('expired');
    expect(await state(oid)).toBe('EXPIRED');
    expect(
      await q(`SELECT 1 FROM shop_inventory_reservations WHERE quote_id = $1::uuid`, qid),
    ).toHaveLength(0);
    const p = await q(
      `SELECT available, reserved FROM shop_products WHERE product_id = $1::uuid`,
      pid,
    );
    expect(p[0]).toEqual({ available: 10, reserved: 0 });
  });

  it('LC8: duplicate refund past due_at -> overdue and exactly one event', async () => {
    const m = await merchant();
    const id = await order(m, 'PAID', { buyer: 'agent:d' });
    const refund = async (reason: string, status: string, due: string) =>
      (
        await q(
          `INSERT INTO shop_refunds (order_id, amount_usd, reason, requested_by, status, due_at)
           VALUES ($1::uuid, 5, $2, 'system', $3, $4::timestamptz) RETURNING refund_id`,
          id,
          reason,
          status,
          due,
        )
      )[0].refund_id as string;
    const dup = await refund('duplicate', 'requested', past(1));
    const fresh = await refund('x', 'awaiting_merchant_tx', past(-1));
    await runShopSlaSweeper(deps);
    await runShopSlaSweeper(deps);
    const st = async (r: string) =>
      (await q(`SELECT status FROM shop_refunds WHERE refund_id = $1::uuid`, r))[0].status;
    expect(await st(dup)).toBe('overdue');
    expect(await st(fresh)).toBe('awaiting_merchant_tx');
    expect(await outbox('shop.refund.overdue', 'refund_id', dup)).toBe(1);
    expect(await outbox('shop.refund.overdue', 'refund_id', fresh)).toBe(0);
  });

  it('LC9: payout_pending applied after effective_at, not before', async () => {
    const m = await merchant();
    const NEW = '0x00000000000000000000000000000000000d0d0d';
    const OLD = '0x00000000000000000000000000000000000b0b0b';
    await x(
      `UPDATE shop_merchants SET payout_wallet_base = $2 WHERE merchant_id = $1::uuid`,
      m,
      OLD,
    );
    const set = (eff: string) =>
      x(
        `UPDATE shop_merchants SET payout_pending = $2::jsonb WHERE merchant_id = $1::uuid`,
        m,
        JSON.stringify({ wallet: NEW, rail: 'base', effective_at: eff }),
      );
    const row = async () =>
      (
        await q(
          `SELECT payout_wallet_base AS b, payout_pending AS p FROM shop_merchants WHERE merchant_id = $1::uuid`,
          m,
        )
      )[0];
    await set(past(-24));
    await runShopSlaSweeper(deps);
    expect((await row()).b).toBe(OLD);
    expect((await row()).p).not.toBeNull();
    await set(past(0.001));
    await runShopSlaSweeper(deps);
    expect(await row()).toEqual({ b: NEW, p: null });
  });

  it('LC10: connect_events older than 30 days are deleted, 29 days stay', async () => {
    const tagged = `lc10-${tag()}`;
    await x(
      `INSERT INTO shop_connect_events (path, at)
       VALUES ($1, now() - interval '31 days'), ($1, now() - interval '29 days')`,
      tagged,
    );
    await runShopSlaSweeper(deps);
    const left = await q(`SELECT at FROM shop_connect_events WHERE path = $1`, tagged);
    expect(left).toHaveLength(1);
    expect(Date.now() - new Date(left[0].at).getTime()).toBeLessThan(30 * 24 * H);
  });

  it('LC11: order_document http:// -> 422; https:// -> in order.get.documents', async () => {
    const m = await merchant();
    const b = `agent:${tag()}`;
    const id = await order(m, 'PAID', { buyer: b });
    const call = await connect(await keyOf(m));
    const bad = await call('shop.merchant.order_document', {
      order_id: id,
      url: 'http://x.example/i.pdf',
    });
    expect(bad.isError).toBe(true);
    expect(bad.body.error_code).toBe('validation_failed');
    for (const url of ['javascript:alert(1)', 'https://u:p@x.example/', 'not a url']) {
      expect((await call('shop.merchant.order_document', { order_id: id, url })).isError).toBe(
        true,
      );
    }
    const ok = await call('shop.merchant.order_document', {
      order_id: id,
      url: 'https://x.example/i.pdf',
    });
    expect(ok.isError).toBe(false);
    const view = await getOrderView(prisma as never, id, b);
    expect(view.documents?.map((d) => d.url)).toEqual(['https://x.example/i.pdf']);
    expect(await state(id)).toBe('PAID');
    const other = await connect(await keyOf(await merchant()));
    const foreign = await other('shop.merchant.order_document', {
      order_id: id,
      url: 'https://x.example/z',
    });
    expect(foreign.body.error_code).toBe('not_found');
  });

  it('confirm_due_at is set at PAID for merchant-fulfilled orders only (confirm_sla_h)', async () => {
    const m = await merchant({ confirm_sla_h: 12 });
    const paid = async (mode: string) => {
      const sku = await product(m, { mode });
      const id = await order(m, 'PAYING', { sku });
      const pay = (
        await q(
          `INSERT INTO shop_payments (order_id, rail, nonce_or_challenge_id, payer, pay_to, amount_usd)
           VALUES ($1::uuid, 'base', $2, $3, '0xb', 5) RETURNING payment_id`,
          id,
          randomUUID(),
          PAYER,
        )
      )[0].payment_id;
      await confirmPayment(deps, { order_id: id, payment_id: pay, tx_hash: '0xt', payer: PAYER });
      return (
        await q(
          `SELECT state, extract(epoch FROM confirm_due_at - settled_at) / 3600 AS h
             FROM shop_orders WHERE order_id = $1::uuid`,
          id,
        )
      )[0];
    };
    const merchantMode = await paid('merchant');
    expect(merchantMode.state).toBe('PAID');
    expect(Number(merchantMode.h)).toBeCloseTo(12, 1);
    expect((await paid('instant')).h).toBeNull();
  });
});
