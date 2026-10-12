#!/usr/bin/env python3
"""compact-attempts.py -- T-0334. One-off cleanup of the unbounded incidents.attempts log.

Folds runs of identical consecutive "recurrence" entries (same actor/action/result) into one
entry with `count` + `last_at` -- the shape note_incident() now writes -- then applies the same
500-entry cap (first 50 + marker + last 449). Other actions are never touched.

  compact-attempts.py [--dry-run]   default; READ-ONLY (fleet_ro); prints per incident
                                    "entries -> collapsed" and a total. Writes nothing.
  compact-attempts.py --apply       one transaction (DO block), every UPDATE guarded by
                                    `attempts = <what was read>`; if any row changed under us
                                    the whole transaction aborts and nothing is written.
"""
import argparse
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import autopilot_common as ap  # noqa: E402

SEP = ap.SEP
RO_USER = "fleet_ro"


def _is_recurrence(e):
    return isinstance(e, dict) and str(e.get("action", "")).startswith("recurrence")


def _same_fault(a, b):
    return all(a.get(k) == b.get(k) for k in ("action", "actor", "result"))


def collapse(attempts):
    """Pure: returns the compacted list (recurrence runs folded, then capped)."""
    out = []
    for e in attempts:
        if _is_recurrence(e):
            if out and _is_recurrence(out[-1]) and _same_fault(out[-1], e):
                prev = out[-1]
                prev["count"] = int(prev.get("count", 1)) + int(e.get("count", 1))
                prev["last_at"] = e.get("last_at") or e.get("ts")
                continue
            e = {**e, "count": int(e.get("count", 1))}
        out.append(e)
    return cap(out)


def cap(entries):
    if len(entries) <= ap.ATTEMPTS_CAP:
        return entries
    head = entries[: ap.ATTEMPTS_KEEP_HEAD]
    mid = entries[ap.ATTEMPTS_KEEP_HEAD: len(entries) - ap.ATTEMPTS_KEEP_TAIL]
    tail = entries[len(entries) - ap.ATTEMPTS_KEEP_TAIL:]
    dropped = sum(int(e.get("dropped", 1)) if e.get("action") == "truncated" else 1 for e in mid)
    return head + [{"action": "truncated", "dropped": dropped}] + tail


def _run(user, sql):
    r = subprocess.run(
        ["docker", "exec", "-i", ap.PG_CONTAINER, "psql", "-U", user, "-d", ap.PG_DB,
         "-tAqF", SEP, "-v", "ON_ERROR_STOP=1"],
        input=sql, capture_output=True, text=True, timeout=300,
    )
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or "psql failed")
    return r.stdout.strip("\n")


def load(user):
    out = _run(user, "SELECT incident_id, provider, kind, state, attempts::text FROM incidents "
                     "ORDER BY created_at;")
    rows = []
    for line in out.splitlines():
        iid, provider, kind, state, raw = line.split(SEP, 4)
        rows.append((iid, provider, kind, state, raw, json.loads(raw)))
    return rows


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    g = p.add_mutually_exclusive_group()
    g.add_argument("--dry-run", action="store_true", help="default: print only, read-only")
    g.add_argument("--apply", action="store_true", help="write, one transaction")
    args = p.parse_args(argv)

    rows = load(ap.PG_USER if args.apply else RO_USER)
    before = after = 0
    updates = []
    for iid, provider, kind, state, raw, attempts in rows:
        new = collapse(attempts)
        before += len(attempts)
        after += len(new)
        if len(new) != len(attempts):
            print(f"{iid} {provider}/{kind} {state}: {len(attempts)} -> {len(new)}")
            updates.append((iid, raw, new))
    print(f"total: {before} -> {after} entries across {len(rows)} incidents "
          f"({len(updates)} would change)")
    if not args.apply:
        print("dry-run: nothing written (use --apply)")
        return 0
    if not updates:
        return 0
    body = ["DO $c$ BEGIN"]
    for iid, raw, new in updates:
        body.append(
            f"UPDATE incidents SET attempts = {ap.sql_jsonb_literal(new)} "
            f"WHERE incident_id = {ap.sql_literal(iid)} AND attempts = {ap.sql_jsonb_literal(json.loads(raw))};"
            f" IF NOT FOUND THEN RAISE EXCEPTION 'incident {iid} changed during compaction'; END IF;"
        )
    body.append("END $c$;")
    _run(ap.PG_USER, "\n".join(body))
    print(f"applied: {len(updates)} incidents compacted in one transaction")
    return 0


if __name__ == "__main__":
    sys.exit(main())
