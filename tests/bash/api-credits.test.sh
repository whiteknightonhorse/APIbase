#!/usr/bin/env bash
# API-CREDITS-1108/1 acceptance tests. Uses a fake claude binary; never touches the network or a real credential.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
D="$ROOT/scripts/api-credits"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
export API_LEDGER_DIR="$T/ledger" API_KEY_FILE="$T/keyfile" API_CREDITS_NOW="2026-11-20T12:00:00Z"
FAKEVAL="fake-credential-value-0123456789"
mkdir -p "$API_LEDGER_DIR"
cat > "$T/claude" <<'EOF'
#!/usr/bin/env bash
echo "$@" > "${FAKE_ARGS:-/dev/null}"
[ -n "${ANTHROPIC_API_KEY:-}" ] && echo yes > "${FAKE_SAW_KEY:-/dev/null}"
echo '{"type":"result","is_error":false,"result":"pong","total_cost_usd":0.0123,"session_id":"sess-1","usage":{"input_tokens":10,"output_tokens":2,"cache_read_input_tokens":3,"cache_creation_input_tokens":4}}'
EOF
chmod +x "$T/claude"; export API_CALL_CLAUDE_BIN="$T/claude" FAKE_ARGS="$T/args" FAKE_SAW_KEY="$T/saw"
FAIL=0
ok(){ echo "PASS $1"; }
bad(){ echo "FAIL $1"; FAIL=1; }
expect_rc(){ local want=$1 name=$2; shift 2; "$@" >"$T/out" 2>"$T/err"; local rc=$?; [ "$rc" = "$want" ] && ok "$name (rc=$rc)" || bad "$name (rc=$rc want $want)"; }

printf '%s\n' "$FAKEVAL" | "$D/api-key-install" > "$T/inst"
[ "$(cat "$T/inst")" = installed ] && ok "installer prints only 'installed'" || bad "installer output"
[ "$(stat -c %a "$API_KEY_FILE")" = 600 ] && ok "installer mode 0600" || bad "installer mode"
echo '{"start":"2026-11-08","end":"2026-12-06"}' > "$API_LEDGER_DIR/cycle.json"
LEDGER="$API_LEDGER_DIR/2026-11-08.jsonl"
CALL=("$D/api-call" --lane batch --model claude-haiku-5-5 --max-turns 1 -- claude -p "hello")

# 1. real-shaped call under lane=batch writes a ledger line with cost_usd = total_cost_usd
expect_rc 0 "batch call proceeds" "${CALL[@]}"
[ "$(cat "$T/out")" = pong ] && ok "result text on stdout" || bad "stdout"
[ "$(jq -r .cost_usd "$LEDGER")" = 0.0123 ] && ok "ledger cost_usd from total_cost_usd" || bad "ledger cost"
grep -q yes "$T/saw" && ok "key present in child env" || bad "key in child env"
grep -q -- "--output-format json" "$T/args" && ok "output-format json forced" || bad "output-format"
grep -q hello "$LEDGER" && bad "prompt text in ledger" || ok "no prompt text in ledger"
grep -rq "$FAKEVAL" "$API_LEDGER_DIR" "$T/out" "$T/err" && bad "key value leaked" || ok "no key value in ledger/stdout/stderr"
rm -f "$LEDGER" "$T/saw"

# 2. synthetic ledger at lane cap: exit 75 and no child process (strace shows no execve of claude)
echo '{"ts":"2026-11-10T00:00:00Z","lane":"batch","cost_usd":55}' > "$LEDGER"
if command -v strace >/dev/null && strace -V >/dev/null 2>&1; then
  strace -f -e trace=execve,connect -o "$T/strace" "${CALL[@]}" >"$T/out" 2>"$T/err"; rc=$?
  [ "$rc" = 75 ] && ok "lane at cap exits 75" || bad "lane at cap rc=$rc"
  grep -q "$T/claude" "$T/strace" && bad "strace: claude executed on refusal" || ok "strace: no claude exec, no outbound request"
  grep -E 'connect\(.*(AF_INET|sin_port)' "$T/strace" && bad "strace: outbound connect" || ok "strace: no AF_INET connect"
else
  expect_rc 75 "lane at cap exits 75" "${CALL[@]}"; [ -e "$T/args" ] && bad "child ran" || ok "no child ran"
fi

