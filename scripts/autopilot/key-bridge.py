#!/usr/bin/env python3
"""key-bridge.py — T-0239 / FT-2: turn "issued" key-queue records into night-orchestra queue lines.

Design: disputes/0157-*.ruling-2.md §1-§2, 0157-*.ruling-3.md §2, KEY-BRIDGE-1001.ruling-1.md §B.
T-0155 §3 is superseded by those; no new key-queue status is introduced (a new status would fail
connected_db.py's well-formedness check and break the letter). The bridge keeps its own ledger.

Reads  STATE/key-required-queue.json, STATE/connected.json, STATE/queue.txt, src/adapters/ (dir names),
       key-bridge-resolutions.json (tracked, edited by commit only), <roles dir>/onboard-batch.md.
Writes STATE/queue.txt (O_APPEND, one line per record) and STATE/key-bridge.jsonl (append-only ledger).
Nothing in the tracked tree.

Queue line: <provider_id>|<signup_url or ->|keyed|key=ENV1[,ENV2];auth=<auth_method, '|' -> '/'>

Live writes only from the deployed copy (abspath(__file__) under /home/apibase/apibase/) or with an
explicit --state-dir. Cron line (operator installs once, before the orchestra's daily tick):
  see AUTOPILOT-PROGRESS.md#T-0239-key-bridge-issued-to-queue
"""
import argparse
import fcntl
import json
import os
import re
import sys
from datetime import date, datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from autopilot_common import CONNECTED_DB_PY, FIX_MD_PATH, STATE  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DEPLOY_PREFIX = "/home/apibase/apibase/"
MARKER = "KEYED CANDIDATE"
ROLES_DIR = os.path.dirname(FIX_MD_PATH)
ADAPTERS_DIR = os.environ.get("KEY_BRIDGE_ADAPTERS_DIR", os.path.join(HERE, "..", "..", "src", "adapters"))
RESOLUTIONS_PATH = os.environ.get("KEY_BRIDGE_RESOLUTIONS", os.path.join(HERE, "key-bridge-resolutions.json"))
DEDUP_DAYS = 7
MAX_QUEUED_TIMES = 3
MIN_OVERLAP = 3
VALID_RESOLUTIONS = ("connected-as", "hold", "skip", "queue")


def norm(name):
    return re.sub(r"[-_]", "", str(name).lower())


def norm_key(key):
    # connected.json carries a few corrupted keys like "20\tun-comtrade" (batch number glued on).
    return norm(re.sub(r"^\d+\t", "", key))


def load_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        if default is not None:
            return default
        raise


def overlap(a, b):
    """Prefix/suffix overlap: the shorter normalized name (>= MIN_OVERLAP chars) is a prefix or suffix of the other."""
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    return len(short) >= MIN_OVERLAP and (long_.startswith(short) or long_.endswith(short))


def read_queue_names(path):
    names = set()
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for line in f:
                field1 = line.split("|", 1)[0].strip()
                if field1:
                    names.add(norm(field1))
    except FileNotFoundError:
        pass
    return names


def read_ledger(path):
    rows = []
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        rows.append(json.loads(line))
                    except ValueError:
                        continue
    except FileNotFoundError:
        pass
    return rows


def marker_present():
    path = os.path.join(ROLES_DIR, "onboard-batch.md")
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return MARKER in f.read(), path
    except OSError:
        return False, path


def queue_line(rec, resolution):
    env = ",".join(rec.get("env_vars") or [])
    auth = str(rec.get("auth_method", "")).replace("|", "/").replace("\n", " ").strip()
    url = (resolution or {}).get("base_url") or rec.get("signup_url") or "-"
    url = str(url).replace("|", "/").strip() or "-"
    return f"{rec['provider_id']}|{url}|keyed|key={env};auth={auth}"


