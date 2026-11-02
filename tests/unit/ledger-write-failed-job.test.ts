/** T-0646: the worker books `ledger.write_failed` outbox rows into execution_ledger. */
const mockQuery = jest.fn();
const mockExec = jest.fn();
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({ $queryRawUnsafe: mockQuery, $executeRawUnsafe: mockExec }),
}));
jest.mock('../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import { run } from '../../src/jobs/ledger-write-failed.job';
import { register } from '../../src/services/metrics.service';

const EXEC = '11111111-1111-1111-1111-111111111111';
const AGENT = '22222222-2222-2222-2222-222222222222';
const row = (over: Record<string, unknown> = {}) => ({
  id: 5n,
  created_at: new Date(1_800_000_000_000),
  payload: {
    request_id: 'r1',
    execution_id: EXEC,
    agent_id: AGENT,
    tool_id: 't.x',
    rail: 'x402',
    payer: '0xpayer',
    tx_hash: '0xtx',
    amount_usd: 0.002,
    ...over,
  },
});

beforeEach(() => {
  mockQuery.mockReset();
  mockExec.mockReset();
});

it('books one ledger row from the payload, marks processed, increments the metric', async () => {
  mockQuery.mockResolvedValue([row()]);
  mockExec.mockResolvedValue(1);
  await run();
  const ins = mockExec.mock.calls[0];
  expect(String(ins[0])).toContain('INSERT INTO execution_ledger');
  expect(String(ins[0])).toContain("'success', 'PAID'");
  expect(ins.slice(1)).toEqual([EXEC, AGENT, 't.x', 0.002, '0xpayer', true, '0xtx']);
  expect(String(mockExec.mock.calls[1][0])).toContain('UPDATE outbox SET processed = true');
  expect(await register.metrics()).toMatch(
    /apibase_ledger_write_failed_booked_total\{rail="x402"\} 1/,
  );
});

it('second run books nothing: existing ledger row inserts 0, no metric, still processed', async () => {
  mockQuery.mockResolvedValue([row()]);
  mockExec.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
  await run();
  expect(await register.metrics()).toMatch(
    /apibase_ledger_write_failed_booked_total\{rail="x402"\} 1/,
  );
  expect(String(mockExec.mock.calls[0][0])).toContain('WHERE NOT EXISTS');
  expect(String(mockExec.mock.calls[1][0])).toContain('UPDATE outbox');
});

it('leaves a row without agent_id untouched', async () => {
  mockQuery.mockResolvedValue([row({ agent_id: undefined })]);
  await run();
  expect(mockExec).not.toHaveBeenCalled();
});

it('MPP row books with NULL settle fields', async () => {
  mockQuery.mockResolvedValue([row({ rail: 'mpp', tx_hash: undefined })]);
  mockExec.mockResolvedValue(1);
  await run();
  expect(mockExec.mock.calls[0].slice(6)).toEqual([null, null]);
});

it('a DB error leaves the row unprocessed', async () => {
  mockQuery.mockResolvedValue([row()]);
  mockExec.mockRejectedValue(new Error('db down'));
  await run();
  expect(mockExec).toHaveBeenCalledTimes(1);
});
