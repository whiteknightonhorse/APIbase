#!/usr/bin/env python3
"""API-CREDITS-1108/1: api-call wrapper, spend report, alerts, cycle rollover.

Subcommands: call | spend | alerts | rollover. Stdlib only. The credential is read from the 0600 key file,
placed in the child environment only, and never printed, logged or written to the ledger.
Refusal = exit 75 with a one-line reason and no child process (so no network call).
"""
import datetime as dt
import hashlib
import json
import os
import re
import shlex
import stat
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_CONFIG = os.path.join(HERE, "..", "..", "config", "api-credits.json")
HOME = os.path.expanduser("~")
# Per-tenant layout (T-0746): a copy installed under ~/bin/api-credits carries its config next to itself.
_NEXT = os.path.join(HERE, "api-credits.json")
CONFIG = os.environ.get("API_CREDITS_CONFIG") or (_NEXT if os.path.exists(_NEXT) else REPO_CONFIG)
HOME_BASE = os.environ.get("API_HOME_BASE", "/home")
# Elevated reads/writes across tenants: cron/dispatcher context only; tests override API_SUDO (empty = no elevation).
PRIV = shlex.split(os.environ.get("API_SUDO", "sudo -n"))
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


def tenant_name():
    return os.environ.get("API_CALL_TENANT") or os.environ.get("TENANT") or os.path.basename(HOME.rstrip("/")) or "unknown"


def is_apibase():
    return os.path.basename(HOME.rstrip("/")) == "apibase"


def totals(rows):
    """An estimate row counts only while no actual row with the same batch_id exists (fail-closed metering)."""
    actual = set(r.get("batch_id") for r in rows if r.get("kind") == "actual")
    lanes = {}
    for r in rows:
        if r.get("kind") == "estimate" and r.get("batch_id") in actual:
            continue
        lanes[r.get("lane")] = lanes.get(r.get("lane"), 0.0) + cost(r)
    return lanes, sum(lanes.values())


def refuse(reason, prog="api-call"):
    print(prog + " refused: " + reason, file=sys.stderr)
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


def _listdir(d):
    try:
        return os.listdir(d)
    except OSError:
        return []


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
    if lane != "overflow" and any(n == "HALT" or n.startswith("HALT-") for n in _listdir(LEDGER_DIR)):
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
        if f in extra or any(isinstance(a, str) and a.startswith(f + "=") for a in extra):
            return refuse("caller may not pass " + f)
    cmd = [CLAUDE_BIN, "-p", "--output-format", "json", "--model", model, "--max-turns", str(max_turns)] + extra
    env = dict(os.environ)
    env[VAR] = key_value()
    env["API_CALL_CHILD"] = "1"  # T-KEY-1: marks the api-call child, the only process allowed to carry the key
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
        "tenant": tenant_name(),
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


BATCH_PROG = "api-batch"
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class BatchError(Exception):
    pass


def api_base(cfg):
    base = cfg.get("anthropic_base", "https://api.anthropic.com")
    o = os.environ.get("API_BATCH_BASE_URL")  # test hook: loopback only, so the key can never be sent elsewhere
    if o and urllib.parse.urlparse(o).hostname in ("127.0.0.1", "localhost"):
        base = o
    return base.rstrip("/")


def http(cfg, method, path, body=None):
    """One call to the Batches API. Returns the response bytes. Errors carry only the status and error type."""
    req = urllib.request.Request(api_base(cfg) + path, data=body, method=method)
    req.add_header("anthropic-version", cfg["anthropic_version"])
    req.add_header("content-type", "application/json")
    req.add_unredirected_header("x-api-key", key_value())  # never forwarded on a redirect
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        kind = ""
        try:
            kind = str(json.loads(e.read().decode("utf-8", "replace")).get("error", {}).get("type", ""))[:60]
        except Exception:
            pass
        raise BatchError("HTTP %d %s" % (e.code, kind))
    except (urllib.error.URLError, OSError) as e:
        raise BatchError("network error (%s)" % type(e).__name__)


def price_of(cfg, model, tokens):
    """USD per MTok at the batch rate for a request whose prompt had `tokens` tokens."""
    p = cfg["pricing"][model]
    if "long" in p and tokens > cfg.get("long_prompt_tokens", 100000):
        p = p["long"]
    d = cfg["batch_discount"]
    return dict((k, p[k] * d) for k in ("input", "output", "cache_read", "cache_write"))