def classify(records, connected, adapters, resolutions, queued_names, ledger, today):
    """Return list of (provider_id, cls, detail, record). cls in
    resolved|alias|alias-candidate|unverified|already-queued|exhausted|recent|queue."""
    connected_norm = {}
    for k, v in connected.items():
        connected_norm.setdefault(norm_key(k), []).append((k, v))
    adapter_norm = {norm(a): a for a in adapters}
    # Overlap pool: every connected.json key except operator-declined "skip" entries (a skip is not
    # evidence of an integration), plus every adapter dir (evidence even when the ledger says skip).
    pool = {}
    for k, v in connected.items():
        if isinstance(v, dict) and v.get("status") == "skip":
            continue
        pool[norm_key(k)] = k
    for a in adapters:
        pool.setdefault(norm(a), a)

    out = []
    for rec in records:
        if rec.get("status") != "issued":
            continue
        pid = rec["provider_id"]
        n = norm(pid)
        res = resolutions.get(pid)
        rname = (res or {}).get("resolution")
        if res is not None and rname not in VALID_RESOLUTIONS:
            out.append((pid, "unverified", f"resolution entry has invalid value {rname!r}", rec))
            continue
        if res is not None and rname != "queue":
            out.append((pid, "resolved", f"resolution={rname} as={res.get('as')}", rec))
            continue
        if n in queued_names:
            out.append((pid, "already-queued", "present as field 1 of a queue.txt line", rec))
            continue
        exact = None
        for k, v in connected_norm.get(n, []):
            if isinstance(v, dict) and v.get("status") == "connected":
                exact = k
        if exact is None and n in adapter_norm:
            exact = adapter_norm[n]
        if exact is not None:
            out.append((pid, "alias", f"connected-as {exact}", rec))
            continue
        if rname != "queue":
            cand = sorted({orig for pn, orig in pool.items() if overlap(n, pn)})
            if cand:
                out.append((pid, "alias-candidate", f"alias candidate {', '.join(cand)}", rec))
                continue
        if not rec.get("auth_method") or not rec.get("auth_method_date"):
            out.append((pid, "unverified", "no auth_method / auth_method_date on the record", rec))
            continue
        mine = [r for r in ledger if r.get("provider_id") == pid and r.get("action") == "queued"]
        if len(mine) >= MAX_QUEUED_TIMES:
            out.append((pid, "exhausted", f"queued {len(mine)} times with no resolution", rec))
            continue
        recent = [r for r in mine if _age_days(r.get("date"), today) <= DEDUP_DAYS]
        if recent:
            out.append((pid, "recent", f"already in ledger on {recent[-1].get('date')} (<= {DEDUP_DAYS} days)", rec))
            continue
        out.append((pid, "queue", "measured auth method, no alias", rec))
    return out


def _age_days(d, today):
    try:
        return (today - date.fromisoformat(d)).days
    except (TypeError, ValueError):
        return 10 ** 6


def append_line(path, line):
    data = line + "\n"
    try:
        with open(path, "rb") as f:
            f.seek(0, os.SEEK_END)
            if f.tell() > 0:
                f.seek(-1, os.SEEK_END)
                if f.read(1) != b"\n":
                    data = "\n" + data
    except FileNotFoundError:
        pass
    fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o664)
    try:
        os.write(fd, data.encode("utf-8"))
    finally:
        os.close(fd)


