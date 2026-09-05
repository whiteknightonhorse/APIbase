/**
 * AP-3 (2026-09-03): the F1 state machine, probe classification, budget cap,
 * and the read-transition-write wrapper — all pure or fake-I/O, no Postgres
 * or real Redis. See ~/AUTOPILOT-DESIGN-2026-09-03.md sections F1/G2.
 *
 * provider-health.job.ts's `run()` (real DB queries, real fetch) gets its
 * own integration-style test in provider-health-run.test.ts; this file is
 * the state-machine contract those queries feed into.
 */
import {
  computeTransition,
  classifyHeadResult,
  classifyAuthResult,
  classifyDashboardStatus,
  authHeaders,
  selectProbeTargets,
  budgetMaxForCostClass,
  checkAndConsumeBudget,
  recordProbeResult,
  shouldRetryWithGet,
  type TransitionInput,
} from '../../src/jobs/provider-health.job';

const FIXED_JITTER_S = 21600; // stand-in for the real ±20% jitter — deterministic in tests

function transition(overrides: Partial<TransitionInput>) {
  return computeTransition(
    {
      oldState: 'HEALTHY',
      oldFailures: 0,
      oldIntervalS: 21600,
      result: 'OK',
      recoveryStreak: 0,
      ...overrides,
    },
    () => FIXED_JITTER_S,
  );
}

// ---------------------------------------------------------------------------
// F1 transitions
// ---------------------------------------------------------------------------

