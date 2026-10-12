#!/usr/bin/env python3
"""T-0337: provider-limit-alerts issue dedup. Stubbed gh, temp state file, no DB."""
import importlib.util
import json
import os
import tempfile
import types

here = os.path.dirname(os.path.abspath(__file__))
tmp = tempfile.mkdtemp()
os.environ["LIMIT_ALERT_STATE"] = os.path.join(tmp, "state.json")
spec = importlib.util.spec_from_file_location("pla", os.path.join(here, "..", "provider-limit-alerts.py"))
pla = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pla)

issues = []   # open issues: {"number", "title", "body"}
calls = []


def fake_gh(*a):
    calls.append(a)
    out = ""
    if a[:2] == ("issue", "list"):
        out = json.dumps(issues)
    elif a[:2] == ("issue", "create"):
        n = 100 + len(issues)
        issues.append({"number": n, "title": a[a.index("--title") + 1], "body": a[a.index("--body") + 1]})
        out = f"https://github.com/x/y/issues/{n}\n"
    return types.SimpleNamespace(stdout=out, stderr="", returncode=0)


pla.gh = fake_gh


def writes():
    return [c[1] for c in calls if c[:2] in (("issue", "create"), ("issue", "comment"))]


T0 = 1_000_000.0

# first run creates, second run (>24h) comments, third within 24h of that does nothing
pla.sync_limit_issues([("threatintel", "ThreatIntel", 95, 100, "daily", 95)], now=T0)
assert writes() == ["create"], writes()
assert "<!-- limit-alert:threatintel -->" in issues[0]["body"]

calls.clear()
pla.sync_limit_issues([("threatintel", "ThreatIntel", 97, 100, "daily", 97)], now=T0 + 25 * 3600)
assert writes() == ["comment"], writes()
assert len(issues) == 1

calls.clear()
pla.sync_limit_issues([("threatintel", "ThreatIntel", 98, 100, "daily", 98)], now=T0 + 26 * 3600)
assert writes() == [], "within 24h of the last comment: nothing"

# used% > 100: alert once per raw values, even with the issue closed
over = [("zyte", "Zyte", 251, 5, "credits", 5020)]
calls.clear()
pla.sync_limit_issues(over, now=T0)
assert writes() == ["create"]
assert "used=251, free_limit=5" in issues[-1]["body"] and "Unit source" in issues[-1]["body"]
issues[:] = [i for i in issues if "zyte" not in i["body"]]
calls.clear()
pla.sync_limit_issues(over, now=T0 + 99 * 3600)
assert writes() == [], "same raw numbers: no re-alert"
pla.sync_limit_issues([("zyte", "Zyte", 260, 5, "credits", 5200)], now=T0 + 100 * 3600)
assert writes() == ["create"], "changed raw numbers alert again"

# gh outage: list fails (rc!=0) -> never create a second issue (the #362-vs-#156 scenario)
orig_gh = pla.gh
def failing_list_gh(*a):
    if a[:2] == ("issue", "list"):
        return types.SimpleNamespace(stdout="", stderr="boom", returncode=1)
    return orig_gh(*a)
pla.gh = failing_list_gh
calls.clear()
pla.sync_limit_issues([("newprov", "NewProv", 95, 100, "daily", 95)], now=T0)
assert writes() == [], "list failure must not create"

# list succeeds but empty (search lag) while state remembers an open issue -> comment, not create
pla.gh = orig_gh
issues.clear()
pla._save_limit_state({"lagprov": {"raw": "1/2/daily", "last_action": 0, "issue": 777}})
def lag_gh(*a):
    calls.append(a)
    if a[:2] == ("issue", "list"):
        return types.SimpleNamespace(stdout="[]", stderr="", returncode=0)
    if a[:2] == ("issue", "view"):
        return types.SimpleNamespace(stdout='{"state":"OPEN"}', stderr="", returncode=0)
    return types.SimpleNamespace(stdout="", stderr="", returncode=0)
pla.gh = lag_gh
calls.clear()
pla.sync_limit_issues([("lagprov", "LagProv", 95, 100, "daily", 95)], now=T0 + 99 * 3600)
assert writes() == ["comment"], writes()
pla.gh = orig_gh

# create stores the issue number in state
pla.sync_limit_issues([("storeprov", "StoreProv", 95, 100, "daily", 95)], now=T0)
assert pla._load_limit_state()["storeprov"].get("issue"), pla._load_limit_state()

# unavailable provider is moot
pla.ap.provider_is_retired = lambda p: p == "api2pdf"
assert pla.limit_moot("api2pdf") and not pla.limit_moot("threatintel")
print("test-limit-alerts-dedup: OK")
