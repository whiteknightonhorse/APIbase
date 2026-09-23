/**
 * T-0177 (2026-09-23) — the dashboard must surface x402 local-facilitator
 * settle health and operator gas wallet balance without depending on
 * Telegram (Prometheus alerts #28/#29 route through Alertmanager -> Telegram,
 * which is paused; that gap let the local facilitator run at 0% settle
 * success from 2026-06-16 to 2026-09-23 unnoticed). Both values are written
 * to Redis by the hourly x402-health.job.ts and read here — no extra PG
 * query (dashboard-autopilot-status.test.ts pins exactly one $queryRawUnsafe
 * call per request).
 */

jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: jest.fn(),
}));

const mockHgetall = jest.fn();
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: jest.fn().mockResolvedValue({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn(),
    hgetall: (...args: unknown[]) => mockHgetall(...args),
  }),
}));

import { getDashboardData } from '../../src/services/dashboard.service';
import { getPrisma } from '../../src/services/prisma.service';

const mockGetPrisma = getPrisma as jest.Mock;
const mockQueryRawUnsafe = jest.fn();

beforeEach(() => {
  mockQueryRawUnsafe.mockReset();
  mockQueryRawUnsafe.mockResolvedValue([]);
  mockGetPrisma.mockReturnValue({ $queryRawUnsafe: mockQueryRawUnsafe });
  mockHgetall.mockReset();
});

function hgetallFor(fixtures: Record<string, Record<string, string>>) {
  mockHgetall.mockImplementation(async (key: string) => fixtures[key] ?? {});
}

describe('getDashboardData — x402 local settle health / operator wallet (T-0177)', () => {
  it('reports status=red when every settle in the window failed (the T-0177 case)', async () => {
    hgetallFor({
      'x402:local_settle': {
        successes: '0',
        failures: '4911',
        window_minutes: '30',
        status: 'red',
        last_check: '2026-09-23T17:20:00.000Z',
      },
      'x402:operator': {
        address: '0x54F0358fB619B254d4B1F6dE635180623eb47932',
        balance_eth: '4.8e-7',
        min_balance_eth: '0.005',
        below_threshold: 'true',
        last_check: '2026-09-23T17:20:00.000Z',
      },
    });

    const data = await getDashboardData();

    expect(data.payment_system.local_settle_health).toEqual({
      successes: 0,
      failures: 4911,
      window_minutes: 30,
      status: 'red',
    });
    expect(data.payment_system.operator_wallet).toEqual(
      expect.objectContaining({
        address: '0x54F0358fB619B254d4B1F6dE635180623eb47932',
        below_threshold: true,
      }),
    );
  });

  it('leaves both fields null when Redis has no data yet (job has not run)', async () => {
    hgetallFor({});

    const data = await getDashboardData();

    expect(data.payment_system.local_settle_health).toBeNull();
    expect(data.payment_system.operator_wallet).toBeNull();
  });

  it('still makes exactly one PG query for the whole request (no per-request settle-health query)', async () => {
    hgetallFor({});

    await getDashboardData();

    expect(mockQueryRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