def ledger_add(path, provider_id, action, reason, today):
    row = {"provider_id": provider_id, "action": action, "reason": reason, "date": today.isoformat(),
           "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    append_line(path, json.dumps(row, ensure_ascii=False))


def main(argv=None):
    ap = argparse.ArgumentParser(description="issued key-queue records -> orchestra queue lines (T-0239)")
    ap.add_argument("--dry-run", action="store_true", help="print the full classification, write nothing")
    ap.add_argument("--state-dir", help="state dir to use instead of the deployed STATE")
    ap.add_argument("--max", type=int, default=2, dest="max_n",
                    help="max queue lines appended per run (default 2; shares the ORCH_MAX_ONBOARDS budget)")
    args = ap.parse_args(argv)

    if args.state_dir:
        state = os.path.abspath(args.state_dir)
    else:
        if not os.path.abspath(__file__).startswith(DEPLOY_PREFIX):
            print(f"REFUSED: {os.path.abspath(__file__)} is not under {DEPLOY_PREFIX}; the default STATE "
                  f"({STATE}) is live. Pass --state-dir <dir> (or --dry-run with --state-dir).")
            return 2
        state = STATE

    queue_path = os.path.join(state, "queue.txt")
    ledger_path = os.path.join(state, "key-bridge.jsonl")
    lock_path = os.path.join(state, "orchestra.lock")
    today = datetime.now(timezone.utc).date()

    try:
        records = load_json(os.path.join(state, "key-required-queue.json"))
        connected = load_json(os.path.join(state, "connected.json"))
    except (OSError, ValueError) as e:
        print(f"ERROR: cannot read state input: {e}")
        return 1
    resolutions = load_json(RESOLUTIONS_PATH, default={})
    try:
        adapters = [d for d in os.listdir(ADAPTERS_DIR) if os.path.isdir(os.path.join(ADAPTERS_DIR, d))]
    except OSError as e:
        print(f"ERROR: cannot list adapters dir {ADAPTERS_DIR}: {e}")
        return 1

    lock_fd = None
    if not args.dry_run:
        try:
            lock_fd = os.open(lock_path, os.O_RDWR | os.O_CREAT, 0o664)
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            print(f"orchestra.lock held ({lock_path}): exiting without writing")
            if lock_fd is not None:
                os.close(lock_fd)
            return 0

    try:
        queued_names = read_queue_names(queue_path)
        ledger = read_ledger(ledger_path)
        rows = classify(records, connected, adapters, resolutions, queued_names, ledger, today)
        has_marker, marker_path = marker_present()

        print(f"key-bridge {'DRY-RUN ' if args.dry_run else ''}state={state} connected_db={CONNECTED_DB_PY} "
              f"max={args.max_n} marker={'present' if has_marker else 'ABSENT'} ({marker_path})")
        queued = 0
        table = []
        for pid, cls, detail, rec in rows:
            action, reason = cls, detail
            if cls == "queue":
                res = resolutions.get(pid)
                line = queue_line(rec, res)
                if not has_marker:
                    action, reason = "hold-marker", (f"would queue; held: {marker_path} lacks marker "
                                                     f"{MARKER!r} (task 0241)")
                elif queued >= args.max_n:
                    action, reason = "deferred-cap", f"would queue; cap --max {args.max_n} reached this run"
                else:
                    queued += 1
                    action, reason = "queued", line
                    if not args.dry_run:
                        append_line(queue_path, line)
                        ledger_add(ledger_path, pid, "queued", line, today)
                    else:
                        action = "would-queue"
            elif cls in ("alias", "resolved", "alias-candidate", "unverified"):
                last = [r for r in ledger if r.get("provider_id") == pid]
                tag = {"alias": "connected-as", "resolved": "resolved", "alias-candidate": "hold",
                       "unverified": "hold"}[cls]
                if not args.dry_run and not (last and last[-1].get("action") == tag and last[-1].get("reason") == detail):
                    ledger_add(ledger_path, pid, tag, detail, today)
            table.append((pid, cls, action, reason))

        w = max([len(t[0]) for t in table] + [8])
        print(f"{'provider'.ljust(w)}  {'class':<15} {'action':<13} reason")
        for pid, cls, action, reason in table:
            print(f"{pid.ljust(w)}  {cls:<15} {action:<13} {reason}")
        print(f"summary: {len(table)} issued records, {queued} {'would be ' if args.dry_run else ''}queued")
    finally:
        if lock_fd is not None:
            os.close(lock_fd)
    return 0


if __name__ == "__main__":
    sys.exit(main())
