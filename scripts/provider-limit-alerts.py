#!/usr/bin/env python3
"""provider-limit-alerts.py — warn when a provider's FREE upstream quota is ~exhausted,
and (AP-5) turn real ledger traffic into a burn-rate forecast written durably into
provider_status, so "the quota is fine" and "we can't tell" are never the same value.

For every provider with a finite free tier (limit_type daily/monthly/hourly/credits/trial),
count real upstream calls (execution_ledger.provider_called=true) in the provider's reset window
and, at >=THRESHOLD% USED, open/update a GitHub issue (unchanged AP-4-era behavior — this stays
the durable log of the alert). Unlimited / rate_limited(0) skip. Runs hourly via cron.

AP-5 additions (~/AUTOPILOT-DESIGN-2026-09-03.md section G3, §4/§5 of the task): same pass also
computes burn_per_hour (calls in the last 3h / 3) and an exhaustion ETA from it, classifies a
`risk` level (NOINFO|NORMAL|ATTENTION|WARNING|CRITICAL|EXHAUSTED — E1's own enum) and writes
pct_remaining/burn_per_hour/exhaustion_eta/risk into the SAME provider_status row AP-3's probe
job reads and updates. That write IS the "emergency-polling flag" the task plan names — E1's own
docstring is explicit that Redis stays a cache in FRONT of provider_status, not a second place of
record, so this task does not invent a parallel Redis key for it.

Fable ruling-1 (attempt 2 REJECT, fixed this attempt):
1. G3.4 emergency mode now HAS a reader: `provider-health.job.ts` (AP-3, already built — the
   dependency existed, so "out of this task's file list" was not a valid reason to leave the flag
   unread) checks `provider_status.risk` before running a `cost_class=paid` probe and, at
   CRITICAL/EXHAUSTED, suppresses it (a real `probe_log` row written BY THAT JOB, not by this
   script) and falls back to a free HEAD check instead — see `probeOne`/`recordEmergencySuppressed`
   there. This script no longer writes its OWN "paid probes suppressed" probe_log row on
   CRITICAL/EXHAUSTED — it never suppressed anything itself, that line was a false record of an
   action that hadn't happened (the exact "двоемирие" this whole project forbids, just inverted).
   It still opens/merges the QUOTA_LOW/QUOTA_EXHAUSTED incident, unchanged.
2. Risk classification now compares the EXACT (unrounded) pct_remaining, not the value already
   rounded for the `provider_status.pct_remaining` INTEGER column — see `compute_risk_for_usage`.
   Rounding first let e.g. 9.5% (lim=1000, remaining=95) round up to 10 and read as WARNING
   instead of CRITICAL (spec: pct<10). Rounding still happens, but only for what gets stored/shown.
3. A QUOTA_LOW/QUOTA_EXHAUSTED incident now has a path OUT of OPEN: when a provider's risk drops
   back below CRITICAL/EXHAUSTED (and is a genuine measurement, not NOINFO), any OPEN QUOTA_*
   incident for it is moved to VERIFYING — see `advance_quota_incidents_if_recovered`. AP-4's
   existing `advance_verifying()` (cron */10) then confirms it via the next real probe and either
   resolves it or bounces it to STUCK, the same F2 path every other incident kind already uses.
   Without this, only VERIFYING (via re-probe) ever reached RESOLVED, and QUOTA_* — never routed
   there by anything — stayed OPEN forever, so a resolved quota crunch and next month's fresh one
   would silently merge into the same stale incident (F2: RESOLVED is terminal, a new episode is a
   new incident).

NOINFO discipline (this task's central law, C0.3): a provider we could not measure this pass
(the ledger query itself failed) must never fall back to "0 used" — that would silently render as
100% remaining / risk=NORMAL, i.e. exactly the "no data == fine" bug the whole autopilot project
exists to prevent. See `usage is None` handling below — pre-AP-5 this script's local `psql()`
helper discarded the subprocess return code entirely, so a query failure WAS silently read as "0
rows" (every provider "at 0% used"). Fixed here by switching to autopilot_common.psql (returns
the exit code) and gating on it explicitly. NOINFO also never counts as "risk recovered" for the
QUOTA_* incident-closing path above (#3) — not knowing is not the same as knowing it's fine.

AP-9 addition (`818-autopilot-score-dashboard-api.md`, ~/AUTOPILOT-DESIGN-2026-09-03.md section
§20): reliability_score. §20's own prose assigns this step to "the limits script" ("шаг в
limits-скрипте"); AP-5's own knowledge entry explicitly deferred it here because the P-table's
AP-5 row never mentioned it, and its AP-9 row does ("src/routes/, nginx" — this file isn't listed
there either, but §20's literal instruction plus AP-5's own breadcrumb pointing straight at this
file is a stronger signal than a summary table's cell staying terse, same latitude AP-5 itself
used when it went on to touch `provider-health.job.ts` for G3.4's read side after Fable's ruling).
Computed over a 7-day window (§20's own window) via `compute_reliability_score()` (pure, see
`--selftest`) fed by one combined SQL query (`RELIABILITY_SQL`) joining `execution_ledger` (real
availability + p95 latency of successful real calls), `probe_log` (probe_uptime + the
auth-fail/rate-limit share of probe *errors*, sourced from `http_status` — captured on EVERY probe
kind regardless of its own `result` classification, so this reads real 401/403/429 codes even off
achievability-only HEAD probes) and `incidents` (day-granularity incident-free fraction, the one
component that is NEVER unmeasured — zero incidents in the window is real 0-day data, not a
missing measurement). Unmeasured components (no real traffic, no probes, no probe errors) are
EXCLUDED and the remaining weights renormalized (§20's own "незамеренное не голосует" law,
generalized past its one literal example of availability's weight moving onto probe_uptime when
there's no traffic) — see `compute_reliability_score`'s docstring. A provider with literally
nothing measurable in 7 days gets `reliability_score = NULL`, never a fabricated number.

"Daily-расчёт" (§20) on an hourly cron: rather than install a second schedule (this whole task
plan's C0.1 posture is "не изобретай новую кассу"), a same-UTC-day marker file
(`_reliability_marker_path()`) makes the actual computation a no-op on every run after the first one
each day — the surrounding cron cadence stays exactly what AP-5 already left it at (not installed
in this sandbox either, same boundary every AP-1..AP-8 knowledge entry already documents). No new
`probe_log` row is written per provider for this step (unlike `update_provider_status_risk`'s ~65
finite-limit providers) — this pass runs for every one of the ~386 configured providers, and O's
own "≤5k probe_log rows/day" budget would not survive a 386-row-per-run addition on top of it.
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "autopilot"))
import autopilot_common as ap  # noqa: E402

ROOT = "/home/apibase/apibase"
REPO = "whiteknightonhorse/APIbase"
THRESHOLD = float(os.environ.get("LIMIT_ALERT_PCT", "90"))
LABEL = "limit-alert"

WINDOW = {"hourly": "hourly", "daily": "daily", "monthly": "monthly", "credits": "none", "trial": "none"}

# G3.2, literal thresholds (this project's own convention: constants live ONE place, not
# scattered magic numbers — see autopilot/config.py's F1 thresholds for the sibling example).
RISK_CRITICAL_ETA_H = 6
RISK_CRITICAL_PCT = 10
RISK_WARNING_ETA_H = 24
RISK_WARNING_PCT = 25
RISK_ATTENTION_PCT = 50

QUOTA_INCIDENT_KIND = {"EXHAUSTED": "QUOTA_EXHAUSTED", "CRITICAL": "QUOTA_LOW"}

# §20 reliability score weights, ONE place (same convention as RISK_* above).
RS_W_AVAILABILITY = 0.40
RS_W_PROBE_UPTIME = 0.15
RS_W_LATENCY = 0.10
RS_W_AUTH_OK = 0.10
RS_W_RL_OK = 0.10
RS_W_INCIDENT_FREE = 0.15
RS_LATENCY_FLOOR_MS = 1000.0
RS_LATENCY_SPAN_MS = 4000.0
RS_WINDOW_DAYS = 7

def _reliability_marker_path():
    """Read fresh every call, NOT bound to a module-level constant at import
    time — selftest_db() overrides AUTOPILOT_RELIABILITY_SCORE_MARKER via
    os.environ AFTER this module has already been imported (same reason
    autopilot_common's own PG_CONTAINER etc. need `importlib.reload(ap)` to
    pick up test overrides). A module-level constant here would have quietly
    kept pointing at the real ~/taskloop/state marker for the whole selftest,
    the exact "touched real state from a test" class of bug this project's
    disposable-container convention exists to prevent."""
    return os.environ.get(
        "AUTOPILOT_RELIABILITY_SCORE_MARKER",
        f"{os.environ.get('AUTOPILOT_TASKLOOP_ROOT', '/home/apibase/taskloop')}/state/autopilot-reliability-score.date",
    )


def gh(*args):
    return subprocess.run(["gh", *args], capture_output=True, text=True, cwd=ROOT)


# ---------------------------------------------------------------------------
# AP-5: burn rate / ETA / risk — pure functions, no I/O, so `--selftest` can
# exercise every branch (including the NOINFO-vs-zero one) without a DB.
# ---------------------------------------------------------------------------
def compute_eta_hours(remaining_count, burn_per_hour):
    """None means "can't say", not "never" and not "now" — both real answers
    on their own. burn_per_hour<=0 (no calls in the last 3h) genuinely means
    "not burning right now", which is also None (no failure implied, just no
    eta to compute — a quota that isn't being spent doesn't have an exhaustion
    date), never coerced to 0 or infinity."""
    if remaining_count is None or burn_per_hour is None:
        return None
    if burn_per_hour <= 0:
        return None
    return remaining_count / burn_per_hour


def classify_risk(pct_remaining, remaining_count, eta_hours):
    """G3.2 literal: EXHAUSTED (remaining=0) | CRITICAL (eta<6h OR pct<10) |
    WARNING (eta<24h OR pct<25) | ATTENTION (pct<50) | NORMAL; missing
    measurement = NOINFO, checked FIRST and never conflated with NORMAL (this
    task's own headline law) or with EXHAUSTED (None is not 0)."""
    if pct_remaining is None or remaining_count is None:
        return "NOINFO"
    if remaining_count <= 0:
        return "EXHAUSTED"
    if (eta_hours is not None and eta_hours < RISK_CRITICAL_ETA_H) or pct_remaining < RISK_CRITICAL_PCT:
        return "CRITICAL"
    if (eta_hours is not None and eta_hours < RISK_WARNING_ETA_H) or pct_remaining < RISK_WARNING_PCT:
        return "WARNING"
    if pct_remaining < RISK_ATTENTION_PCT:
        return "ATTENTION"
    return "NORMAL"


def compute_risk_for_usage(lim, used, burn3h_count):
    """Pure — the actual caller-side computation main() does per provider,
    extracted so its own ordering bug (Fable ruling-1 #2) has a --selftest
    that exercises the real call site, not just classify_risk() in isolation.

    Bug that lived here: `pct_remaining` was rounded to an int for the
    provider_status INTEGER column FIRST, and that already-rounded value was
    what got compared against the CRITICAL/WARNING thresholds. lim=1000,
    used=905 -> remaining=95 -> exact 9.5% -> round() -> 10 -> reads as
    WARNING (pct<25) instead of CRITICAL (pct<10), even though 9.5 is
    genuinely below 10. Fixed by classifying on `pct_remaining_exact` and
    rounding ONLY the copy returned for storage/display.

    Returns (remaining_count, pct_remaining_exact, pct_remaining, burn_per_hour, eta_hours, risk).
    """
    remaining_count = max(0, lim - used)
    pct_remaining_exact = (remaining_count / lim * 100) if lim > 0 else 100.0
    pct_remaining = round(pct_remaining_exact)  # INTEGER column / display only — NOT for classify_risk
    burn_per_hour = burn3h_count / 3.0
    eta_hours = compute_eta_hours(remaining_count, burn_per_hour)
    risk = classify_risk(pct_remaining_exact, remaining_count, eta_hours)
    return remaining_count, pct_remaining_exact, pct_remaining, burn_per_hour, eta_hours, risk


# ---------------------------------------------------------------------------
# AP-9 (§20): reliability score — pure functions, no I/O.
# ---------------------------------------------------------------------------
def _clamp01(x):
    return max(0.0, min(1.0, x))


def latency_score(p95_ms):
    """clamp(1 - (p95-1000ms)/4000ms, 0..1). None (no successful, latency-
    tagged measurement in the window) stays None — never defaulted to 0
    (which would read as "terrible latency", a claim never actually made) or
    1 (which would read as "confirmed fast", also never measured)."""
    if p95_ms is None:
        return None
    return _clamp01(1 - (p95_ms - RS_LATENCY_FLOOR_MS) / RS_LATENCY_SPAN_MS)


def compute_reliability_score(availability, probe_uptime, latency, auth_ok, rl_ok, incident_free):
    """§20 formula: score = 40*availability + 15*probe_uptime + 10*latency +
    10*auth_ok + 10*rl_ok + 15*incident_free (auth_ok/rl_ok are already
    "good" fractions, i.e. 1-auth_fail / 1-rl_pressure — see caller).

    `availability`/`probe_uptime`/`latency`/`auth_ok`/`rl_ok` are each a 0..1
    value or None ("unmeasured this window" — never assumed 0 or 1, §20's own
    "незамеренное не голосует"). `incident_free` is REQUIRED, never None —
    the caller must always be able to answer "how many of the last 7 days had
    an open incident", and zero incidents is real 0-day data, not a missing
    measurement.

    §20's own literal redistribution rule: no real traffic (`availability`
    is None) moves the full 0.40 weight onto `probe_uptime` specifically —
    checked FIRST, before the generic rule below. Every other still-None
    component is then simply dropped and the remaining weights renormalized
    to sum to 1 (the general form of the same law: an unmeasured input
    doesn't get to vote, but its absence also doesn't silently shrink what a
    100 actually means for the providers that DO have full data).

    Returns an int 0..100, or None if literally nothing was measurable this
    window (no traffic AND no probes AND no probe errors) — NOINFO, not a
    fabricated default score. `incident_free` alone is never enough to
    produce a score: an incident-free week says nothing if there is also no
    positive evidence the provider works at all."""
    weights = {
        "availability": RS_W_AVAILABILITY,
        "probe_uptime": RS_W_PROBE_UPTIME,
        "latency": RS_W_LATENCY,
        "auth_ok": RS_W_AUTH_OK,
        "rl_ok": RS_W_RL_OK,
        "incident_free": RS_W_INCIDENT_FREE,
    }
    values = {
        "availability": availability,
        "probe_uptime": probe_uptime,
        "latency": latency,
        "auth_ok": auth_ok,
        "rl_ok": rl_ok,
        "incident_free": incident_free,
    }

    if values["availability"] is None:
        weights["probe_uptime"] += weights.pop("availability")
        values.pop("availability")

    known = {k: v for k, v in values.items() if v is not None}
    if not known:
        return None
    # "несёт реальную доступность" gate: at least one of availability/
    # probe_uptime (the two "does it actually work" signals — the ONLY ones
    # that can independently carry the redistributed 0.40+0.15) must be
    # known. Without it, latency/auth_ok/rl_ok/incident_free alone would let
    # a provider that has NEVER been called or probed still score up to 100
    # off pure absence-of-evidence (a fresh/unknown provider is, by
    # definition, incident_free too) — exactly the "молчание не есть
    # здоровье" law (C0.4) this whole autopilot exists to enforce, just
    # applied to a score instead of a heartbeat. In practice this is mostly
    # theoretical (latency/auth_ok/rl_ok are themselves derived from real
    # traffic/probes, so they're already None whenever this fires for real),
    # but the pure function must not rely on its caller to never pass that
    # combination.
    if "availability" not in known and "probe_uptime" not in known:
        return None
    total_w = sum(weights[k] for k in known)
    if total_w <= 0:
        return None
    score = sum(weights[k] * known[k] for k in known) / total_w * 100
    return round(_clamp01(score / 100) * 100)


# ---------------------------------------------------------------------------
# AP-5: durable writes (provider_status + probe_log + incidents). Gated on
# migration 0009 being deployed (schema_present, same gate incident-engine.py
# uses) — this script also runs the GH-issue path below on hosts that don't
# have the autopilot schema yet, so that legacy behavior must NOT be gated.
# ---------------------------------------------------------------------------
def update_provider_status_risk(provider, pct_remaining, burn_per_hour, eta_hours, risk):
    """Returns True iff a provider_status row existed and was updated. A
    missing row (AP-3 hasn't seeded/probed this provider yet) is logged and
    skipped, never fabricated here — provider_status's other columns (state,
    next_probe_at, probe_interval_s...) are AP-3's to own, not this script's
    to guess defaults for."""
    if eta_hours is not None:
        eta_ts = (datetime.now(timezone.utc) + timedelta(hours=eta_hours)).isoformat()
        eta_sql = f"{ap.sql_literal(eta_ts)}::timestamptz"
    else:
        eta_sql = "NULL"
    pct_sql = str(int(round(pct_remaining))) if pct_remaining is not None else "NULL"
    burn_sql = f"{burn_per_hour:.2f}" if burn_per_hour is not None else "NULL"
    out, rc = ap.psql(
        f"UPDATE provider_status SET pct_remaining = {pct_sql}, burn_per_hour = {burn_sql}, "
        f"exhaustion_eta = {eta_sql}, risk = {ap.sql_literal(risk)}, updated_at = now() "
        f"WHERE provider = {ap.sql_literal(provider)} RETURNING provider"
    )
    if rc != 0:
        ap.notice(f"provider-limit-alerts: risk write failed for {provider}: {out}")
        return False
    if not out:
        ap.notice(f"provider-limit-alerts: no provider_status row for {provider} yet "
                  f"(not probed/seeded by AP-3) — skipping risk write, not fabricating one")
        return False
    return True


def log_probe(provider, kind, result, detail):
    _, rc = ap.psql(
        f"INSERT INTO probe_log (provider, kind, result, detail) VALUES ("
        f"{ap.sql_literal(provider)}, {ap.sql_literal(kind)}, {ap.sql_literal(result)}, "
        f"{ap.sql_literal((detail or '')[:2000] or None)})"
    )
    if rc != 0:
        ap.notice(f"provider-limit-alerts: probe_log insert failed for {provider}/{kind}: {rc}")


def open_quota_incident(provider, risk, pct_remaining, remaining_count, burn_per_hour, eta_hours, lim, lt, used):
    kind = QUOTA_INCIDENT_KIND[risk]
    eta_str = f"{eta_hours:.1f}h" if eta_hours is not None else "неизвестно (burn=0 сейчас)"
    evidence = {
        "risk": risk, "pct_remaining": pct_remaining, "remaining_calls": remaining_count,
        "free_limit": lim, "limit_type": lt, "used_this_window": used,
        "burn_per_hour": round(burn_per_hour, 2) if burn_per_hour is not None else None,
        "exhaustion_eta_hours": round(eta_hours, 2) if eta_hours is not None else None,
    }
    what = (f"{'квота исчерпана' if risk == 'EXHAUSTED' else 'квота почти исчерпана'} "
            f"({pct_remaining}% remains, burn {burn_per_hour:.2f}/h, eta {eta_str})")
    try:
        ap.open_or_merge_incident(
            kind=kind, provider=provider, evidence=evidence, detected_by="limits",
            what=what, system_did="burn-rate risk classification (provider-limit-alerts.py, G3.2)",
        )
    except Exception as e:
        ap.notice(f"provider-limit-alerts: failed to open/merge {kind} incident for {provider}: {e}")


QUOTA_KINDS = ("QUOTA_LOW", "QUOTA_EXHAUSTED")


def advance_quota_incidents_if_recovered(provider, risk):
    """Fable ruling-1 #3 / N7 ("risk спадает → RESOLVED"): this script is the
    only place that knows a provider's burn-rate risk just fell back below
    CRITICAL/EXHAUSTED — AP-4's incident-engine only watches
    provider_status.state (F1, reachability), never .risk (G3.2), so nothing
    else will ever route a QUOTA_* incident out of OPEN. Moves any OPEN
    QUOTA_LOW/QUOTA_EXHAUSTED incident for this provider to VERIFYING — the
    SAME state AP-4's existing advance_verifying() (cron */10) already knows
    how to confirm (via the next real probe) into RESOLVED, or bounce to
    STUCK on a fresh failure. This function never resolves anything directly
    — it only proposes the recheck; the actual re-probe is what earns
    RESOLVED (C0.3: a classification pass is not itself a measurement).

    NOINFO is deliberately NOT a recovery signal here (see caller) — "we
    couldn't measure this pass" must never read as "the quota is fine now",
    the same law this whole task exists to enforce, just at the closing end
    of an incident instead of the opening end.
    """
    if risk in ("CRITICAL", "EXHAUSTED", "NOINFO"):
        return
    for kind in QUOTA_KINDS:
        dk = ap.dedup_key(kind, provider)
        row, rc = ap.psql(
            f"SELECT incident_id FROM incidents WHERE dedup_key = {ap.sql_literal(dk)} "
            f"AND state = 'OPEN'"
        )
        if rc != 0 or not row:
            continue
        try:
            ap.transition_state(row, "VERIFYING")
            ap.note_incident(row, "provider-limit-alerts", "risk-recovered",
                              f"risk dropped to {risk} (below CRITICAL/EXHAUSTED) — moved to "
                              f"VERIFYING for re-probe confirmation (F2/N7)")
        except Exception as e:
            ap.notice(f"provider-limit-alerts: failed to advance {kind} incident {row} "
                      f"for {provider} to VERIFYING: {e}")


# ---------------------------------------------------------------------------
# AP-9 (§20): reliability score — durable write. Driven off `provider_status`
# (not `tools`/`probe_log`/`incidents` directly) because that's the row this
# writes into, and AP-3's `ensureSeeded()` already guarantees every
# configured provider has one — same "row must already exist, never
# fabricated" posture as `update_provider_status_risk` above.
# ---------------------------------------------------------------------------
RELIABILITY_SQL = f"""
WITH ledger_stats AS (
  SELECT t.provider,
    COUNT(el.execution_id) FILTER (WHERE el.provider_called) AS calls_total,
    COUNT(el.execution_id) FILTER (
      WHERE el.provider_called AND el.status IN ('success','shared_success','provider_success')
    ) AS calls_success,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY el.latency_ms) FILTER (
      WHERE el.provider_called AND el.status IN ('success','shared_success','provider_success')
        AND el.latency_ms IS NOT NULL
    ) AS p95_latency_ms
  FROM tools t
  LEFT JOIN execution_ledger el
    ON el.tool_id = t.tool_id AND el.created_at >= now() - interval '{RS_WINDOW_DAYS} days'
  GROUP BY t.provider
),
probe_stats AS (
  SELECT provider,
    COUNT(*) FILTER (WHERE result = 'OK') AS probe_ok,
    COUNT(*) FILTER (WHERE result IN ('FAIL_TRANSIENT','FAIL_DETERMINISTIC')) AS probe_err,
    COUNT(*) FILTER (
      WHERE result IN ('FAIL_TRANSIENT','FAIL_DETERMINISTIC') AND http_status IN (401, 403)
    ) AS auth_fail_n,
    COUNT(*) FILTER (
      WHERE result IN ('FAIL_TRANSIENT','FAIL_DETERMINISTIC') AND http_status = 429
    ) AS rl_n
  FROM probe_log
  WHERE ts >= now() - interval '{RS_WINDOW_DAYS} days'
  GROUP BY provider
)
SELECT
  ps.provider,
  COALESCE(l.calls_total, 0), COALESCE(l.calls_success, 0), l.p95_latency_ms,
  COALESCE(pr.probe_ok, 0), COALESCE(pr.probe_err, 0),
  COALESCE(pr.auth_fail_n, 0), COALESCE(pr.rl_n, 0),
  (
    SELECT COUNT(*) FROM generate_series(
      date_trunc('day', now() - interval '{RS_WINDOW_DAYS - 1} days'), date_trunc('day', now()), interval '1 day'
    ) AS d
    WHERE EXISTS (
      SELECT 1 FROM incidents i WHERE i.provider = ps.provider AND i.state <> 'RESOLVED'
        AND i.created_at <= d + interval '1 day' AND (i.resolved_at IS NULL OR i.resolved_at >= d)
    )
  ) AS open_days
FROM provider_status ps
LEFT JOIN ledger_stats l ON l.provider = ps.provider
LEFT JOIN probe_stats pr ON pr.provider = ps.provider
"""


def compute_and_write_reliability_scores():
    """Runs RELIABILITY_SQL once, computes compute_reliability_score() per
    row, UPSERTs (well, UPDATEs — the row always exists per this section's
    own docstring) provider_status.reliability_score. Returns the number of
    providers successfully written (0 on a query failure, logged via
    ap.notice — never silently skipped)."""
    rows, rc = ap.psql(RELIABILITY_SQL)
    if rc != 0:
        ap.notice(f"provider-limit-alerts: reliability-score query failed (rc={rc}): {rows!r} — "
                  f"skipping this run, not fabricating scores")
        return 0
    n = 0
    for line in rows.splitlines():
        if not line:
            continue
        (provider, calls_total, calls_success, p95, probe_ok, probe_err,
         auth_fail_n, rl_n, open_days) = line.split(ap.SEP)
        calls_total_i, calls_success_i = int(calls_total), int(calls_success)
        probe_ok_i, probe_err_i = int(probe_ok), int(probe_err)

        availability = (calls_success_i / calls_total_i) if calls_total_i > 0 else None
        probe_uptime = (probe_ok_i / (probe_ok_i + probe_err_i)) if (probe_ok_i + probe_err_i) > 0 else None
        latency = latency_score(float(p95)) if p95 else None
        auth_ok = (1 - int(auth_fail_n) / probe_err_i) if probe_err_i > 0 else None
        rl_ok = (1 - int(rl_n) / probe_err_i) if probe_err_i > 0 else None
        incident_free = 1 - min(1.0, int(open_days) / RS_WINDOW_DAYS)

        score = compute_reliability_score(availability, probe_uptime, latency, auth_ok, rl_ok, incident_free)
        score_sql = str(score) if score is not None else "NULL"
        _out, urc = ap.psql(
            f"UPDATE provider_status SET reliability_score = {score_sql}, updated_at = now() "
            f"WHERE provider = {ap.sql_literal(provider)}"
        )
        if urc != 0:
            ap.notice(f"provider-limit-alerts: reliability_score write failed for {provider}")
            continue
        n += 1
    return n


def _reliability_score_already_ran_today():
    """§20 says "daily calc"; this script's own cron is hourly (unchanged —
    C0.1's "не изобретай новую кассу" argues against a second schedule for
    one more column). A same-UTC-day marker file makes every run after the
    first one each day a cheap no-op instead of recomputing 24x. Fails OPEN
    on any read problem (missing file, bad content, permission error) —
    "unsure whether it ran today" must mean "compute it", never "skip it
    forever", the same asymmetry every other suppression check in this
    module already applies to SKIPPED_BUDGET/etc."""
    try:
        with open(_reliability_marker_path()) as f:
            return f.read().strip() == datetime.now(timezone.utc).date().isoformat()
    except Exception:
        return False


def _mark_reliability_score_ran_today():
    try:
        marker_path = _reliability_marker_path()
        os.makedirs(os.path.dirname(marker_path), exist_ok=True)
        with open(marker_path, "w") as f:
            f.write(datetime.now(timezone.utc).date().isoformat())
    except Exception:
        pass  # non-fatal — worst case this recomputes again next run, never a correctness bug


def main():
    cfg = json.load(open(f"{ROOT}/src/config/provider-limits.json"))

    # One pass: per-provider call counts in each window (real upstream hits only).
    # `usage is None` (query failed) is a DISTINCT state from `usage == {}` (query
    # ran fine, found nothing) — the former is NOINFO for every provider, the
    # latter is real "0 calls" data for providers not present in the dict.
    rows, rc = ap.psql("""
      SELECT t.provider,
        count(*) FILTER (WHERE el.created_at >= now() - interval '1 hour') AS h,
        count(*) FILTER (WHERE el.created_at >= now() - interval '3 hours') AS h3,
        count(*) FILTER (WHERE el.created_at >= date_trunc('day',   now() at time zone 'UTC')) AS d,
        count(*) FILTER (WHERE el.created_at >= date_trunc('month', now() at time zone 'UTC')) AS m,
        count(*) AS total
      FROM execution_ledger el JOIN tools t ON t.tool_id = el.tool_id
      WHERE el.provider_called = true
      GROUP BY t.provider
    """)
    if rc != 0:
        ap.notice(f"provider-limit-alerts: usage query failed (rc={rc}): {rows!r} — "
                  f"treating as NOINFO for every provider this run, not silently 0")
        usage = None
    else:
        usage = {}
        for line in rows.splitlines():
            if not line:
                continue
            p, h, h3, d, m, tot = line.split(ap.SEP)
            usage[p] = {"hourly": int(h), "burn3h": int(h3), "daily": int(d),
                        "monthly": int(m), "none": int(tot)}

    schema_ok, missing = ap.schema_present()
    if not schema_ok:
        ap.notice(f"provider-limit-alerts: autopilot schema not deployed yet (missing {missing}) — "
                  f"skipping risk/probe_log/incident writes this run, GH-issue alerting unaffected")

    alerts = []
    finite_providers = 0
    for prov, c in cfg.items():
        lt = c.get("limit_type")
        lim = int(c.get("free_limit") or 0)
        if lt not in WINDOW or lim <= 0:
            continue
        finite_providers += 1

        if usage is None:
            if schema_ok:
                update_provider_status_risk(prov, None, None, None, "NOINFO")
                log_probe(prov, "usage_api", "NOINFO", "usage query failed this run — no measurement")
            continue

        row = usage.get(prov)
        used = row[WINDOW[lt]] if row else 0  # genuinely 0 real calls -- real data, not NOINFO
        pct_used = used / lim * 100
        if pct_used >= THRESHOLD:
            alerts.append((prov, c.get("display_name", prov), used, lim, lt, round(pct_used)))

        remaining_count, _pct_exact, pct_remaining, burn_per_hour, eta_hours, risk = (
            compute_risk_for_usage(lim, used, row["burn3h"] if row else 0)
        )

        if schema_ok:
            update_provider_status_risk(prov, pct_remaining, burn_per_hour, eta_hours, risk)
            log_probe(prov, "usage_api", "OK",
                      f"pct_remaining={pct_remaining} remaining={remaining_count}/{lim} "
                      f"burn/h={burn_per_hour:.2f} eta_h={eta_hours} risk={risk}")
            if risk in ("CRITICAL", "EXHAUSTED"):
                # NOTE: this script does not itself suppress anything — the real
                # suppression (and its own probe_log row) happens in
                # provider-health.job.ts (AP-3), which reads this `risk` write
                # before running a cost_class=paid probe (G3.4, Fable ruling-1 #1).
                # Writing a second "suppressed" row here would be a false record
                # of an action this pass never took.
                open_quota_incident(prov, risk, pct_remaining, remaining_count, burn_per_hour,
                                     eta_hours, lim, lt, used)
            else:
                advance_quota_incidents_if_recovered(prov, risk)

    # Upsert one GitHub issue per breaching provider (idempotent by title prefix) — unchanged
    # AP-4-era behavior, now correctly skipped (not silently "no alerts") when usage is None.
    def open_issues():
        r = gh("issue", "list", "--repo", REPO, "--state", "open", "--search", "Limit in:title",
               "--limit", "100", "--json", "number,title")
        try:
            return json.loads(r.stdout or "[]")
        except Exception:
            return []

    if usage is not None:
        existing = {i["title"]: i["number"] for i in open_issues()}
        for prov, disp, used, lim, lt, pct in alerts:
            title = f"Limit {pct}%: {disp} ({used}/{lim} {lt})"
            prefix = "Limit "  # match any prior pct for this provider
            body = (f"Provider **{disp}** (`{prov}`) free upstream quota is at **{pct}%** "
                    f"({used} / {lim} calls, {lt} window).\n\n"
                    f"At 100% the upstream starts rejecting / charging. Options: add a paid plan + funds, "
                    f"rotate to a backup provider, or throttle. Auto-detected by provider-limit-alerts (hourly). "
                    f"Resets on the {lt} boundary.")
            found = next((num for t, num in existing.items() if t.startswith(prefix) and f"{disp} (" in t), None)
            if found:
                print(f"skip (already open #{found}): {disp} {pct}%")
                continue
            r = gh("issue", "create", "--repo", REPO, "--title", title, "--body", body)
            print(f"created: {title} -> {r.stdout.strip().splitlines()[-1] if r.stdout else r.stderr[:80]}")

    print(f"limit-alerts: checked {finite_providers} finite-limit providers, "
          f"{len(alerts) if usage is not None else 0} at >={int(THRESHOLD)}% used "
          f"(usage query {'OK' if usage is not None else 'FAILED -- NOINFO this run'})")

    # AP-9 (§20): reliability score, ALL configured providers (not just
    # finite-limit ones — availability/probe_uptime apply to unlimited
    # providers too). Runs once/UTC-day regardless of this script's own
    # (hourly, still not installed in this sandbox) cron cadence.
    if schema_ok:
        if _reliability_score_already_ran_today():
            print("reliability-score: already computed today — skipping (§20 daily cadence)")
        else:
            n = compute_and_write_reliability_scores()
            _mark_reliability_score_ran_today()
            print(f"reliability-score: computed for {n} providers")
    else:
        print("reliability-score: autopilot schema not deployed yet — skipped")

    return 0


# ---------------------------------------------------------------------------
# Selftests (AP-5 acceptance criteria: "тест: eta-математика + контроль «нет
# данных ≠ NORMAL»"). Same split as incident-engine.py: --selftest is fast,
# pure logic, no DB; --selftest-db exercises the real provider_status/
# probe_log/incidents writes against a disposable Postgres.
# ---------------------------------------------------------------------------
def selftest():
    # --- eta math ---
    assert compute_eta_hours(120, 20.0) == 6.0, "120 remaining at 20/h burns out in exactly 6h"
    assert compute_eta_hours(0, 5.0) == 0.0, "already at 0 remaining -> eta is now (0h), not None"
    assert compute_eta_hours(100, 0.0) is None, "not burning right now -> no eta to compute, not 0/inf"
    assert compute_eta_hours(100, None) is None, "unmeasured burn -> unmeasured eta"
    assert compute_eta_hours(None, 10.0) is None, "unmeasured remaining -> unmeasured eta"

    # --- risk: the central "нет данных ≠ NORMAL" control ---
    assert classify_risk(None, None, None) == "NOINFO", "no measurement at all must be NOINFO, not NORMAL"
    assert classify_risk(None, None, None) != "NORMAL"
    assert classify_risk(100, 1000, None) == "NORMAL", "100% remaining, no burn -> genuinely fine"

    # --- risk: EXHAUSTED takes priority over everything else, incl. a stale/odd eta ---
    assert classify_risk(0, 0, 100.0) == "EXHAUSTED", "remaining=0 is EXHAUSTED regardless of eta math"
    assert classify_risk(0, 0, None) == "EXHAUSTED", "remaining=0 with no burn data is still EXHAUSTED, not NOINFO"

    # --- risk: CRITICAL via eta OR via pct (either arm of the OR) ---
    assert classify_risk(50, 500, 5.0) == "CRITICAL", "eta<6h alone must trigger CRITICAL even at pct=50"
    assert classify_risk(9, 9, None) == "CRITICAL", "pct<10 alone must trigger CRITICAL even with no eta"
    assert classify_risk(6, 6, 6.0) == "CRITICAL", "eta==6 is NOT <6 (boundary), but pct=6<10 still is"

    # --- risk: WARNING via eta OR via pct, and boundary exactness ---
    assert classify_risk(50, 500, 23.0) == "WARNING", "eta<24h alone must trigger WARNING"
    assert classify_risk(24, 24, None) == "WARNING", "pct<25 alone must trigger WARNING"
    assert classify_risk(25, 25, 24.0) == "ATTENTION", "pct==25 and eta==24 are both boundary-exclusive -> falls to ATTENTION"

    # --- risk: ATTENTION and the NORMAL boundary ---
    assert classify_risk(49, 49, None) == "ATTENTION"
    assert classify_risk(50, 50, None) == "NORMAL", "pct==50 is boundary-exclusive for ATTENTION -> NORMAL"

    # --- compute_risk_for_usage: rounding-order regression (Fable ruling-1 #2) ---
    # lim=1000, used=905 -> remaining=95 -> exact 9.5% -> rounds to 10 for the
    # display/storage column, but classification must use the EXACT value, so
    # this must still be CRITICAL (pct<10), not WARNING (what round()->10 gives).
    _remaining, exact, rounded, _burn, _eta, risk905 = compute_risk_for_usage(1000, 905, 0)
    assert exact == 9.5
    assert rounded == 10, "sanity check: this case DOES round to 10 for the storage column"
    assert risk905 == "CRITICAL", (
        f"9.5% remaining must classify on the EXACT value, not the rounded display value "
        f"(got risk={risk905} from rounded pct={rounded})"
    )
    # A boundary case that genuinely IS >=10% after rounding must stay non-CRITICAL —
    # proves the fix didn't just make everything CRITICAL.
    _remaining2, exact2, _rounded2, _burn2, _eta2, risk2 = compute_risk_for_usage(1000, 895, 0)
    assert exact2 == 10.5
    assert risk2 != "CRITICAL", "10.5% remaining is genuinely >=10 -> must not be CRITICAL"

    # --- AP-9 (§20): latency_score ---
    assert latency_score(1000) == 1.0, "p95 exactly at the 1000ms floor -> perfect 1.0"
    assert latency_score(5000) == 0.0, "p95 at floor+span (5000ms) -> exactly 0.0"
    assert latency_score(9000) == 0.0, "p95 well past the span -> clamped to 0.0, not negative"
    assert latency_score(500) == 1.0, "p95 BETTER than the floor -> clamped to 1.0, never >1"
    assert latency_score(None) is None, "no measured latency -> None, never defaulted to 0 or 1"

    # --- AP-9: compute_reliability_score — the central "незамеренное не голосует" control ---
    assert compute_reliability_score(None, None, None, None, None, 1.0) is None, (
        "incident_free alone (no traffic, no probes) must NOT produce a score — "
        "an incident-free week says nothing without positive evidence the provider works"
    )
    assert compute_reliability_score(None, None, None, None, None, 0.0) is None, (
        "same as above with incident_free=0 — still nothing measurable, still None"
    )

    # Full data, everything perfect -> 100.
    assert compute_reliability_score(1.0, 1.0, 1.0, 1.0, 1.0, 1.0) == 100

    # Full data, only availability degraded -> exactly 40*0.5 + (15+10+10+10+15) = 80.
    assert compute_reliability_score(0.5, 1.0, 1.0, 1.0, 1.0, 1.0) == 80

    # No real traffic (availability=None) -> its 0.40 weight moves onto
    # probe_uptime specifically (§20 literal), not spread across every term.
    # probe_uptime=0.5, everything else known and perfect:
    # weights become probe_uptime=0.55, latency/auth_ok/rl_ok=0.10 each, incident_free=0.15.
    # score = 0.55*0.5 + 0.10*1 + 0.10*1 + 0.10*1 + 0.15*1 = 0.275+0.30+0.15 = 0.725 -> 72 or 73.
    score_no_traffic = compute_reliability_score(None, 0.5, 1.0, 1.0, 1.0, 1.0)
    assert score_no_traffic == round(0.725 * 100), (
        f"no-traffic redistribution onto probe_uptime computed wrong: got {score_no_traffic}"
    )

    # Neither availability NOR probe_uptime known (the two "does it actually
    # work" signals) -> None even though latency/auth_ok/rl_ok/incident_free
    # are ALL known and would otherwise average out to a suspiciously clean
    # score. C0.4 applied to a score: a provider nobody has ever called or
    # probed does not get to look reliable off pure absence-of-evidence.
    assert compute_reliability_score(None, None, 1.0, 0.0, 1.0, 1.0) is None, (
        "no availability AND no probe_uptime -> None regardless of what else is known"
    )

    # probe_uptime known (gate satisfied) but latency unmeasured -> latency's
    # weight drops out and the rest renormalizes -- generic renormalization
    # exercised on a real-evidence-bearing case, not just the availability-
    # specific special case above. probe_uptime carries availability's
    # redistributed weight too (still no traffic): weights become
    # probe_uptime=0.55, auth_ok=0.10, rl_ok=0.10, incident_free=0.15,
    # summing to 0.90 (latency's 0.10 simply isn't there to redistribute).
    score_partial = compute_reliability_score(None, 0.8, None, 1.0, 1.0, 1.0)
    assert score_partial == round((0.55 * 0.8 + 0.10 * 1 + 0.10 * 1 + 0.15 * 1) / 0.90 * 100), (
        f"generic renormalization (latency dropped, gate satisfied by probe_uptime) computed wrong: "
        f"got {score_partial}"
    )

    print("provider-limit-alerts --selftest: OK")


def selftest_db():
    """The DB-backed half of AP-5's acceptance criteria: a real UPDATE against
    provider_status, a real probe_log INSERT respecting the CHECK constraints,
    and a real QUOTA_LOW incident opened through autopilot_common's ONE write
    path (I4) — against a disposable postgres:16.2-alpine container, same
    boundary as AP-1/AP-4's own DB selftests (never apibase-postgres-1)."""
    import time

    name = "autopilot-ap5-selftest-pg"
    subprocess.run(["docker", "rm", "-f", name], capture_output=True)
    print("selftest-db: starting disposable postgres:16.2-alpine ...")
    r = subprocess.run(
        ["docker", "run", "-d", "--name", name, "-e", "POSTGRES_PASSWORD=x",
         "-e", "POSTGRES_USER=apibase", "-e", "POSTGRES_DB=apibase", "postgres:16.2-alpine"],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        print(f"selftest-db: could not start container: {r.stderr}")
        return 1
    try:
        ready = False
        for _ in range(60):
            time.sleep(1)
            chk = subprocess.run(
                ["docker", "exec", name, "psql", "-U", "apibase", "-d", "apibase", "-tAc", "SELECT 1"],
                capture_output=True, text=True,
            )
            if chk.returncode == 0 and chk.stdout.strip() == "1":
                ready = True
                break
        if not ready:
            print("selftest-db: postgres never became ready")
            return 1

        migration_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "..",
            "prisma", "migrations", "0009_autopilot_schema", "migration.sql",
        )
        with open(migration_path) as f:
            migration_sql = f.read()
        apply = subprocess.run(
            ["docker", "exec", "-i", name, "psql", "-U", "apibase", "-d", "apibase"],
            input=migration_sql, capture_output=True, text=True,
        )
        if apply.returncode != 0:
            print(f"selftest-db: migration apply failed: {apply.stderr}")
            return 1

        # AP-9: reliability-score's own RELIABILITY_SQL joins tools/execution_ledger
        # (real availability/latency), same minimal stand-ins incident-engine.py's own
        # selftest_db already established for the same two tables.
        subprocess.run(
            ["docker", "exec", "-i", name, "psql", "-U", "apibase", "-d", "apibase"],
            input="CREATE TABLE tools (tool_id text primary key, provider text, "
                  "status text not null default 'healthy'); "
                  "CREATE TABLE execution_ledger (execution_id uuid default gen_random_uuid(), "
                  "tool_id text, provider_called boolean not null default false, "
                  "status text, latency_ms int, created_at timestamptz default now());",
            capture_output=True, text=True,
        )

        os.environ["AUTOPILOT_PG_CONTAINER"] = name
        os.environ["AUTOPILOT_NOTICES_LOG"] = "/tmp/autopilot-ap5-selftest-notices.log"
        os.environ["AUTOPILOT_OPERATOR_DIR"] = "/tmp/autopilot-ap5-selftest-operator"
        os.environ["AUTOPILOT_HUMAN_DONE_DIR"] = "/tmp/autopilot-ap5-selftest-human-done"
        os.environ["AUTOPILOT_TG_ENV_PATH"] = "/tmp/autopilot-ap5-selftest-tg-env-does-not-exist"
        # AP-9: never let the reliability-score daily marker touch the real
        # ~/taskloop/state file — same disposable-scratch-path discipline as
        # every override above (_reliability_marker_path() re-reads this env
        # var on every call, so setting it here — AFTER module import — takes
        # effect immediately, unlike a module-level constant would).
        os.environ["AUTOPILOT_RELIABILITY_SCORE_MARKER"] = "/tmp/autopilot-ap9-selftest-reliability-marker.date"
        try:
            os.remove(os.environ["AUTOPILOT_RELIABILITY_SCORE_MARKER"])
        except FileNotFoundError:
            pass
        import importlib
        importlib.reload(ap)
        assert ap.load_tg_env() == {}, "selftest-db: tg.env override failed — refusing to risk a real TG send"

        schema_ok, missing = ap.schema_present()
        assert schema_ok, f"selftest-db: migration didn't create expected tables, missing={missing}"

        # World 1: no provider_status row yet -> risk write must be a no-op + notice,
        # never a fabricated row (this script does not own provider_status's other columns).
        ok1 = update_provider_status_risk("ghostprov", 42, 1.0, 10.0, "WARNING")
        assert ok1 is False, "world 1: missing provider_status row must NOT be silently created"
        row1, _ = ap.psql("SELECT count(*) FROM provider_status WHERE provider = 'ghostprov'")
        assert row1 == "0", "world 1: no row should have been inserted"
        print("world 1 (no row -> skipped, not fabricated): OK")

        # World 2: a real row exists -> risk write updates it, and NOINFO is
        # written distinctly from a computed NORMAL (not defaulted away).
        ap.psql(
            "INSERT INTO provider_status (provider, state, state_since, next_probe_at, "
            "probe_interval_s) VALUES ('testprov', 'HEALTHY', now(), now(), 3600)"
        )
        ok2 = update_provider_status_risk("testprov", None, None, None, "NOINFO")
        assert ok2 is True
        row2, _ = ap.psql("SELECT risk, pct_remaining, burn_per_hour, exhaustion_eta FROM provider_status "
                           "WHERE provider = 'testprov'")
        risk2, pct2, burn2, eta2 = row2.split(ap.SEP)
        assert risk2 == "NOINFO"
        assert pct2 == "" and burn2 == "" and eta2 == "", (
            f"world 2: NOINFO write must leave the numeric columns NULL, not 0/false, got "
            f"pct={pct2!r} burn={burn2!r} eta={eta2!r}"
        )
        print("world 2 (NOINFO write, numeric columns stay NULL): OK")

        # World 3: a genuinely CRITICAL risk both updates provider_status AND
        # opens exactly one QUOTA_LOW incident (MIXED route -> stays OPEN,
        # per autopilot_common's own AP-6 gap note, not a fabricated
        # REMEDIATION_QUEUED).
        ok3 = update_provider_status_risk("testprov", 5, 50.0, 3.0, "CRITICAL")
        assert ok3 is True
        log_probe("testprov", "usage_api", "OK", "selftest-db world 3")
        open_quota_incident("testprov", "CRITICAL", 5, 5, 50.0, 3.0, 100, "daily", 95)
        inc_row, rc_inc = ap.psql(
            "SELECT incident_id, kind, state FROM incidents WHERE provider = 'testprov' "
            "AND kind = 'QUOTA_LOW'"
        )
        assert rc_inc == 0 and inc_row, "world 3: QUOTA_LOW incident not found"
        inc_id, inc_kind, inc_state = inc_row.split(ap.SEP)
        assert inc_kind == "QUOTA_LOW"
        assert inc_state == "OPEN", f"world 3: MIXED route (no AP-6 yet) must stay OPEN, got {inc_state}"
        print("world 3 (CRITICAL -> provider_status + QUOTA_LOW incident, OPEN): OK")

        # World 3b: a second CRITICAL pass for the SAME provider must MERGE,
        # not open a second incident (I3 dedup, reused via autopilot_common).
        open_quota_incident("testprov", "CRITICAL", 4, 4, 55.0, 2.5, 100, "daily", 96)
        count_row, _ = ap.psql(
            "SELECT count(*) FROM incidents WHERE provider = 'testprov' AND kind = 'QUOTA_LOW'"
        )
        assert count_row == "1", f"world 3b: recurring CRITICAL must merge into the same incident, got count={count_row}"
        print("world 3b (recurring CRITICAL merges, no duplicate): OK")

        # World 4 (Fable ruling-1 #3): risk recovering below CRITICAL/EXHAUSTED
        # must move the still-OPEN QUOTA_LOW incident to VERIFYING — the ONLY
        # path that can ever get it to RESOLVED (AP-4's advance_verifying()
        # confirms VERIFYING via the next re-probe; nothing confirms OPEN).
        advance_quota_incidents_if_recovered("testprov", "WARNING")
        state_row, _ = ap.psql(f"SELECT state FROM incidents WHERE incident_id = {ap.sql_literal(inc_id)}")
        assert state_row == "VERIFYING", f"world 4: expected VERIFYING after risk recovery, got {state_row!r}"
        print("world 4a (risk WARNING -> OPEN QUOTA_LOW moves to VERIFYING): OK")

        # World 4b: NOINFO must NOT be treated as a recovery signal — "can't
        # measure this pass" is not "confirmed fine now" (C0.3 at the closing
        # end of an incident, not just the opening end). Re-open a fresh
        # CRITICAL incident to test against, since world 4a already consumed
        # the OPEN one above.
        open_quota_incident("testprov", "EXHAUSTED", 0, 0, 10.0, 0.0, 100, "daily", 100)
        inc_row2, _ = ap.psql(
            "SELECT incident_id FROM incidents WHERE provider = 'testprov' "
            "AND kind = 'QUOTA_EXHAUSTED' AND state = 'OPEN'"
        )
        assert inc_row2, "world 4b: expected a fresh OPEN QUOTA_EXHAUSTED incident"
        advance_quota_incidents_if_recovered("testprov", "NOINFO")
        state_row2, _ = ap.psql(f"SELECT state FROM incidents WHERE incident_id = {ap.sql_literal(inc_row2)}")
        assert state_row2 == "OPEN", f"world 4b: NOINFO must NOT advance an OPEN incident, got {state_row2!r}"
        print("world 4b (risk NOINFO does not advance an OPEN QUOTA_* incident): OK")

        # probe_log rows must respect the CHECK constraints (real schema, not
        # a mock) — insert failures would have already raised a notice above;
        # confirm the rows actually landed.
        plog_count, _ = ap.psql(
            "SELECT count(*) FROM probe_log WHERE provider = 'testprov' AND kind IN ('usage_api','suppressed')"
        )
        assert int(plog_count) >= 1, "probe_log rows for testprov did not land"
        print("probe_log CHECK-constraint rows: OK")

        # World 5 (AP-9, §20): reliability score — a real end-to-end pass
        # against RELIABILITY_SQL, not just the pure function in isolation.
        # 5a: a provider with real traffic + probes + one resolved (non-open)
        # incident should score high but not need every component present.
        ap.psql(
            "INSERT INTO provider_status (provider, state, state_since, next_probe_at, "
            "probe_interval_s) VALUES ('rsprov', 'HEALTHY', now(), now(), 3600) "
            "ON CONFLICT (provider) DO NOTHING"
        )
        ap.psql("INSERT INTO tools (tool_id, provider) VALUES ('rsprov.tool1', 'rsprov')")
        for i in range(9):
            ap.psql(
                "INSERT INTO execution_ledger (tool_id, provider_called, status, latency_ms, created_at) "
                f"VALUES ('rsprov.tool1', true, 'success', 500, now() - interval '{i} hours')"
            )
        ap.psql(
            "INSERT INTO execution_ledger (tool_id, provider_called, status, created_at) "
            "VALUES ('rsprov.tool1', true, 'failed', now() - interval '1 hours')"
        )
        for _ in range(4):
            log_probe("rsprov", "head", "OK", "selftest-db world 5a")
        n_written = compute_and_write_reliability_scores()
        assert n_written >= 1, "world 5a: expected at least rsprov to be written"
        score_row, _ = ap.psql("SELECT reliability_score FROM provider_status WHERE provider = 'rsprov'")
        assert score_row != "", f"world 5a: reliability_score must be a real number, got NULL ({score_row!r})"
        rsprov_score = int(score_row)
        assert 0 <= rsprov_score <= 100
        # 9/10 real calls succeeded (availability=0.9), 4/4 probes OK
        # (probe_uptime=1.0), p95 latency of the 9 successful 500ms calls is
        # 500ms -> latency_score=1.0, no probe errors -> auth_ok/rl_ok
        # unmeasured (dropped), incident_free=1.0 (no incidents for rsprov).
        # known weights: availability .40 + probe_uptime .15 + latency .10 +
        # incident_free .15 = .80. score = (.40*.9+.15*1+.10*1+.15*1)/.80*100
        # = .76/.80*100 = 95.0 -> 95.
        assert rsprov_score == 95, f"world 5a: expected 95, got {rsprov_score}"
        print(f"world 5a (real traffic+probes -> reliability_score={rsprov_score}, not NULL): OK")

        # 5b: a provider with NOTHING measurable in the window (no traffic,
        # no probes, no incidents ever) must stay NULL, never a fabricated
        # default — the same NOINFO law as every other column in this table.
        ap.psql(
            "INSERT INTO provider_status (provider, state, state_since, next_probe_at, "
            "probe_interval_s) VALUES ('ghostrsprov', 'UNKNOWN', now(), now(), 3600) "
            "ON CONFLICT (provider) DO NOTHING"
        )
        compute_and_write_reliability_scores()
        ghost_row, _ = ap.psql("SELECT reliability_score FROM provider_status WHERE provider = 'ghostrsprov'")
        assert ghost_row == "", f"world 5b: expected NULL (empty), got {ghost_row!r}"
        print("world 5b (nothing measurable -> reliability_score stays NULL): OK")

        # 5c: the daily marker makes a second call within the same UTC day a
        # no-op — flip rsprov's real traffic to nothing and confirm the
        # ALREADY-WRITTEN score from 5a does NOT get overwritten to NULL,
        # because the marker (once set) short-circuits main()'s own gate.
        # compute_and_write_reliability_scores() itself is NOT marker-gated
        # (only main()'s call site is) -- this world exercises the marker
        # helpers directly, the actual gate main() uses.
        _mark_reliability_score_ran_today()
        assert _reliability_score_already_ran_today() is True, "world 5c: marker must read back true same-day"
        print("world 5c (same-UTC-day marker read-back): OK")

        print("selftest-db: ALL WORLDS OK")
        return 0
    finally:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True)


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        raise SystemExit(0)
    if "--selftest-db" in sys.argv:
        raise SystemExit(selftest_db())
    raise SystemExit(main())
