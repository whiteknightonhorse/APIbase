/**
 * T-INT-11 FE1-FE8: shop_fee_ledger / fee_settlement on PAID, the §5.4 execution_ledger cost
 * (our fee, not the turnover) and the duplicate-MPP refund (§8.1 item 7 c). Real Postgres
 * (TEST_DATABASE_URL, disposable). Mocked: facilitator verify/settle, the replay-guard Redis,
 * @x402 payload decoding. Zero real verify/settle/RPC.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { toMicroUsdc } from '../../src/config/x402.config';
import { escrowQuotePayment } from '../../src/pipeline/stages/escrow.stage';
import { escrowFinalizeStage } from '../../src/pipeline/stages/escrow-finalize.stage';
import { ledgerWriteStage } from '../../src/pipeline/stages/ledger-write.stage';
import { payQuote } from '../../src/shop/pay.service';
import { createQuote } from '../../src/shop/quote.service';
import type { PipelineContext } from '../../src/pipeline/types';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { client, dbDescribe, migrate, mkMerchant } from './helpers/shop-db';

// ledger.service builds its own lazy PrismaClient from the default connection variable: point it at
// the disposable DB before the first write so no other database can receive these rows.
if (process.env['TEST_DATABASE_URL'])
  process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'];

const mockDb: { c?: ReturnType<typeof client> } = {};
jest.mock('../../src/services/prisma.service', () => ({ getPrisma: () => mockDb.c }));
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
jest.mock('@x402/core/http', () => ({
  decodePaymentSignatureHeader: (h: string) => JSON.parse(h),
  encodePaymentRequiredHeader: () => 'x',
}));
jest.mock('@x402/core/schemas', () => ({
  parsePaymentPayload: (d: unknown) => ({ success: true, data: d }),
}));
const claimed = new Set<string>();
jest.mock('../../src/services/payment-nonce.service', () => ({
  claimPaymentNonce: async (_r: string, n: string) => {
    if (claimed.has(n)) return false;
    claimed.add(n);
    return true;
  },
}));
const mockVerify = jest.fn();
const mockSettle = jest.fn();
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({ verifyPayment: mockVerify, settlePayment: mockSettle }),
}));
jest.mock('../../src/services/redis.service', () => ({}));
// The facilitator leg of ESCROW_FINALIZE is not under test (no money moves here).
jest.mock('../../src/pipeline/stages/x402-settle', () => ({ settleX402: jest.fn() }));

type Row = Record<string, any>;
const E = process['env'];
const PLATFORM = '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480';
const TEMPO_PLATFORM = '0x9E29FF84B0f3EDa9756262d2F950C435495BA8cC';
const PAYOUT = '0x00000000000000000000000000000000000b0b0b';
const PAYOUT_TEMPO = '0x00000000000000000000000000000000000c0c0c';
const FEE_WALLET = '0x00000000000000000000000000000000000fee00';
const WALLET = '0x00000000000000000000000000000000000a11ce';
const NETWORK = 'eip155:8453';

dbDescribe('shop fee ledger, ledger cost, duplicate MPP refund', () => {
  const prisma = client();
  mockDb.c = prisma;
  const deps: ShopDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: { incr: async () => 1, expire: async () => 1 } as never,
  };
  let n = 0;
  const tag = () => `${Date.now().toString(36)}f${n++}`;
  const orders: string[] = [];

  beforeAll(async () => {
    migrate();
    await prisma.$executeRawUnsafe(
      `INSERT INTO tools (tool_id, name, provider, category, namespace, status_source, status_reason, status_changed_at)
       VALUES ('shop.order.pay', 'shop.order.pay', 'shop', 'shop', 'shop', 'manual', 'test fixture', now())
       ON CONFLICT DO NOTHING`,
    );
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(() => {
    Object.assign(E, {
      INTEGRATOR_FEE_ENABLED: 'true',
      INTEGRATOR_BASE_ORDERS_ENABLED: 'true',
      MPP_ENABLED: 'true',
      INTEGRATOR_TEST_SKU_DAILY_CAP: '30',
      INTEGRATOR_FEE_WALLET: FEE_WALLET,
      PUBLIC_BASE_URL: 'https://apibase.pro',
    });
    mockVerify.mockReset().mockImplementation(async (p: any) => ({
      isValid: true,
      payer: p.payload.authorization.from,
    }));
    mockSettle
      .mockReset()
      .mockImplementation(async () => ({ success: true, transaction: `0x${tag()}` }));
    claimed.clear();
  });

  async function fixture(price: number, test = false) {
    const m = await mkMerchant(prisma, tag());
    for (const doc_id of ['merchant-agreement', 'aup', 'dpa', 'refund-framework']) {
      const have = await prisma.$queryRawUnsafe<unknown[]>(
        `SELECT 1 FROM shop_legal_docs WHERE doc_id = $1`,
        doc_id,
      );
      if (have.length === 0) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO shop_legal_docs (doc_id, version, sha256, url, effective_from, body_md)
           VALUES ($1, 'int11', $2, $3, now() - interval '1 day', 'b')`,
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
      m,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE shop_merchants SET status = 'active', payout_wallet_base = $2, payout_wallet_tempo = $3,
              created_at = now() - interval '90 days' WHERE merchant_id = $1::uuid`,
      m,
      PAYOUT,
      PAYOUT_TEMPO,
    );
    const sku = test ? '__apibase_test' : `sku-${tag()}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_products (merchant_id, sku, title, price_usd, available, is_test, category, fulfillment_mode)
       VALUES ($1::uuid, $2, 'Thing', $3::numeric, NULL, $4, 'books', 'instant')`,
      m,
      sku,
      price,
      test,
    );
    const b = { identity: `agent:${tag()}` };
    const quote = await createQuote(deps, m, b, { items: [{ sku, qty: 1 }] });
    orders.push(quote.order_id);
    const fee = (
      await prisma.$queryRawUnsafe<Row[]>(
        `SELECT fee_usd::float8 AS fee FROM shop_quotes WHERE quote_id = $1::uuid`,
        quote.quote_id,
      )
    )[0].fee as number;
    return { m, b, quote, price, fee };
  }
  type Fx = Awaited<ReturnType<typeof fixture>>;
  const rows = (sql: string, ...v: unknown[]) => prisma.$queryRawUnsafe<Row[]>(sql, ...v);
  const feeRows = (f: Fx) =>
    rows(
      `SELECT mode, status, fee_usd::text AS fee FROM shop_fee_ledger WHERE order_id = $1::uuid ORDER BY created_at`,
      f.quote.order_id,
    );
  const order = async (f: Fx) =>
    (
      await rows(
        `SELECT state, fee_settlement FROM shop_orders WHERE order_id = $1::uuid`,
        f.quote.order_id,
      )
    )[0];

  /** Base / x402 payment of the quote's exact total. */
  const payBase = (f: Fx) =>
    payQuote(deps, {
      quote_id: f.quote.quote_id,
      x402PaymentHeader: JSON.stringify({
        accepted: { network: NETWORK },
        payload: {
          authorization: {
            from: WALLET,
            to: PAYOUT,
            value: toMicroUsdc(f.price),
            validAfter: '0',
            validBefore: String(Math.floor(Date.now() / 1000) + 600),
            nonce: `0x${randomBytes(32).toString('hex')}`,
          },
        },
      }),
      buyer: f.b,
      requestId: `r-${tag()}`,
      host: 'apibase.pro',
    });

  /** Tempo / MPP: what mppMiddleware leaves on the context after charge() succeeded. */
  const mppCtx = (f: Fx, o: { splits?: boolean; agentId?: string } = {}): PipelineContext => {
    return {
      requestId: `r-${tag()}`,
      toolId: 'shop.order.pay',
      agentId: o.agentId ?? f.b.identity,
      body: { quote_id: f.quote.quote_id },
      headers: {},
      mppPaid: true,
      mppPayer: WALLET,
      mppAmount: String(f.price),
      mppTxHash: `0x${randomBytes(32).toString('hex')}`,
      mppRecipient: PAYOUT_TEMPO,
      mppSplits: o.splits ? [{ recipient: FEE_WALLET, amount: String(f.fee) }] : undefined,
      mppPaymentHeader: `Payment ${Buffer.from(
        JSON.stringify({ challenge: { id: `ch-${tag()}` } }),
      ).toString('base64')}`,
    } as unknown as PipelineContext;
  };

  it('FE1: Tempo, fee on, $89 -> in_tx/collected/1.34, fee_settlement in_tx', async () => {
    const f = await fixture(89);
    const res = await escrowQuotePayment(deps, mppCtx(f, { splits: true }));
    expect(res.ok).toBe(true);
    expect(await feeRows(f)).toEqual([{ mode: 'in_tx', status: 'collected', fee: '1.340000' }]);
    expect(await order(f)).toMatchObject({
      state: expect.stringMatching(/^(PAID|FULFILLED)/),
      fee_settlement: 'in_tx',
    });
  });

  it('FE2: Base, fee on -> receivable/owed, fee_settlement receivable', async () => {
    const f = await fixture(89);
    const r = await payBase(f);
    expect(r.status).toBe(200);
    expect(await feeRows(f)).toEqual([{ mode: 'receivable', status: 'owed', fee: '1.340000' }]);
    expect((await order(f)).fee_settlement).toBe('receivable');
  });

  it('FE3: fee switch off -> no ledger row, fee_settlement none (both rails)', async () => {
    E['INTEGRATOR_FEE_ENABLED'] = 'false';
    const base = await fixture(89);
    expect((await payBase(base)).status).toBe(200);
    const tempo = await fixture(89);
    expect((await escrowQuotePayment(deps, mppCtx(tempo))).ok).toBe(true);
    for (const f of [base, tempo]) {
      expect(await feeRows(f)).toEqual([]);
      expect((await order(f)).fee_settlement).toBe('none');
    }
  });

  it('FE4: test SKU, fee on -> none, execution_ledger.cost_usd = 0', async () => {
    const f = await fixture(5, true);
    const agent = await newAgent();
    const ctx = mppCtx(f, { agentId: agent });
    expect((await escrowQuotePayment(deps, ctx)).ok).toBe(true);
    expect(await feeRows(f)).toEqual([]);
    expect((await order(f)).fee_settlement).toBe('none');
    await finishToLedger(ctx);
    expect((await ledger(ctx)).cost_usd).toBe('0.00000000');
  });

  async function newAgent(): Promise<string> {
    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO agents (agent_id, api_key_hash) VALUES ($1::uuid, $2)`,
      id,
      id.replace(/-/g, '').padEnd(64, '0'),
    );
    return id;
  }
  /** ESCROW_FINALIZE then LEDGER_WRITE, exactly as the pipeline runs them after a served call. */
  async function finishToLedger(ctx: PipelineContext) {
    ctx.providerCalled = true;
    ctx.providerResponse = { status: 'paid' } as never;
    ctx.executionId = randomUUID();
    expect((await escrowFinalizeStage.execute(ctx)).ok).toBe(true);
    expect((await ledgerWriteStage.execute(ctx)).ok).toBe(true);
  }
  const ledger = async (ctx: PipelineContext) =>
    (
      await rows(
        `SELECT tool_id, payer, billing_status, cost_usd::text AS cost_usd
           FROM execution_ledger WHERE execution_id = $1::uuid`,
        ctx.executionId,
      )
    )[0];

  it('FE5: execution_ledger for a $89 order -> cost_usd 1.34 (not 89), shop.order.pay, payer = wallet', async () => {
    const f = await fixture(89);
    const agent = await newAgent();
    const ctx = mppCtx(f, { splits: true, agentId: agent });
    expect((await escrowQuotePayment(deps, ctx)).ok).toBe(true);
    expect(ctx.quoteFeeUsd).toBe(1.34);
    await finishToLedger(ctx);
    expect(await ledger(ctx)).toEqual({
      tool_id: 'shop.order.pay',
      payer: WALLET,
      billing_status: 'PAID',
      cost_usd: '1.34000000',
    });
    // The link to the order is the request_id inside the PAID event payload (no new column).
    const ev = await rows(
      `SELECT 1 FROM shop_order_events WHERE order_id = $1::uuid AND payload->>'request_id' = $2`,
      f.quote.order_id,
      ctx.requestId,
    );
    expect(ev.length).toBeGreaterThan(0);
  });

  /** A $89 order already PAID over Tempo, then a second credential settled for the same quote. */
  async function duplicate(splits: boolean) {
    const f = await fixture(89);
    expect((await escrowQuotePayment(deps, mppCtx(f, { splits }))).ok).toBe(true);
    const ctx = mppCtx(f, { splits });
    const res = await escrowQuotePayment(deps, ctx);
    return { f, ctx, res };
  }
  const refunds = (f: Fx) =>
    rows(
      `SELECT amount_usd::text AS amount, reason, requested_by, status, verified,
              extract(epoch FROM (due_at - now())) / 86400 AS days
         FROM shop_refunds WHERE order_id = $1::uuid`,
      f.quote.order_id,
    );
  const outbox = async (type: string, ctx: PipelineContext) =>
    (
      await rows(
        `SELECT payload FROM outbox WHERE event_type = $1 AND payload->>'request_id' = $2`,
        type,
        ctx.requestId,
      )
    ).length;

  it('FE6: duplicate credential on a PAID quote -> 402, one shop_refunds(duplicate), written_off, no mpp_refund_owed', async () => {
    const { f, ctx, res } = await duplicate(true);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(402);
    const r = await refunds(f);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      amount: '89.000000',
      reason: 'duplicate',
      requested_by: 'system',
      status: 'awaiting_merchant_tx',
      verified: false,
    });
    expect(Number(r[0].days)).toBeGreaterThan(6.99);
    expect(Number(r[0].days)).toBeLessThanOrEqual(7);
    expect(await feeRows(f)).toEqual([
      { mode: 'in_tx', status: 'collected', fee: '1.340000' },
      { mode: 'in_tx', status: 'written_off', fee: '1.340000' },
    ]);
    expect(await outbox('mpp_refund_owed', ctx)).toBe(0);
    expect(await outbox('shop.refund.requested', ctx)).toBe(1);
    expect(ctx.mppRefundRecorded).toBe(true);
  });

  it('FE7: the same duplicate with the fee switch off -> no fee ledger rows, one shop_refunds', async () => {
    E['INTEGRATOR_FEE_ENABLED'] = 'false';
    const { f, ctx, res } = await duplicate(false);
    expect(res.ok).toBe(false);
    expect(await feeRows(f)).toEqual([]);
    expect(await refunds(f)).toHaveLength(1);
    expect(await outbox('mpp_refund_owed', ctx)).toBe(0);
    expect(ctx.mppRefundRecorded).toBe(true);
  });

  it('FE8: shop_payments.pay_to is never the platform, Tempo or fee wallet (all fixtures above)', async () => {
    expect(orders.length).toBeGreaterThanOrEqual(8);
    const bad = await rows(
      `SELECT pay_to FROM shop_payments WHERE order_id = ANY($1::uuid[])
          AND lower(pay_to) = ANY($2::text[])`,
      orders,
      [PLATFORM, TEMPO_PLATFORM, FEE_WALLET].map((w) => w.toLowerCase()),
    );
    expect(bad).toEqual([]);
    const some = await rows(
      `SELECT count(*)::int AS c FROM shop_payments WHERE order_id = ANY($1::uuid[])`,
      orders,
    );
    expect(some[0].c).toBeGreaterThan(0);
  });
});
