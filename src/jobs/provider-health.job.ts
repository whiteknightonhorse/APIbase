import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger';
import providerLimitsConfig from '../config/provider-limits.json';
import {
  FAIL_THRESHOLD_DEGRADED,
  FAIL_THRESHOLD_DOWN,
  RECOVERY_STREAK_TO_HEALTHY,
  INTERVAL_HEALTHY_S,
  INTERVAL_HEALTHY_JITTER_PCT,
  INTERVAL_SUSPICIOUS_S,
  INTERVAL_DEGRADED_S,
  INTERVAL_RECOVERING_S,
  INTERVAL_DOWN_START_S,
  INTERVAL_DOWN_CAP_S,
  INTERVAL_DETERMINISTIC_PAUSE_S,
  PROBE_K,
  PROBE_BUDGET_PAID_PER_DAY,
  PROBE_BUDGET_CHEAP_PER_DAY,
  PROBE_BUDGET_FREE_PER_DAY,
  PROBE_BUDGET_KEY_TTL_S,
  ASAP_SCAN_COUNT,
  ASAP_SCAN_MAX_RESULTS,
} from '../config/autopilot';

/**
 * Provider Health Check Job — v2 (AP-3, 2026-09-03).
 *
 * Was: round-robin, 1 provider per run. Fable measured the real number the
 * old docstring here got wrong by 12x: 386 providers / (1 every 2 min) =
 * 12.9h for a full rotation, not the "~66 min" the comment used to claim.
 * Also: HEAD-only probing tests reachability, not authorization — an expired
 * key looks green until a paying client finds it.
 *
 * Now: a priority queue by `provider_status.next_probe_at` (K=5 most overdue
 * per tick, see PROBE_K) plus any provider flagged `probe:asap:{provider}`
 * by BaseAdapter (AP-2) on a live ProviderError — worst case full-rotation
 * time drops from 12.9h to ~2.6h (386 / (5 × 30/hour)), and passive traffic
 * (see tool-quality.job.ts's passive step, G1) skips most of that entirely.
 * See ~/AUTOPILOT-DESIGN-2026-09-03.md section G2 for the full design this
 * implements: adaptive intervals + jitter, exponential DOWN backoff,
 * deterministic-failure classes that bypass the counters, and a probe budget
 * in the same line as the call it gates (SKIPPED_BUDGET is a row, not silence).
 *
 * durable state: provider_status + probe_log (Postgres, AP-1 migration 0009).
 * Redis provider:health:{p} and provider:limits:{p} writes are PRESERVED
 * (existing dashboard consumer) alongside the new durable writes, per G2's
 * "каркас и Redis-записи сохранить".
 */

const HEALTH_CHECK_TIMEOUT_MS = 5000;
const REDIS_HEALTH_TTL = 7200; // 2 hours
const REDIS_LIMITS_TTL = 7200;

interface ProbeConfig {
  // The design's provider-limits.json shape (E5) lists a `method` field, but
  // this job only ever needs two shapes — achievability-only HEAD (no
  // auth_env) or an authenticated GET (auth_env set) — and picks between
  // them by auth_env's presence alone (see probeOne). A configured `method`
  // is intentionally NOT read here: a half-wired "GET without auth" mode
  // would share HEAD's own achievability-only semantics anyway, so there is
  // nothing for a third value to do yet. If that changes, this is the spot.
  url?: string;
  auth_env?: string;
  /** how `auth_env`'s value is sent (AP-3 review fix, Fable — minor #2: the
   *  auth probe only knew `Authorization: Bearer`, which silently isn't
   *  usable for an `x-api-key`-style provider). Unset/omitted keeps the
   *  default `Authorization: Bearer <key>`; set to any other header name
   *  (e.g. `x-api-key`) to send the key verbatim under that header instead,
   *  no `Bearer` prefix. */
  auth_header?: string;
  expect_status?: number[];
  cost_class?: 'free' | 'cheap' | 'paid';
  /** overrides the cost_class default cap (budgetMaxForCostClass) — see
   *  checkAndConsumeBudget's caller in probeOne. */
  max_per_day?: number;
}

