#!/usr/bin/env bash
# T-0785: tests/bash/run-all.sh, run against temporary directories of stub files only.
# No case runs the real tests of the repository; nothing touches the network.
# RUN_ALL_SCRIPT points the cases at another copy of the runner (the mutation run).
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
RUNNER="${RUN_ALL_SCRIPT:-$REPO/tests/bash/run-all.sh}"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
FAIL=0
ok()  { echo "ok:   $1"; }
bad() { echo "FAIL: $1"; FAIL=1; }

# run <dir> [timeout]: output in $T/o, exit code in $rc
run() { SHELL_TESTS_DIR="$1" SHELL_TEST_TIMEOUT="${2:-30}" bash "$RUNNER" > "$T/o" 2>&1; rc=$?; }
mk() { rm -rf "$T/d"; mkdir -p "$T/d"; }

# 1. two passing stubs
mk; printf 'exit 0\n' > "$T/d/a.test.sh"; printf 'exit 0\n' > "$T/d/b.test.sh"
run "$T/d"
[ "$rc" = 0 ] && ok "two pass: exit 0" || bad "two pass: exit $rc"
[ "$(grep -c '^PASS ' "$T/o")" = 2 ] && ok "two PASS lines" || bad "two PASS lines"
[ "$(grep '^PASS ' "$T/o" | head -n 1 | cut -d' ' -f2)" = "$T/d/a.test.sh" ] && ok "name order" || bad "name order"
grep -qx 'shell tests: 2 passed, 0 failed' "$T/o" && ok "two pass: summary" || bad "two pass: summary"

# 2. a failing stub does not stop the run
mk; printf 'echo boom\nexit 3\n' > "$T/d/a.test.sh"; printf 'exit 0\n' > "$T/d/b.test.sh"
run "$T/d"
[ "$rc" = 1 ] && ok "boom: exit 1" || bad "boom: exit $rc"
grep -qxF "FAIL $T/d/a.test.sh (exit 3)" "$T/o" && ok "boom: FAIL line" || bad "boom: FAIL line"
grep -qx 'boom' "$T/o" && ok "boom: output shown" || bad "boom: output shown"
grep -q "^PASS $T/d/b.test.sh" "$T/o" && ok "boom: second stub still runs" || bad "boom: second stub still runs"
grep -qx 'shell tests: 1 passed, 1 failed' "$T/o" && ok "boom: summary" || bad "boom: summary"

# 3. output of a passing file is not printed
mk; printf 'echo quiet\nexit 0\n' > "$T/d/a.test.sh"
run "$T/d"
if grep -q 'quiet' "$T/o"; then bad "quiet output printed"; else ok "passing output not printed"; fi

# 4. empty directory, missing directory
mk; run "$T/d"
{ [ "$rc" = 2 ] && grep -q '^shell tests: no test file under' "$T/o"; } && ok "empty dir: exit 2" || bad "empty dir (exit $rc)"
run "$T/nonexistent"
{ [ "$rc" = 2 ] && grep -q '^shell tests: no test file under' "$T/o"; } && ok "missing dir: exit 2" || bad "missing dir (exit $rc)"

# 5. only non-matching files
mk; printf 'echo ran > "%s/ran"\n' "$T" > "$T/d/helper.sh"; cp "$T/d/helper.sh" "$T/d/old.test.sh.off"
run "$T/d"
{ [ "$rc" = 2 ] && grep -q '^shell tests: no test file under' "$T/o" && [ ! -e "$T/ran" ]; } && ok "non-matching files: exit 2, none run" || bad "non-matching files (exit $rc)"

# 6. timeout
mk; printf 'sleep 5\n' > "$T/d/a.test.sh"
run "$T/d" 1
{ [ "$rc" = 1 ] && grep -qxF "FAIL $T/d/a.test.sh (exit 124)" "$T/o"; } && ok "timeout: exit 124 reported" || bad "timeout (exit $rc)"

# 7. argument
bash "$RUNNER" x > "$T/o" 2>&1; rc=$?
[ "$rc" = 64 ] && ok "argument: exit 64" || bad "argument: exit $rc"

# 8. text of the real runner
[ "$(grep -c '|| true\|/home/\|HOME' "$REPO/tests/bash/run-all.sh")" = 0 ] && ok "runner text clean" || bad "runner text"

# 9. wiring: every job named like the acceptance job calls the runner
total=0; wired_ok=1
for w in "$REPO"/.github/workflows/*; do
  [ -f "$w" ] || continue
  n=$(sed 's/^ *//' "$w" | grep -cx 'name: Lint + Typecheck + Test')
  s=$(sed 's/^ *//' "$w" | grep -cx 'run: bash tests/bash/run-all.sh')
  [ "$n" = "$s" ] || wired_ok=0
  total=$((total + n))
done
{ [ "$wired_ok" = 1 ] && [ "$total" -ge 1 ]; } && ok "wiring: $total acceptance job(s), each with the step" || bad "wiring (jobs=$total)"

exit "$FAIL"
