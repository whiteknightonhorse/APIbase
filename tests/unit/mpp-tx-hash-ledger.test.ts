/** T-0652: the Tempo settlement hash reaches execution_ledger.settle_tx_hash; 'unknown' never does. */
const mockWriteX402Entry = jest.fn();
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/ledger.service', () => ({
  writeDirectCharge: jest.fn(),
  writeFreeEntry: jest.fn(),
  writeSharedEntry: jest.fn(),
  writeX402Entry: (a: unknown) => mockWriteX402Entry(a),
  CACHE_HIT_COST_MULTIPLIER: 0.1,
}));
jest.mock('../../src/config/x402.config', () => ({ getX402Config: jest.fn() }));

import { ledgerWriteStage, normalizeMppTxHash } from '../../src/pipeline/stages/ledger-write.stage';

const HASH = '0x' + 'AB'.repeat(32);
const mppCtx = (mppTxHash: string | undefined) =>
  ({
    requestId: 'req-1',
    agentId: 'agent-1',
    executionId: 'exec-1',
    toolId: 'prov.tool',
    toolPrice: 0.01,
    billingStatus: 'PAID',
    cacheStatus: 'MISS',
    mppPaid: true,
    mppPayer: '0xpayer',
    mppAsset: '0xasset',
    mppTxHash,
  }) as never;

describe('MPP tx hash in execution_ledger (T-0652)', () => {
  beforeEach(() => mockWriteX402Entry.mockReset());

  it('writes the lowercase settle hash for an MPP context', async () => {
    await ledgerWriteStage.execute(mppCtx(HASH));
    expect(mockWriteX402Entry.mock.calls[0][0].settleTxHash).toBe(HASH.toLowerCase());
  });

  it("writes no hash when mppx gave none or the literal 'unknown'", async () => {
    await ledgerWriteStage.execute(mppCtx('unknown'));
    await ledgerWriteStage.execute(mppCtx(undefined));
    expect(mockWriteX402Entry.mock.calls[0][0].settleTxHash).toBeUndefined();
    expect(mockWriteX402Entry.mock.calls[1][0].settleTxHash).toBeUndefined();
  });

  it('normalizeMppTxHash rejects non-strings and short values', () => {
    expect(normalizeMppTxHash(['0x1'])).toBeUndefined();
    expect(normalizeMppTxHash('0xabc')).toBeUndefined();
    expect(normalizeMppTxHash(HASH)).toBe(HASH.toLowerCase());
  });
});
