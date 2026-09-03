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
  3. advance_waiting_human() — 72h reminder edge, human-done/ watcher.
  4. advance_verifying() — re-probe confirmation -> RESOLVED or STUCK.
  5. write_heartbeat().

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


def advance_waiting_human():
    out, rc = ap.psql(
        f"SELECT incident_id, provider, kind, {UTC_TS_EXPR('created_at')}, attempts::text, "
        f"{UTC_TS_EXPR('updated_at')} FROM incidents WHERE state = 'WAITING_HUMAN'"
    )
    if rc != 0 or not out:
        return
    processed_dir = os.path.join(ap.HUMAN_DONE_DIR, "processed")
    for line in out.splitlines():
        incident_id, provider, kind, created_at, attempts_raw, updated_at = line.split(ap.SEP)
        sid = ap.short_id(incident_id)
        route = ap.ROUTE_CLASS[kind]

        # 1. human-done watcher (J3) — HUMAN_KEY incidents don't use this path
        # at all (no generic operator file was ever written for them; their
        # resolution is a fresh AP-3 probe seeing the rotated key, handled by
        # advance_verifying's provider_status check once someone flips them
        # to VERIFYING — which for HUMAN_KEY currently only happens via a
        # manual resolve-request, since there is no automatic "key rotated"
        # event source yet, a gap explicitly left to a later task per G2's
        # own "или события смены ключа" note).
        if route in ap.OPERATOR_FILE_ROUTE_CLASSES and os.path.isdir(ap.HUMAN_DONE_DIR):
            match = None
            for fn in os.listdir(ap.HUMAN_DONE_DIR):
                if f"INC-{sid}" in fn and os.path.isfile(os.path.join(ap.HUMAN_DONE_DIR, fn)):
                    match = os.path.join(ap.HUMAN_DONE_DIR, fn)
                    break
            if match:
                result = ap.parse_human_done(match)
                if result:
                    ap.note_incident(incident_id, "operator", "human-done", result[:2000])
                    ap.transition_state(incident_id, "VERIFYING")
                    ap.notice(f"incident {incident_id} ({provider}/{kind}): human-done "
                              f"consumed, -> VERIFYING")
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
        subprocess.run(
            ["docker", "exec", "-i", name, "psql", "-U", "apibase", "-d", "apibase"],
            input="CREATE TABLE tools (tool_id text primary key, provider text); "
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
        # not just the lower-level open_or_merge_incident it calls -- an
        # AUTO-route kind (PROVIDER_DOWN) must open OPEN, not a fabricated
        # REMEDIATION_QUEUED, since AP-6 doesn't exist yet (module docstring).
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
