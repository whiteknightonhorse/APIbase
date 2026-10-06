/**
 * T-INT-49 TK1-TK8 (UC-9 on Tempo): the merchant renews with its OWN access key. Real Postgres
 * (TEST_DATABASE_URL, DISPOSABLE), the real order/payment path of INT-41. Mocked boundaries: the
 * Tempo keychain reader and the transfer reader (viem/tempo, read-only), facilitator verify/settle
 * (period 1 is paid on Base and then relabelled `tempo`), Redis, the operator signer. No RPC.
 */
import { createHash } from 'node:crypto';
import { decodeFunctionData, parseAbi } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { toMicroUsdc } from '../../src/config/x402.config';
import { payQuote } from '../../src/shop/pay.service';
import { createQuote } from '../../src/shop/quote.service';
import { getOrderView } from '../../src/shop/order-payment.service';
import {
  buildFeeSplitXPayment,
  type FeeSplitChallenge,
} from '../../scripts/shop/examples/x402-fee-split-client';
import { cancelSubscription, getSubscription } from '../../src/shop/subscription.service';
import {
  confirmPull,
  deleteRenewerKey,
  listRenewQueue,
  periodMemo,
  putRenewerKey,
  recordRenewal,
  type ChainTransfer,
  type KeychainDeps,
  type KeyState,
  type TransferProof,
} from '../../src/shop/subscription-keychain.service';
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
const PAYOUT = '0x00000000000000000000000000000000000b0b0b';
const PAYOUT_TEMPO = '0x00000000000000000000000000000000000c0c0c';
const FEE_WALLET = '0x00000000000000000000000000000000000fee00';
const FEE_WALLET_BASE = '0x00000000000000000000000000000000000fee0b';
const TEMPO = '0x9E29FF84B0f3EDa9756262d2F950C435495BA8cC';
const KEY_ID = '0x00000000000000000000000000000000000ce001';
const STRANGER = '0x0000000000000000000000000000000000005777';
const TX = `0x${'ab'.repeat(32)}`;
const RUN = Date.now().toString(36);
const txh = (c: string) => `0x${createHash('sha256').update(`${RUN}:${c}`).digest('hex')}`;
const WEEK_MS = 7 * 86_400_000;
const DAY_MS = 86_400_000;
const PRICE = 5_000_000n;
const FEE = 80_000n; // 1.5 % of $5 is 7.5 cents -> max(8, 5) = 8 cents

