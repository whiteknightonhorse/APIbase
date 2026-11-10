#!/usr/bin/env bash
# T-KEY-1 acceptance: the API-key-unset guard runs before EVERY headless claude call. A fake claude records whether it was
# called; the key value is always the literal "x" and must never reach the guard log. No network, no model.
# Run: bash tests/bash/api-key-guard.test.sh
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TL="${TASKLOOP_DIR:-$HOME/taskloop}"
NIGHT="${NIGHT_ORCH_DIR:-$HOME/night-orchestra-fleet}"; [ -f "$NIGHT/lib.sh" ] || NIGHT="$HOME/apibase/scripts/night-orchestra"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
FAIL=0; ok(){ echo "PASS $1"; }; bad(){ echo "FAIL $1"; FAIL=1; }

# Sandbox HOME: helper copy, wrapper copy, fake real claude. No tg.sh there, so no Telegram is ever sent.
H="$T/home"; mkdir -p "$H/taskloop/lib" "$H/taskloop/logs" "$H/taskloop/state" "$H/bin" "$H/.local/claude/current/bin" "$H/fakebin" "$H/.claude"
cp "$TL/lib/api-key-guard.sh" "$H/taskloop/lib/"
cp "$HOME/bin/claude" "$H/bin/claude"
CALLED="$T/called"
cat > "$H/.local/claude/current/bin/claude" <<X
#!/usr/bin/env bash
echo "\$*" >> "$CALLED"; echo AUTHOK
X
chmod +x "$H/.local/claude/current/bin/claude"; cp "$H/.local/claude/current/bin/claude" "$H/fakebin/claude"
LOGF="$H/taskloop/logs/api-key-guard.log"
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN API_CALL_CHILD

# site_<name>: runs ONE headless call attempt inside the sandbox HOME.
site_wrapper(){ HOME="$H" bash "$H/bin/claude" --print --model haiku hi >/dev/null 2>&1; }
site_arbiter(){
  local W="$T/arb"; rm -rf "$W"; mkdir -p "$W/fh/taskloop"/{state,logs,queue,active,stuck,done} "$W/sentry/taskloop"/{state,logs} "$H/.claude"
  printf '# T-arb-x\nMAX_ATTEMPTS: 5\n' > "$W/fh/taskloop/stuck/arbx.md"; mkdir -p "$W/fh/taskloop/logs/arbx"
  echo "2026-09-06T01:02:03Z ECONNRESET fixture" > "$W/fh/taskloop/logs/arbx/attempt-1.log"
  HOME="$H" SENTRY_HOME="$W/sentry" ARBITER_CLAUDE_BIN="$H/fakebin/claude" bash "$TL/lib/fable-arbiter.sh" "$(id -un)" "$W/fh" arbx >/dev/null 2>&1
  ARB_CONSULTS=$(ls "$W/fh/taskloop/logs/arbx"/arbiter-consult-* 2>/dev/null | wc -l)
}
site_preflight(){ ( HOME="$H" CLAUDE_BIN="$H/fakebin/claude" AUTH_PREFLIGHT_CREDS="$T/none.json"; . "$TL/lib/auth-preflight.sh"; rm -rf "$T/pf"; mkdir -p "$T/pf"; auth_preflight_gate "$T/pf" ) >/dev/null 2>&1; }
site_run_agent(){
  local W="$T/orch"; rm -rf "$W"; mkdir -p "$W/scripts/night-orchestra"/{state,logs,roles}
  ( export HOME="$H"; sed "s#^ROOT=.*#ROOT=$W#" "$NIGHT/lib.sh" > "$W/scripts/night-orchestra/lib.sh"; cd "$W" || exit 1
    . "$W/scripts/night-orchestra/lib.sh"; CLAUDE_BIN="$H/fakebin/claude"; run_agent test-guard "hello" 20 ) >/dev/null 2>&1
}
site_review_batch(){
  ( export HOME="$H"; export TASKLOOP_LIB="$TL/lib" ROOT="$T" ROLES="$T" LOGS="$T" STATE="$T"; log(){ :; }
    . "$NIGHT/lib-review-batch.sh"; echo p > "$T/pf"; CLAUDE_BIN="$H/fakebin/claude"; review_batch_claude "$T/pf" "$T/rb.out" ) >/dev/null 2>&1
}
site_layer3(){ HOME="$H" CLAUDE_BIN="$H/fakebin/claude" python3 -I -c "
import sys; sys.path.insert(0, '$ROOT/scripts/moderation'); import layer3_review as m; m.default_invoke('p')" >/dev/null 2>&1; }
site_intake(){ HOME="$H" PATH="$H/fakebin:$PATH" python3 -I -c "
import sys, importlib.util
sys.path.insert(0, '$ROOT/scripts/autopilot'); sys.path.insert(0, '$ROOT/scripts')
s = importlib.util.spec_from_file_location('ei', '$ROOT/scripts/autopilot/email-intake.py'); m = importlib.util.module_from_spec(s); s.loader.exec_module(m)
m._default_haiku_invoke('p')" >/dev/null 2>&1; }

SITES="wrapper arbiter preflight run_agent review_batch layer3 intake"
want_name(){ case "$1" in wrapper) echo wrapper;; arbiter) echo fable-arbiter;; preflight) echo auth-preflight;; run_agent) echo orchestra-run_agent;; review_batch) echo orchestra-review-batch;; layer3) echo layer3_review;; intake) echo email-intake;; esac; }

