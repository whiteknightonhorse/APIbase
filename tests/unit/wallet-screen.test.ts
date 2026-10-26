import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { platformWallets } from '../../src/shop/platform-wallets';
import {
  addressDigest,
  rescreenMerchants,
  screenWallet,
} from '../../src/shop/moderation/wallet-screen';
import type { ShopTx } from '../../src/shop/db';

jest.mock('../../src/config/index', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/moderation-ban.service', () => ({
  checkBan: jest.fn(async () => ({ banned: false, retryAfterSecs: 0 })),
}));

const BAD = '0x00000000000000000000000000000000000bad01';
const SIGNER_ENV = 'X402_OPERATOR_PRIVATE_' + 'KEY';

function fakeDb(sanctioned: string[], merchants: Array<Record<string, unknown>> = []) {
  const executed: Array<{ sql: string; v: unknown[] }> = [];
  const db: ShopTx = {
    async $queryRawUnsafe<T>(sql: string, ...v: unknown[]): Promise<T> {
      if (sql.includes('WHERE address = $1'))
        return (sanctioned.includes(v[0] as string) ? [{ x: 1 }] : []) as T;
      if (sql.includes('FROM shop_merchants')) return (sanctioned.length ? merchants : []) as T;
      throw new Error('unexpected ' + sql);
    },
    async $executeRawUnsafe(sql: string, ...v: unknown[]) {
      executed.push({ sql, v });
      return 1;
    },
  };
  return { db, executed };
}

describe('T-0570 screenWallet', () => {
  const signerKey = generatePrivateKey();
  const operator = privateKeyToAccount(signerKey).address.toLowerCase();
  const saved = process.env[SIGNER_ENV];
  beforeAll(() => {
    process.env[SIGNER_ENV] = signerKey;
  });
  afterAll(() => {
    if (saved === undefined) delete process.env[SIGNER_ENV];
    else process.env[SIGNER_ENV] = saved;
  });

  it('platformWallets includes the operator signer address derived from the key', () => {
    expect(platformWallets().has(operator)).toBe(true);
  });
  it('operator address is refused as payout and identity, not as recovery', async () => {
    const { db } = fakeDb([]);
    expect(await screenWallet(db, operator, 'payout')).toBe('platform');
    expect(await screenWallet(db, operator, 'identity')).toBe('platform');
    expect(await screenWallet(db, operator, 'recovery')).toBe('ok');
  });
  it('sanctioned address is refused in every role', async () => {
    const { db } = fakeDb([BAD]);
    for (const role of ['identity', 'payout', 'recovery'] as const)
      expect(await screenWallet(db, BAD, role)).toBe('sanctioned');
    expect(await screenWallet(db, '0x1111111111111111111111111111111111111111', 'payout')).toBe(
      'ok',
    );
  });
});

describe('T-0570 rescreenMerchants', () => {
  const row = (id: string, over: Record<string, unknown> = {}) => ({
    merchant_id: id,
    wallet_address: '0xaaa',
    recovery_wallet: null,
    payout_wallet_base: '0xaaa',
    payout_wallet_tempo: '0xaaa',
    pending_wallet: null,
    ...over,
  });

  it('suspends a merchant whose payout wallet is now sanctioned and emits a hash-only event', async () => {
    const { db, executed } = fakeDb([BAD], [row('m-1', { payout_wallet_tempo: BAD })]);
    expect(await rescreenMerchants(db)).toBe(1);
    const upd = executed.find((e) => e.sql.includes("status = 'suspended'"))!;
    expect(upd.sql).toContain("status_reason = 'sanctions_match'");
    expect(upd.v[0]).toBe('m-1');
    const review = executed.find((e) => e.sql.includes('shop_moderation_reviews'))!;
    expect(review.sql).toContain("'sanctions_hit'");
    const ev = executed.find((e) => e.sql.includes('shop.merchant.sanctions_hit'))!;
    expect(JSON.parse(ev.v[0] as string)).toEqual({
      merchant_id: 'm-1',
      address_sha256: addressDigest(BAD),
    });
    expect(JSON.stringify(executed)).not.toContain(BAD);
  });
  it('a pending payout wallet on the list also suspends', async () => {
    const { db } = fakeDb([BAD], [row('m-2', { pending_wallet: BAD })]);
    expect(await rescreenMerchants(db)).toBe(1);
  });
  it('no list hit -> nothing written', async () => {
    const { db, executed } = fakeDb([], []);
    expect(await rescreenMerchants(db)).toBe(0);
    expect(executed).toHaveLength(0);
  });
});

describe('T-0570 applyPayouts on an already sanctions-suspended merchant', () => {
  it('clears payout_pending even though the idempotent suspend changes nothing', async () => {
    const { applyPayouts } = await import('../../src/jobs/shop-sla-sweeper.job');
    const executed: string[] = [];
    const tx = {
      async $queryRawUnsafe(sql: string, ...v: unknown[]) {
        if (sql.includes('WHERE address = $1')) return v[0] === BAD ? [{ x: 1 }] : [];
        if (sql.includes("payout_pending->>'wallet' AS wallet"))
          return [{ merchant_id: 'm-9', wallet: BAD }];
        // the apply UPDATE must find no pending row left
        return [];
      },
      async $executeRawUnsafe(sql: string) {
        executed.push(sql);
        return sql.includes("status = 'suspended'") ? 0 : 1;
      },
    } as unknown as ShopTx;
    const n = await applyPayouts(
      { transaction: async (fn: (t: ShopTx) => Promise<number>) => fn(tx) } as never,
      new Date(),
    );
    expect(n).toBe(0);
    expect(executed.some((s) => s.includes('SET payout_pending = NULL'))).toBe(true);
  });
});
