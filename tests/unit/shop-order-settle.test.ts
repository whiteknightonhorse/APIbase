/**
 * T-INT-09 SE1-SE10: settle BEFORE delivery, delivery by the internal `shop` adapter, the
 * reconcile job and the daily receipt sample, against a real Postgres (TEST_DATABASE_URL,
 * disposable). Mocked boundaries: facilitator verify/settle (the REAL LocalFacilitatorClient sits
 * in front of a fake local + fake PayAI), the replay-guard Redis, @x402 decoding, the chain (viem).
 */
import { createHash, randomBytes } from 'node:crypto';
import { toMicroUsdc } from '../../src/config/x402.config';
import { payQuote } from '../../src/shop/pay.service';
import { createQuote } from '../../src/shop/quote.service';
import { getOrderView } from '../../src/shop/order-payment.service';
import { encryptSecret } from '../../src/services/secret-crypto.service';
import {
  run as reconcile,
  runDailySample,
  type ChainReader,
} from '../../src/jobs/shop-payment-reconcile.job';
import { LocalFacilitatorClient } from '../../src/payments/local-facilitator';
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
jest.mock('../../src/payments/operator-signer', () => ({ getOperatorWallet: jest.fn() }));
jest.mock('../../src/payments/operator-lock', () => ({
  withOperatorLock: async (_a: string, fn: () => Promise<unknown>) => fn(),
}));
jest.mock('../../src/services/metrics.service', () => ({
  x402LocalSettleTotal: { inc: jest.fn() },
  x402LocalSettleDurationSeconds: { observe: jest.fn() },
}));
jest.mock('@x402/core/http', () => ({
  decodePaymentSignatureHeader: (h: string) => JSON.parse(h),
  encodePaymentRequiredHeader: () => 'x',
}));
jest.mock('@x402/core/schemas', () => ({
  parsePaymentPayload: (d: unknown) => ({ success: true, data: d }),
}));
let claimDown = false;
const claimed = new Set<string>();
const mockClaim = jest.fn(async (_rail: string, nonce: string) => {
  if (claimDown) throw new Error('redis down');
  if (claimed.has(nonce)) return false;
  claimed.add(nonce);
  return true;
});
jest.mock('../../src/services/payment-nonce.service', () => ({
  claimPaymentNonce: (r: string, n: string) => mockClaim(r, n),
}));
// local facilitator and PayAI fallback, behind the REAL LocalFacilitatorClient
const localSettle = jest.fn();
const payaiSettle = jest.fn();
const mockVerify = jest.fn();
const facilitator = new LocalFacilitatorClient({ settle: localSettle } as never, '0xoperator', {
  settle: payaiSettle,
} as never);
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({
    verifyPayment: mockVerify,
    settlePayment: (p: never, r: never) => facilitator.settle(p, r),
  }),
}));
jest.mock('../../src/services/redis.service', () => ({}));

type Row = Record<string, any>;
const E = process['env'];
const PAYOUT = '0x00000000000000000000000000000000000b0b0b';
const PAYER = '0x00000000000000000000000000000000000a11ce';
const NETWORK = 'eip155:8453';
const KEY = 'k'.repeat(40);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

