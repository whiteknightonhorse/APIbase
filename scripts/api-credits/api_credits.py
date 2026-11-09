#!/usr/bin/env python3
"""API-CREDITS-1108/1: api-call wrapper, spend report, alerts, cycle rollover.

Subcommands: call | spend | alerts | rollover. Stdlib only. The credential is read from the 0600 key file,
placed in the child environment only, and never printed, logged or written to the ledger.
Refusal = exit 75 with a one-line reason and no child process (so no network call).
"""
import datetime as dt
import json
import os
import stat
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG = os.environ.get("API_CREDITS_CONFIG", os.path.join(HERE, "..", "..", "config", "api-credits.json"))
HOME = os.path.expanduser("~")
LEDGER_DIR = os.environ.get("API_LEDGER_DIR", os.path.join(HOME, "api-ledger"))
KEY_FILE = os.environ.get("API_KEY_FILE", os.path.join(HOME, ".anthropic-api.env"))
CLAUDE_BIN = os.environ.get("API_CALL_CLAUDE_BIN", "claude")
EX_REFUSED = 75
VAR = "ANTHROPIC_API" + "_KEY"


def now():
    s = os.environ.get("API_CREDITS_NOW")  # test hook: ISO UTC timestamp
    if s:
        return dt.datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc)
    return dt.datetime.now(dt.timezone.utc)


def load_config():
    with open(CONFIG) as f:
        return json.load(f)


def parse_day(s):
    return dt.datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=dt.timezone.utc)


def read_cycle():
    """Returns (start, end) datetimes or None when the cycle file is absent/invalid."""
    try:
        with open(os.path.join(LEDGER_DIR, "cycle.json")) as f:
            c = json.load(f)
        return parse_day(c["start"]), parse_day(c["end"])
    except (OSError, ValueError, KeyError, TypeError):
        return None


def ledger_path(start):
    return os.path.join(LEDGER_DIR, start.strftime("%Y-%m-%d") + ".jsonl")


def read_ledger(start):
    rows = []
    try:
        with open(ledger_path(start)) as f:
            for line in f:
                try:
                    r = json.loads(line)
                except ValueError:
                    continue
                if isinstance(r, dict):
                    rows.append(r)
    except OSError:
        pass
    return rows


def cost(r):
    v = r.get("cost_usd")
    return float(v) if isinstance(v, (int, float)) else 0.0


def totals(rows):
    lanes = {}
    for r in rows:
        lanes[r.get("lane")] = lanes.get(r.get("lane"), 0.0) + cost(r)
    return lanes, sum(lanes.values())


def refuse(reason):
    print("api-call refused: " + reason, file=sys.stderr)
    return EX_REFUSED


def key_value():
    """Parse the credential from the key file without sourcing it."""
    with open(KEY_FILE) as f:
        for line in f:
            line = line.strip()
            if line.startswith("export "):
                line = line[7:]
            if line.startswith(VAR + "="):
                v = line.split("=", 1)[1].strip().strip("'\"")
                return v or None
    return None


def check_guards(cfg, lane, model, max_turns):
    """Returns a refusal reason string or None. Order: key file, lane/model, turns, halt, cycle, caps."""
    try:
        st = os.stat(KEY_FILE)
    except OSError:
        return "key file missing"
    if not stat.S_ISREG(st.st_mode) or stat.S_IMODE(st.st_mode) != 0o600:
        return "key file mode is not 0600"
    if st.st_uid != os.getuid():
        return "key file not owned by this user"
    if lane not in cfg["lane_caps"]:
        return "unknown lane"
    if model not in cfg["lane_models"].get(lane, []):
        return "model not on the %s allowlist" % lane
    if max_turns is None or max_turns < 1:
        return "--max-turns required"
    if lane != "overflow" and os.path.exists(os.path.join(LEDGER_DIR, "HALT")):
        return "HALT marker present"
    cyc = read_cycle()
    if cyc is None:
        return "cycle file missing or invalid"
    t = now()
    if not (cyc[0] <= t < cyc[1]):
        return "outside the credit cycle window"
    rows = read_ledger(cyc[0])
    lanes, total = totals(rows)
    if lanes.get(lane, 0.0) >= cfg["lane_caps"][lane]:
        return "%s lane cap reached" % lane
    if lane == "overflow":
        today = t.strftime("%Y-%m-%d")
        spent = sum(cost(r) for r in rows if r.get("lane") == "overflow" and str(r.get("ts", ""))[:10] == today)
        if spent >= cfg["overflow_daily_cap"]:
            return "overflow daily cap reached"
    elif total >= cfg["non_overflow_total_stop"]:
        return "total ledger at or above $%s; only overflow may call" % cfg["non_overflow_total_stop"]
    if key_value() is None:
        return "key file has no credential"
    return None


