#!/usr/bin/env python3
"""provider-limit-alerts.py — warn when a provider's FREE upstream quota is ~exhausted.

For every provider with a finite free tier (limit_type daily/monthly/hourly/credits/trial),
count real upstream calls (execution_ledger.provider_called=true) in the provider's reset window
and, at >=THRESHOLD% of free_limit, open/update a GitHub issue. Unlimited / rate_limited(0) skip.
Runs hourly via cron. No secrets printed. Source of truth: src/config/provider-limits.json + DB.
"""
import json, subprocess, sys, os

ROOT = "/home/apibase/apibase"
REPO = "whiteknightonhorse/APIbase"
THRESHOLD = float(os.environ.get("LIMIT_ALERT_PCT", "90"))
LABEL = "limit-alert"

def psql(sql):
    out = subprocess.run(
        ["docker","exec","apibase-postgres-1","psql","-U","apibase","-d","apibase","-tAF\t","-c",sql],
        capture_output=True, text=True)
    return out.stdout.strip()

def gh(*args):
    return subprocess.run(["gh",*args], capture_output=True, text=True, cwd=ROOT)

cfg = json.load(open(f"{ROOT}/src/config/provider-limits.json"))

# one pass: per-provider call counts in each window (real upstream hits only)
rows = psql("""
  SELECT t.provider,
    count(*) FILTER (WHERE el.created_at >= now() - interval '1 hour') AS h,
    count(*) FILTER (WHERE el.created_at >= date_trunc('day',   now() at time zone 'UTC')) AS d,
    count(*) FILTER (WHERE el.created_at >= date_trunc('month', now() at time zone 'UTC')) AS m,
    count(*) AS total
  FROM execution_ledger el JOIN tools t ON t.tool_id = el.tool_id
  WHERE el.provider_called = true
  GROUP BY t.provider
""")
usage = {}
for line in rows.splitlines():
    p,h,d,m,tot = line.split("\t")
    usage[p] = {"hourly":int(h),"daily":int(d),"monthly":int(m),"none":int(tot)}

WINDOW = {"hourly":"hourly","daily":"daily","monthly":"monthly","credits":"none","trial":"none"}
alerts = []
for prov, c in cfg.items():
    lt = c.get("limit_type"); lim = int(c.get("free_limit") or 0)
    if lt not in WINDOW or lim <= 0:
        continue
    used = usage.get(prov, {}).get(WINDOW[lt], 0)
    pct = used / lim * 100
    if pct >= THRESHOLD:
        alerts.append((prov, c.get("display_name", prov), used, lim, lt, round(pct)))

# upsert one GitHub issue per breaching provider (idempotent by title prefix)
def open_issues():
    r = gh("issue","list","--repo",REPO,"--state","open","--search","Limit in:title","--limit","100",
           "--json","number,title")
    try: return json.loads(r.stdout or "[]")
    except Exception: return []

existing = {i["title"]: i["number"] for i in open_issues()}
for prov, disp, used, lim, lt, pct in alerts:
    title = f"Limit {pct}%: {disp} ({used}/{lim} {lt})"
    prefix = f"Limit "  # match any prior pct for this provider
    body = (f"Provider **{disp}** (`{prov}`) free upstream quota is at **{pct}%** "
            f"({used} / {lim} calls, {lt} window).\n\n"
            f"At 100% the upstream starts rejecting / charging. Options: add a paid plan + funds, "
            f"rotate to a backup provider, or throttle. Auto-detected by provider-limit-alerts (hourly). "
            f"Resets on the {lt} boundary.")
    # find any existing open issue for this provider (different pct in title)
    found = next((num for t,num in existing.items() if t.startswith(prefix) and f"{disp} (" in t), None)
    if found:
        print(f"skip (already open #{found}): {disp} {pct}%")
        continue
    r = gh("issue","create","--repo",REPO,"--title",title,"--body",body)
    print(f"created: {title} -> {r.stdout.strip().splitlines()[-1] if r.stdout else r.stderr[:80]}")

print(f"limit-alerts: checked {sum(1 for c in cfg.values() if c.get('limit_type') in WINDOW and int(c.get('free_limit') or 0)>0)} finite-limit providers, {len(alerts)} at >={int(THRESHOLD)}%")
