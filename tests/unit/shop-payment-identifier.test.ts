/**
 * T-INT-48 PI1-PI9: x402 payment-identifier idempotency for `shop.order.pay`, against a real Postgres
 * (TEST_DATABASE_URL, disposable). Mocked boundaries: facilitator verify, the replay-guard Redis,
 * @x402 payload decoding. Zero real verify/settle/RPC.
 */
import { randomBytes } from 'node:crypto';
import { toMicroUsdc } from '../../src/config/x402.config';
import { buildPaymentRequiredResponse } from '../../src/pipeline/stages/escrow.stage';
import { runShopSlaSweeper } from '../../src/jobs/shop-sla-sweeper.job';
import { payQuote } from '../../src/shop/pay.service';
import { createQuote } from '../../src/shop/quote.service';
import type { PipelineContext } from '../../src/pipeline/types';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { client, dbDescribe, migrate, mkMerchant } from './helpers/shop-db';

jest.mock('../../src/config/index', () => ({
  config: {
    ENCRYPTION_KEY: 'k'.repeat(40),
    X402_NETWORK: 'base',
    X402_PAYMENT_ADDRESS: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
    X402_FACILITATOR_URL: 'https://facilitator.example',
    X402_FACILITATOR_MODE: 'local',
    X402_OPERATOR_PRIVATE_KEY: '0x00',
    X402_BASE_RPC_URL: 'https://base.example',
    X402_BASE_SEPOLIA_RPC_URL: 'https://sepolia.example',
    X402_OPERATOR_MIN_ETH_BALANCE: 0.01,
  },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/moderation-ban.service', () => ({
  checkBan: jest.fn(async () => ({ banned: false, retryAfterSecs: 0 })),
}));
// The header IS the JSON payload in these tests.
jest.mock('@x402/core/http', () => ({
  decodePaymentSignatureHeader: (h: string) => JSON.parse(h),
  encodePaymentRequiredHeader: () => 'x',
}));
jest.mock('@x402/core/schemas', () => ({
  parsePaymentPayload: (d: unknown) => ({ success: true, data: d }),
}));
const claimed = new Set<string>();
const mockClaim = jest.fn(async (_rail: string, nonce: string) => {
  if (claimed.has(nonce)) return false;
  claimed.add(nonce);
  return true;
});
jest.mock('../../src/services/payment-nonce.service', () => ({
  claimPaymentNonce: (r: string, n: string) => mockClaim(r, n),
}));
const mockVerify = jest.fn();
const mockSettle = jest.fn();
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({ verifyPayment: mockVerify, settlePayment: mockSettle }),
}));
jest.mock('../../src/services/redis.service', () => ({}));

type Row = Record<string, any>;
const E = process['env'];
const PLATFORM = '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480';
const PAYOUT = '0x00000000000000000000000000000000000b0b0b';
const FEE_WALLET = '0x00000000000000000000000000000000000fee00';
const TEMPO = '0x9E29FF84B0f3EDa9756262d2F950C435495BA8cC';
const NETWORK = 'eip155:8453';