interface ProviderLimitEntry {
  display_name: string;
  health_url: string;
  limit_type: string;
  free_limit: number;
  reset_period: string;
  paid_balance?: boolean;
  balance_api?: boolean;
  docs_url?: string;
  limit_proof?: string;
  probe?: ProbeConfig;
}

const limitsConfig = providerLimitsConfig as Record<string, ProviderLimitEntry>;
const providerNames = Object.keys(limitsConfig).sort();

let prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

// ---------------------------------------------------------------------------
// Pure decision logic — exported for unit tests (F1 transitions, budget cap,
// "one 500 doesn't sink you"). No I/O in this section.
// ---------------------------------------------------------------------------

export type ProbeResult = 'OK' | 'FAIL_TRANSIENT' | 'FAIL_DETERMINISTIC';
export type ProbeKind = 'head' | 'get' | 'auth' | 'usage_api' | 'passive' | 'suppressed';

export type ProbeOutcome =
  | { kind: 'timeout' }
  | { kind: 'network_error' }
  | { kind: 'status'; status: number };

const STATE_RANK: Record<string, number> = { UNKNOWN: 0, HEALTHY: 0, DEGRADED: 1, DOWN: 2 };

/**
 * Achievability-only classification (no configured auth): HEAD 2xx/3xx/4xx —
 * INCLUDING 401/403/404/405 — all mean "reachable", honestly labelled
 * kind='head' rather than passed off as proof the provider actually works
 * (G2: "не выдаём достижимость за работоспособность"). Only a genuine
 * transport failure or 5xx counts against the provider.
 */
export function classifyHeadResult(outcome: ProbeOutcome): 'OK' | 'FAIL_TRANSIENT' {
  if (outcome.kind === 'timeout' || outcome.kind === 'network_error') return 'FAIL_TRANSIENT';
  if (outcome.status >= 500) return 'FAIL_TRANSIENT';
  return 'OK';
}

/**
 * Auth-probe classification (GET with a real configured key): 401/403 is a
 * deterministic fact about OUR credential, not upstream flakiness — bypasses
 * the fail-streak counters entirely (F1). Anything else unexpected is folded
 * into FAIL_TRANSIENT rather than escalated to deterministic: telling a
 * genuine endpoint/schema drift apart from upstream noise needs adapter-level
 * knowledge this generic probe doesn't have — deliberately out of AP-3's
 * scope (see design G2, "auth-probe вводится инкрементально").
 */
export function classifyAuthResult(outcome: ProbeOutcome, expectStatus: number[]): ProbeResult {
  if (outcome.kind === 'timeout' || outcome.kind === 'network_error') return 'FAIL_TRANSIENT';
  if (outcome.status === 401 || outcome.status === 403) return 'FAIL_DETERMINISTIC';
  if (outcome.status >= 500) return 'FAIL_TRANSIENT';
  if (expectStatus.includes(outcome.status)) return 'OK';
  return 'FAIL_TRANSIENT';
}

export type DashboardStatus = 'green' | 'orange' | 'red';

/**
 * AP-3 review fix (Fable, minor #1): v1's dashboard had three colors — this
 * job's rewrite collapsed it to two (green/red from `result` alone), losing
 * "slow" (>2s) and 405 (HEAD unsupported, service alive) as their own
 * `orange` state. "Медленно" и "мертво" — разные миры: any non-OK `result`
 * (FAIL_TRANSIENT or FAIL_DETERMINISTIC — a probe that didn't succeed) is
 * `red`; a successful probe that was merely slow, or got the 405 HEAD isn't
 * wired for, is `orange`; everything else `green`. This is presentation
 * only — it never feeds the F1 state machine, only the dashboard's Redis
 * cache (`provider:health:{p}`).
 */
export function classifyDashboardStatus(
  result: ProbeResult,
  httpStatus: number | undefined,
  latencyMs: number,
): DashboardStatus {
  if (result !== 'OK') return 'red';
  if (httpStatus === 405) return 'orange';
  if (latencyMs > 2000) return 'orange';
  return 'green';
}

