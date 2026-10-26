#!/usr/bin/env python3
"""T-0581: ops issue target constant and body scrubber. No network, no gh."""
import os
import subprocess
import sys

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
import ops_issues  # noqa: E402

assert ops_issues.OPS_ISSUES_REPO == "whiteknightonhorse/apibase-internal" or os.environ.get("OPS_ISSUES_REPO")

body = "Server: 5.78.135.159 path /home/apibase/apibase/x.sh proc aipush ok 1.2.3.4"
out = ops_issues.redact(body)
for leaked in ("5.78.135.159", "/home/apibase", "aipush"):
    assert leaked not in out, out
assert "1.2.3.4" in out and out.count("<redacted>") == 3, out

# only issue writes with a body are touched
a = ops_issues.scrub_gh_args(["issue", "create", "--repo", "r", "--title", "5.78.135.159", "--body", body])
assert "5.78.135.159" in a[a.index("--title") + 1] and "5.78.135.159" not in a[a.index("--body") + 1]
assert ops_issues.scrub_gh_args(["issue", "list", "--search", "aipush"]) == ["issue", "list", "--search", "aipush"]

# fail-closed: unreadable list raises
ops_issues.REDACT_PATH = "/nonexistent/redact.json"
try:
    ops_issues.redact("x")
    raise SystemExit("redact must fail closed")
except FileNotFoundError:
    pass

# shell helper: constant with env override, scrub via stdin
env = dict(os.environ, OPS_ISSUES_REPO="dummy/dummy")
r = subprocess.run(["bash", "-c", f'source {here}/../lib/ops-issues.sh; echo "$OPS_ISSUES_REPO"; echo "at 5.78.135.159" | ops_redact'],
                   capture_output=True, text=True, env=env)
assert r.stdout.split("\n")[0] == "dummy/dummy" and "<redacted>" in r.stdout and "5.78" not in r.stdout, r.stdout + r.stderr
print("ops-issues selftest OK")
