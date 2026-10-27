jest.mock('../../src/services/prisma.service', () => ({ getPrisma: jest.fn() }));
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: jest.fn().mockRejectedValue(new Error('no redis in this test')),
}));

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getDashboardData } from '../../src/services/dashboard.service';
import { getPrisma } from '../../src/services/prisma.service';
import { ensureRedisConnected } from '../../src/services/redis.service';

/**
 * T-0586 (AUDIT-OPUS-1028 A2-11..16, A5-13): the dashboard says only what it measured.
 * limits.used is the value inside the limit window, green expires into "stale" by probe age,
 * never-probed rows are counted apart, PG state is the one health source, system incidents are shown.
 */

const NOW = Date.now();
const row = (over: Record<string, unknown>) => ({
  provider: 'fixtureprov',
  tool_count: 1n,
  calls_24h: 0n,
  calls_today: 0n,
  calls_this_month: 0n,
  win_hour: 0n,
  win_day: 0n,
  win_month: 0n,
  win_total: 0n,
  calls_total: 0n,
  paid_calls_24h: 0n,
  revenue_24h: null,
  avg_latency_ms: null,
  provider_state: 'HEALTHY',
  provider_risk: 'NORMAL',
  reliability_score: null,
  reliability_calculated_at: null,
  probe_interval_s: 3600,
  last_probe_at: new Date(NOW - 60_000),
  open_incidents: 0n,
  ...over,
});

async function run(rows: Array<Record<string, unknown>>, redisHealth?: Record<string, string>) {
  (getPrisma as jest.Mock).mockReturnValue({ $queryRawUnsafe: jest.fn().mockResolvedValue(rows) });
  if (redisHealth) {
    const client = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => 'OK'),
      hgetall: jest.fn(async (k: string) => (k.startsWith('provider:health:') ? redisHealth : {})),
    };
    (ensureRedisConnected as jest.Mock).mockResolvedValue(client);
  } else {
    (ensureRedisConnected as jest.Mock).mockRejectedValue(new Error('no redis'));
  }
  return getDashboardData();
}

it('limit-window usage counts only provider_called rows (same filter as provider-limit-alerts)', async () => {
  const q = jest.fn().mockResolvedValue([row({})]);
  (getPrisma as jest.Mock).mockReturnValue({ $queryRawUnsafe: q });
  (ensureRedisConnected as jest.Mock).mockRejectedValue(new Error('no redis'));
  await getDashboardData();
  const sql = String(q.mock.calls[0][0]);
  expect(sql).toMatch(/WHERE e2\.provider_called = true/);
});

describe('T-0586 limits are window-based', () => {
  it('unlimited: no used, no remaining, no colour, even with lifetime calls', async () => {
    const d = await run([row({ provider: 'polymarket', win_total: 987654n })]);
    expect(d.providers[0].limits).toMatchObject({
      type: 'unlimited',
      used: null,
      remaining: null,
      pct_remaining: null,
      window: null,
      status: 'n/a',
    });
  });

  it('monthly provider counts this month, never calls_total', async () => {
    const d = await run([
      row({
        provider: 'openweathermap',
        win_month: 40n,
        win_day: 7n,
        win_total: 500000n,
      }),
    ]);
    expect(d.providers[0].limits).toMatchObject({ window: 'monthly', used: 40, status: 'green' });
  });

  it('daily provider counts today, hourly provider counts the last hour', async () => {
    const d = await run([
      row({
        provider: 'ticketmaster',
        win_day: 12n,
        win_month: 900n,
        win_total: 9000n,
      }),
      row({ provider: 'aviasales', win_hour: 30n, win_day: 150n, win_total: 9000n }),
    ]);
    expect(d.providers[0].limits).toMatchObject({ window: 'daily', used: 12 });
    expect(d.providers[1].limits).toMatchObject({ window: 'hourly', used: 30, pct_remaining: 85 });
  });

  it('credits (never reset) use the lifetime window and say so', async () => {
    const d = await run([row({ provider: 'whoisxml', win_total: 100n })]);
    expect(d.providers[0].limits).toMatchObject({
      window: 'lifetime',
      used: 100,
      pct_remaining: 80,
    });
  });

  it('red only when pct_remaining <= 10 inside the window', async () => {
    const at = (used: bigint) => row({ provider: 'ticketmaster', win_day: used });
    const d = await run([at(4400n), at(4500n), at(4999n)]);
    expect(d.providers.map((p) => p.limits.pct_remaining)).toEqual([12, 10, 0]);
    expect(d.providers.map((p) => p.limits.status)).toEqual(['yellow', 'red', 'red']);
  });
});

