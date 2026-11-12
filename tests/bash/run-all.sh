#!/usr/bin/env bash
# T-0785: runs every shell test file of this directory, one after the other.
#
# What it runs: each file that matches "$SHELL_TESTS_DIR"/*.test.sh, in LC_ALL=C name order,
# from the repository root, as `timeout "$SHELL_TEST_TIMEOUT" bash <file>` (no argument is passed
# to a test). Nothing is skipped and no list of names exists.
#
# Usage: bash tests/bash/run-all.sh        (no argument; an argument prints a usage line, exit 64)
#
# Settings (environment):
#   SHELL_TESTS_DIR      directory of the test files, default tests/bash under the repository root
#   SHELL_TEST_TIMEOUT   seconds allowed for one file, default 300
#
# Output, three kinds of line:
#   PASS <file> (<seconds>s)      the file exited 0; its output is not printed
#   FAIL <file> (exit <code>)     any other exit (124 = over the time limit); the whole output of
#                                 the file follows. A failing file does not stop the run.
#   shell tests: <p> passed, <f> failed     the last line
# A directory without any test file prints "shell tests: no test file under <dir>".
#
# Exit codes: 0 all files passed; 1 at least one file failed; 2 no test file; 64 bad usage.
#
# CI calls this script in every job named `Lint + Typecheck + Test`; a file named *.test.sh in this directory needs no other registration.
set -u
export LC_ALL=C

if [ "$#" -ne 0 ]; then
  echo "usage: bash tests/bash/run-all.sh   (no argument; settings: SHELL_TESTS_DIR, SHELL_TEST_TIMEOUT)" >&2
  exit 64
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="${SHELL_TESTS_DIR:-tests/bash}"
LIMIT="${SHELL_TEST_TIMEOUT:-300}"

cd "$ROOT" || exit 2

shopt -s nullglob
FILES=("$DIR"/*.test.sh)
shopt -u nullglob
if [ "${#FILES[@]}" -eq 0 ]; then
  echo "shell tests: no test file under $DIR"
  exit 2
fi

OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT

pass=0; fail=0
for f in "${FILES[@]}"; do
  start=$SECONDS
  timeout "$LIMIT" bash "$f" > "$OUT" 2>&1
  rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "PASS $f ($((SECONDS - start))s)"
    pass=$((pass + 1))
  else
    echo "FAIL $f (exit $rc)"
    cat "$OUT"
    fail=$((fail + 1))
  fi
done

echo "shell tests: $pass passed, $fail failed"
[ "$fail" -ge 1 ] && exit 1
exit 0
