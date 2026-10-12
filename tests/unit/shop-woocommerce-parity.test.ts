/**
 * T-0294 / INT-53 WP1-WP5: the server catches up with the WooCommerce plugin (INT-43 "Known gaps"),
 * against a real Postgres (TEST_DATABASE_URL, disposable).
 */
import express from 'express';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { issueKey } from '../../src/shop/auth/merchant-key.service';
import { confirmPayment } from '../../src/shop/order-payment.service';
import { createMerchantRouter } from '../../src/shop/routes/merchant.router';
import { acceptFulfillment, parseFulfillment } from '../../src/shop/webhook/delivery.service';
import { decryptSecret } from '../../src/services/secret-crypto.service';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import {
  client,
  dbDescribe,
  migrate,
  mkMerchant,
  mkOrder,
  mkProduct,
  mkQuote,
} from './helpers/shop-db';

jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const body = (f: unknown) => Buffer.from(JSON.stringify({ fulfillment: f }));
const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://cdn.example/f/${i}.zip`);

dbDescribe('WooCommerce server parity (T-0294)', () => {
  const prisma = client();
  const deps: ShopDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
  };
  const q = (sql: string, ...v: unknown[]) =>
    prisma.$queryRawUnsafe<Array<Record<string, any>>>(sql, ...v);
  let n = 0;
  const tag = () => `${Date.now().toString(36)}w${n++}`;

  beforeAll(() => migrate());
  afterAll(() => prisma.$disconnect());

  async function activeMerchant(): Promise<string> {
    const id = await mkMerchant(prisma, tag());
    for (const doc_id of ['merchant-agreement', 'aup', 'dpa', 'refund-framework']) {
      const have = await q(`SELECT 1 FROM shop_legal_docs WHERE doc_id = $1`, doc_id);
      if (have.length === 0) {
        await q(
          `INSERT INTO shop_legal_docs (doc_id, version, sha256, url, effective_from, body_md)
           VALUES ($1, 'wp', $2, $3, now() - interval '1 day', 'b')`,
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
      id,
    );
    await q(
      `UPDATE shop_merchants SET status = 'active',
         encryption_key = '{"kid":"k1","alg":"x25519","pub":"AAAA","sig_by_wallet":"0xsig"}'::jsonb
       WHERE merchant_id = $1::uuid`,
      id,
    );
    return id;
  }

  async function withServer<T>(fn: (base: string) => Promise<T>): Promise<T> {
    const app = express();
    app.use(express.json());
    app.use(createMerchantRouter(deps));
    const server: Server = await new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    try {
      return await fn(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/shop/merchants/me`,
      );
    } finally {
      server.close();
    }
  }
  const call = (base: string, key: string, method: string, path: string, b?: object) =>
    fetch(base + path, {
      method,
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: b ? JSON.stringify(b) : undefined,
    });

  it('WP1: the url form is accepted, normalised and stored encrypted', async () => {
    const list = urls(2);
    const text = parseFulfillment(body({ type: 'url', urls: list }));
    expect(text).toBe(JSON.stringify({ type: 'url', urls: list }));
    expect(parseFulfillment(body('plain text'))).toBe('plain text');

    const m = await mkMerchant(prisma, tag());
    const quote = await mkQuote(prisma, m, { status: 'paid' });
    const order = await mkOrder(prisma, m, quote, 'PAID');
    expect(await acceptFulfillment(deps, m, order, text as string)).toBe(true);
    const row = (
      await q(
        `SELECT fulfillment_payload_enc AS e FROM shop_orders WHERE order_id = $1::uuid`,
        order,
      )
    )[0];
    expect(row.e).not.toContain('cdn.example');
    expect(decryptSecret(row.e, 'k'.repeat(40))).toBe(text);
  });

  it('WP2: http://, empty list, extra keys, 21 urls and oversize urls are refused', () => {
    expect(parseFulfillment(body({ type: 'url', urls: ['http://cdn.example/a'] }))).toBeNull();
    expect(parseFulfillment(body({ type: 'url', urls: ['ftp://cdn.example/a'] }))).toBeNull();
    expect(parseFulfillment(body({ type: 'url', urls: ['/relative'] }))).toBeNull();
    expect(parseFulfillment(body({ type: 'url', urls: [] }))).toBeNull();
    expect(parseFulfillment(body({ type: 'url', urls: urls(21) }))).toBeNull();
    expect(parseFulfillment(body({ type: 'url', urls: urls(20) }))).not.toBeNull();
    expect(parseFulfillment(body({ type: 'url', urls: urls(1), extra: 1 }))).toBeNull();
    expect(parseFulfillment(body({ type: 'file', urls: urls(1) }))).toBeNull();
    expect(
      parseFulfillment(body({ type: 'url', urls: [`https://cdn.example/${'a'.repeat(2100)}`] })),
    ).toBeNull();
  });

  it('WP3: the shop.order.paid outbox payload carries items[{sku, quantity}]', async () => {
    const m = await mkMerchant(prisma, tag());
    const quote = await mkQuote(prisma, m, { status: 'open' });
    await q(
      `UPDATE shop_quotes SET items = '[{"sku":"sku-a","qty":2},{"sku":"sku-b","qty":1}]'::jsonb WHERE quote_id = $1::uuid`,
      quote,
    );
    const order = await mkOrder(prisma, m, quote, 'PAYING');
    const pay = (
      await q(
        `INSERT INTO shop_payments (order_id, rail, nonce_or_challenge_id, payer, pay_to, amount_usd)
         VALUES ($1::uuid, 'base', $2, '0xpayer', '0xb', 1) RETURNING payment_id`,
        order,
        randomUUID(),
      )
    )[0].payment_id;
    expect(
      await confirmPayment(deps, {
        order_id: order,
        payment_id: pay,
        tx_hash: '0xt',
        payer: '0xpayer',
      }),
    ).toBe(true);
    const ev = await q(
      `SELECT payload FROM outbox WHERE event_type = 'shop.order.paid' AND payload->>'order_id' = $1`,
      order,
    );
    expect(ev).toHaveLength(1);
    expect(ev[0].payload.items).toEqual([
      { sku: 'sku-a', quantity: 2 },
      { sku: 'sku-b', quantity: 1 },
    ]);
    expect(ev[0].payload.order_id).toBe(order);
  });

  it('WP4: DELETE /me/catalog removes 2 skus; a sku with a live quote -> 409 and nothing is deleted', async () => {
    const m = await activeMerchant();
    const key = await issueKey(deps.db, m);
    for (const sku of ['d1', 'd2', 'd3']) await mkProduct(prisma, m, { sku });
    await withServer(async (base) => {
      const ok = await call(base, key, 'DELETE', '/catalog', { skus: ['d1', 'd2'] });
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ deleted: 2, not_found: [] });

      const quote = await mkQuote(prisma, m, { status: 'open' });
      await q(
        `UPDATE shop_quotes SET items = '[{"sku":"d3","qty":1}]'::jsonb WHERE quote_id = $1::uuid`,
        quote,
      );
      await mkProduct(prisma, m, { sku: 'd4' });
      const refused = await call(base, key, 'DELETE', '/catalog', { skus: ['d4', 'd3'] });
      expect(refused.status).toBe(409);
      const left = await q(
        `SELECT sku FROM shop_products WHERE merchant_id = $1::uuid ORDER BY sku`,
        m,
      );
      expect(left.map((r) => r.sku)).toEqual(['d3', 'd4']);

      expect((await call(base, key, 'DELETE', '/catalog', { skus: [] })).status).toBe(422);
    });
  });

  it('WP5: GET /me/orders/:id -> own order with events, foreign or unknown id -> 404', async () => {
    const a = await mkMerchant(prisma, tag());
    const b = await mkMerchant(prisma, tag());
    const keyA = await issueKey(deps.db, a);
    const order = await mkOrder(prisma, a, await mkQuote(prisma, a, { status: 'paid' }), 'PAID');
    await q(
      `INSERT INTO shop_order_events (order_id, seq, from_state, to_state, actor, reason)
       VALUES ($1::uuid, 1, 'PAYING', 'PAID', 'system', 'payment_confirmed')`,
      order,
    );
    await q(
      `UPDATE shop_orders SET fulfillment_payload_enc = 'SECRET-ENC' WHERE order_id = $1::uuid`,
      order,
    );
    await withServer(async (base) => {
      const own = await call(base, keyA, 'GET', `/orders/${order}`);
      expect(own.status).toBe(200);
      const j = await own.json();
      expect(j).toMatchObject({ order_id: order, state: 'PAID' });
      expect(j.events).toHaveLength(1);
      expect(j.events[0]).toMatchObject({ to_state: 'PAID', actor: 'system' });
      expect(JSON.stringify(j)).not.toContain('SECRET-ENC');

      const keyB = await issueKey(deps.db, b);
      expect((await call(base, keyB, 'GET', `/orders/${order}`)).status).toBe(404);
      expect((await call(base, keyA, 'GET', `/orders/${randomUUID()}`)).status).toBe(404);
      expect((await call(base, keyA, 'GET', '/orders/not-a-uuid')).status).toBe(404);
    });
  }, 60_000);
});
