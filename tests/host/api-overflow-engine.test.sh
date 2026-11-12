#!/usr/bin/env bash
# HOST TEST: needs the live engine (~/taskloop); CI does not run tests/host/.
# Subject: the engine's claude_print and its preflight ping, with scripts/api-credits/overflow.sh sourced the way
# taskloop.sh sources it. Also runs case 4b of tests/bash/api-overflow.test.sh against the real review_verdict.
# Run by hand: bash tests/host/api-overflow-engine.test.sh
# Who runs tests/host/ on a schedule is an open question of SOUKBASE-DOCS-LAW-1111.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TL="${TASKLOOP_DIR:-$HOME/taskloop}"
for f in "$TL/taskloop.sh" "$TL/lib/auth-preflight.sh" "$TL/lib/review-verdict.sh"; do
  [ -r "$f" ] || { echo "FAIL host test needs the engine at $TL"; exit 1; }
done
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
FAIL=0; ok(){ echo "PASS $1"; }; bad(){ echo "FAIL $1"; FAIL=1; }
# A refusal made by this test must not touch the live guard log or send Telegram.
export API_KEY_GUARD_LOG="$T/guard.log" API_KEY_GUARD_STATE="$T/guard-state" API_KEY_GUARD_TG=/nonexistent
mkdir -p "$API_KEY_GUARD_STATE"
. "$TL/lib/review-verdict.sh"
unset API_KEY_GUARD
. "$ROOT/scripts/api-credits/overflow.sh"
declare -F api_key_assert_unset >/dev/null && ok "guard function loaded" || bad "guard function loaded"
STATE="$T/state"; mkdir -p "$STATE"; TODAY=2026-11-20
printf 'the review prompt' > "$T/prompt"
cat > "$T/api-ok" <<'X'
#!/usr/bin/env bash
echo "$@" > "$FAKE_ARGS"; cat > "$FAKE_STDIN"; echo "ACCEPT"
X
chmod +x "$T/api-ok"; export FAKE_ARGS="$T/args" FAKE_STDIN="$T/stdin"

# 4b. full review that merely mentions "weekly limit" (verdict present): never overflowed, marker not consumed
printf 'R1 [Noted] x - 0590 parks on weekly limit text\nfine\nACCEPT\n' > "$T/ans"; rm -f "$T/args"
API_CALL_BIN="$T/api-ok" api_overflow_run "$T/ans" "$T/prompt" claude-fable-5-1 "$STATE" T-4 "$TODAY" fable && bad "overflowed a real verdict" || ok "real verdict mentioning weekly limit kept"
[ -e "$STATE/T-4.overflow-used" ] && bad "once-marker consumed" || ok "once-marker not consumed"
[ -e "$T/args" ] && bad "api-call ran on real verdict" || ok "no api-call on real verdict"

# 5. ANTHROPIC_API_KEY set -> claude_print aborts the tick with the log line, no claude call
CP="$(sed -n '/^claude_print(){/,/^}/p' "$TL/taskloop.sh")"
[ -n "$CP" ] && ok "claude_print found" || bad "claude_print found"
cat > "$T/fn.sh" <<X
log(){ echo "\$*" >> "$T/tick.log"; }
HERE=/nonexistent; CLAUDE_BIN="$T/claude"
$CP
X
printf '#!/usr/bin/env bash\ntouch "%s/claude-ran"\n' "$T" > "$T/claude"; chmod +x "$T/claude"
( . "$ROOT/scripts/api-credits/overflow.sh"; . "$T/fn.sh"; ANTHROPIC_API_KEY=x claude_print 5 m "$T/prompt" "$T/o" ) >/dev/null 2>&1; rc=$?
[ "$rc" != 0 ] && ok "tick aborted (rc=$rc)" || bad "not aborted"
grep -q 'API key present in OAuth path — tick aborted' "$T/tick.log" && ok "tick.log line written" || bad "tick.log line"
[ -e "$T/claude-ran" ] && bad "claude was called" || ok "no claude call"
# 6. R5: the preflight ping path (no creds file, no preflight.ok -> UNKNOWN, no fallback -> haiku ping) is guarded by the same assertion
R5="$(grep -n 'T-0745 R5' -A1 "$TL/taskloop.sh" | sed -n 2p | sed 's/^[0-9]*-//')"
[ -n "$R5" ] && ok "R5 line found" || bad "R5 line found"
cat > "$T/pf.sh" <<X
log(){ echo "\$*" >> "$T/tick.log"; }
HERE=/nonexistent; CLAUDE_BIN="$T/claude"; STATE="$T/pfstate"; mkdir -p "\$STATE"; AUTH_PREFLIGHT_CREDS="$T/nocreds"
. "$TL/lib/auth-preflight.sh"
$R5
auth_preflight_gate "\$STATE"
X
rm -f "$T/claude-ran" "$T/tick.log"
( . "$ROOT/scripts/api-credits/overflow.sh"; export ANTHROPIC_API_KEY=x; . "$T/pf.sh" ) >/dev/null 2>&1; rc=$?
[ "$rc" != 0 ] && ok "preflight path aborted (rc=$rc)" || bad "preflight not aborted"
grep -q 'API key present in OAuth path — tick aborted' "$T/tick.log" && ok "preflight tick.log line" || bad "preflight log line"
[ -e "$T/claude-ran" ] && bad "ping ran claude" || ok "no ping claude call"
rm -f "$T/tick.log"; ( . "$ROOT/scripts/api-credits/overflow.sh"; unset ANTHROPIC_API_KEY; . "$T/pf.sh" ) >/dev/null 2>&1
[ -e "$T/claude-ran" ] && ok "control: ping reachable without key" || bad "control: ping path not reached"
exit $FAIL
