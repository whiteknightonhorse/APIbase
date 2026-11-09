#!/usr/bin/env bash
# API-CREDITS-1108/1 + /3a acceptance tests. Uses a fake claude binary and a fake Batches endpoint on loopback;
# never touches the real network or a real credential. The suite also runs from an installed tenant copy (see the end).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
R="$ROOT/scripts/api-credits"
D="${API_CREDITS_DIR:-$R}"      # the copy under test
TN="${TEST_TENANT:-apibase}"
T="$(mktemp -d)"; SRV=""; trap '[ -n "$SRV" ] && kill "$SRV" 2>/dev/null; rm -rf "$T"' EXIT
unset API_CALL_TENANT TENANT
export API_SUDO="" API_HOME_BASE="$T/home" HOME="$T/home/$TN"; mkdir -p "$HOME"
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
[ "$(jq -r .tenant "$LEDGER")" = "$TN" ] && ok "tenant field defaults to basename(HOME)" || bad "tenant default"
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
rm -f "$API_LEDGER_DIR/HALT"
touch "$API_LEDGER_DIR/HALT-fleet-total"
expect_rc 75 "HALT-fleet-total refuses batch like HALT" "${CALL[@]}"
expect_rc 0 "HALT-fleet-total does not stop overflow" "$D/api-call" --lane overflow --model claude-fable-5-1 --max-turns 1 -- claude -p x
rm -f "$API_LEDGER_DIR/HALT-fleet-total" "$LEDGER"

# 6. spend, alerts, rollover
echo '{"ts":"2026-11-10T00:00:00Z","lane":"batch","cost_usd":91}' > "$LEDGER"
"$D/api-spend" > "$T/spend"; grep -q 'batch .*91.00 / \$55' "$T/spend" && grep -q 'days left' "$T/spend" && ok "api-spend report" || bad "api-spend"
"$R/api-spend-cron" "$T/tick.log"
[ -e "$API_LEDGER_DIR/ALERT-90" ] && [ ! -e "$API_LEDGER_DIR/ALERT-135" ] && [ -e "$API_LEDGER_DIR/ALERT-lane-batch" ] && grep -q "reached \$90" "$T/tick.log" && grep -Eq 'reached your .* limit|usage limit|rate limit|hit your limit|limit reached' "$T/tick.log" && ok "alert markers + tick.log line" || bad "alerts"
API_CREDITS_NOW="2026-12-06T00:05:00Z" "$D/api-cycle-rollover"
[ "$(jq -r .start "$API_LEDGER_DIR/cycle.json")" = 2026-12-06 ] && [ "$(jq -r .end "$API_LEDGER_DIR/cycle.json")" = 2027-01-06 ] && [ ! -e "$API_LEDGER_DIR/ALERT-90" ] && ok "rollover opens 2026-12-06 -> 2027-01-06, clears alerts" || bad "rollover"

