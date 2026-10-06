#!/usr/bin/env bash
# T-0289: tests for scripts/lib/deploy-lock.sh and the deploy_alert/f2_alert split in deploy.sh.
# Fixture git repo + temp disputes dir, no network. The rejected-commits lib is a minimal stand-in
# with the same trailer semantics as ~/taskloop/lib/rejected-commits.sh (full 40-hex only,
# RELEASE-COMMITS subtracts), so the test runs in CI where ~/taskloop does not exist.
# Mutation self-check at the end: each mutated copy of the lib must turn the suite red.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_LIB="$ROOT/scripts/lib/deploy-lock.sh"
DEPLOY_SCRIPT="$ROOT/scripts/deploy.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ---- fixtures ----------------------------------------------------------------------------
REPO="$TMP/repo"
DISP="$TMP/disputes"
RCLIB="$TMP/rejected-commits.sh"
mkdir -p "$REPO" "$DISP"

cat > "$RCLIB" <<'EOF'
rejected_commits_held() {
  local dir="$1" f line tok base
  local -A released=() seen=()
  [ -d "$dir" ] || return 0
  for f in "$dir"/*.md; do
    [ -f "$f" ] || continue
    while IFS= read -r line; do
      case "$line" in RELEASE-COMMITS:*) for tok in ${line#RELEASE-COMMITS:}; do released[$tok]=1; done ;; esac
    done < "$f"
  done
  for f in "$dir"/*.ruling-*.md; do
    [ -f "$f" ] || continue
    base="${f##*/}"
    while IFS= read -r line; do
      case "$line" in REJECTED-COMMITS:*) ;; *) continue ;; esac
      for tok in ${line#REJECTED-COMMITS:}; do
        [[ "$tok" =~ ^[0-9a-f]{40}$ ]] || continue
        [ -n "${released[$tok]:-}" ] && continue
        [ -n "${seen[$tok]:-}" ] && continue
        seen[$tok]=1
        printf '%s\t%s\n' "$tok" "$base"
      done
    done < "$f"
  done
}
EOF

g() { git -C "$REPO" "$@"; }
g init -q -b main
g config user.email t@example.invalid
g config user.name test
commit() { echo "$1" > "$REPO/f.txt"; g add f.txt; g commit -q -m "$1" -m "${2:-}"; g rev-parse HEAD; }

C0=$(commit base)
BAD=$(commit bad)
C2=$(commit next)
REVERT=$(commit "revert bad" "This reverts commit $BAD")
g checkout -q -b side "$C0"
SIDE=$(commit side-only)
# commit whose trailer carries only a short SHA of BAD (no full-SHA revert in its range)
g checkout -q -b short "$C2"
SHORT=$(commit "short revert" "This reverts commit ${BAD:0:8}")
g checkout -q main

