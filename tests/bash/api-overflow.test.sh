#!/usr/bin/env bash
# API-CREDITS-1108/2 acceptance tests: Fable acceptance overflow + key-unset assertion. Fake api-call / fake claude; no network.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
FAIL=0; ok(){ echo "PASS $1"; }; bad(){ echo "FAIL $1"; FAIL=1; }
# Stand-in for the engine function review_verdict (lib/review-verdict.sh of the engine): prints ACCEPT, REJECT or
# ESCALATE when the last non-empty line starts with that word (with or without "VERDICT: " in front), NONE otherwise.
# tests/host/api-overflow-engine.test.sh runs the same case against the real one.
review_verdict(){
  local last; last=$(grep -v '^[[:space:]]*$' "$1" 2>/dev/null | tail -n 1); last=${last#VERDICT: }
  case "$last" in ACCEPT*) echo ACCEPT;; REJECT*) echo REJECT;; ESCALATE*) echo ESCALATE;; *) echo NONE;; esac
}
# Stand-in key guard helper, written here so that nothing is read from the HOME of the caller.
printf 'api_key_assert_unset(){ return 0; }\n' > "$T/guard-stub.sh"; export API_KEY_GUARD="$T/guard-stub.sh"
SRC_ERR=$(. "$ROOT/scripts/api-credits/overflow.sh" 2>&1 >/dev/null)
. "$ROOT/scripts/api-credits/overflow.sh"
[ -z "$SRC_ERR" ] && ok "source is quiet" || bad "source is quiet: $SRC_ERR"
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

# 7. line 9 of overflow.sh: the guard helper comes from API_KEY_GUARD, else from HOME; no fallback definition lives in overflow.sh
printf 'api_key_assert_unset(){ echo g1; }\n' > "$T/g1.sh"
r=$( unset -f api_key_assert_unset; export API_KEY_GUARD="$T/g1.sh"; . "$ROOT/scripts/api-credits/overflow.sh"; api_key_assert_unset )
[ "$r" = g1 ] && ok "7a API_KEY_GUARD file is sourced" || bad "7a got '$r'"
mkdir -p "$T/h7b/taskloop/lib"; printf 'api_key_assert_unset(){ echo home; }\n' > "$T/h7b/taskloop/lib/api-key-guard.sh"
r=$( unset -f api_key_assert_unset; unset API_KEY_GUARD; export HOME="$T/h7b"; . "$ROOT/scripts/api-credits/overflow.sh"; api_key_assert_unset )
[ "$r" = home ] && ok "7b HOME helper is the default" || bad "7b got '$r'"
( unset -f api_key_assert_unset; export API_KEY_GUARD="$T/does-not-exist.sh"; . "$ROOT/scripts/api-credits/overflow.sh" 2>/dev/null; declare -F api_key_assert_unset >/dev/null ) \
  && bad "7c function defined without a helper" || ok "7c missing helper leaves the function undefined"
n=$(cd "$ROOT" && git grep -l 'api_key_assert_unset()' -- 'scripts/*.sh' | wc -l)
[ "$n" = 0 ] && ok "7d no definition under scripts/" || bad "7d $n file(s) under scripts/ define api_key_assert_unset()"
exit $FAIL
