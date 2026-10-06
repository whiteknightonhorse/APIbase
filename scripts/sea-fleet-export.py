#!/usr/bin/env python3
"""sea-fleet-export.py — T-INT-29: writes the neutral "sea fleet" aggregate to Redis `fleet:sea`
(TTL 180 s); GET /api/v1/fleet/sea serves it. The ONLY place that knows which internal system
maps to which public class (spec P.4):

    taskloop -> builder   orchestra -> scout   autopilot -> medic   content -> writer
    sentinel -> watch (no marker exists today, so the class is simply absent)

Reads only the allowed sources: first line of the pause file (ONE readline(), never the
`reason:`/`by:` lines), the number of entries in taskloop/active (never their names), mtimes,
autopilot_engine_heartbeat, the 15-minute execution_ledger aggregate by tools.category, and the
"door" files ~/fleet/heartbeat/<agent-id>.json ({class, state, started_at}, class must be one of
the five neutral ones). Never reads tenant logs. See docs/sea-hunter.md.

Schedule (installed by the dispatcher after promotion, not by this task), every minute:
  python3 scripts/sea-fleet-export.py >> /var/tmp/sea-fleet-export.log 2>&1
"""
import glob
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

HOME = os.path.expanduser("~")
CLASSES = ("builder", "scout", "medic", "writer", "watch")
STATES = ("working", "idle", "resting")
WINDOW_S = 900
REDIS_KEY = "fleet:sea"
REDIS_TTL_S = 180
MAX_PER_CLASS = 8

PATHS = {
    "pause": os.path.join(HOME, ".fleet-paused-until"),
    "taskloop_active": os.path.join(HOME, "taskloop", "active"),
    "taskloop_tick": os.path.join(HOME, "taskloop", "logs", "tick.log"),
    "orchestra_heartbeat": os.path.join(HOME, "apibase", "scripts", "night-orchestra", "state", "heartbeat"),
    "content_guides": os.path.join(HOME, "content-hub", "guides"),
    "doors": os.path.join(HOME, "fleet", "heartbeat"),
}
PG_CONTAINER = os.environ.get("SEA_PG_CONTAINER", "apibase-postgres-1")
REDIS_CONTAINER = os.environ.get("SEA_REDIS_CONTAINER", "apibase-redis-1")


def iso(ts):
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_pause_until(path):
    """Epoch from the FIRST line only (a single readline()); None if absent/unparseable."""
    try:
        with open(path, encoding="utf-8") as f:
            digits = "".join(c for c in f.readline() if c.isdigit())
        return int(digits) if digits else None
    except OSError:
        return None


def mtime(path):
    try:
        return os.stat(path).st_mtime
    except OSError:
        return None


def activity_level(age_s):
    """Deterministic 0..3 from the age of the freshest signal."""
    if age_s <= 120:
        return 3
    if age_s <= 600:
        return 2
    if age_s <= 1800:
        return 1
    return 0


def _ship(cls, ts, now, forced_state=None):
    age = max(0, int(now - ts))
    level = activity_level(age)
    state = forced_state or ("working" if level >= 2 else "idle")
    return {"class": cls, "state": state, "since_s": age, "activity_level": level}


def latest_publication_mtime(guides_dir):
    best = None
    for p in glob.glob(os.path.join(guides_dir, "*.html")):
        m = mtime(p)
        if m is not None and (best is None or m > best):
            best = m
    return best


def collect_internal(now, paths, engine_heartbeat_ts):
    """Return (raw ships without ids, activity timestamps)."""
    raw, stamps = [], []

    def add(cls, ts):
        if ts is None:
            return
        stamps.append(ts)
        raw.append(_ship(cls, ts, now))

    # taskloop -> builder: one ship per active task (count only, never names).
    tick = mtime(paths["taskloop_tick"])
    try:
        active = len(os.listdir(paths["taskloop_active"]))
    except OSError:
        active = 0
    if tick is not None:
        stamps.append(tick)
        if active > 0:
            raw += [_ship("builder", tick, now) for _ in range(min(active, MAX_PER_CLASS))]
        else:
            raw.append(_ship("builder", tick, now, forced_state="idle"))
    add("scout", mtime(paths["orchestra_heartbeat"]))
    add("medic", engine_heartbeat_ts)
    add("writer", latest_publication_mtime(paths["content_guides"]))
    return raw, stamps