def load_jobs(path, model):
    """Returns (list of request dicts as the API wants them, list of per-request (chars, max_tokens)) or raises BatchError."""
    reqs, meta, seen = [], [], set()
    try:
        f = open(path)
    except OSError:
        raise BatchError("--jobs file unreadable")
    with f:
        for n, line in enumerate(f, 1):
            if not line.strip():
                continue
            try:
                o = json.loads(line)
            except ValueError:
                raise BatchError("--jobs line %d is not JSON" % n)
            if not isinstance(o, dict) or not isinstance(o.get("custom_id"), str) or not ID_RE.match(o["custom_id"]):
                raise BatchError("--jobs line %d needs a custom_id matching [A-Za-z0-9_-]{1,64}" % n)
            params = o["params"] if isinstance(o.get("params"), dict) else dict((k, v) for k, v in o.items() if k != "custom_id")
            if o["custom_id"] in seen:
                raise BatchError("--jobs line %d repeats a custom_id" % n)
            seen.add(o["custom_id"])
            if params.get("model", model) != model:
                raise BatchError("--jobs line %d model differs from --model" % n)
            mt = params.get("max_tokens")
            if not isinstance(mt, int) or isinstance(mt, bool) or mt < 1 or not isinstance(params.get("messages"), list):
                raise BatchError("--jobs line %d needs messages and an integer max_tokens >= 1" % n)
            params["model"] = model
            if params.get("stream"):
                raise BatchError("--jobs line %d: stream is not allowed in a batch" % n)
            body = dict((k, v) for k, v in params.items() if k not in ("model", "max_tokens"))
            meta.append((len(json.dumps(body, ensure_ascii=False)), mt))
            reqs.append({"custom_id": o["custom_id"], "params": params})
    if not reqs:
        raise BatchError("--jobs is empty")
    if len(reqs) > 100000:
        raise BatchError("--jobs has more than 100000 requests")
    return reqs, meta


def estimate_usd(cfg, model, meta):
    """sum(input chars / 3) x input batch price + sum(max_tokens) x output batch price, USD."""
    total = 0.0
    for chars, mt in meta:
        tok = chars / 3.0
        pr = price_of(cfg, model, tok)
        total += tok / 1e6 * pr["input"] + mt / 1e6 * pr["output"]
    return round(total, 6)


def parse_flags(argv, allowed):
    out = {}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a in allowed and i + 1 < len(argv):
            out[a] = argv[i + 1]
            i += 2
            continue
        return None
    return out


def cmd_batch(argv):
    if not argv or argv[0] not in ("estimate", "submit", "poll", "collect"):
        return refuse("usage: api-batch estimate|submit|poll|collect --lane L --model M ...", BATCH_PROG)
    sub = argv[0]
    fl = parse_flags(argv[1:], ("--lane", "--model", "--jobs", "--out", "--batch-id"))
    if fl is None:
        return refuse("bad argument", BATCH_PROG)
    lane, model = fl.get("--lane"), fl.get("--model")
    cfg = load_config()
    if lane not in ("batch", "sweep"):
        return refuse("lane must be batch or sweep", BATCH_PROG)
    reason = check_guards(cfg, lane, model, 1)
    if reason:
        return refuse(reason, BATCH_PROG)
    if model not in cfg.get("pricing", {}):
        return refuse("no pricing for model", BATCH_PROG)
    cyc = read_cycle()
    bid = fl.get("--batch-id")
    if sub in ("poll", "collect") and not (bid and ID_RE.match(bid)):
        return refuse("--batch-id required", BATCH_PROG)
    try:
        if sub in ("estimate", "submit"):
            if not fl.get("--jobs"):
                return refuse("--jobs required", BATCH_PROG)
            reqs, meta = load_jobs(fl["--jobs"], model)
            est = estimate_usd(cfg, model, meta)
            cap = cfg["per_unit_caps"][lane]
            if est >= cap:
                return refuse("batch estimate $%.2f over the $%s cap" % (est, cap), BATCH_PROG)
            if sub == "estimate":
                print("estimate $%.4f for %d requests (cap $%s)" % (est, len(reqs), cap))
                return 0
            body = json.dumps({"requests": reqs}, ensure_ascii=False).encode("utf-8")
            out = json.loads(http(cfg, "POST", "/v1/messages/batches", body).decode("utf-8", "replace"))
            nid = out.get("id") if isinstance(out, dict) else None
            if not isinstance(nid, str) or not ID_RE.match(nid):
                raise BatchError("create returned no batch id")
            append_ledger(cyc[0], {"ts": now().strftime("%Y-%m-%dT%H:%M:%SZ"), "tenant": tenant_name(), "kind": "estimate",
                                   "lane": lane, "model": model, "batch_id": nid, "cost_usd": est, "n_requests": len(reqs)})
            print(nid)
            return 0
        info = json.loads(http(cfg, "GET", "/v1/messages/batches/" + bid).decode("utf-8", "replace"))
        status = info.get("processing_status") if isinstance(info, dict) else None
        if sub == "poll":
            print(status if isinstance(status, str) else "unknown")
            return 0
        return collect(cfg, cyc, lane, model, bid, status, fl.get("--out"))
    except BatchError as e:
        print("api-batch failed: %s" % e, file=sys.stderr)
        return 1


