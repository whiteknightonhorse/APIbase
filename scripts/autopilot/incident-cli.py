#!/usr/bin/env python3
"""incident-cli.py — AP-4 (I4): the ONLY write handle for agents/other
scripts. A fleet agent must never write incidents.* directly (M: "агент
флота выходит за границы"); it calls this. Future producers (AP-5's
limits alert, AP-7's email intake, AP-8's tool-status job, the mcp-protocol-
tester) also go through here rather than each re-implementing dedup/enum
validation — see autopilot_common.py for why (I4, "обёртка над SQL с
валидацией enum'ов").

Commands:
  incident-cli.py open --kind K --provider P [--tool-id T] --detected-by D
                        --evidence '<json>' [--tool-count N] [--revenue-pct F]
                        [--what "..."] [--system-did "..."]
      Idempotent: merges into the existing open incident with the same
      dedup_key instead of erroring (I3). Prints "opened <id>" or
      "merged <id>" and exits 0.

  incident-cli.py note --id ID --actor A --action ACT --result "..."
      Appends one {ts, actor, action, result} entry to attempts. This is
      "что уже пробовали" (I2) — a fleet agent working a REMEDIATION_QUEUED
      incident calls this to record progress.

  incident-cli.py resolve-request --id ID --actor A --result "..."
      Fleet agent's ONLY path toward closing an incident. Does NOT set
      RESOLVED — and, as of T-09 ruling-1, does NOT itself set VERIFYING
      either when the incident has a fleet_task_id: this call happens
      INSIDE the fleet task's own run, before taskloop.sh's knowledge-gate
      check has decided whether that same task lands in done/ or stuck/.
      Trusting this self-report to flip the state let a task that later
      died in stuck/ leave its incident stranded in VERIFYING forever
      (nothing ever re-checked it). So for a fleet-owned incident this only
      records the note; the transition to VERIFYING happens exclusively in
      advance_remediation_queued() once it sees the REAL outcome in done/.
      For an incident with no fleet_task_id (I4's manual path: a human
      resolved an OPEN incident by hand before AP-6 existed) this remains
      the only way out of OPEN, so it still transitions straight to
      VERIFYING there. The engine closes VERIFYING after a green re-probe
      (I4: "Prune only after the consumer"). Refuses (exit 1) if the
      incident isn't in a state a fleet agent could legitimately be
      finishing work on.

  incident-cli.py list [--state S] [--severity S] [--provider P]
      Read-only, tab-separated.

  incident-cli.py --selftest
      Pure-logic checks (enum validation, dedup_key shape, SQL-literal
      escaping). No DB needed — see incident-engine.py --selftest-db for the
      3-world lifecycle test that DOES need a (disposable) Postgres.
"""
import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autopilot_common as ap  # noqa: E402


def cmd_open(a):
    try:
        evidence = json.loads(a.evidence) if a.evidence else {}
    except json.JSONDecodeError as e:
        print(f"--evidence must be valid JSON: {e}", file=sys.stderr)
        return 2
    ok, missing = ap.schema_present()
    if not ok:
        print(f"NOINFO: autopilot schema not deployed yet (missing: {missing})", file=sys.stderr)
        return 3
    try:
        incident_id, created = ap.open_or_merge_incident(
            kind=a.kind, provider=a.provider, evidence=evidence, detected_by=a.detected_by,
            tool_id=a.tool_id, tool_count=a.tool_count, revenue_pct=a.revenue_pct,
            what=a.what, system_did=a.system_did, docs_url=a.docs_url,
            actor=a.actor or "incident-cli",
        )
    except AssertionError as e:
        print(f"invalid input: {e}", file=sys.stderr)
        return 2
    except RuntimeError as e:
        print(f"DB write failed: {e}", file=sys.stderr)
        return 1
    print(f"{'opened' if created else 'merged'} {incident_id}")
    return 0


