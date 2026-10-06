#!/usr/bin/env python3
"""incident-cli.py — AP-4 (I4): the ONLY write handle for agents/other
scripts. A fleet agent must never write incidents.* directly (M: "a fleet
agent oversteps its bounds"); it calls this. Future producers (AP-5's
limits alert, AP-7's email intake, AP-8's tool-status job, the mcp-protocol-
tester) also go through here rather than each re-implementing dedup/enum
validation — see autopilot_common.py for why (I4, "a wrapper over SQL with
enum validation").

Commands:
  incident-cli.py open --kind K --provider P [--tool-id T] --detected-by D
                        --evidence '<json>' [--tool-count N] [--revenue-pct F]
                        [--what "..."] [--system-did "..."]
      Idempotent: merges into the existing open incident with the same
      dedup_key instead of erroring (I3). Prints "opened <id>" or
      "merged <id>" and exits 0.

  incident-cli.py note --id ID --actor A --action ACT --result "..."
      Appends one {ts, actor, action, result} entry to attempts. This is
      "what was already tried" (I2) — a fleet agent working a REMEDIATION_QUEUED
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
      resolved an OPEN or, as of T-0108, WAITING_HUMAN incident by hand)
      this remains the only way out of that state, so it still transitions
      straight to VERIFYING there. The engine closes VERIFYING after a
      green re-probe (I4: "Prune only after the consumer"). Refuses (exit
      1) if the incident isn't in a state a fleet agent could legitimately
      be finishing work on.
      T-0108 (2026-09-08): WAITING_HUMAN added because a HUMAN_KEY incident
      whose bridge_key_incident() already ran once (idempotent guard,
      autopilot_common.py) never gets a generic operator_file and is
      therefore permanently invisible to incident-engine.py's
      advance_waiting_human() human-done watcher (that gate is `route in
      OPERATOR_FILE_ROUTE_CLASSES or operator_file`, neither true here) —
      without this, such an incident (measured live: INC-fdac7d) had NO
      path out of WAITING_HUMAN at all, ever, even after the operator
      answered. Same manual "a human resolved it by hand" story as OPEN,
      reused rather than duplicated (LAW #ONE-PLACE).

  incident-cli.py wait --id ID --actor A --until <ISO-8601 UTC> --reason "..."
      T-0263 (REMEDIATION-MODEL-1005 ruling-1): the ONLY legitimate "waiting for
      the provider". From REMEDIATION_QUEUED or OPEN only; --until must be within
      [now+1h, now+72h] (else exit 1, no write). One UPDATE: next_recheck_at,
      attempts entry action="wait" result="until <ISO>: <reason>", state ->
      VERIFYING. advance_verifying() then leaves the incident alone until the
      deadline; after it, OK -> RESOLVED, FAIL -> one auto-extension of 24h
      (total of 2 `wait` entries), then STUCK.

  incident-cli.py propose-fix --id ID --actor A --cause "..." --repro "<cmd>" --paths P[,P]
                              --fix "..." --proof <abs path>
      T-0265 (REMEDIATION-MODEL-1005 ruling-1): phase A's (haiku) only way to ask for code work.
      From REMEDIATION_QUEUED only. Every --paths entry must lie under REMEDIATION_PATH_ALLOWLIST
      (== REVIEW_TIER_ALLOWLIST, read from taskloop's config at call time), else rc=1 "path
      outside remediation allowlist, open BLOCKED instead". Writes ONE note action="propose-fix"
      result=JSON {cause, repro, paths, fix, proof}; state unchanged. incident-engine's
      advance_remediation_queued() files the single phase-B (sonnet) task from the LAST such note
      once the phase-A task lands in done/. No propose-fix (wait / BLOCKED) -> no phase B.

  incident-cli.py list [--state S] [--severity S] [--provider P]
      Read-only, tab-separated.

  incident-cli.py show ID
      Read-only, full incident as JSON (unlike `list`'s summary row, this
      includes the full `attempts` array). T-11: build_operator_file /
      build_remediation_task_body / build_human_followup_task_body now embed
      only the last 20 attempts (autopilot_common._attempts_md) and point
      here for the rest — this command is what makes that pointer real.

  incident-cli.py reopen --id ID --actor A --result "..."
      T-11: hands a STUCK incident back to AP-6's route_auto_incidents() by
      setting state=OPEN and clearing fleet_task_id (that function's own
      WHERE clause is `state = 'OPEN' AND fleet_task_id IS NULL` — nothing
      else in this file produces that pair; `resolve-request` both refuses
      STUCK outright and, on its no-fleet_task_id path, lands on VERIFYING,
      not OPEN). Added because none of the pre-existing verbs did this and
      I4 makes this file the ONLY write handle — no caller may UPDATE
      incidents.* directly, including to annul a poisoned fleet task's own
      incident. Refuses (exit 1) outside STUCK: reopening a live incident
      out from under whatever state machine already owns it is not this
      command's job.

  incident-cli.py retire --id ID --actor A --reason "..."
      T-0152a (ruling-1 on 0152-gdelt-deprecation-assess-and-plan, Answer 2):
      the only path that moves an incident to RESOLVED from ANY non-RESOLVED
      state, including STUCK — deliberately wider than `resolve-request`
      (OPEN/REMEDIATION_QUEUED/WAITING_HUMAN only), because the whole point
      is closing STUCK incidents belonging to a provider that will never
      probe green again on its own. Guarded: refuses (exit 1, no write at
      all) unless provider-limits.json marks the incident's provider
      `retired` — without that guard this would be a general, ungated STUCK
      escape hatch for ANY incident, which is exactly the hole I3/I4 exist to
      close. Records a `retire` attempts entry (via note_incident) before
      transitioning, same order as resolve-request. Does not introduce a new
      `incidents_state_check` value — "closed because the provider was
      retired" lives entirely in RESOLVED + the attempts text.

  incident-cli.py close --id ID --actor A --reason "..."
                        (--superseded-by INCIDENT_ID | --provider-healthy)
      T-0235 (ruling HUMAN-CLOSE-STUCK-0929, "Task 0234 spec"): the operator's
      exit for a STUCK incident that is neither worth reopening nor tied to a
      retired provider. Exists because the runbook's old "resolve-request"
      exit for STUCK never existed in code (resolve-request refuses STUCK
      since T-11). STUCK-only; refuses (exit 1, no write at all) unless the
      code itself verifies exactly one ground against the engine's own tables:
        --superseded-by ID   ID exists, is a different incident of the SAME
                             provider, and is live (OPEN/REMEDIATION_QUEUED/
                             WAITING_HUMAN/VERIFYING) -- a STUCK/RESOLVED target
                             cannot launder a live one.
        --provider-healthy   provider_status is HEALTHY, last_probe_result OK
                             and last_probe_at is newer than the ts of the
                             newest incident-engine fleet-stuck/verify-failed
                             attempts entry (no such entry = NOINFO = refuse).
      Records `close` (and, for superseded-by, `absorbs` on the target) notes
      before transitioning to RESOLVED, same order as retire. Operator/
      dispatcher tool: fleet executors are not pointed at it.

  incident-cli.py --selftest
      Pure-logic checks (enum validation, dedup_key shape, SQL-literal
      escaping, and — T-0152a — the `retire` guard exercised in-process
      against fake incident/DB functions). No DB needed — see
      incident-engine.py --selftest-db for the 3-world lifecycle test that
      DOES need a (disposable) Postgres.
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
    # T-0108 (2026-09-08): also from WAITING_HUMAN — see this file's module
    # docstring for why (INC-fdac7d had no other way out).
    if inc["state"] not in ("REMEDIATION_QUEUED", "OPEN", "WAITING_HUMAN"):
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
    # by hand before AP-6 existed, or — T-0108 — a WAITING_HUMAN incident a
    # normal automated route can never pick back up) -- nothing else watches
    # this incident, so resolve-request is the only way it ever leaves
    # that state.
    ap.transition_state(a.id, "VERIFYING")
    print(f"{a.id} -> VERIFYING (engine will confirm on next tick's re-probe)")
    return 0


def cmd_retire(a):
    """T-0152a: RESOLVE an incident because its provider was retired, from
    ANY non-RESOLVED state (including STUCK — see module docstring). Guard
    lives in the middle `if`: refuses unless provider-limits.json marks
    `inc["provider"]` retired, using the SAME cached loader
    (`ap._provider_limits()`) incident-engine.py's detect skip and
    connected_db.py's other provider-limits.json readers already use — no
    second loader to keep in sync (autopilot_common.py's own module
    docstring: this file is safe to read directly, tracked, not a secret)."""
    inc = ap.get_incident(a.id)
    if inc is None:
        print(f"no such incident: {a.id}", file=sys.stderr)
        return 1
    if inc["state"] == "RESOLVED":
        print(f"refusing: incident {a.id} is already RESOLVED", file=sys.stderr)
        return 1
    if not ap._provider_limits().get(inc["provider"], {}).get("retired"):
        print(
            f"refusing: provider {inc['provider']!r} is not marked `retired` in "
            f"provider-limits.json — retire only closes incidents for a provider the "
            f"operator has actually retired, never a general STUCK escape hatch",
            file=sys.stderr,
        )
        return 1
    ap.note_incident(a.id, a.actor, "retire", a.reason)
    ap.transition_state(a.id, "RESOLVED", extra_set=", next_recheck_at = NULL")
    print(f"{a.id} -> RESOLVED (provider {inc['provider']} retired)")
    return 0


WAIT_MIN = timedelta(hours=1)
WAIT_MAX = timedelta(hours=72)
WAIT_FROM_STATES = ("REMEDIATION_QUEUED", "OPEN")

# T-0265: sha256 of the API_CHANGED task body (fix.md bullets pinned, filename-derived id masked) as
# generated BEFORE the two-phase split -- single-phase kinds must stay byte-identical. Re-pinned by
# ENGLISH-ONLY-B (language-only change of the body text, same structure).
API_CHANGED_BODY_SHA256 = "91735f023354e3a88eeeea657728421cd52505cccc33943ac0203df4d39e10db"


def parse_wait_until(raw, now=None):
    """Returns (utc_datetime, None) or (None, error_text). Pure: the 1h/72h
    window and the UTC requirement live here so --selftest can hit them."""
    now = now or datetime.now(timezone.utc)
    try:
        s = raw.strip()
        dt = datetime.fromisoformat(s[:-1] + "+00:00" if s.endswith(("Z", "z")) else s)
    except (ValueError, AttributeError):
        return None, f"--until {raw!r} is not an ISO-8601 timestamp (e.g. 2026-10-07T12:00:00Z)"
    if dt.tzinfo is None:
        return None, f"--until {raw!r} has no timezone; give UTC explicitly (trailing Z or +00:00)"
    dt = dt.astimezone(timezone.utc)
    if dt < now + WAIT_MIN:
        return None, f"--until {raw} is sooner than now+1h ({(now + WAIT_MIN).strftime('%Y-%m-%dT%H:%M:%SZ')}): a wait is 1-72h"
    if dt > now + WAIT_MAX:
        return None, f"--until {raw} is later than now+72h ({(now + WAIT_MAX).strftime('%Y-%m-%dT%H:%M:%SZ')}): a wait is 1-72h"
    return dt, None


def cmd_wait(a):
    """T-0263: see module docstring. Every refusal returns 1 with zero writes."""
    until, err = parse_wait_until(a.until)
    if err:
        return _refuse(err)
    inc = ap.get_incident(a.id)
    if inc is None:
        print(f"no such incident: {a.id}", file=sys.stderr)
        return 1
    if inc["state"] not in WAIT_FROM_STATES:
        return _refuse(f"incident {a.id} is in state {inc['state']}; wait is only allowed from "
                       f"{'/'.join(WAIT_FROM_STATES)}")
    until_iso = until.strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        done = ap.wait_incident(a.id, a.actor, until_iso, f"until {until_iso}: {a.reason}", WAIT_FROM_STATES)
    except RuntimeError as e:
        print(f"DB write failed: {e}", file=sys.stderr)
        return 1
    if not done:
        return _refuse(f"incident {a.id} changed state concurrently; nothing written")
    print(f"{a.id} -> VERIFYING, waiting until {until_iso} (engine will not touch it before then)")
    return 0


def cmd_propose_fix(a):
    """T-0265: phase A's evidence-backed proposal. Validates --paths against the remediation
    allowlist (REVIEW_TIER_ALLOWLIST read from taskloop's own config, never restated here), then
    ONE note action="propose-fix". State is NOT changed. Every refusal returns 1 with zero writes."""
    inc = ap.get_incident(a.id)
    if inc is None:
        print(f"no such incident: {a.id}", file=sys.stderr)
        return 1
    if inc["state"] != "REMEDIATION_QUEUED":
        return _refuse(f"incident {a.id} is in state {inc['state']}; propose-fix is only allowed "
                       f"from REMEDIATION_QUEUED")
    paths = [x.strip() for x in a.paths.split(",") if x.strip()]
    if not paths:
        return _refuse("--paths is empty")
    allowlist = ap.remediation_path_allowlist()
    for pth in paths:
        if ap.path_outside_allowlist(pth, allowlist):
            return _refuse(f"path outside remediation allowlist, open BLOCKED instead: {pth}")
    for name in ("cause", "repro", "fix"):
        if not getattr(a, name).strip():
            return _refuse(f"--{name} is empty")
    if not os.path.isabs(a.proof):
        return _refuse("--proof must be an absolute path")
    result = json.dumps({"cause": a.cause, "repro": a.repro, "paths": paths, "fix": a.fix,
                         "proof": a.proof}, ensure_ascii=False)
    try:
        ap.note_incident(a.id, a.actor, "propose-fix", result)
    except RuntimeError as e:
        print(f"DB write failed: {e}", file=sys.stderr)
        return 1
    print(f"proposed fix noted for {a.id} (state unchanged; engine files phase B after this task lands in done/)")
    return 0


LIVE_TARGET_STATES = ("OPEN", "REMEDIATION_QUEUED", "WAITING_HUMAN", "VERIFYING")


def _refuse(msg):
    print(f"refusing: {msg}", file=sys.stderr)
    return 1


def cmd_close(a):
    """T-0235: RESOLVE a STUCK incident on a code-verified ground (see module
    docstring). Every refusal returns 1 before any note/transition is written."""
    inc = ap.get_incident(a.id)
    if inc is None:
        print(f"no such incident: {a.id}", file=sys.stderr)
        return 1
    if inc["state"] != "STUCK":
        return _refuse(f"incident {a.id} is in state {inc['state']}, not STUCK -- close only "
                       f"closes a STUCK incident on a verified ground")
    if a.superseded_by:
        if a.superseded_by == a.id:
            return _refuse("--superseded-by names the incident itself")
        tgt = ap.get_incident(a.superseded_by)
        if tgt is None:
            return _refuse(f"superseding incident {a.superseded_by} does not exist")
        if tgt["incident_id"] == inc["incident_id"]:
            return _refuse("--superseded-by resolves to the incident itself")
        if tgt["provider"] != inc["provider"]:
            return _refuse(f"superseding incident is provider {tgt['provider']!r}, "
                           f"not {inc['provider']!r}")
        if tgt["state"] not in LIVE_TARGET_STATES:
            return _refuse(f"superseding incident {a.superseded_by} is {tgt['state']}, not live "
                           f"({'/'.join(LIVE_TARGET_STATES)})")
        ap.note_incident(a.id, a.actor, "close",
                         f"superseded by {tgt['incident_id']} ({tgt['kind']}/{tgt['state']}): {a.reason}")
        ap.note_incident(tgt["incident_id"], a.actor, "absorbs",
                         f"INC-{inc['incident_id'][:6]} ({inc['kind']}) closed as superseded: {a.reason}")
        ap.transition_state(a.id, "RESOLVED")
        print(f"{a.id} -> RESOLVED (superseded by {tgt['incident_id']})")
        return 0

    anchor = None
    for e in reversed(inc["attempts"]):
        if e.get("actor") == "incident-engine" and e.get("action") in ("fleet-stuck", "verify-failed"):
            anchor = e.get("ts")
            break
    if not anchor:
        return _refuse(f"incident {a.id} has no incident-engine fleet-stuck/verify-failed "
                       f"attempts entry to anchor on (NOINFO is not evidence)")
    out, rc = ap.psql(
        f"SELECT state, COALESCE(last_probe_result, ''), COALESCE(last_probe_at::text, ''), "
        f"COALESCE(last_probe_at > {ap.sql_literal(anchor)}::timestamptz, false) "
        f"FROM provider_status WHERE provider = {ap.sql_literal(inc['provider'])}"
    )
    if rc != 0:
        return _refuse(f"provider_status query failed: {out}")
    if not out:
        return _refuse(f"no provider_status row for {inc['provider']!r}")
    state, result, probe_at, newer = (out.split(ap.SEP) + ["", "", "", ""])[:4]
    failed = []
    if state != "HEALTHY":
        failed.append(f"state is {state}, not HEALTHY")
    if result != "OK":
        failed.append(f"last_probe_result is {result or 'NULL'}, not OK")
    if newer not in ("t", "true", "True"):
        failed.append(f"last_probe_at {probe_at or 'NULL'} is not after STUCK anchor {anchor}")
    if failed:
        return _refuse(f"provider {inc['provider']!r} not verified healthy: " + "; ".join(failed))
    ap.note_incident(a.id, a.actor, "close",
                     f"provider HEALTHY, probe {probe_at} after STUCK at {anchor}: {a.reason}")
    ap.transition_state(a.id, "RESOLVED")
    print(f"{a.id} -> RESOLVED (provider {inc['provider']} HEALTHY, probe after STUCK)")
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


def cmd_show(a):
    inc = ap.get_incident(a.id)
    if inc is None:
        print(f"no such incident: {a.id}", file=sys.stderr)
        return 1
    print(json.dumps(inc, ensure_ascii=False, indent=2))
    return 0


def cmd_reopen(a):
    inc = ap.get_incident(a.id)
    if inc is None:
        print(f"no such incident: {a.id}", file=sys.stderr)
        return 1
    if inc["state"] != "STUCK":
        print(f"refusing: incident {a.id} is in state {inc['state']}, not STUCK — reopen only "
              f"hands a STUCK incident back to AP-6's route_auto_incidents()", file=sys.stderr)
        return 1
    ap.note_incident(a.id, a.actor, "reopen", a.result)
    ap.transition_state(a.id, "OPEN", extra_set=", fleet_task_id = NULL")
    print(f"{a.id} -> OPEN, fleet_task_id cleared — AP-6 will file a fresh fleet task next tick")
    return 0


def selftest():
    # dedup_key shape
    assert ap.dedup_key("PROVIDER_DOWN", "openweathermap") == "PROVIDER_DOWN:openweathermap"
    assert ap.dedup_key("AUTH_FAILED", "x", "tool.y") == "AUTH_FAILED:x:tool.y"
    # T-0140 Ch-3 (2026-09-21, Fable ruling-1): the opus tier is wired for exactly the kinds the
    # ruling named — read-only diagnosis (PROVIDER_DOWN/DEGRADED_QUALITY) and narrow adapter/
    # probe-config edits (API_CHANGED/ENDPOINT_CHANGED) — and EMAIL_NOTICE stays on fable
    # unconditionally (untrusted inbound text that can claim a price/ToS change is money-and-
    # public-claims-shaped, never the cheap tier's job). Locks the routing.json values in code,
    # not just prose, so a future edit that silently reverts one kind fails THIS assertion.
    for _k in ("PROVIDER_DOWN", "API_CHANGED", "ENDPOINT_CHANGED", "DEGRADED_QUALITY"):
        assert ap.REVIEW_FOR_KIND[_k] == "opus", f"{_k} must route to the opus tier (T-0140 Ch-3)"
    assert ap.REVIEW_FOR_KIND["EMAIL_NOTICE"] == "fable", \
        "EMAIL_NOTICE must stay on fable unconditionally (T-0140 Ch-3: untrusted inbound text)"
    # build_remediation_task_body's own MAX_ATTEMPTS must give review=opus the SAME ceiling as
    # review=fable (ruling-1: "the REJECT cycle exists for this tier too") -- checked on the actual generated
    # task body, not just the formula, so a refactor that forgets the "opus" branch is caught.
    _opus_incident = {
        "kind": "PROVIDER_DOWN", "provider": "__t0140_selftest_provider__", "severity": "SEV3",
        "incident_id": "00000000-0000-0000-0000-00000000t140", "evidence": {}, "attempts": [],
    }
    _fname, _content = ap.build_remediation_task_body(_opus_incident)
    assert "REVIEW: opus" in _content, "PROVIDER_DOWN task body must carry REVIEW: opus"
    # T-0265: PROVIDER_DOWN is now a phase-A (haiku, measure-only) task: MAX_ATTEMPTS 2, REVIEW as routed.
    assert "MAX_ATTEMPTS: 2" in _content and "MODEL: haiku" in _content, "phase A: haiku, 2 attempts (T-0265)"
    assert "ALLOWED:" not in _content, "phase A body must carry no fix.md ALLOWED bullets (T-0265)"
    assert "propose-fix" in _content and "incident-cli.py wait" in _content and "VERDICT: BLOCKED" in _content
    assert "\u0447\u0438\u043d\u0438\u0442\u044c" not in _content and "\u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0438\u0442\u044c \u0444\u0438\u043a\u0441" not in _content  # legacy Russian "fix" / "propose a fix" phrases must be absent
    for _pa in sorted(ap.PHASE_A_KINDS):
        _pf, _pc = ap.build_remediation_task_body(dict(_opus_incident, kind=_pa))
        assert "ALLOWED:" not in _pc and "propose-fix" in _pc and "MAX_ATTEMPTS: 2" in _pc and "MODEL: haiku" in _pc, _pa
        assert _pf.startswith(tuple("9")) and "-autopilot-remediation-" in _pf, _pf
    # review=opus ceiling (T-0140 Ch-3) is now checked on a single-phase opus kind.
    _api_incident = dict(_opus_incident, kind="API_CHANGED")
    _fname_api, _content_api = ap.build_remediation_task_body(_api_incident)
    assert "REVIEW: opus" in _content_api
    assert "MAX_ATTEMPTS: 4" in _content_api, "review=opus must get the same MAX_ATTEMPTS: 4 ceiling as review=fable (T-0140 Ch-3)"
    # T-0265 snapshot: single-phase kinds are byte-identical to before (fix.md text pinned, filename-derived id masked).
    import hashlib as _hl
    import argparse as _argparse
    _orig_fb = ap._fix_boundaries
    ap._fix_boundaries = lambda: "- ALLOWED: x\n- FORBIDDEN: y"
    try:
        _fn_s, _c_s = ap.build_remediation_task_body(dict(_api_incident, provider="__t0265_snapshot__",
                          incident_id="00000000-0000-0000-0000-00000000t265", evidence={"probe": "401"}))
    finally:
        ap._fix_boundaries = _orig_fb
    _c_s = _c_s.replace(_fn_s[:-3], "<TID>")
    assert _hl.sha256(_c_s.encode()).hexdigest() == API_CHANGED_BODY_SHA256, \
        "API_CHANGED task body changed (T-0265 must leave single-phase kinds untouched)"
    # propose-fix allowlist (path outside -> rc=1, zero writes). Allowlist is read from a fixture file.
    import tempfile as _tf
    with _tf.TemporaryDirectory() as _d:
        _cfgp = os.path.join(_d, "config.env")
        open(_cfgp, "w").write("X=1\nREVIEW_TIER_ALLOWLIST=src/adapters/,tests/unit/adapters/,src/config/provider-limits.json\n")
        _al = ap.remediation_path_allowlist(_cfgp)
        assert _al == ["src/adapters/", "tests/unit/adapters/", "src/config/provider-limits.json"], _al
        assert ap.remediation_path_allowlist(os.path.join(_d, "missing")) == [], "fail closed"
        for _ok in ("src/adapters/foo/x.ts", "src/config/provider-limits.json"):
            assert not ap.path_outside_allowlist(_ok, _al), _ok
        for _bad in ("docker-compose.yml", ".env", "src/adapters/../../.env", "/src/adapters/x", "../src/adapters/x", "", "src/other/x.ts"):
            assert ap.path_outside_allowlist(_bad, _al), _bad
    _pf_calls = []
    _orig_gi, _orig_ni, _orig_al = ap.get_incident, ap.note_incident, ap.remediation_path_allowlist
    try:
        ap.get_incident = lambda iid: {"incident_id": iid, "state": "REMEDIATION_QUEUED"}
        ap.note_incident = lambda *args: _pf_calls.append(args)
        ap.remediation_path_allowlist = lambda *a, **k: ["src/adapters/", "tests/unit/adapters/", "src/config/provider-limits.json"]
        def _pf(paths, proof="/tmp/proof.txt"):
            return cmd_propose_fix(_argparse.Namespace(id="pf", actor="fleet", cause="c", repro="curl -si x",
                                                       paths=paths, fix="f", proof=proof))
        assert _pf("docker-compose.yml") == 1 and _pf_calls == [], "path outside allowlist must refuse with no write"
        assert _pf("src/adapters/a.ts,.env") == 1 and _pf_calls == [], "one bad path among good ones refuses all"
        assert _pf("src/adapters/a.ts", proof="rel/proof") == 1 and _pf_calls == [], "proof must be absolute"
        assert _pf("src/adapters/a.ts,tests/unit/adapters/a.test.ts") == 0 and len(_pf_calls) == 1
        _args = _pf_calls[0]
        assert _args[2] == "propose-fix" and json.loads(_args[3])["paths"] == ["src/adapters/a.ts", "tests/unit/adapters/a.test.ts"]
        assert set(json.loads(_args[3])) == {"cause", "repro", "paths", "fix", "proof"}
    finally:
        ap.get_incident, ap.note_incident, ap.remediation_path_allowlist = _orig_gi, _orig_ni, _orig_al
    # phase B body: data in a fence, reproduce-first demand, ALLOWED bullets, sonnet, 4 attempts.
    _bf, _bc = ap.build_phase_b_task_body(_opus_incident, {"cause": "c ```x", "repro": "curl -si u", "paths": ["src/adapters/a.ts"],
                                                           "fix": "f", "proof": "/tmp/p"})
    assert "-autopilot-fix-PROVIDER_DOWN-" in _bf and _bf[0] == "9"
    assert "MODEL: sonnet" in _bc and "MAX_ATTEMPTS: 4" in _bc and "REVIEW: opus" in _bc and "ALLOWED:" in _bc
    assert "cause not reproduced" in _bc and "````json" in _bc, "reproduce-first demand + longer fence for embedded backticks"
    _email_incident = dict(_opus_incident, kind="EMAIL_NOTICE")
    _fname2, _content2 = ap.build_remediation_task_body(_email_incident)
    assert "REVIEW: fable" in _content2, "EMAIL_NOTICE task body must still carry REVIEW: fable"
    assert "MAX_ATTEMPTS: 4" in _content2

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
        "revenue_pct": 4.2, "what": "quota exhausted, the plan requires a top-up",
        "system_did": "lowered probe to emergency",
    })
    assert "SEV1 INC-a1b2c3 PAYMENT_REQUIRED" in msg
    assert ap.tg("line_need_from_you", text="").strip() in msg and ap.tg("line_after_you", text="").strip() in msg
    assert ap.tg("line_why_not_auto", text="").strip() in msg
    # AUTO-classified incident's message admits AP-6 is missing, doesn't fake a queued task
    msg2 = ap.format_tg_message({
        "incident_id": "deadbeef-0000-0000-0000-000000000000", "kind": "PROVIDER_DOWN",
        "severity": "SEV2", "provider": "x", "state": "OPEN", "evidence": {},
    })
    assert "AP-6" in msg2 and ap.tg("line_need_from_you", text="").strip() not in msg2
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

        # T-03: a SUPPRESSED call must not reset the interval clock. Caught
        # live 2026-09-05 — every 10-minute tick that hit the same reason
        # kept stamping last_ts to "now" even when it didn't fire, so the
        # interval-elapsed check (now - last_ts >= interval_s) was compared
        # against a last_ts that was always ~10 minutes old and NEVER
        # actually reached interval_s: DAILY_CAP for INC-564ce1/INC-8e77a4
        # fired once at 07:50:34Z and then went silent for the rest of that
        # day despite the condition recurring every tick. The pre-existing
        # "interval elapsed" case above force-backdates last_ts right before
        # the firing call, which masks this bug entirely (it overwrites
        # whatever an intervening suppressed call already wrote) — this
        # asserts the stored last_ts directly instead of backdating it.
        ap.notice_dedup("inc-2", "DAILY_CAP", "inc-2 first sighting")
        _ts_after_first = json.loads(open(_dedup_path, encoding="utf-8").read())["inc-2"]["last_ts"]
        ap.notice_dedup("inc-2", "DAILY_CAP", "inc-2 suppressed, same reason, within interval")
        _ts_after_suppressed = json.loads(open(_dedup_path, encoding="utf-8").read())["inc-2"]["last_ts"]
        assert _ts_after_suppressed == _ts_after_first, (
            "a suppressed call must not touch last_ts -- doing so resets the interval clock on "
            "every tick, degrading 'at most once per interval_s' into 'once, ever, then silence'"
        )
    finally:
        ap.NOTICES_LOG, ap.NOTICE_DEDUP_FILE = _orig_notices_log, _orig_dedup_file
        for _p in (_log_path, _dedup_path):
            if os.path.exists(_p):
                os.unlink(_p)

    # T-0152a: `retire`'s guard — refuses unless provider-limits.json marks
    # the incident's provider `retired`. Exercised fully in-process:
    # get_incident/note_incident/transition_state are monkeypatched to fake
    # functions (same style as NOTICES_LOG/NOTICE_DEDUP_FILE above) so this
    # needs no live Postgres, and PROVIDER_LIMITS_PATH points at a temp fixture
    # (never the real provider-limits.json — LAW: this task ships zero
    # changes to any real provider's entry).
    import argparse as _argparse
    _retired_limits_path = _cfg(json.dumps({
        "retired-fixture-provider": {
            "display_name": "Retired Fixture", "health_url": "https://example.test/health",
            "limit_type": "unlimited", "free_limit": 0, "reset_period": "none",
            "retired": {"since": "2026-09-21", "task": "T-0152a", "reason": "selftest fixture"},
        },
        "live-fixture-provider": {
            "display_name": "Live Fixture", "health_url": "https://example2.test/health",
            "limit_type": "unlimited", "free_limit": 0, "reset_period": "none",
        },
    }))
    _orig_limits_path = ap.PROVIDER_LIMITS_PATH
    _orig_limits_cache = ap._provider_limits_cache
    _orig_get_incident, _orig_note_incident, _orig_transition_state = (
        ap.get_incident, ap.note_incident, ap.transition_state,
    )
    _fake_incidents = {
        "inc-retired": {"incident_id": "inc-retired", "provider": "retired-fixture-provider", "state": "STUCK"},
        "inc-live": {"incident_id": "inc-live", "provider": "live-fixture-provider", "state": "STUCK"},
        "inc-already-resolved": {
            "incident_id": "inc-already-resolved", "provider": "retired-fixture-provider", "state": "RESOLVED",
        },
    }
    _notes, _transitions = [], []
    try:
        ap.PROVIDER_LIMITS_PATH = _retired_limits_path
        ap._provider_limits_cache = None
        ap.get_incident = lambda iid: _fake_incidents.get(iid)
        ap.note_incident = lambda iid, actor, action, result: _notes.append((iid, actor, action, result))
        ap.transition_state = lambda iid, new_state, extra_set="": _transitions.append((iid, new_state))

        # World (a) — success: retired provider's STUCK incident -> RESOLVED,
        # with a 'retire' attempts entry recorded first.
        rc_ok = cmd_retire(_argparse.Namespace(id="inc-retired", actor="selftest", reason="provider retired"))
        assert rc_ok == 0, "retire on a retired provider's incident must succeed"
        assert _transitions == [("inc-retired", "RESOLVED")], "must transition to RESOLVED, nothing else"
        assert len(_notes) == 1 and _notes[0][:3] == ("inc-retired", "selftest", "retire"), (
            "must record exactly one 'retire' attempts entry before transitioning"
        )

        # World (b) — refusal: same call shape, but the incident's provider is
        # NOT marked retired. This is the guard itself — without it `retire`
        # would be a general, ungated STUCK escape hatch for ANY incident.
        _notes.clear()
        _transitions.clear()
        rc_refused = cmd_retire(
            _argparse.Namespace(id="inc-live", actor="selftest", reason="trying to sneak out of STUCK")
        )
        assert rc_refused != 0, "retire on a NON-retired provider's incident must refuse"
        assert _notes == [] and _transitions == [], (
            "a refused retire must not write an attempts entry or move state at all"
        )

        # Bonus boundary (contract, not a separate "world"): already-RESOLVED
        # refuses too, even for a retired provider — retire is an entry into
        # RESOLVED, not a no-op re-affirmation of it.
        rc_already = cmd_retire(
            _argparse.Namespace(id="inc-already-resolved", actor="selftest", reason="double retire")
        )
        assert rc_already != 0, "retire on an already-RESOLVED incident must refuse"
        assert _notes == [] and _transitions == [], "refusing an already-RESOLVED retire must not write anything"
    finally:
        ap.PROVIDER_LIMITS_PATH = _orig_limits_path
        ap._provider_limits_cache = _orig_limits_cache
        ap.get_incident, ap.note_incident, ap.transition_state = (
            _orig_get_incident, _orig_note_incident, _orig_transition_state,
        )
        os.unlink(_retired_limits_path)

    # T-0235: `close` worlds (a)-(f). Same monkeypatch style as retire above;
    # ap.psql is faked for the provider-healthy grounds.
    _orig_psql = ap.psql
    _anchor = "2026-09-29T05:12:45+00:00"
    _stuck_attempts = [{"ts": _anchor, "actor": "incident-engine", "action": "verify-failed", "result": "x"}]

    def _inc(iid, state="STUCK", provider="p1", kind="DEGRADED_QUALITY", attempts=None):
        return {"incident_id": iid, "provider": provider, "state": state, "kind": kind,
                "attempts": _stuck_attempts if attempts is None else attempts}

    _fake_incidents = {
        "src": _inc("src"),
        "src-noanchor": _inc("src-noanchor", attempts=[]),
        "src-open": _inc("src-open", state="OPEN"),
        "src-resolved": _inc("src-resolved", state="RESOLVED"),
        "t-live": _inc("t-live", state="VERIFYING", kind="PROVIDER_DOWN"),
        "t-resolved": _inc("t-resolved", state="RESOLVED"),
        "t-stuck": _inc("t-stuck", state="STUCK"),
        "t-other": _inc("t-other", state="OPEN", provider="p2"),
    }
    _notes, _transitions = [], []
    _psql_calls = []

    def _fake_psql_factory(row):
        def _f(sql):
            _psql_calls.append(sql)
            return (ap.SEP.join(row) if row else ""), 0
        return _f

    def _close(iid, sup=None, healthy=False):
        return cmd_close(_argparse.Namespace(id=iid, actor="op", reason="order",
                                             superseded_by=sup, provider_healthy=healthy))

    def _assert_no_write(rc, what):
        assert rc == 1, f"{what}: must refuse with exit 1"
        assert _notes == [] and _transitions == [], f"{what}: a refused close must write nothing"

    try:
        ap.get_incident = lambda iid: _fake_incidents.get(iid)
        ap.note_incident = lambda iid, actor, action, result: _notes.append((iid, actor, action, result))
        ap.transition_state = lambda iid, new_state, extra_set="": _transitions.append((iid, new_state))

        # (a) superseded success: close note, absorbs note, then RESOLVED
        assert _close("src", sup="t-live") == 0
        assert [(n[0], n[2]) for n in _notes] == [("src", "close"), ("t-live", "absorbs")]
        assert _notes[0][3] == "superseded by t-live (PROVIDER_DOWN/VERIFYING): order"
        assert _notes[1][3] == "INC-src (DEGRADED_QUALITY) closed as superseded: order"
        assert _transitions == [("src", "RESOLVED")]

        # (b) superseded refusals, zero writes each
        for _sup, _what in (("t-resolved", "target RESOLVED"), ("t-stuck", "target STUCK"),
                            ("t-other", "target other provider"), ("src", "target == source"),
                            ("t-missing", "target missing")):
            _notes.clear(); _transitions.clear()
            _assert_no_write(_close("src", sup=_sup), _what)

        # (c) provider-healthy success
        _notes.clear(); _transitions.clear()
        ap.psql = _fake_psql_factory(("HEALTHY", "OK", "2026-09-29 07:00:00+00", "t"))
        assert _close("src", healthy=True) == 0
        assert [(n[0], n[2]) for n in _notes] == [("src", "close")]
        assert _notes[0][3] == f"provider HEALTHY, probe 2026-09-29 07:00:00+00 after STUCK at {_anchor}: order"
        assert _transitions == [("src", "RESOLVED")]
        assert _anchor in _psql_calls[-1] and "::timestamptz" in _psql_calls[-1], "comparison must be done in SQL"

        # (d) provider-healthy refusals, zero writes each
        for _row, _what in ((("HEALTHY", "OK", "2026-09-29 05:00:00+00", "f"), "probe older than anchor"),
                            (("DOWN", "OK", "2026-09-29 07:00:00+00", "t"), "state DOWN"),
                            (("HEALTHY", "FAIL_TRANSIENT", "2026-09-29 07:00:00+00", "t"), "probe not OK"),
                            (None, "no provider_status row")):
            _notes.clear(); _transitions.clear()
            ap.psql = _fake_psql_factory(_row)
            _assert_no_write(_close("src", healthy=True), _what)
        _notes.clear(); _transitions.clear()
        ap.psql = _fake_psql_factory(("HEALTHY", "OK", "2026-09-29 07:00:00+00", "t"))
        _assert_no_write(_close("src-noanchor", healthy=True), "no STUCK anchor in attempts")

        # (e) source not STUCK, (f) source already RESOLVED
        for _src in ("src-open", "src-resolved"):
            for _kw in ({"sup": "t-live"}, {"healthy": True}):
                _notes.clear(); _transitions.clear()
                _assert_no_write(_close(_src, **_kw), f"source {_src}")
    finally:
        ap.psql = _orig_psql
        ap.get_incident, ap.note_incident, ap.transition_state = (
            _orig_get_incident, _orig_note_incident, _orig_transition_state,
        )

    # T-0263: `wait` window + state gate. Faked get_incident/wait_incident: no DB.
    _now = datetime(2026, 10, 5, 12, 0, 0, tzinfo=timezone.utc)
    _iso = lambda d: (_now + d).strftime("%Y-%m-%dT%H:%M:%SZ")
    assert parse_wait_until(_iso(timedelta(hours=1)), _now)[1] is None, "exactly now+1h is allowed"
    assert parse_wait_until(_iso(timedelta(hours=72)), _now)[1] is None, "exactly now+72h is allowed"
    assert parse_wait_until(_iso(timedelta(minutes=59, seconds=59)), _now)[1], "now+59m59s must refuse"
    assert parse_wait_until(_iso(timedelta(hours=72, seconds=1)), _now)[1], "now+72h1s must refuse"
    assert parse_wait_until(_iso(-timedelta(hours=1)), _now)[1], "past must refuse"
    assert parse_wait_until("2026-10-06T12:00:00", _now)[1], "naive timestamp must refuse"
    assert parse_wait_until("tomorrow", _now)[1], "garbage must refuse"
    assert parse_wait_until("2026-10-06T15:00:00+03:00", _now)[1] is None, "offset form normalised to UTC"

    _wcalls = []
    _orig_wait = ap.wait_incident
    _wstates = {"w-q": "REMEDIATION_QUEUED", "w-open": "OPEN", "w-ver": "VERIFYING", "w-stuck": "STUCK",
                "w-wh": "WAITING_HUMAN", "w-res": "RESOLVED"}
    _real_dt = datetime
    _soon = (_real_dt.now(timezone.utc) + timedelta(hours=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
    _far = (_real_dt.now(timezone.utc) + timedelta(hours=100)).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        ap.get_incident = lambda iid: ({"incident_id": iid, "state": _wstates[iid]} if iid in _wstates else None)
        ap.wait_incident = lambda *args: (_wcalls.append(args), True)[1]
        def _w(iid, until):
            return cmd_wait(_argparse.Namespace(id=iid, actor="fleet", until=until, reason="provider maintenance"))
        for _ok in ("w-q", "w-open"):
            _wcalls.clear()
            assert _w(_ok, _soon) == 0 and len(_wcalls) == 1, f"wait from {_ok} must write exactly once"
            assert _wcalls[0][3].startswith("until ") and _wcalls[0][3].endswith(": provider maintenance")
        for _bad in ("w-ver", "w-stuck", "w-wh", "w-res", "w-missing"):
            _wcalls.clear()
            assert _w(_bad, _soon) == 1 and _wcalls == [], f"wait from {_bad} must refuse with no write"
        _wcalls.clear()
        assert _w("w-q", _far) == 1 and _wcalls == [], "window violation must refuse with no write"
    finally:
        ap.get_incident, ap.wait_incident = _orig_get_incident, _orig_wait

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

    psh = sub.add_parser("show")
    psh.add_argument("id")
    psh.set_defaults(func=cmd_show)

    pro = sub.add_parser("reopen")
    pro.add_argument("--id", required=True)
    pro.add_argument("--actor", required=True)
    pro.add_argument("--result", required=True)
    pro.set_defaults(func=cmd_reopen)

    pret = sub.add_parser("retire")
    pret.add_argument("--id", required=True)
    pret.add_argument("--actor", required=True)
    pret.add_argument("--reason", required=True)
    pret.set_defaults(func=cmd_retire)

    pw = sub.add_parser("wait")
    pw.add_argument("--id", required=True)
    pw.add_argument("--actor", required=True)
    pw.add_argument("--until", required=True)
    pw.add_argument("--reason", required=True)
    pw.set_defaults(func=cmd_wait)

    ppf = sub.add_parser("propose-fix")
    ppf.add_argument("--id", required=True)
    ppf.add_argument("--actor", required=True)
    ppf.add_argument("--cause", required=True)
    ppf.add_argument("--repro", required=True)
    ppf.add_argument("--paths", required=True)
    ppf.add_argument("--fix", required=True)
    ppf.add_argument("--proof", required=True)
    ppf.set_defaults(func=cmd_propose_fix)

    pcl = sub.add_parser("close")
    pcl.add_argument("--id", required=True)
    pcl.add_argument("--actor", required=True)
    pcl.add_argument("--reason", required=True)
    g = pcl.add_mutually_exclusive_group(required=True)
    g.add_argument("--superseded-by", default=None)
    g.add_argument("--provider-healthy", action="store_true")
    pcl.set_defaults(func=cmd_close)

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
