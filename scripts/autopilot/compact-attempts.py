#!/usr/bin/env python3
"""compact-attempts.py -- T-0334. One-off cleanup of the unbounded incidents.attempts log.

Folds runs of identical consecutive "recurrence" entries (same actor/action/result) into one
entry with `count` + `last_at` -- the shape note_incident() now writes -- then applies the same
500-entry cap (first 50 + marker + last 449). Other actions are never touched.

  compact-attempts.py [--dry-run]   default; READ-ONLY (fleet_ro); prints per incident
                                    "entries -> collapsed" and a total. Writes nothing.
  compact-attempts.py --older-than 7d
                                    T-0585: only entries older than the age (Nd/Nh) are folded; newer
                                    ones are left as written. Combine with --apply for the cron run.
  compact-attempts.py --apply       one transaction (DO block), every UPDATE guarded by
                                    `attempts = <what was read>`; if any row changed under us
                                    the whole transaction aborts and nothing is written.
"""
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import autopilot_common as ap  # noqa: E402

SEP = ap.SEP
RO_USER = "fleet_ro"


def _is_recurrence(e):
    return isinstance(e, dict) and str(e.get("action", "")).startswith("recurrence")


def _same_fault(a, b, ignore_result=False):
    keys = ("action", "actor") if ignore_result else ("action", "actor", "result")
    return all(a.get(k) == b.get(k) for k in keys)


def parse_age(text):
    m = re.fullmatch(r"(\d+)([dh])", text or "")
    if not m:
        raise argparse.ArgumentTypeError("--older-than needs Nd or Nh, e.g. 7d")
    n = int(m.group(1))
    return timedelta(days=n) if m.group(2) == "d" else timedelta(hours=n)


def _entry_time(e):
    raw = e.get("last_at") or e.get("ts") if isinstance(e, dict) else None
    try:
        t = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def collapse(attempts, older_than=None, now=None, ignore_result=False):
    """Pure: returns the compacted list (recurrence runs folded, then capped). With `older_than`
    (a timedelta) only the leading run of entries older than that age is folded, and there a run of
    recurrences folds even when their evidence text differs (the folded entry keeps the newest
    text): the daily notes differ only by a probe timestamp, which is why 163 of them never folded.
    The rest is kept verbatim."""
    if older_than is not None:
        cutoff = (now or datetime.now(timezone.utc)) - older_than
        n = 0
        while n < len(attempts):
            t = _entry_time(attempts[n])
            if t is None or t >= cutoff:
                break
            n += 1
        return cap(collapse(attempts[:n], ignore_result=True) + attempts[n:])
    out = []
    for e in attempts:
        if _is_recurrence(e):
            if out and _is_recurrence(out[-1]) and _same_fault(out[-1], e, ignore_result):
                prev = out[-1]
                if ignore_result:
                    prev["result"] = e.get("result")
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
    p.add_argument("--older-than", type=parse_age, default=None, metavar="AGE",
                   help="only fold entries older than AGE (Nd or Nh)")
    args = p.parse_args(argv)

    rows = load(ap.PG_USER if args.apply else RO_USER)
    before = after = 0
    updates = []
    for iid, provider, kind, state, raw, attempts in rows:
        new = collapse(attempts, args.older_than)
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
