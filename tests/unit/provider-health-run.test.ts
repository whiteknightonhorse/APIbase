/**
 * AP-3: provider-health.job.ts `run()` end-to-end against a fake Prisma
 * client, a fake Redis, and a mocked fetch — the orchestration around the
 * state machine: priority-queue selection (K=5 most overdue), asap
 * out-of-turn handling + flag consumption, and the probe-budget skip path.
 * State-machine correctness itself is covered by
 * provider-health-state-machine.test.ts; this file is about what `run()`
 * does around it.
 *
 * Each test uses jest.isolateModules so the job's module-level `seeded`
 * flag, and the mocked provider-limits.json/@prisma/client, start fresh —
 * otherwise the second test would silently inherit the first test's
 * "already seeded" state (module registries persist across `it()`s in the
 * same file by default).
 */
import { applyPassiveDegradation } from '../../src/jobs/tool-quality.job';

type FakeRedis = ReturnType<typeof createFakeRedis>;
type FakeDb = ReturnType<typeof createFakeDb>;

function createFakeRedis(asapFlags: string[] = []) {
  const strings = new Map<string, string>();
  for (const p of asapFlags) strings.set(`probe:asap:${p}`, '1');
  const hashes = new Map<string, Record<string, string>>();
  const deleted: string[] = [];
  return {
    strings,
    hashes,
    deleted,
    async get(key: string) {
      return strings.get(key) ?? null;
    },
    async setex(key: string, _seconds: number, value: string) {
      strings.set(key, value);
      return 'OK';
    },
    async del(key: string) {
      strings.delete(key);
      deleted.push(key);
      return 1;
    },
    async hmset(key: string, fields: Record<string, string>) {
      hashes.set(key, { ...(hashes.get(key) ?? {}), ...fields });
      return 'OK';
    },
    async expire() {
      return 1;
    },
    async incr(key: string) {
      const next = (Number(strings.get(key)) || 0) + 1;
      strings.set(key, String(next));
      return next;
    },
    // Single-page SCAN is enough for a bounded test fixture — real Redis
    // pagination is exercised implicitly by the cursor-loop in
    // scanAsapFlags(), not re-tested here.
    async scan(_cursor: string, _match: string, _pattern: string, _count: string, _n: number) {
      const keys = [...strings.keys()].filter((k) => k.startsWith('probe:asap:'));
      return ['0', keys];
    },
  };
}

function createFakeDb(seedRows: Record<string, Record<string, unknown>> = {}) {
  const statuses = new Map<string, Record<string, unknown>>(Object.entries(seedRows));
  const probeLogs: Array<Record<string, unknown>> = [];
  return {
    statuses,
    probeLogs,
    providerStatus: {
      async createMany({
        data,
        skipDuplicates,
      }: {
        data: Array<Record<string, unknown>>;
        skipDuplicates?: boolean;
      }) {
        for (const d of data) {
          if (skipDuplicates && statuses.has(d.provider as string)) continue;
          statuses.set(d.provider as string, d);
        }
        return { count: data.length };
      },
      async findMany({
        where,
        orderBy,
        take,
      }: {
        where?: { provider?: { in?: string[] } };
        orderBy?: { next_probe_at?: 'asc' | 'desc' };
        take?: number;
      }) {
        let rows = [...statuses.values()];
        if (where?.provider?.in) {
          const allow = new Set(where.provider.in);
          rows = rows.filter((r) => allow.has(r.provider as string));
        }
        if (orderBy?.next_probe_at === 'asc') {
          rows = rows.sort(
            (a, b) =>
              new Date(a.next_probe_at as string).getTime() -
              new Date(b.next_probe_at as string).getTime(),
          );
        }
        if (take) rows = rows.slice(0, take);
        return rows.map((r) => ({ provider: r.provider }));
      },
      async findUnique({ where }: { where: { provider: string } }) {
        return statuses.get(where.provider) ?? null;
      },
      async upsert({
        where,
        create,
      }: {
        where: { provider: string };
        create: Record<string, unknown>;
      }) {
        if (!statuses.has(where.provider)) {
          statuses.set(where.provider, { consecutive_failures: 0, ...create });
        }
        return { ...statuses.get(where.provider) };
      },
      async update({
        where,
        data,
      }: {
        where: { provider: string };
        data: Record<string, unknown>;
      }) {
        const cur = statuses.get(where.provider) ?? {};
        const next = { ...cur };
        for (const [k, v] of Object.entries(data)) {
          if (v !== undefined) next[k] = v;
        }
        statuses.set(where.provider, next);
        return { ...next };
      },
    },
    probeLog: {
      async create({ data }: { data: Record<string, unknown> }) {
        probeLogs.push(data);
        return data;
      },
    },
  };
}

