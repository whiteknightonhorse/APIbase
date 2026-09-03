#!/usr/bin/env python3
"""incident-engine.py — AP-4: the deterministic core of the autopilot control
plane. Cron */10 (see this task's queue file for the exact line — NOT
installed by this script itself, see "why no crontab edit" below). ZERO
model calls: every decision here is plain code against provider_status/
probe_log/incidents (AP-1/AP-3's tables), never a judgment call.

Design source: ~/AUTOPILOT-DESIGN-2026-09-03.md sections F1/F2 (state
machines), I1 (routing), I3 (dedup/lock), J1-J3 (human loop), N (failure
scenarios), C0 (cross-cutting laws this file must obey).

Each tick, in order:
  1. schema_present() gate — if migration 0009 isn't deployed yet, log and
     exit 0 WITHOUT writing the heartbeat's "ran and did work" claim... no,
     actually WITH the heartbeat (see write_heartbeat() docstring: the
     heartbeat proves the ENGINE PROCESS is alive and cron is wired
     correctly, which is a distinct fact from "the schema exists").
  2. detect_from_provider_status() — turn AP-3's F1 state into new/merged
     incidents.
  2b. sync_tool_status() (AP-8) — mirror AP-3's F1 state into Tool.status
      (healthy|degraded|unavailable), status_source='autopilot', best-effort
      journal into whichever incident is currently open (any state !=
      RESOLVED) for that provider — usually the one detect() just opened or
      merged into this same tick, but never required to exist — and
      (best-effort, detached) kick sync-counts-cron.sh when a tool crosses
      into/out of 'unavailable'. Independent of the routing steps below —
      depends only on provider_status (AP-3), not on incident routing.
  3. route_auto_incidents() (AP-6) — OPEN incidents whose kind routes to
     AUTO/MIXED get a real fleet task filed (I2, capped 3/day, severity-
     ordered so SEV1 never loses a slot to an older SEV3) and move to
     REMEDIATION_QUEUED; PROVIDER_DOWN additionally waits for I1's own
     ">24ч" age gate before it may spend a slot. AUTO_NO_MODEL
     (RATE_LIMITED) gets an engine self-action (I1: "движок сам") straight
     to VERIFYING, no fleet task, no model, no cap spent.
  4. bridge_key_incidents() (AP-6) — WAITING_HUMAN AUTH_FAILED/
     CREDENTIAL_EXPIRED incidents get bridged into the existing
     connected_db.py key-request letter (I1's HUMAN_KEY row), once per
     incident.
  5. advance_remediation_queued() (AP-6) — F3's other half: "автопилот
     только кладёт файл и читает исход (done/, stuck/)". route_auto_
     incidents() does the "кладёт файл" side; this reads back what the
     fleet actually did with it (never trusting the fleet's own report,
     only the taskloop machine's done/stuck placement) and moves
     REMEDIATION_QUEUED -> VERIFYING (fleet DONE) or -> STUCK (fleet
     stuck/exhausted attempts), per F2.
  6. advance_waiting_human() — 72h reminder edge; human-done/ watcher, which
     (F2) files a real follow-up fleet task (same generator/cap as #3) and
     moves the incident to REMEDIATION_QUEUED, never straight to VERIFYING.
  7. advance_verifying() — re-probe confirmation -> RESOLVED or STUCK.
  8. write_heartbeat().

Why this file does NOT touch crontab or fleet-check.sh/fleet-pulse.sh
itself: those live outside this git repo (~/taskloop/*, the crontab) on a
box shared by every tenant; this taskloop's own sandbox hook hard-blocks
`crontab -e/-r` from an agent session ("a human runs push.sh / deploy
through the gated path"). fleet-check.sh/fleet-pulse.sh ARE edited by this
task (see git log / diff noted in the AP-4 knowledge entry) but gated on
this script's presence in the DEPLOY tree (`/home/apibase/apibase`, not
this worktree) so adding the check doesn't page anyone about a component
still mid-rollout. The crontab line itself is documented, not installed —
see the knowledge entry for the exact line to add once this is promoted.
"""
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autopilot_common as ap  # noqa: E402


# psql's default text rendering of a timestamptz is locale/offset-shaped
# ("2026-09-03 06:40:00.123456+00") which Python's fromisoformat (3.10, this
# repo's interpreter) does NOT parse -- it wants a full "+00:00", not "+00".
# Every query that needs to compare a Postgres timestamp against "now" in
# Python casts it with UTC_TS_EXPR() to a fixed, always-parseable shape
# instead of trusting psql's default rendering.
def UTC_TS_EXPR(col: str) -> str:
    return f"to_char({col} AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US')"


def _parse_ts(s):
    """Parses the UTC_TS_EXPR() shape only. Returns a tz-AWARE (UTC) datetime,
    or None for NULL/unparseable -- callers must treat None as NOINFO, not
    'epoch zero' (C0.3)."""
    if not s:
        return None
    try:
        return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _tool_context(provider):
    """Best-effort tool_count/revenue_pct for J2's message. Failure is
    NOINFO (None), never 0 — an unmeasured provider is not "worth nothing"."""
    tool_count = None
    revenue_pct = None
    out, rc = ap.psql(f"SELECT count(*) FROM tools WHERE provider = {ap.sql_literal(provider)}")
    if rc == 0 and out.strip().isdigit():
        tool_count = int(out.strip())
    out2, rc2 = ap.psql(
        f"SELECT COALESCE(SUM(cost_usd) FILTER (WHERE t.provider = {ap.sql_literal(provider)}), 0), "
        f"COALESCE(SUM(cost_usd), 0) "
        f"FROM execution_ledger el JOIN tools t ON t.tool_id = el.tool_id "
        f"WHERE el.billing_status = 'PAID' AND el.created_at >= now() - interval '30 days'"
    )
    if rc2 == 0 and out2:
        try:
            prov_rev, total_rev = out2.split(ap.SEP)
            prov_rev, total_rev = float(prov_rev), float(total_rev)
            if total_rev > 0:
                revenue_pct = prov_rev / total_rev * 100
        except Exception:
            pass
    return tool_count, revenue_pct


def _classify_deterministic_fail(state_reason: str):
    """FAIL_DETERMINISTIC covers several real causes (401/403 auth, 404
    endpoint-gone, schema-mismatch); provider_status.state_reason is the only
    text we have to tell them apart (AP-3 writes a human-readable reason
    there). Anything that doesn't match a known pattern is UNKNOWN, never
    guessed into AUTH_FAILED just because that's the common case — a wrong
    kind sends the wrong routing (key contour vs generic human loop)."""
    r = (state_reason or "").lower()
    if re.search(r"\b40[13]\b|auth", r):
        return "AUTH_FAILED"
    if re.search(r"\b404\b|endpoint|schema.?mismatch|schema.?change", r):
        return "ENDPOINT_CHANGED"
    return "UNKNOWN"


def detect_from_provider_status():
    """F1 -> F2: providers currently DEGRADED/DOWN or paused on a
    deterministic fail become incidents (dedup-safe — recurrences merge,
    per I3)."""
    out, rc = ap.psql(
        "SELECT provider, state, state_reason, last_probe_result, last_probe_at "
        "FROM provider_status WHERE state IN ('DEGRADED','DOWN') OR last_probe_result = 'FAIL_DETERMINISTIC'"
    )
    if rc != 0:
        ap.notice(f"incident-engine: detect query failed: {out}")
        return 0
    if not out:
        return 0
    n = 0
    for line in out.splitlines():
        provider, state, reason, last_result, last_probe_at = (line.split(ap.SEP) + [None] * 5)[:5]
        if last_result == "FAIL_DETERMINISTIC":
            kind = _classify_deterministic_fail(reason)
        elif state == "DOWN":
            kind = "PROVIDER_DOWN"
        elif state == "DEGRADED":
            kind = "DEGRADED_QUALITY"
        else:
            continue

        plog_out, plog_rc = ap.psql(
            f"SELECT kind FROM probe_log WHERE provider = {ap.sql_literal(provider)} "
            f"ORDER BY ts DESC LIMIT 1"
        )
        detected_by = "passive" if (plog_rc == 0 and plog_out == "passive") else "probe"

        tool_count, revenue_pct = _tool_context(provider)
        evidence = {
            "provider_status": {"state": state, "state_reason": reason,
                                 "last_probe_result": last_result, "last_probe_at": last_probe_at},
        }
        what = {
            "AUTH_FAILED": f"проба вернула 401/403 при настроенном ключе ({reason or 'см. probe_log'})",
            "ENDPOINT_CHANGED": f"проба вернула 404/схема изменилась ({reason or 'см. probe_log'})",
            "PROVIDER_DOWN": f"{ap.FAIL_THRESHOLD_DOWN if hasattr(ap, 'FAIL_THRESHOLD_DOWN') else 5} "
                             f"подряд неудачных проб, провайдер недоступен",
            "DEGRADED_QUALITY": "деградация: транзиентные отказы или error_rate по реальному трафику",
            "UNKNOWN": f"детерминированный отказ, причина не распознана ({reason or 'нет деталей'})",
        }.get(kind, kind)
        system_did = "probe поставлена на паузу (FAIL_DETERMINISTIC, next_probe_at +24h)" \
            if last_result == "FAIL_DETERMINISTIC" else "adaptive probe интервал ужат (F1)"

        try:
            incident_id, created = ap.open_or_merge_incident(
                kind=kind, provider=provider, evidence=evidence, detected_by=detected_by,
                tool_count=tool_count, revenue_pct=revenue_pct, what=what, system_did=system_did,
                actor="incident-engine",
            )
            if created:
                n += 1
        except Exception as e:
            ap.notice(f"incident-engine: failed to open/merge incident for {provider}/{kind}: {e}")
    return n


def _self_action_rate_limited(incident_id, provider):
    """I1: 'RATE_LIMITED (устойчиво) | AUTO без модели | движок сам: снизить
    probe-частоту'. No fleet task, no model call, no daily-cap spend — lowers
    the provider's active-probe cadence directly (durable in
    provider_status.probe_interval_s/next_probe_at) and moves the incident
    straight to VERIFYING so the existing re-probe confirmation loop
    (advance_verifying, AP-4, unmodified) judges whether that was enough.
    Floor of 1800s matches G2's INTERVAL_DEGRADED_S (src/config/autopilot.ts)
    by value — this Python engine has no import path into that TS constant,
    same "one value, two files, kept in sync by review" situation as this
    module's own KINDS/enum mirrors."""
    ap.psql(
        f"UPDATE provider_status SET probe_interval_s = GREATEST(probe_interval_s * 2, 1800), "
        f"next_probe_at = now() + (GREATEST(probe_interval_s * 2, 1800) || ' seconds')::interval "
        f"WHERE provider = {ap.sql_literal(provider)}"
    )
    ap.note_incident(incident_id, "remediation-router", "throttled",
                      "снижена частота активных проб (probe_interval_s удвоен, floor 1800s) "
                      "— I1 AUTO_NO_MODEL, движок сам")
    ap.transition_state(incident_id, "VERIFYING")