export interface TransitionInput {
  oldState: string;
  oldFailures: number;
  oldIntervalS: number;
  result: ProbeResult;
  /** consecutive OK probes already seen while DEGRADED/DOWN, before this one
   *  (0 if not in a recovery attempt). Ephemeral — tracked in Redis, not a
   *  durable column; losing it on a Redis restart just costs one extra OK
   *  before recovery, never a wrong health verdict. */
  recoveryStreak: number;
}

export interface TransitionOutput {
  newState: string;
  newFailures: number;
  newIntervalS: number;
  newRecoveryStreak: number;
}

function jitteredHealthyInterval(): number {
  const span = INTERVAL_HEALTHY_S * INTERVAL_HEALTHY_JITTER_PCT;
  return Math.round(INTERVAL_HEALTHY_S + (Math.random() * 2 - 1) * span);
}

/**
 * F1 state machine, pure. See ~/AUTOPILOT-DESIGN-2026-09-03.md section F1 for
 * the diagram this is a direct translation of.
 */
export function computeTransition(
  input: TransitionInput,
  jitterFn: () => number = jitteredHealthyInterval,
): TransitionOutput {
  const { oldState, oldFailures, oldIntervalS, result, recoveryStreak } = input;

  if (result === 'FAIL_DETERMINISTIC') {
    // Counters don't participate — one deterministic fact is enough to
    // advance the bad path by one step (not reset to DEGRADED every time).
    const newState = oldState === 'DEGRADED' || oldState === 'DOWN' ? 'DOWN' : 'DEGRADED';
    return {
      newState,
      newFailures: oldFailures + 1,
      newIntervalS: INTERVAL_DETERMINISTIC_PAUSE_S,
      newRecoveryStreak: 0,
    };
  }

  if (result === 'FAIL_TRANSIENT') {
    const newFailures = oldFailures + 1;
    const candidate =
      newFailures >= FAIL_THRESHOLD_DOWN
        ? 'DOWN'
        : newFailures >= FAIL_THRESHOLD_DEGRADED
          ? 'DEGRADED'
          : oldState;
    // Never move BACKWARDS via the failure-count formula — e.g. a provider
    // already DOWN from a deterministic fail must stay DOWN even if its
    // (unrelated) transient-failure count is still below the DOWN threshold.
    const newState = STATE_RANK[candidate] >= STATE_RANK[oldState] ? candidate : oldState;

    let newIntervalS: number;
    if (newState === 'DOWN') {
      // Exponential backoff only while ALREADY down between probes; a fresh
      // entry into DOWN always starts at the 1h floor.
      newIntervalS =
        oldState === 'DOWN'
          ? Math.min(oldIntervalS * 2, INTERVAL_DOWN_CAP_S)
          : INTERVAL_DOWN_START_S;
    } else if (newState === 'DEGRADED') {
      newIntervalS = INTERVAL_DEGRADED_S;
    } else {
      // Still HEALTHY/UNKNOWN but "suspicious" (1 fail, below threshold) —
      // one bad measurement never sinks the state, but it does earn a
      // closer look sooner than the quiet 6h cadence.
      newIntervalS = INTERVAL_SUSPICIOUS_S;
    }

    return { newState, newFailures, newIntervalS, newRecoveryStreak: 0 };
  }

  // result === 'OK'
  if (oldState === 'DEGRADED' || oldState === 'DOWN') {
    const newRecoveryStreak = recoveryStreak + 1;
    if (newRecoveryStreak >= RECOVERY_STREAK_TO_HEALTHY) {
      return {
        newState: 'HEALTHY',
        newFailures: 0,
        newIntervalS: jitterFn(),
        newRecoveryStreak: 0,
      };
    }
    // First OK out of a bad state: "recovering" — stay put, but check again
    // soon instead of waiting out the DEGRADED/DOWN cadence.
    return {
      newState: oldState,
      newFailures: 0,
      newIntervalS: INTERVAL_RECOVERING_S,
      newRecoveryStreak,
    };
  }

  // oldState HEALTHY or UNKNOWN — clean OK (first-ever OK promotes UNKNOWN).
  return {
    newState: 'HEALTHY',
    newFailures: 0,
    newIntervalS: jitterFn(),
    newRecoveryStreak: 0,
  };
}

