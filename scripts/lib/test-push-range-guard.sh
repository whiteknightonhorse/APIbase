#!/bin/bash
# T-0808: tests for push-range-guard.sh and push-guard-init.sh. Temp repos only, no network.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GUARD="$ROOT/scripts/lib/push-range-guard.sh"
INIT="$ROOT/scripts/lib/push-guard-init.sh"
INTERP="${GUARD_SH:-sh}"
ZERO=0000000000000000000000000000000000000000
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
export HOME="$T/home"; mkdir -p "$HOME"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
unset HUSKY
FAILED=0
RC=0; ERR=""

g() { git -c core.hooksPath=/dev/null "$@"; }

# mk <name>: repo with bare origin, base commit on main pushed, branch ci-staging checked out
mk() {
  local d="$T/$1"
  g init -q --bare -b main "$d.git"
  g init -q -b main "$d"
  (cd "$d" && g remote add origin "$d.git" && echo base >f && g add f && g commit -qm "T-0001: base" \
    && g push -q origin main && g checkout -q -b ci-staging) >/dev/null 2>&1
  echo "$d"
}
cm() { (cd "$1" && echo "$2" >>"f-$2" && g add "f-$2" && g commit -qm "T-0001: $2"); }
sha() { (cd "$1" && g rev-parse "$2"); }

# run <repo> <stdin-text>: runs the guard script
run() {
  ERR="$T/err"
  (cd "$1" && printf '%s\n' "$2" | "$INTERP" "$GUARD" 2>"$ERR" >/dev/null)
  RC=$?
  ERRTXT="$(cat "$ERR")"
}
check() { # <n> <ok-condition-result 0/1> <desc>
  if [ "$2" = 0 ]; then echo "PASS $1"; else echo "FAIL $1 ($3)"; FAILED=$((FAILED+1)); fi
}
line() { printf 'refs/heads/x %s %s %s\n' "$1" "$2" "$3"; } # <local> <remote ref> <remote sha>
has() { case "$ERRTXT" in *"$1"*) return 0 ;; esac; return 1; }

# stash-style commit: subject <s> on top of ci-staging, normal content
subj_commit() { (cd "$1" && echo "$2" >>"s-$RANDOM" && g add -A && g commit -qm "$2"); }

# 1
R=$(mk c1); B=$(sha "$R" HEAD); cm "$R" one
run "$R" "$(line "$(sha "$R" HEAD)" refs/heads/ci-staging "$B")"
check 1 $RC "rc=$RC"
# 2
R=$(mk c2); B=$(sha "$R" HEAD); subj_commit "$R" "index on ci-staging: 8194e17e T-0705: x"; H=$(sha "$R" HEAD)
run "$R" "$(line "$H" refs/heads/ci-staging "$B")"
[ $RC = 1 ] && has "${H:0:8}" && has "git-stash commit"; check 2 $? "rc=$RC"
# 3
R=$(mk c3); B=$(sha "$R" HEAD); subj_commit "$R" "WIP on ci-staging: abc"
run "$R" "$(line "$(sha "$R" HEAD)" refs/heads/ci-staging "$B")"
check 3 $([ $RC = 1 ]; echo $?) "rc=$RC"
# 4
R=$(mk c4); B=$(sha "$R" HEAD); (cd "$R" && g commit -q --allow-empty -m "T-0001: nothing")
run "$R" "$(line "$(sha "$R" HEAD)" refs/heads/ci-staging "$B")"
[ $RC = 1 ] && has "empty commit"; check 4 $? "rc=$RC"
# 5 the 0805 sequence
R=$(mk c5); cm "$R" b; B=$(sha "$R" HEAD)
(cd "$R" && echo change >>f && g stash -q && g checkout -q stash 2>/dev/null && echo g >g && g add g \
  && g commit -qm "T-0805: on stash" -- g && g rebase -q ci-staging) >/dev/null 2>&1
run "$R" "$(line "$(sha "$R" HEAD)" refs/heads/ci-staging "$B")"
check 5 $([ $RC = 1 ]; echo $?) "rc=$RC"
# 6 merge commit
R=$(mk c6); B=$(sha "$R" HEAD); cm "$R" m1
(cd "$R" && g checkout -q -b side && echo s >s && g add s && g commit -qm "T-0001: side" && g checkout -q ci-staging \
  && g merge -q --no-ff side -m "T-0001: merge side") >/dev/null 2>&1