def _provider_down_ready(incident_id, provider, created_at) -> bool:
    """I1: 'PROVIDER_DOWN (SEV2+, >24ч)' — a PROVIDER_DOWN incident only gets
    a fleet task once it has been open >=24h (AP-3's own backoff runs
    1h->2h->4h->cap 24h in that same window: a provider that flips to DOWN
    this tick is very plausibly still self-healing, not yet worth a model
    call or one of the ≤3/day slots). `created_at` is the incident's own
    open time — the moment detect_from_provider_status() first saw this
    provider DOWN, which for PROVIDER_DOWN is also the moment it stopped
    being merely DEGRADED (F1: incidents open exactly once per
    dedup_key while a fault is ongoing, recurrences merge into the SAME
    row's attempts, never resetting created_at). Unparseable created_at is
    NOINFO, not a free pass -- treated as not-ready-yet (fail closed on the
    model-spend side, same posture as consume_daily_task_slot())."""
    ts = _parse_ts(created_at)
    if ts is None:
        ap.notice(f"молчу: {incident_id} ({provider}/PROVIDER_DOWN) — created_at unparseable, "
                  f"cannot confirm the >24h age gate (I1), staying OPEN")
        return False
    age = datetime.now(timezone.utc) - ts
    if age < timedelta(seconds=ap.PROVIDER_DOWN_MIN_AGE_SECONDS):
        ap.notice(f"молчу: {incident_id} ({provider}/PROVIDER_DOWN) — only {age} old, "
                  f"I1 requires >24h before a fleet task (backoff may still self-heal), staying OPEN")
        return False
    return True


