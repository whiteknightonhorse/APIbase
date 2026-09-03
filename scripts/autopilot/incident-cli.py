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
      RESOLVED — moves REMEDIATION_QUEUED -> VERIFYING. The engine closes
      it after a green re-probe (I4: "Prune only after the consumer").
      Refuses (exit 1) if the incident isn't in a state a fleet agent could
      legitimately be finishing work on.

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