describe('T-0586 health expires and is measured', () => {
  it('green with a probe <= 7200 s old stays green', async () => {
    const d = await run([row({ last_probe_at: new Date(NOW - 7100_000) })]);
    expect(d.providers[0].health).toMatchObject({ status: 'green', measured: true });
  });

  it('HEALTHY with a probe > 7200 s old is stale, never green', async () => {
    const d = await run([row({ last_probe_at: new Date(NOW - 7300_000) })]);
    expect(d.providers[0].health.status).toBe('stale');
    expect(d.providers[0].probe_age_s).toBeGreaterThan(7200);
  });

  it('orange and red states are not softened by age', async () => {
    const d = await run([
      row({ provider_state: 'DEGRADED', last_probe_at: new Date(NOW - 9000_000) }),
      row({ provider_state: 'DOWN', last_probe_at: new Date(NOW - 9000_000) }),
    ]);
    expect(d.providers.map((p) => p.health.status)).toEqual(['orange', 'red']);
  });

  it('never probed: measured false, status unknown, counted in providers_unmeasured not providers_down', async () => {
    const d = await run([
      row({ provider: 'amadeus', tool_count: 0n, last_probe_at: null, provider_state: 'UNKNOWN' }),
      row({ provider: 'gone', tool_count: 0n, provider_state: 'DOWN' }),
      row({ provider: 'ok' }),
    ]);
    expect(d.providers[0].health).toMatchObject({ measured: false, status: 'unknown' });
    expect(d.totals.providers_unmeasured).toBe(1);
    expect(d.totals.providers_down).toBe(1);
    expect(d.totals.providers_tracked).toBe(3);
    expect(d.totals.providers).toBe(1);
  });
});

describe('T-0586 one health source', () => {
  it('PG state decides; Redis only adds the latency colour; agreement is no conflict', async () => {
    const d = await run([row({})], { status: 'green', latency_ms: '90', last_check: 'x' });
    expect(d.providers[0].health).toMatchObject({
      status: 'green',
      latency_ms: 90,
      latency_status: 'green',
      conflict: false,
    });
  });

  it('disagreement is a visible conflict, and the PG value wins', async () => {
    const d = await run([row({})], { status: 'red', latency_ms: '9000', last_check: 'x' });
    expect(d.providers[0].health).toMatchObject({
      status: 'green',
      latency_status: 'red',
      conflict: true,
    });
  });

  it('a stale PG green with a green Redis hash is a conflict-free stale', async () => {
    const d = await run([row({ last_probe_at: new Date(NOW - 8000_000) })], {
      status: 'green',
      latency_ms: '50',
      last_check: 'x',
    });
    expect(d.providers[0].health.status).toBe('stale');
  });
});

describe('T-0586 system incidents', () => {
  const inc = {
    incident_id: 'i1',
    provider: 'night-orchestra',
    kind: 'JOB_STALE',
    severity: 'SEV2',
    state: 'OPEN',
    created_at: '2026-10-27T00:00:00Z',
  };

  it('the incident SQL selects only incidents whose provider has no provider_status row', async () => {
    const q = jest.fn().mockResolvedValue([row({ system_incidents: [inc] })]);
    (getPrisma as jest.Mock).mockReturnValue({ $queryRawUnsafe: q });
    (ensureRedisConnected as jest.Mock).mockRejectedValue(new Error('no redis'));
    const d = await getDashboardData();
    expect(q).toHaveBeenCalledTimes(1);
    expect(String(q.mock.calls[0][0])).toMatch(/NOT EXISTS \(SELECT 1 FROM provider_status/);
    expect(d.system_incidents).toEqual([inc]);
  });

  it('accepts the JSON as a string and defaults to an empty array', async () => {
    const a = await run([row({ system_incidents: JSON.stringify([inc]) })]);
    expect(a.system_incidents).toEqual([inc]);
    const b = await run([row({})]);
    expect(b.system_incidents).toEqual([]);
  });
});

describe('T-0586 worker jobs all go through registerJob', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/worker/server.ts'), 'utf-8');
  it('no direct cron.schedule is left in worker/server.ts', () => {
    expect(src).not.toMatch(/cron\.schedule\(/);
  });
  it.each([
    'reconciliation',
    'provider-health',
    'x402-health',
    'tool-quality',
    'partition-create',
    'partition-cleanup',
    'catalog-remoderate',
    'shop-fee-invoice',
  ])('job %s is registered', (name) => {
    expect(src).toContain(`name: '${name}'`);
  });
});

describe('T-0586 dashboard.html', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../static/dashboard.html'), 'utf-8');
  it('shows probe age next to the status and a stale colour', () => {
    expect(html).toContain("status === 'stale'");
    expect(html).toContain('dot-s');
    expect(html).toContain('fmtProbeAge(p.probe_age_s)');
  });
  it('renders the conflict, unmeasured and system incident rows', () => {
    expect(html).toContain('hl.conflict');
    expect(html).toContain('providers_unmeasured');
    expect(html).toContain('system_incidents');
  });
});