# 7. api-batch against a fake Batches endpoint (loopback)
echo '{"start":"2026-11-08","end":"2026-12-06"}' > "$API_LEDGER_DIR/cycle.json"; rm -f "$LEDGER"
cat > "$T/fake_batches.py" <<'EOF'
import http.server, json, os, sys
LOG, STATE, PORTF = sys.argv[1:4]
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _rec(self):
        with open(LOG, "a") as f:
            f.write("%s %s keyok=%s ver=%s\n" % (self.command, self.path, self.headers.get("x-api-key") == os.environ["FAKE_KEY"], self.headers.get("anthropic-version")))
    def _send(self, body, ct="application/json"):
        b = body.encode(); self.send_response(200); self.send_header("content-type", ct); self.send_header("content-length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_POST(self):
        self._rec(); body = json.loads(self.rfile.read(int(self.headers["content-length"])))
        json.dump([r["custom_id"] for r in body["requests"]], open(STATE, "w"))
        self._send(json.dumps({"id": "msgbatch_test1", "processing_status": "in_progress", "results_url": None}))
    def do_GET(self):
        self._rec(); ids = json.load(open(STATE))
        if self.path.endswith("/results"):
            use = [(1000000, 200000), (500000, 0)]
            lines = [json.dumps({"custom_id": c, "result": {"type": "succeeded", "message": {"usage": {"input_tokens": use[i][0], "output_tokens": use[i][1]}}}}) for i, c in enumerate(ids[:2])]
            lines += [json.dumps({"custom_id": c, "result": {"type": "errored", "error": {"type": "api_error"}}}) for c in ids[2:]]
            self._send("\n".join(lines) + "\n", "application/x-jsonl")
        else:
            self._send(json.dumps({"id": "msgbatch_test1", "processing_status": "ended" if os.path.exists(STATE + ".ended") else "in_progress"}))
s = http.server.HTTPServer(("127.0.0.1", 0), H)
open(PORTF, "w").write(str(s.server_address[1]))
s.serve_forever()
EOF
FAKE_KEY="$FAKEVAL" python3 -I "$T/fake_batches.py" "$T/srvlog" "$T/srvstate" "$T/port" & SRV=$!
for _ in $(seq 50); do [ -s "$T/port" ] && break; sleep 0.1; done
export API_BATCH_BASE_URL="http://127.0.0.1:$(cat "$T/port")"
printf '%s\n' '{"custom_id":"item-alpha","params":{"max_tokens":100000,"messages":[{"role":"user","content":"summarise the secret prompt text one"}]}}' \
  '{"custom_id":"item-beta","params":{"max_tokens":100000,"messages":[{"role":"user","content":"summarise the secret prompt text two"}]}}' > "$T/jobs.jsonl"
BATCH=("$D/api-batch" submit --lane batch --model claude-sonnet-5-5 --jobs "$T/jobs.jsonl")
expect_rc 0 "api-batch estimate" "$D/api-batch" estimate --lane batch --model claude-sonnet-5-5 --jobs "$T/jobs.jsonl"
expect_rc 0 "api-batch submit" "${BATCH[@]}"
[ "$(cat "$T/out")" = msgbatch_test1 ] && ok "submit prints the batch id" || bad "submit output"
grep -q 'POST /v1/messages/batches keyok=True ver=2026-10-21' "$T/srvlog" && ok "fake endpoint saw key header and pinned version" || bad "fake endpoint request"
[ "$(jq -r '[.kind,.lane,.batch_id,.n_requests]|join(" ")' "$LEDGER")" = "estimate batch msgbatch_test1 2" ] && ok "submit wrote the estimate row" || bad "estimate row"
"$D/api-spend" > "$T/spend1"; grep '^batch' "$T/spend1"
grep -q 'batch .*1\.00 / \$55' "$T/spend1" && ok "api-spend counts the estimate before collect" || bad "spend before collect"
expect_rc 0 "api-batch poll" "$D/api-batch" poll --lane batch --model claude-sonnet-5-5 --batch-id msgbatch_test1
[ "$(cat "$T/out")" = in_progress ] && ok "poll prints processing status" || bad "poll output"
expect_rc 3 "collect before the batch ended" "$D/api-batch" collect --lane batch --model claude-sonnet-5-5 --batch-id msgbatch_test1 --out "$T/res.jsonl"
touch "$T/srvstate.ended"
expect_rc 0 "api-batch collect" "$D/api-batch" collect --lane batch --model claude-sonnet-5-5 --batch-id msgbatch_test1 --out "$T/res.jsonl"
[ "$(wc -l < "$T/res.jsonl")" = 2 ] && jq -r .custom_id "$T/res.jsonl" | grep -qx item-alpha && ok "results written to --out with custom_id" || bad "results file"
ACT="$(jq -s -c 'map(select(.kind=="actual"))[0]' "$LEDGER")"
[ "$(echo "$ACT" | jq -r '[.cost_usd,.n_results,.input_tokens,.output_tokens]|join(" ")')" = "2.5 2 1500000 200000" ] && ok "actual row: usage summed, cost at batch price" || bad "actual row: $ACT"
"$D/api-spend" > "$T/spend2"; grep '^batch' "$T/spend2"
grep -q 'batch .*2\.50 / \$55' "$T/spend2" && ok "api-spend counts only the actual after collect" || bad "spend after collect"
"$D/api-batch" collect --lane batch --model claude-sonnet-5-5 --batch-id msgbatch_test1 --out "$T/res2.jsonl" >/dev/null 2>&1
[ "$(jq -s 'map(select(.kind=="actual"))|length' "$LEDGER")" = 1 ] && ok "second collect adds no second actual row" || bad "double actual"
grep -q 'item-\|secret prompt' "$LEDGER" && bad "custom_id or prompt in ledger" || ok "no custom_id or prompt text in ledger"
grep -rq "$FAKEVAL" "$API_LEDGER_DIR" "$T/out" "$T/err" "$T/res.jsonl" "$T/spend1" "$T/spend2" && bad "key value leaked (batch)" || ok "no key value in ledger/stdout/stderr/--out (batch)"
# estimate over the $5 cap: exit 75 and no outbound request
echo '{"custom_id":"big","params":{"max_tokens":1000000,"messages":[{"role":"user","content":"x"}]}}' > "$T/big.jsonl"
BIG=("$D/api-batch" submit --lane batch --model claude-sonnet-5-5 --jobs "$T/big.jsonl")
N0="$(wc -l < "$T/srvlog")"
if command -v strace >/dev/null && strace -V >/dev/null 2>&1; then
  strace -f -e trace=connect -o "$T/strace2" "${BIG[@]}" >"$T/out" 2>"$T/err"; rc=$?
  grep -E 'connect\(.*(AF_INET|sin_port)' "$T/strace2" && bad "strace: outbound connect on over-cap estimate" || ok "strace: no AF_INET connect on over-cap estimate"
else
  "${BIG[@]}" >"$T/out" 2>"$T/err"; rc=$?
fi
[ "$rc" = 75 ] && grep -q 'batch estimate \$5.00 over the \$5 cap' "$T/err" && ok "estimate >= cap exits 75 with the reason" || bad "over-cap rc=$rc: $(cat "$T/err")"
[ "$(wc -l < "$T/srvlog")" = "$N0" ] && ok "over-cap: nothing reached the endpoint" || bad "over-cap: endpoint was called"
# guards for api-batch
chmod 644 "$API_KEY_FILE"; expect_rc 75 "api-batch: key file 0644" "${BATCH[@]}"; chmod 600 "$API_KEY_FILE"
touch "$API_LEDGER_DIR/HALT"; expect_rc 75 "api-batch: HALT" "${BATCH[@]}"; rm -f "$API_LEDGER_DIR/HALT"
touch "$API_LEDGER_DIR/HALT-fleet-total"; expect_rc 75 "api-batch: HALT-fleet-total" "${BATCH[@]}"; rm -f "$API_LEDGER_DIR/HALT-fleet-total"
echo '{"ts":"2026-11-10T00:00:00Z","lane":"batch","cost_usd":55}' >> "$LEDGER"; expect_rc 75 "api-batch: lane cap" "${BATCH[@]}"
expect_rc 75 "api-batch: wrong model" "$D/api-batch" submit --lane batch --model claude-fable-5-1 --jobs "$T/jobs.jsonl"
expect_rc 75 "api-batch: lane demo refused" "$D/api-batch" submit --lane demo --model claude-sonnet-5-5 --jobs "$T/jobs.jsonl"
rm -f "$LEDGER"

# 8. fleet view, fleet total guard, DRIFT, rollover (fixture tenants under $T/fl/home)
FL="$T/fl/home"; mkdir -p "$FL/apibase/api-ledger" "$FL/cryptocardhub/api-ledger"
for t in apibase cryptocardhub; do echo '{"start":"2026-11-08","end":"2026-12-06"}' > "$FL/$t/api-ledger/cycle.json"; done
echo '{"ts":"2026-11-10T00:00:00Z","lane":"batch","cost_usd":100}' > "$FL/apibase/api-ledger/2026-11-08.jsonl"
echo '{"ts":"2026-11-10T00:00:00Z","lane":"sweep","cost_usd":63}' > "$FL/cryptocardhub/api-ledger/2026-11-08.jsonl"
touch "$FL/cryptocardhub/api-ledger/HALT"
SUDO="" HOME_BASE="$FL" "$R/install-tenant-copy.sh" cryptocardhub > "$T/inst.out" 2>&1
fl(){ HOME="$FL/apibase" API_HOME_BASE="$FL" API_LEDGER_DIR="$FL/apibase/api-ledger" "$@"; }
fl "$D/api-spend" --fleet > "$T/fleet.out"; cat "$T/fleet.out"
grep -q 'tenant sales .*unreadable' "$T/fleet.out" && grep -q 'fleet .*total .*163.00' "$T/fleet.out" && grep -q 'tenant cryptocardhub .*sweep .*63.00' "$T/fleet.out" && ok "api-spend --fleet: per tenant, per lane, fleet total, unreadable tenant" || bad "fleet view"
HOME="$FL/cryptocardhub" "$D/api-spend" --fleet >/dev/null 2>&1; [ $? = 1 ] && ok "--fleet refused off apibase" || bad "--fleet off apibase"
fl "$R/api-spend-cron" "$T/fltick.log"
[ -e "$FL/apibase/api-ledger/ALERT-162" ] && [ -e "$FL/apibase/api-ledger/HALT-fleet-total" ] && [ -e "$FL/cryptocardhub/api-ledger/HALT-fleet-total" ] && grep -q "reached \$162" "$T/fltick.log" && ok "fleet total 163: ALERT-162 and HALT-fleet-total in both tenant ledgers" || bad "fleet guard"
[ ! -e "$FL/apibase/api-ledger/DRIFT-cryptocardhub" ] && ok "fresh tenant copy: no DRIFT marker" || bad "unexpected DRIFT"
echo "# edited" >> "$FL/cryptocardhub/bin/api-credits/api-spend"
fl "$R/api-spend-cron" "$T/fltick.log"
[ -e "$FL/apibase/api-ledger/DRIFT-cryptocardhub" ] && grep -q 'copy drift on cryptocardhub: api-spend(differs)' "$T/fltick.log" && ok "edited tenant copy: DRIFT marker and one tick.log line" || bad "drift detection"
fl "$R/api-spend-cron" "$T/fltick.log"; [ "$(grep -c 'copy drift' "$T/fltick.log")" = 1 ] && ok "drift line is not repeated every run" || bad "drift repeats"
HOME="$FL/apibase" API_HOME_BASE="$FL" API_LEDGER_DIR="$FL/apibase/api-ledger" API_CREDITS_NOW="2026-12-06T00:05:00Z" "$D/api-cycle-rollover"
[ ! -e "$FL/apibase/api-ledger/HALT-fleet-total" ] && [ ! -e "$FL/cryptocardhub/api-ledger/HALT-fleet-total" ] && [ -e "$FL/cryptocardhub/api-ledger/HALT" ] && ok "rollover clears HALT-fleet-total everywhere and leaves a plain HALT" || bad "rollover fleet marker"

# 9. installer: layout, modes, backups, md5 list
ID="$T/ih"; SUDO="" HOME_BASE="$ID" "$R/install-tenant-copy.sh" cryptocardhub > "$T/i1.out" 2>&1 || bad "installer failed: $(cat "$T/i1.out")"
SUDO="" HOME_BASE="$ID" "$R/install-tenant-copy.sh" cryptocardhub > "$T/i2.out" 2>&1
IC="$ID/cryptocardhub/bin/api-credits"
[ "$(grep -c '^[0-9a-f]\{32\}  ' "$T/i2.out")" = 7 ] && ok "installer prints the md5 of 7 files" || bad "installer md5 list"
[ "$(stat -c %a "$IC/api-batch")" = 755 ] && [ "$(stat -c %a "$IC/api-credits.json")" = 644 ] && ok "installer modes 0755/0644" || bad "installer modes"
ls "$IC"/api_credits.py.bak-pre-0746-* >/dev/null 2>&1 && ok "installer keeps .bak-pre-0746-<UTC> of overwritten files" || bad "installer backup"
[ -d "$IC/__pycache__" ] && bad "installer left __pycache__" || ok "installer leaves no __pycache__"

# 10. the whole suite again from the installed copy, HOME a fixture tenant home (config next to self, tenant default)
if [ -z "${API_CREDITS_COPY:-}" ]; then
  API_CREDITS_COPY=1 API_CREDITS_DIR="$IC" TEST_TENANT=cryptocardhub bash "$0" > "$T/copyrun.out" 2>&1; rc=$?
  tail -3 "$T/copyrun.out"
  [ "$rc" = 0 ] && ok "whole suite passes from the installed tenant copy" || { bad "suite from tenant copy rc=$rc"; grep FAIL "$T/copyrun.out"; }
fi
exit $FAIL