cm "$R" m2
run "$R" "$(line "$(sha "$R" HEAD)" refs/heads/ci-staging "$B")"
check 6 $RC "rc=$RC"
# 7
R=$(mk c7); B=$(sha "$R" HEAD); (cd "$R" && g commit -q --allow-empty -m "T-0001: nothing")
run "$R" "$(line "$(sha "$R" HEAD)" refs/heads/T-0808-x "$B")"
check 7 $RC "rc=$RC"
# 8
R=$(mk c8)
run "$R" "$(line "$ZERO" refs/heads/ci-staging "$(sha "$R" HEAD)")"
check 8 $RC "rc=$RC"
# 9
R=$(mk c9); (cd "$R" && g commit -q --allow-empty -m "T-0001: nothing")
run "$R" "$(line "$(sha "$R" HEAD)" refs/heads/ci-staging "$ZERO")"
check 9 $([ $RC = 1 ]; echo $?) "rc=$RC"
# 10
R=$(mk c10); cm "$R" one
run "$R" "$(line "$(sha "$R" HEAD)" refs/heads/ci-staging 1111111111111111111111111111111111111111)"
check 10 $RC "rc=$RC"
# 11
R=$(mk c11); B=$(sha "$R" HEAD); subj_commit "$R" "index on ci-staging: 8194e17e T-0705: x"; H=$(sha "$R" HEAD)
run "$R" "$(line "$H" refs/heads/T-0808-x "$B")
$(line "$H" refs/heads/ci-staging "$B")
"
check 11 $([ $RC = 1 ]; echo $?) "rc=$RC"

# 12 the real runner
if [ ! -f "$ROOT/.husky/_/h" ]; then
  echo "FAIL 12 (husky runner missing)"; FAILED=$((FAILED+1))
else
  mkdir -p "$T/hk/_" "$T/cfg/husky"
  cp "$ROOT/.husky/_/h" "$ROOT/.husky/_/pre-push" "$T/hk/_/"
  cp "$ROOT/.husky/_/h" "$T/hk/_/pre-commit"
  echo 'exit 0' >"$T/hk/pre-push"; echo 'exit 0' >"$T/hk/pre-commit"
  cp "$INIT" "$T/cfg/husky/init.sh"
  R=$(mk c12); B=$(sha "$R" HEAD); mkdir -p "$R/scripts/lib"; cp "$GUARD" "$R/scripts/lib/"
  cm "$R" ok; OK=$(line "$(sha "$R" HEAD)" refs/heads/ci-staging "$B")
  subj_commit "$R" "index on ci-staging: 8194e17e T-0705: x"; BAD=$(line "$(sha "$R" HEAD)" refs/heads/ci-staging "$B")
  # runner <repo> <hook> <stdin> [env...]
  runner() { local repo="$1" hook="$2" in="$3"; shift 3
    (cd "$repo" && printf '%s\n' "$in" | env XDG_CONFIG_HOME="$T/cfg" "$@" sh "$T/hk/_/$hook" origin x 2>"$T/err" >/dev/null); RC=$?
    ERRTXT="$(cat "$T/err")"; }
  runner "$R" pre-push "$BAD" A=1; [ $RC = 1 ] && has "BLOCKED:"; check 12a $? "rc=$RC"
  runner "$R" pre-push "$OK" A=1;  check 12b $RC "rc=$RC"
  runner "$R" pre-push "$BAD" HUSKY=0; check 12c $RC "rc=$RC"
  R2=$(mk c12b); B2=$(sha "$R2" HEAD); subj_commit "$R2" "index on ci-staging: 8194e17e T-0705: x"
  runner "$R2" pre-push "$(line "$(sha "$R2" HEAD)" refs/heads/ci-staging "$B2")" A=1; check 12d $RC "rc=$RC"
  runner "$R" pre-commit "$BAD" A=1; [ $RC = 0 ] && [ -z "$ERRTXT" ]; check 12e $? "rc=$RC err=$ERRTXT"
fi

echo "FAILED=$FAILED"
[ "$FAILED" -eq 0 ]
