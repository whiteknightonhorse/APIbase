/**
 * AP-9 (818-autopilot-score-dashboard-api.md, L1/L2; Fable ruling-2 REJECT):
 * GET /api/v1/dashboard's provider_status/incidents JOIN must never make an
 * AP-8-autodemoted provider (all its tools flipped to status='unavailable',
 * status_source='autopilot') disappear from the dashboard — that provider is
 * exactly the DOWN-with-open-incident case L1/L2 exist to surface (sort by
 * open_incidents desc, SEV1/SEV2 on top). The pre-AP-9 filter
 * `WHERE t.status != 'unavailable'` predates status_source entirely and was
 * only ever meant to hide the ~20 legacy hand-set (status_source='manual' or
 * legacy NULL) unavailable rows (zyte/api2pdf-style) — never an autopilot
 * demotion.
 *
 * CI has no live Postgres (same disclosed scope as autopilot-schema-0009.test.ts
 * and tools-catalog-fail-closed.test.ts), so this is a shape-proof against the
 * REAL query text dashboard.service.ts sends to Prisma, not a reimplementation
 * of it — same convention as incidents-router.test.ts asserting on `call.select`
 * rather than trusting the response shape alone.
 *
 * Live-DB confirmation done once (disposable postgres:16.2-alpine, torn down
 * after, not CI-repeatable, same posture as the two files above): with a
 * provider whose only tool is (status='unavailable', status_source='autopilot')
 * plus an OPEN incident, the OLD `WHERE t.status != 'unavailable'` dropped the
 * provider's row entirely (0 rows); the FIXED
 * `WHERE (t.status != 'unavailable' OR t.status_source = 'autopilot')` returned
 * exactly one row for it with state=DOWN, open_incidents=1 — while a
 * status_source='manual' unavailable provider and a legacy status_source=NULL
 * unavailable provider (both inserted in the same run) stayed excluded either way.
 */

jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: jest.fn(),
}));

jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: jest.fn().mockRejectedValue(new Error('no redis in this test')),
}));

import { getDashboardData } from '../../src/services/dashboard.service';
import { getPrisma } from '../../src/services/prisma.service';

const mockGetPrisma = getPrisma as jest.Mock;
const mockQueryRawUnsafe = jest.fn();

beforeEach(() => {
  mockQueryRawUnsafe.mockReset();
  mockGetPrisma.mockReturnValue({ $queryRawUnsafe: mockQueryRawUnsafe });
});

describe('getDashboardData — AP-9 provider_status/incidents JOIN', () => {
  it('MUTATION CONTROL: the query WHERE clause excludes only manual/unmarked unavailable tools, never an autopilot demotion', async () => {
    mockQueryRawUnsafe.mockResolvedValue([]);
    await getDashboardData();

    expect(mockQueryRawUnsafe).toHaveBeenCalledTimes(1);
    const sql = mockQueryRawUnsafe.mock.calls[0][0] as string;

    // Must NOT be the bare pre-AP-9 filter that blinds the dashboard to every
    // autopilot-demoted DOWN provider (Fable ruling-2 REJECT #1). Revert the
    // fix and this line goes red.
    expect(sql).not.toMatch(/WHERE\s+t\.status\s*!=\s*'unavailable'\s*\n/);
    // Must be exactly the corrected predicate: exclude unavailable UNLESS
    // status_source is 'autopilot'.
    expect(sql).toMatch(
      /WHERE\s*\(t\.status\s*!=\s*'unavailable'\s*OR\s*t\.status_source\s*=\s*'autopilot'\)/,
    );
  });

  it('an autopilot-demoted DOWN provider surfaces with its state/open_incidents, not silently dropped', async () => {
    mockQueryRawUnsafe.mockResolvedValue([
      {
        provider: 'apdown',
        tool_count: 1n,
        calls_24h: 0n,
        calls_today: 0n,
        calls_this_month: 0n,
        calls_total: 0n,
        paid_calls_24h: 0n,
        revenue_24h: null,
        avg_latency_ms: null,
        provider_state: 'DOWN',
        provider_risk: 'ATTENTION',
        reliability_score: 40,
        last_probe_at: new Date(),
        open_incidents: 1n,
      },
    ]);

    const data = await getDashboardData();

    expect(data.providers).toHaveLength(1);
    expect(data.providers[0]).toMatchObject({
      provider: 'apdown',
      state: 'DOWN',
      risk: 'ATTENTION',
      reliability_score: 40,
      open_incidents: 1,
    });
  });
});