const SEVEN_PROVIDERS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf'];

function mockProviderLimits(overrides: Record<string, Record<string, unknown>> = {}) {
  const base: Record<string, Record<string, unknown>> = {};
  for (const name of SEVEN_PROVIDERS) {
    base[name] = {
      display_name: name,
      health_url: `https://${name}.test/health`,
      limit_type: 'unlimited',
      free_limit: 0,
      reset_period: 'none',
      ...(overrides[name] ?? {}),
    };
  }
  return base;
}

/** Load a fresh copy of provider-health.job.ts with its own mocked
 *  @prisma/client + provider-limits.json, isolated from any other test. */
function loadJobModule(
  db: FakeDb,
  providerLimits: Record<string, Record<string, unknown>>,
): typeof import('../../src/jobs/provider-health.job') {
  let mod!: typeof import('../../src/jobs/provider-health.job');
  jest.isolateModules(() => {
    jest.doMock('@prisma/client', () => ({ PrismaClient: jest.fn(() => db) }));
    jest.doMock('../../src/config/provider-limits.json', () => providerLimits);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../../src/jobs/provider-health.job');
  });
  return mod;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.dontMock('@prisma/client');
  jest.dontMock('../../src/config/provider-limits.json');
});

describe('run() — priority queue + asap out-of-turn (G2)', () => {
  it('probes every asap-flagged provider plus K=5 most overdue from the queue, in order', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));

    const t0 = new Date('2026-09-03T00:00:00Z').getTime();
    const seed: Record<string, Record<string, unknown>> = {};
    // 6 providers staggered most-overdue-first; 'golf' is LEAST overdue but asap-flagged.
    ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'].forEach((name, i) => {
      seed[name] = {
        provider: name,
        state: 'HEALTHY',
        state_since: new Date(t0),
        next_probe_at: new Date(t0 + i * 1000),
        probe_interval_s: 21600,
        consecutive_failures: 0,
      };
    });
    seed.golf = {
      provider: 'golf',
      state: 'HEALTHY',
      state_since: new Date(t0),
      next_probe_at: new Date(t0 + 999_999_000), // far in the future — never picked by the queue alone
      probe_interval_s: 21600,
      consecutive_failures: 0,
    };

    const db = createFakeDb(seed);
    const redis = createFakeRedis(['golf']);
    const { run } = loadJobModule(db, mockProviderLimits());

    await run(redis as never);

    const probedProviders = db.probeLogs.map((l) => l.provider);
    // golf (asap, out of turn) + the 5 most-overdue from the queue; foxtrot
    // (6th most overdue) is left for a later tick.
    expect(probedProviders).toEqual(['golf', 'alpha', 'bravo', 'charlie', 'delta', 'echo']);
    expect(probedProviders).not.toContain('foxtrot');

    // the asap flag is consumed once handled, so it doesn't loop forever
    expect(redis.deleted).toContain('probe:asap:golf');
    expect(redis.strings.has('probe:asap:golf')).toBe(false);
  });

  it('seeds provider_status for every configured provider on first run (bootstraps the queue)', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const db = createFakeDb(); // empty — nothing seeded yet
    const redis = createFakeRedis();
    const { run } = loadJobModule(db, mockProviderLimits());

    await run(redis as never);

    for (const name of SEVEN_PROVIDERS) {
      expect(db.statuses.has(name)).toBe(true);
    }
  });

  it('retries seeding on the next tick if the first attempt fails, rather than disabling it forever', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const db = createFakeDb();
    const originalCreateMany = db.providerStatus.createMany.bind(db.providerStatus);
    let calls = 0;
    db.providerStatus.createMany = (async (args: Parameters<typeof originalCreateMany>[0]) => {
      calls++;
      if (calls === 1) throw new Error('transient DB error');
      return originalCreateMany(args);
    }) as typeof originalCreateMany;
    const redis = createFakeRedis();
    const { run } = loadJobModule(db, mockProviderLimits());

    // First tick: seeding throws, so the whole run() call rejects (matching
    // how the worker's runProviderHealthSafe() wrapper treats any job error).
    await expect(run(redis as never)).rejects.toThrow('transient DB error');
    expect(db.statuses.size).toBe(0);

    // Second tick: seeding must be attempted again, not skipped as
    // "already done".
    await run(redis as never);
    for (const name of SEVEN_PROVIDERS) {
      expect(db.statuses.has(name)).toBe(true);
    }
    expect(calls).toBe(2);
  });
});