/**
 * Which providers get probed this tick: every asap-flagged provider
 * (out-of-turn, per G2), plus up to `k` more from the priority queue
 * (already ordered most-overdue-first), skipping anything already covered
 * by the asap set. Pure — no I/O, easy to hit every combination in tests.
 */
export function selectProbeTargets(
  asapProviders: string[],
  queueProviders: string[],
  k: number,
): string[] {
  const seen = new Set<string>();
  const targets: string[] = [];
  for (const p of asapProviders) {
    if (seen.has(p)) continue;
    seen.add(p);
    targets.push(p);
  }
  let fromQueue = 0;
  for (const p of queueProviders) {
    if (fromQueue >= k) break;
    if (seen.has(p)) continue;
    seen.add(p);
    targets.push(p);
    fromQueue++;
  }
  return targets;
}

export function budgetMaxForCostClass(costClass: 'free' | 'cheap' | 'paid'): number {
  if (costClass === 'paid') return PROBE_BUDGET_PAID_PER_DAY;
  if (costClass === 'cheap') return PROBE_BUDGET_CHEAP_PER_DAY;
  return PROBE_BUDGET_FREE_PER_DAY;
}

// ---------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------

function isTimeoutError(err: unknown): boolean {
  return (
    err instanceof DOMException ||
    (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError'))
  );
}

async function fetchOutcome(
  url: string,
  method: 'HEAD' | 'GET',
  headers: Record<string, string>,
): Promise<{ outcome: ProbeOutcome; latencyMs: number; httpStatus?: number }> {
  const start = performance.now();
  try {
    const response = await fetch(url, {
      method,
      headers,
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
    });
    const latencyMs = Math.round(performance.now() - start);
    return {
      outcome: { kind: 'status', status: response.status },
      latencyMs,
      httpStatus: response.status,
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      outcome: isTimeoutError(err) ? { kind: 'timeout' } : { kind: 'network_error' },
      latencyMs,
    };
  }
}

/**
 * G2 budget: `probe:budget:{provider}:{date}` INCR, gated against the
 * cost-class cap. A skipped probe is not left un-recorded — the caller
 * writes SKIPPED_BUDGET to probe_log either way (C0.5).
 */
export async function checkAndConsumeBudget(
  redis: Redis,
  provider: string,
  costClass: 'free' | 'cheap' | 'paid',
  maxOverride?: number,
): Promise<{ allowed: boolean; used: number; max: number }> {
  const max = maxOverride ?? budgetMaxForCostClass(costClass);
  const dateKey = new Date().toISOString().slice(0, 10); // UTC calendar day
  const key = `probe:budget:${provider}:${dateKey}`;
  const used = await redis.incr(key);
  if (used === 1) {
    await redis.expire(key, PROBE_BUDGET_KEY_TTL_S);
  }
  return { allowed: used <= max, used, max };
}

/**
 * SCAN (never KEYS — this runs against the shared production Redis every
 * 2 min) for outstanding `probe:asap:{provider}` flags written by
 * BaseAdapter (AP-2). Bounded both by SCAN COUNT hint and a hard result cap
 * so a flood can't turn one tick into an unbounded loop.
 */
async function scanAsapFlags(redis: Redis): Promise<string[]> {
  const found: string[] = [];
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(
      cursor,
      'MATCH',
      'probe:asap:*',
      'COUNT',
      ASAP_SCAN_COUNT,
    );
    cursor = next;
    for (const k of keys) found.push(k.slice('probe:asap:'.length));
  } while (cursor !== '0' && found.length < ASAP_SCAN_MAX_RESULTS);
  return found;
}

interface RecordMeta {
  httpStatus?: number;
  latencyMs?: number;
  detail?: string;
  stateReason?: string;
}

