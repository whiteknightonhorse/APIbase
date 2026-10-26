/**
 * T-0569: /api/v1/dashboard publishes moderation.last_llm_review_at (newest layer-3 review row).
 * It rides the existing single provider query, so no second PG round trip is added.
 */
jest.mock('../../src/services/prisma.service', () => ({ getPrisma: jest.fn() }));
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: jest.fn().mockRejectedValue(new Error('no redis in this test')),
}));

import { getDashboardData } from '../../src/services/dashboard.service';
import { getPrisma } from '../../src/services/prisma.service';

const mockQueryRawUnsafe = jest.fn();

beforeEach(() => {
  mockQueryRawUnsafe.mockReset();
  (getPrisma as jest.Mock).mockReturnValue({ $queryRawUnsafe: mockQueryRawUnsafe });
});

const row = (last: Date | null) => ({
  provider: 'p',
  tool_count: 1n,
  calls_24h: 0n,
  calls_today: 0n,
  calls_this_month: 0n,
  calls_total: 0n,
  paid_calls_24h: 0n,
  revenue_24h: null,
  avg_latency_ms: null,
  provider_state: null,
  provider_risk: null,
  reliability_score: null,
  reliability_calculated_at: null,
  probe_interval_s: null,
  last_probe_at: null,
  open_incidents: 0n,
  last_llm_review_at: last,
});

describe('dashboard moderation.last_llm_review_at (T-0569)', () => {
  it('is the ISO time of the newest llm review, from the one existing query', async () => {
    mockQueryRawUnsafe.mockResolvedValue([row(new Date('2026-10-26T08:01:33.989Z'))]);
    const data = await getDashboardData();
    expect(data.moderation.last_llm_review_at).toBe('2026-10-26T08:01:33.989Z');
    expect(mockQueryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(mockQueryRawUnsafe.mock.calls[0][0]).toMatch(
      /SELECT max\(r\.at\) FROM shop_moderation_reviews r WHERE r\.layer = 'llm'/,
    );
  });

  it('is null (never fabricated) when no review exists or there are no rows', async () => {
    mockQueryRawUnsafe.mockResolvedValue([row(null)]);
    expect((await getDashboardData()).moderation.last_llm_review_at).toBeNull();
    mockQueryRawUnsafe.mockResolvedValue([]);
    expect((await getDashboardData()).moderation.last_llm_review_at).toBeNull();
  });
});