describe('run() — probe budget (G2/C0.5)', () => {
  it('a provider already at its daily cap is SKIPPED_BUDGET, not probed, and state is untouched', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock;

    const t0 = new Date('2026-09-03T00:00:00Z');
    const seed: Record<string, Record<string, unknown>> = {};
    SEVEN_PROVIDERS.forEach((name, i) => {
      seed[name] = {
        provider: name,
        state: 'HEALTHY',
        state_since: t0,
        next_probe_at: new Date(t0.getTime() + i * 1000), // 'alpha' most overdue -> selected first
        probe_interval_s: 21600,
        consecutive_failures: 0,
      };
    });

    const db = createFakeDb(seed);
    const redis = createFakeRedis();
    // pre-spend alpha's entire paid budget (4/day) before this tick
    const dateKey = new Date().toISOString().slice(0, 10);
    redis.strings.set(`probe:budget:alpha:${dateKey}`, '4');

    const { run } = loadJobModule(
      db,
      mockProviderLimits({ alpha: { probe: { cost_class: 'paid' } } }),
    );

    await run(redis as never);

    const alphaLog = db.probeLogs.find((l) => l.provider === 'alpha');
    expect(alphaLog).toMatchObject({ kind: 'suppressed', result: 'SKIPPED_BUDGET' });
    expect(alphaLog?.detail).toBe('budget 5/4 spent');

    // No HTTP call was made for the skipped provider — that's the whole point
    // of the budget (avoid spending the paid call), and the fetch mock
    // returning 200 for everyone would otherwise mask a missed skip.
    const alphaCalled = fetchMock.mock.calls.some(([url]) => String(url).includes('alpha'));
    expect(alphaCalled).toBe(false);

    // state/failure counters are untouched by a skip — only next_probe_at moves.
    expect(db.statuses.get('alpha')).toMatchObject({ state: 'HEALTHY', consecutive_failures: 0 });

    // The usage/limits bookkeeping (existing dashboard consumer) is a ledger
    // count, not an upstream call — it must still run even when the active
    // probe itself was skipped by budget, or the dashboard's per-provider
    // limits cache silently goes stale for anything hitting its cap.
    expect(redis.hashes.has('provider:limits:alpha')).toBe(true);
  });

  it('a probe.max_per_day override in provider-limits.json replaces the cost-class default end to end', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock;

    const t0 = new Date('2026-09-03T00:00:00Z');
    const seed: Record<string, Record<string, unknown>> = {};
    SEVEN_PROVIDERS.forEach((name, i) => {
      seed[name] = {
        provider: name,
        state: 'HEALTHY',
        state_since: t0,
        next_probe_at: new Date(t0.getTime() + i * 1000),
        probe_interval_s: 21600,
        consecutive_failures: 0,
      };
    });

    const db = createFakeDb(seed);
    const redis = createFakeRedis();
    // 'free' cost_class would normally cap at 96/day; an explicit override
    // of 1 must be what actually gates this provider.
    const dateKey = new Date().toISOString().slice(0, 10);
    redis.strings.set(`probe:budget:alpha:${dateKey}`, '1');

    const { run } = loadJobModule(db, mockProviderLimits({ alpha: { probe: { max_per_day: 1 } } }));

    await run(redis as never);

    const alphaLog = db.probeLogs.find((l) => l.provider === 'alpha');
    expect(alphaLog).toMatchObject({ kind: 'suppressed', result: 'SKIPPED_BUDGET' });
    expect(alphaLog?.detail).toBe('budget 2/1 spent');
  });
});