/**
 * Read-transition-write for one probe result. Shared by the active probe
 * path here AND tool-quality.job.ts's passive step (G1) — both funnel
 * through the same F1 state machine so there is exactly one place that
 * decides what a result means, matching AP-2's "one place, all adapters"
 * pattern for signal capture.
 *
 * AP-3 review fix (Fable): `last_probe_result`/`next_probe_at` are written by
 * BOTH the active path (kind != 'passive') and the passive path (kind ===
 * 'passive') below — that is intentional and unchanged, they drive queue
 * scheduling for either signal. `deterministic_paused_until` is NOT one of
 * those shared fields: it is the durable "401, zero retries" pause anchor,
 * and only an active call may ever write it (set on a fresh
 * FAIL_DETERMINISTIC, cleared on any other active result). The passive path
 * leaves it alone unconditionally — see the `kind === 'passive'` branch
 * below — so real traffic volume can never shorten or erase a pause an
 * active auth probe just set, which is the exact defect this splits away
 * from `last_probe_result` rather than "fixing" with write ordering.
 */
export async function recordProbeResult(
  db: PrismaClient,
  redis: Redis,
  provider: string,
  kind: ProbeKind,
  result: ProbeResult,
  meta: RecordMeta = {},
): Promise<void> {
  const current = await db.providerStatus.upsert({
    where: { provider },
    update: {},
    create: {
      provider,
      state: 'UNKNOWN',
      state_since: new Date(),
      next_probe_at: new Date(),
      probe_interval_s: INTERVAL_SUSPICIOUS_S,
    },
  });

  const recoveryKey = `probe:recovery:${provider}`;
  const recoveryStreak =
    current.state === 'DEGRADED' || current.state === 'DOWN'
      ? Number((await redis.get(recoveryKey)) ?? '0')
      : 0;

  const t = computeTransition({
    oldState: current.state,
    oldFailures: current.consecutive_failures,
    oldIntervalS: current.probe_interval_s,
    result,
    recoveryStreak,
  });

  const now = new Date();

  // `undefined` here means "leave the column exactly as it is" (Prisma skips
  // undefined fields on update — see the fake-db test doubles doing the same
  // for `v !== undefined`). Passive calls never set OR clear the pause; only
  // an active call may do either, and it does one or the other every time it
  // runs (never both), so the anchor's value always traces back to the most
  // recent ACTIVE result alone, never to traffic volume.
  const deterministicPausedUntil: Date | null | undefined =
    kind === 'passive'
      ? undefined
      : result === 'FAIL_DETERMINISTIC'
        ? new Date(now.getTime() + t.newIntervalS * 1000)
        : null;

  await db.providerStatus.update({
    where: { provider },
    data: {
      state: t.newState,
      state_since: t.newState !== current.state ? now : undefined,
      state_reason: meta.stateReason,
      last_probe_at: now,
      last_probe_result: result,
      last_ok_at: result === 'OK' ? now : undefined,
      consecutive_failures: t.newFailures,
      last_latency_ms: meta.latencyMs,
      next_probe_at: new Date(now.getTime() + t.newIntervalS * 1000),
      probe_interval_s: t.newIntervalS,
      deterministic_paused_until: deterministicPausedUntil,
    },
  });

  if (t.newState === 'DEGRADED' || t.newState === 'DOWN') {
    if (t.newRecoveryStreak > 0) {
      await redis.setex(recoveryKey, 3600, String(t.newRecoveryStreak));
    } else {
      await redis.del(recoveryKey);
    }
  } else {
    await redis.del(recoveryKey);
  }

  await db.probeLog.create({
    data: {
      provider,
      kind,
      result,
      http_status: meta.httpStatus ?? null,
      latency_ms: meta.latencyMs ?? null,
      detail: meta.detail ?? null,
    },
  });

  // Preserve the pre-existing Redis cache for the current dashboard (G2:
  // "каркас и Redis-записи сохранить") until the dashboard reads
  // provider_status directly (AP-9). Three colors, not two — see
  // classifyDashboardStatus (AP-3 review fix, Fable, minor #1).
  await redis.hmset(`provider:health:${provider}`, {
    status: classifyDashboardStatus(result, meta.httpStatus, meta.latencyMs ?? 0),
    latency_ms: String(meta.latencyMs ?? 0),
    last_check: now.toISOString(),
  });
  await redis.expire(`provider:health:${provider}`, REDIS_HEALTH_TTL);
}

/** SKIPPED_BUDGET: probe_log gets the row, provider_status is left exactly
 *  as-is except next_probe_at, which is pushed out by the CURRENT stored
 *  interval — no state/failure-count change, since no measurement actually
 *  happened (C0.3: this must never look like a clean OK). */
