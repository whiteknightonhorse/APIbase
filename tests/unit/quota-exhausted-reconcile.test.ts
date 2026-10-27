/**
 * T-0584: provider-health.job.ts reconcileQuotaAvailability -- EXHAUSTED (or a spent `trial`)
 * withdraws the provider's tools with status_reason quota_exhausted; recovery restores them only
 * when risk < CRITICAL and the last probe was OK; manual rows and below-floor rows are untouched.
 */
import { reconcileQuotaAvailability } from '../../src/jobs/provider-health.job';
import limits from '../../src/config/provider-limits.json';

type Tool = {
  tool_id: string;
  provider: string;
  status: string;
  status_source: string | null;
  status_reason: string | null;
  price_usd: number;
  price_floor_usd: number | null;
};

function fakeDb(ps: Array<Record<string, unknown>>, tools: Tool[]) {
  const matchSource = (t: Tool, or: Array<Record<string, unknown>>) =>
    or.some((c) =>
      'status_source' in c && typeof c.status_source === 'object' && c.status_source !== null
        ? (c.status_source as { in: string[] }).in.includes(t.status_source as string)
        : t.status_source === null && t.status === c.status,
    );
  return {
    tools,
    providerStatus: { findMany: async () => ps },
    tool: {
      async findMany({ where }: { where: Record<string, unknown> }) {
        return tools.filter(
          (t) =>
            t.provider === where.provider &&
            t.status === where.status &&
            t.status_reason === where.status_reason,
        );
      },
      async updateMany({ where, data }: { where: Record<string, any>; data: Partial<Tool> }) {
        const hit = tools.filter((t) => {
          if (where.tool_id) return where.tool_id.in.includes(t.tool_id);
          return (
            t.provider === where.provider &&
            t.status !== where.status.not &&
            matchSource(t, where.OR)
          );
        });
        hit.forEach((t) => Object.assign(t, data));
        return { count: hit.length };
      },
    },
  };
}

const mk = (tool_id: string, over: Partial<Tool> = {}): Tool => ({
  tool_id,
  provider: 'p1',
  status: 'healthy',
  status_source: null,
  status_reason: null,
  price_usd: 0.02,
  price_floor_usd: null,
  ...over,
});

describe('reconcileQuotaAvailability', () => {
  it('EXHAUSTED withdraws healthy tools with reason quota_exhausted, leaves manual rows', async () => {
    const db = fakeDb(
      [{ provider: 'p1', risk: 'EXHAUSTED', pct_remaining: 0, last_probe_result: 'OK' }],
      [mk('a'), mk('b', { status: 'degraded', status_source: 'manual', status_reason: 'x' })],
    );
    await reconcileQuotaAvailability(db as never);
    expect(db.tools[0]).toMatchObject({
      status: 'unavailable',
      status_source: 'autopilot',
      status_reason: 'quota_exhausted',
    });
    expect(db.tools[1].status).toBe('degraded');
  });

  it('CRITICAL alone does not withdraw', async () => {
    const db = fakeDb(
      [{ provider: 'p1', risk: 'CRITICAL', pct_remaining: 5, last_probe_result: 'OK' }],
      [mk('a')],
    );
    await reconcileQuotaAvailability(db as never);
    expect(db.tools[0].status).toBe('healthy');
  });

  it('a spent one-off trial (pct_remaining 0) withdraws even if risk is not EXHAUSTED', async () => {
    const trial = Object.entries(limits as Record<string, { limit_type?: string }>).find(
      ([, v]) => v.limit_type === 'trial',
    )![0];
    const db = fakeDb(
      [{ provider: trial, risk: 'NOINFO', pct_remaining: 0, last_probe_result: 'OK' }],
      [mk('a', { provider: trial })],
    );
    await reconcileQuotaAvailability(db as never);
    expect(db.tools[0].status_reason).toBe('quota_exhausted');
  });

  const withdrawn = () =>
    mk('a', {
      status: 'unavailable',
      status_source: 'autopilot',
      status_reason: 'quota_exhausted',
    });

  it('recovery: risk below CRITICAL and probe OK restores healthy', async () => {
    const db = fakeDb(
      [{ provider: 'p1', risk: 'NORMAL', pct_remaining: 90, last_probe_result: 'OK' }],
      [withdrawn()],
    );
    await reconcileQuotaAvailability(db as never);
    expect(db.tools[0]).toMatchObject({ status: 'healthy', status_reason: 'quota_recovered' });
  });

  it('no recovery while CRITICAL or NOINFO (never a recovery signal), or while the probe is not OK, or below price floor', async () => {
    for (const [risk, probe, floor] of [
      ['CRITICAL', 'OK', null],
      ['NOINFO', 'OK', null],
      ['NORMAL', 'FAIL_TRANSIENT', null],
      ['NORMAL', 'OK', 0.5],
    ] as const) {
      const t = withdrawn();
      t.price_floor_usd = floor;
      const db = fakeDb(
        [{ provider: 'p1', risk, pct_remaining: 90, last_probe_result: probe }],
        [t],
      );
      await reconcileQuotaAvailability(db as never);
      expect(db.tools[0].status).toBe('unavailable');
    }
  });
});