describe('computeTransition — F1 state machine', () => {
  it('a single FAIL_TRANSIENT does NOT sink a HEALTHY provider ("one 500 doesn\'t sink you")', () => {
    const t = transition({ oldState: 'HEALTHY', oldFailures: 0, result: 'FAIL_TRANSIENT' });
    expect(t.newState).toBe('HEALTHY');
    expect(t.newFailures).toBe(1);
    expect(t.newIntervalS).toBe(30 * 60); // "suspicious" cadence, not degraded
  });

  it('escalates HEALTHY -> DEGRADED at exactly 2 consecutive FAIL_TRANSIENT', () => {
    const t = transition({ oldState: 'HEALTHY', oldFailures: 1, result: 'FAIL_TRANSIENT' });
    expect(t.newState).toBe('DEGRADED');
    expect(t.newFailures).toBe(2);
    expect(t.newIntervalS).toBe(30 * 60);
  });

  it('does NOT escalate to DOWN before 5 total consecutive fails', () => {
    const t = transition({ oldState: 'DEGRADED', oldFailures: 3, result: 'FAIL_TRANSIENT' });
    expect(t.newState).toBe('DEGRADED');
    expect(t.newFailures).toBe(4);
  });

  it('escalates DEGRADED -> DOWN at 5 total consecutive fails (2 to enter DEGRADED + 3 more)', () => {
    const t = transition({ oldState: 'DEGRADED', oldFailures: 4, result: 'FAIL_TRANSIENT' });
    expect(t.newState).toBe('DOWN');
    expect(t.newFailures).toBe(5);
    expect(t.newIntervalS).toBe(3600); // fresh entry into DOWN starts the 1h backoff floor
  });

  it('DOWN backoff doubles on each further transient fail, capped at 24h', () => {
    let t = transition({
      oldState: 'DOWN',
      oldFailures: 5,
      oldIntervalS: 3600,
      result: 'FAIL_TRANSIENT',
    });
    expect(t.newIntervalS).toBe(7200);
    t = transition({
      oldState: 'DOWN',
      oldFailures: 6,
      oldIntervalS: 7200,
      result: 'FAIL_TRANSIENT',
    });
    expect(t.newIntervalS).toBe(14400);
    t = transition({
      oldState: 'DOWN',
      oldFailures: 7,
      oldIntervalS: 14400,
      result: 'FAIL_TRANSIENT',
    });
    expect(t.newIntervalS).toBe(28800);
    // ... keeps doubling past 24h but is clamped
    t = transition({
      oldState: 'DOWN',
      oldFailures: 20,
      oldIntervalS: 43200,
      result: 'FAIL_TRANSIENT',
    });
    expect(t.newIntervalS).toBe(86400);
    t = transition({
      oldState: 'DOWN',
      oldFailures: 21,
      oldIntervalS: 86400,
      result: 'FAIL_TRANSIENT',
    });
    expect(t.newIntervalS).toBe(86400); // capped, does not exceed 24h
  });

  it('FAIL_DETERMINISTIC bypasses the counters: HEALTHY -> DEGRADED on the very first one', () => {
    const t = transition({ oldState: 'HEALTHY', oldFailures: 0, result: 'FAIL_DETERMINISTIC' });
    expect(t.newState).toBe('DEGRADED');
    expect(t.newIntervalS).toBe(24 * 3600); // paused a full day, not counted toward retries
  });

  it('FAIL_DETERMINISTIC bypasses the counters: DEGRADED -> DOWN on the very first one', () => {
    const t = transition({ oldState: 'DEGRADED', oldFailures: 2, result: 'FAIL_DETERMINISTIC' });
    expect(t.newState).toBe('DOWN');
  });

  it('a FAIL_TRANSIENT never regresses a DOWN provider back to DEGRADED via the count formula', () => {
    // DOWN was entered via a deterministic fail (failures never reached 5), then one
    // transient fail comes in — the formula alone would say DEGRADED (failures=3 < 5),
    // but rank comparison must keep it DOWN.
    const t = transition({ oldState: 'DOWN', oldFailures: 2, result: 'FAIL_TRANSIENT' });
    expect(t.newState).toBe('DOWN');
  });

  it('UNKNOWN promotes to HEALTHY on the first OK', () => {
    const t = transition({ oldState: 'UNKNOWN', oldFailures: 0, result: 'OK', recoveryStreak: 0 });
    expect(t.newState).toBe('HEALTHY');
    expect(t.newIntervalS).toBe(FIXED_JITTER_S);
  });

  it('first OK out of DOWN enters "recovering": state unchanged, 5-min cadence, streak=1', () => {
    const t = transition({
      oldState: 'DOWN',
      oldFailures: 6,
      oldIntervalS: 7200,
      result: 'OK',
      recoveryStreak: 0,
    });
    expect(t.newState).toBe('DOWN');
    expect(t.newFailures).toBe(0);
    expect(t.newIntervalS).toBe(5 * 60);
    expect(t.newRecoveryStreak).toBe(1);
  });

  it('second consecutive OK out of DOWN promotes to HEALTHY', () => {
    const t = transition({ oldState: 'DOWN', oldFailures: 0, result: 'OK', recoveryStreak: 1 });
    expect(t.newState).toBe('HEALTHY');
    expect(t.newRecoveryStreak).toBe(0);
    expect(t.newIntervalS).toBe(FIXED_JITTER_S);
  });

  it('a FAIL between two OKs resets the recovery streak — no false recovery', () => {
    // streak was 1 (one OK seen), then a fail arrives before the confirming second OK.
    const failed = transition({
      oldState: 'DOWN',
      oldFailures: 0,
      result: 'FAIL_TRANSIENT',
      recoveryStreak: 1,
    });
    expect(failed.newRecoveryStreak).toBe(0);
    // the NEXT ok now starts recovery over from streak 1, not 2
    const okAgain = transition({
      oldState: failed.newState,
      oldFailures: failed.newFailures,
      result: 'OK',
      recoveryStreak: failed.newRecoveryStreak,
    });
    expect(okAgain.newState).toBe('DOWN'); // still recovering, not yet promoted
    expect(okAgain.newRecoveryStreak).toBe(1);
  });

  it('a clean OK while already HEALTHY resets the failure streak and re-jitters the interval', () => {
    const t = transition({ oldState: 'HEALTHY', oldFailures: 1, result: 'OK' });
    expect(t.newState).toBe('HEALTHY');
    expect(t.newFailures).toBe(0);
    expect(t.newIntervalS).toBe(FIXED_JITTER_S);
  });
});

// ---------------------------------------------------------------------------
// Probe classification
// ---------------------------------------------------------------------------

describe('classifyHeadResult — achievability only, never authorization', () => {
  it.each([200, 301, 401, 403, 404, 405])('status %d is OK (reachable)', (status) => {
    expect(classifyHeadResult({ kind: 'status', status })).toBe('OK');
  });

  it.each([500, 502, 503])('status %d is FAIL_TRANSIENT', (status) => {
    expect(classifyHeadResult({ kind: 'status', status })).toBe('FAIL_TRANSIENT');
  });

  it('timeout and network errors are FAIL_TRANSIENT', () => {
    expect(classifyHeadResult({ kind: 'timeout' })).toBe('FAIL_TRANSIENT');
    expect(classifyHeadResult({ kind: 'network_error' })).toBe('FAIL_TRANSIENT');
  });
});