def cmd_note(a):
    try:
        ap.note_incident(a.id, a.actor, a.action, a.result)
    except RuntimeError as e:
        print(f"DB write failed: {e}", file=sys.stderr)
        return 1
    print(f"noted {a.id}")
    return 0


def cmd_resolve_request(a):
    inc = ap.get_incident(a.id)
    if inc is None:
        print(f"no such incident: {a.id}", file=sys.stderr)
        return 1
    # I4: a fleet agent may request verification from REMEDIATION_QUEUED (the
    # normal "I did the fix" case) or from OPEN (an AUTO-classified incident
    # someone worked by hand before AP-6 existed — still a legitimate path,
    # not a state a fleet agent can invent its way INTO, only finish FROM).
    if inc["state"] not in ("REMEDIATION_QUEUED", "OPEN"):
        print(f"refusing: incident {a.id} is in state {inc['state']}, not something "
              f"a fleet agent's resolve-request can act on", file=sys.stderr)
        return 1
    ap.note_incident(a.id, a.actor, "resolve-request", a.result)
    if inc["fleet_task_id"]:
        # T-09 ruling-1: this call runs INSIDE the fleet task, before
        # taskloop.sh's own knowledge-gate check has run -- the task can
        # still die into stuck/ after this returns, self-reporting "done"
        # that never actually completed. The only place allowed to move a
        # fleet-owned incident into VERIFYING is advance_remediation_queued(),
        # reading the REAL outcome (done/ vs stuck/) taskloop.sh produces.
        print(f"{a.id}: note recorded, state unchanged ({inc['state']}) — "
              f"engine will transition once it sees this fleet task's real outcome in done/")
        return 0
    # No fleet_task_id: I4's manual path (a human resolved an OPEN incident
    # by hand before AP-6 existed) -- nothing else watches this incident, so
    # resolve-request is the only way it ever leaves OPEN.
    ap.transition_state(a.id, "VERIFYING")
    print(f"{a.id} -> VERIFYING (engine will confirm on next tick's re-probe)")
    return 0


def cmd_list(a):
    where = []
    if a.state:
        where.append(f"state = {ap.sql_literal(a.state)}")
    if a.severity:
        where.append(f"severity = {ap.sql_literal(a.severity)}")
    if a.provider:
        where.append(f"provider = {ap.sql_literal(a.provider)}")
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    out, rc = ap.psql(
        f"SELECT incident_id, kind, severity, state, provider, created_at "
        f"FROM incidents {clause} ORDER BY created_at DESC LIMIT 200"
    )
    if rc != 0:
        print(f"query failed: {out}", file=sys.stderr)
        return 1
    if not out:
        print("(no incidents match)")
        return 0
    for line in out.splitlines():
        print(line.replace(ap.SEP, "\t"))
    return 0