dbDescribe('subscriptions: Tempo keychain, merchant-run renewer', () => {
  const prisma = client();
  let clock = Date.now();
  const deps: ShopDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: { incr: async () => 1, expire: async () => 1 } as never,
    now: () => clock,
  };
  // mocked chain
  let keyState: KeyState;
  const proofs = new Map<string, TransferProof>();
  const keyReads = jest.fn();
  const kdeps = (): KeychainDeps => ({
    ...deps,
    keychain: {
      key: async (payer, key_id, token) => {
        keyReads(payer, key_id, token);
        return keyState;
      },
    },
    transfers: {
      read: async (h) => proofs.get(h) ?? { found: false, success: false, transfers: [] },
    },
  });
  let n = 0;
  const tag = () => `${Date.now().toString(36)}k${n++}`;
  const buyer = () => ({ identity: `agent:${tag()}` });
  const account = privateKeyToAccount(generatePrivateKey());

  beforeAll(() => migrate());
  afterAll(() => prisma.$disconnect());
  beforeEach(() => {
    clock = Date.now();
    Object.assign(E, {
      INTEGRATOR_FEE_ENABLED: 'false',
      INTEGRATOR_BASE_ORDERS_ENABLED: 'true',
      MPP_ENABLED: 'true',
      INTEGRATOR_TEST_SKU_DAILY_CAP: '30',
      INTEGRATOR_FEE_WALLET: FEE_WALLET,
      INTEGRATOR_FEE_WALLET_BASE: FEE_WALLET_BASE,
      PUBLIC_BASE_URL: 'https://apibase.pro',
    });
    keyState = {
      found: true,
      revoked: false,
      expiry: BigInt(Math.floor((Date.now() + 400 * DAY_MS) / 1000)),
      remaining: 100_000_000n,
    };
    proofs.clear();
    keyReads.mockClear();
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
           VALUES ($1, 'int41', $2, $3, now() - interval '1 day', 'b')`,
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
  const row = async (sql: string, ...v: unknown[]) =>
    (await prisma.$queryRawUnsafe<Row[]>(sql, ...v))[0];
  const rows = (sql: string, ...v: unknown[]) => prisma.$queryRawUnsafe<Row[]>(sql, ...v);
  const count = async (sql: string, ...v: unknown[]) => Number((await row(sql, ...v)).c);

  /** A merchant with a subscription item (weekly, $5) and a plain item. */
  async function shop(o: { price?: number; max_periods?: number; unit?: string } = {}) {
    const m = await mkMerchant(prisma, tag());
    await activate(m);
    const sku = `sub-${tag()}`;
    const plain = `plain-${tag()}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_products (merchant_id, sku, title, price_usd, available, is_test, category,
                                  fulfillment_mode, subscription)
       VALUES ($1::uuid, $2, 'Plan', $3::numeric, NULL, false, 'books', 'instant', $4::jsonb),
              ($1::uuid, $5, 'Plain', 5, NULL, false, 'books', 'instant', NULL)`,
      m,
      sku,
      o.price ?? 5,
      JSON.stringify({
        period_unit: o.unit ?? 'week',
        period_count: 1,
        trial: 'none',
        ...(o.max_periods ? { max_periods: o.max_periods } : {}),
      }),
      plain,
    );
    return { m, sku, plain };
  }
  type Shop = Awaited<ReturnType<typeof shop>>;

  const encode = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');
  const payX = (quote_id: string, who: { identity: string }, h?: string) =>
    payQuote(deps, {
      quote_id,
      x402PaymentHeader: h,
      buyer: who,
      requestId: 'r-1',
      host: 'apibase.pro',
    });
  /** Pays a quote with one authorization (no fee leg unless the challenge asks and `split`). */
  async function payQuoteId(quote_id: string, who: { identity: string }, split = false) {
    const c = (await payX(quote_id, who)).body as unknown as FeeSplitChallenge &
      Record<string, any>;
    const use = split
      ? c
      : (() => {
          const single = { ...c, accepts: [{ ...c.accepts[0], extra: { ...c.accepts[0].extra } }] };
          delete (single.accepts[0].extra as any).fee_split;
          return single;
        })();
    return payX(quote_id, who, await buildFeeSplitXPayment(account, use));
  }

  /** Subscribes (period 1 paid at the current clock) and returns the subscription row. */
  async function subscribed(s: Shop, who = buyer()) {
    const q = await createQuote(deps, s.m, who, {
      items: [{ sku: s.sku, qty: 1 }],
      subscribe: true,
    });
    const r = await payQuoteId(q.quote_id, who);
    expect(r.status).toBe(200);
    const sub = await row(`SELECT * FROM shop_subscriptions WHERE merchant_id = $1::uuid`, s.m);
    return { who, q, sub, id: sub.subscription_id as string };
  }
  const periods = (id: string) =>
    rows(
      `SELECT period_no, status, period_start, period_end, order_id FROM shop_subscription_periods
        WHERE subscription_id = $1::uuid ORDER BY period_no`,
      id,
    );
  const subRow = (id: string) =>
    row(`SELECT * FROM shop_subscriptions WHERE subscription_id = $1::uuid`, id);
  const events = (type: string, id: string) =>
    count(
      `SELECT count(*) AS c FROM outbox WHERE event_type = $1 AND payload->>'subscription_id' = $2`,
      `shop.subscription.${type}`,
      id,
    );

  const refusal = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e: any) {
      return e;
    }
    throw new Error('expected a refusal');
  };
  const farFuture = () => new Date(Date.now() + 400 * DAY_MS).toISOString();

  /** A weekly $5 subscription paid on Tempo by `account`, the merchant key registered and confirmed. */
  async function tempoSub(o: { max_periods?: number; confirm?: boolean } = {}) {
    const s = await shop({ max_periods: o.max_periods });
    await prisma.$executeRawUnsafe(
      `UPDATE shop_merchants SET payout_wallet_tempo = $2 WHERE merchant_id = $1::uuid`,
      s.m,
      PAYOUT_TEMPO,
    );
    const b = await subscribed(s);
    await prisma.$executeRawUnsafe(
      `UPDATE shop_subscriptions SET rail_pref = 'tempo' WHERE subscription_id = $1::uuid`,
      b.id,
    );
    await putRenewerKey(deps, s.m, { key_id: KEY_ID, expires_at: farFuture() });
    if (o.confirm !== false) {
      const v = await confirmPull(kdeps(), b.who, b.id, { tx_hash: TX });
      expect(v.pull_mode).toBe('tempo_keychain');
    }
    return { ...s, ...b };
  }
  /** The renewal of period 2 as the chain shows it: one or two transfers carrying the period memo. */
  const proof = (id: string, no: number, t: Array<Partial<ChainTransfer>>, hash = txh('1')) => {
    proofs.set(hash, {
      found: true,
      success: true,
      transfers: t.map((x) => ({
        from: account.address,
        to: PAYOUT_TEMPO,
        value: PRICE,
        memo: periodMemo(id, no),
        ...x,
      })),
    });
    return hash;
  };
  const dueAt = async (id: string) => {
    clock = new Date((await subRow(id)).next_charge_at).getTime() + 60_000;
  };

  it('TK1: PUT renewer-key with a private key (or any extra field) in the body -> 422 and nothing stored; with an address -> ok', async () => {
    const s = await shop();
    const privateKey = generatePrivateKey();
    const bad = [
      { key_id: privateKey, expires_at: farFuture() },
      { key_id: KEY_ID, expires_at: farFuture(), private_key: privateKey },
      { key_id: KEY_ID },
      { key_id: KEY_ID, expires_at: '2001-01-01T00:00:00Z' },
    ];
    for (const body of bad) {
      const e = await refusal(putRenewerKey(deps, s.m, body));
      expect([e.status, e.error_code]).toEqual([422, 'validation_failed']);
      expect(JSON.stringify(e)).not.toContain(privateKey);
    }
    expect(
      (
        await row(
          `SELECT limits->'renewer_key' AS k FROM shop_merchants WHERE merchant_id = $1::uuid`,
          s.m,
        )
      ).k,
    ).toBeNull();
    const expires_at = farFuture();
    const ok = await putRenewerKey(deps, s.m, {
      key_id: KEY_ID.toUpperCase().replace('0X', '0x'),
      expires_at,
    });
    expect(ok).toEqual({ key_id: KEY_ID, expires_at });
    expect(
      (
        await row(
          `SELECT limits->'renewer_key' AS k FROM shop_merchants WHERE merchant_id = $1::uuid`,
          s.m,
        )
      ).k,
    ).toEqual(ok);
    // the rest of `limits` survives, and DELETE removes only the key
    await prisma.$executeRawUnsafe(
      `UPDATE shop_merchants SET limits = limits || '{"quote_ttl_s": 600}'::jsonb WHERE merchant_id = $1::uuid`,
      s.m,
    );
    await putRenewerKey(deps, s.m, { key_id: KEY_ID, expires_at });
    await deleteRenewerKey(deps, s.m);
    expect(
      await row(
        `SELECT limits->'renewer_key' AS k, limits->>'quote_ttl_s' AS t FROM shop_merchants WHERE merchant_id = $1::uuid`,
        s.m,
      ),
    ).toEqual({ k: null, t: '600' });
  });

  it('TK2: get carries pull_setup only for a Tempo subscription of a merchant with a key', async () => {
    const s = await shop({ max_periods: 12 });
    const b = await subscribed(s);
    // Base subscription, no key
    expect((await getSubscription(deps, b.who, b.id)).pull_setup).toBeUndefined();
    // Base subscription WITH a key: still nothing
    const expires_at = farFuture();
    await putRenewerKey(deps, s.m, { key_id: KEY_ID, expires_at });
    expect((await getSubscription(deps, b.who, b.id)).pull_setup).toBeUndefined();
    // Tempo subscription with the key
    await prisma.$executeRawUnsafe(
      `UPDATE shop_subscriptions SET rail_pref = 'tempo' WHERE subscription_id = $1::uuid`,
      b.id,
    );
    const v = await getSubscription(deps, b.who, b.id);
    expect(v.pull_setup).toMatchObject({
      method: 'tempo_keychain',
      key_id: KEY_ID,
      token: '0x20C000000000000000000000b9537d11c60E8b50',
      limit: String(PRICE * 11n), // max_periods 12, period 1 is paid
      // the key expires in 400 days, the subscription term ends after 12 weekly periods: the earlier wins
      expiry: Math.floor(new Date((await subRow(b.id)).expires_at).getTime() / 1000),
    });
    expect(v.pull_setup?.how).toContain('accessKey.authorize');
    // Tempo subscription of a merchant without a key
    await deleteRenewerKey(deps, s.m);
    expect((await getSubscription(deps, b.who, b.id)).pull_setup).toBeUndefined();
  });

  it('TK3: confirm_pull needs remaining limit >= price (else 400); then pull_mode = tempo_keychain', async () => {
    const t = await tempoSub({ confirm: false });
    keyState.remaining = PRICE - 1n;
    const low = await refusal(confirmPull(kdeps(), t.who, t.id, { tx_hash: TX }));
    expect([low.status, low.error_code]).toEqual([400, 'keychain_limit_too_low']);
    expect((await subRow(t.id)).pull_mode).toBe('none');
    keyState = { ...keyState, remaining: PRICE, found: false };
    expect((await refusal(confirmPull(kdeps(), t.who, t.id, { tx_hash: TX }))).status).toBe(400);
    keyState = { ...keyState, found: true, revoked: true };
    expect((await refusal(confirmPull(kdeps(), t.who, t.id, { tx_hash: TX }))).status).toBe(400);
    keyState = { ...keyState, revoked: false };
    const stranger = await refusal(confirmPull(kdeps(), buyer(), t.id, { tx_hash: TX }));
    expect(stranger.status).toBe(404);
    const v = await confirmPull(kdeps(), t.who, t.id, { tx_hash: TX });
    expect(v.pull_mode).toBe('tempo_keychain');
    expect(keyReads).toHaveBeenLastCalledWith(
      expect.stringMatching(new RegExp(`^${account.address}$`, 'i')),
      KEY_ID,
      '0x20C000000000000000000000b9537d11c60E8b50',
    );
    expect((await subRow(t.id)).pull_mode).toBe('tempo_keychain');
  });

  it("TK4: the queue holds only this merchant's due periods (period_start <= now)", async () => {
    const a = await tempoSub();
    const b = await tempoSub();
    expect((await listRenewQueue(kdeps(), a.m)).queue).toEqual([]); // period 2 starts in a week
    await dueAt(a.id);
    const qa = (await listRenewQueue(kdeps(), a.m)).queue;
    expect(qa).toEqual([
      {
        subscription_id: a.id,
        period_no: 2,
        payer: account.address.toLowerCase(),
        amount: String(PRICE),
        memo: periodMemo(a.id, 2),
        recipient: PAYOUT_TEMPO,
        token: '0x20C000000000000000000000b9537d11c60E8b50',
      },
    ]);
    expect(qa.map((i) => i.subscription_id)).not.toContain(b.id);
    expect((await listRenewQueue(kdeps(), b.m)).queue.map((i) => i.subscription_id)).toEqual([
      b.id,
    ]);
    // fee on: the fee leg is named
    E.INTEGRATOR_FEE_ENABLED = 'true';
    expect((await listRenewQueue(kdeps(), a.m)).queue[0].splits).toEqual([
      { wallet: FEE_WALLET, amount: String(FEE) },
    ]);
  });

  it('TK5: renewed is verified on-chain: to, value, memo, from == payer; fee in_tx or honest receivable', async () => {
    const t = await tempoSub();
    await dueAt(t.id);
    const report = (hashes: string[], period_no = 2) =>
      recordRenewal(kdeps(), t.m, t.id, { period_no, tx_hashes: hashes });
    // wrong recipient
    let h = proof(t.id, 2, [{ to: STRANGER }]);
    let e = await refusal(report([h]));
    expect([e.status, e.error_code]).toEqual([400, 'renewal_not_proven']);
    // right recipient, but the money is not the payer's
    h = proof(t.id, 2, [{ from: STRANGER }]);
    e = await refusal(report([h]));
    expect([e.status, e.error_code, e.extra?.reject_reason]).toEqual([
      400,
      'renewal_not_proven',
      'transfer_not_from_payer',
    ]);
    // wrong value, wrong memo, unknown / reverted tx
    h = proof(t.id, 2, [{ value: PRICE - 1n }]);
    expect((await refusal(report([h]))).status).toBe(400);
    h = proof(t.id, 2, [{ memo: periodMemo(t.id, 3) }]);
    expect((await refusal(report([h]))).status).toBe(400);
    expect((await refusal(report([txh('9')]))).status).toBe(400);
    proofs.set(txh('8'), { found: true, success: false, transfers: [] });
    expect((await refusal(report([txh('8')]))).status).toBe(400);
    // another merchant cannot report it
    expect(
      (
        await refusal(
          recordRenewal(kdeps(), await mkMerchant(prisma, tag()), t.id, {
            period_no: 2,
            tx_hashes: [h],
          }),
        )
      ).status,
    ).toBe(404);
    expect(await periods(t.id)).toHaveLength(1);

    // fee off: one transfer of the whole price is right
    h = proof(t.id, 2, [{}], txh('2'));
    const r = await report([h]);
    expect(r).toMatchObject({
      period_no: 2,
      status: 'paid',
      fee_settlement: 'none',
      verified: true,
    });
    const ps = await periods(t.id);
    expect(ps.map((p) => [p.period_no, p.status])).toEqual([
      [1, 'paid'],
      [2, 'paid'],
    ]);
    const order = await row(
      `SELECT rail, payer_wallet, state FROM shop_orders WHERE order_id = $1::uuid`,
      r.order_id,
    );
    expect(order).toMatchObject({
      rail: 'tempo',
      state: expect.stringMatching(/PAID|DELIVERED|FULFILLED|COMPLETED/),
    });
    expect(String(order.payer_wallet).toLowerCase()).toBe(account.address.toLowerCase());
    expect(await events('renewed', t.id)).toBe(1);
    // the same report again, or a replayed tx
    expect((await refusal(report([h]))).status).toBe(409);
    expect((await refusal(report([h], 3))).status).toBe(409);
    // no longer due: the queue is empty
    expect((await listRenewQueue(kdeps(), t.m)).queue).toEqual([]);
  });

  it('TK5: fee on - both transfers -> in_tx; the merchant transfer only (whole price) -> period paid, fee receivable', async () => {
    E.INTEGRATOR_FEE_ENABLED = 'true';
    const a = await tempoSub();
    await dueAt(a.id);
    const both = proof(a.id, 2, [{ value: PRICE - FEE }, { to: FEE_WALLET, value: FEE }]);
    const ra = await recordRenewal(kdeps(), a.m, a.id, { period_no: 2, tx_hashes: [both] });
    expect(ra).toMatchObject({ status: 'paid', fee_settlement: 'in_tx' });
    expect(
      await row(
        `SELECT mode, status, fee_usd::float8 AS fee FROM shop_fee_ledger WHERE order_id = $1::uuid`,
        ra.order_id,
      ),
    ).toEqual({ mode: 'in_tx', status: 'collected', fee: 0.08 });

    const b = await tempoSub();
    await dueAt(b.id);
    // fee on, the merchant only paid (price - fee): not a valid shape
    const short = proof(b.id, 2, [{ value: PRICE - FEE }], txh('3'));
    expect(
      (await refusal(recordRenewal(kdeps(), b.m, b.id, { period_no: 2, tx_hashes: [short] })))
        .status,
    ).toBe(400);
    // two transactions, one transfer each
    const t1 = proof(b.id, 2, [{ value: PRICE - FEE }], txh('4'));
    const t2 = proof(b.id, 2, [{ to: FEE_WALLET, value: FEE + 1n }], txh('5'));
    expect(
      (await refusal(recordRenewal(kdeps(), b.m, b.id, { period_no: 2, tx_hashes: [t1, t2] })))
        .status,
    ).toBe(400);
    // whole price to the merchant, no fee transfer: honest receivable
    const whole = proof(b.id, 2, [{ value: PRICE }], txh('6'));
    const rb = await recordRenewal(kdeps(), b.m, b.id, { period_no: 2, tx_hashes: [whole] });
    expect(rb).toMatchObject({ status: 'paid', fee_settlement: 'receivable' });
    expect(
      await row(
        `SELECT mode, status, fee_usd::float8 AS fee FROM shop_fee_ledger WHERE order_id = $1::uuid`,
        rb.order_id,
      ),
    ).toEqual({ mode: 'receivable', status: 'owed', fee: 0.08 });
    expect((await periods(b.id)).map((p) => p.status)).toEqual(['paid', 'paid']);
  });

  it('TK7: cancel -> the queue is empty (the CLI signs nothing); renewed is refused', async () => {
    const t = await tempoSub();
    await dueAt(t.id);
    expect((await listRenewQueue(kdeps(), t.m)).queue).toHaveLength(1);
    await cancelSubscription(deps, t.who, t.id, 'bye');
    expect((await listRenewQueue(kdeps(), t.m)).queue).toEqual([]);
    const h = proof(t.id, 2, [{}], txh('7'));
    const e = await refusal(recordRenewal(kdeps(), t.m, t.id, { period_no: 2, tx_hashes: [h] }));
    expect([e.status, e.error_code]).toEqual([409, 'subscription_not_renewable']);
  });

  it('TK8: a revoked key (getMetadata -> revoked) -> pull_failed once, the period stays due for INT-41', async () => {
    const t = await tempoSub();
    await dueAt(t.id);
    keyState = { ...keyState, revoked: true };
    expect((await listRenewQueue(kdeps(), t.m)).queue).toEqual([]);
    expect(await events('pull_failed', t.id)).toBe(1);
    const ev = await row(
      `SELECT payload FROM outbox WHERE event_type = 'shop.subscription.pull_failed' AND payload->>'subscription_id' = $1`,
      t.id,
    );
    expect(ev.payload).toMatchObject({ period_no: 2, reason: 'key_revoked', merchant_id: t.m });
    expect((await subRow(t.id)).pull_mode).toBe('none');
    expect(await periods(t.id)).toHaveLength(1); // period 2 is not paid and not recorded: INT-41 owns it
    expect((await listRenewQueue(kdeps(), t.m)).queue).toEqual([]);
    expect(await events('pull_failed', t.id)).toBe(1);
    // the agent can still renew explicitly (INT-41 path)
    const v = await refusal(
      getSubscription(deps, t.who, t.id).then(() => {
        clock += 80 * 3_600_000;
        return getSubscription(deps, t.who, t.id);
      }),
    );
    expect(v.status).toBe(402);
    // an exhausted limit is the other failure
    keyState = { ...keyState, revoked: false };
    const u = await tempoSub();
    await dueAt(u.id);
    keyState = { ...keyState, remaining: PRICE - 1n };
    expect((await listRenewQueue(kdeps(), u.m)).queue).toEqual([]);
    expect(
      (
        await row(
          `SELECT payload->>'reason' AS r FROM outbox WHERE event_type = 'shop.subscription.pull_failed' AND payload->>'subscription_id' = $1`,
          u.id,
        )
      ).r,
    ).toBe('limit_exceeded');
  });
});
