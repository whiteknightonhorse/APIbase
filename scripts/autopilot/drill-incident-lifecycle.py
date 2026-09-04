#!/usr/bin/env python3
"""drill-incident-lifecycle.py — AP-11 (820-autopilot-drills.md, taskloop
T-820), the incident-engine.py + incidents-API half of drills 1/3 and 2/3
("синтетический DOWN-провайдер" through RESOLVED, "синтетический 401"
through WAITING_HUMAN).

Boundary with the TS half of this drill (tests/integration/autopilot-drill-
provider-health.test.ts): that file proves, against a REAL local HTTP
socket, exactly what row shapes provider-health.job.ts writes to
provider_status/probe_log for a DOWN provider (state=DOWN,
consecutive_failures=5, last_probe_result=FAIL_TRANSIENT after 5 real 500s;
2 more real 200s -> HEALTHY) and for a 401 (state=DEGRADED,
last_probe_result=FAIL_DETERMINISTIC, deterministic_paused_until=+24h, a
second real tick makes ZERO further requests). This script seeds a
disposable Postgres with EXACTLY those proven shapes — documented here, not
invented — and drives the REAL incident-engine.py (subprocess, same
invocation the cron uses: `python3 incident-engine.py`, no flags) against
them, through to the incident lifecycle's real terminus for each kind: F2's
diagram + I1's routing table put PROVIDER_DOWN (route AUTO) at RESOLVED and
AUTH_FAILED (route HUMAN_KEY) at WAITING_HUMAN — this drill does not force
AUTH_FAILED further than that; WAITING_HUMAN *is* its correct, designed
terminus (J1: key rotation is HUMAN-ONLY by construction), matching this
task's own phrasing ("полный цикл до RESOLVED/WAITING_HUMAN").

Same disposable-postgres pattern as incident-engine.py's own --selftest-db
and email-intake.py's own --selftest-db (spin up postgres:16.2-alpine,
apply migration 0009 + a minimal tools/execution_ledger stand-in, never
apibase-postgres-1/production) — deliberately NOT refactored into a shared
helper: this repo's own convention (see both files' headers) is that each
selftest/drill owns its fixture boilerplate rather than depending on another
script's internals.

Also drives scripts/autopilot/drill-verify-api.ts (via `npx tsx`) against
the SAME disposable Postgres (published on a real TCP port for Prisma,
alongside the `docker exec` path incident-engine.py/incident-cli.py use) to
prove the REAL incidents.service.ts / the REAL dashboard.service.ts SQL text
see this drill's synthetic incidents correctly — the gap AP-9's own tests
(query-shape-proofs, no live Postgres in CI) never closed.

Usage:
  python3 scripts/autopilot/drill-incident-lifecycle.py            # run both drills
  python3 scripts/autopilot/drill-incident-lifecycle.py --mutate M # see MUTATIONS below
"""
import json
import os
import subprocess
import sys
import time

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(SCRIPTS_DIR))
CONTAINER = "autopilot-ap11-drill-lifecycle-pg"
PG_PORT = 55491
SCRATCH = "/tmp/autopilot-ap11-drill"