async function recordSkippedBudget(
  db: PrismaClient,
  provider: string,
  budget: { used: number; max: number },
): Promise<void> {
  const current = await db.providerStatus.upsert({
    where: { provider },
    update: {},
    create: {
      provider,
      state: 'UNKNOWN',
      state_since: new Date(),
      next_probe_at: new Date(),
      probe_interval_s: INTERVAL_SUSPICIOUS_S,
    },
  });

  const now = new Date();
  await db.providerStatus.update({
    where: { provider },
    data: {
      last_probe_result: 'SKIPPED_BUDGET',
      next_probe_at: new Date(now.getTime() + current.probe_interval_s * 1000),
      updated_at: now,
    },
  });

  await db.probeLog.create({
    data: {
      provider,
      kind: 'suppressed',
      result: 'SKIPPED_BUDGET',
      detail: `budget ${budget.used}/${budget.max} spent`,
    },
  });

  logger.info(
    { job: 'provider-health', provider, ...budget },
    'Probe skipped — daily budget spent',
  );
}

/**
 * "401 — zero retries" (autopilot-wide boundary, see AP-2's knowledge entry
 * for the explicit requirement this satisfies): a provider paused by a prior
 * FAIL_DETERMINISTIC must stay paused even if `probe:asap:{provider}` fires
 * again in the meantime. The priority-queue path already can't reach a
 * paused provider (its next_probe_at is 24h out, so it never surfaces in
 * the top-K), but the asap path deliberately bypasses next_probe_at
 * ordering — this is the guard that keeps it from turning "there's an asap
 * flag" into "retry the deterministically-impossible call".
 *
 * AP-3 review fix (Fable): reads `deterministic_paused_until` ONLY — not
 * `last_probe_result`/`next_probe_at`, which tool-quality.job.ts's passive
 * step also writes every ~10 minutes for any provider with enough traffic.
 * Keying the pause on a field the passive path can overwrite meant a dead
 * key on a busy provider lost its 24h pause within one passive tick, and got
 * re-probed via the very asap flags this guard exists to stop (see
 * recordProbeResult's `deterministic_paused_until` handling: passive calls
 * never touch it, by construction).
 */
async function isDeterministicallyPaused(
  db: PrismaClient,
  provider: string,
  now: Date,
): Promise<boolean> {
  const row = await db.providerStatus.findUnique({ where: { provider } });
  if (!row) return false;
  return row.deterministic_paused_until != null && row.deterministic_paused_until > now;
}

/** The pause was respected — nothing was measured, so this is NOINFO, not a
 *  fresh probe result (C0.3: "ran and passed" must differ from "didn't run"
 *  in the data, and C0.5: even a suppressed asap request is a row). */
async function recordPauseRespected(db: PrismaClient, provider: string): Promise<void> {
  await db.probeLog.create({
    data: {
      provider,
      kind: 'suppressed',
      result: 'NOINFO',
      detail: 'asap/queue selection ignored — FAIL_DETERMINISTIC pause still active',
    },
  });
}

// ---------------------------------------------------------------------------
// Active probe execution
// ---------------------------------------------------------------------------

async function probeHead(
  db: PrismaClient,
  redis: Redis,
  provider: string,
  cfg: ProviderLimitEntry,
): Promise<void> {
  let healthUrl = cfg.health_url;
  if (healthUrl.includes('TOKEN_FROM_ENV') && provider === 'telegram') {
    const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
    healthUrl = healthUrl.replace('TOKEN_FROM_ENV', token);
  }

  const { outcome, latencyMs, httpStatus } = await fetchOutcome(healthUrl, 'HEAD', {
    'User-Agent': 'APIbase-HealthCheck/2.0',
  });
  const result = classifyHeadResult(outcome);
  await recordProbeResult(db, redis, provider, 'head', result, { httpStatus, latencyMs });
}

/**
 * AP-3 review fix (Fable, minor #2): default `Authorization: Bearer <key>`,
 * or — when `auth_header` names a different header (e.g. `x-api-key`) — that
 * header with the key sent verbatim, no `Bearer` prefix. Exported (pure) so
 * both providers' shapes are covered without a live probe.
 */
