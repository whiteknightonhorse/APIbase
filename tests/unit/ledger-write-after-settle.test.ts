/** T-0601: dedup_hit ledger row is a legal status; a LEDGER_WRITE failure after a settle never 500s. */
const mockError = jest.fn();
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: (...a: unknown[]) => mockError(...a) },
}));
const mockLedgerCreate = jest.fn();
const mockOutboxCreate = jest.fn();
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({
    executionLedger: { create: (...a: unknown[]) => mockLedgerCreate(...a) },
    outbox: { create: (...a: unknown[]) => mockOutboxCreate(...a) },
  }),
}));
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    executionLedger: { create: (...a: unknown[]) => mockLedgerCreate(...a) },
  })),
}));
jest.mock('../../src/config/x402.config', () => ({ getX402Config: jest.fn() }));

import { ledgerWriteStage } from '../../src/pipeline/stages/ledger-write.stage';
import { register } from '../../src/services/metrics.service';

const LEGAL_STATUS = [
  'pending',
  'running',
  'provider_success',
  'success',
  'failed',
  'timeout',
  'shared_success',
  'error',
  'blocked',
  'provider_input_rejected',
];

const base = {
  requestId: 'req-1',
  agentId: 'agent-1',
  executionId: 'exec-1',
  toolId: 'crypto.trending',
  toolPrice: 0.001,
  cacheHit: true,
  isLockOwner: false,
};

beforeEach(() => {
  mockError.mockClear();
  mockLedgerCreate.mockReset().mockResolvedValue({});
  mockOutboxCreate.mockReset().mockResolvedValue({});
});

it('x402 cache-hit dedup_hit writes one ledger row with a CHECK-legal status (root cause)', async () => {
  const ctx = {
    ...base,
    x402Paid: true,
    x402Payer: '0xabc',
    billingStatus: 'NOT_CHARGED',
    finalCost: 0,
    notChargedReason: 'dedup_hit',
  } as never;
  const r = await ledgerWriteStage.execute(ctx);
  expect(r.ok).toBe(true);
  expect(mockLedgerCreate).toHaveBeenCalledTimes(1);
  const data = mockLedgerCreate.mock.calls[0][0].data;
  expect(LEGAL_STATUS).toContain(data.status);
  expect(data).toMatchObject({ billing_status: 'NOT_CHARGED', cost_usd: 0, cache_status: 'HIT' });
});

it('x402 cache-hit settled call writes one PAID row', async () => {
  const ctx = {
    ...base,
    x402Paid: true,
    x402Payer: '0xabc',
    billingStatus: 'PAID',
    finalCost: 0.001,
    x402SettleSucceeded: true,
    x402SettleTxHash: '0xtx',
  } as never;
  expect((await ledgerWriteStage.execute(ctx)).ok).toBe(true);
  expect(mockLedgerCreate).toHaveBeenCalledTimes(1);
  expect(mockLedgerCreate.mock.calls[0][0].data).toMatchObject({
    status: 'success',
    billing_status: 'PAID',
  });
});

it('x402: ledger throw after a settle -> ok, outbox row, counter', async () => {
  mockLedgerCreate.mockRejectedValue(new Error('boom'));
  const ctx = {
    ...base,
    x402Paid: true,
    x402Payer: '0xabc',
    billingStatus: 'PAID',
    finalCost: 0.001,
    x402SettleSucceeded: true,
    x402SettleTxHash: '0xtx',
  } as never;
  const r = await ledgerWriteStage.execute(ctx);
  expect(r.ok).toBe(true);
  expect(mockOutboxCreate).toHaveBeenCalledTimes(1);
  expect(mockOutboxCreate.mock.calls[0][0].data).toMatchObject({
    event_type: 'ledger.write_failed',
    payload: {
      request_id: 'req-1',
      payer: '0xabc',
      tx_hash: '0xtx',
      amount_usd: 0.001,
      rail: 'x402',
    },
  });
  expect(mockError).toHaveBeenCalledWith(
    expect.objectContaining({ event: 'ledger_write_failed_after_settle' }),
    expect.any(String),
  );
  expect(await register.metrics()).toMatch(
    /apibase_ledger_write_failed_after_settle_total\{rail="x402"\} 1/,
  );
});

it('MPP: ledger throw after charge -> ok, outbox row, counter', async () => {
  mockLedgerCreate.mockRejectedValue(new Error('boom'));
  const ctx = {
    ...base,
    mppPaid: true,
    mppPayer: '0xmpp',
    billingStatus: 'PAID',
    finalCost: 0.001,
  } as never;
  expect((await ledgerWriteStage.execute(ctx)).ok).toBe(true);
  expect(mockOutboxCreate.mock.calls[0][0].data.payload).toMatchObject({
    rail: 'mpp',
    payer: '0xmpp',
  });
  expect(await register.metrics()).toMatch(
    /apibase_ledger_write_failed_after_settle_total\{rail="mpp"\} 1/,
  );
});

it('no money moved -> the throw still propagates', async () => {
  mockLedgerCreate.mockRejectedValue(new Error('boom'));
  const ctx = { ...base, x402Paid: true, billingStatus: 'NOT_CHARGED', finalCost: 0 } as never;
  await expect(ledgerWriteStage.execute(ctx)).rejects.toThrow('boom');
  expect(mockOutboxCreate).not.toHaveBeenCalled();
});
