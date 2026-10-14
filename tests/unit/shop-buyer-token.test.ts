/** T-SHOP-A: anonymous REST quotes get a buyer_token; an `ip:` identity is never the payer. */
import { createHash, randomBytes } from 'node:crypto';
import { resolveBuyer } from '../../src/shop/buyer';
import { isPayer } from '../../src/shop/order-payment.service';
import { getOrderView } from '../../src/shop/order-payment.service';
import { cancelOrder, createQuote } from '../../src/shop/quote.service';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { client, dbDescribe, migrate, mkMerchant } from './helpers/shop-db';

jest.mock('../../src/config', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
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

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe('buyer token identity (no DB)', () => {
  it('(d) an ip: identity is never the payer, even when it equals buyer_identity', () => {
    const row = { buyer_identity: 'ip:1.2.3.4', payer_wallet: null };
    expect(isPayer(row, 'ip:1.2.3.4')).toBe(false);
    expect(isPayer({ ...row, buyer_identity: 'token:abc' }, 'token:abc')).toBe(true);
  });

  it('resolveBuyer maps a bt_ bearer to token:<sha256> before any api-key lookup', async () => {
    const t = `bt_${randomBytes(32).toString('hex')}`;
    expect(await resolveBuyer({ apiKey: t, ip: '1.2.3.4' })).toEqual({
      identity: `token:${sha(t)}`,
    });
    expect(await resolveBuyer({ ip: '1.2.3.4' })).toEqual({ identity: 'ip:1.2.3.4' });
    expect((await resolveBuyer({ apiKey: 'bt_short', ip: '1.2.3.4' })).identity).toBe('ip:1.2.3.4');
  });
});

dbDescribe('buyer token against a real Postgres', () => {
  const prisma = client();
  const deps: ShopDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: { incr: async () => 1, expire: async () => 1 } as never,
  };
  const q = (sql: string, ...v: unknown[]) =>
    prisma.$queryRawUnsafe<Array<Record<string, any>>>(sql, ...v);
  const x = (sql: string, ...v: unknown[]) => prisma.$executeRawUnsafe(sql, ...v);
  let n = 0;
  const tag = () => `${Date.now().toString(36)}bt${n++}`;

  beforeAll(() => migrate());
  afterAll(() => prisma.$disconnect());

  async function setup() {
    const m = await mkMerchant(prisma, tag());
    await x(`UPDATE shop_merchants SET status = 'active' WHERE merchant_id = $1::uuid`, m);
    const sku = `sku-${tag()}`;
    await x(
      `INSERT INTO shop_products (moderation_status, merchant_id, sku, title, price_usd, available, category,
                                  fulfillment_mode, returns_accepted, refund_window_days)
       VALUES ('ok', $1::uuid, $2, 'T', 5, 10, 'books', 'merchant', false, 14)`,
      m,
      sku,
    );
    return { m, sku };
  }
  const quote = (m: string, sku: string, identity: string) =>
    createQuote(deps, m, { identity }, { items: [{ sku, qty: 1 }] });

  async function markPaid(order_id: string) {
    await x(
      `UPDATE shop_orders SET state = 'PAID', payer_wallet = '0x00000000000000000000000000000000000a11ce',
              settled_at = now() WHERE order_id = $1::uuid`,
      order_id,
    );
  }

  it('(a) anonymous quote returns a bt_ token and stores token:<sha256>, not ip:', async () => {
    const { m, sku } = await setup();
    const r = await quote(m, sku, 'ip:9.9.9.9');
    expect(r.buyer_token).toMatch(/^bt_[0-9a-f]{64}$/);
    const row = (
      await q(`SELECT buyer_identity FROM shop_quotes WHERE quote_id = $1::uuid`, r.quote_id)
    )[0];
    expect(row.buyer_identity).toBe(`token:${sha(r.buyer_token as string)}`);
    expect(JSON.stringify(row)).not.toContain('ip:');
    expect(JSON.stringify(row)).not.toContain(r.buyer_token as string);
  });

  it('(b) the token sees fulfillment/contact; the same ip without it sees nothing and cannot cancel', async () => {
    const { m, sku } = await setup();
    const r = await quote(m, sku, 'ip:9.9.9.9');
    await markPaid(r.order_id);
    const holder = await resolveBuyer({ apiKey: r.buyer_token, ip: '9.9.9.9' });
    const stranger = await resolveBuyer({ ip: '9.9.9.9' });
    const mine = await getOrderView(prisma as never, r.order_id, holder.identity);
    expect(mine.merchant_contact).toBeDefined();
    const theirs = await getOrderView(prisma as never, r.order_id, stranger.identity);
    expect(theirs.fulfillment).toBeUndefined();
    expect(theirs.merchant_contact).toBeUndefined();
    await expect(cancelOrder(deps, stranger, r.order_id, 'x')).rejects.toMatchObject({
      status: 404,
      error_code: 'not_found',
    });
    const st = (await q(`SELECT state FROM shop_orders WHERE order_id = $1::uuid`, r.order_id))[0]
      .state;
    expect(st).toBe('PAID');
  });

  it('(c) an API-key agent quote returns no buyer_token', async () => {
    const { m, sku } = await setup();
    const r = await quote(m, sku, 'agent:abc');
    expect(r.buyer_token).toBeUndefined();
    const row = (
      await q(`SELECT buyer_identity FROM shop_quotes WHERE quote_id = $1::uuid`, r.quote_id)
    )[0];
    expect(row.buyer_identity).toBe('agent:abc');
  });
});