dbDescribe('shop.order.pay payment-identifier', () => {
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
  const tag = () => `${Date.now().toString(36)}p${n++}`;
  const buyer = () => ({ identity: `agent:${tag()}` });

  beforeAll(() => migrate());
  afterAll(() => prisma.$disconnect());
  beforeEach(() => {
    Object.assign(E, {
      INTEGRATOR_FEE_ENABLED: 'true',
      INTEGRATOR_BASE_ORDERS_ENABLED: 'true',
      MPP_ENABLED: 'true',
      INTEGRATOR_TEST_SKU_DAILY_CAP: '3',
      INTEGRATOR_FEE_WALLET: FEE_WALLET,
      PUBLIC_BASE_URL: 'https://apibase.pro',
    });
    mockVerify.mockReset().mockImplementation(async (p: any) => ({
      isValid: true,
      payer: p.payload.authorization.from,
    }));
    // INT-09: settle ran, receipt not seen -> the order stays PAYING (what INT-08 asserted).
    mockSettle.mockReset().mockResolvedValue({ success: true, transaction: '' });
    mockClaim.mockClear();
    claimed.clear();
  });

  async function activate(merchant_id: string) {
    for (const doc_id of ['merchant-agreement', 'aup', 'dpa', 'refund-framework']) {
      const have = await prisma.$queryRawUnsafe<unknown[]>(
        `SELECT 1 FROM shop_legal_docs WHERE doc_id = $1`,
        doc_id,
      );
      if (have.length === 0) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO shop_legal_docs (doc_id, version, sha256, url, effective_from, body_md)
           VALUES ($1, 'int08', $2, $3, now() - interval '1 day', 'b')`,
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
      `UPDATE shop_merchants SET status = 'active', payout_wallet_base = $2,
              created_at = now() - interval '90 days' WHERE merchant_id = $1::uuid`,
      merchant_id,
      PAYOUT,
    );
  }
  async function product(merchant_id: string, price: number, test = false) {
    const sku = test ? '__apibase_test' : `sku-${tag()}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_products (merchant_id, sku, title, price_usd, available, is_test, category, fulfillment_mode)
       VALUES ($1::uuid, $2, 'Thing', $3::numeric, NULL, $4, 'books', 'instant')`,
      merchant_id,
      sku,
      price,
      test,
    );
    return sku;
  }
  /** A merchant with one live quote for `price`. */
  async function fixture(price = 5, test = false) {
    const m = await mkMerchant(prisma, tag());
    await activate(m);
    const sku = await product(m, price, test);
    const b = buyer();
    const quote = await createQuote(deps, m, b, { items: [{ sku, qty: 1 }] });
    return { m, b, quote, sku };
  }
  const row = async (sql: string, ...v: unknown[]) =>
    (await prisma.$queryRawUnsafe<Row[]>(sql, ...v))[0];
  const count = async (sql: string, ...v: unknown[]) => Number((await row(sql, ...v)).c);

  const header = (o: { value: string; to?: string; from?: string; nonce?: string; id?: string }) =>
    JSON.stringify({
      accepted: { network: NETWORK },
      ...(o.id
        ? { extensions: { 'payment-identifier': { info: { required: false, id: o.id } } } }
        : {}),
      payload: {
        authorization: {
          from: o.from ?? '0x00000000000000000000000000000000000a11ce',
          to: o.to ?? PAYOUT,
          value: o.value,
          validAfter: '0',
          validBefore: String(Math.floor(Date.now() / 1000) + 600),
          nonce: o.nonce ?? `0x${randomBytes(32).toString('hex')}`,
        },
      },
    });
  const pay = (f: Awaited<ReturnType<typeof fixture>>, h?: string) =>
    payQuote(deps, {
      quote_id: f.quote.quote_id,
      x402PaymentHeader: h,
      buyer: f.b,
      requestId: 'r-1',
      host: 'apibase.pro',
    });
  const payments = (f: Awaited<ReturnType<typeof fixture>>) =>
    count(`SELECT count(*) AS c FROM shop_payments WHERE order_id = $1::uuid`, f.quote.order_id);
  const orderState = async (f: Awaited<ReturnType<typeof fixture>>) =>
    (await row(`SELECT state FROM shop_orders WHERE order_id = $1::uuid`, f.quote.order_id)).state;

  const pid = () => `pay_${randomBytes(12).toString('hex')}`;
  const idRows = (id: string) =>
    prisma.$queryRawUnsafe<Row[]>(
      `SELECT * FROM shop_payment_identifiers WHERE identifier = $1`,
      id,
    );

  it('PI1: the same id and payload twice -> one verify, one settle, two identical answers', async () => {
    const f = await fixture(5);
    const id = pid();
    const h = header({ value: toMicroUsdc(5), id });
    const a = await pay(f, h);
    const b = await pay(f, h);
    expect(a.status).toBe(202);
    expect(b).toEqual(a);
    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(mockSettle).toHaveBeenCalledTimes(1);
    expect(await payments(f)).toBe(1);
    expect((await idRows(id))[0].status).toBe('done');
  });

  it('PI2: the same id for another quote -> 409 payment_identifier_conflict, settle 0 for it', async () => {
    const f1 = await fixture(5);
    const f2 = await fixture(7);
    const id = pid();
    expect((await pay(f1, header({ value: toMicroUsdc(5), id }))).status).toBe(202);
    const r = await pay(f2, header({ value: toMicroUsdc(7), id }));
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('payment_identifier_conflict');
    expect(mockSettle).toHaveBeenCalledTimes(1);
    expect(await payments(f2)).toBe(0);
  });

  it('PI3: two parallel requests with one id -> one passes, the other is 409 payment_in_flight', async () => {
    const f = await fixture(5);
    const id = pid();
    mockVerify.mockImplementation(async (p: any) => {
      await new Promise((r) => setTimeout(r, 300));
      return { isValid: true, payer: p.payload.authorization.from };
    });
    const h = header({ value: toMicroUsdc(5), id });
    const [a, b] = await Promise.all([
      pay(f, h),
      (async () => {
        await new Promise((r) => setTimeout(r, 100));
        return pay(f, h);
      })(),
    ]);
    expect(a.status).toBe(202);
    expect(b.status).toBe(409);
    expect(b.body.error).toBe('payment_in_flight');
    expect(mockSettle).toHaveBeenCalledTimes(1);
  });

  it('PI4: an exception in the pipeline deletes the row; the retry passes', async () => {
    const f = await fixture(5);
    const id = pid();
    const h = header({ value: toMicroUsdc(5), id });
    const boom: ShopDeps = {
      ...deps,
      transaction: () => Promise.reject(new Error('boom')),
    };
    await expect(
      payQuote(boom, {
        quote_id: f.quote.quote_id,
        x402PaymentHeader: h,
        buyer: f.b,
        requestId: 'r-4',
        host: 'apibase.pro',
      }),
    ).rejects.toThrow('boom');
    expect(await idRows(id)).toHaveLength(0);
    expect((await pay(f, h)).status).toBe(202);
  });

  it('PI5: no id -> the old path: a repeated X-Payment is 402 by the nonce claim', async () => {
    const f = await fixture(5);
    const h = header({ value: toMicroUsdc(5) });
    expect((await pay(f, h)).status).toBe(202);
    const again = await pay(f, h);
    expect(again.status).toBe(402);
    expect(await payments(f)).toBe(1);
  });

  it('PI6: the quote 402 declares payment-identifier; the tool 402 does not', async () => {
    const f = await fixture(5);
    const r = await pay(f);
    expect(r.status).toBe(402);
    expect(Object.keys(r.body.extensions as object)).toContain('payment-identifier');
    expect((r.body.extensions as Row)['payment-identifier'].info.required).toBe(false);
    const tool = buildPaymentRequiredResponse(
      { resource: 'tool:x.y', amount_usd: 0.01, pay_to: PLATFORM, rail: 'base' } as never,
      { requestId: 'r', host: 'apibase.pro' },
    );
    expect(JSON.stringify(tool)).not.toContain('payment-identifier');
  });

  it('PI7: the stored response has no fulfillment', async () => {
    const f = await fixture(5);
    const id = pid();
    mockSettle.mockResolvedValue({ success: true, transaction: `0x${'ab'.repeat(32)}` });
    await pay(f, header({ value: toMicroUsdc(5), id }));
    const stored = (await idRows(id))[0].response;
    expect(stored.ok).toBe(true);
    expect(stored.value.order_id).toBe(f.quote.order_id);
    expect(JSON.stringify(stored)).not.toContain('fulfillment');
    expect(stored.value).toHaveProperty('state');
    expect(stored.value).toHaveProperty('tx_hash');
  });

  it('PI8: an expired row is deleted by the sweeper', async () => {
    const f = await fixture(5);
    const id = pid();
    await pay(f, header({ value: toMicroUsdc(5), id }));
    await prisma.$executeRawUnsafe(
      `UPDATE shop_payment_identifiers SET expires_at = now() - interval '1 minute' WHERE identifier = $1`,
      id,
    );
    const out = await runShopSlaSweeper(deps);
    expect(out.payment_identifiers_deleted).toBeGreaterThanOrEqual(1);
    expect(await idRows(id)).toHaveLength(0);
  });

  it('PI9: another payer with the same id -> 409 payment_identifier_conflict', async () => {
    const f = await fixture(5);
    const id = pid();
    expect((await pay(f, header({ value: toMicroUsdc(5), id }))).status).toBe(202);
    const other = await pay(
      f,
      header({ value: toMicroUsdc(5), id, from: '0x00000000000000000000000000000000000b0b0b' }),
    );
    expect(other.status).toBe(409);
    expect(other.body.error).toBe('payment_identifier_conflict');
    expect(mockSettle).toHaveBeenCalledTimes(1);
  });
});
