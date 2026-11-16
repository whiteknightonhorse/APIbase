#!/bin/bash
# T-0854: tests for commit-msg-guard.sh and .husky/commit-msg. Temp repos only, no network.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GUARD="$ROOT/scripts/lib/commit-msg-guard.sh"
HOOK="$ROOT/.husky/commit-msg"
INTERP="${GUARD_SH:-sh}"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
export HOME="$T/home"; mkdir -p "$HOME"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
FAILED=0; RC=0; ERRTXT=""

# run <prefixes|-> <message text>
run() {
  printf '%b\n' "$2" >"$T/msg"
  if [ "$1" = "-" ]; then
    env -u FLEET_COMMIT_PREFIXES "$INTERP" "$GUARD" "$T/msg" 2>"$T/err" >/dev/null
  else
    FLEET_COMMIT_PREFIXES="$1" "$INTERP" "$GUARD" "$T/msg" 2>"$T/err" >/dev/null
  fi
  RC=$?; ERRTXT="$(cat "$T/err")"
}
has() { case "$ERRTXT" in *"$1"*) return 0 ;; esac; return 1; }
check() { if [ "$2" = 0 ]; then echo "PASS $1"; else echo "FAIL $1 ($3)"; FAILED=$((FAILED+1)); fi; }

run - "0849: anything";                 check 1 $RC "rc=$RC"
run T-0849 "T-0849";                    check 2a $RC "rc=$RC"
run T-0849 "T-0849: fix x";             check 2 $RC "rc=$RC"
run T-0849 "0849: fix x"
[ $RC = 1 ] && has BLOCKED && has T-0849; check 3 $? "rc=$RC"
run T-0849 "T-08490: x";                check 4 $([ $RC = 1 ]; echo $?) "rc=$RC"
run T-0849 "T-0849a: x";                check 4b $([ $RC = 1 ]; echo $?) "rc=$RC"
run "T-0415 T-SITE-F5" "T-SITE-F5: x";  check 5 $RC "rc=$RC"
run T-0849 'Revert "T-0849: x"';        check 6 $([ $RC = 1 ]; echo $?) "rc=$RC"
run T-0849 "# comment\n\n# more\nT-0849: x"; check 7 $RC "rc=$RC"
FLEET_COMMIT_PREFIXES=T-0849 "$INTERP" "$GUARD" "$T/nonexistent" 2>/dev/null; check 8 $? "rc=$?"

# 9 the hook file itself in a temp repo
R="$T/repo"; git init -q -b main "$R"
mkdir -p "$R/.husky" "$R/scripts/lib"
cp "$HOOK" "$R/.husky/commit-msg"; cp "$GUARD" "$R/scripts/lib/"
git -C "$R" config core.hooksPath .husky
echo x >"$R/f"; git -C "$R" add f
FLEET_COMMIT_PREFIXES=T-0849 git -C "$R" commit -qm "0849: x" 2>/dev/null; check 9a $([ $? != 0 ]; echo $?) "bad commit succeeded"
FLEET_COMMIT_PREFIXES=T-0849 git -C "$R" commit -qm "T-0849: x" 2>/dev/null; check 9b $? "good commit failed"

echo "FAILED=$FAILED"
[ "$FAILED" -eq 0 ]
