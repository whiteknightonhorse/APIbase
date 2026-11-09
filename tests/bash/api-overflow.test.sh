#!/usr/bin/env bash
# API-CREDITS-1108/2 acceptance tests: Fable acceptance overflow + key-unset assertion. Fake api-call / fake claude; no network.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
. /home/apibase/taskloop/lib/review-verdict.sh
. "$ROOT/scripts/api-credits/overflow.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
FAIL=0; ok(){ echo "PASS $1"; }; bad(){ echo "FAIL $1"; FAIL=1; }
STATE="$T/state"; mkdir -p "$STATE"; TODAY=2026-11-20
printf 'the review prompt' > "$T/prompt"
cat > "$T/api-ok" <<'X'
#!/usr/bin/env bash
echo "$@" > "$FAKE_ARGS"; cat > "$FAKE_STDIN"; echo "ACCEPT"
X
printf '#!/usr/bin/env bash\ncat >/dev/null; echo "api-call refused: cap" >&2; exit 75\n' > "$T/api-75"
chmod +x "$T/api-ok" "$T/api-75"; export FAKE_ARGS="$T/args" FAKE_STDIN="$T/stdin"
MARK=0   # stands in for the card-0590 park marker: the caller writes it iff overflow returns non-zero
caller(){ api_overflow_run "$@" || MARK=1; }

# 1. injected limit answer, api-call ok -> overflow made, .api +1, answer replaced, no park marker
echo "You've hit your session limit · resets 5pm" > "$T/ans"
API_CALL_BIN="$T/api-ok" caller "$T/ans" "$T/prompt" claude-fable-5-1 "$STATE" T-1 "$TODAY" fable
[ "$MARK" = 0 ] && ok "no park marker on overflow success" || bad "marker written"
[ "$(cat "$T/ans")" = ACCEPT ] && ok "answer replaced by API answer" || bad "answer"
[ "$(cat "$STATE/passes-$TODAY.fable.api")" = 1 ] && ok ".api counter +1" || bad ".api counter"
grep -q -- '--lane overflow --model claude-fable-5-1 --max-turns 1' "$T/args" && ok "overflow call args" || bad "args: $(cat "$T/args")"
[ "$(cat "$T/stdin")" = "the review prompt" ] && ok "identical prompt re-run" || bad "prompt"

# 2. second attempt for the same card: no second overflow
echo "weekly limit reached" > "$T/ans"; rm -f "$T/args"
API_CALL_BIN="$T/api-ok" api_overflow_run "$T/ans" "$T/prompt" claude-fable-5-1 "$STATE" T-1 "$TODAY" fable && bad "second overflow" || ok "at most one overflow per card"
[ -e "$T/args" ] && bad "api-call ran twice" || ok "no second api-call"

# 3. api-call exit 75 -> park path unchanged (rc 1, answer untouched, counter untouched)
MARK=0; echo "weekly limit reached" > "$T/ans"
API_CALL_BIN="$T/api-75" caller "$T/ans" "$T/prompt" claude-fable-5-1 "$STATE" T-2 "$TODAY" fable
[ "$MARK" = 1 ] && ok "exit 75 -> park marker path as today" || bad "no park on 75"
grep -q 'weekly limit' "$T/ans" && ok "answer untouched on 75" || bad "answer changed"
[ "$(cat "$STATE/passes-$TODAY.fable.api")" = 1 ] && ok ".api counter unchanged on 75" || bad "counter on 75"

# 4. non-limit answer: never overflowed
echo "ACCEPT" > "$T/ans"; rm -f "$T/args"
API_CALL_BIN="$T/api-ok" api_overflow_run "$T/ans" "$T/prompt" claude-fable-5-1 "$STATE" T-3 "$TODAY" fable && bad "overflowed a normal answer" || ok "normal answer not overflowed"

# 4b. full review that merely mentions "weekly limit" (verdict present): never overflowed, marker not consumed
printf 'R1 [Noted] x - 0590 parks on weekly limit text\nfine\nACCEPT\n' > "$T/ans"; rm -f "$T/args"
API_CALL_BIN="$T/api-ok" api_overflow_run "$T/ans" "$T/prompt" claude-fable-5-1 "$STATE" T-4 "$TODAY" fable && bad "overflowed a real verdict" || ok "real verdict mentioning weekly limit kept"
[ -e "$STATE/T-4.overflow-used" ] && bad "once-marker consumed" || ok "once-marker not consumed"
[ -e "$T/args" ] && bad "api-call ran on real verdict" || ok "no api-call on real verdict"

# 5. ANTHROPIC_API_KEY set -> claude_print aborts the tick with the log line, no claude call
cat > "$T/fn.sh" <<X
log(){ echo "\$*" >> "$T/tick.log"; }
HERE=/nonexistent; CLAUDE_BIN="$T/claude"
$(sed -n '/^claude_print(){/,/^}/p' /home/apibase/taskloop/taskloop.sh)
X
printf '#!/usr/bin/env bash\ntouch "%s/claude-ran"\n' "$T" > "$T/claude"; chmod +x "$T/claude"
( . "$ROOT/scripts/api-credits/overflow.sh"; . "$T/fn.sh"; ANTHROPIC_API_KEY=x claude_print 5 m "$T/prompt" "$T/o" ) >/dev/null 2>&1; rc=$?
[ "$rc" != 0 ] && ok "tick aborted (rc=$rc)" || bad "not aborted"
grep -q 'API key present in OAuth path — tick aborted' "$T/tick.log" && ok "tick.log line written" || bad "tick.log line"
[ -e "$T/claude-ran" ] && bad "claude was called" || ok "no claude call"
# 6. R5: the preflight ping path (no creds file, no preflight.ok -> UNKNOWN, no fallback -> haiku ping) is guarded by the same assertion
cat > "$T/pf.sh" <<X
log(){ echo "\$*" >> "$T/tick.log"; }
HERE=/nonexistent; CLAUDE_BIN="$T/claude"; STATE="$T/pfstate"; mkdir -p "\$STATE"; AUTH_PREFLIGHT_CREDS="$T/nocreds"
. /home/apibase/taskloop/lib/auth-preflight.sh
$(grep -n 'T-0745 R5' -A1 /home/apibase/taskloop/taskloop.sh | sed -n 2p | sed 's/^[0-9]*-//')
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
