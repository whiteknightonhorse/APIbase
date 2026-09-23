#!/usr/bin/env python3
"""test-fix-boundaries.py — T-0172 (0171 ruling-1, Задача 2): proves
_fix_boundaries() extracts ONLY the ALLOWED/FORBIDDEN bullets from a
fix.md-shaped file, truncated at each bullet's own sentence boundary,
instead of gluing fix.md's completion-protocol paragraph ("Make the
minimal change. End with: FIX_DONE ... or FIX_UNRECOVERABLE ...") onto
FORBIDDEN. That paragraph follows FORBIDDEN's sentence with NO blank line
to stop a naive glue-until-blank-line join on — the bug 0171 ruling-1
diagnosed as live in 143 taskloop briefs (see AUTOPILOT-PROGRESS.md
#T-0172-fix-boundaries-importer-leaks-fix-done-into-briefs).

Uses the AUTOPILOT_FIX_MD override (same convention as
drill-incident-lifecycle.py's isolated_env() / incident-engine.py
--selftest-db) pointed at a disposable copy of fix.md's real markup in
/tmp — never reads scripts/night-orchestra/roles/fix.md (deploy tree,
gitignored, per this task's own boundary: fix.md itself is not touched).
Runs the check in a fresh subprocess so the module-level
`FIX_MD_PATH = os.environ.get("AUTOPILOT_FIX_MD", ...)` picks up the
override cleanly, the same way a real taskloop-generator invocation would.

Usage: python3 scripts/autopilot/test-fix-boundaries.py
Exit 0 = PASS, 1 = FAIL.
"""
import os
import subprocess
import sys
import tempfile

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))

# Real markup, byte-for-byte the same shape as scripts/night-orchestra/
# roles/fix.md (captured 2026-09-03, unchanged since — see
# _FIX_BOUNDARIES_FALLBACK's own docstring note in autopilot_common.py):
# FORBIDDEN's bullet wraps across two indented continuation lines, then
# fix.md's own completion-protocol paragraph follows immediately, no blank
# line in between.
FIX_MD_TEXT = (
    "ROLE: SELF-HEAL / FIX agent (night orchestra). A previous step failed. "
    "Here is the failing step and its log tail:\n\n"
    "STEP: __STEP__\n"
    "LOG_TAIL:\n"
    "__LOGTAIL__\n\n"
    "Diagnose the root cause and FIX it so the step can succeed on retry. Strictly bounded:\n"
    "- ALLOWED: fix TypeScript/ESLint/Zod-schema errors, fix a broken adapter request/parse, fix a failing\n"
    "  seed/build/deploy command, fix a test/CI failure, correct a config typo, free disk if that's the cause.\n"
    "- FORBIDDEN: redesigning architecture, inventing features, changing API contracts, modifying the frozen\n"
    "  spec, deleting data/DB/backups, spending money. If the only fix would violate these, do NOT fix —\n"
    "  output FIX_UNRECOVERABLE <one-line reason> and exit.\n"
    "Make the minimal change. End with: FIX_DONE <what you changed>  or  FIX_UNRECOVERABLE <reason>.\n"
)

CHECKER = """
import autopilot_common as m

result = m._fix_boundaries()
fallback = m._FIX_BOUNDARIES_FALLBACK
ok = True

if result != fallback:
    print("FAIL: _fix_boundaries() result != _FIX_BOUNDARIES_FALLBACK")
    print("--- result ---"); print(result)
    print("--- fallback ---"); print(fallback)
    ok = False

if "FIX_DONE" in result or "FIX_UNRECOVERABLE" in result:
    print("FAIL: completion-protocol tokens leaked into the boundaries text:")
    print(result)
    ok = False

forbidden = next((ln for ln in result.splitlines() if ln.startswith("- FORBIDDEN")), None)
if not forbidden or not forbidden.endswith("spending money."):
    print(f"FAIL: FORBIDDEN bullet does not end at 'spending money.': {forbidden!r}")
    ok = False

print("PASS" if ok else "FAIL")
raise SystemExit(0 if ok else 1)
"""


def main() -> bool:
    fd, fix_md_path = tempfile.mkstemp(prefix="fix-md-copy-", suffix=".md")
    checker_fd, checker_path = tempfile.mkstemp(prefix="test-fix-boundaries-checker-", suffix=".py")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(FIX_MD_TEXT)
        with os.fdopen(checker_fd, "w", encoding="utf-8") as f:
            f.write(CHECKER)
        env = dict(os.environ)
        env["AUTOPILOT_FIX_MD"] = fix_md_path
        env["PYTHONPATH"] = SCRIPTS_DIR + os.pathsep + env.get("PYTHONPATH", "")
        proc = subprocess.run(
            [sys.executable, checker_path], cwd=SCRIPTS_DIR, env=env,
            capture_output=True, text=True,
        )
        sys.stdout.write(proc.stdout)
        sys.stderr.write(proc.stderr)
        return proc.returncode == 0
    finally:
        os.remove(fix_md_path)
        os.remove(checker_path)


if __name__ == "__main__":
    ok = main()
    print("PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)