dbDescribe('shop.order.pay: settle before delivery, reconcile', () => {
  const prisma = client();
  const deps: ShopDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: { incr: async () => 1, expire: async () => 1 } as never,
  };
  let n = 0;
  const tag = () => `${Date.now().toString(36)}s${n++}`;
  const buyer = () => ({ identity: `agent:${tag()}` });

  beforeAll(() => migrate());
  afterAll(() => prisma.$disconnect());
  beforeEach(() => {
    Object.assign(E, {
      INTEGRATOR_FEE_ENABLED: 'false',
      INTEGRATOR_BASE_ORDERS_ENABLED: 'true',
      MPP_ENABLED: 'true',
      INTEGRATOR_TEST_SKU_DAILY_CAP: '30',
      PUBLIC_BASE_URL: 'https://apibase.pro',
    });
    mockVerify.mockReset().mockImplementation(async (p: any) => ({
      isValid: true,
      payer: p.payload.authorization.from,
    }));
    localSettle.mockReset().mockResolvedValue({ success: true, transaction: '0xabc' });
    payaiSettle.mockReset().mockResolvedValue({ success: true, transaction: '0xpayai' });
    mockClaim.mockClear();
    claimed.clear();
    claimDown = false;
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
  async function product(
    merchant_id: string,
    price: number,
    o: { test?: boolean; payload?: string } = {},
  ) {
    const sku = o.test ? '__apibase_test' : `sku-${tag()}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_products (merchant_id, sku, title, price_usd, available, is_test, category,
                                  fulfillment_mode, fulfillment_payload_encrypted)
       VALUES ($1::uuid, $2, 'Thing', $3::numeric, 10, $4, 'books', 'instant', $5)`,
      merchant_id,
      sku,
      price,
      o.test ?? false,
      o.payload ? encryptSecret(o.payload, KEY) : null,
    );
    return sku;
  }
  async function fixture(price = 5, o: { test?: boolean; payload?: string } = {}) {
    const m = await mkMerchant(prisma, tag());
    await activate(m);
    const sku = await product(m, price, { payload: 'the-secret-code', ...o });
    const b = buyer();
    const quote = await createQuote(deps, m, b, { items: [{ sku, qty: 1 }] });
    return { m, b, quote, sku };
  }
  type F = Awaited<ReturnType<typeof fixture>>;
  const row = async (sql: string, ...v: unknown[]) =>
    (await prisma.$queryRawUnsafe<Row[]>(sql, ...v))[0];
  const count = async (sql: string, ...v: unknown[]) => Number((await row(sql, ...v)).c);

  const header = (o: { value: string; nonce?: string } = { value: '' }) =>
    JSON.stringify({
      accepted: { network: NETWORK },
      payload: {
        authorization: {
          from: PAYER,
          to: PAYOUT,
          value: o.value,
          validAfter: '0',
          validBefore: String(Math.floor(Date.now() / 1000) + 600),
          nonce: o.nonce ?? `0x${randomBytes(32).toString('hex')}`,
        },
      },
    });
  const pay = (
    f: F,
    o: { header?: string | null; waive?: boolean; who?: { identity: string } } = {},
  ) =>
    payQuote(deps, {
      quote_id: f.quote.quote_id,
      x402PaymentHeader:
        o.header === null
          ? undefined
          : (o.header ?? header({ value: toMicroUsdc(f.quote.total_usd) })),
      buyer: o.who ?? f.b,
      requestId: 'r-1',
      host: 'apibase.pro',
      waive_withdrawal: o.waive,
      buyer_agent: { client_name: 'claude-test', client_version: '9.9' },
    });
  const order = (f: F) =>
    row(`SELECT * FROM shop_orders WHERE order_id = $1::uuid`, f.quote.order_id);
  const states = async (f: F) =>
    (
      await prisma.$queryRawUnsafe<Row[]>(
        `SELECT to_state FROM shop_order_events WHERE order_id = $1::uuid ORDER BY seq`,
        f.quote.order_id,
      )
    ).map((r) => r.to_state);

  it('SE3: settle success -> PAID -> CONFIRMED -> FULFILLED, ledger side effects, +14d close_after', async () => {
    const f = await fixture();
    const r = await pay(f);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('paid');
    expect((r.body.order as Row).fulfillment).toBe('the-secret-code');
    expect(await states(f)).toEqual(['QUOTED', 'PAYING', 'PAID', 'CONFIRMED', 'FULFILLED']);
    const o = await order(f);
    expect(o.tx_hash).toBe('0xabc');
    expect(o.fulfillment_status).toBe('fulfilled');
    const days = (new Date(o.close_after).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
    const p = await row(`SELECT * FROM shop_payments WHERE order_id = $1::uuid`, f.quote.order_id);
    expect(p.chain_status).toBe('confirmed');
    expect(p.tx_hash).toBe('0xabc');
    expect(p.confirmed_at).not.toBeNull();
    expect(
      (await row(`SELECT status FROM shop_quotes WHERE quote_id = $1::uuid`, f.quote.quote_id))
        .status,
    ).toBe('paid');
    const prod = await row(
      `SELECT available, reserved FROM shop_products WHERE merchant_id = $1::uuid AND sku = $2`,
      f.m,
      f.sku,
    );
    expect([prod.available, prod.reserved]).toEqual([9, 0]);
    expect(
      await count(
        `SELECT count(*) AS c FROM outbox WHERE event_type = 'shop.order.paid' AND payload->>'order_id' = $1`,
        f.quote.order_id,
      ),
    ).toBe(1);
  });

  it('SE3: waive_withdrawal -> CLOSED at once; the test SKU delivers "test ok"', async () => {
    const f = await fixture();
    const r = await pay(f, { waive: true });
    expect(r.status).toBe(200);
    expect((r.body.order as Row).state).toBe('CLOSED');
    expect(await states(f)).toEqual([
      'QUOTED',
      'PAYING',
      'PAID',
      'CONFIRMED',
      'FULFILLED',
      'CLOSED',
    ]);
    const t = await fixture(1, { test: true });
    const rt = await pay(t);
    expect((rt.body.order as Row).fulfillment).toBe('test ok');
  });

  it('SE1: fulfillment only for the payer identity, repeatable; already_placed for the payer, 402 for others', async () => {
    const f = await fixture();
    await pay(f);
    const id = f.quote.order_id;
    const a = await getOrderView(deps.db, id, f.b.identity);
    expect(a.fulfillment).toBe('the-secret-code');
    expect((await getOrderView(deps.db, id, f.b.identity)).fulfillment).toBe('the-secret-code');
    const other = await getOrderView(deps.db, id, 'agent:someone-else');
    expect(other.fulfillment).toBeUndefined();
    expect('fulfillment' in other).toBe(false);
    expect(other.state).toBe('FULFILLED');
    // the paying wallet's own identity counts as the payer too
    expect((await getOrderView(deps.db, id, `wallet:${sha(PAYER)}`)).fulfillment).toBe(
      'the-secret-code',
    );

    const again = await pay(f, { header: null });
    expect(again.status).toBe(200);
    expect(again.body.status).toBe('already_placed');
    expect((again.body.order as Row).fulfillment).toBe('the-secret-code');
    expect(localSettle).toHaveBeenCalledTimes(1);
    const stranger = await pay(f, { header: null, who: { identity: 'agent:stranger' } });
    expect(stranger.status).toBe(402);
  });

  it('SE2: settle success:false (revert after verify) -> PAYMENT_FAILED, nothing delivered, 402, one settle, PayAI untouched', async () => {
    localSettle.mockResolvedValue({ success: false, errorReason: 'transaction_failed' });
    const f = await fixture();
    const r = await pay(f);
    expect(r.status).toBe(402);
    expect(r.body.error).toBe('payment_required');
    expect(await states(f)).toEqual(['QUOTED', 'PAYING', 'PAYMENT_FAILED']);
    const o = await order(f);
    expect(o.fulfillment_status).not.toBe('fulfilled');
    expect(o.fulfillment_payload_enc).toBeNull();
    expect(localSettle).toHaveBeenCalledTimes(1);
    expect(payaiSettle).not.toHaveBeenCalled();
    expect(
      (
        await row(
          `SELECT chain_status FROM shop_payments WHERE order_id = $1::uuid`,
          f.quote.order_id,
        )
      ).chain_status,
    ).toBe('failed');
    expect(
      (await row(`SELECT status FROM shop_quotes WHERE quote_id = $1::uuid`, f.quote.quote_id))
        .status,
    ).toBe('open');
  });

  it('SE2: PayAI only when the LOCAL facilitator throws', async () => {
    localSettle.mockRejectedValue(new Error('rpc down'));
    const f = await fixture();
    const r = await pay(f);
    expect(r.status).toBe(200);
    expect(payaiSettle).toHaveBeenCalledTimes(1);
    expect((await order(f)).tx_hash).toBe('0xpayai');
  });

  it('SE4: empty transaction -> PAYING + 202 payment_pending; reconcile finds the Transfer -> PAID, delivered once', async () => {
    localSettle.mockResolvedValue({ success: true, transaction: '' });
    const f = await fixture();
    const r = await pay(f);
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ status: 'payment_pending', order_id: f.quote.order_id });
    expect((await order(f)).state).toBe('PAYING');

    const chain: ChainReader = {
      authorizationUsed: async () => true,
      findTransfer: jest.fn(async () => '0xfromlog'),
      receiptOk: async () => true,
    };
    await reconcile({ deps, chain });
    await reconcile({ deps, chain });
    const o = await order(f);
    expect(o.state).toBe('FULFILLED');
    expect(o.tx_hash).toBe('0xfromlog');
    expect((await states(f)).filter((s) => s === 'FULFILLED')).toHaveLength(1);
    expect(
      await count(
        `SELECT count(*) AS c FROM outbox WHERE event_type = 'shop.order.paid' AND payload->>'order_id' = $1`,
        f.quote.order_id,
      ),
    ).toBe(1);
    expect((await getOrderView(deps.db, f.quote.order_id, f.b.identity)).fulfillment).toBe(
      'the-secret-code',
    );
  });

  it('SE4: nothing on-chain and reconcile_until passed -> PAYMENT_FAILED for good, reservation released; RPC down -> untouched', async () => {
    localSettle.mockResolvedValue({ success: true, transaction: '' });
    const f = await fixture();
    await pay(f);
    await prisma.$executeRawUnsafe(
      `UPDATE shop_payments SET reconcile_until = now() - interval '1 minute' WHERE order_id = $1::uuid`,
      f.quote.order_id,
    );
    const down: ChainReader = {
      authorizationUsed: async () => {
        throw new Error('rpc');
      },
      findTransfer: async () => undefined,
      receiptOk: async () => true,
    };
    await reconcile({ deps, chain: down });
    expect((await order(f)).state).toBe('PAYING');

    const none: ChainReader = {
      authorizationUsed: async () => false,
      findTransfer: async () => undefined,
      receiptOk: async () => true,
    };
    await reconcile({ deps, chain: none });
    expect((await order(f)).state).toBe('PAYMENT_FAILED');
    expect(
      (await row(`SELECT status FROM shop_quotes WHERE quote_id = $1::uuid`, f.quote.quote_id))
        .status,
    ).toBe('expired');
    const prod = await row(
      `SELECT available, reserved FROM shop_products WHERE merchant_id = $1::uuid AND sku = $2`,
      f.m,
      f.sku,
    );
    expect([prod.available, prod.reserved]).toEqual([10, 0]);
  });

  it('SE5: a retry after PAYMENT_FAILED (new nonce) reuses the same order row', async () => {
    localSettle.mockResolvedValueOnce({ success: false, errorReason: 'transaction_failed' });
    const f = await fixture();
    expect((await pay(f)).status).toBe(402);
    expect((await pay(f)).status).toBe(200);
    expect(
      await count(
        `SELECT count(*) AS c FROM shop_orders WHERE quote_id = $1::uuid`,
        f.quote.quote_id,
      ),
    ).toBe(1);
    expect(
      await count(
        `SELECT count(*) AS c FROM shop_payments WHERE order_id = $1::uuid`,
        f.quote.order_id,
      ),
    ).toBe(2);
    expect(await states(f)).toEqual([
      'QUOTED',
      'PAYING',
      'PAYMENT_FAILED',
      'PAYING',
      'PAID',
      'CONFIRMED',
      'FULFILLED',
    ]);
  });

  it('SE6: a second live order row for a quote is impossible; a replayed X-Payment after PAID -> 402', async () => {
    const f = await fixture();
    const h = header({ value: toMicroUsdc(f.quote.total_usd) });
    expect((await pay(f, { header: h })).status).toBe(200);
    const replay = await pay(f, { header: h });
    expect(replay.status).toBe(402);
    expect(localSettle).toHaveBeenCalledTimes(1);
    expect(
      await count(
        `SELECT count(*) AS c FROM shop_orders WHERE quote_id = $1::uuid`,
        f.quote.quote_id,
      ),
    ).toBe(1);
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO shop_orders (quote_id, merchant_id, state, total_usd) VALUES ($1::uuid, $2::uuid, 'PAYING', 5)`,
        f.quote.quote_id,
        f.m,
      ),
    ).rejects.toThrow(/23505|already exists/i);
  });

  it('SE6: the same X-Payment after a failed settle is refused at the nonce claim, no second settle', async () => {
    localSettle.mockResolvedValueOnce({ success: false, errorReason: 'transaction_failed' });
    const f = await fixture();
    const h = header({ value: toMicroUsdc(f.quote.total_usd) });
    expect((await pay(f, { header: h })).status).toBe(402);
    expect((await pay(f, { header: h })).status).toBe(402);
    expect(mockClaim).toHaveBeenCalledTimes(2);
    expect(localSettle).toHaveBeenCalledTimes(1);
    expect((await order(f)).state).toBe('PAYMENT_FAILED');
  });

  it('SE6: PAYMENT_FAILED row + a racing live row -> the retry is a 402, one delivery at most', async () => {
    localSettle.mockResolvedValueOnce({ success: false, errorReason: 'transaction_failed' });
    const f = await fixture();
    await pay(f);
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_orders (quote_id, merchant_id, state, total_usd) VALUES ($1::uuid, $2::uuid, 'PAYING', 5)`,
      f.quote.quote_id,
      f.m,
    );
    const r = await pay(f);
    expect(r.status).toBe(402);
    expect(localSettle).toHaveBeenCalledTimes(1);
    expect(
      await count(
        `SELECT count(*) AS c FROM shop_orders WHERE quote_id = $1::uuid AND fulfillment_status = 'fulfilled'`,
        f.quote.quote_id,
      ),
    ).toBe(0);
  });

  it('SE8: the PAID event carries request_id, client name and an 8-char wallet hash, never the wallet', async () => {
    const f = await fixture();
    await pay(f);
    const ev = await row(
      `SELECT payload FROM shop_order_events WHERE order_id = $1::uuid AND to_state = 'PAID'`,
      f.quote.order_id,
    );
    expect(ev.payload.request_id).toBe('r-1');
    expect(ev.payload.buyer_agent.client_name).toBe('claude-test');
    expect(ev.payload.buyer_agent.client_version).toBe('9.9');
    expect(ev.payload.buyer_agent.wallet_hash_prefix).toBe(sha(PAYER).slice(0, 8));
    expect(ev.payload.buyer_agent.wallet_hash_prefix).toHaveLength(8);
    expect(JSON.stringify(ev.payload).toLowerCase()).not.toContain(PAYER.toLowerCase());
  });

  it('SE9: the daily sample flags a confirmed payment with no receipt; no automatic branch; RPC down -> nothing', async () => {
    const f = await fixture();
    await pay(f);
    // the sample is 100 random rows of the last day: age everything else out so this one is certain
    await prisma.$executeRawUnsafe(
      `UPDATE shop_payments SET confirmed_at = now() - interval '2 days'
        WHERE chain_status = 'confirmed' AND order_id <> $1::uuid`,
      f.quote.order_id,
    );
    const review = () =>
      count(
        `SELECT count(*) AS c FROM shop_moderation_reviews WHERE merchant_id = $1::uuid AND category = 'payment_mismatch'`,
        f.m,
      );
    const gone: ChainReader = {
      authorizationUsed: async () => true,
      findTransfer: async () => undefined,
      receiptOk: async () => {
        throw new Error('rpc');
      },
    };
    await runDailySample({ deps, chain: gone });
    expect(await review()).toBe(0);
    await runDailySample({ deps, chain: { ...gone, receiptOk: async () => false } });
    expect(await review()).toBe(1);
    const rv = await row(
      `SELECT * FROM shop_moderation_reviews WHERE merchant_id = $1::uuid AND category = 'payment_mismatch'`,
      f.m,
    );
    expect([rv.scope, rv.layer, rv.verdict, rv.evidence_hash]).toEqual([
      'merchant',
      'rules',
      'flag',
      sha('0xabc'),
    ]);
    expect((await order(f)).state).toBe('FULFILLED');
  });

  it('SE10: replay guard (Redis) down -> 503 before settle, no facilitator call, nothing delivered', async () => {
    claimDown = true;
    const f = await fixture();
    const r = await pay(f);
    expect(r.status).toBe(503);
    expect(localSettle).not.toHaveBeenCalled();
    expect(payaiSettle).not.toHaveBeenCalled();
    expect((await order(f)).state).toBe('QUOTED');
  });
});
