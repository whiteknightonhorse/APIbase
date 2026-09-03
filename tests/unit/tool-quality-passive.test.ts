/**
 * AP-3 (G1 "passive first" + F1's traffic-derived DEGRADED trigger):
 * tool-quality.job.ts's two added passive steps — real traffic proving a
 * provider up feeds a passive OK, and real traffic showing a bad error rate
 * feeds a passive FAIL_TRANSIENT, both through the SAME state machine an
 * active probe uses (recordProbeResult, shared).
 *
 * recordProbeResult itself is already covered end to end by
 * provider-health-state-machine.test.ts; this file only asserts that
 * tool-quality.job.ts calls it correctly for providers meeting each
 * threshold, that the OK signal wins when both fire in the same tick, and
 * that the SQL enforces the config/autopilot.ts constants rather than a
 * hardcoded literal.
 */
jest.mock('../../src/jobs/provider-health.job', () => ({
  recordProbeResult: jest.fn().mockResolvedValue(undefined),
}));

const queryRawUnsafe = jest.fn();
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({ $queryRawUnsafe: queryRawUnsafe })),
}));

import { recordProbeResult } from '../../src/jobs/provider-health.job';
import {
  PASSIVE_MIN_SUCCESS_CALLS,
  PASSIVE_WINDOW_HOURS,
  PASSIVE_ERROR_RATE_WINDOW_HOURS,
  PASSIVE_ERROR_RATE_MIN_CALLS,
} from '../../src/config/autopilot';
import { run } from '../../src/jobs/tool-quality.job';

const mockedRecordProbeResult = recordProbeResult as jest.MockedFunction<typeof recordProbeResult>;

function createFakeRedis() {
  return {
    pipeline: () => ({
      set: jest.fn(),
      exec: jest.fn().mockResolvedValue(undefined),
    }),
  };
}

// Call order inside run(): 1) passive-success-by-provider, 2) passive
// error-rate-by-provider, 3) the existing per-tool quality query. All three
// go through the same mocked $queryRawUnsafe.
function mockQueries(
  passiveOkRows: unknown[],
  errorRateRows: unknown[] = [],
  toolRows: unknown[] = [],
) {
  queryRawUnsafe.mockReset();
  queryRawUnsafe
    .mockResolvedValueOnce(passiveOkRows)
    .mockResolvedValueOnce(errorRateRows)
    .mockResolvedValueOnce(toolRows);
}

beforeEach(() => {
  mockedRecordProbeResult.mockClear();
});

describe('tool-quality.job passive-success step (G1)', () => {
  it('feeds a passive OK for every provider the SQL says met the threshold', async () => {
    mockQueries([{ provider: 'weatherco', successes: 15n, p95: 88 }]);

    await run(createFakeRedis() as never);

    expect(mockedRecordProbeResult).toHaveBeenCalledTimes(1);
    expect(mockedRecordProbeResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'weatherco',
      'passive',
      'OK',
      expect.objectContaining({
        latencyMs: 88,
        detail: expect.stringContaining('15 successful calls'),
      }),
    );
  });

  it("the passive-success query's threshold/window come from config/autopilot.ts, not a hardcoded literal", async () => {
    mockQueries([]);

    await run(createFakeRedis() as never);

    const passiveSql = queryRawUnsafe.mock.calls[0][0] as string;
    expect(passiveSql).toContain(`INTERVAL '${PASSIVE_WINDOW_HOURS} hours'`);
    expect(passiveSql).toContain(`HAVING COUNT(*) >= ${PASSIVE_MIN_SUCCESS_CALLS}`);
  });

  it('does not call recordProbeResult at all when no provider meets any threshold', async () => {
    mockQueries([]);

    await run(createFakeRedis() as never);

    expect(mockedRecordProbeResult).not.toHaveBeenCalled();
  });

  it('feeds one passive OK per qualifying provider, independent of the per-tool quality pass', async () => {
    mockQueries(
      [
        { provider: 'weatherco', successes: 20n, p95: 50 },
        { provider: 'mapsco', successes: 11n, p95: null },
      ],
      [],
      [{ tool_id: 'weatherco.forecast', total: 20n, ok: 20n, p50: 40, p95: 50 }],
    );

    await run(createFakeRedis() as never);

    expect(mockedRecordProbeResult).toHaveBeenCalledTimes(2);
    expect(mockedRecordProbeResult).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.anything(),
      'mapsco',
      'passive',
      'OK',
      expect.objectContaining({ latencyMs: undefined }),
    );
  });
});

describe('tool-quality.job passive-degradation step (F1: "реальный трафик первичен")', () => {
  it('feeds a passive FAIL_TRANSIENT for a provider over the error-rate threshold', async () => {
    mockQueries([], [{ provider: 'flakyco', total: 20n, failed: 6n }]); // 30% error rate

    await run(createFakeRedis() as never);

    expect(mockedRecordProbeResult).toHaveBeenCalledTimes(1);
    expect(mockedRecordProbeResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'flakyco',
      'passive',
      'FAIL_TRANSIENT',
      expect.objectContaining({ detail: expect.stringContaining('30%') }),
    );
  });

  it('does not flag a provider below the 25% error-rate threshold', async () => {
    mockQueries([], [{ provider: 'mostlyfine', total: 20n, failed: 4n }]); // 20% error rate

    await run(createFakeRedis() as never);

    expect(mockedRecordProbeResult).not.toHaveBeenCalled();
  });

  it('a provider that also got a passive OK this tick is left alone (OK wins within one tick)', async () => {
    mockQueries(
      [{ provider: 'mixedco', successes: 15n, p95: 40 }],
      [{ provider: 'mixedco', total: 20n, failed: 10n }], // 50% error rate in the last 1h
    );

    await run(createFakeRedis() as never);

    expect(mockedRecordProbeResult).toHaveBeenCalledTimes(1);
    expect(mockedRecordProbeResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'mixedco',
      'passive',
      'OK',
      expect.anything(),
    );
  });

  it("the error-rate query's window/threshold come from config/autopilot.ts, not a hardcoded literal", async () => {
    mockQueries([], []);

    await run(createFakeRedis() as never);

    const errorRateSql = queryRawUnsafe.mock.calls[1][0] as string;
    expect(errorRateSql).toContain(`INTERVAL '${PASSIVE_ERROR_RATE_WINDOW_HOURS} hour'`);
    expect(errorRateSql).toContain(`HAVING COUNT(*) >= ${PASSIVE_ERROR_RATE_MIN_CALLS}`);
  });
});
