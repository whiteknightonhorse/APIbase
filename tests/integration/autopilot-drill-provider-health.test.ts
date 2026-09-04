/**
 * AP-11 (820-autopilot-drills.md, taskloop T-820) — drills 1/3 and 2/3 of
 * the three required by the design doc (~/AUTOPILOT-DESIGN-2026-09-03.md,
 * section P, row AP-11): "синтетический DOWN-провайдер (fake health_url)"
 * and "синтетический 401".
 *
 * What makes this an ACCEPTANCE drill and not a repeat of
 * provider-health-run.test.ts / provider-health-state-machine.test.ts: the
 * "fake health_url" is a REAL `http.createServer` on a REAL loopback socket
 * — provider-health.job.ts's `fetchOutcome()` makes a REAL network call
 * against it, is REALLY classified by the REAL `classifyHeadResult`/
 * `classifyAuthResult`, and REALLY advances `computeTransition`. Every
 * existing unit test in this repo mocks `globalThis.fetch` itself; this file
 * never does — the request-counter on the fake server is the proof a network
 * call actually happened (or, for the 401 zero-retry claim, actually did
 * NOT happen a second time).
 *
 * Prisma/Redis stay the SAME safe in-memory fakes provider-health-run.test.ts
 * already established (this repo's own convention — see
 * autopilot-schema-0009.test.ts / dashboard-autopilot-status.test.ts:
 * "CI has no live Postgres"). The cross-language half of this drill —
 * incident-engine.py reacting to these exact provider_status shapes, through
 * to RESOLVED / WAITING_HUMAN, through to the real incidents API — lives in
 * scripts/autopilot/drill-incident-lifecycle.py (disposable Postgres, same
 * pattern as incident-engine.py's own --selftest-db), seeded with the exact
 * row shapes this file proves are what provider-health.job.ts really writes.
 * See docs/runbook.md "10. Autopilot" and AUTOPILOT-PROGRESS.md's T-820
 * entry for the full write-up, including the mutation-control (RED/GREEN)
 * transcript this file's assertions were checked against.
 */
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

// ---------------------------------------------------------------------------
// fakeDb / fakeRedis — same shape as provider-health-run.test.ts's own
// fixtures (self-contained by this repo's convention: every test file owns
// its doubles rather than importing another test file's).
// ---------------------------------------------------------------------------
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

