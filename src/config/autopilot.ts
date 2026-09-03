/**
 * AP-3 (2026-09-03): thresholds for the provider health state machine (F1) and
 * the active-probe scheduler (G2). Every number that decides a state
 * transition or a probe cadence lives HERE, exactly once — see the design doc
 * (~/AUTOPILOT-DESIGN-2026-09-03.md, section F1): "Пороги... живут ОДНИМ
 * местом". src/jobs/provider-health.job.ts and src/jobs/tool-quality.job.ts
 * both import from here; neither hardcodes a threshold of its own.
 */

// ---------------------------------------------------------------------------
// F1 — provider health state machine (UNKNOWN|HEALTHY|DEGRADED|DOWN)
// ---------------------------------------------------------------------------

/** consecutive FAIL_TRANSIENT probes before HEALTHY/UNKNOWN escalates to DEGRADED.
 *  Design note: the F1 ASCII diagram labels the UNKNOWN->DEGRADED arrow "3 FAIL"
 *  while the diagram's OWN prose thresholds list right below it states only one
 *  number for entering DEGRADED ("HEALTHY→DEGRADED: 2 последовательных
 *  transient-fail") and never a separate UNKNOWN figure. Treated as a diagram
 *  rendering artifact (the "3" likely misaligned from the neighboring DEGRADED->
 *  DOWN arrow) rather than a second real threshold — the prose is the numbers'
 *  single source of truth per F1's own rule, so UNKNOWN and HEALTHY share this
 *  one constant. Flagging explicitly for review rather than resolving silently. */
export const FAIL_THRESHOLD_DEGRADED = 2;

/** consecutive FAIL_TRANSIENT probes (total, not reset at the DEGRADED boundary)
 *  before escalating to DOWN — i.e. 2 to enter DEGRADED + 3 more = 5 total,
 *  matching the design's "итого ≥5 замеров". */
export const FAIL_THRESHOLD_DOWN = 5;

/** consecutive OK probes required while DEGRADED/DOWN before returning to
 *  HEALTHY. The first OK only enters the "recovering" sub-state (5 min
 *  cadence, see INTERVAL_RECOVERING_S) — it does not by itself clear the bad
 *  state, so one clean re-probe can't be mistaken for a real recovery. */
export const RECOVERY_STREAK_TO_HEALTHY = 2;

// ---------------------------------------------------------------------------
// G2 — adaptive probe intervals (seconds)
// ---------------------------------------------------------------------------

/** HEALTHY and quiet (0 consecutive failures): re-probe in ~6h. */
export const INTERVAL_HEALTHY_S = 6 * 3600;
/** ±20% jitter applied to INTERVAL_HEALTHY_S so 386 providers don't all land
 *  on the same tick 6h later. */
export const INTERVAL_HEALTHY_JITTER_PCT = 0.2;

/** "suspicious": HEALTHY/UNKNOWN with 1 failure, below the DEGRADED
 *  threshold — not yet a state change, but worth a closer look sooner.
 *  Also the steady DEGRADED cadence (same 30 min per G2). */
export const INTERVAL_SUSPICIOUS_S = 30 * 60;
export const INTERVAL_DEGRADED_S = 30 * 60;

/** "recovering": the first OK seen while DEGRADED/DOWN — probe again soon to
 *  confirm the second OK before trusting the recovery. */
export const INTERVAL_RECOVERING_S = 5 * 60;

/** DOWN backoff: 1h → 2h → 4h → capped at 24h. Doubles only while the
 *  provider STAYS down between probes; a fresh DOWN entry always starts at
 *  the 1h floor regardless of whatever interval preceded it. */
export const INTERVAL_DOWN_START_S = 3600;
export const INTERVAL_DOWN_CAP_S = 24 * 3600;

/** FAIL_DETERMINISTIC (401/403 with a configured key, etc.): counters don't
 *  apply — pause probing for a full day; only a "key rotated" event or
 *  manual re-check should shortcut this (that event source is a later task,
 *  see design G2 "или события смены ключа"). */
export const INTERVAL_DETERMINISTIC_PAUSE_S = 24 * 3600;

// ---------------------------------------------------------------------------
// G2 — priority queue + probe budget
// ---------------------------------------------------------------------------

/** most-overdue providers pulled from the priority queue per 2-min tick,
 *  on top of whatever `probe:asap:*` flags are outstanding. */
export const PROBE_K = 5;

/** probe:budget:{provider}:{date} daily caps by upstream cost class. A probe
 *  that would exceed its cap is not sent — SKIPPED_BUDGET is written to
 *  probe_log instead (a suppressed action is a row, not silence). */
export const PROBE_BUDGET_PAID_PER_DAY = 4;
export const PROBE_BUDGET_CHEAP_PER_DAY = 24;
export const PROBE_BUDGET_FREE_PER_DAY = 96;

/** budget counter TTL — comfortably past a UTC-midnight rollover so a slow
 *  clock skew can never leave a stale counter alive into the next day. */
export const PROBE_BUDGET_KEY_TTL_S = 26 * 3600;

/** SCAN batch size when discovering `probe:asap:*` flags (never KEYS — see
 *  provider-health.job.ts). Bounded so a pathological flood of flags can't
 *  turn one 2-min tick into an unbounded scan. */
export const ASAP_SCAN_COUNT = 200;
export const ASAP_SCAN_MAX_RESULTS = 50;

// ---------------------------------------------------------------------------
// G1 — passive step (tool-quality.job.ts)
// ---------------------------------------------------------------------------

/** a provider with at least this many real successful calls in the trailing
 *  window below gets a free passive OK instead of spending an active probe. */
export const PASSIVE_MIN_SUCCESS_CALLS = 10;
export const PASSIVE_WINDOW_HOURS = 6;

/** F1's OTHER HEALTHY→DEGRADED trigger, alongside 2 consecutive active-probe
 *  fails: "error_rate ≥25% за 1ч при ≥20 реальных вызовах". Real traffic is
 *  primary (F1: "реальный трафик первичен") — a provider failing a quarter
 *  of its real calls counts as a FAIL_TRANSIENT fed through the same state
 *  machine as an active probe, even if no active probe happens to run that
 *  hour. A provider that ALSO qualifies for a passive OK this same tick
 *  (PASSIVE_MIN_SUCCESS_CALLS in the wider 6h window) is left alone here —
 *  see tool-quality.job.ts's applyPassiveStep/applyPassiveDegradation: the
 *  success signal wins within one tick rather than the two fighting over
 *  the same row, and a persistent problem still gets caught on a later tick. */
export const PASSIVE_ERROR_RATE_WINDOW_HOURS = 1;
export const PASSIVE_ERROR_RATE_MIN_CALLS = 20;
export const PASSIVE_ERROR_RATE_THRESHOLD = 0.25;