def route_auto_incidents():
    """AP-6 (I1/I2/I3): turn OPEN incidents whose kind routes to AUTO/MIXED
    into real REMEDIATION_QUEUED fleet tasks, respecting the ≤3/day cap
    (I2) and "one fleet task per incident" (I3 — `fleet_task_id IS NULL` is
    the guard here, so a later tick over the same still-unqueued incident
    never double-files it once a task exists). HUMAN_* kinds are not this
    function's job (handled at open time, see open_or_merge_incident); those
    never have fleet_task_id set by anything, so the WHERE clause below
    naturally never selects them once route is checked.

    Candidates are read `ORDER BY severity, created_at` (SEV1 < SEV2 < SEV3
    sorts correctly as plain text) — I2's cap is scarce (≤3/day) and I1's own
    table is severity-ordered prose ("SEV1 раньше SEV3 через 81x/85x/89x" for
    the filenames); without this ORDER BY a plain SELECT has no guaranteed
    ordering at all, so an older SEV3 could spend a cap slot a newer SEV1
    needed the same tick. PROVIDER_DOWN additionally gates on I1's own
    literal condition ("SEV2+, >24ч") via `_provider_down_ready()` below —
    everything else has no such age gate."""
    out, rc = ap.psql(
        f"SELECT incident_id, provider, kind, severity, evidence::text, attempts::text, "
        f"{UTC_TS_EXPR('created_at')} FROM incidents WHERE state = 'OPEN' AND fleet_task_id IS NULL "
        f"ORDER BY severity, created_at"
    )
    if rc != 0 or not out:
        return
    for line in out.splitlines():
        incident_id, provider, kind, severity, evidence_raw, attempts_raw, created_at = line.split(ap.SEP)
        route = ap.ROUTE_CLASS.get(kind)
        if route == "AUTO_NO_MODEL":
            _self_action_rate_limited(incident_id, provider)
            continue
        if kind not in ap.FLEET_TASK_KINDS:
            continue  # HUMAN_* (or a future route class this function doesn't own)
        if kind == "PROVIDER_DOWN" and not _provider_down_ready(incident_id, provider, created_at):
            continue
        if not ap.consume_daily_task_slot():
            ap.notice(f"молчу: {incident_id} ({provider}/{kind}) — daily fleet-task cap "
                      f"({ap.DAILY_TASK_CAP}) reached, staying OPEN")
            continue
        try:
            evidence = json.loads(evidence_raw)
            attempts = json.loads(attempts_raw)
        except Exception:
            evidence, attempts = {}, []
        incident = {"incident_id": incident_id, "provider": provider, "kind": kind,
                    "severity": severity, "evidence": evidence, "attempts": attempts}
        filename, content = ap.build_remediation_task_body(incident)
        path = os.path.join(ap.TASKLOOP_QUEUE_DIR, filename)
        try:
            os.makedirs(ap.TASKLOOP_QUEUE_DIR, exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
        except Exception as e:
            ap.notice(f"WARN: {incident_id} ({provider}/{kind}) — failed to write fleet task "
                      f"{path}: {e}")
            continue
        ap.transition_state(incident_id, "REMEDIATION_QUEUED",
                             extra_set=f", fleet_task_id = {ap.sql_literal(filename)}")
        ap.note_incident(incident_id, "remediation-router", "queued", f"fleet task {filename}")
        ap.notice(f"remediation-router: queued {filename} for {incident_id} ({provider}/{kind})")


def bridge_key_incidents():
    """AP-6: I1's HUMAN_KEY row promises the existing connected_db.py key
    letter — this actually calls it (see ap.bridge_key_incident for the
    idempotency/NOINFO details)."""
    out, rc = ap.psql(
        "SELECT incident_id, provider, kind, evidence::text, attempts::text FROM incidents "
        "WHERE state = 'WAITING_HUMAN' AND kind IN ('AUTH_FAILED', 'CREDENTIAL_EXPIRED')"
    )
    if rc != 0 or not out:
        return
    for line in out.splitlines():
        incident_id, provider, kind, evidence_raw, attempts_raw = line.split(ap.SEP)
        try:
            evidence = json.loads(evidence_raw)
            attempts = json.loads(attempts_raw)
        except Exception:
            evidence, attempts = {}, []
        ap.bridge_key_incident({"incident_id": incident_id, "provider": provider, "kind": kind,
                                 "evidence": evidence, "attempts": attempts})


def advance_remediation_queued():
    """AP-6/F3: 'Автопилот только кладёт файл и читает исход (done/, stuck/).'
    route_auto_incidents() writes the fleet task (кладёт файл); this reads
    the outcome back — without it REMEDIATION_QUEUED is a permanent dead end,
    even once the fleet finishes the task, because nothing else in this
    codebase ever looks at taskloop's done/ or stuck/ dirs for an incident's
    fleet_task_id.

    Deliberately does NOT trust the fleet's own verdict text — a fleet task
    landing in done/ only proves taskloop's own review gate accepted it
    (VERDICT: DONE, +fable ACCEPT where REVIEW: fable), never that the
    provider is actually healthy again (C0.3: no fabricated verdicts). So
    'fleet DONE' moves the incident to VERIFYING, the SAME state
    advance_verifying() already confirms or rejects via a REAL re-probe
    against provider_status — one verification path, reused, not a second
    one invented here. 'fleet stuck' (exhausted MAX_ATTEMPTS, disputed past
    the ruling ceiling, or a permissions/no-verdict deadlock) has no re-probe
    to attempt — F2's diagram routes it straight to STUCK, 'только человек'."""
    out, rc = ap.psql(
        "SELECT incident_id, provider, kind, fleet_task_id FROM incidents "
        "WHERE state = 'REMEDIATION_QUEUED' AND fleet_task_id IS NOT NULL"
    )
    if rc != 0 or not out:
        return
    for line in out.splitlines():
        incident_id, provider, kind, fleet_task_id = line.split(ap.SEP)
        done_path = os.path.join(ap.TASKLOOP_ROOT, "done", fleet_task_id)
        stuck_path = os.path.join(ap.TASKLOOP_ROOT, "stuck", fleet_task_id)
        if os.path.isfile(done_path):
            ap.transition_state(incident_id, "VERIFYING")
            ap.note_incident(incident_id, "incident-engine", "fleet-done",
                              f"fleet task {fleet_task_id} landed in done/ -> VERIFYING "
                              f"(re-probe will confirm, fleet's own report is not trusted alone)")
            ap.notice(f"incident-engine: {incident_id} ({provider}/{kind}) fleet task "
                      f"{fleet_task_id} done -> VERIFYING")
        elif os.path.isfile(stuck_path):
            ap.transition_state(incident_id, "STUCK")
            ap.note_incident(incident_id, "incident-engine", "fleet-stuck",
                              f"fleet task {fleet_task_id} landed in stuck/ — F2: "
                              f"REMEDIATION_QUEUED + fleet stuck -> STUCK")
            ap.tg_send(f"[apibase] \U0001F534 STUCK INC-{ap.short_id(incident_id)} {kind} "
                       f"({provider}) — fleet task {fleet_task_id} is stuck, needs a human now")
            ap.notice(f"incident-engine: {incident_id} ({provider}/{kind}) fleet task "
                      f"{fleet_task_id} stuck -> STUCK")
        # else: still in queue/ or active/ -- genuinely no outcome yet (NOINFO), leave queued.


def advance_waiting_human():
    out, rc = ap.psql(
        f"SELECT incident_id, provider, kind, {UTC_TS_EXPR('created_at')}, attempts::text, "
        f"{UTC_TS_EXPR('updated_at')}, operator_file FROM incidents WHERE state = 'WAITING_HUMAN'"
    )
    if rc != 0 or not out:
        return
    processed_dir = os.path.join(ap.HUMAN_DONE_DIR, "processed")
    for line in out.splitlines():
        incident_id, provider, kind, created_at, attempts_raw, updated_at, operator_file = line.split(ap.SEP)
        sid = ap.short_id(incident_id)
        route = ap.ROUTE_CLASS[kind]

        # 1. human-done watcher (J3/F2: "human-done файл -> REMEDIATION_QUEUED
        # (follow-up)"). Watches for a generic operator file either because
        # this kind's route normally gets one (HUMAN_ONLY/HUMAN_GENERIC), OR
        # because THIS SPECIFIC incident got one as a documented one-off
        # exception (bridge_key_incident's "key already in .env but still
        # failing" fallback sets incidents.operator_file even for a
        # HUMAN_KEY-routed incident — see that function). Checking the
        # incident's own operator_file column, not just its macro route
        # class, is what makes that fallback actually resolvable instead of
        # a WAITING_HUMAN incident nothing ever watches again.
        if (route in ap.OPERATOR_FILE_ROUTE_CLASSES or operator_file) and os.path.isdir(ap.HUMAN_DONE_DIR):
            match = None
            for fn in os.listdir(ap.HUMAN_DONE_DIR):
                if f"INC-{sid}" in fn and os.path.isfile(os.path.join(ap.HUMAN_DONE_DIR, fn)):
                    match = os.path.join(ap.HUMAN_DONE_DIR, fn)
                    break
            if match:
                result = ap.parse_human_done(match)
                if result:
                    # F2: this does NOT go straight to VERIFYING — there is no
                    # fix yet to verify, only the operator's answer. It goes
                    # through the SAME fleet-task generator route_auto_
                    # incidents() uses (I2's format, I2's ≤3/day cap — a
                    # human-done follow-up is still a fleet task the router
                    # generates, it spends the same budget) so the operator's
                    # answer becomes a real, reviewed piece of work, not a
                    # fabricated "fixed" claim.
                    #
                    # note_incident() is called ONLY after the slot is
                    # actually captured (Fable ruling-2, point 1): the file is
                    # deliberately left un-archived and re-scanned every tick
                    # while the cap is exhausted, so noting "human-done" here
                    # unconditionally would append a fresh attempts-array
                    # entry (up to ~144/day at a 10-minute tick) for the same
                    # unresolved answer every single tick until budget frees
                    # up — a bloated audit trail that then gets pasted
                    # verbatim into the follow-up task body. Capturing the
                    # slot first makes this branch run at most once per
                    # incident.
                    if not ap.consume_daily_task_slot():
                        ap.notice(f"молчу: {incident_id} ({provider}/{kind}) — human-done follow-up "
                                  f"blocked, daily fleet-task cap ({ap.DAILY_TASK_CAP}) reached; "
                                  f"file left in {ap.HUMAN_DONE_DIR}/ for a later tick")
                        continue  # do NOT archive the file — retry on a future tick once budget frees up
                    ap.note_incident(incident_id, "operator", "human-done", result[:2000])
                    inc = ap.get_incident(incident_id)
                    filename, content = ap.build_human_followup_task_body(inc, result)
                    path = os.path.join(ap.TASKLOOP_QUEUE_DIR, filename)
                    try:
                        os.makedirs(ap.TASKLOOP_QUEUE_DIR, exist_ok=True)
                        with open(path, "w", encoding="utf-8") as f:
                            f.write(content)
                    except Exception as e:
                        ap.notice(f"WARN: {incident_id} ({provider}/{kind}) — failed to write "
                                  f"human-done follow-up task {path}: {e}")
                        continue  # leave WAITING_HUMAN, file un-archived, retry next tick
                    ap.transition_state(incident_id, "REMEDIATION_QUEUED",
                                         extra_set=f", fleet_task_id = {ap.sql_literal(filename)}")
                    ap.note_incident(incident_id, "remediation-router", "human-done-followup-queued",
                                      f"fleet task {filename}")
                    ap.notice(f"incident {incident_id} ({provider}/{kind}): human-done consumed, "
                              f"follow-up {filename} -> REMEDIATION_QUEUED")
                    try:
                        os.makedirs(processed_dir, exist_ok=True)
                        os.rename(match, os.path.join(processed_dir, os.path.basename(match)))
                    except Exception as e:
                        ap.notice(f"WARN: could not archive human-done file {match}: {e}")
                    continue  # advanced past WAITING_HUMAN, nothing else to do this tick
                else:
                    ap.notice(f"молчу: {incident_id} human-done file present but "
                              f"РЕЗУЛЬТАТ ОПЕРАТОРА not filled yet")

        # 2. 72h reminder edge (F2: "напоминание раз в 72ч", C0.5: suppressed
        # reminder is a logged line, not silence).
        try:
            attempts = json.loads(attempts_raw)
        except Exception:
            attempts = []
        reminder_times = [a["ts"] for a in attempts if a.get("action") == "waiting-human-reminder"]
        last_reminder = _parse_ts(max(reminder_times)) if reminder_times else _parse_ts(created_at)
        if last_reminder is None:
            continue  # NOINFO on timing — don't guess, wait for a parseable timestamp
        age = datetime.now(timezone.utc) - last_reminder
        if age >= timedelta(seconds=ap.WAITING_HUMAN_REMINDER_SECONDS):
            inc = ap.get_incident(incident_id)
            sent = ap.tg_send(ap.format_tg_message({**inc, "what": f"[напоминание] {kind} всё ещё ждёт вас"}))
            ap.note_incident(incident_id, "incident-engine", "waiting-human-reminder",
                              "sent" if sent else "TG unavailable")
            if not sent:
                ap.notice(f"молчу: TG unavailable for 72h reminder on {incident_id}")
        else:
            ap.notice(f"молчу: {incident_id} ({provider}/{kind}) still WAITING_HUMAN, "
                      f"reminder not due for {timedelta(seconds=ap.WAITING_HUMAN_REMINDER_SECONDS) - age}")


def advance_verifying():
    out, rc = ap.psql(
        f"SELECT incident_id, provider, kind, {UTC_TS_EXPR('updated_at')} "
        f"FROM incidents WHERE state = 'VERIFYING'"
    )
    if rc != 0 or not out:
        return
    for line in out.splitlines():
        incident_id, provider, kind, updated_at = line.split(ap.SEP)
        pv, rc2 = ap.psql(
            f"SELECT state, last_probe_result, {UTC_TS_EXPR('last_probe_at')} FROM provider_status "
            f"WHERE provider = {ap.sql_literal(provider)}"
        )
        if rc2 != 0 or not pv:
            continue  # NOINFO — no provider_status row at all, nothing to confirm against yet
        state, last_result, last_probe_at = pv.split(ap.SEP)
        probe_ts = _parse_ts(last_probe_at)
        verify_ts = _parse_ts(updated_at)
        if probe_ts is None or verify_ts is None or probe_ts <= verify_ts:
            # No measurement SINCE we entered VERIFYING — still NOINFO, not a
            # verdict either way. Do not resolve on stale data (C0.3).
            continue
        if state == "HEALTHY" or last_result == "OK":
            ap.transition_state(incident_id, "RESOLVED")
            ap.note_incident(incident_id, "incident-engine", "verified", "re-probe OK")
            ap.tg_send(f"[apibase] ✅ RESOLVED INC-{ap.short_id(incident_id)} {kind} "
                       f"({provider}) — re-probe confirmed OK")
        elif last_result in ("FAIL_TRANSIENT", "FAIL_DETERMINISTIC"):
            ap.transition_state(incident_id, "STUCK")
            ap.note_incident(incident_id, "incident-engine", "verify-failed",
                              f"re-probe still {last_result} — F2: VERIFYING+FAIL -> STUCK")
            ap.tg_send(f"[apibase] \U0001F534 STUCK INC-{ap.short_id(incident_id)} {kind} "
                       f"({provider}) — re-probe still failing, needs a human now")
        # SKIPPED_BUDGET/NOINFO: genuinely no answer yet, leave in VERIFYING.


# ---------------------------------------------------------------------------
# AP-8: Tool.status autodemotion/promotion. E5's own schema comment named
# this task before it existed: "`status` не пишет НИКТО — это первый
# потребитель." Deliberately reuses F1's own hysteresis rather than building
# a second one — provider_status.state ALREADY only changes after the
# fail-streak/recovery-streak counters AP-3's computeTransition() enforces,
# so mirroring `state` verbatim IS "гистерезис = F1-пороги" (the P-table
# row's own words), not a shortcut around it.
# ---------------------------------------------------------------------------

def _tool_status_for_state(state: str):
    """Pure F1-state -> Tool.status mapping (src/pipeline/stages/tool-
    status.stage.ts's own three values: healthy | degraded | unavailable).
    UNKNOWN (never-probed, AP-3's bootstrap seed) maps to None — "no verdict
    yet" is NOINFO, not a silent demotion OR a forced healthy stamp over
    whatever a human/seed already set."""
    return {"HEALTHY": "healthy", "DEGRADED": "degraded", "DOWN": "unavailable"}.get(state)


def _availability_crossed(old_statuses, target: str) -> bool:
    """Whether this batch of tool-status writes changed the COUNT of
    available tools (sync-counts.sh's own query: `status != 'unavailable'`)
    — true if the new target itself is 'unavailable' (a fresh demotion) or
    any tool being written was PREVIOUSLY 'unavailable' (a promotion out of
    it). A healthy<->degraded flip never changes that count, so it must not
    trigger a sync-counts run for no reason."""
    return target == "unavailable" or "unavailable" in old_statuses


def sync_tool_status():
    """Self-healing reconciler, not edge-triggered off incident open/close —
    reads provider_status directly and runs every tick regardless of whether
    an incident exists for the provider (same posture as every other self-
    heal cron in this codebase: converges on its own, even if it somehow
    fell out of sync, rather than only reacting to a transition it
    witnessed). Independent of AP-6's routing (depends on AP-3's
    provider_status only, per this task's own P-table row: "зависит от:
    AP-3").

    status_source LAW (manual status is never overwritten): only tools.rows
    where status_source IS NULL, 'autopilot', or 'seed' are eligible —
    'manual' is the one value this function must never touch again once set
    (schema.prisma's own E5 comment: "no drive-by write ever loses who
    changed this and why"). `status <> target` in the WHERE clause also
    means a no-op state (nothing actually changed) never rewrites
    status_changed_at, keeping that column meaningful as an audit trail
    rather than a heartbeat.

    Journals into whichever OPEN-ish incident (state != 'RESOLVED') exists
    for this provider — best-effort (P-table: "журнал в attempts"): the
    status write above has already happened and must not be undone just
    because no incident exists yet or note_incident errors, so this half is
    wrapped separately and never re-raises."""
    out, rc = ap.psql(
        "SELECT provider, state, state_reason FROM provider_status "
        "WHERE state IN ('HEALTHY','DEGRADED','DOWN')"
    )
    if rc != 0:
        ap.notice(f"tool-status-sync: provider_status query failed: {out}")
        return
    if not out:
        return  # no provider has left UNKNOWN yet — genuinely nothing to sync
    for line in out.splitlines():
        provider, state, reason = (line.split(ap.SEP) + [None, None, None])[:3]
        target = _tool_status_for_state(state)
        if target is None:
            continue
        reason_text = f"autopilot: provider_status.state={state}" + (f" ({reason})" if reason else "")
        sql = (
            "WITH changed AS ("
            f"SELECT tool_id, status FROM tools WHERE provider = {ap.sql_literal(provider)} "
            f"AND status_source IS DISTINCT FROM 'manual' AND status <> {ap.sql_literal(target)}"
            ") "
            f"UPDATE tools t SET status = {ap.sql_literal(target)}, status_source = 'autopilot', "
            f"status_changed_at = now(), status_reason = {ap.sql_literal(reason_text)} "
            "FROM changed WHERE t.tool_id = changed.tool_id "
            "RETURNING t.tool_id, changed.status"
        )
        out2, rc2 = ap.psql(sql)
        if rc2 != 0:
            ap.notice(f"tool-status-sync: update failed for {provider} -> {target}: {out2}")
            continue
        if not out2:
            continue  # already converged — nothing eligible needed a change
        rows = [r.split(ap.SEP) for r in out2.splitlines()]
        old_statuses = [r[1] for r in rows]
        ap.notice(f"tool-status-sync: {provider} -> {target} ({len(rows)} tool(s))")

        inc_row, inc_rc = ap.psql(
            f"SELECT incident_id FROM incidents WHERE provider = {ap.sql_literal(provider)} "
            f"AND state != 'RESOLVED' ORDER BY created_at DESC LIMIT 1"
        )
        if inc_rc == 0 and inc_row:
            try:
                ap.note_incident(inc_row, "tool-status-sync", "status-changed",
                                  f"{len(rows)} tool(s) -> {target} (status_source=autopilot)")
            except Exception as e:
                ap.notice(f"tool-status-sync: note_incident failed for {inc_row}: {e}")

        if _availability_crossed(old_statuses, target):
            ap.trigger_sync_counts()


def write_heartbeat():
    try:
        with open(ap.HEARTBEAT_FILE, "w") as f:
            f.write(datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") + "\n")
    except Exception as e:
        # If we can't even write /tmp, don't pretend we ran cleanly — but
        # don't crash the tick over it either (best-effort, matches every
        # other heartbeat write in this codebase, e.g. fleet-check.sh's own
        # /tmp/fleet-CHECK.hb).
        print(f"incident-engine: WARNING could not write heartbeat: {e}")


def run():
    ok, missing = ap.schema_present()
    if not ok:
        print(f"incident-engine: schema not deployed yet (missing: {missing}) — "
              f"nothing to do this tick, NOT an error (see module docstring)")
        write_heartbeat()  # the ENGINE ran; the schema being absent is a separate fact
        return 0
    opened = detect_from_provider_status()
    sync_tool_status()
    route_auto_incidents()
    bridge_key_incidents()
    advance_remediation_queued()
    advance_waiting_human()
    advance_verifying()
    write_heartbeat()
    print(f"incident-engine: tick complete, {opened} new incident(s) opened")
    return 0


# ---------------------------------------------------------------------------
# Selftests
# ---------------------------------------------------------------------------
def selftest():
    """Fast, no DB. Pure-logic checks only — see --selftest-db for the 3
    worlds (открыл/склеил/закрыл) against a real (disposable) Postgres."""
    assert ap.dedup_key("PROVIDER_DOWN", "x") == "PROVIDER_DOWN:x"
    assert _classify_deterministic_fail("401 with configured key") == "AUTH_FAILED"
    assert _classify_deterministic_fail("403 forbidden") == "AUTH_FAILED"
    assert _classify_deterministic_fail("404 on canonical probe url") == "ENDPOINT_CHANGED"
    assert _classify_deterministic_fail("schema mismatch: expected array") == "ENDPOINT_CHANGED"
    assert _classify_deterministic_fail("connection reset") == "UNKNOWN"
    assert _classify_deterministic_fail(None) == "UNKNOWN"

    # AP-6: every kind routed, no silent gaps (routing.json, not a hardcoded
    # dict, now backs ap.ROUTE_CLASS — see autopilot_common._load_routing).
    assert set(ap.ROUTE_CLASS) == ap.KINDS
    # Test on ABSENCE (this task's own row): money never gets an auto-branch,
    # and never gets a fleet task either.
    assert ap.ROUTE_CLASS["PAYMENT_REQUIRED"] == "HUMAN_ONLY"
    assert "PAYMENT_REQUIRED" not in ap.FLEET_TASK_KINDS
    assert all(v not in ("AUTO", "AUTO_NO_MODEL") for k, v in ap.ROUTE_CLASS.items()
               if k == "PAYMENT_REQUIRED")
    # Every AUTO/MIXED kind IS a fleet-task kind (I1); every HUMAN_*/
    # AUTO_NO_MODEL kind is NOT.
    for kind, route in ap.ROUTE_CLASS.items():
        expect_fleet_task = route in ("AUTO", "MIXED")
        assert (kind in ap.FLEET_TASK_KINDS) == expect_fleet_task, (
            f"{kind} ({route}): fleet_task flag disagrees with its route class"
        )
    fn = ap.next_task_filename("PROVIDER_DOWN", "Test Provider!", "SEV1")
    assert fn.startswith("9") and fn.endswith("-autopilot-remediation-PROVIDER_DOWN-test-provider.md"), fn

    # AP-8: pure F1-state -> Tool.status mapping + availability-crossing check.
    assert _tool_status_for_state("HEALTHY") == "healthy"
    assert _tool_status_for_state("DEGRADED") == "degraded"
    assert _tool_status_for_state("DOWN") == "unavailable"
    assert _tool_status_for_state("UNKNOWN") is None, "UNKNOWN is NOINFO, never a guessed status"
    assert _availability_crossed(["healthy"], "unavailable") is True, "demotion INTO unavailable crosses"
    assert _availability_crossed(["unavailable"], "healthy") is True, "promotion OUT OF unavailable crosses"
    assert _availability_crossed(["unavailable"], "degraded") is True, "still a promotion out of unavailable"
    assert _availability_crossed(["healthy"], "degraded") is False, "healthy<->degraded never changes the count"
    assert _availability_crossed(["degraded"], "healthy") is False, "healthy<->degraded never changes the count"
    assert _availability_crossed([], "degraded") is False, "no rows changed at all"
    print("incident-engine --selftest: OK")


def selftest_db():
    """The 3-world acceptance test (open/merge/close) against a REAL Postgres
    — spins up a disposable postgres:16.2-alpine container (never touches
    apibase-postgres-1/production, same boundary as AP-1's own verification),
    applies migration 0009, runs the scenario, tears the container down.
    Requires docker. Prints OK/FAIL per world; exits nonzero on any failure."""
    import subprocess
    import time

    name = "autopilot-ap4-selftest-pg"
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
        # postgres:alpine's entrypoint runs a first, TEMPORARY server (to run
        # init scripts) that pg_isready happily reports ready on, then
        # SHUTS IT DOWN and restarts the real one -- a single pg_isready
        # success is not proof the database is actually reachable yet.
        # Confirm with an actual query, repeatedly, not just the ready check.
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
            os.path.dirname(os.path.abspath(__file__)), "..", "..",
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
        # incident-engine's queries also touch tools/execution_ledger (best
        # effort tool_count/revenue_pct) -- minimal stand-ins so those queries
        # don't error (NOINFO paths are already tolerant, but let's exercise
        # the real path, not just the fallback).
        # AP-8's own columns (E5, migration 0009) added to this minimal stand-in
        # too -- status defaults 'healthy' exactly like the real tools table.
        subprocess.run(
            ["docker", "exec", "-i", name, "psql", "-U", "apibase", "-d", "apibase"],
            input="CREATE TABLE tools (tool_id text primary key, provider text, "
                  "status text not null default 'healthy', status_source text, "
                  "status_changed_at timestamptz, status_reason text); "
                  "CREATE TABLE execution_ledger (tool_id text, cost_usd numeric default 0, "
                  "billing_status text, created_at timestamptz default now());",
            capture_output=True, text=True,
        )

        os.environ["AUTOPILOT_PG_CONTAINER"] = name
        os.environ["AUTOPILOT_HEARTBEAT_FILE"] = "/tmp/autopilot-ap4-selftest.hb"
        os.environ["AUTOPILOT_NOTICES_LOG"] = "/tmp/autopilot-ap4-selftest-notices.log"
        os.environ["AUTOPILOT_OPERATOR_DIR"] = "/tmp/autopilot-ap4-selftest-operator"
        os.environ["AUTOPILOT_HUMAN_DONE_DIR"] = "/tmp/autopilot-ap4-selftest-human-done"
        # CRITICAL: never let a selftest reach the real Telegram bot. Without
        # this override, load_tg_env() would read the REAL deploy tree's
        # tg.env (ROOT is not overridden — it doesn't need to be, this
        # module's DB/file overrides are all that matter for the DB test)
        # and a "successful" selftest run could page the operator's actual
        # phone. Point it at a path that provably does not exist instead of
        # trusting that the real tg.env happens to be absent right now.
        os.environ["AUTOPILOT_TG_ENV_PATH"] = "/tmp/autopilot-ap4-selftest-tg-env-does-not-exist"

        # AP-6 fixtures: isolated taskloop dirs/counter (never the real
        # ~/taskloop), a provider-limits stub with one provider whose
        # auth_env IS known and one where it ISN'T (bridge_key_incident must
        # never guess), and a stub connected_db.py that logs its own calls
        # instead of touching the real deploy-tree state file.
        os.environ["AUTOPILOT_TASKLOOP_ROOT"] = "/tmp/autopilot-ap6-selftest-taskloop"
        os.environ["AUTOPILOT_TASKLOOP_QUEUE_DIR"] = "/tmp/autopilot-ap6-selftest-taskloop/queue"
        os.environ["AUTOPILOT_DAILY_TASK_COUNTER"] = "/tmp/autopilot-ap6-selftest-daily.count"
        os.environ["AUTOPILOT_PROVIDER_LIMITS_JSON"] = "/tmp/autopilot-ap6-selftest-provider-limits.json"
        os.environ["AUTOPILOT_CONNECTED_DB_PY"] = "/tmp/autopilot-ap6-selftest-connected-db.py"
        os.environ["AUTOPILOT_FIX_MD"] = "/tmp/autopilot-ap6-selftest-fix-md-does-not-exist.md"
        import shutil
        shutil.rmtree("/tmp/autopilot-ap6-selftest-taskloop", ignore_errors=True)
        for sub in ("queue", "active", "done", "stuck"):
            os.makedirs(f"/tmp/autopilot-ap6-selftest-taskloop/{sub}", exist_ok=True)
        for stale in ("/tmp/autopilot-ap6-selftest-daily.count",
                      "/tmp/autopilot-ap6-selftest-connected-db.calls.log"):
            if os.path.exists(stale):
                os.remove(stale)
        with open("/tmp/autopilot-ap6-selftest-provider-limits.json", "w", encoding="utf-8") as f:
            json.dump({
                "keyprovA": {"display_name": "Key Provider A", "docs_url": "https://example.invalid/a",
                             "probe": {"auth_env": "PROVIDER_KEY_KEYPROVA"}},
                "keyprovB": {"display_name": "Key Provider B", "docs_url": "https://example.invalid/b"},
            }, f)
        with open("/tmp/autopilot-ap6-selftest-connected-db.py", "w", encoding="utf-8") as f:
            f.write(
                "#!/usr/bin/env python3\n"
                "import sys\n"
                "with open('/tmp/autopilot-ap6-selftest-connected-db.calls.log', 'a') as fh:\n"
                "    fh.write(' '.join(sys.argv[1:]) + chr(10))\n"
                "print('stub: queued ' + ' '.join(sys.argv[1:]))\n"
            )

        import importlib
        importlib.reload(ap)
        assert ap.load_tg_env() == {}, "selftest-db: tg.env override failed — refusing to risk a real TG send"

        # World 1: open — a fresh AUTH_FAILED (HUMAN_KEY route) opens straight
        # into WAITING_HUMAN, no operator file (LAW #ONE-PLACE).
        id1, created1 = ap.open_or_merge_incident(
            kind="AUTH_FAILED", provider="testprov", evidence={"probe": "401"},
            detected_by="probe", what="401 with configured key",
        )
        inc1 = ap.get_incident(id1)
        assert created1 is True, "world 1: expected a NEW incident"
        assert inc1["state"] == "WAITING_HUMAN", f"world 1: expected WAITING_HUMAN, got {inc1['state']}"
        assert inc1["operator_file"] is None, "world 1: HUMAN_KEY must NOT get a generic operator file"
        print("world 1 (opened): OK")

        # World 2: merge — the SAME fault recurring must NOT open a second
        # incident (I3's DB-level lock + this function's application check).
        id2, created2 = ap.open_or_merge_incident(
            kind="AUTH_FAILED", provider="testprov", evidence={"probe": "401 again"},
            detected_by="probe", what="401 again",
        )
        assert created2 is False, "world 2: recurrence must MERGE, not open a second incident"
        assert id2 == id1, "world 2: merge must return the SAME incident_id"
        inc2 = ap.get_incident(id1)
        assert len(inc2["attempts"]) == 1, f"world 2: expected 1 recurrence note, got {inc2['attempts']}"
        assert inc2["attempts"][0]["action"] == "recurrence"
        # DB-level lock itself: a raw duplicate-open INSERT must be rejected.
        raw_dupe, rc_dupe = ap.psql(
            f"INSERT INTO incidents (incident_id, dedup_key, provider, kind, severity, state, "
            f"detected_by, evidence) VALUES (gen_random_uuid(), 'AUTH_FAILED:testprov', 'testprov', "
            f"'AUTH_FAILED', 'SEV2', 'OPEN', 'probe', '{{}}'::jsonb)"
        )
        assert rc_dupe != 0, "world 2: partial unique index must reject a second OPEN dedup_key"
        print("world 2 (merged): OK")

        # World 3: close — resolve-request-equivalent (VERIFYING), confirmed
        # only by a re-probe measurement that happened AFTER we started
        # waiting (C0.3: stale data must never silently pass a check).
        ap.transition_state(id1, "VERIFYING")
        ap.psql(
            "INSERT INTO provider_status (provider, state, state_since, next_probe_at, "
            "probe_interval_s, last_probe_result, last_probe_at) VALUES "
            "('testprov', 'DEGRADED', now(), now(), 300, 'FAIL_DETERMINISTIC', now() - interval '1 hour')"
        )
        advance_verifying()
        inc3a = ap.get_incident(id1)
        assert inc3a["state"] == "VERIFYING", (
            f"world 3a: a probe from BEFORE entering VERIFYING must not resolve anything, "
            f"got {inc3a['state']}"
        )

        # Now a genuinely fresh OK probe (after the VERIFYING transition) --
        # THIS is what closes it.
        ap.psql(
            "UPDATE provider_status SET state = 'HEALTHY', last_probe_result = 'OK', "
            "last_probe_at = now() WHERE provider = 'testprov'"
        )
        advance_verifying()
        inc3b = ap.get_incident(id1)
        assert inc3b["state"] == "RESOLVED", f"world 3b: expected RESOLVED, got {inc3b['state']}"
        assert inc3b["resolved_at"], "world 3b: resolved_at must be set"
        print("world 3 (closed): OK")

        # Bonus (F2, not one of the 3 named worlds but load-bearing): a
        # dedup_key that RESOLVED can be reopened -- the partial index only
        # locks OPEN incidents, per AP-1's own test of this exact property.
        id4, created4 = ap.open_or_merge_incident(
            kind="AUTH_FAILED", provider="testprov", evidence={"probe": "401 (new episode)"},
            detected_by="probe", what="401 again, new episode after resolution",
        )
        assert created4 is True, "reopen-after-RESOLVED: must be a NEW incident, not a merge"
        assert id4 != id1, "reopen-after-RESOLVED: must be a different incident_id"
        print("bonus (reopen after RESOLVED): OK")

        # Bonus 2: the actual cron-tick entry point (detect_from_provider_status),
        # not just the lower-level open_or_merge_incident it calls -- calling
        # detect_from_provider_status() ALONE (not run()) must still open an
        # AUTO-route kind (PROVIDER_DOWN) as plain OPEN, never a fabricated
        # REMEDIATION_QUEUED -- that transition is route_auto_incidents()'s
        # job (AP-6, exercised separately below in world 4), not detect's.
        ap.psql(
            "INSERT INTO provider_status (provider, state, state_since, next_probe_at, "
            "probe_interval_s, last_probe_result, last_probe_at) VALUES "
            "('testprov2', 'DOWN', now(), now(), 3600, 'FAIL_TRANSIENT', now())"
        )
        opened = detect_from_provider_status()
        assert opened == 1, f"bonus 2: expected 1 new incident from detect tick, got {opened}"
        row, rc5 = ap.psql("SELECT incident_id FROM incidents WHERE provider = 'testprov2'")
        assert rc5 == 0 and row, "bonus 2: PROVIDER_DOWN incident not found"
        inc5 = ap.get_incident(row)
        assert inc5["state"] == "OPEN", f"bonus 2: AUTO-route kind must stay OPEN, got {inc5['state']}"
        assert inc5["kind"] == "PROVIDER_DOWN"
        assert any("AP-6" in a.get("result", "") for a in inc5["attempts"]), (
            "bonus 2: OPEN-parked AUTO incident must say WHY, not silently sit there"
        )
        # A second tick over the same still-DOWN provider must merge, not
        # open a duplicate (detect_from_provider_status runs every 10 min).
        opened2 = detect_from_provider_status()
        assert opened2 == 0, f"bonus 2: second tick over same fault must open 0, got {opened2}"
        print("bonus 2 (cron-tick detect, AUTO-route stays OPEN): OK")

        # Clean up bonus 2's testprov2 before world 4 -- otherwise its still-
        # OPEN PROVIDER_DOWN incident (and its still-DOWN provider_status row,
        # which would spawn a FRESH one on the next detect() call) would
        # compete for one of world 4's 3 daily fleet-task slots and throw off
        # the exact counts asserted below. Cleanup, not a finding.
        ap.transition_state(row, "RESOLVED")
        ap.psql("UPDATE provider_status SET state = 'HEALTHY', last_probe_result = 'OK' "
                "WHERE provider = 'testprov2'")

        # World 4 (AP-6): OPEN incidents whose kind routes to AUTO get a real
        # fleet task filed and move to REMEDIATION_QUEUED -- capped at
        # DAILY_TASK_CAP (3): a 4th AUTO incident opened the same day stays
        # OPEN with a logged suppression, never silently queued past the cap.
        assert ap.ROUTE_CLASS["PAYMENT_REQUIRED"] == "HUMAN_ONLY", "sanity: real routing.json intact"
        assert "PAYMENT_REQUIRED" not in ap.FLEET_TASK_KINDS, "sanity: money kind never gets a fleet task"
        for i in range(1, 5):
            ap.psql(
                f"INSERT INTO provider_status (provider, state, state_since, next_probe_at, "
                f"probe_interval_s, last_probe_result, last_probe_at) VALUES "
                f"('ap6prov{i}', 'DOWN', now(), now(), 3600, 'FAIL_TRANSIENT', now())"
            )
        opened4 = detect_from_provider_status()
        assert opened4 == 4, f"world 4 setup: expected 4 new PROVIDER_DOWN incidents, got {opened4}"
        # I1's own age gate ("PROVIDER_DOWN (SEV2+, >24ч)") would otherwise
        # leave these fresh-this-tick incidents OPEN regardless of cap space
        # -- world 9 below tests THAT gate in isolation; this world is about
        # the ≤3/day CAP once a PROVIDER_DOWN incident is already eligible,
        # so backdate created_at past the gate first (a fault genuinely open
        # for >24h), same shape as world 5's own "simulate the passage of
        # time via SQL, not sleep()" pattern elsewhere in this file.
        ap.psql("UPDATE incidents SET created_at = now() - interval '25 hours' "
                "WHERE provider LIKE 'ap6prov%'")
        route_auto_incidents()
        rows4, rc4 = ap.psql(
            "SELECT provider, state, fleet_task_id FROM incidents WHERE provider LIKE 'ap6prov%' "
            "ORDER BY provider"
        )
        assert rc4 == 0
        queued = [r.split(ap.SEP) for r in rows4.splitlines()]
        n_queued = sum(1 for _, st, _ in queued if st == "REMEDIATION_QUEUED")
        n_open = sum(1 for _, st, _ in queued if st == "OPEN")
        assert n_queued == 3, f"world 4: expected exactly 3 queued (daily cap), got {n_queued}: {queued}"
        assert n_open == 1, f"world 4: expected exactly 1 still OPEN (cap-refused), got {n_open}: {queued}"
        for provider, state, task_id in queued:
            if state == "REMEDIATION_QUEUED":
                assert task_id, f"world 4: {provider} REMEDIATION_QUEUED but fleet_task_id is empty"
                task_path = os.path.join(ap.TASKLOOP_QUEUE_DIR, task_id)
                assert os.path.isfile(task_path), f"world 4: {task_path} was not actually written"
                body = open(task_path, encoding="utf-8").read()
                assert body.startswith("REVIEW: fable\nMAX_ATTEMPTS: 2\n"), body[:80]
                assert "resolve-request" in body and "PROVIDER_DOWN" in body
            else:
                assert not task_id, f"world 4: OPEN incident has a fleet_task_id: {task_id}"
        print("world 4 (fleet-task generation + daily cap): OK")

        # A second tick over the still-OPEN, cap-refused incident must not
        # queue a duplicate on top of the 3 already queued today.
        route_auto_incidents()
        rows4b, _ = ap.psql(
            "SELECT count(*) FROM incidents WHERE provider LIKE 'ap6prov%' AND state = 'REMEDIATION_QUEUED'"
        )
        assert rows4b.strip() == "3", f"world 4b: second tick changed the queued count: {rows4b}"
        print("world 4b (cap stays exhausted same day): OK")

        # World 5 (AP-6): AUTO_NO_MODEL (RATE_LIMITED) never spends the daily
        # cap and never files a fleet task -- the engine acts directly.
        ap.psql(
            "INSERT INTO provider_status (provider, state, state_since, next_probe_at, "
            "probe_interval_s, last_probe_result, last_probe_at) VALUES "
            "('ap6ratelimited', 'DEGRADED', now(), now(), 900, 'FAIL_TRANSIENT', now())"
        )
        id5, created5 = ap.open_or_merge_incident(
            kind="RATE_LIMITED", provider="ap6ratelimited", evidence={"probe": "429"},
            detected_by="probe", what="sustained 429s",
        )
        assert created5 is True
        before5, _ = ap.psql("SELECT probe_interval_s FROM provider_status WHERE provider = 'ap6ratelimited'")
        route_auto_incidents()
        inc5b = ap.get_incident(id5)
        assert inc5b["state"] == "VERIFYING", f"world 5: expected VERIFYING, got {inc5b['state']}"
        assert not inc5b["fleet_task_id"], "world 5: AUTO_NO_MODEL must never file a fleet task"
        after5, _ = ap.psql("SELECT probe_interval_s FROM provider_status WHERE provider = 'ap6ratelimited'")
        assert int(after5) > int(before5), f"world 5: probe_interval_s did not increase ({before5} -> {after5})"
        rows5c, _ = ap.psql(
            "SELECT count(*) FROM incidents WHERE provider LIKE 'ap6prov%' AND state = 'REMEDIATION_QUEUED'"
        )
        assert rows5c.strip() == "3", "world 5: AUTO_NO_MODEL must not touch the (already exhausted) daily cap"
        print("world 5 (AUTO_NO_MODEL self-action, cap untouched): OK")

        # World 6 (AP-6): KEY -> connected_db.py bridge. keyprovA has a known
        # auth_env (provider-limits stub), keyprovB does not -- the bridge
        # must call the stubbed connected_db.py exactly once for A, never
        # guess a name for B, and never call A twice even across ticks.
        id6a, _ = ap.open_or_merge_incident(
            kind="AUTH_FAILED", provider="keyprovA", evidence={"probe": "401"},
            detected_by="probe", what="401 with configured key",
        )
        id6b, _ = ap.open_or_merge_incident(
            kind="AUTH_FAILED", provider="keyprovB", evidence={"probe": "401"},
            detected_by="probe", what="401 with configured key",
        )
        call_log = "/tmp/autopilot-ap6-selftest-connected-db.calls.log"
        bridge_key_incidents()
        bridge_key_incidents()  # second tick: must be a no-op for A, still nothing for B
        calls = open(call_log, encoding="utf-8").read().splitlines() if os.path.exists(call_log) else []
        assert len(calls) == 1, f"world 6: expected exactly 1 connected_db.py call, got {calls}"
        assert "keyprova" in calls[0].lower() and "PROVIDER_KEY_KEYPROVA" in calls[0], calls[0]
        inc6a = ap.get_incident(id6a)
        inc6b = ap.get_incident(id6b)
        assert any(a["action"] == "connected-db-bridge" and "stub: queued" in a["result"]
                   for a in inc6a["attempts"]), inc6a["attempts"]
        assert any(a["action"] == "connected-db-bridge" and "NOINFO" in a["result"]
                   for a in inc6b["attempts"]), inc6b["attempts"]
        print("world 6 (KEY -> connected_db.py bridge, idempotent, no-guess): OK")

        # World 7 (AP-6): routing.json's fail-closed money guard actually
        # REJECTS a file that gives PAYMENT_REQUIRED an auto-branch -- run
        # for real (mutation control: this IS the red case, not a claim).
        import tempfile
        bad_routing = dict(ap.ROUTING)
        bad_routing["PAYMENT_REQUIRED"] = {"route_class": "AUTO", "review": "fable", "fleet_task": True}
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as tf:
            json.dump(bad_routing, tf)
            bad_path = tf.name
        try:
            raised = False
            try:
                ap._load_routing(bad_path)
            except AssertionError:
                raised = True
            assert raised, "world 7: a routing.json that auto-routes PAYMENT_REQUIRED must be REJECTED"
        finally:
            os.remove(bad_path)
        print("world 7 (routing.json money-guard rejects a rigged file): OK")

        # World 8 (AP-6): advance_remediation_queued() reads the fleet's
        # outcome back from done/stuck -- the "и читает исход" half of F3
        # that route_auto_incidents() alone doesn't cover (that function only
        # writes the file, never checks what became of it). Reuses two of
        # world 4's already-REMEDIATION_QUEUED ap6prov* incidents; the third
        # is left untouched to prove "no outcome yet" is NOINFO, not a guess.
        rows8, _ = ap.psql(
            "SELECT incident_id, fleet_task_id FROM incidents "
            "WHERE provider LIKE 'ap6prov%' AND state = 'REMEDIATION_QUEUED' ORDER BY provider"
        )
        queued8 = [r.split(ap.SEP) for r in rows8.splitlines()]
        assert len(queued8) == 3, f"world 8 setup: expected 3 still-queued incidents, got {queued8}"
        id8_done, task8_done = queued8[0]
        id8_stuck, task8_stuck = queued8[1]
        id8_still, _task8_still = queued8[2]
        done_dir = os.path.join(ap.TASKLOOP_ROOT, "done")
        stuck_dir = os.path.join(ap.TASKLOOP_ROOT, "stuck")
        os.makedirs(done_dir, exist_ok=True)
        os.makedirs(stuck_dir, exist_ok=True)
        with open(os.path.join(done_dir, task8_done), "w", encoding="utf-8") as f:
            f.write("VERDICT: DONE\n")
        with open(os.path.join(stuck_dir, task8_stuck), "w", encoding="utf-8") as f:
            f.write("stuck: exhausted attempts\n")
        advance_remediation_queued()
        inc8_done = ap.get_incident(id8_done)
        inc8_stuck = ap.get_incident(id8_stuck)
        inc8_still = ap.get_incident(id8_still)
        assert inc8_done["state"] == "VERIFYING", f"world 8: expected VERIFYING, got {inc8_done['state']}"
        assert any(a["action"] == "fleet-done" for a in inc8_done["attempts"]), inc8_done["attempts"]
        assert inc8_stuck["state"] == "STUCK", f"world 8: expected STUCK, got {inc8_stuck['state']}"
        assert any(a["action"] == "fleet-stuck" for a in inc8_stuck["attempts"]), inc8_stuck["attempts"]
        assert inc8_still["state"] == "REMEDIATION_QUEUED", (
            f"world 8: incident with no fleet outcome yet (neither done/ nor stuck/) must stay "
            f"queued, got {inc8_still['state']}"
        )
        print("world 8 (fleet outcome watcher: done->VERIFYING, stuck->STUCK, no-outcome stays put): OK")

        # World 9 (Fable ruling-1, point 1): PROVIDER_DOWN's I1 age gate
        # ("SEV2+, >24ч") -- a PROVIDER_DOWN incident opened THIS tick must
        # NOT get a fleet task even with cap room, only once it's genuinely
        # >24h old. Mutation control: this is the RED case for the bug the
        # ruling found (route_auto_incidents used to queue every OPEN
        # PROVIDER_DOWN regardless of age) -- reverting _provider_down_ready's
        # gate check makes this assertion fail.
        if os.path.exists(ap.DAILY_TASK_COUNTER_FILE):
            os.remove(ap.DAILY_TASK_COUNTER_FILE)
        # World 5's ap6ratelimited is still DEGRADED in provider_status (its
        # self-action only touches probe_interval_s, never the health state)
        # -- left alone it would be picked up again here and reclassified as
        # a brand-new DEGRADED_QUALITY incident (a pre-existing AP-4 quirk,
        # out of this task's scope). Cleanup, not a finding -- same pattern
        # as bonus 2's own testprov2 cleanup above.
        ap.psql("UPDATE provider_status SET state = 'HEALTHY', last_probe_result = 'OK' "
                "WHERE provider = 'ap6ratelimited'")
        ap.psql(
            "INSERT INTO provider_status (provider, state, state_since, next_probe_at, "
            "probe_interval_s, last_probe_result, last_probe_at) VALUES "
            "('ap6freshdown', 'DOWN', now(), now(), 3600, 'FAIL_TRANSIENT', now())"
        )
        opened9 = detect_from_provider_status()
        assert opened9 == 1, f"world 9 setup: expected 1 new PROVIDER_DOWN incident, got {opened9}"
        row9, _ = ap.psql("SELECT incident_id FROM incidents WHERE provider = 'ap6freshdown'")
        route_auto_incidents()
        inc9a = ap.get_incident(row9)
        assert inc9a["state"] == "OPEN", (
            f"world 9: a PROVIDER_DOWN incident younger than 24h must stay OPEN (I1's own gate), "
            f"got {inc9a['state']}"
        )
        assert not inc9a["fleet_task_id"], "world 9: no fleet task should exist for a <24h-old DOWN"
        # C0.5: a suppressed action is a logged line (notices.log), same
        # place/pattern the daily-cap suppression already uses -- not silence.
        notices9 = open(ap.NOTICES_LOG, encoding="utf-8").read() if os.path.exists(ap.NOTICES_LOG) else ""
        assert "ap6freshdown" in notices9 and "24h" in notices9, (
            f"world 9: age-gate suppression must be logged (C0.5), got: {notices9[-500:]}"
        )
        # Now genuinely backdate it past the gate -- the SAME incident must
        # queue on the very next tick.
        ap.psql(f"UPDATE incidents SET created_at = now() - interval '25 hours' "
                f"WHERE incident_id = {ap.sql_literal(row9)}")
        route_auto_incidents()
        inc9b = ap.get_incident(row9)
        assert inc9b["state"] == "REMEDIATION_QUEUED", (
            f"world 9: a PROVIDER_DOWN incident aged past 24h must now queue, got {inc9b['state']}"
        )
        assert inc9b["fleet_task_id"], "world 9: expected a fleet_task_id once past the age gate"
        print("world 9 (PROVIDER_DOWN >24h age gate, I1): OK")

        # World 10 (Fable ruling-1, point 1): severity ordering under cap
        # pressure. Deliberately open the LOWER-severity (SEV3) incident
        # FIRST (older) and the HIGHER-severity (SEV2) one SECOND (newer) --
        # a plain SELECT with no ORDER BY (or one ordered only by created_at)
        # would let the older SEV3 grab the one remaining slot; `ORDER BY
        # severity, created_at` must pick the SEV2 instead. Mutation control:
        # dropping the ORDER BY clause makes this fail (SEV3 gets queued,
        # SEV2 doesn't) -- verified by temporarily reverting it below.
        if os.path.exists(ap.DAILY_TASK_COUNTER_FILE):
            os.remove(ap.DAILY_TASK_COUNTER_FILE)
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        with open(ap.DAILY_TASK_COUNTER_FILE, "w", encoding="utf-8") as f:
            f.write(f"{today}:2")  # 2 of 3 already spent today -- exactly 1 slot left
        id10_sev3, _ = ap.open_or_merge_incident(
            kind="EMAIL_NOTICE", provider="ap6ordersev3", evidence={"email": "deprecation notice"},
            detected_by="email", what="older SEV3, opened first",
        )
        id10_sev2, _ = ap.open_or_merge_incident(
            kind="DEGRADED_QUALITY", provider="ap6ordersev2", evidence={"error_rate": 0.4},
            detected_by="probe", what="newer SEV2, opened second",
        )
        assert ap.get_incident(id10_sev3)["severity"] == "SEV3"
        assert ap.get_incident(id10_sev2)["severity"] == "SEV2"
        route_auto_incidents()
        inc10_sev3 = ap.get_incident(id10_sev3)
        inc10_sev2 = ap.get_incident(id10_sev2)
        assert inc10_sev2["state"] == "REMEDIATION_QUEUED", (
            f"world 10: the NEWER but HIGHER-severity (SEV2) incident must win the last slot, "
            f"got {inc10_sev2['state']}"
        )
        assert inc10_sev3["state"] == "OPEN", (
            f"world 10: the OLDER but LOWER-severity (SEV3) incident must lose to SEV2, "
            f"got {inc10_sev3['state']}"
        )
        print("world 10 (severity-ordered fleet-task cap, SEV2 beats an older SEV3): OK")

        # World 11 (Fable ruling-1, point 2): human-done watcher must follow
        # F2's diagram literally -- WAITING_HUMAN + human-done file ->
        # REMEDIATION_QUEUED (follow-up fleet task), NOT straight to
        # VERIFYING. Mutation control: reverting advance_waiting_human()'s
        # human-done branch to its pre-fix "-> VERIFYING" behavior makes the
        # REMEDIATION_QUEUED assertion below fail (and the follow-up task
        # file would never exist).
        if os.path.exists(ap.DAILY_TASK_COUNTER_FILE):
            os.remove(ap.DAILY_TASK_COUNTER_FILE)
        id11, _ = ap.open_or_merge_incident(
            kind="UNKNOWN", provider="ap6humandone", evidence={"probe": "connection reset, unrecognized"},
            detected_by="probe", what="unrecognized deterministic fail",
        )
        inc11a = ap.get_incident(id11)
        assert inc11a["state"] == "WAITING_HUMAN", f"world 11 setup: expected WAITING_HUMAN, got {inc11a['state']}"
        assert inc11a["operator_file"], "world 11 setup: UNKNOWN (HUMAN_GENERIC) must get an operator file"
        os.makedirs(ap.HUMAN_DONE_DIR, exist_ok=True)
        sid11 = ap.short_id(id11)
        with open(os.path.join(ap.HUMAN_DONE_DIR, f"INC-{sid11}.md"), "w", encoding="utf-8") as f:
            f.write(f"# INC-{sid11}\n...\n---\nРЕЗУЛЬТАТ ОПЕРАТОРА:\nЭто ENDPOINT_CHANGED, "
                    f"URL сменился на https://example.invalid/v2 -- обновите adapter.\n")
        advance_waiting_human()
        inc11b = ap.get_incident(id11)
        assert inc11b["state"] == "REMEDIATION_QUEUED", (
            f"world 11: human-done must move the incident to REMEDIATION_QUEUED (F2's own diagram: "
            f"'human-done файл -> REMEDIATION_QUEUED (follow-up)'), not straight to VERIFYING -- "
            f"got {inc11b['state']}"
        )
        assert inc11b["fleet_task_id"], "world 11: expected a follow-up fleet_task_id"
        followup_path = os.path.join(ap.TASKLOOP_QUEUE_DIR, inc11b["fleet_task_id"])
        assert os.path.isfile(followup_path), f"world 11: follow-up task file missing: {followup_path}"
        followup_body = open(followup_path, encoding="utf-8").read()
        assert followup_body.startswith("REVIEW: fable\n"), followup_body[:40]
        assert "ENDPOINT_CHANGED" in followup_body and "example.invalid/v2" in followup_body, (
            "world 11: follow-up task must quote the operator's actual answer as data"
        )
        assert any(a["action"] == "human-done" for a in inc11b["attempts"]), inc11b["attempts"]
        assert not os.path.exists(os.path.join(ap.HUMAN_DONE_DIR, f"INC-{sid11}.md")), (
            "world 11: consumed human-done file must be archived out of the watch directory"
        )
        # Close the loop the same way world 8 already proved: fleet DONE ->
        # VERIFYING via the SAME advance_remediation_queued(), never a second
        # invented path.
        with open(os.path.join(ap.TASKLOOP_ROOT, "done", inc11b["fleet_task_id"]), "w", encoding="utf-8") as f:
            f.write("VERDICT: DONE\n")
        advance_remediation_queued()
        inc11c = ap.get_incident(id11)
        assert inc11c["state"] == "VERIFYING", f"world 11: expected VERIFYING after fleet DONE, got {inc11c['state']}"
        print("world 11 (human-done -> REMEDIATION_QUEUED follow-up -> VERIFYING, F2/J3): OK")

        # World 11b: human-done arriving when the daily cap is already spent
        # must NOT fabricate a follow-up -- the incident stays WAITING_HUMAN
        # and the human-done file is left in place (not archived) so a later
        # tick, once the cap frees up, can still pick it up. Silence here is
        # a logged "молчу", not data loss.
        with open(ap.DAILY_TASK_COUNTER_FILE, "w", encoding="utf-8") as f:
            f.write(f"{today}:3")  # cap exhausted
        id11d, _ = ap.open_or_merge_incident(
            kind="UNKNOWN", provider="ap6humandonecapped", evidence={"probe": "?"},
            detected_by="probe", what="unrecognized",
        )
        sid11d = ap.short_id(id11d)
        human_done_path_d = os.path.join(ap.HUMAN_DONE_DIR, f"INC-{sid11d}.md")
        with open(human_done_path_d, "w", encoding="utf-8") as f:
            f.write(f"# INC-{sid11d}\n---\nРЕЗУЛЬТАТ ОПЕРАТОРА:\nsome answer\n")
        advance_waiting_human()
        inc11d = ap.get_incident(id11d)
        assert inc11d["state"] == "WAITING_HUMAN", (
            f"world 11b: cap-exhausted human-done must NOT advance the incident, got {inc11d['state']}"
        )
        assert os.path.isfile(human_done_path_d), "world 11b: cap-exhausted human-done file must NOT be archived"
        assert not any(a["action"] == "human-done" for a in inc11d["attempts"]), (
            f"world 11b: a slot-blocked human-done must not be noted into attempts either, "
            f"got {inc11d['attempts']}"
        )

        # Second tick, cap still exhausted: the un-archived file is re-scanned
        # every tick (that's the whole point of leaving it in place), so this
        # is where a pre-fix "note before slot capture" would append a SECOND
        # "human-done" attempts entry for the same still-unresolved answer.
        # Mutation control: moving the note_incident() call in
        # advance_waiting_human() back above the consume_daily_task_slot()
        # check makes this assertion fail (2 entries instead of 0, growing by
        # one every further tick).
        advance_waiting_human()
        inc11e = ap.get_incident(id11d)
        assert inc11e["state"] == "WAITING_HUMAN", (
            f"world 11b: second cap-exhausted tick must still not advance the incident, got {inc11e['state']}"
        )
        assert os.path.isfile(human_done_path_d), (
            "world 11b: second cap-exhausted tick must still not archive the file"
        )
        assert not any(a["action"] == "human-done" for a in inc11e["attempts"]), (
            f"world 11b: repeated cap-exhausted ticks must NOT accumulate duplicate 'human-done' "
            f"attempts entries for the same unresolved answer, got {inc11e['attempts']}"
        )
        print("world 11b (human-done follow-up respects the daily cap, no fabricated advance, "
              "no duplicate attempts across repeated ticks): OK")

        # World 12 (Fable ruling-1, point 3): KEY bridge two-worlds guard --
        # an AUTH_FAILED whose auth_env is ALREADY present in .env must NOT
        # be handed to connected_db.py add (which would silently become an
        # "issued, nothing to do" letter for a key that actually needs
        # rotating). Mutation control: removing the _env_var_present() guard
        # makes this world fail (calls stub connected_db.py, logs "queued").
        os.environ["AUTOPILOT_DEPLOY_ENV_FILE"] = "/tmp/autopilot-ap6-selftest.env"
        with open("/tmp/autopilot-ap6-selftest.env", "w", encoding="utf-8") as f:
            f.write("PROVIDER_KEY_KEYPROVC=sk-already-configured-but-revoked\n")
        limits_path = os.environ["AUTOPILOT_PROVIDER_LIMITS_JSON"]
        limits = json.load(open(limits_path, encoding="utf-8"))
        limits["keyprovc"] = {"display_name": "Key Provider C", "docs_url": "https://example.invalid/c",
                               "probe": {"auth_env": "PROVIDER_KEY_KEYPROVC"}}
        with open(limits_path, "w", encoding="utf-8") as f:
            json.dump(limits, f)
        importlib.reload(ap)
        id12, _ = ap.open_or_merge_incident(
            kind="AUTH_FAILED", provider="keyprovc", evidence={"probe": "401"},
            detected_by="probe", what="401 with configured key",
        )
        calls_before = open(call_log, encoding="utf-8").read().splitlines() if os.path.exists(call_log) else []
        bridge_key_incidents()
        calls_after = open(call_log, encoding="utf-8").read().splitlines() if os.path.exists(call_log) else []
        assert calls_after == calls_before, (
            f"world 12: connected_db.py must NOT be called for an already-in-.env auth_env, "
            f"got new calls: {calls_after[len(calls_before):]}"
        )
        inc12 = ap.get_incident(id12)
        bridge_note = next(a for a in inc12["attempts"] if a["action"] == "connected-db-bridge")
        assert "queued" not in bridge_note["result"].lower(), (
            f"world 12: must not claim 'queued' for a key already in .env: {bridge_note['result']}"
        )
        assert "уже присутствует" in bridge_note["result"], bridge_note["result"]
        assert inc12["operator_file"], "world 12: expected a fallback operator file for this exception"
        assert os.path.isfile(inc12["operator_file"]), f"world 12: {inc12['operator_file']} not written"
        op_body12 = open(inc12["operator_file"], encoding="utf-8").read()
        assert "PROVIDER_KEY_KEYPROVC" in op_body12, "world 12: operator file must name the exact var"
        # Idempotent: a second tick must not re-write/duplicate anything.
        bridge_key_incidents()
        inc12b = ap.get_incident(id12)
        assert len([a for a in inc12b["attempts"] if a["action"] == "connected-db-bridge"]) == 1, (
            "world 12: bridge must not re-fire on a second tick"
        )
        print("world 12 (KEY bridge: already-in-.env falls back to operator file, no false 'queued'): OK")

        # World 13 (AP-8): demote -> promote cycle, manual status never
        # overwritten, journal into the matching incident's attempts, and the
        # sync-counts trigger firing ONLY on an availability-crossing change.
        # A fresh, isolated sync-counts-cron.sh stub (never the real one --
        # this must not touch git or a real lock) that just proves it was
        # launched.
        marker = "/tmp/autopilot-ap8-selftest-sync-counts-marker"
        if os.path.exists(marker):
            os.remove(marker)
        stub_sh = "/tmp/autopilot-ap8-selftest-sync-counts-cron.sh"
        with open(stub_sh, "w", encoding="utf-8") as f:
            f.write(f"#!/usr/bin/env bash\necho ran > {marker}\n")
        os.environ["AUTOPILOT_SYNC_COUNTS_CRON_SH"] = stub_sh
        os.environ["AUTOPILOT_FLEET_WORKTREE"] = "/tmp"
        importlib.reload(ap)

        def _wait_for(path, timeout_s=5):
            # `time` is already imported in the enclosing selftest_db() scope.
            deadline = time.time() + timeout_s
            while time.time() < deadline:
                if os.path.exists(path):
                    return True
                time.sleep(0.1)
            return False

        ap.psql(
            "INSERT INTO tools (tool_id, provider, status, status_source) VALUES "
            "('ap8down1-tool1', 'ap8down1', 'healthy', NULL), "
            "('ap8down1-tool2', 'ap8down1', 'healthy', 'autopilot')"
        )
        ap.psql(
            "INSERT INTO provider_status (provider, state, state_since, next_probe_at, "
            "probe_interval_s, last_probe_result, last_probe_at, state_reason) VALUES "
            "('ap8down1', 'DOWN', now(), now(), 3600, 'FAIL_TRANSIENT', now(), '5 подряд неудачных проб')"
        )
        opened13 = detect_from_provider_status()
        assert opened13 == 1, f"world 13 setup: expected 1 new PROVIDER_DOWN incident, got {opened13}"
        sync_tool_status()
        rows13a, _ = ap.psql(
            "SELECT tool_id, status, status_source, status_reason, "
            f"({UTC_TS_EXPR('status_changed_at')} IS NOT NULL) FROM tools "
            "WHERE provider = 'ap8down1' ORDER BY tool_id"
        )
        for line in rows13a.splitlines():
            tool_id, status, source, reason, has_ts = line.split(ap.SEP)
            assert status == "unavailable", f"world 13: {tool_id} expected unavailable, got {status}"
            assert source == "autopilot", f"world 13: {tool_id} expected status_source=autopilot, got {source}"
            assert has_ts == "t", f"world 13: {tool_id} status_changed_at was not set"
            assert "DOWN" in reason, f"world 13: {tool_id} status_reason must name the state: {reason}"
        inc13_row, _ = ap.psql("SELECT incident_id FROM incidents WHERE provider = 'ap8down1'")
        inc13 = ap.get_incident(inc13_row)
        assert any(
            a["actor"] == "tool-status-sync" and a["action"] == "status-changed"
            and "unavailable" in a["result"] for a in inc13["attempts"]
        ), f"world 13: demotion must be journaled into the open incident's attempts, got {inc13['attempts']}"
        assert _wait_for(marker), "world 13: demotion crossing availability must trigger sync-counts (detached)"
        print("world 13a (demote: DOWN -> unavailable, status_source=autopilot, journaled, "
              "sync-counts triggered): OK")

        # A manually-set tool on the SAME still-DOWN provider must be skipped,
        # even mid-outage -- and an already-converged tool must not be
        # rewritten again (status_changed_at stays put, proving the
        # `status <> target` no-op guard, not just the status_source guard).
        os.remove(marker)
        ap.psql(
            "INSERT INTO tools (tool_id, provider, status, status_source, status_changed_at) VALUES "
            "('ap8down1-tool3', 'ap8down1', 'degraded', 'manual', now() - interval '1 day')"
        )
        ts_before, _ = ap.psql(
            f"SELECT {UTC_TS_EXPR('status_changed_at')} FROM tools WHERE tool_id = 'ap8down1-tool1'"
        )
        sync_tool_status()
        row_manual, _ = ap.psql(
            "SELECT status, status_source FROM tools WHERE tool_id = 'ap8down1-tool3'"
        )
        assert row_manual == "degraded" + ap.SEP + "manual", (
            f"world 13: a status_source='manual' tool must NEVER be overwritten by autopilot, "
            f"got {row_manual}"
        )
        ts_after, _ = ap.psql(
            f"SELECT {UTC_TS_EXPR('status_changed_at')} FROM tools WHERE tool_id = 'ap8down1-tool1'"
        )
        assert ts_after == ts_before, (
            "world 13: an already-converged autopilot row must not be rewritten on a no-op tick "
            f"({ts_before} -> {ts_after})"
        )
        assert not os.path.exists(marker), (
            "world 13: a no-op tick (nothing actually changed) must NOT re-trigger sync-counts"
        )
        print("world 13b (manual status never overwritten, no-op tick doesn't re-touch "
              "status_changed_at or re-trigger sync-counts): OK")

        # Promote back: provider recovers to HEALTHY (AP-3's own 2-consecutive-
        # OK streak already happened upstream by the time `state` says so --
        # this function only reacts to the CURRENT F1 state column, no second
        # streak of its own, per this task's own "гистерезис = F1-пороги").
        ap.psql(
            "UPDATE provider_status SET state = 'HEALTHY', last_probe_result = 'OK', "
            "last_probe_at = now(), state_reason = NULL WHERE provider = 'ap8down1'"
        )
        sync_tool_status()
        rows13c, _ = ap.psql(
            "SELECT tool_id, status, status_source FROM tools WHERE provider = 'ap8down1' "
            "AND tool_id != 'ap8down1-tool3' ORDER BY tool_id"
        )
        for line in rows13c.splitlines():
            tool_id, status, source = line.split(ap.SEP)
            assert status == "healthy", f"world 13: {tool_id} expected healthy after recovery, got {status}"
            assert source == "autopilot"
        row_manual2, _ = ap.psql("SELECT status, status_source FROM tools WHERE tool_id = 'ap8down1-tool3'")
        assert row_manual2 == "degraded" + ap.SEP + "manual", (
            f"world 13: manual tool must survive the FULL demote->promote cycle untouched, got {row_manual2}"
        )
        assert _wait_for(marker), "world 13: promotion crossing availability must also trigger sync-counts"
        print("world 13c (promote: HEALTHY -> healthy, manual tool survives the whole cycle, "
              "sync-counts triggered again): OK")

        # DEGRADED-only change must NOT cross the availability boundary --
        # no sync-counts trigger (mutation control: dropping the `target ==
        # "unavailable" or "unavailable" in old_statuses` check in favor of
        # "always trigger" makes this assertion fail).
        os.remove(marker)
        ap.psql(
            "INSERT INTO tools (tool_id, provider, status, status_source) VALUES "
            "('ap8degradedonly-tool1', 'ap8degradedonly', 'healthy', NULL)"
        )
        ap.psql(
            "INSERT INTO provider_status (provider, state, state_since, next_probe_at, "
            "probe_interval_s, last_probe_result, last_probe_at) VALUES "
            "('ap8degradedonly', 'DEGRADED', now(), now(), 900, 'FAIL_TRANSIENT', now())"
        )
        sync_tool_status()
        row_deg, _ = ap.psql("SELECT status, status_source FROM tools WHERE tool_id = 'ap8degradedonly-tool1'")
        assert row_deg == "degraded" + ap.SEP + "autopilot", f"world 13: expected degraded/autopilot, got {row_deg}"
        assert not _wait_for(marker, timeout_s=1), (
            "world 13: healthy<->degraded must NOT change the available-tool count, "
            "so it must NOT trigger sync-counts"
        )
        print("world 13d (DEGRADED-only change never crosses availability, no sync-counts trigger): OK")

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
    raise SystemExit(run())