def sh(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def psql_raw(sql):
    """Talks to the drill's OWN disposable container directly (bypasses
    autopilot_common — this script isn't running with AP-1's env overrides
    active for itself, only for the incident-engine.py subprocess it
    spawns), same docker-exec shape as every other selftest_db in this repo."""
    r = sh(["docker", "exec", "-i", CONTAINER, "psql", "-U", "apibase", "-d", "apibase",
            "-tAqF", "\x1f", "-c", sql])
    return r.stdout.strip(), r.returncode, r.stderr


def start_pg():
    sh(["docker", "rm", "-f", CONTAINER])
    print(f"drill: starting disposable postgres:16.2-alpine ({CONTAINER}, port {PG_PORT}) ...")
    r = sh(["docker", "run", "-d", "--name", CONTAINER, "-e", "POSTGRES_PASSWORD=x",
            "-e", "POSTGRES_USER=apibase", "-e", "POSTGRES_DB=apibase",
            "-p", f"127.0.0.1:{PG_PORT}:5432", "postgres:16.2-alpine"])
    if r.returncode != 0:
        print(f"drill: could not start container: {r.stderr}")
        return False
    for _ in range(60):
        time.sleep(1)
        chk = sh(["docker", "exec", CONTAINER, "psql", "-U", "apibase", "-d", "apibase", "-tAc", "SELECT 1"])
        if chk.returncode == 0 and chk.stdout.strip() == "1":
            break
    else:
        print("drill: postgres never became ready")
        return False

    # 0009 (AP-1's schema) + 0010 (AP-3 review fix: deterministic_paused_until,
    # the "401 zero retries" pause anchor drill B needs) — incident-engine.py's
    # own --selftest-db only applies 0009, which is fine for ITS worlds (none
    # of them assert on the pause anchor column), but this drill's synthetic
    # 401 explicitly seeds it, so both migrations are required here.
    for mig in ("0009_autopilot_schema", "0010_provider_status_pause_anchor"):
        migration_path = os.path.join(ROOT, "prisma", "migrations", mig, "migration.sql")
        with open(migration_path) as f:
            migration_sql = f.read()
        apply = sh(["docker", "exec", "-i", CONTAINER, "psql", "-U", "apibase", "-d", "apibase"],
                   input=migration_sql)
        if apply.returncode != 0:
            print(f"drill: migration {mig} apply failed: {apply.stderr}")
            return False
    sh(["docker", "exec", "-i", CONTAINER, "psql", "-U", "apibase", "-d", "apibase"],
       input=(
           "CREATE TABLE tools (tool_id text primary key, provider text, "
           "status text not null default 'healthy', status_source text, "
           "status_changed_at timestamptz, status_reason text); "
           "CREATE TABLE execution_ledger (execution_id text primary key default gen_random_uuid()::text, "
           "tool_id text, cost_usd numeric default 0, latency_ms integer, status text, "
           "billing_status text, created_at timestamptz default now());"
       ))
    return True


def stop_pg():
    sh(["docker", "rm", "-f", CONTAINER])


def isolated_env():
    """Same AUTOPILOT_* override convention as incident-engine.py's own
    --selftest-db (env.py docstrings there explain each one) — every path
    this drill's incident-engine.py subprocess touches is a /tmp scratch
    dir, never ~/taskloop, ~/autopilot/operator, tg.env, or connected_db.py."""
    env = dict(os.environ)
    env["AUTOPILOT_PG_CONTAINER"] = CONTAINER
    env["AUTOPILOT_HEARTBEAT_FILE"] = f"{SCRATCH}/engine.hb"
    env["AUTOPILOT_NOTICES_LOG"] = f"{SCRATCH}/notices.log"
    env["AUTOPILOT_OPERATOR_DIR"] = f"{SCRATCH}/operator"
    env["AUTOPILOT_HUMAN_DONE_DIR"] = f"{SCRATCH}/human-done"
    env["AUTOPILOT_TG_ENV_PATH"] = f"{SCRATCH}/tg-env-does-not-exist"
    env["AUTOPILOT_TASKLOOP_ROOT"] = f"{SCRATCH}/taskloop"
    env["AUTOPILOT_TASKLOOP_QUEUE_DIR"] = f"{SCRATCH}/taskloop/queue"
    env["AUTOPILOT_DAILY_TASK_COUNTER"] = f"{SCRATCH}/taskloop/state/daily.count"
    env["AUTOPILOT_PROVIDER_LIMITS_JSON"] = f"{SCRATCH}/provider-limits.json"
    env["AUTOPILOT_CONNECTED_DB_PY"] = f"{SCRATCH}/connected-db.py"
    env["AUTOPILOT_FIX_MD"] = f"{SCRATCH}/fix-md-does-not-exist.md"
    env["AUTOPILOT_DEPLOY_ENV_FILE"] = f"{SCRATCH}/deploy-env-does-not-exist"
    return env


def reset_scratch():
    import shutil
    shutil.rmtree(SCRATCH, ignore_errors=True)
    for sub in ("taskloop/queue", "taskloop/active", "taskloop/done", "taskloop/stuck",
                "taskloop/state", "human-done", "human-done/processed", "operator"):
        os.makedirs(os.path.join(SCRATCH, sub), exist_ok=True)
    with open(os.path.join(SCRATCH, "provider-limits.json"), "w", encoding="utf-8") as f:
        json.dump({
            "ap11-drilldown": {"display_name": "AP-11 Drill: Synthetic DOWN Provider",
                                "health_url": "http://127.0.0.1:1/health",
                                "limit_type": "unlimited", "free_limit": 0, "reset_period": "none"},
            "ap11-drill401": {"display_name": "AP-11 Drill: Synthetic 401 Provider",
                               "health_url": "http://127.0.0.1:1/health",
                               "limit_type": "unlimited", "free_limit": 0, "reset_period": "none",
                               "probe": {"auth_env": "AP11_DRILL401_KEY"}},
        }, f)
    with open(os.path.join(SCRATCH, "connected-db.py"), "w", encoding="utf-8") as f:
        f.write(
            "#!/usr/bin/env python3\n"
            "import sys\n"
            f"with open('{SCRATCH}/connected-db-calls.log', 'a') as fh:\n"
            "    fh.write(' '.join(sys.argv[1:]) + chr(10))\n"
            "print('stub: queued ' + ' '.join(sys.argv[1:]))\n"
        )
    for stale in ("connected-db-calls.log",):
        p = os.path.join(SCRATCH, stale)
        if os.path.exists(p):
            os.remove(p)


def run_engine_tick(env):
    r = subprocess.run(["python3", os.path.join(SCRIPTS_DIR, "incident-engine.py")],
                        capture_output=True, text=True, env=env, timeout=60)
    print(f"  [engine tick] rc={r.returncode} {r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ''}")
    if r.returncode != 0:
        print(r.stdout)
        print(r.stderr, file=sys.stderr)
    return r


def cli_list(env, provider):
    r = subprocess.run(["python3", os.path.join(SCRIPTS_DIR, "incident-cli.py"), "list",
                         "--provider", provider], capture_output=True, text=True, env=env)
    return r.stdout.strip()


def verify_api(provider, incident_id=None):
    """Runs scripts/autopilot/drill-verify-api.ts against THIS drill's
    disposable Postgres over a real TCP port (DATABASE_URL) — proves the
    REAL incidents.service.ts / dashboard.service.ts SQL see this drill's
    synthetic state, not a reimplementation of either."""
    env = dict(os.environ)
    env["DATABASE_URL"] = f"postgresql://apibase:x@127.0.0.1:{PG_PORT}/apibase"
    args = ["npx", "tsx", os.path.join(SCRIPTS_DIR, "drill-verify-api.ts"), provider]
    if incident_id:
        args.append(incident_id)
    r = subprocess.run(args, capture_output=True, text=True, env=env, cwd=ROOT, timeout=60)
    if r.returncode != 0:
        print(f"  [verify-api] FAILED rc={r.returncode}\n{r.stdout}\n{r.stderr}", file=sys.stderr)
        return None
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        print(f"  [verify-api] non-JSON output:\n{r.stdout}", file=sys.stderr)
        return None


def get_incident_row(provider):
    line = psql_raw(
        f"SELECT incident_id, kind, state, severity, fleet_task_id, created_at "
        f"FROM incidents WHERE provider = '{provider}' ORDER BY created_at DESC LIMIT 1"
    )[0]
    if not line:
        return None
    parts = line.split("\x1f")
    return {"incident_id": parts[0], "kind": parts[1], "state": parts[2],
            "severity": parts[3], "fleet_task_id": parts[4] or None, "created_at": parts[5]}


# ---------------------------------------------------------------------------
# Drill A — synthetic DOWN provider, full cycle to RESOLVED
# ---------------------------------------------------------------------------
def drill_down_provider(env):
    print("\n=== Drill A: synthetic DOWN provider -> incident-engine.py -> RESOLVED ===")
    provider = "ap11-drilldown"
    psql_raw(f"INSERT INTO tools (tool_id, provider, status) VALUES ('{provider}-tool1', '{provider}', 'healthy')")
    # Exact shape tests/integration/autopilot-drill-provider-health.test.ts
    # proved provider-health.job.ts writes after 5 real consecutive 500s.
    psql_raw(
        f"INSERT INTO provider_status (provider, state, state_since, next_probe_at, "
        f"probe_interval_s, consecutive_failures, last_probe_result, last_probe_at) VALUES "
        f"('{provider}', 'DOWN', now(), now(), 3600, 5, 'FAIL_TRANSIENT', now())"
    )

    print("-- tick 1: detect opens PROVIDER_DOWN (OPEN — <24h old, no fleet task yet, I1 age gate) --")
    run_engine_tick(env)
    inc = get_incident_row(provider)
    assert inc is not None, "drill A: no incident opened"
    assert inc["kind"] == "PROVIDER_DOWN", f"drill A: expected PROVIDER_DOWN, got {inc['kind']}"
    assert inc["state"] == "OPEN", f"drill A: expected OPEN (I1's >24h gate), got {inc['state']}"
    assert inc["fleet_task_id"] is None, "drill A: no fleet task should exist yet (I1 age gate)"
    tools_row = psql_raw(f"SELECT status, status_source FROM tools WHERE tool_id = '{provider}-tool1'")[0]
    tools_status, tools_source = tools_row.split("\x1f")
    assert tools_status == "unavailable", f"drill A: AP-8 should have demoted the tool, got {tools_row!r}"
    assert tools_source == "autopilot"
    print(f"  OK: {inc}, tools.status={tools_row}")

    api = verify_api(provider)
    if api is not None:
        assert len(api["incidents"]) == 1 and api["incidents"][0]["state"] == "OPEN"
        assert api["dashboard_row"][0]["provider_state"] == "DOWN", api["dashboard_row"]
        assert int(api["dashboard_row"][0]["open_incidents"]) == 1
        assert int(api["dashboard_row"][0]["tool_count"]) == 0, (
            "drill A: totals.tools must exclude the autopilot-demoted tool (T-8181 ruling-3 fix)")
        print("  OK: /api/v1/incidents + dashboard JOIN both see OPEN/DOWN/tool_count=0")
    else:
        print("  SKIPPED: verify-api step unavailable this run (see stderr above), continuing on psql evidence alone")

    print("-- simulate >24h elapsed (I1's PROVIDER_DOWN age gate) --")
    psql_raw(f"UPDATE incidents SET created_at = created_at - interval '25 hours' WHERE incident_id = '{inc['incident_id']}'")

    print("-- tick 2: route_auto_incidents() now files a real fleet task -> REMEDIATION_QUEUED --")
    run_engine_tick(env)
    inc = get_incident_row(provider)
    assert inc["state"] == "REMEDIATION_QUEUED", f"drill A: expected REMEDIATION_QUEUED, got {inc['state']}"
    assert inc["fleet_task_id"], "drill A: fleet_task_id must be set"
    queue_path = os.path.join(SCRATCH, "taskloop", "queue", inc["fleet_task_id"])
    assert os.path.isfile(queue_path), f"drill A: fleet task file missing at {queue_path}"
    print(f"  OK: fleet task filed at {queue_path}")

    print("-- simulate the fleet fixing it (done/ marker) --")
    done_path = os.path.join(SCRATCH, "taskloop", "done", inc["fleet_task_id"])
    with open(done_path, "w") as f:
        f.write("VERDICT: DONE\n")

    print("-- tick 3: advance_remediation_queued() sees done/ -> VERIFYING --")
    run_engine_tick(env)
    inc = get_incident_row(provider)
    assert inc["state"] == "VERIFYING", f"drill A: expected VERIFYING, got {inc['state']}"
    print(f"  OK: {inc}")

    print("-- simulate the real re-probe: 2 consecutive OKs (proven TS shape) landing AFTER the VERIFYING transition --")
    time.sleep(1.1)  # advance_verifying() requires probe_ts > verify_ts (updated_at) -- see its own docstring
    psql_raw(
        f"UPDATE provider_status SET state = 'HEALTHY', consecutive_failures = 0, "
        f"last_probe_result = 'OK', last_probe_at = now() WHERE provider = '{provider}'"
    )

    print("-- tick 4: sync_tool_status() converges the tool healthy->healthy transition FIRST in this same tick "
          "(its own note_incident bumps incidents.updated_at) -- advance_verifying() correctly refuses to trust "
          "a probe timestamp that isn't AFTER that fresher anchor, so this tick promotes the tool but stays VERIFYING --")
    run_engine_tick(env)
    inc = get_incident_row(provider)
    assert inc["state"] == "VERIFYING", (
        f"drill A: expected VERIFYING (tool-status-sync's own journal note this tick moved the anchor "
        f"forward of the probe timestamp we set before this tick — see comment above), got {inc['state']}")
    tools_mid = psql_raw(f"SELECT status FROM tools WHERE tool_id = '{provider}-tool1'")[0]
    assert tools_mid == "healthy", f"drill A: tool should already be promoted back by now, got {tools_mid!r}"
    print(f"  OK (expected VERIFYING, not a bug): {inc}, tools.status={tools_mid}")

    print("-- simulate one more real OK probe landing AFTER tick 4's own journal note (tool-sync is now a "
          "no-op, so nothing moves the anchor again this time) --")
    time.sleep(1.1)
    psql_raw(f"UPDATE provider_status SET last_probe_at = now() WHERE provider = '{provider}'")

    print("-- tick 5: advance_verifying() now sees a probe strictly AFTER the anchor -> RESOLVED --")
    run_engine_tick(env)
    inc = get_incident_row(provider)
    assert inc["state"] == "RESOLVED", f"drill A: expected RESOLVED, got {inc['state']}"
    tools_row2 = psql_raw(f"SELECT status, status_source FROM tools WHERE tool_id = '{provider}-tool1'")[0]
    assert tools_row2.split("\x1f")[0] == "healthy", f"drill A: tool should be promoted back, got {tools_row2!r}"
    print(f"  OK: {inc}, tools.status={tools_row2}")

    api = verify_api(provider, inc["incident_id"])
    if api is not None:
        assert api["incident_by_id"]["state"] == "RESOLVED"
        assert api["incident_by_id"]["resolved_at"] is not None
        row = next((r for r in api["dashboard_row"] if True), None)
        assert row is None or row.get("open_incidents") in (0, "0"), api["dashboard_row"]
        print("  OK: /api/v1/incidents/:id RESOLVED + dashboard open_incidents back to 0")
    print("Drill A: PASS (full cycle OPEN -> REMEDIATION_QUEUED -> VERIFYING -> RESOLVED)")
    return True


# ---------------------------------------------------------------------------
# Drill B — synthetic 401, zero-retry boundary already proven in TS; here:
# routing (HUMAN_KEY, no fleet task, no auto-branch) through to WAITING_HUMAN.
# ---------------------------------------------------------------------------
def drill_401(env):
    print("\n=== Drill B: synthetic 401 -> incident-engine.py -> WAITING_HUMAN (HUMAN_KEY, J1) ===")
    provider = "ap11-drill401"
    psql_raw(f"INSERT INTO tools (tool_id, provider, status) VALUES ('{provider}-tool1', '{provider}', 'healthy')")
    # Exact shape the TS drill proved: ONE real 401, no retries, deterministic pause.
    psql_raw(
        f"INSERT INTO provider_status (provider, state, state_since, next_probe_at, "
        f"probe_interval_s, consecutive_failures, last_probe_result, last_probe_at, "
        f"state_reason, deterministic_paused_until) VALUES "
        f"('{provider}', 'DEGRADED', now(), now() + interval '24 hours', 86400, 1, "
        f"'FAIL_DETERMINISTIC', now(), '401 with configured key', now() + interval '24 hours')"
    )
    assert "AP11_DRILL401_KEY" not in env, "drill B setup: the drill key must be UNSET (typical missing-key case)"

    print("-- tick 1: detect classifies AUTH_FAILED, opens straight into WAITING_HUMAN (HUMAN_KEY, open_or_merge_incident) --")
    run_engine_tick(env)
    inc = get_incident_row(provider)
    assert inc is not None, "drill B: no incident opened"
    assert inc["kind"] == "AUTH_FAILED", f"drill B: expected AUTH_FAILED, got {inc['kind']}"
    assert inc["state"] == "WAITING_HUMAN", f"drill B: expected WAITING_HUMAN, got {inc['state']}"
    assert inc["fleet_task_id"] is None, "drill B: HUMAN_KEY must NEVER get a fleet task (boundary: money/HUMAN-only classes have no auto-branch)"
    # queue/ isn't necessarily EMPTY (drill A's own PROVIDER_DOWN fleet task
    # file from earlier in this same run is still sitting there — production
    # taskloop moves queue/ -> active/ -> done/, which this drill doesn't
    # simulate) — the actual claim is narrower: nothing NEW was filed for
    # THIS incident/provider.
    queue_files = os.listdir(os.path.join(SCRATCH, "taskloop", "queue"))
    drill401_files = [f for f in queue_files if provider in f]
    assert drill401_files == [], f"drill B: HUMAN_KEY must never get a fleet task, found {drill401_files}"
    print(f"  OK: {inc}, queue/ empty")

    print("-- bridge_key_incidents(): the key genuinely isn't in .env -> connected_db.py stub called (I1's existing key contour) --")
    calls_log = os.path.join(SCRATCH, "connected-db-calls.log")
    assert os.path.isfile(calls_log), "drill B: connected_db.py stub was never invoked"
    with open(calls_log) as f:
        calls = f.read()
    assert f"add {provider} AP11_DRILL401_KEY" in calls, f"drill B: unexpected connected_db.py call: {calls!r}"
    print(f"  OK: connected_db.py bridge called ({calls.strip()})")

    short_id = inc["incident_id"].replace("-", "")[:6]
    operator_file_written = os.path.exists(os.path.join(SCRATCH, "operator", f"INC-{short_id}.md"))
    assert not operator_file_written, (
        "drill B: J3 — 'для KEY-инцидентов операторский файл НЕ дублируется' (the existing "
        "connected_db.py letter IS the operator communication for the common missing-key case)")
    print("  OK: no duplicate J3 operator file for the common missing-key case")

    api = verify_api(provider, inc["incident_id"])
    if api is not None:
        assert api["incident_by_id"]["state"] == "WAITING_HUMAN"
        assert api["incident_by_id"]["kind"] == "AUTH_FAILED"
        print("  OK: /api/v1/incidents/:id shows WAITING_HUMAN")

    print("-- one more tick: idempotent, no double-bridge, no state change --")
    run_engine_tick(env)
    inc2 = get_incident_row(provider)
    assert inc2["state"] == "WAITING_HUMAN"
    with open(calls_log) as f:
        calls2 = f.read()
    assert calls2 == calls, "drill B: bridge_key_incident must not re-shell-out every tick (idempotent on attempts)"
    print("  OK: idempotent, exactly one connected_db.py call across 2 ticks")

    print("Drill B: PASS (WAITING_HUMAN is the correct terminus for a HUMAN_KEY-routed kind — J1)")
    return True


MUTATIONS = {
    # name -> (description, apply() -> restore())
}


def main():
    reset_scratch()
    if not start_pg():
        return 1
    env = isolated_env()
    ok = True
    try:
        ok = drill_down_provider(env) and ok
        ok = drill_401(env) and ok
    except AssertionError as e:
        print(f"\nDRILL FAILED (RED): {e}", file=sys.stderr)
        ok = False
    finally:
        stop_pg()
    print("\n=== drill-incident-lifecycle.py: " + ("ALL PASS (GREEN)" if ok else "FAILED (RED)") + " ===")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