# 3. key file mode 0644
echo '{"ts":"2026-11-10T00:00:00Z","lane":"batch","cost_usd":1}' > "$LEDGER"
chmod 644 "$API_KEY_FILE"; expect_rc 75 "key file 0644 refused" "${CALL[@]}"; chmod 600 "$API_KEY_FILE"
mv "$API_KEY_FILE" "$API_KEY_FILE.x"; expect_rc 75 "key file missing refused" "${CALL[@]}"; mv "$API_KEY_FILE.x" "$API_KEY_FILE"

# 4. total $163: demo refused, overflow proceeds
echo '{"ts":"2026-11-10T00:00:00Z","lane":"batch","cost_usd":40}
{"ts":"2026-11-10T00:00:00Z","lane":"sweep","cost_usd":40}
{"ts":"2026-11-10T00:00:00Z","lane":"demo","cost_usd":29}
{"ts":"2026-11-10T00:00:00Z","lane":"overflow","cost_usd":10}
{"ts":"2026-11-10T00:00:00Z","lane":"batch","cost_usd":44}' > "$LEDGER"
expect_rc 75 "demo at total 163 refused" "$D/api-call" --lane demo --model claude-sonnet-5-5 --max-turns 1 -- claude -p x
expect_rc 0 "overflow at total 163 proceeds" "$D/api-call" --lane overflow --model claude-fable-5-1 --max-turns 1 -- claude -p x

# 5. other guards
rm -f "$LEDGER"
expect_rc 75 "model off allowlist" "$D/api-call" --lane demo --model claude-haiku-5-5 --max-turns 1 -- claude -p x
expect_rc 75 "unknown lane" "$D/api-call" --lane foo --model claude-haiku-5-5 --max-turns 1 -- claude -p x
expect_rc 75 "max-turns missing (batch)" "$D/api-call" --lane batch --model claude-haiku-5-5 -- claude -p x
API_CREDITS_NOW="2026-12-06T00:00:00Z" expect_rc 75 "after cycle end" "${CALL[@]}"
API_CREDITS_NOW="2026-11-07T23:59:59Z" expect_rc 75 "before cycle start" "${CALL[@]}"
echo '{"ts":"2026-11-20T01:00:00Z","lane":"overflow","cost_usd":8}' > "$LEDGER"
expect_rc 75 "overflow daily cap 8" "$D/api-call" --lane overflow --model claude-fable-5-1 --max-turns 1 -- claude -p x
rm -f "$LEDGER"
expect_rc 75 "--model= form refused" "$D/api-call" --lane batch --model claude-haiku-5-5 --max-turns 1 -- claude -p x --model=claude-opus-5-5
expect_rc 75 "--output-format= form refused" "$D/api-call" --lane batch --model claude-haiku-5-5 --max-turns 1 -- claude -p x --output-format=text
expect_rc 75 "--max-turns= form refused" "$D/api-call" --lane batch --model claude-haiku-5-5 --max-turns 1 -- claude -p x --max-turns=99
touch "$API_LEDGER_DIR/HALT"
expect_rc 75 "HALT refuses batch" "${CALL[@]}"
expect_rc 0 "HALT does not stop overflow" "$D/api-call" --lane overflow --model claude-fable-5-1 --max-turns 1 -- claude -p x
rm -f "$API_LEDGER_DIR/HALT" "$LEDGER"

# 6. spend, alerts, rollover
echo '{"ts":"2026-11-10T00:00:00Z","lane":"batch","cost_usd":91}' > "$LEDGER"
"$D/api-spend" > "$T/spend"; grep -q 'batch .*91.00 / \$55' "$T/spend" && grep -q 'days left' "$T/spend" && ok "api-spend report" || bad "api-spend"
"$D/api-spend-cron" "$T/tick.log"
[ -e "$API_LEDGER_DIR/ALERT-90" ] && [ ! -e "$API_LEDGER_DIR/ALERT-135" ] && [ -e "$API_LEDGER_DIR/ALERT-lane-batch" ] && grep -q "reached \$90" "$T/tick.log" && grep -Eq 'reached your .* limit|usage limit|rate limit|hit your limit|limit reached' "$T/tick.log" && ok "alert markers + tick.log line" || bad "alerts"
API_CREDITS_NOW="2026-12-06T00:05:00Z" "$D/api-cycle-rollover"
[ "$(jq -r .start "$API_LEDGER_DIR/cycle.json")" = 2026-12-06 ] && [ "$(jq -r .end "$API_LEDGER_DIR/cycle.json")" = 2027-01-06 ] && [ ! -e "$API_LEDGER_DIR/ALERT-90" ] && ok "rollover opens 2026-12-06 -> 2027-01-06, clears alerts" || bad "rollover"
exit $FAIL
