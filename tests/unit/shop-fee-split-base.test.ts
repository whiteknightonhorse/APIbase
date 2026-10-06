/**
 * T-INT-42 FS0-FS10: Base fee-split for `shop.order.pay` — two EIP-3009 authorizations settled
 * atomically through Multicall3 `aggregate3`. Real Postgres (TEST_DATABASE_URL, disposable), real
 * x402 header decode/parse, real LocalFacilitatorClient.settleFeeSplit. Mocked boundaries:
 * facilitator verify, the replay-guard Redis, the operator signer (writeContract / receipt).
 * Zero real RPC or transactions.
 */
import { randomBytes } from 'node:crypto';
import { decodeFunctionData, parseAbi } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { toMicroUsdc } from '../../src/config/x402.config';
import { payQuote } from '../../src/shop/pay.service';
import { createQuote } from '../../src/shop/quote.service';
import { run as reconcile, type ChainReader } from '../../src/jobs/shop-payment-reconcile.job';
import {
  buildFeeSplitPaymentPayload,
  buildFeeSplitXPayment,
  type FeeSplitChallenge,
} from '../../scripts/shop/examples/x402-fee-split-client';
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
// Replay guard + its Redis: one shared key set, so a rollback (`del`) is observable ("Redis empty").
const claimed = new Set<string>();
const mockClaim = jest.fn(async (_rail: string, nonce: string) => {
  if (claimed.has(nonce)) return false;
  claimed.add(nonce);
  return true;
});
jest.mock('../../src/services/payment-nonce.service', () => ({
  claimPaymentNonce: (r: string, n: string) => mockClaim(r, n),
}));
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: async () => ({
    del: async (...keys: string[]) => {
      for (const k of keys) claimed.delete(k.replace('payment-nonce:x402:', ''));
      return keys.length;
    },
  }),
}));
const mockVerify = jest.fn();
const mockSettle = jest.fn();
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({ verifyPayment: mockVerify, settlePayment: mockSettle }),
}));
// Operator signer: the only thing that would touch the chain.
const MULTICALL3 = '0xca11bde05977b3631167028862be2a173976ca11';
const mockWrite = jest.fn();
const mockReceipt = jest.fn();
jest.mock('../../src/payments/operator-signer', () => ({
  getOperatorWallet: () => ({
    address: '0x00000000000000000000000000000000000000a0',
    signer: {
      chain: { contracts: { multicall3: { address: MULTICALL3 } } },
      writeContract: (a: unknown) => mockWrite(a),
      waitForTransactionReceipt: (a: unknown) => mockReceipt(a),
    },
  }),
}));
jest.mock('../../src/payments/operator-lock', () => ({
  withOperatorLock: (_addr: string, fn: () => Promise<unknown>) => fn(),
}));

type Row = Record<string, any>;
const E = process['env'];
const PLATFORM = '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480';
const PAYOUT = '0x00000000000000000000000000000000000b0b0b';
const FEE_WALLET = '0x00000000000000000000000000000000000fee00';
const FEE_WALLET_BASE = '0x00000000000000000000000000000000000fee0b';
const TEMPO = '0x9E29FF84B0f3EDa9756262d2F950C435495BA8cC';
const TX = `0x${'ab'.repeat(32)}`;
const usdcAbi = parseAbi([
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)',
]);