reset_disputes() { rm -f "$DISP"/*; }
hold() { printf 'REJECTED-COMMITS: %s\n' "$1" > "$DISP/T-1.ruling-1.md"; }

# ---- suite -------------------------------------------------------------------------------
FAILS=0
check() { # name expected_rc expected_stdout actual_rc actual_stdout
  if [ "$2" != "$4" ] || [ "$3" != "$5" ]; then
    echo "FAIL: $1 (rc want=$2 got=$4; out want='$3' got='$5')"; FAILS=$((FAILS + 1))
  else
    echo "ok:   $1"
  fi
}

run_suite() { # LIB
  local lib="$1" out rc
  FAILS=0
  # shellcheck source=/dev/null
  source "$lib"

  reset_disputes; hold "$BAD"
  out=$(deploy_lock_check "$C2" "$DISP" "$RCLIB" "$REPO"); rc=$?
  check "held and in range -> 2" 2 "$(printf '%s\tT-1.ruling-1.md' "$BAD")" "$rc" "$out"

  out=$(deploy_lock_check "$REVERT" "$DISP" "$RCLIB" "$REPO"); rc=$?
  check "held but reverted in range -> 0" 0 "" "$rc" "$out"

  out=$(deploy_lock_check "$SIDE" "$DISP" "$RCLIB" "$REPO"); rc=$?
  check "held, not an ancestor of NEW_SHA -> 0" 0 "" "$rc" "$out"

  printf 'RELEASE-COMMITS: %s\n' "$BAD" >> "$DISP/T-1.ruling-1.md"
  out=$(deploy_lock_check "$C2" "$DISP" "$RCLIB" "$REPO"); rc=$?
  check "RELEASE in ruling -> 0" 0 "" "$rc" "$out"

  reset_disputes; hold "$BAD"
  out=$(deploy_lock_check "$C2" "$DISP" "$TMP/missing.sh" "$REPO"); rc=$?
  check "lib missing -> 7, stdout empty" 7 "" "$rc" "$out"

  out=$(deploy_lock_check "$SHORT" "$DISP" "$RCLIB" "$REPO"); rc=$?
  check "short SHA in trailer is ignored -> 2" 2 "$(printf '%s\tT-1.ruling-1.md' "$BAD")" "$rc" "$out"

  # T-0296: BASE_SHA range
  local want2; want2="$(printf '%s\tT-1.ruling-1.md' "$BAD")"
  out=$(deploy_lock_check "$C2" "$DISP" "$RCLIB" "$REPO" "$C0" 2>/dev/null); rc=$?
  check "held in BASE..NEW -> 2" 2 "$want2" "$rc" "$out"

  out=$(deploy_lock_check "$C2" "$DISP" "$RCLIB" "$REPO" "$C2" 2>/dev/null); rc=$?
  check "held ancestor of BASE -> 0" 0 "" "$rc" "$out"

  out=$(deploy_lock_check "$C2" "$DISP" "$RCLIB" "$REPO" "$SIDE" 2>/dev/null); rc=$?
  check "BASE not an ancestor of NEW -> 2" 2 "$want2" "$rc" "$out"

  out=$(deploy_lock_check "$C2" "$DISP" "$RCLIB" "$REPO" "" 2>/dev/null); rc=$?
  check "BASE empty -> 2" 2 "$want2" "$rc" "$out"

  out=$(deploy_lock_check "$C2" "$DISP" "$RCLIB" "$REPO" "${C2:0:8}" 2>/dev/null); rc=$?
  check "BASE short SHA -> 2" 2 "$want2" "$rc" "$out"

  out=$(deploy_lock_check "$C2" "$DISP" "$RCLIB" "$REPO" "" 2>&1 >/dev/null)
  check "unusable base warns on stderr" 0 "deploy_lock_check: base '' unusable, checking full ancestry of $C2" 0 "$out"

  reset_disputes
  out=$(deploy_lock_check "$C2" "$DISP" "$RCLIB" "$REPO"); rc=$?
  check "nothing held -> 0" 0 "" "$rc" "$out"
  return "$FAILS"
}

echo "== base suite =="
( run_suite "$LOCK_LIB" ); BASE_RC=$?

# ---- f2_alert text is unchanged by the deploy_alert split --------------------------------------
echo "== f2_alert text =="
F2_FAIL=0
(
  fx="$TMP/f2"; mkdir -p "$fx/app/scripts/night-orchestra/state" "$fx/bin"
  git -C "$fx/app" init -q -b main 2>/dev/null || { mkdir -p "$fx/app"; git -C "$fx/app" init -q -b main; }
  git -C "$fx/app" config user.email t@example.invalid; git -C "$fx/app" config user.name test
  echo a > "$fx/app/a.txt"; git -C "$fx/app" add a.txt; git -C "$fx/app" commit -q -m init
  printf 'TG_BOT_TOKEN=tok\nTG_CHAT_ID=42\n' > "$fx/app/scripts/night-orchestra/state/tg.env"
  git -C "$fx/app" add -f scripts; git -C "$fx/app" commit -q -m env
  echo dirt > "$fx/app/dirty.txt"
  cat > "$fx/bin/curl" <<'EOF'
#!/bin/sh
for a in "$@"; do case "$a" in text=*) printf '%s' "${a#text=}" > "$CAPTURE" ;; esac; done
echo '{"ok":true}'
EOF
  chmod +x "$fx/bin/curl"
  # pull the two function definitions out of deploy.sh
  awk '/^(deploy_alert|f2_alert)\(\) \{/{p=1} p{print} p&&/^\}/{p=0}' "$DEPLOY_SCRIPT" > "$fx/fns.sh"
  APP_DIR="$fx/app"; NEW_SHA="abc123"; GITHUB_RUN_ID=777
  export CAPTURE="$fx/captured" PATH="$fx/bin:$PATH"
  # shellcheck source=/dev/null
  source "$fx/fns.sh"
  cd "$fx/app" || exit 1
  log=$(f2_alert)
  want="[apibase] 🔴 deploy sha-abc123 ABORTED at F2: deploy tree dirty (run 777)
?? dirty.txt
then: gh run rerun 777 --failed"
  got=$(cat "$CAPTURE" 2>/dev/null)
  [ "$got" = "$want" ] || { echo "FAIL: f2_alert text differs: '$got'"; exit 1; }
  [ "$log" = "[deploy] F2 alert: sent" ] || { echo "FAIL: f2_alert log line: '$log'"; exit 1; }
  echo "ok:   f2_alert text and log line identical"
) || F2_FAIL=1

# ---- mutations: every one must turn the suite red -------------------------------------------
echo "== mutations =="
MUT_FAIL=0
mutate() { # name sed-expression
  local m="$TMP/mut-$1.sh" rc
  sed "$2" "$LOCK_LIB" > "$m"
  if cmp -s "$m" "$LOCK_LIB"; then echo "FAIL: mutation '$1' did not change the lib"; MUT_FAIL=1; return; fi
  ( run_suite "$m" ) > "$TMP/mut-$1.log" 2>&1; rc=$?
  if [ "$rc" -eq 0 ]; then echo "FAIL: mutation '$1' survived (suite stayed green)"; MUT_FAIL=1
  else echo "ok:   mutation '$1' is red ($(grep -c '^FAIL' "$TMP/mut-$1.log") failing checks)"; fi
}
mutate no-revert-check 's/\*"This reverts commit \$sha"\*) continue/*"NEVER-MATCHES"*) continue/'
mutate head-compare 's|git -C "\$repo" merge-base --is-ancestor "\$sha" "\$new_sha" 2>/dev/null|[ "$sha" = "$(git -C "$repo" rev-parse HEAD)" ]|'
mutate no-base-skip '/is-ancestor "\$sha" "\$base_sha"/,/^    fi$/d'
mutate rc7-to-0 's/return 7/return 0/g'

if [ "$BASE_RC" -ne 0 ] || [ "$F2_FAIL" -ne 0 ] || [ "$MUT_FAIL" -ne 0 ]; then
  echo "deploy-lock tests: FAILED"; exit 1
fi
echo "deploy-lock tests: all passed"