export function authHeaders(key: string, authHeader?: string): Record<string, string> {
  if (authHeader) return { [authHeader]: key };
  return { Authorization: `Bearer ${key}` };
}

async function probeAuth(
  db: PrismaClient,
  redis: Redis,
  provider: string,
  probeCfg: Required<Pick<ProbeConfig, 'url' | 'auth_env'>> & ProbeConfig,
): Promise<void> {
  const key = process.env[probeCfg.auth_env] ?? '';
  const expectStatus = probeCfg.expect_status ?? [200];
  const { outcome, latencyMs, httpStatus } = await fetchOutcome(probeCfg.url, 'GET', {
    'User-Agent': 'APIbase-HealthCheck/2.0',
    ...authHeaders(key, probeCfg.auth_header),
  });
  const result = classifyAuthResult(outcome, expectStatus);
  const detail = result === 'FAIL_DETERMINISTIC' ? `${httpStatus} with configured key` : undefined;
  await recordProbeResult(db, redis, provider, 'auth', result, {
    httpStatus,
    latencyMs,
    detail,
    stateReason: detail,
  });
}

async function probeOne(db: PrismaClient, redis: Redis, provider: string): Promise<void> {
  const cfg = limitsConfig[provider];
  if (!cfg) return;

  if (await isDeterministicallyPaused(db, provider, new Date())) {
    await recordPauseRespected(db, provider);
  } else {
    const probeCfg = cfg.probe;
    const costClass = probeCfg?.cost_class ?? 'free';
    const budget = await checkAndConsumeBudget(redis, provider, costClass, probeCfg?.max_per_day);
    if (!budget.allowed) {
      await recordSkippedBudget(db, provider, budget);
    } else if (probeCfg?.auth_env && probeCfg.url) {
      await probeAuth(
        db,
        redis,
        provider,
        probeCfg as Required<Pick<ProbeConfig, 'url' | 'auth_env'>> & ProbeConfig,
      );
    } else {
      await probeHead(db, redis, provider, cfg);
    }
  }

  // Ledger-count bookkeeping, not an upstream call — runs regardless of
  // whether the active HEAD/auth probe above was skipped by budget or paused.
  await updateUsageAndLimits(db, redis, provider, cfg);
}

// ---------------------------------------------------------------------------
// Usage/limits (pre-existing behaviour, preserved verbatim per G2's "Redis-
// записи сохранить" — this is a ledger-count bookkeeping pass, independent
// of the probe budget above, so it runs for every selected provider
// regardless of whether the active probe itself was skipped by budget).
// ---------------------------------------------------------------------------

