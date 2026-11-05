/**
 * T-0713: the shop.order.paid outbox row carries payer_address, network and livemode, read back
 * from a real Postgres (TEST_DATABASE_URL, disposable) after an x402 (base) and an MPP (tempo) settlement.
 */
import { randomUUID } from 'node:crypto';
import { confirmPayment } from '../../src/shop/order-payment.service';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { client, dbDescribe, migrate, mkMerchant } from './helpers/shop-db';

jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base', MPP_TESTNET: 'false' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

type Row = Record<string, any>;
const PAYER = '0x00000000000000000000000000000000000a11ce';

dbDescribe('T-0713 order.paid outbox payload (DB)', () => {
  const prisma = client();
  const deps: ShopDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: { incr: async () => 1, expire: async () => 1 } as never,
  };
  const q = (sql: string, ...v: unknown[]) => prisma.$queryRawUnsafe<Row[]>(sql, ...v);
  beforeAll(() => migrate());
  afterAll(() => prisma.$disconnect());

  async function settle(rail: 'base' | 'tempo') {
    const m = await mkMerchant(prisma, `${Date.now().toString(36)}p${rail}`);
    await q(`UPDATE shop_merchants SET status = 'active' WHERE merchant_id = $1::uuid`, m);
    const sku = `sku-${randomUUID().slice(0, 8)}`;
    await q(
      `INSERT INTO shop_products (moderation_status, merchant_id, sku, title, price_usd, available, category,
                                  fulfillment_mode, returns_accepted, refund_window_days)
       VALUES ('ok', $1::uuid, $2, 'T', 5, 10, 'books', 'merchant', false, 14)`,
      m,
      sku,
    );
    const quote = (
      await q(
        `INSERT INTO shop_quotes (merchant_id, buyer_identity, items, subtotal, total_usd, expires_at, status)
         VALUES ($1::uuid, 'agent:none', $2::jsonb, 5, 5, now() + interval '10 minutes', 'paid')
         RETURNING quote_id`,
        m,
        JSON.stringify([{ sku, qty: 1 }]),
      )
    )[0].quote_id;
    const id = (
      await q(
        `INSERT INTO shop_orders (quote_id, merchant_id, state, total_usd) VALUES ($1::uuid, $2::uuid, 'PAYING', 5)
         RETURNING order_id`,
        quote,
        m,
      )
    )[0].order_id as string;
    const pay = (
      await q(
        `INSERT INTO shop_payments (order_id, rail, nonce_or_challenge_id, payer, pay_to, amount_usd)
         VALUES ($1::uuid, $2, $3, $4, '0xb', 5) RETURNING payment_id`,
        id,
        rail,
        randomUUID(),
        PAYER,
      )
    )[0].payment_id;
    await confirmPayment(deps, {
      order_id: id,
      payment_id: pay,
      tx_hash: '0xt',
      payer: PAYER,
      rail,
    });
    const row = (
      await q(
        `SELECT payload->>'payer_address' AS payer_address, payload->>'network' AS network,
                payload->>'livemode' AS livemode, payload->>'tx_hash' AS tx_hash
           FROM outbox WHERE event_type = 'shop.order.paid' AND payload->>'order_id' = $1`,
        id,
      )
    )[0];
    // eslint-disable-next-line no-console
    console.log(
      `T-0713 outbox row (${rail}):`,
      JSON.stringify({
        ...row,
        payer_address: row.payer_address.slice(0, 6) + '...' + row.payer_address.slice(-4),
      }),
    );
    return row;
  }

  it('x402 on Base', async () => {
    expect(await settle('base')).toEqual({
      payer_address: PAYER,
      network: 'base',
      livemode: 'true',
      tx_hash: '0xt',
    });
  });
  it('MPP on Tempo', async () => {
    expect(await settle('tempo')).toEqual({
      payer_address: PAYER,
      network: 'tempo',
      livemode: 'true',
      tx_hash: '0xt',
    });
  });
});