def collect(cfg, cyc, lane, model, bid, status, out_path):
    if not out_path:
        return refuse("--out required", BATCH_PROG)
    if status != "ended":
        print("api-batch: batch not ended (status %s)" % (status if isinstance(status, str) else "unknown"), file=sys.stderr)
        return 3
    raw = http(cfg, "GET", "/v1/messages/batches/" + bid + "/results").decode("utf-8", "replace")
    n = 0
    sums = {"input_tokens": 0, "output_tokens": 0, "cache_read": 0, "cache_write": 0}
    usd = 0.0
    lines = []
    for line in raw.splitlines():
        if not line.strip():
            continue
        try:
            o = json.loads(line)
        except ValueError:
            continue
        if not isinstance(o, dict):
            continue
        n += 1
        lines.append(line)
        res = o.get("result") if isinstance(o.get("result"), dict) else {}
        msg = res.get("message") if isinstance(res.get("message"), dict) else {}
        u = msg.get("usage") if isinstance(msg.get("usage"), dict) else {}
        if res.get("type") != "succeeded":
            continue  # errored, canceled and expired requests are not billed

        def num(k):
            v = u.get(k, 0)
            return v if isinstance(v, int) and not isinstance(v, bool) else 0
        i, o_, cr, cw = num("input_tokens"), num("output_tokens"), num("cache_read_input_tokens"), num("cache_creation_input_tokens")
        pr = price_of(cfg, model, i + cr + cw)
        usd += (i * pr["input"] + o_ * pr["output"] + cr * pr["cache_read"] + cw * pr["cache_write"]) / 1e6
        sums["input_tokens"] += i
        sums["output_tokens"] += o_
        sums["cache_read"] += cr
        sums["cache_write"] += cw
    tmp = out_path + ".tmp.%d" % os.getpid()
    with open(tmp, "w") as f:
        f.write("".join(l + "\n" for l in lines))
    os.replace(tmp, out_path)
    if any(r.get("kind") == "actual" and r.get("batch_id") == bid for r in read_ledger(cyc[0])):
        print("api-batch: batch already collected; ledger unchanged", file=sys.stderr)
        return 0
    row = {"ts": now().strftime("%Y-%m-%dT%H:%M:%SZ"), "tenant": tenant_name(), "kind": "actual", "lane": lane, "model": model,
           "batch_id": bid, "cost_usd": round(usd, 6), "n_results": n}
    row.update(sums)
    append_ledger(cyc[0], row)
    print("collected %d results, cost $%.4f" % (n, usd))
    return 0


def privileged(args):
    """Run a command through the elevation prefix. Returns (rc, stdout bytes)."""
    try:
        p = subprocess.run(PRIV + args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=30)
        return p.returncode, p.stdout
    except (OSError, subprocess.SubprocessError):
        return 1, b""


def tenant_ledger_dir(t):
    return os.path.join(HOME_BASE, t, "api-ledger")


def tenant_rows(t, start):
    """Rows of tenant t for the cycle, or None when unreadable. Our own ledger is read directly."""
    name = start.strftime("%Y-%m-%d") + ".jsonl"
    if t == os.path.basename(HOME.rstrip("/")):
        return read_ledger(start)
    d = tenant_ledger_dir(t)
    if privileged(["test", "-d", d])[0] != 0:
        return None
    path = os.path.join(d, name)
    if privileged(["test", "-e", path])[0] != 0:
        return []
    rc, out = privileged(["cat", path])
    if rc != 0:
        return None
    rows = []
    for line in out.decode("utf-8", "replace").splitlines():
        try:
            r = json.loads(line)
        except ValueError:
            continue
        if isinstance(r, dict):
            rows.append(r)
    return rows


def fleet_view(cfg, start):
    """Returns (per_tenant {t: (lanes, total) | None}, fleet_lanes, fleet_total)."""
    per, flanes, ftotal = {}, {}, 0.0
    for t in cfg.get("tenants", []):
        rows = tenant_rows(t, start)
        if rows is None:
            per[t] = None
            continue
        lanes, total = totals(rows)
        per[t] = (lanes, total)
        for k, v in lanes.items():
            flanes[k] = flanes.get(k, 0.0) + v
        ftotal += total
    return per, flanes, ftotal


def fleet_marker(cfg, action):
    """Write (touch) or remove HALT-fleet-total in every configured tenant's ledger directory."""
    for t in cfg.get("tenants", []):
        d = tenant_ledger_dir(t)
        if t == os.path.basename(HOME.rstrip("/")):
            d = LEDGER_DIR
        path = os.path.join(d, "HALT-fleet-total")
        if action == "write":
            if d == LEDGER_DIR:
                os.makedirs(d, exist_ok=True)
            if d == LEDGER_DIR or privileged(["test", "-d", d])[0] == 0:
                privileged(["touch", path])
        else:
            privileged(["rm", "-f", path])


