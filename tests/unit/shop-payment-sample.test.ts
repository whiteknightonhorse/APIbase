/**
 * T-0302 PS1-PS3: the daily payment sample verifies Base receipts only, against a real throwaway
 * Postgres (TEST_DATABASE_URL). The chain reader is a mock; zero RPC.
 */
import { PrismaClient } from '@prisma/client';
import { runDailySample, type ChainReader } from '../../src/jobs/shop-payment-reconcile.job';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { dbDescribe, migrate, mkMerchant, mkOrder, mkQuote } from './helpers/shop-db';

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
jest.mock('../../src/services/x402-server.service', () => ({}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

dbDescribe('T-0302 daily payment sample', () => {
  let db: PrismaClient;
  let merchant: string;
  let n = 0;

  beforeAll(async () => {
    // migrate() validates the URL and pins the env to it; client() would then refuse because the
    // two are equal, so the handle is built from the already-validated URL.
    migrate();
    db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    merchant = await mkMerchant(db);
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  const deps = (): ShopDeps =>
    ({ db, transaction: (fn: (tx: never) => Promise<unknown>) => fn(db as never) }) as never;

  async function mkPayment(rail: string): Promise<string> {
    const order = await mkOrder(db, merchant, await mkQuote(db, merchant), 'PAID');
    const tx = `0x${rail}${Date.now().toString(16)}${n++}`;
    await db.$executeRawUnsafe(
      `INSERT INTO shop_payments (order_id, rail, nonce_or_challenge_id, payer, pay_to, amount_usd,
          tx_hash, chain_status, confirmed_at)
       VALUES ($1::uuid, $2, $3, '0xp', '0xt', 1, $4, 'confirmed', now())`,
      order,
      rail,
      `nonce-${tx}`,
      tx,
    );
    return tx;
  }

  async function reviews(): Promise<number> {
    const r = await db.$queryRawUnsafe<Array<{ c: number }>>(
      `SELECT count(*)::int AS c FROM shop_moderation_reviews
        WHERE merchant_id = $1::uuid AND category = 'payment_mismatch'`,
      merchant,
    );
    return r[0].c;
  }

  beforeEach(async () => {
    await db.$executeRawUnsafe(
      `DELETE FROM shop_moderation_reviews WHERE merchant_id = $1::uuid`,
      merchant,
    );
    await db.$executeRawUnsafe(`DELETE FROM shop_payments`);
  });

  it('PS1 a confirmed tempo payment never reaches the chain reader and writes no review', async () => {
    const tempoTx = await mkPayment('tempo');
    const chain: ChainReader = {
      receiptOk: jest.fn(async (h: string) => {
        throw new Error(`receiptOk called for ${h}`);
      }),
    } as never;
    expect(await runDailySample({ deps: deps(), chain })).toBe(0);
    expect(chain.receiptOk).not.toHaveBeenCalledWith(tempoTx);
    expect(await reviews()).toBe(0);
  });

  it('PS2 a confirmed base payment with a failing receipt writes exactly one review', async () => {
    await mkPayment('base');
    const chain = { receiptOk: jest.fn(async () => false) } as unknown as ChainReader;
    expect(await runDailySample({ deps: deps(), chain })).toBe(1);
    expect(await reviews()).toBe(1);
  });

  it('PS3 a confirmed base payment with a good receipt writes no review', async () => {
    await mkPayment('base');
    const chain = { receiptOk: jest.fn(async () => true) } as unknown as ChainReader;
    expect(await runDailySample({ deps: deps(), chain })).toBe(0);
    expect(await reviews()).toBe(0);
  });
});
