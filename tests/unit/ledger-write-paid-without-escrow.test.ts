/** T-0339 (finding 048): the "paid tool without escrow" branch must log and count, and still not block. */
const mockError = jest.fn();
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: (...a: unknown[]) => mockError(...a) },
}));
jest.mock('../../src/services/ledger.service', () => ({
  writeDirectCharge: jest.fn(),
  writeFreeEntry: jest.fn(),
  writeSharedEntry: jest.fn(),
  writeX402Entry: jest.fn(),
  CACHE_HIT_COST_MULTIPLIER: 0.1,
}));
jest.mock('../../src/config/x402.config', () => ({ getX402Config: jest.fn() }));

import { ledgerWriteStage } from '../../src/pipeline/stages/ledger-write.stage';
import { register } from '../../src/services/metrics.service';

it('logs the error, bumps the counter and lets the request through', async () => {
  const ctx = {
    requestId: 'req-1',
    agentId: 'agent-1',
    executionId: 'exec-1',
    toolId: 'prov.tool',
    toolPrice: 0.01,
    billingStatus: 'RESERVED',
    cacheStatus: 'MISS',
  } as never;
  const result = await ledgerWriteStage.execute(ctx);
  expect(result.ok).toBe(true);
  expect(mockError).toHaveBeenCalledWith(
    { request_id: 'req-1', tool_id: 'prov.tool', billing_status: 'RESERVED', rail: 'none' },
    expect.any(String),
  );
  const text = await register.metrics();
  expect(text).toMatch(/apibase_ledger_paid_without_escrow_total\{rail="none"\} 1/);
});