async function updateUsageAndLimits(
  db: PrismaClient,
  redis: Redis,
  providerName: string,
  cfg: ProviderLimitEntry,
): Promise<void> {
  const freeLimit = cfg.free_limit;
  const isUnlimited = cfg.limit_type === 'unlimited';
  const isPaid = cfg.paid_balance === true && freeLimit === 0;

  let used = 0;
  if (!isUnlimited && !isPaid) {
    let timeFilter: string;
    switch (cfg.reset_period) {
      case 'none':
        timeFilter = '';
        break;
      case 'monthly':
        timeFilter = `AND el.created_at >= date_trunc('month', NOW())`;
        break;
      case 'hourly':
        timeFilter = `AND el.created_at >= NOW() - INTERVAL '1 hour'`;
        break;
      default:
        timeFilter = `AND el.created_at >= NOW() - INTERVAL '24 hours'`;
        break;
    }

    const usageRows: Array<{ count: bigint }> = await db.$queryRawUnsafe(
      `
      SELECT COUNT(*) AS count
      FROM execution_ledger el
      WHERE el.tool_id IN (SELECT tool_id FROM tools WHERE provider = $1)
        ${timeFilter}
        AND el.status IN ('success', 'shared_success', 'provider_success')
    `,
      providerName,
    );

    used = Number(usageRows[0]?.count || 0);
  }

  const remaining = isUnlimited ? 0 : Math.max(0, freeLimit - used);
  const pctRemaining = isUnlimited
    ? 100
    : freeLimit > 0
      ? Math.round((remaining / freeLimit) * 100)
      : 100;

  let limitStatus: string;
  if (isPaid) limitStatus = 'paid';
  else if (isUnlimited) limitStatus = 'green';
  else if (pctRemaining <= 0) limitStatus = 'red';
  else if (pctRemaining < 25) limitStatus = 'yellow';
  else if (pctRemaining < 50) limitStatus = 'orange';
  else limitStatus = 'green';

  if (cfg.balance_api && providerName === 'zerobounce') {
    try {
      const zbCredits = await fetchZeroBounceCredits();
      if (zbCredits !== null) {
        const zbPct = freeLimit > 0 ? Math.round((zbCredits / freeLimit) * 100) : 100;
        await redis.hmset(`provider:limits:${providerName}`, {
          type: cfg.limit_type,
          free_limit: String(freeLimit),
          used: String(freeLimit - zbCredits),
          remaining: String(zbCredits),
          pct_remaining: String(zbPct),
          limit_status:
            zbPct <= 0 ? 'red' : zbPct < 25 ? 'yellow' : zbPct < 50 ? 'orange' : 'green',
        });
        await redis.expire(`provider:limits:${providerName}`, REDIS_LIMITS_TTL);
        return;
      }
    } catch {
      // Fall through to ledger-based counting
    }
  }

  await redis.hmset(`provider:limits:${providerName}`, {
    type: cfg.limit_type,
    free_limit: String(freeLimit),
    used: String(used),
    remaining: String(remaining),
    pct_remaining: String(pctRemaining),
    limit_status: limitStatus,
  });
  await redis.expire(`provider:limits:${providerName}`, REDIS_LIMITS_TTL);
}

async function fetchZeroBounceCredits(): Promise<number | null> {
  const apiKey = process.env.PROVIDER_KEY_ZEROBOUNCE;
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `https://api.zerobounce.net/v2/getcredits?api_key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { Credits: string };
    const credits = parseInt(data.Credits, 10);
    return isNaN(credits) ? null : credits;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Bootstrap — seed provider_status once per process so the priority queue
// has something to order from the very first tick (an empty table would
// otherwise never select anyone for active probing until passive traffic
// happened to create a row first).
// ---------------------------------------------------------------------------

let seeded = false;

async function ensureSeeded(db: PrismaClient): Promise<void> {
  if (seeded) return;
  const now = new Date();
  // Only flip the flag AFTER a successful write — a transient DB error here
  // must retry on the next tick, not permanently disable seeding for the
  // rest of the process's life.
  await db.providerStatus.createMany({
    data: providerNames.map((provider) => ({
      provider,
      state: 'UNKNOWN',
      state_since: now,
      next_probe_at: now,
      probe_interval_s: INTERVAL_SUSPICIOUS_S,
    })),
    skipDuplicates: true,
  });
  seeded = true;
}

// ---------------------------------------------------------------------------
// Entry point (cron: every 2 min, unchanged from v1 — see worker/server.ts)
// ---------------------------------------------------------------------------

export async function run(redis: Redis): Promise<void> {
  if (providerNames.length === 0) return;
  const db = getPrisma();

  await ensureSeeded(db);

  const asapProviders = await scanAsapFlags(redis);
  const queueRows = await db.providerStatus.findMany({
    where: { provider: { in: providerNames } },
    orderBy: { next_probe_at: 'asc' },
    select: { provider: true },
    take: PROBE_K + asapProviders.length,
  });

  const targets = selectProbeTargets(
    asapProviders,
    queueRows.map((r) => r.provider),
    PROBE_K,
  );

  for (const provider of targets) {
    try {
      await probeOne(db, redis, provider);
    } catch (err) {
      logger.error({ err, provider, job: 'provider-health' }, 'Probe failed unexpectedly');
    } finally {
      if (asapProviders.includes(provider)) {
        await redis.del(`probe:asap:${provider}`).catch(() => {});
      }
    }
  }

  logger.info(
    { job: 'provider-health', probed: targets.length, asap: asapProviders.length },
    'Provider health tick complete',
  );
}