def selftest():
    # dedup_key shape
    assert ap.dedup_key("PROVIDER_DOWN", "openweathermap") == "PROVIDER_DOWN:openweathermap"
    assert ap.dedup_key("AUTH_FAILED", "x", "tool.y") == "AUTH_FAILED:x:tool.y"
    # every kind classified, no silent gaps
    assert set(ap.ROUTE_CLASS) == ap.KINDS
    # closed HUMAN-ONLY list per J1 — payment is never AUTO, by construction
    assert ap.ROUTE_CLASS["PAYMENT_REQUIRED"] == "HUMAN_ONLY"
    assert "PAYMENT_REQUIRED" not in (k for k, v in ap.ROUTE_CLASS.items() if v in ("AUTO", "AUTO_NO_MODEL"))
    # AP-6: test on ABSENCE against the SHIPPED config/autopilot/routing.json
    # file directly (raw JSON, bypassing ap.ROUTE_CLASS's own loader/guard) —
    # proves the artifact itself is safe, not just the code that reads it.
    _raw_routing = json.loads(open(ap.ROUTING_PATH, encoding="utf-8").read())
    _raw_routing = {k: v for k, v in _raw_routing.items() if not k.startswith("_")}
    assert "PAYMENT_REQUIRED" in _raw_routing
    assert _raw_routing["PAYMENT_REQUIRED"]["route_class"] not in ("AUTO", "AUTO_NO_MODEL")
    assert not any(v.get("route_class") in ("AUTO", "AUTO_NO_MODEL") and k == "PAYMENT_REQUIRED"
                   for k, v in _raw_routing.items())
    assert set(_raw_routing) == ap.KINDS, "routing.json on disk must cover every incident kind"
    # sql_literal escaping
    assert ap.sql_literal("it's") == "'it''s'"
    assert ap.sql_literal(None) == "NULL"
    # severity: PAYMENT_REQUIRED always SEV1, unmeasured PROVIDER_DOWN is SEV2 not SEV1
    assert ap.classify_severity("PAYMENT_REQUIRED") == "SEV1"
    assert ap.classify_severity("PROVIDER_DOWN", tool_count=None, revenue_pct=None) == "SEV2"
    assert ap.classify_severity("PROVIDER_DOWN", tool_count=11, revenue_pct=None) == "SEV1"
    # J2 message shape (exact fields present, human-only line included for HUMAN classes)
    msg = ap.format_tg_message({
        "incident_id": "a1b2c3d4-0000-0000-0000-000000000000", "kind": "PAYMENT_REQUIRED",
        "severity": "SEV1", "provider": "openweathermap", "state": "WAITING_HUMAN",
        "evidence": {}, "created_at": "2026-09-03 06:40 UTC", "tool_count": 11,
        "revenue_pct": 4.2, "what": "quota исчерпана, тариф требует оплаты",
        "system_did": "снизила probe до emergency",
    })
    assert "SEV1 INC-a1b2c3 PAYMENT_REQUIRED" in msg
    assert "Нужно от вас:" in msg and "После вас:" in msg
    assert "Почему не сама:" in msg
    # AUTO-classified incident's message admits AP-6 is missing, doesn't fake a queued task
    msg2 = ap.format_tg_message({
        "incident_id": "deadbeef-0000-0000-0000-000000000000", "kind": "PROVIDER_DOWN",
        "severity": "SEV2", "provider": "x", "state": "OPEN", "evidence": {},
    })
    assert "AP-6" in msg2 and "Нужно от вас" not in msg2
    # human-done parsing: marker required, empty-after-marker is "not filled yet"
    assert ap.parse_human_done("/nonexistent/path") is None
    # T-07/A5 (Fable ruling-1): DAILY_TASK_CAP is derived from taskloop's own
    # DAILY_CAP (config.env), not a bare literal — floor(cap*0.25/4), clamped
    # [3, 12]. A temp config.env per case, never the real one (LAW: this is a
    # pure-logic selftest, no fleet state touched).
    import tempfile as _tempfile
    def _cfg(content):
        fd, p = _tempfile.mkstemp(suffix=".cfg")
        with os.fdopen(fd, "w") as f:
            f.write(content)
        return p
    _p15 = _cfg("DAILY_CAP=15\n")
    _p300 = _cfg("DAILY_CAP=300\n")
    try:
        assert ap._compute_daily_task_cap(_p15) == 3, "DAILY_CAP=15 must floor to the 3 minimum"
        assert ap._compute_daily_task_cap(_p300) == 12, "DAILY_CAP=300 must ceiling-clamp to 12"
        assert ap._compute_daily_task_cap("/nonexistent/config-missing") == 3, \
            "missing config.env must fail CLOSED to the floor, never an open/unbounded guess"
    finally:
        os.unlink(_p15)
        os.unlink(_p300)

    # T-07/A7: notice_dedup — same (incident, reason) suppressed within the
    # interval, a DIFFERENT reason for the same incident fires immediately,
    # and the interval elapsing lets the SAME reason fire again.
    import tempfile as _tempfile2
    _orig_notices_log, _orig_dedup_file = ap.NOTICES_LOG, ap.NOTICE_DEDUP_FILE
    _log_fd, _log_path = _tempfile2.mkstemp(suffix=".log")
    os.close(_log_fd)
    os.unlink(_log_path)  # notice() creates it fresh — proves it isn't relying on pre-existence
    _dedup_fd, _dedup_path = _tempfile2.mkstemp(suffix=".json")
    os.close(_dedup_fd)
    os.unlink(_dedup_path)

    def _log_line_count():
        return len(open(ap.NOTICES_LOG, encoding="utf-8").read().splitlines()) if os.path.exists(ap.NOTICES_LOG) else 0

    try:
        ap.NOTICES_LOG = _log_path
        ap.NOTICE_DEDUP_FILE = _dedup_path
        ap.notice_dedup("inc-1", "I1_AGE_GATE", "first sighting")
        assert _log_line_count() == 1, "first sighting of a (incident, reason) pair must always fire"
        ap.notice_dedup("inc-1", "I1_AGE_GATE", "same reason, next tick")
        assert _log_line_count() == 1, "same reason within the interval must be suppressed, not repeated"
        ap.notice_dedup("inc-1", "DAILY_CAP", "different reason, same incident")
        assert _log_line_count() == 2, "a DIFFERENT reason for the same incident is new information, must fire"
        ap.notice_dedup("inc-1", "DAILY_CAP", "same reason again, still within interval")
        assert _log_line_count() == 2, "still the same reason, still within the interval -> still suppressed"
        # simulate the interval having elapsed by backdating the stored last_ts
        _state = json.loads(open(_dedup_path, encoding="utf-8").read())
        _backdated = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        _state["inc-1"]["last_ts"] = _backdated
        with open(_dedup_path, "w", encoding="utf-8") as f:
            json.dump(_state, f)
        ap.notice_dedup("inc-1", "DAILY_CAP", "same reason, interval elapsed")
        assert _log_line_count() == 3, "same reason but the interval elapsed -> must fire again, not stay suppressed forever"
    finally:
        ap.NOTICES_LOG, ap.NOTICE_DEDUP_FILE = _orig_notices_log, _orig_dedup_file
        for _p in (_log_path, _dedup_path):
            if os.path.exists(_p):
                os.unlink(_p)

    print("incident-cli --selftest: OK")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--selftest", action="store_true")
    sub = p.add_subparsers(dest="cmd")

    po = sub.add_parser("open")
    po.add_argument("--kind", required=True, choices=sorted(ap.KINDS))
    po.add_argument("--provider", required=True)
    po.add_argument("--tool-id", default=None)
    po.add_argument("--detected-by", required=True, choices=sorted(ap.DETECTED_BY))
    po.add_argument("--evidence", default="{}")
    po.add_argument("--tool-count", type=int, default=None)
    po.add_argument("--revenue-pct", type=float, default=None)
    po.add_argument("--what", default=None)
    po.add_argument("--system-did", default=None)
    po.add_argument("--docs-url", default=None)
    po.add_argument("--actor", default=None)
    po.set_defaults(func=cmd_open)

    pn = sub.add_parser("note")
    pn.add_argument("--id", required=True)
    pn.add_argument("--actor", required=True)
    pn.add_argument("--action", required=True)
    pn.add_argument("--result", required=True)
    pn.set_defaults(func=cmd_note)

    pr = sub.add_parser("resolve-request")
    pr.add_argument("--id", required=True)
    pr.add_argument("--actor", required=True)
    pr.add_argument("--result", required=True)
    pr.set_defaults(func=cmd_resolve_request)

    pl = sub.add_parser("list")
    pl.add_argument("--state", default=None)
    pl.add_argument("--severity", default=None)
    pl.add_argument("--provider", default=None)
    pl.set_defaults(func=cmd_list)

    args = p.parse_args()
    if args.selftest:
        selftest()
        return 0
    if not getattr(args, "func", None):
        p.print_help()
        return 2
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