describe('run() — "401, zero retries" holds even under an asap flag (AP-2 knowledge entry requirement)', () => {
  it('an asap-flagged provider already paused by FAIL_DETERMINISTIC is NOT re-probed', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock;

    const now = new Date('2026-09-03T00:00:00Z');
    const pausedUntil = new Date(now.getTime() + 24 * 3600 * 1000); // still 24h out
    const seed: Record<string, Record<string, unknown>> = {};
    SEVEN_PROVIDERS.forEach((name, i) => {
      seed[name] = {
        provider: name,
        state: name === 'alpha' ? 'DEGRADED' : 'HEALTHY',
        state_since: now,
        last_probe_result: name === 'alpha' ? 'FAIL_DETERMINISTIC' : 'OK',
        // AP-3 review fix: the guard reads deterministic_paused_until, NOT
        // last_probe_result/next_probe_at (see below) — those two are kept
        // here anyway because they're the realistic post-transition state
        // and other assertions below still check them.
        deterministic_paused_until: name === 'alpha' ? pausedUntil : null,
        next_probe_at: name === 'alpha' ? pausedUntil : new Date(now.getTime() + i * 1000),
        probe_interval_s: name === 'alpha' ? 24 * 3600 : 21600,
        consecutive_failures: name === 'alpha' ? 1 : 0,
      };
    });

    const db = createFakeDb(seed);
    // alpha's own health check firing a fresh ProviderError re-flags it asap,
    // exactly the scenario the guard exists for.
    const redis = createFakeRedis(['alpha']);
    const { run } = loadJobModule(db, mockProviderLimits());

    await run(redis as never);

    // No HTTP call at all for the paused provider — a real network probe
    // here IS the "retry a deterministically-impossible call" the boundary
    // forbids, even though this is our health check and not the client's
    // original request.
    const alphaCalled = fetchMock.mock.calls.some(([url]) => String(url).includes('alpha'));
    expect(alphaCalled).toBe(false);

    // The pause itself is untouched — still DEGRADED, still paused 24h out.
    expect(db.statuses.get('alpha')).toMatchObject({
      state: 'DEGRADED',
      last_probe_result: 'FAIL_DETERMINISTIC',
      next_probe_at: pausedUntil,
      deterministic_paused_until: pausedUntil,
    });

    // The suppression is still a row (C0.5), tagged NOINFO — this measurement
    // did not run, which must be distinguishable from one that ran and passed.
    const alphaLog = db.probeLogs.find((l) => l.provider === 'alpha');
    expect(alphaLog).toMatchObject({ kind: 'suppressed', result: 'NOINFO' });

    // The asap flag is still consumed either way, so it doesn't loop forever.
    expect(redis.deleted).toContain('probe:asap:alpha');
  });
});

describe('AP-3 review fix (Fable, attempt 1) — the FAIL_DETERMINISTIC pause survives the passive step', () => {
  it('a passive FAIL_TRANSIENT write (real 401 traffic on a dead key) does NOT clear deterministic_paused_until, so a later asap tick still makes zero HTTP calls', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock;

    const now = new Date('2026-09-03T00:00:00Z');
    const pausedUntil = new Date(now.getTime() + 24 * 3600 * 1000); // set by an earlier active auth-probe 401
    const seed: Record<string, Record<string, unknown>> = {};
    SEVEN_PROVIDERS.forEach((name, i) => {
      seed[name] = {
        provider: name,
        state: name === 'alpha' ? 'DEGRADED' : 'HEALTHY',
        state_since: now,
        last_probe_result: name === 'alpha' ? 'FAIL_DETERMINISTIC' : 'OK',
        deterministic_paused_until: name === 'alpha' ? pausedUntil : null,
        next_probe_at: name === 'alpha' ? pausedUntil : new Date(now.getTime() + i * 1000),
        probe_interval_s: name === 'alpha' ? 24 * 3600 : 21600,
        consecutive_failures: name === 'alpha' ? 1 : 0,
      };
    });

    const db = createFakeDb(seed);

    // Step 1 — the passive step (tool-quality.job, runs every 10 min) sees
    // real client traffic against the dead key: every call 401s, well over
    // the 25% error-rate threshold. Its next_probe_at is deliberately set to
    // ALREADY DUE (past) so this exercises recordProbeResult's own
    // deterministic_paused_until guard directly, independent of the
    // separate F1-spacing gate in applyPassiveDegradation (covered by its
    // own tests in tool-quality-passive.test.ts).
    (db as unknown as { $queryRawUnsafe: jest.Mock }).$queryRawUnsafe = jest
      .fn()
      .mockResolvedValue([
        {
          provider: 'alpha',
          total: 40n,
          failed: 40n,
          next_probe_at: new Date(now.getTime() - 1000).toISOString(),
        },
      ]);
    await applyPassiveDegradation(db as never, createFakeRedis() as never, new Set());

    // The passive step DID write — last_probe_result/next_probe_at moved,
    // proving this isn't a no-op that would trivially pass the assertion
    // below for the wrong reason.
    const afterPassive = db.statuses.get('alpha');
    expect(afterPassive).toMatchObject({ last_probe_result: 'FAIL_TRANSIENT' });
    expect((afterPassive?.next_probe_at as Date).getTime()).not.toBe(pausedUntil.getTime());

    // But the pause anchor itself is untouched by that passive write.
    expect((afterPassive?.deterministic_paused_until as Date).getTime()).toBe(
      pausedUntil.getTime(),
    );

    // Step 2 — 10 minutes later, alpha's own client-facing 401s re-flag it
    // asap (AP-2). The pause must still hold: zero HTTP calls.
    const redis = createFakeRedis(['alpha']);
    const { run } = loadJobModule(db, mockProviderLimits());
    await run(redis as never);

    const alphaCalled = fetchMock.mock.calls.some(([url]) => String(url).includes('alpha'));
    expect(alphaCalled).toBe(false);
  });
});
