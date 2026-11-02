/**
 * T-0552 (S8): targeted authorizationState checks after a failed shop settle (fake ChainReader,
 * fake timers) and the reconcile give-up rule (never without a successful chain read).
 */
const mockConfirm = jest.fn(async () => true);
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/config/x402.config', () => ({
  getX402Config: () => ({}),
  toMicroUsdc: (n: number) => String(Math.round(n * 1_000_000)),
  buildServerX402Requirements: () => ({}),
}));
jest.mock('../../src/services/x402-server.service', () => ({ getSharedResourceServer: jest.fn() }));
jest.mock('../../src/shop/order-payment.service', () => ({
  confirmPayment: (...a: unknown[]) => (mockConfirm as (...x: unknown[]) => unknown)(...a),
  failPayment: jest.fn(),
}));
jest.mock('../../src/shop/adapters/shop-order.adapter', () => ({
  fulfillPaidOrder: jest.fn(async () => ({ state: 'PAID' })),
}));
jest.mock('../../src/shop/merchant-lifecycle.service', () => ({ defaultShopDeps: jest.fn() }));
jest.mock('../../src/shop/repository', () => ({ releaseReservation: jest.fn() }));
const mockTransition = jest.fn();
jest.mock('../../src/shop/order-state', () => ({
  transition: (...a: unknown[]) => mockTransition(...a),
}));
const mockInc = jest.fn();
jest.mock('../../src/services/metrics.service', () => ({
  shopFailedAuthorizationChecksTotal: { inc: (...a: unknown[]) => mockInc(...a) },
  withSettleKind: (_k: string, fn: () => unknown) => fn(),
}));

import {
  checkFailedAuthorization,
  scheduleFailedAuthorizationChecks,
} from '../../src/pipeline/stages/shop-settle';
import { run, type ChainReader } from '../../src/jobs/shop-payment-reconcile.job';

const failedRow = {
  order_id: 'o1',
  payer: '0xpayer',
  eip3009_nonce: '0xn',
  pay_to: '0xseller',
  amount_usd: '1',
  splits: [],
  created_at: new Date(),
  chain_status: 'failed',
};
const mkDeps = () => {
  const exec = jest.fn(async () => 1);
  return {
    exec,
    deps: {
      db: { $queryRawUnsafe: jest.fn(async () => [failedRow]), $executeRawUnsafe: exec },
    } as never,
  };
};
const mkChain = (used: Array<boolean | Error>): ChainReader & { calls: number } => {
  let n = 0;
  const c: { calls: number } & Record<string, unknown> = {
    calls: 0,
    authorizationUsed: jest.fn(async (): Promise<boolean> => {
      const v = used[Math.min(n++, used.length - 1)];
      if (v instanceof Error) throw v;
      return v;
    }),
    findTransfer: jest.fn(async () => '0xtx'),
    receiptOk: jest.fn(),
  };
  return c as never;
};
const tick = async (ms: number) => {
  await jest.advanceTimersByTimeAsync(ms);
};

describe('scheduleFailedAuthorizationChecks', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockConfirm.mockClear();
    mockInc.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  it('four reads at +15 s, +45 s, +120 s and validBefore + 60 s', async () => {
    const { deps } = mkDeps();
    const chain = mkChain([false]);
    const t0 = Date.now();
    scheduleFailedAuthorizationChecks(deps, 'p1', { chain, validBeforeMs: t0 + 200_000 });
    await tick(14_999);
    expect(chain.authorizationUsed).toHaveBeenCalledTimes(0);
    await tick(1);
    expect(chain.authorizationUsed).toHaveBeenCalledTimes(1);
    await tick(30_000);
    expect(chain.authorizationUsed).toHaveBeenCalledTimes(2);
    await tick(75_000); // t = 120 s
    expect(chain.authorizationUsed).toHaveBeenCalledTimes(3);
    await tick(139_999); // t = 259.999 s, final is at 200 + 60 = 260 s
    expect(chain.authorizationUsed).toHaveBeenCalledTimes(3);
    await tick(1);
    expect(chain.authorizationUsed).toHaveBeenCalledTimes(4);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('used at +45 s -> confirmPayment once, later reads do not run', async () => {
    const { deps } = mkDeps();
    const chain = mkChain([false, true]);
    scheduleFailedAuthorizationChecks(deps, 'p1', { chain, validBeforeMs: Date.now() + 200_000 });
    await tick(300_000);
    expect(chain.authorizationUsed).toHaveBeenCalledTimes(2);
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ order_id: 'o1', payment_id: 'p1', tx_hash: '0xtx' }),
    );
    expect(mockInc).toHaveBeenCalledWith({ outcome: 'used' });
  });

  it('unused at the final read -> dead marker written, counter dead', async () => {
    const { deps, exec } = mkDeps();
    const chain = mkChain([false]);
    scheduleFailedAuthorizationChecks(deps, 'p1', { chain, validBeforeMs: Date.now() + 130_000 });
    await tick(200_000);
    const marker = exec.mock.calls.filter((c) => /dead_at/.test(String((c as unknown[])[0])));
    expect(marker).toHaveLength(1);
    expect(String((marker[0] as unknown[])[0])).toContain("interval '60 seconds' <= now()");
    expect(mockInc).toHaveBeenCalledWith({ outcome: 'dead' });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('RPC error: no marker, no confirm, counted once per read, next read still runs', async () => {
    const { deps, exec } = mkDeps();
    const chain = mkChain([new Error('rpc down'), false]);
    scheduleFailedAuthorizationChecks(deps, 'p1', { chain, validBeforeMs: Date.now() + 130_000 });
    await tick(16_000);
    expect(mockInc).toHaveBeenCalledWith({ outcome: 'rpc_error' });
    await tick(200_000);
    expect(exec).toHaveBeenCalledTimes(1); // only the final dead marker
  });

  it('a payment that is no longer failed is skipped', async () => {
    const { deps } = mkDeps();
    (deps as never as { db: { $queryRawUnsafe: jest.Mock } }).db.$queryRawUnsafe.mockResolvedValue([
      { ...failedRow, chain_status: 'confirmed' },
    ]);
    const chain = mkChain([true]);
    expect(await checkFailedAuthorization(deps, chain, 'p1', true)).toBe('skipped');
    expect(chain.authorizationUsed).not.toHaveBeenCalled();
  });
});

