#!/usr/bin/env bash
# T-0784: tests for scripts/live-check-after-deploy.sh. Temp LIVE_CHECK_DIR, stub commands, no network.
# Run: bash tests/bash/live-check-after-deploy.test.sh   (SCRIPT=<path> runs it against another copy)
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="${SCRIPT:-$REPO/scripts/live-check-after-deploy.sh}"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
FAIL=0
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1${2:+ ($2)}"; FAIL=1; }
check() { if [ "$2" = 1 ]; then pass "$1"; else fail "$1" "${3:-}"; fi; }

A=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
B=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
C=cccccccccccccccccccccccccccccccccccccccc

# new_case <name>: fresh dir, call log, stubs. COMMIT stub prints $STUB_COMMIT; CHECK stub logs and runs $STUB_CHECK_BODY.
new_case() {
  CASE="$1"; D="$T/$CASE/state"; CALLS="$T/$CASE/calls"; mkdir -p "$T/$CASE"; : > "$CALLS"
  cat > "$T/$CASE/commit.sh" <<EOF
#!/bin/sh
echo "commit" >> "$CALLS.commit"
${COMMIT_BODY:-echo "$A"}
EOF
  cat > "$T/$CASE/check.sh" <<EOF
#!/bin/sh
echo "check" >> "$CALLS"
${CHECK_BODY:-exit 0}
EOF
  chmod +x "$T/$CASE/commit.sh" "$T/$CASE/check.sh"
  COMMIT_BODY=""; CHECK_BODY=""
}
run() { # extra env assignments as args
  OUT="$(env LIVE_CHECK_DIR="$D" LIVE_CHECK_COMMIT_CMD="$T/$CASE/commit.sh" LIVE_CHECK_CMD="$T/$CASE/check.sh" "$@" bash "$SCRIPT" run 2>"$T/$CASE/err")"
  RC=$?
}
ncalls() { wc -l < "$CALLS" | tr -d ' '; }
backdate() { printf '%s %s\n' "$1" "$(( $(date +%s) - $2 * 60 ))" > "$D/live-check.seen"; }

# 1. each required setting empty in turn
for name in LIVE_CHECK_DIR LIVE_CHECK_COMMIT_CMD LIVE_CHECK_CMD; do
  new_case "unset-$name"
  OUT="$(env LIVE_CHECK_DIR="$D" LIVE_CHECK_COMMIT_CMD="$T/$CASE/commit.sh" LIVE_CHECK_CMD="$T/$CASE/check.sh" "$name=" bash "$SCRIPT" run 2>&1)"; RC=$?
  [ "$RC" = 2 ] && [ "$OUT" = "live-check after deploy: $name is not set" ] && [ "$(ncalls)" = 0 ] && [ ! -e "$D" ]
  check "empty $name -> exit 2, named, nothing created" $(( $? == 0 )) "rc=$RC out=$OUT"
done

# 2. usage
new_case usage
bash "$SCRIPT" record >/dev/null 2>&1; r1=$?
bash "$SCRIPT" >/dev/null 2>&1; r2=$?
check "argument record -> exit 64" $(( r1 == 64 ))
check "no argument -> exit 64" $(( r2 == 64 ))

# 3. new commit, first run
new_case first; run
s="$(cat "$D/live-check.seen" 2>/dev/null)"
[ -z "$OUT" ] && [ "$(ncalls)" = 0 ] && [[ "$s" =~ ^$A\ [0-9]+$ ]]
check "new commit, first run: no output, no check, seen holds commit and integer" $(( $? == 0 )) "out=$OUT seen=$s"

# 4. settled -> check runs once
backdate "$A" 11; run
[ "$(ncalls)" = 1 ] && [[ "$OUT" == *"live-check after deploy ${A:0:12}: ran, exit 0"* ]] && [ "$(cat "$D/live-check.last")" = "$A" ] && [ ! -e "$D/live-check.seen" ] && [ "$RC" = 0 ]
check "settled commit: check once, ran line, last=A, seen gone" $(( $? == 0 )) "out=$OUT"

# 5. next run, same commit
run
[ -z "$OUT" ] && [ "$(ncalls)" = 1 ]
check "next run with same commit: no output, no second check" $(( $? == 0 ))

# 6. commit changes before settle
new_case changed; mkdir -p "$D"; printf '%s\n' "$A" > "$D/live-check.last"
backdate "$B" 3; COMMIT_BODY=""; cat > "$T/$CASE/commit.sh" <<EOF
#!/bin/sh
echo "$C"
EOF
before="$(date +%s)"; run
sc=""; st=0; read -r sc st < "$D/live-check.seen" 2>/dev/null
[ "$sc" = "$C" ] && [ "$st" -ge $(( before - 1 )) ] && [ "$(ncalls)" = 0 ]
check "commit changes before settle: seen names new commit with new time, no check" $(( $? == 0 )) "seen=$sc $st"

