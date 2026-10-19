/** T-0428: the x402-settle-pending job resolves unknown settles by reading the chain; it never settles. */
const mockQuery = jest.fn();
const mockExec = jest.fn();
const mockOutboxCreate = jest.fn();
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({
    $queryRawUnsafe: mockQuery,
    $executeRawUnsafe: mockExec,
    outbox: { create: mockOutboxCreate },
  }),
}));
jest.mock('../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../../src/config/x402.config', () => ({
  getX402Config: () => ({ paymentAddress: '0xpay' }),
  toMicroUsdc: (n: number) => String(Math.round(n * 1_000_000)),
}));
const mockSettlePayment = jest.fn();
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({ settlePayment: mockSettlePayment }),
}));
jest.mock('../../src/jobs/shop-payment-reconcile.job', () => ({ viemChain: jest.fn() }));

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { run } from '../../src/jobs/x402-settle-pending.job';
import type { ChainReader } from '../../src/jobs/shop-payment-reconcile.job';

const NOW = 1_800_000_000_000;
function row(over: Record<string, unknown> = {}) {
  return {
    id: 7n,
    created_at: new Date(NOW - 3600_000),
    payload: {
      request_id: 'r1',
      execution_id: '11111111-1111-1111-1111-111111111111',
      tool_id: 't',
      payer: '0xpayer',
      amount_usd: 0.002,
      tx_hash: '0xtx',
      nonce: '0xnonce',
      valid_before: String(NOW / 1000 + 600),
      ...over,
    },
  };
}
function chain(over: Partial<ChainReader> = {}): ChainReader {
  return {
    receiptOk: jest.fn(async () => false),
    authorizationUsed: jest.fn(async () => false),
    findTransfer: jest.fn(async () => undefined),
    ...over,
  };
}
const sqls = () => mockExec.mock.calls.map((c) => String(c[0]));

describe('x402-settle-pending job (T-0428)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockExec.mockReset();
    mockOutboxCreate.mockReset();
    mockSettlePayment.mockReset();
  });

  afterEach(() => expect(mockSettlePayment).not.toHaveBeenCalled());

  it('selects only its own event type', async () => {
    mockQuery.mockResolvedValue([]);
    await run({ chain: chain(), nowMs: NOW });
    expect(String(mockQuery.mock.calls[0][0])).toContain(
      "processed = false AND event_type = 'x402_settle_pending'",
    );
  });

  it('receipt ok -> ledger settled + processed', async () => {
    mockQuery.mockResolvedValue([row()]);
    await run({ chain: chain({ receiptOk: jest.fn(async () => true) }), nowMs: NOW });
    expect(sqls().some((s) => s.includes("x402_settle_state = 'settled'"))).toBe(true);
    expect(sqls().some((s) => s.includes('SET processed = true'))).toBe(true);
    expect(mockOutboxCreate).not.toHaveBeenCalled();
  });

  it('receipt missing, authorization used, transfer found -> settled', async () => {
    mockQuery.mockResolvedValue([row()]);
    const c = chain({
      authorizationUsed: jest.fn(async () => true),
      findTransfer: jest.fn(async () => '0xfound'),
    });
    await run({ chain: c, nowMs: NOW });
    expect(mockExec.mock.calls[0][2]).toBe('0xfound');
    expect(sqls().some((s) => s.includes('SET processed = true'))).toBe(true);
  });

  it('authorization unused + expired -> x402_settle_failed pending_expired_unsettled + processed', async () => {
    mockQuery.mockResolvedValue([row({ valid_before: String(NOW / 1000 - 1) })]);
    await run({ chain: chain(), nowMs: NOW });
    expect(mockOutboxCreate).toHaveBeenCalledTimes(1);
    const d = mockOutboxCreate.mock.calls[0][0].data;
    expect(d.event_type).toBe('x402_settle_failed');
    expect(d.payload.reason).toBe('pending_expired_unsettled');
    expect(sqls().some((s) => s.includes('SET processed = true'))).toBe(true);
  });

  it('authorization unused + not expired -> untouched', async () => {
    mockQuery.mockResolvedValue([row()]);
    await run({ chain: chain(), nowMs: NOW });
    expect(mockExec).not.toHaveBeenCalled();
    expect(mockOutboxCreate).not.toHaveBeenCalled();
  });

  it('RPC throw -> untouched', async () => {
    mockQuery.mockResolvedValue([row({ valid_before: String(NOW / 1000 - 1) })]);
    const c = chain({
      receiptOk: jest.fn(async () => {
        throw new Error('rpc down');
      }),
    });
    await run({ chain: c, nowMs: NOW });
    expect(mockExec).not.toHaveBeenCalled();
    expect(mockOutboxCreate).not.toHaveBeenCalled();
  });
});

describe('no second settle anywhere (T-0428 hard limit)', () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const f = join(dir, n);
      return statSync(f).isDirectory() ? walk(f) : f.endsWith('.ts') ? [f] : [];
    });
  }
  it('settlePayment( is called from exactly the two settle stages', () => {
    const root = join(__dirname, '../../src');
    const hits = walk(root)
      .filter((f) => /\.settlePayment\(/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(root.length + 1))
      .sort();
    expect(hits).toEqual(['pipeline/stages/shop-settle.ts', 'pipeline/stages/x402-settle.ts']);
  });
});
