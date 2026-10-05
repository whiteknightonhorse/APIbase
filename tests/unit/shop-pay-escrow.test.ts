/**
 * T-INT-08 PB2-PB11: payment binding for `shop.order.pay` in ESCROW, against a real Postgres
 * (TEST_DATABASE_URL, disposable). Mocked boundaries: facilitator verify, the replay-guard Redis,
 * @x402 payload decoding. Zero real verify/settle/RPC.
 */
import { randomBytes } from 'node:crypto';
import { toMicroUsdc } from '../../src/config/x402.config';
import { buildPaymentBinding } from '../../src/pipeline/stages/escrow.stage';
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
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({ verifyPayment: mockVerify }),
}));
jest.mock('../../src/services/redis.service', () => ({}));

type Row = Record<string, any>;
const E = process['env'];
const PLATFORM = '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480';
const PAYOUT = '0x00000000000000000000000000000000000b0b0b';
const FEE_WALLET = '0x00000000000000000000000000000000000fee00';
const TEMPO = '0x9E29FF84B0f3EDa9756262d2F950C435495BA8cC';
const NETWORK = 'eip155:8453';

dbDescribe('shop.order.pay ESCROW binding', () => {
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

  const header = (o: { value: string; to?: string; from?: string; nonce?: string }) =>
    JSON.stringify({
      accepted: { network: NETWORK },
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

  it('PB2: $1 / $6 / platform wallet for a $5 quote -> 402, no claim, no payment, still QUOTED', async () => {
    const f = await fixture(5);
    const under = await pay(f, header({ value: toMicroUsdc(1) }));
    expect(under.status).toBe(402);
    expect(under.body.error).toBe('payment_amount_mismatch');
    const over = await pay(f, header({ value: toMicroUsdc(6) }));
    expect(over.status).toBe(402);
    expect(over.body.error).toBe('payment_amount_mismatch');
    const redirected = await pay(f, header({ value: toMicroUsdc(5), to: PLATFORM }));
    expect(redirected.status).toBe(402);
    expect(redirected.body.error).toBe('payment_required');
    expect(mockClaim).not.toHaveBeenCalled();
    expect(await payments(f)).toBe(0);
    expect(await orderState(f)).toBe('QUOTED');
  });

  it('PB3: a valid payment -> PAYING, pending shop_payments to the merchant payout; replay refused', async () => {
    const f = await fixture(5);
    const nonce = `0x${randomBytes(32).toString('hex')}`;
    const h = header({ value: toMicroUsdc(5), nonce });
    const r = await pay(f, h);
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ status: 'payment_pending', order_id: f.quote.order_id });
    expect(await orderState(f)).toBe('PAYING');
    const p = await row(`SELECT * FROM shop_payments WHERE order_id = $1::uuid`, f.quote.order_id);
    expect(p.chain_status).toBe('pending');
    expect(p.pay_to).toBe(PAYOUT);
    expect(p.eip3009_nonce).toBe(nonce);
    expect(p.rail).toBe('base');
    expect(
      (await row(`SELECT status FROM shop_quotes WHERE quote_id = $1::uuid`, f.quote.quote_id))
        .status,
    ).toBe('open');

    const again = await pay(f, h);
    expect(again.status).toBe(402);
    expect(again.body.error).toBe('payment_required');
    expect(await payments(f)).toBe(1);
  });

  it('PB4: a sanctioned payer -> 402 generic, one ofac review, verify called, no claim, no settle', async () => {
    const f = await fixture(5);
    const payer = '0x00000000000000000000000000000000000dead0';
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_sanctioned_addresses (address, list_version) VALUES ($1, 'fixture')
       ON CONFLICT DO NOTHING`,
      payer,
    );
    const r = await pay(
      f,
      header({ value: toMicroUsdc(5), from: payer.toUpperCase().replace('0X', '0x') }),
    );
    expect(r.status).toBe(402);
    expect(r.body.error).toBe('payment_required');
    expect(JSON.stringify(r.body)).not.toMatch(/sanction|ofac/i);
    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(mockClaim).not.toHaveBeenCalled();
    expect(
      await count(
        `SELECT count(*) AS c FROM shop_moderation_reviews WHERE merchant_id = $1::uuid AND category = 'ofac' AND scope = 'merchant' AND layer = 'rules' AND verdict = 'reject'`,
        f.m,
      ),
    ).toBe(1);
    expect(
      await count(
        `SELECT count(*) AS c FROM shop_connect_events WHERE error_code = 'payer_sanctioned' AND path = $1`,
        `quote:${f.quote.quote_id}`,
      ),
    ).toBe(1);
    expect(await payments(f)).toBe(0);
    expect(await orderState(f)).toBe('QUOTED');
  });

  it('PB5: an expired quote + a valid payment -> 410 quote_expired with a new quote, no claim', async () => {
    const f = await fixture(5);
    await prisma.$executeRawUnsafe(
      `UPDATE shop_quotes SET expires_at = now() - interval '1 minute' WHERE quote_id = $1::uuid`,
      f.quote.quote_id,
    );
    const r = await pay(f, header({ value: toMicroUsdc(5) }));
    expect(r.status).toBe(410);
    expect(r.body.error).toBe('quote_expired');
    expect((r.body.quote as Row).quote_id).not.toBe(f.quote.quote_id);
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockVerify).not.toHaveBeenCalled();
    expect(await payments(f)).toBe(0);
  });

  it('PB6: no payment -> 402 challenge from the quote: payTo = payout, exact amount, quote_id, pay.mpp.url', async () => {
    const f = await fixture(5);
    const r = await pay(f);
    expect(r.status).toBe(402);
    const a = (r.body.accepts as Row[])[0];
    expect(a.payTo).toBe(PAYOUT);
    expect(a.payTo).not.toBe(PLATFORM);
    expect(a.maxAmountRequired).toBe(toMicroUsdc(f.quote.total_usd));
    expect(a.amount).toBe(toMicroUsdc(f.quote.total_usd));
    expect(a.extra.quote_id).toBe(f.quote.quote_id);
    expect(a.splits).toBeUndefined();
    expect(r.body.resource_id).toBe(`quote:${f.quote.quote_id}`);
    expect((r.body.pay as Row).mpp.url).toMatch(/\/api\/v1\/shop\/quotes\/.+\/pay$/);
    expect(JSON.stringify(a)).not.toContain('mpp');
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('PB7: the 4th test-SKU order of the day -> 429 BEFORE verify', async () => {
    const m = await mkMerchant(prisma, tag());
    await activate(m);
    const sku = await product(m, 0.01, true);
    const b = buyer();
    const quotes = [];
    for (let i = 0; i < 4; i++) {
      quotes.push(await createQuote(deps, m, b, { items: [{ sku, qty: 1 }] }));
    }
    for (const q of quotes.slice(0, 3)) {
      await prisma.$executeRawUnsafe(
        `UPDATE shop_orders SET state = 'PAID', settled_at = now() WHERE order_id = $1::uuid`,
        q.order_id,
      );
    }
    const r = await payQuote(deps, {
      quote_id: quotes[3].quote_id,
      x402PaymentHeader: header({ value: toMicroUsdc(0.01) }),
      buyer: b,
      requestId: 'r-7',
      host: 'apibase.pro',
    });
    expect(r.status).toBe(429);
    expect(r.body.error).toBe('test_sku_daily_cap');
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it('PB8: no shop_payments row pays the platform, Tempo or fee wallet', async () => {
    for (const price of [5, 89]) {
      const f = await fixture(price);
      expect((await pay(f, header({ value: toMicroUsdc(price) }))).status).toBe(202);
    }
    const bad = await count(
      `SELECT count(*) AS c FROM shop_payments WHERE lower(pay_to) = ANY($1::text[])`,
      [PLATFORM, TEMPO, FEE_WALLET].map((x) => x.toLowerCase()),
    );
    expect(bad).toBe(0);
  });

  it('PB9: payout_pending not yet effective -> the binding pays the OLD wallet', async () => {
    const f = await fixture(5);
    await prisma.$executeRawUnsafe(
      `UPDATE shop_merchants SET payout_pending = $2::jsonb WHERE merchant_id = $1::uuid`,
      f.m,
      JSON.stringify({
        rail: 'base',
        wallet: '0x00000000000000000000000000000000000ba5e0',
        effective_at: new Date(Date.now() + 3600_000).toISOString(),
      }),
    );
    const r = await pay(f);
    expect((r.body.accepts as Row[])[0].payTo).toBe(PAYOUT);
    const ok = await pay(f, header({ value: toMicroUsdc(5) }));
    expect(ok.status).toBe(202);
    expect(
      (await row(`SELECT pay_to FROM shop_payments WHERE order_id = $1::uuid`, f.quote.order_id))
        .pay_to,
    ).toBe(PAYOUT);
  });

  it('PB10: two parallel valid payments (different nonces) -> one PAYING, one payment row, one 402', async () => {
    const f = await fixture(5);
    const [a, b] = await Promise.all([
      pay(f, header({ value: toMicroUsdc(5) })),
      pay(f, header({ value: toMicroUsdc(5) })),
    ]);
    expect([a.status, b.status].sort()).toEqual([202, 402]);
    expect(await payments(f)).toBe(1);
    expect(await orderState(f)).toBe('PAYING');
  });

  it('PB11: fee on -> splits [{fee wallet, 1.34}] for $89; off -> undefined; accepts carries no splits', async () => {
    const f = await fixture(89);
    const ctx = {
      toolId: 'shop.order.pay',
      body: { quote_id: f.quote.quote_id },
    } as PipelineContext;
    const on = await deps.transaction((tx) => buildPaymentBinding(ctx, tx));
    expect(on.ok && on.value.binding.splits).toEqual([{ wallet: FEE_WALLET, amount_usd: 1.34 }]);
    expect(on.ok && on.value.binding.resource).toBe(`quote:${f.quote.quote_id}`);
    E.INTEGRATOR_FEE_ENABLED = 'false';
    const off = await deps.transaction((tx) => buildPaymentBinding(ctx, tx));
    expect(off.ok && off.value.binding.splits).toBeUndefined();
    const r = await pay(f);
    expect(JSON.stringify(r.body.accepts)).not.toContain('splits');
  });

  it('waive_withdrawal and buyer_company are stored on the quote', async () => {
    const f = await fixture(5);
    await payQuote(deps, {
      quote_id: f.quote.quote_id,
      buyer: f.b,
      requestId: 'r-w',
      host: 'apibase.pro',
      waive_withdrawal: true,
      buyer_company: 'ACME GmbH',
    });
    const q = await row(
      `SELECT waive_withdrawal, buyer_company FROM shop_quotes WHERE quote_id = $1::uuid`,
      f.quote.quote_id,
    );
    expect(q).toMatchObject({ waive_withdrawal: true, buyer_company: 'ACME GmbH' });
  });
});
