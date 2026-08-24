#!/usr/bin/env python3
"""connected_db.py — orchestra ledger of CONNECTED providers + key-queue pruning + completion verification.
Closes: (1) the Telegram key-file re-asking for already-connected APIs, (2) the "ONBOARD_OK but no adapter" bug."""
import json, sys, os, time, re, pathlib
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent                      # /home/apibase/apibase
DB = HERE / "state" / "connected.json"
KEYQ = HERE / "state" / "key-required-queue.md"
ADAPTERS = ROOT / "src" / "adapters"
CONFIG = ROOT / "config" / "tool_provider_config.yaml"
FAILED = HERE / "state" / "failed.txt"

def load(): return json.loads(DB.read_text(encoding="utf-8")) if DB.exists() else {}
def save(d): DB.write_text(json.dumps(d, indent=1, ensure_ascii=False), encoding="utf-8")
def in_config(lc):
    if not CONFIG.exists(): return False
    t = CONFIG.read_text(encoding="utf-8")
    return bool(re.search(r"provider:\s*%s\b" % re.escape(lc), t) or re.search(r"tool_id:.*%s\." % re.escape(lc), t))
def verify(lc):
    lc = lc.lower()
    # requires BOTH adapter file AND config row (A-08 fix). Try name variants (hyphen/underscore/none) — fixed 2026-07-01
    for name in {lc, lc.replace("-",""), lc.replace("-","_"), lc.replace("_","-"), lc.replace("_","")}:
        if (ADAPTERS / name / "index.ts").exists() and in_config(name):
            return True
    return False

def seed():
    d = load()
    for p in sorted(ADAPTERS.glob("*/")):
        lc = p.name
        if lc.startswith("."): continue
        ver = verify(lc)
        e = d.get(lc, {})
        e["status"] = "connected" if ver else e.get("status", "partial")
        e["adapter"] = (p / "index.ts").exists(); e["verified"] = ver
        e.setdefault("since", int(time.time())); d[lc] = e
    if FAILED.exists():
        for ln in FAILED.read_text(encoding="utf-8").splitlines():
            m = re.search(r"\]\s*([a-z0-9_-]+)\s*[—-]", ln)
            nm = (m.group(1) if m else "").lower()
            if nm and d.get(nm, {}).get("status") not in ("connected",):
                d.setdefault(nm, {}); d[nm].update({"status": "blocked", "verified": False}); d[nm].setdefault("since", int(time.time()))
    save(d)
    print("seeded %d providers (connected=%d, blocked=%d)" % (len(d), sum(1 for v in d.values() if v.get("status")=="connected"), sum(1 for v in d.values() if v.get("status")=="blocked")))

def set_status(name, status):
    lc = name.lower(); d = load(); e = d.get(lc, {})
    e["status"] = status; e["verified"] = (status == "connected")
    e["adapter"] = (ADAPTERS / lc / "index.ts").exists(); e.setdefault("since", int(time.time())); d[lc] = e; save(d)
    if status == "connected": prune_queue()
    print("%s=%s" % (lc, status))

def is_connected(name): return load().get(name.lower(), {}).get("status") == "connected"

SHORT_KW = {"vam": "victoria"}
def _section_keys(title):
    keys = set(); words = title.replace("##", "").strip().split()
    if words: keys.add(re.sub(r"[^a-z0-9]", "", words[0].lower()))
    for m in re.findall(r"\(([A-Za-z0-9&+]{2,14})\)", title): keys.add(re.sub(r"[^a-z0-9]", "", m.lower()))
    return keys
def prune_queue():
    if not KEYQ.exists(): return
    d = load()
    remove = set(k for k, v in d.items() if v.get("status") in ("connected", "blocked", "skip"))
    if not remove: print("prune: nothing to remove"); return
    text = KEYQ.read_text(encoding="utf-8")
    parts = re.split(r"(?m)^(?=## )", text)
    head = parts[0]; kept = []; dropped = []
    for sec in parts[1:]:
        title = sec.splitlines()[0] if sec.splitlines() else ""
        tkey = re.sub(r"[^a-z0-9]", "", title.lower()); skeys = _section_keys(title)
        if "round-trip resolved" in title.lower() or "operator round" in title.lower():
            dropped.append(title.strip() + " ->log-noise"); continue
        def hits(c):
            if c in SHORT_KW: return SHORT_KW[c] in tkey
            return c in skeys or (len(c) >= 4 and c in tkey)
        hit = next((c for c in remove if hits(c)), None)
        (dropped if hit else kept).append((title.strip() + " ->" + hit) if hit else sec)
    KEYQ.write_text(head + "".join(kept), encoding="utf-8")
    print("pruned %d: %s" % (len(dropped), [x for x in dropped]))

if __name__ == "__main__":
    c = sys.argv[1] if len(sys.argv) > 1 else ""
    if c == "seed": seed()
    elif c == "set": set_status(sys.argv[2], sys.argv[3])
    elif c == "is-connected": sys.exit(0 if is_connected(sys.argv[2]) else 1)
    elif c == "verify": sys.exit(0 if verify(sys.argv[2]) else 1)
    elif c == "prune": prune_queue()
    else: print("usage: seed | set <name> <status> | is-connected <name> | verify <name> | prune")