def append_ledger(start, row):
    os.makedirs(LEDGER_DIR, exist_ok=True)
    fd = os.open(ledger_path(start), os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
    try:
        os.write(fd, (json.dumps(row, sort_keys=True) + "\n").encode())
    finally:
        os.close(fd)


def cmd_call(argv):
    lane = model = None
    max_turns = None
    extra = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--":
            extra = argv[i + 1:]
            break
        if a in ("--lane", "--model", "--max-turns") and i + 1 < len(argv):
            v = argv[i + 1]
            if a == "--lane":
                lane = v
            elif a == "--model":
                model = v
            else:
                try:
                    max_turns = int(v)
                except ValueError:
                    return refuse("--max-turns must be an integer")
            i += 2
            continue
        return refuse("bad argument")
    cfg = load_config()
    if max_turns is None and lane in cfg.get("default_max_turns", {}):
        max_turns = cfg["default_max_turns"][lane]
    reason = check_guards(cfg, lane, model, max_turns)
    if reason:
        return refuse(reason)
    if extra and extra[0] == "claude":
        extra = extra[1:]
    if extra and extra[0] == "-p":
        extra = extra[1:]
    # Callers may not override the flags the wrapper owns.
    for f in ("--output-format", "--max-turns", "--model"):
        if f in extra:
            return refuse("caller may not pass " + f)
    cmd = [CLAUDE_BIN, "-p", "--output-format", "json", "--model", model, "--max-turns", str(max_turns)] + extra
    env = dict(os.environ)
    env[VAR] = key_value()
    p = subprocess.run(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    cyc = read_cycle()
    try:
        out = json.loads(p.stdout.decode("utf-8", "replace"))
        if not isinstance(out, dict):
            raise ValueError
    except ValueError:
        print("api-call failed: claude returned no JSON (rc=%d)" % p.returncode, file=sys.stderr)
        return 1
    u = out.get("usage") if isinstance(out.get("usage"), dict) else {}
    c = out.get("total_cost_usd")
    row = {
        "ts": now().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "tenant": os.environ.get("API_CALL_TENANT") or os.environ.get("TENANT") or "unknown",
        "lane": lane,
        "model": model,
        "input_tokens": u.get("input_tokens", 0),
        "output_tokens": u.get("output_tokens", 0),
        "cache_read": u.get("cache_read_input_tokens", 0),
        "cache_write": u.get("cache_creation_input_tokens", 0),
        "cost_usd": c if isinstance(c, (int, float)) else 0.0,
        "request_id": str(out.get("session_id") or ""),
    }
    append_ledger(cyc[0], row)
    if out.get("is_error"):
        print("api-call failed: claude reported an error", file=sys.stderr)
        return 1
    r = out.get("result")
    sys.stdout.write(r if isinstance(r, str) else "")
    sys.stdout.write("\n")
    return p.returncode


def report():
    cfg = load_config()
    cyc = read_cycle()
    if cyc is None:
        return None
    rows = read_ledger(cyc[0])
    lanes, total = totals(rows)
    t = now()
    elapsed = max((t - cyc[0]).total_seconds() / 86400.0, 0.01)
    length = (cyc[1] - cyc[0]).total_seconds() / 86400.0
    left = max((cyc[1] - t).total_seconds() / 86400.0, 0.0)
    return cfg, cyc, lanes, total, left, total / elapsed * length


def cmd_spend(_argv):
    rep = report()
    if rep is None:
        print("no cycle file in " + LEDGER_DIR, file=sys.stderr)
        return 1
    cfg, cyc, lanes, total, left, proj = rep
    print("cycle %s -> %s" % (cyc[0].strftime("%Y-%m-%d"), cyc[1].strftime("%Y-%m-%d")))
    for lane, cap in cfg["lane_caps"].items():
        print("%-9s $%7.2f / $%d" % (lane, lanes.get(lane, 0.0), cap))
    print("%-9s $%7.2f / $%d (soft)" % ("total", total, cfg["total_soft"]))
    print("days left %.1f, projected end-of-cycle $%.2f" % (left, proj))
    return 0


def cmd_alerts(argv):
    """Hourly: write ALERT-<n> markers and a tick.log line. argv[0] = optional tick.log path."""
    rep = report()
    if rep is None:
        return 1
    cfg, _cyc, lanes, total, _left, _proj = rep
    hits = []
    for n in cfg["alerts"]:
        if total >= n:
            hits.append(("ALERT-%d" % n, "total $%.2f reached $%d" % (total, n)))
    for lane, cap in cfg["lane_caps"].items():
        if lanes.get(lane, 0.0) >= cap * cfg["lane_alert_fraction"]:
            hits.append(("ALERT-lane-" + lane, "%s lane $%.2f at 90%% of $%d" % (lane, lanes[lane], cap)))
    tick = argv[0] if argv else os.environ.get("API_TICK_LOG")
    for name, msg in hits:
        path = os.path.join(LEDGER_DIR, name)
        if os.path.exists(path):
            continue
        with open(path, "w") as f:
            f.write(msg + "\n")
        if tick:
            with open(tick, "a") as f:
                f.write("%s API credits alert: %s (reached your api credit threshold)\n"
                        % (now().strftime("%Y-%m-%dT%H:%M:%SZ"), msg))
    return 0


def add_month(d):
    y, m = (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
    return d.replace(year=y, month=m)


def cmd_rollover(_argv):
    """6th 00:05 UTC: open the next cycle when the current one has ended; clear alert markers."""
    os.makedirs(LEDGER_DIR, exist_ok=True)
    cyc = read_cycle()
    t = now()
    if cyc is None:
        cfg = load_config()
        start, end = parse_day(cfg["first_cycle"]["start"]), parse_day(cfg["first_cycle"]["end"])
        if not (start <= t < end):
            print("no cycle file and first cycle is not current", file=sys.stderr)
            return 1
    elif t < cyc[1]:
        return 0
    else:
        start = cyc[1]
        end = add_month(start)
    tmp = os.path.join(LEDGER_DIR, "cycle.json.tmp")
    with open(tmp, "w") as f:
        json.dump({"start": start.strftime("%Y-%m-%d"), "end": end.strftime("%Y-%m-%d")}, f)
    os.replace(tmp, os.path.join(LEDGER_DIR, "cycle.json"))
    for n in os.listdir(LEDGER_DIR):
        if n.startswith("ALERT-"):
            os.remove(os.path.join(LEDGER_DIR, n))
    return 0


def main():
    cmds = {"call": cmd_call, "spend": cmd_spend, "alerts": cmd_alerts, "rollover": cmd_rollover}
    if len(sys.argv) < 2 or sys.argv[1] not in cmds:
        print("usage: api_credits.py call|spend|alerts|rollover ...", file=sys.stderr)
        return 2
    return cmds[sys.argv[1]](sys.argv[2:])


if __name__ == "__main__":
    sys.exit(main())