describe('shop-payment-reconcile give-up rule (T-0552)', () => {
  const pending = (over: Record<string, unknown> = {}) => ({
    payment_id: 'p1',
    order_id: 'o1',
    quote_id: 'q1',
    merchant_id: 'm1',
    payer: '0xpayer',
    eip3009_nonce: '0xn',
    pay_to: '0xseller',
    amount_usd: '1',
    splits: null,
    tx_hash: null,
    created_at: new Date(),
    expired: true,
    auth_dead: true,
    ...over,
  });
  const mk = (row: unknown) => {
    const exec = jest.fn(async () => 1);
    const tx = {
      $executeRawUnsafe: exec,
      $queryRawUnsafe: jest.fn(async () => [{ state: 'PAYING' }]),
    };
    return {
      exec,
      deps: {
        db: {
          $queryRawUnsafe: jest.fn().mockResolvedValueOnce([row]).mockResolvedValue([]),
          $executeRawUnsafe: exec,
        },
        transaction: async (fn: (t: unknown) => unknown) => fn(tx),
      } as never,
    };
  };
  beforeEach(() => mockTransition.mockClear());

  it('expired window + RPC error -> payment_unknown_rpc flag, order untouched', async () => {
    const { deps, exec } = mk(pending());
    const chain: ChainReader = {
      receiptOk: jest.fn(),
      authorizationUsed: jest.fn(async () => {
        throw new Error('rpc down');
      }),
      findTransfer: jest.fn(),
    };
    await run({ deps, chain });
    expect(mockTransition).not.toHaveBeenCalled();
    const flag = exec.mock.calls.filter((c) =>
      /payment_unknown_rpc/.test(String((c as unknown[])[0])),
    );
    expect(flag).toHaveLength(1);
    expect(String((flag[0] as unknown[])[0])).toContain('evidence_hash');
  });

  it('expired window + successful unused read -> PAYMENT_FAILED as before', async () => {
    const { deps } = mk(pending());
    const chain: ChainReader = {
      receiptOk: jest.fn(),
      authorizationUsed: jest.fn(async () => false),
      findTransfer: jest.fn(),
    };
    await run({ deps, chain });
    expect(mockTransition).toHaveBeenCalledWith(
      expect.anything(),
      'o1',
      'PAYMENT_FAILED',
      expect.objectContaining({ reason: 'reconcile_window_elapsed' }),
    );
  });

  it('expired window but validBefore + 60 s not yet passed -> no give-up', async () => {
    const { deps } = mk(pending({ auth_dead: false }));
    const chain: ChainReader = {
      receiptOk: jest.fn(),
      authorizationUsed: jest.fn(async () => false),
      findTransfer: jest.fn(),
    };
    await run({ deps, chain });
    expect(mockTransition).not.toHaveBeenCalled();
  });

  it('authorization used but transfer not found -> no give-up', async () => {
    const { deps } = mk(pending());
    const chain: ChainReader = {
      receiptOk: jest.fn(),
      authorizationUsed: jest.fn(async () => true),
      findTransfer: jest.fn(async () => undefined),
    };
    await run({ deps, chain });
    expect(mockTransition).not.toHaveBeenCalled();
  });
});