# 7. back to last
new_case back; mkdir -p "$D"; printf '%s\n' "$A" > "$D/live-check.last"; backdate "$B" 3; run
[ ! -e "$D/live-check.seen" ] && [ "$(ncalls)" = 0 ] && [ -z "$OUT" ]
check "commit goes back to last: seen gone, no check" $(( $? == 0 ))

# 8. settle 0
new_case settle0; run LIVE_CHECK_SETTLE_MIN=0
[ "$(ncalls)" = 1 ] && [[ "$OUT" == *"ran, exit 0"* ]]
check "SETTLE_MIN=0: check runs in the same run" $(( $? == 0 )) "out=$OUT"

# 9. check exits 3
new_case exit3; CHECK_BODY="exit 3"; new_case exit3; cat > "$T/$CASE/check.sh" <<EOF
#!/bin/sh
echo check >> "$CALLS"
exit 3
EOF
run LIVE_CHECK_SETTLE_MIN=0
[ "$RC" = 0 ] && [[ "$OUT" == *"exit 3,"* ]] && [ "$(cat "$D/live-check.last")" = "$A" ]
check "check exits 3: line holds exit 3, script exits 0, last written" $(( $? == 0 )) "rc=$RC out=$OUT"

# 10. timeout
new_case tmo; cat > "$T/$CASE/check.sh" <<EOF
#!/bin/sh
echo check >> "$CALLS"
exec sleep 5
EOF
run LIVE_CHECK_SETTLE_MIN=0 LIVE_CHECK_TIMEOUT=1
[[ "$OUT" == *"exit 124,"* ]] && [ "$(cat "$D/live-check.last")" = "$A" ]
check "check longer than timeout: exit 124, last written" $(( $? == 0 )) "out=$OUT"

# 11. bad commit output (three cases)
for variant in "echo xyz" "true" "exit 1"; do
  new_case "badcommit-$variant"; mkdir -p "$D"; printf '%s\n' "$B" > "$D/live-check.last"; printf 'x\n' > "$D/live-check.seen"
  cat > "$T/$CASE/commit.sh" <<EOF
#!/bin/sh
$variant
EOF
  run
  [[ "$OUT" == "live-check after deploy: no commit from LIVE_CHECK_COMMIT_CMD (exit "* ]] && [ "$RC" = 3 ] && [ "$(ncalls)" = 0 ] \
    && [ "$(cat "$D/live-check.last")" = "$B" ] && [ "$(cat "$D/live-check.seen")" = "x" ]
  check "commit command '$variant': no commit line, exit 3, state untouched" $(( $? == 0 )) "rc=$RC out=$OUT"
done

# 12. junk seen file
new_case junkseen; mkdir -p "$D"; printf 'x\n' > "$D/live-check.seen"; run
sc=""; st=0; read -r sc st < "$D/live-check.seen" 2>/dev/null
[ "$sc" = "$A" ] && [[ "$st" =~ ^[0-9]+$ ]] && [ "$(ncalls)" = 0 ]
check "junk seen file: rewritten with commit and time, no check" $(( $? == 0 )) "seen=$(cat "$D/live-check.seen")"

# 13. concurrent run
new_case lock; cat > "$T/$CASE/check.sh" <<EOF
#!/bin/sh
echo check >> "$CALLS"
sleep 3
EOF
( run LIVE_CHECK_SETTLE_MIN=0 ) &
bgpid=$!
for _ in $(seq 1 50); do [ -s "$CALLS" ] && break; sleep 0.1; done
OUT2="$(env LIVE_CHECK_DIR="$D" LIVE_CHECK_COMMIT_CMD="$T/$CASE/commit.sh" LIVE_CHECK_CMD="$T/$CASE/check.sh" LIVE_CHECK_SETTLE_MIN=0 bash "$SCRIPT" run 2>&1)"; RC2=$?
wait "$bgpid"
[ -z "$OUT2" ] && [ "$RC2" = 0 ] && [ "$(ncalls)" = 1 ]
check "second run while the first checks: no output, no call" $(( $? == 0 )) "out=$OUT2 calls=$(ncalls)"

# 14. script text
n="$(grep -c '/home/\|site-sync\|DOCS:drift\|curl ' "$SCRIPT")"
check "script text holds no host path, site-sync, DOCS:drift or curl" $(( n == 0 )) "count=$n"

[ "$FAIL" = 0 ] && echo "live-check-after-deploy tests: all passed" || { echo "live-check-after-deploy tests: FAILED"; exit 1; }