dbDescribe('shop.order.pay: Base fee-split via Multicall3', () => {
  const prisma = client();
  const deps: ShopDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: { incr: async () => 1, expire: async () => 1 } as never,
  };
  const orders: string[] = [];
  let n = 0;
  const tag = () => `${Date.now().toString(36)}f${n++}`;
  const buyer = () => ({ identity: `agent:${tag()}` });
  const account = privateKeyToAccount(generatePrivateKey());

  beforeAll(() => migrate());
  afterAll(() => prisma.$disconnect());
  beforeEach(() => {
    Object.assign(E, {
      INTEGRATOR_FEE_ENABLED: 'true',
      INTEGRATOR_BASE_ORDERS_ENABLED: 'true',
      MPP_ENABLED: 'true',
      INTEGRATOR_TEST_SKU_DAILY_CAP: '30',
      INTEGRATOR_FEE_WALLET: FEE_WALLET,
      INTEGRATOR_FEE_WALLET_BASE: FEE_WALLET_BASE,
      PUBLIC_BASE_URL: 'https://apibase.pro',
    });
    mockVerify.mockReset().mockImplementation(async (p: any) => ({
      isValid: true,
      payer: p.payload.authorization.from,
    }));
    mockSettle.mockReset().mockResolvedValue({ success: true, transaction: TX });
    mockWrite.mockReset().mockResolvedValue(TX);
    mockReceipt.mockReset().mockResolvedValue({ status: 'success' });
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
           VALUES ($1, 'int42', $2, $3, now() - interval '1 day', 'b')`,
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
  /** A merchant with one live quote for `price` (instant delivery). */
  async function fixture(price = 89) {
    const m = await mkMerchant(prisma, tag());
    await activate(m);
    const sku = `sku-${tag()}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_products (merchant_id, sku, title, price_usd, available, is_test, category, fulfillment_mode)
       VALUES ($1::uuid, $2, 'Thing', $3::numeric, NULL, false, 'books', 'instant')`,
      m,
      sku,
      price,
    );
    const b = buyer();
    const quote = await createQuote(deps, m, b, { items: [{ sku, qty: 1 }] });
    orders.push(quote.order_id);
    return { m, b, quote, sku };
  }
  type Fx = Awaited<ReturnType<typeof fixture>>;
  const row = async (sql: string, ...v: unknown[]) =>
    (await prisma.$queryRawUnsafe<Row[]>(sql, ...v))[0];
  const count = async (sql: string, ...v: unknown[]) => Number((await row(sql, ...v)).c);

  const pay = (f: Fx, h?: string) =>
    payQuote(deps, {
      quote_id: f.quote.quote_id,
      x402PaymentHeader: h,
      buyer: f.b,
      requestId: 'r-1',
      host: 'apibase.pro',
    });
  const challenge = async (f: Fx): Promise<FeeSplitChallenge & Record<string, any>> =>
    (await pay(f)).body as never;
  const encode = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');
  const orderRow = (f: Fx) =>
    row(
      `SELECT state, fee_settlement, tx_hash FROM shop_orders WHERE order_id = $1::uuid`,
      f.quote.order_id,
    );
  const paymentRow = (f: Fx) =>
    row(`SELECT * FROM shop_payments WHERE order_id = $1::uuid`, f.quote.order_id);
  const ledger = (f: Fx) =>
    prisma.$queryRawUnsafe<Row[]>(
      `SELECT mode, status, fee_usd::float8 AS fee FROM shop_fee_ledger WHERE order_id = $1::uuid`,
      f.quote.order_id,
    );
  const nonces = (p: any) => [
    p.payload.authorization.nonce as string,
    p.payload.feeAuthorization?.authorization.nonce as string,
  ];

  it('FS0: the real decode + parse keep payload.feeAuthorization', async () => {
    const { decodePaymentSignatureHeader } = await import('@x402/core/http');
    const { parsePaymentPayload } = await import('@x402/core/schemas');
    const f = await fixture();
    const header = await buildFeeSplitXPayment(account, await challenge(f));
    const parsed = parsePaymentPayload(decodePaymentSignatureHeader(header));
    expect(parsed.success).toBe(true);
    const inner = (parsed as any).data.payload;
    expect(inner.feeAuthorization.authorization.to).toBe(FEE_WALLET_BASE);
    expect(inner.feeAuthorization.signature).toMatch(/^0x[0-9a-f]+$/);
  });

  it('FS1: fee on, $89 -> 402 accepts[0].amount = toMicro(89) and extra.fee_split {1.34 / 87.66}; off -> absent', async () => {
    const f = await fixture(89);
    const c = await challenge(f);
    expect(c.accepts[0].amount).toBe(toMicroUsdc(89));
    expect(c.accepts[0].payTo).toBe(PAYOUT);
    const split = (c.accepts[0].extra as any).fee_split;
    expect(split).toMatchObject({
      v: 1,
      fee_to: FEE_WALLET_BASE,
      fee_amount: toMicroUsdc(1.34),
      merchant_amount: toMicroUsdc(87.66),
    });
    expect(split.how).toBe(
      'sign a second EIP-3009 TransferWithAuthorization to fee_to for fee_amount and send it as payload.feeAuthorization; then the first authorization must be merchant_amount',
    );
    E.INTEGRATOR_FEE_ENABLED = 'false';
    const off = await challenge(f);
    expect(JSON.stringify(off.accepts)).not.toContain('fee_split');
    E.INTEGRATOR_FEE_ENABLED = 'true';
    delete E.INTEGRATOR_FEE_WALLET_BASE;
    expect(JSON.stringify((await challenge(f)).accepts)).not.toContain('fee_split');
  });

  it('FS2: one authorization for $89, no fee leg -> the old path: standard settle, receivable, no aggregate3', async () => {
    const f = await fixture(89);
    const c = await challenge(f);
    const single = { ...c, accepts: [{ ...c.accepts[0], extra: { ...c.accepts[0].extra } }] };
    delete (single.accepts[0].extra as any).fee_split;
    const r = await pay(f, await buildFeeSplitXPayment(account, single));
    expect(r.status).toBe(200);
    expect(mockSettle).toHaveBeenCalledTimes(1);
    expect(mockWrite).not.toHaveBeenCalled();
    expect(await orderRow(f)).toMatchObject({
      state: expect.any(String),
      fee_settlement: 'receivable',
    });
    expect(await ledger(f)).toEqual([{ mode: 'receivable', status: 'owed', fee: 1.34 }]);
  });

  it('FS3: two authorizations $87.66 + $1.34 -> one aggregate3 with two calls, both nonces claimed, in_tx/collected', async () => {
    const f = await fixture(89);
    const header = await buildFeeSplitXPayment(account, await challenge(f));
    const r = await pay(f, header);
    expect(r.status).toBe(200);
    expect(mockSettle).not.toHaveBeenCalled();
    expect(mockWrite).toHaveBeenCalledTimes(1);
    const call = mockWrite.mock.calls[0][0];
    expect(call.address).toBe(MULTICALL3);
    expect(call.functionName).toBe('aggregate3');
    const [calls] = call.args;
    expect(calls).toHaveLength(2);
    expect(calls.map((x: any) => x.allowFailure)).toEqual([false, false]);
    const dec = calls.map((x: any) => decodeFunctionData({ abi: usdcAbi, data: x.callData }).args);
    expect(dec.map((a: any) => String(a[2]))).toEqual([toMicroUsdc(87.66), toMicroUsdc(1.34)]);
    expect([dec[0][1].toLowerCase(), dec[1][1].toLowerCase()]).toEqual([PAYOUT, FEE_WALLET_BASE]);
    const payload = JSON.parse(Buffer.from(header, 'base64').toString());
    expect(claimed).toEqual(new Set(nonces(payload)));
    expect(mockVerify).toHaveBeenCalledTimes(2);
    expect(await ledger(f)).toEqual([{ mode: 'in_tx', status: 'collected', fee: 1.34 }]);
    const o = await orderRow(f);
    expect(o.fee_settlement).toBe('in_tx');
    expect(o.tx_hash).toBe(TX);
    const p = await paymentRow(f);
    expect(p.tx_hash).toBe(TX);
    expect(p.splits).toEqual([
      expect.objectContaining({
        fee_to: FEE_WALLET_BASE,
        fee: 1.34,
        mode: 'in_tx',
        nonce: nonces(payload)[1],
      }),
    ]);
    expect(p.eip3009_nonce).toBe(nonces(payload)[0]);
  });

  /** A signed two-leg payload from the live challenge, optionally tampered, encoded as X-Payment. */
  async function tampered(f: Fx, edit: (p: any) => void): Promise<{ header: string; p: any }> {
    const p: any = await buildFeeSplitPaymentPayload(account, await challenge(f));
    edit(p);
    return { header: encode(p), p };
  }
  const expectRefused = (r: { status: number; body: Record<string, any> }) => {
    expect(r.status).toBe(402);
    expect(r.body.error).toBe('payment_amount_mismatch');
    expect(mockClaim).not.toHaveBeenCalled();
    expect(claimed.size).toBe(0);
    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockSettle).not.toHaveBeenCalled();
  };

  it('FS4: a fee leg is present but the seller leg is $89 -> 402 payment_amount_mismatch, 0 claims, 0 aggregate3', async () => {
    const f = await fixture(89);
    const { header } = await tampered(f, (p) => {
      p.payload.authorization.value = toMicroUsdc(89);
    });
    expectRefused(await pay(f, header));
    expect((await orderRow(f)).state).toBe('QUOTED');
  });

  it('FS4b: wrong fee amount, or a fee leg when none is offered -> 402, nothing claimed', async () => {
    const f = await fixture(89);
    const { header } = await tampered(f, (p) => {
      p.payload.feeAuthorization.authorization.value = toMicroUsdc(2);
    });
    expectRefused(await pay(f, header));
    const g = await fixture(89);
    const { header: h2 } = await tampered(g, () => undefined);
    E.INTEGRATOR_FEE_ENABLED = 'false';
    expectRefused(await pay(g, h2));
  });

  it('FS5: fee leg to a wrong address, or another payer -> 402, 0 claims', async () => {
    const f = await fixture(89);
    const wrongTo = await tampered(f, (p) => {
      p.payload.feeAuthorization.authorization.to = FEE_WALLET;
    });
    expectRefused(await pay(f, wrongTo.header));
    const other = privateKeyToAccount(generatePrivateKey());
    const wrongFrom = await tampered(f, (p) => {
      p.payload.feeAuthorization.authorization.from = other.address;
    });
    expectRefused(await pay(f, wrongFrom.header));
    const same = await tampered(f, (p) => {
      p.payload.feeAuthorization.authorization.nonce = p.payload.authorization.nonce;
    });
    expectRefused(await pay(f, same.header));
  });

  it('FS5b: the facilitator refuses the fee leg signature -> 402, nothing claimed', async () => {
    const f = await fixture(89);
    mockVerify.mockImplementation(async (p: any, req: any) =>
      req.payTo === FEE_WALLET_BASE
        ? { isValid: false, invalidReason: 'invalid_signature' }
        : { isValid: true, payer: p.payload.authorization.from },
    );
    const { header } = await tampered(f, () => undefined);
    expectRefused(await pay(f, header));
  });

  it('FS6: the second nonce is already claimed -> 402, the first claim is rolled back (Redis empty)', async () => {
    const f = await fixture(89);
    const { header, p } = await tampered(f, () => undefined);
    const [first, second] = nonces(p);
    claimed.add(second);
    const r = await pay(f, header);
    expect(r.status).toBe(402);
    expect(mockClaim).toHaveBeenCalledTimes(2);
    expect(claimed.has(first)).toBe(false);
    expect([...claimed]).toEqual([second]);
    expect(mockWrite).not.toHaveBeenCalled();
    expect((await orderRow(f)).state).toBe('QUOTED');
  });

  it('FS7: aggregate3 reverts -> PAYMENT_FAILED, nothing delivered, no fee ledger row', async () => {
    const f = await fixture(89);
    mockReceipt.mockResolvedValue({ status: 'reverted' });
    const { header } = await tampered(f, () => undefined);
    const r = await pay(f, header);
    expect(r.status).toBe(402);
    expect(mockWrite).toHaveBeenCalledTimes(1);
    // A partial transfer must be impossible: both calls revert the whole batch.
    expect(mockWrite.mock.calls[0][0].args[0].map((c: any) => c.allowFailure)).toEqual([
      false,
      false,
    ]);
    const o = await orderRow(f);
    expect(o.state).toBe('PAYMENT_FAILED');
    expect(o.fee_settlement).not.toBe('in_tx');
    expect(await ledger(f)).toEqual([]);
    expect((await paymentRow(f)).chain_status).toBe('failed');
  });

  it('FS8: receipt timeout -> PAYING / 202 payment_pending; reconcile reads BOTH nonces -> PAID', async () => {
    const f = await fixture(89);
    mockReceipt.mockRejectedValue(new Error('timed out'));
    const { header, p } = await tampered(f, () => undefined);
    const r = await pay(f, header);
    expect(r.status).toBe(202);
    expect((await orderRow(f)).state).toBe('PAYING');
    const [n1, n2] = nonces(p);
    const asked: string[] = [];
    const transfers: Array<{ to: string; valueMicro: string }> = [];
    const chain: ChainReader = {
      authorizationUsed: async (_payer, nonce) => {
        asked.push(nonce);
        return true;
      },
      findTransfer: async (q) => {
        transfers.push({ to: q.to, valueMicro: q.valueMicro });
        return TX;
      },
      receiptOk: async () => true,
    };
    await reconcile({ deps, chain });
    // The job also sees other pending rows of this shared test DB: assert on this payment's own.
    expect(asked).toEqual(expect.arrayContaining([n1, n2]));
    expect(transfers).toContainEqual({ to: PAYOUT, valueMicro: toMicroUsdc(87.66) });
    const o = await orderRow(f);
    expect(o).toMatchObject({
      state: expect.not.stringMatching(/^PAYING$/),
      fee_settlement: 'in_tx',
    });
    expect(await ledger(f)).toEqual([{ mode: 'in_tx', status: 'collected', fee: 1.34 }]);
  });

  it('FS8b: exactly one of the two nonces used on-chain -> never PAID, PAYMENT_MISMATCH flag (human only)', async () => {
    const f = await fixture(89);
    mockReceipt.mockRejectedValue(new Error('timed out'));
    const { header, p } = await tampered(f, () => undefined);
    await pay(f, header);
    const [n1] = nonces(p);
    const chain: ChainReader = {
      authorizationUsed: async (_payer, nonce) => nonce === n1,
      findTransfer: async () => TX,
      receiptOk: async () => true,
    };
    await reconcile({ deps, chain });
    await reconcile({ deps, chain });
    expect((await orderRow(f)).state).toBe('PAYING');
    expect(
      await count(
        `SELECT count(*) AS c FROM shop_moderation_reviews
          WHERE category = 'payment_mismatch' AND merchant_id = $1::uuid`,
        f.m,
      ),
    ).toBe(1);
  });

  it('FS9: tool:* 402 carries no fee_split and is built by the unchanged tool builder', async () => {
    const { buildPaymentRequiredResponse } = await import('../../src/pipeline/stages/escrow.stage');
    const body = buildPaymentRequiredResponse(
      { amount_usd: 0.01, pay_to: PLATFORM, rail: 'base', resource: 'tool:x.y' },
      { requestId: 'r', host: 'apibase.pro' },
    );
    expect(JSON.stringify(body)).not.toContain('fee_split');
  });

  it('FS10: no shop_payments row pays the platform, Tempo or a fee wallet (the fee lives in splits only)', async () => {
    const f = await fixture(89);
    await pay(f, await buildFeeSplitXPayment(account, await challenge(f)));
    const bad = new Set([PLATFORM, TEMPO, FEE_WALLET, FEE_WALLET_BASE].map((a) => a.toLowerCase()));
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT pay_to FROM shop_payments WHERE order_id = ANY($1::uuid[])`,
      orders,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(bad.has(String(r.pay_to).toLowerCase())).toBe(false);
  });
});
