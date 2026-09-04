#!/usr/bin/env python3
"""drills.py — AP-11 (820-autopilot-drills.md, taskloop T-820) top-level
entry point. Runs all three required drills in sequence and prints one
PASS/FAIL summary:

  1. tests/integration/autopilot-drill-provider-health.test.ts (jest) —
     synthetic DOWN provider + synthetic 401, against a REAL local HTTP
     socket, through the REAL provider-health.job.ts.
  2. drill-incident-lifecycle.py — the same two scenarios' proven row shapes
     driven through the REAL incident-engine.py (disposable Postgres), to
     RESOLVED (DOWN) / WAITING_HUMAN (401), verified against the REAL
     incidents.service.ts / dashboard.service.ts.
  3. drill-email-injection.py — synthetic prompt-injection email through the
     REAL email-intake.py classification path (rules + haiku, both real
     code), never executes, always enum-bounded.

Each is independently runnable (see each file's own docstring). This script
exists for one-command acceptance ("did the drills actually pass, right
now") and for the runbook. It does NOT perform mutation control itself —
that is a one-off, deliberate, human/agent-driven procedure (break one line
of production code, confirm RED, `git checkout` it back, confirm GREEN);
see docs/runbook.md "10. Autopilot" and AUTOPILOT-PROGRESS.md's T-820 entry
for the exact commands and transcripts that were actually run.

Usage: python3 scripts/autopilot/drills.py [--skip-jest]
"""
import subprocess
import sys

SCRIPTS_DIR = __import__("os").path.dirname(__import__("os").path.abspath(__file__))
ROOT = __import__("os").path.dirname(__import__("os").path.dirname(SCRIPTS_DIR))


def run(label, cmd, **kw):
    print(f"\n########## {label} ##########")
    r = subprocess.run(cmd, cwd=ROOT, **kw)
    # drill-incident-lifecycle.py's own three-way verdict: rc=0 GREEN, rc=1
    # RED, rc=2 NOINFO (core lifecycle passed, its API-layer sub-check never
    # ran this pass). NOINFO must not print as PASS here either -- it rolls
    # into the overall summary as a fail so a real omission never reads as a
    # green run, but the per-drill line keeps NOINFO visible as its own word,
    # not silently relabeled RED.
    if r.returncode == 2:
        print(f"########## {label}: NOINFO (rc=2) ##########")
        return False
    ok = r.returncode == 0
    print(f"########## {label}: {'PASS' if ok else 'FAIL'} (rc={r.returncode}) ##########")
    return ok


def main():
    skip_jest = "--skip-jest" in sys.argv
    results = {}

    if not skip_jest:
        results["drill-provider-health.test.ts (jest)"] = run(
            "1/3 synthetic DOWN + 401 (jest, real socket)",
            ["npx", "jest", "tests/integration/autopilot-drill-provider-health.test.ts", "--no-coverage"],
        )
    else:
        print("(--skip-jest: skipping drill 1/3)")

    results["drill-incident-lifecycle.py"] = run(
        "2/3 incident-engine.py full cycle (disposable Postgres)",
        ["python3", f"{SCRIPTS_DIR}/drill-incident-lifecycle.py"],
    )
    results["drill-email-injection.py"] = run(
        "3/3 email injection (disposable Postgres)",
        ["python3", f"{SCRIPTS_DIR}/drill-email-injection.py"],
    )

    print("\n================ AP-11 drills summary ================")
    all_ok = True
    for name, ok in results.items():
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
        all_ok = all_ok and ok
    print("========================================================")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