# a. key unset -> every site calls the fake claude
for s in $SITES; do
  : > "$CALLED"; : > "$LOGF"; "site_$s"
  [ -s "$CALLED" ] && ok "a. $s calls claude with no key" || bad "a. $s did not call claude with no key"
  [ -s "$LOGF" ] && bad "a. $s wrote the guard log with no key" || true
done

# b. ANTHROPIC_API_KEY=x -> refused at every site
for s in $SITES; do
  : > "$CALLED"; : > "$LOGF"; ARB_CONSULTS=0
  ANTHROPIC_API_KEY=x "site_$s"
  [ -s "$CALLED" ] && bad "b. $s CALLED claude with the key set" || ok "b. $s: claude not called with ANTHROPIC_API_KEY=x"
  [ "$(grep -c "call refused :: $(want_name $s)" "$LOGF")" = 1 ] && ok "b. $s: one guard log line naming the site" || bad "b. $s: guard log line ($(wc -l < "$LOGF") lines)"
  grep -q x "$LOGF" && bad "b. $s: guard log contains x" || ok "b. $s: guard log has no key value"
  [ "$s" = arbiter ] && { [ "$ARB_CONSULTS" = 0 ] && ok "b. arbiter counted no consult" || bad "b. arbiter counted a consult"; }
done

# c. ANTHROPIC_AUTH_TOKEN=x -> same for the wrapper
: > "$CALLED"; : > "$LOGF"; ANTHROPIC_AUTH_TOKEN=x site_wrapper; rc=$(ANTHROPIC_AUTH_TOKEN=x HOME="$H" bash "$H/bin/claude" -p hi >/dev/null 2>&1; echo $?)
[ -s "$CALLED" ] && bad "c. wrapper called with AUTH_TOKEN" || ok "c. wrapper refuses ANTHROPIC_AUTH_TOKEN"
[ "$rc" = 78 ] && ok "c. wrapper rc=78 (also for -p)" || bad "c. rc=$rc"
grep -q x "$LOGF" && bad "c. log contains x" || ok "c. log has no token value"

# d. API_CALL_CHILD=1 passes; the api-call cases stay green
: > "$CALLED"; ANTHROPIC_API_KEY=x API_CALL_CHILD=1 site_wrapper
[ -s "$CALLED" ] && ok "d. wrapper passes for the api-call child" || bad "d. wrapper refused the api-call child"
grep -q 'env\["API_CALL_CHILD"\] = "1"' "$ROOT/scripts/api-credits/api_credits.py" && ok "d. api_credits.py sets API_CALL_CHILD in the child env only" || bad "d. api_credits.py"
for t in api-overflow api-credits; do
  out=$(bash "$ROOT/tests/bash/$t.test.sh" 2>&1); echo "$out" | grep -q '^FAIL' && bad "d. $t.test.sh has failures" || ok "d. $t.test.sh: $(echo "$out" | grep -c '^PASS') PASS, 0 FAIL"
done

# e. interactive form (no --print/-p) with the key set passes
: > "$CALLED"; ANTHROPIC_API_KEY=x HOME="$H" bash "$H/bin/claude" --version >/dev/null 2>&1
[ -s "$CALLED" ] && ok "e. claude --version passes with the key set" || bad "e. interactive form was refused"

# f. helper moved away -> wrapper exits 78 and does not call claude (fail closed)
mv "$H/taskloop/lib/api-key-guard.sh" "$H/taskloop/lib/api-key-guard.sh.away"; : > "$CALLED"
HOME="$H" bash "$H/bin/claude" --print hi >/dev/null 2>&1; rc=$?
mv "$H/taskloop/lib/api-key-guard.sh.away" "$H/taskloop/lib/api-key-guard.sh"
[ "$rc" = 78 ] && [ ! -s "$CALLED" ] && ok "f. helper missing -> rc 78, claude not called" || bad "f. rc=$rc called=$(wc -l < "$CALLED")"

# g. coverage test: a throwaway bare /usr/bin/claude --print site fails the check by name, then passes after removal
mkdir -p "$T/cov"; printf '#!/bin/bash\n/usr/bin/claude --print hello\n' > "$T/cov/throwaway.sh"
out=$(KEY_GUARD_ROOTS="$T/cov" bash "$TL/tests/api-key-guard-coverage.test.sh" 2>&1); rc=$?
[ "$rc" != 0 ] && echo "$out" | grep -q throwaway.sh && ok "g. coverage check fails naming the throwaway script" || bad "g. coverage did not catch it ($out)"
rm -f "$T/cov/throwaway.sh"
KEY_GUARD_ROOTS="$T/cov" bash "$TL/tests/api-key-guard-coverage.test.sh" >/dev/null 2>&1 && ok "g. coverage check passes after removal" || bad "g. coverage still failing"

# h. one definition in the fleet (the apibase-orchestra worktree mirrors fleet scripts and follows by merge of ci-staging)
n=$(grep -rn "api_key_assert_unset()" "$TL/lib" "$ROOT/scripts" --include='*.sh' --exclude='*.bak*' 2>/dev/null | wc -l)
[ "$n" = 1 ] && ok "h. exactly one api_key_assert_unset() definition" || bad "h. $n definitions"
exit "$FAIL"