DRIFT_FILES = ("api-call", "api-batch", "api-spend", "api-key-install", "api-cycle-rollover", "api_credits.py", "api-credits.json")


def md5_of(path):
    try:
        with open(path, "rb") as f:
            return hashlib.md5(f.read()).hexdigest()
    except OSError:
        return None


def check_drift(cfg, tick):
    for t in cfg.get("tenants", []):
        if t == os.path.basename(HOME.rstrip("/")):
            continue
        d = os.path.join(HOME_BASE, t, "bin", "api-credits")
        if privileged(["test", "-d", d])[0] != 0:
            continue  # not installed on this tenant
        bad = []
        for f in DRIFT_FILES:
            want = md5_of(os.path.join(os.path.dirname(REPO_CONFIG), f) if f.endswith(".json") else os.path.join(HERE, f))
            rc, out = privileged(["md5sum", os.path.join(d, f)])
            got = out.decode("utf-8", "replace").split(" ")[0] if rc == 0 else None
            if want != got:
                bad.append(f + ("(missing)" if got is None else "(differs)"))
        marker = os.path.join(LEDGER_DIR, "DRIFT-" + t)
        if not bad:
            if os.path.exists(marker):
                os.remove(marker)
            continue
        text = " ".join(bad) + "\n"
        try:
            same = open(marker).read() == text
        except OSError:
            same = False
        if same:
            continue
        os.makedirs(LEDGER_DIR, exist_ok=True)
        with open(marker, "w") as f:
            f.write(text)
        if tick:
            with open(tick, "a") as f:
                f.write("%s API credits copy drift on %s: %s" % (now().strftime("%Y-%m-%dT%H:%M:%SZ"), t, text))


def report(fleet=False):
    cfg = load_config()
    cyc = read_cycle()
    if cyc is None:
        return None
    rows = read_ledger(cyc[0])
    lanes, total = totals(rows)
    if fleet:
        _per, _fl, total = fleet_view(cfg, cyc[0])
    t = now()
    elapsed = max((t - cyc[0]).total_seconds() / 86400.0, 0.01)
    length = (cyc[1] - cyc[0]).total_seconds() / 86400.0
    left = max((cyc[1] - t).total_seconds() / 86400.0, 0.0)
    return cfg, cyc, lanes, total, left, total / elapsed * length


def cmd_fleet():
    if not is_apibase():
        print("api-spend --fleet runs on apibase only", file=sys.stderr)
        return 1
    cfg = load_config()
    cyc = read_cycle()
    if cyc is None:
        print("no cycle file in " + LEDGER_DIR, file=sys.stderr)
        return 1
    per, flanes, ftotal = fleet_view(cfg, cyc[0])
    print("cycle %s -> %s (fleet)" % (cyc[0].strftime("%Y-%m-%d"), cyc[1].strftime("%Y-%m-%d")))
    for t in cfg.get("tenants", []):
        if per[t] is None:
            print("tenant %-14s unreadable" % t)
            continue
        lanes, total = per[t]
        for lane in cfg["lane_caps"]:
            print("tenant %-14s %-9s $%7.2f" % (t, lane, lanes.get(lane, 0.0)))
        print("tenant %-14s %-9s $%7.2f" % (t, "total", total))
    for lane, cap in cfg["lane_caps"].items():
        print("fleet  %-14s %-9s $%7.2f / $%d" % ("", lane, flanes.get(lane, 0.0), cap))
    print("fleet  %-14s %-9s $%7.2f / $%d (soft)" % ("", "total", ftotal, cfg["total_soft"]))
    return 0


def cmd_spend(argv):
    if argv == ["--fleet"]:
        return cmd_fleet()
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
    fleet = is_apibase()
    rep = report(fleet)
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
                f.write("%s API credits alert: %s (reached your api credit limit)\n"
                        % (now().strftime("%Y-%m-%dT%H:%M:%SZ"), msg))
    if fleet:
        if total >= cfg["non_overflow_total_stop"]:
            fleet_marker(cfg, "write")
        check_drift(cfg, tick)
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
    if is_apibase():
        fleet_marker(load_config(), "remove")  # only HALT-fleet-total; a plain HALT is never touched
    return 0


def main():
    cmds = {"call": cmd_call, "spend": cmd_spend, "alerts": cmd_alerts, "rollover": cmd_rollover, "batch": cmd_batch}
    if len(sys.argv) < 2 or sys.argv[1] not in cmds:
        print("usage: api_credits.py call|batch|spend|alerts|rollover ...", file=sys.stderr)
        return 2
    return cmds[sys.argv[1]](sys.argv[2:])


if __name__ == "__main__":
    sys.exit(main())