describe('shouldRetryWithGet — T-07/A6: ambiguous HEAD failures deserve one GET retry', () => {
  it('timeout and network_error are retry-worthy (measured: autodev HEAD ~8.4s > 5s ceiling)', () => {
    expect(shouldRetryWithGet({ kind: 'timeout' })).toBe(true);
    expect(shouldRetryWithGet({ kind: 'network_error' })).toBe(true);
  });

  it.each([405, 501])(
    'status %d is retry-worthy (server refuses HEAD, not necessarily down — measured: sdwis/ine-portugal/epa all 405 on HEAD, 200 on GET)',
    (status) => {
      expect(shouldRetryWithGet({ kind: 'status', status })).toBe(true);
    },
  );

  it.each([200, 301, 401, 403, 404, 500, 502, 503])(
    'status %d is NOT retried — a real answer (including 5xx) is not the ambiguity this exists for',
    (status) => {
      expect(shouldRetryWithGet({ kind: 'status', status })).toBe(false);
    },
  );
});

describe('classifyAuthResult — real key, so 401/403 IS deterministic', () => {
  it.each([401, 403])('status %d is FAIL_DETERMINISTIC (AUTH_FAILED)', (status) => {
    expect(classifyAuthResult({ kind: 'status', status }, [200])).toBe('FAIL_DETERMINISTIC');
  });

  it('a status in expect_status is OK', () => {
    expect(classifyAuthResult({ kind: 'status', status: 200 }, [200, 204])).toBe('OK');
    expect(classifyAuthResult({ kind: 'status', status: 204 }, [200, 204])).toBe('OK');
  });

  it('5xx is FAIL_TRANSIENT even with a configured key', () => {
    expect(classifyAuthResult({ kind: 'status', status: 503 }, [200])).toBe('FAIL_TRANSIENT');
  });

  it('timeout/network error is FAIL_TRANSIENT', () => {
    expect(classifyAuthResult({ kind: 'timeout' }, [200])).toBe('FAIL_TRANSIENT');
    expect(classifyAuthResult({ kind: 'network_error' }, [200])).toBe('FAIL_TRANSIENT');
  });

  it('an unexpected status outside expect_status/401/403/5xx is treated as transient, not escalated', () => {
    // Telling real schema/endpoint drift apart from noise needs adapter-level
    // knowledge this generic probe doesn't have (documented scope cut).
    expect(classifyAuthResult({ kind: 'status', status: 418 }, [200])).toBe('FAIL_TRANSIENT');
  });
});

// ---------------------------------------------------------------------------
// Dashboard status — AP-3 review fix (Fable, minor #1): "slow" and "dead"
// are different worlds, restoring v1's three-color dashboard.
// ---------------------------------------------------------------------------

describe('classifyDashboardStatus — three colors, "slow" != "dead"', () => {
  it('a fast OK is green', () => {
    expect(classifyDashboardStatus('OK', 200, 150)).toBe('green');
  });

  it('a slow (>2s) OK is orange, not green', () => {
    expect(classifyDashboardStatus('OK', 200, 2500)).toBe('orange');
  });

  it('exactly 2000ms is still green (boundary), 2001ms is orange', () => {
    expect(classifyDashboardStatus('OK', 200, 2000)).toBe('green');
    expect(classifyDashboardStatus('OK', 200, 2001)).toBe('orange');
  });

  it('a 405 OK (HEAD unsupported, service alive) is orange even if fast', () => {
    expect(classifyDashboardStatus('OK', 405, 50)).toBe('orange');
  });

  it('any non-OK result is red, regardless of latency or status — "dead" is its own world', () => {
    expect(classifyDashboardStatus('FAIL_TRANSIENT', 503, 50)).toBe('red');
    expect(classifyDashboardStatus('FAIL_DETERMINISTIC', 401, 50)).toBe('red');
    expect(classifyDashboardStatus('FAIL_TRANSIENT', undefined, 0)).toBe('red'); // timeout/network error
  });
});

// ---------------------------------------------------------------------------
// Auth-probe headers — AP-3 review fix (Fable, minor #2): Bearer by default,
// but an x-api-key-style provider must not be silently unprobeable.
// ---------------------------------------------------------------------------

describe('authHeaders — Bearer by default, arbitrary header when configured', () => {
  it('defaults to Authorization: Bearer <key> when no auth_header is set', () => {
    expect(authHeaders('secret123')).toEqual({ Authorization: 'Bearer secret123' });
  });

  it('sends the key verbatim under a configured header, no Bearer prefix', () => {
    expect(authHeaders('secret123', 'x-api-key')).toEqual({ 'x-api-key': 'secret123' });
  });
});