def collect_doors(now, doors_dir):
    raw, stamps = [], []
    for p in sorted(glob.glob(os.path.join(doors_dir, "*.json"))):
        try:
            with open(p, encoding="utf-8") as f:
                d = json.load(f)
        except (OSError, ValueError):
            continue
        if not isinstance(d, dict) or d.get("class") not in CLASSES:
            continue
        state = d.get("state") if d.get("state") in STATES else "idle"
        m = mtime(p) or now
        started = d.get("started_at")
        since = int(now - started) if isinstance(started, (int, float)) and not isinstance(started, bool) else int(now - m)
        raw.append({
            "class": d["class"],
            "state": state,
            "since_s": max(0, since),
            "activity_level": activity_level(max(0, int(now - m))),
        })
        stamps.append(m)
    return raw, stamps


def bucket(n):
    if n <= 0:
        return "0"
    if n <= 5:
        return "1-5"
    if n <= 20:
        return "6-20"
    return "21+"


def build(now, paths, engine_heartbeat_ts, ledger_rows, agents):
    until = read_pause_until(paths["pause"])
    paused = until is not None and now < until
    raw, stamps = collect_internal(now, paths, engine_heartbeat_ts)
    draw, dstamps = collect_doors(now, paths["doors"])
    raw += draw
    stamps += dstamps
    ships, counters = [], {}
    for r in raw:
        n = counters.get(r["class"], 0) + 1
        counters[r["class"]] = n
        ships.append({
            "id": f"{r['class']}-{n}",
            "class": r["class"],
            "state": "resting" if paused else r["state"],
            "since_s": r["since_s"],
            "activity_level": 0 if paused else r["activity_level"],
        })
    cats = {}
    for cat, calls in ledger_rows:
        cats[cat] = cats.get(cat, 0) + int(calls)
    by_category = [{"category": c, "calls": n} for c, n in sorted(cats.items(), key=lambda kv: (-kv[1], kv[0]))]
    out = {
        "generated_at": iso(now),
        "fleet_paused": paused,
        "ships": ships,
        "external": {
            "window_s": WINDOW_S,
            "calls": sum(cats.values()),
            "agents_bucket": bucket(agents),
            "by_category": by_category,
        },
        "honesty": {"last_activity_at": iso(max(stamps)) if stamps else None},
    }
    if paused:
        out["paused_until_minute"] = iso(until - until % 60)
    return out


def _psql(sql):
    r = subprocess.run(
        ["docker", "exec", "-i", PG_CONTAINER, "psql", "-U", "fleet_ro", "-d", "apibase", "-tAF", "|", "-c", sql],
        capture_output=True, text=True, timeout=30,
    )
    if r.returncode != 0:
        raise RuntimeError("query failed")
    return [ln for ln in r.stdout.splitlines() if ln.strip()]


def query_engine_heartbeat():
    try:
        rows = _psql("SELECT extract(epoch FROM max(last_run_at)) FROM autopilot_engine_heartbeat")
        return float(rows[0]) if rows else None
    except Exception:
        return None


def query_external():
    """([(category, calls)], distinct agents) for the last 15 minutes; empty on failure."""
    try:
        rows = _psql(
            "SELECT t.category, count(*) FROM execution_ledger l JOIN tools t ON t.tool_id = l.tool_id "
            f"WHERE l.created_at > now() - interval '{WINDOW_S} seconds' GROUP BY t.category"
        )
        agents = _psql(
            "SELECT count(DISTINCT agent_id) FROM execution_ledger "
            f"WHERE created_at > now() - interval '{WINDOW_S} seconds'"
        )
        return [(r.split("|")[0], int(r.split("|")[1])) for r in rows], int(agents[0]) if agents else 0
    except Exception:
        return [], 0


def write_redis(payload):
    subprocess.run(
        ["docker", "exec", REDIS_CONTAINER, "redis-cli", "SET", REDIS_KEY,
         json.dumps(payload, separators=(",", ":")), "EX", str(REDIS_TTL_S)],
        capture_output=True, text=True, timeout=15, check=True,
    )


def main():
    rows, agents = query_external()
    write_redis(build(time.time(), PATHS, query_engine_heartbeat(), rows, agents))
    return 0


if __name__ == "__main__":
    sys.exit(main())