function loadJobModule(
  db: ReturnType<typeof createFakeDb>,
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

// ---------------------------------------------------------------------------
// The synthetic "fake health_url" — a REAL server on a REAL loopback socket.
// ---------------------------------------------------------------------------
type ProviderMode = 'ok' | 'fail' | 'unauthorized';

async function startFakeProvider(): Promise<{
  healthUrl: string;
  authUrl: string;
  setMode: (m: ProviderMode) => void;
  requestCount: () => number;
  close: () => Promise<void>;
}> {
  let mode: ProviderMode = 'ok';
  let count = 0;
  const server = http.createServer((req, res) => {
    count++;
    if (mode === 'fail') {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('synthetic-drill: provider down');
      return;
    }
    if (mode === 'unauthorized') {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end('{"error":"synthetic-drill: invalid_api_key"}');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"status":"ok"}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    healthUrl: `http://127.0.0.1:${port}/health`,
    authUrl: `http://127.0.0.1:${port}/usage`,
    setMode: (m: ProviderMode) => {
      mode = m;
    },
    requestCount: () => count,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

describe('AP-11 drill A — synthetic DOWN provider, real socket, full F1 cycle to HEALTHY', () => {
  it('5 consecutive real 500 responses: UNKNOWN -> DEGRADED (2 fails) -> DOWN (5 fails); 2 real 200s recover it to HEALTHY', async () => {
    const fake = await startFakeProvider();
    try {
      fake.setMode('fail');
      const t0 = new Date();
      // Explicit seed row (not ensureSeeded()'s createMany path — that one
      // relies on Prisma's real @default(0) for consecutive_failures, which
      // this fakeDb's createMany doesn't simulate, same convention as
      // provider-health-run.test.ts's own SEVEN_PROVIDERS seeds).
      const db = createFakeDb({
        drilldown: {
          provider: 'drilldown',
          state: 'UNKNOWN',
          state_since: t0,
          next_probe_at: t0,
          probe_interval_s: 1800,
          consecutive_failures: 0,
        },
      });
      const redis = createFakeRedis(['drilldown']); // asap-flagged every tick, forces a real re-probe regardless of interval spacing
      const providerLimits = {
        drilldown: {
          display_name: 'AP-11 Drill: Synthetic DOWN Provider',
          health_url: fake.healthUrl,
          limit_type: 'unlimited',
          free_limit: 0,
          reset_period: 'none',
        },
      };
      const { run } = loadJobModule(db, providerLimits);

      // Tick 1 (1st real 500): still UNKNOWN/suspicious, below DEGRADED threshold.
      await run(redis as never);
      expect(fake.requestCount()).toBe(1);
      expect(db.statuses.get('drilldown')).toMatchObject({
        state: 'UNKNOWN',
        consecutive_failures: 1,
      });
      // asap flag must be re-armed for the next tick — the real cron sets it
      // via BaseAdapter on a live ProviderError; this drill re-arms it itself
      // to simulate "the client kept hitting the same dead provider".
      redis.strings.set('probe:asap:drilldown', '1');

      // Tick 2 (2nd real 500): FAIL_THRESHOLD_DEGRADED=2 crossed.
      await run(redis as never);
      expect(fake.requestCount()).toBe(2);
      expect(db.statuses.get('drilldown')).toMatchObject({
        state: 'DEGRADED',
        consecutive_failures: 2,
      });
      redis.strings.set('probe:asap:drilldown', '1');

      // Ticks 3-4: still DEGRADED, counting up toward DOWN.
      await run(redis as never);
      redis.strings.set('probe:asap:drilldown', '1');
      await run(redis as never);
      expect(db.statuses.get('drilldown')).toMatchObject({
        state: 'DEGRADED',
        consecutive_failures: 4,
      });
      redis.strings.set('probe:asap:drilldown', '1');

      // Tick 5 (5th real 500): FAIL_THRESHOLD_DOWN=5 crossed.
      await run(redis as never);
      expect(fake.requestCount()).toBe(5);
      expect(db.statuses.get('drilldown')).toMatchObject({
        state: 'DOWN',
        consecutive_failures: 5,
      });

      // Every one of the 5 real requests produced its own probe_log row,
      // classified 'head'/'FAIL_TRANSIENT' — the durable trail F2/N depend on.
      const downLogs = db.probeLogs.filter((l) => l.provider === 'drilldown');
      expect(downLogs).toHaveLength(5);
      expect(downLogs.every((l) => l.kind === 'head' && l.result === 'FAIL_TRANSIENT')).toBe(true);

      // --- "the fix landed" — flip the synthetic provider back healthy ---
      fake.setMode('ok');
      redis.strings.set('probe:asap:drilldown', '1');
      await run(redis as never); // 1st real 200: "recovering", stays DOWN
      expect(fake.requestCount()).toBe(6);
      expect(db.statuses.get('drilldown')).toMatchObject({
        state: 'DOWN',
        consecutive_failures: 0,
      });
      expect(redis.strings.get('probe:recovery:drilldown')).toBe('1');

      redis.strings.set('probe:asap:drilldown', '1');
      await run(redis as never); // 2nd real 200: RECOVERY_STREAK_TO_HEALTHY=2 reached -> HEALTHY
      expect(fake.requestCount()).toBe(7);
      expect(db.statuses.get('drilldown')).toMatchObject({
        state: 'HEALTHY',
        consecutive_failures: 0,
      });
      expect(redis.strings.has('probe:recovery:drilldown')).toBe(false);

      const okLogs = db.probeLogs.filter((l) => l.provider === 'drilldown' && l.result === 'OK');
      expect(okLogs).toHaveLength(2);
    } finally {
      await fake.close();
    }
  });
});

describe('AP-11 drill B — synthetic 401, real socket, zero retries (boundary: "детерминированный отказ не перезапускается")', () => {
  it('one real 401 -> FAIL_DETERMINISTIC -> DEGRADED + 24h pause; a second asap-flagged tick makes ZERO further real requests', async () => {
    const fake = await startFakeProvider();
    try {
      fake.setMode('unauthorized');
      process.env.DRILL_401_KEY = 'synthetic-drill-key-does-not-work';
      const db = createFakeDb();
      const redis = createFakeRedis(['drill401']);
      const providerLimits = {
        drill401: {
          display_name: 'AP-11 Drill: Synthetic 401 Provider',
          health_url: fake.healthUrl, // unused by the auth path, present for shape parity
          limit_type: 'unlimited',
          free_limit: 0,
          reset_period: 'none',
          probe: { auth_env: 'DRILL_401_KEY', url: fake.authUrl },
        },
      };
      const { run } = loadJobModule(db, providerLimits);

      await run(redis as never);
      expect(fake.requestCount()).toBe(1);
      const row1 = db.statuses.get('drill401');
      expect(row1).toMatchObject({ state: 'DEGRADED', last_probe_result: 'FAIL_DETERMINISTIC' });
      expect(row1?.deterministic_paused_until).toBeInstanceOf(Date);
      const pausedUntil = row1?.deterministic_paused_until as Date;
      expect(pausedUntil.getTime()).toBeGreaterThan(Date.now() + 23 * 3600 * 1000); // ~24h pause (G2)

      const authLog = db.probeLogs.find((l) => l.provider === 'drill401');
      expect(authLog).toMatchObject({
        kind: 'auth',
        result: 'FAIL_DETERMINISTIC',
        http_status: 401,
      });

      // "ноль повторов": the client keeps re-flagging asap (a live 401 on
      // real traffic would do exactly this) — the boundary is that the
      // ENGINE must not re-dial a call it already knows is deterministically
      // dead, proven here by the fake server's own counter staying at 1.
      redis.strings.set('probe:asap:drill401', '1');
      await run(redis as never);
      expect(fake.requestCount()).toBe(1); // <-- the whole point of this drill
      expect(db.statuses.get('drill401')).toMatchObject({
        state: 'DEGRADED',
        last_probe_result: 'FAIL_DETERMINISTIC',
        deterministic_paused_until: pausedUntil, // untouched, not extended, not cleared
      });

      // The suppression is itself a logged row (C0.5 — "подавленное действие
      // записывается"), not silence.
      const suppressedLog = db.probeLogs
        .filter((l) => l.provider === 'drill401')
        .find((l) => l.kind === 'suppressed');
      expect(suppressedLog).toMatchObject({ result: 'NOINFO' });
    } finally {
      await fake.close();
      delete process.env.DRILL_401_KEY;
    }
  });
});