// ---------------------------------------------------------------------------
// Priority queue + asap selection
// ---------------------------------------------------------------------------

describe('selectProbeTargets — asap out-of-turn + K from the priority queue', () => {
  it('probes every asap-flagged provider plus K more from the queue', () => {
    const targets = selectProbeTargets(['zeta'], ['a', 'b', 'c', 'd', 'e', 'f'], 5);
    expect(targets).toEqual(['zeta', 'a', 'b', 'c', 'd', 'e']);
  });

  it('does not double-probe a provider that is both asap-flagged and top of the queue', () => {
    const targets = selectProbeTargets(['a'], ['a', 'b', 'c', 'd', 'e', 'f'], 5);
    expect(targets).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(targets.filter((p) => p === 'a')).toHaveLength(1);
  });

  it('with no asap flags, selects exactly K from the queue', () => {
    const targets = selectProbeTargets([], ['a', 'b', 'c', 'd', 'e', 'f', 'g'], 5);
    expect(targets).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

// ---------------------------------------------------------------------------
// Budget cap
// ---------------------------------------------------------------------------

describe('budgetMaxForCostClass', () => {
  it('paid=4, cheap=24, free=96 per day', () => {
    expect(budgetMaxForCostClass('paid')).toBe(4);
    expect(budgetMaxForCostClass('cheap')).toBe(24);
    expect(budgetMaxForCostClass('free')).toBe(96);
  });
});

// ---------------------------------------------------------------------------
// recordProbeResult — read-transition-write, against a fake Prisma + Redis
// ---------------------------------------------------------------------------

function createFakeRedis() {
  const strings = new Map<string, string>();
  const hashes = new Map<string, Record<string, string>>();
  const expirations = new Map<string, number>();
  return {
    strings,
    hashes,
    expirations,
    async get(key: string) {
      return strings.get(key) ?? null;
    },
    async setex(key: string, _seconds: number, value: string) {
      strings.set(key, value);
      return 'OK';
    },
    async del(key: string) {
      strings.delete(key);
      hashes.delete(key);
      return 1;
    },
    async hmset(key: string, fields: Record<string, string>) {
      hashes.set(key, { ...(hashes.get(key) ?? {}), ...fields });
      return 'OK';
    },
    async expire(key: string, seconds: number) {
      expirations.set(key, seconds);
      return 1;
    },
    async incr(key: string) {
      const next = (Number(strings.get(key)) || 0) + 1;
      strings.set(key, String(next));
      return next;
    },
  };
}

describe('checkAndConsumeBudget — SKIPPED_BUDGET cap (C0.5: a suppressed action is a row, not silence)', () => {
  it('allows probes up to the cost-class max, then blocks (paid: 4/day)', async () => {
    const redis = createFakeRedis();
    for (let i = 1; i <= 4; i++) {
      const r = await checkAndConsumeBudget(redis as never, 'paidco', 'paid');
      expect(r).toEqual({ allowed: true, used: i, max: 4 });
    }
    const fifth = await checkAndConsumeBudget(redis as never, 'paidco', 'paid');
    expect(fifth).toEqual({ allowed: false, used: 5, max: 4 });
  });

  it('free (96/day) and cheap (24/day) get separate, wider caps', async () => {
    const redis = createFakeRedis();
    for (let i = 0; i < 24; i++) {
      await checkAndConsumeBudget(redis as never, 'cheapco', 'cheap');
    }
    expect(await checkAndConsumeBudget(redis as never, 'cheapco', 'cheap')).toMatchObject({
      allowed: false,
    });

    // A different provider's free budget is untouched by cheapco's usage above.
    const free = await checkAndConsumeBudget(redis as never, 'freeco', 'free');
    expect(free).toEqual({ allowed: true, used: 1, max: 96 });
  });

  it('sets the TTL only on the first increment of the day (not on every call)', async () => {
    const redis = createFakeRedis();
    await checkAndConsumeBudget(redis as never, 'ttlco', 'free');
    await checkAndConsumeBudget(redis as never, 'ttlco', 'free');
    const key = [...redis.expirations.keys()].find((k) => k.startsWith('probe:budget:ttlco:'));
    expect(key).toBeDefined();
    expect(redis.expirations.get(key as string)).toBe(26 * 3600);
  });

  it('budgets are per-provider, keyed separately even for the same cost class', async () => {
    const redis = createFakeRedis();
    await checkAndConsumeBudget(redis as never, 'a', 'paid');
    await checkAndConsumeBudget(redis as never, 'a', 'paid');
    const b = await checkAndConsumeBudget(redis as never, 'b', 'paid');
    expect(b).toEqual({ allowed: true, used: 1, max: 4 });
  });

  it('a provider-limits.json probe.max_per_day override replaces the cost-class default', async () => {
    const redis = createFakeRedis();
    // cost_class 'paid' would normally cap at 4 — an explicit override of 1
    // must win instead.
    const first = await checkAndConsumeBudget(redis as never, 'overridden', 'paid', 1);
    expect(first).toEqual({ allowed: true, used: 1, max: 1 });
    const second = await checkAndConsumeBudget(redis as never, 'overridden', 'paid', 1);
    expect(second).toEqual({ allowed: false, used: 2, max: 1 });
  });
});

function createFakeDb() {
  const statuses = new Map<string, Record<string, unknown>>();
  const probeLogs: Array<Record<string, unknown>> = [];
  return {
    statuses,
    probeLogs,
    providerStatus: {
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
        return { ...statuses.get(where.provider) } as never;
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
        return { ...next } as never;
      },
    },
    probeLog: {
      async create({ data }: { data: Record<string, unknown> }) {
        probeLogs.push(data);
        return data as never;
      },
    },
  };
}

describe('recordProbeResult — provider_status + probe_log writes', () => {
  it('a brand-new provider gets an UNKNOWN->HEALTHY row and a matching probe_log row on first OK', async () => {
    const db = createFakeDb();
    const redis = createFakeRedis();

    await recordProbeResult(db as never, redis as never, 'freshco', 'head', 'OK', {
      httpStatus: 200,
      latencyMs: 42,
    });

    expect(db.statuses.get('freshco')).toMatchObject({ state: 'HEALTHY', consecutive_failures: 0 });
    expect(db.probeLogs).toHaveLength(1);
    expect(db.probeLogs[0]).toMatchObject({
      provider: 'freshco',
      kind: 'head',
      result: 'OK',
      http_status: 200,
    });
  });

  it('a run of failures then two OKs takes a provider all the way DOWN and back to HEALTHY', async () => {
    const db = createFakeDb();
    const redis = createFakeRedis();
    const provider = 'flaky';

    // seed as HEALTHY
    await recordProbeResult(db as never, redis as never, provider, 'head', 'OK', {});
    expect(db.statuses.get(provider)).toMatchObject({ state: 'HEALTHY' });

    // 5 consecutive transient fails -> DOWN
    for (let i = 0; i < 5; i++) {
      await recordProbeResult(db as never, redis as never, provider, 'head', 'FAIL_TRANSIENT', {});
    }
    expect(db.statuses.get(provider)).toMatchObject({ state: 'DOWN', consecutive_failures: 5 });

    // first OK: recovering, still DOWN
    await recordProbeResult(db as never, redis as never, provider, 'head', 'OK', {});
    expect(db.statuses.get(provider)).toMatchObject({ state: 'DOWN' });
    expect(redis.strings.get(`probe:recovery:${provider}`)).toBe('1');

    // second consecutive OK: promoted to HEALTHY, recovery key cleared
    await recordProbeResult(db as never, redis as never, provider, 'head', 'OK', {});
    expect(db.statuses.get(provider)).toMatchObject({ state: 'HEALTHY', consecutive_failures: 0 });
    expect(redis.strings.has(`probe:recovery:${provider}`)).toBe(false);

    // one probe_log row per call above: 1 + 5 + 1 + 1 = 8
    expect(db.probeLogs).toHaveLength(8);
  });

  it('FAIL_DETERMINISTIC writes state_reason and pauses for 24h', async () => {
    const db = createFakeDb();
    const redis = createFakeRedis();

    await recordProbeResult(db as never, redis as never, 'authco', 'auth', 'FAIL_DETERMINISTIC', {
      httpStatus: 401,
      detail: '401 with configured key',
      stateReason: '401 with configured key',
    });

    const row = db.statuses.get('authco') as Record<string, unknown>;
    expect(row.state).toBe('DEGRADED');
    expect(row.state_reason).toBe('401 with configured key');
    expect(row.probe_interval_s).toBe(24 * 3600);
    expect(db.probeLogs[0]).toMatchObject({
      kind: 'auth',
      result: 'FAIL_DETERMINISTIC',
      http_status: 401,
    });
  });
});
