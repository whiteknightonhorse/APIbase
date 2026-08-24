#!/usr/bin/env bash
# K-02: measurements for reconcile_log_orphans() + the 0-byte/rc=0 guard in run_agent().
#
# Reproduces, in an isolated /tmp harness, the exact defect: an "AGENT start: LABEL" line with
# no matching completion line (process died silently — the whole run_agent tree was killed
# before its own trailing `log ... done/TIMEOUT/...` line could execute), plus the sibling case
# of a claude process that exits rc=0 but writes a 0-byte log (a silent "success" that must not
# be swallowed). No production state/, no real claude, no GitHub, no Telegram.
#
# Run: bash scripts/night-orchestra/test-orphan-agent.sh
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
fail=0
ts(){ date -u +%FT%TZ; }
assert(){ if [ "$2" -eq 0 ]; then echo "PASS: $1"; else echo "FAIL: $1"; fail=1; fi; }

H=$(mktemp -d /tmp/orch-orphan.XXXXXX)
mkdir -p "$H/scripts/night-orchestra/state" "$H/scripts/night-orchestra/logs" "$H/scripts/night-orchestra/roles"
sed "s#^ROOT=.*#ROOT=$H#" "$REPO/scripts/night-orchestra/lib.sh" > "$H/scripts/night-orchestra/lib.sh"
cd "$H" || exit 1
# shellcheck source=/dev/null
source "$H/scripts/night-orchestra/lib.sh"

DLOG="$(daily_log)"

echo "=== Measurement 1: forcibly-killed agent leaves a start with no completion -> reconcile logs FAIL/LOST ($(ts)) ==="
# Simulate the exact production defect (orchestra-2026-08-24.log, onboard-statistics-denmark):
# a start line whose process is provably gone (no PID was ever tracked -- this must catch
# orphans that predate this fix too) and old enough (>60s) not to be mistaken for still-running.
OLD_TS=$(date -u -d '@'"$(($(date +%s) - 300))" +%FT%TZ 2>/dev/null || date -u -v-300S +%FT%TZ)
echo "[$OLD_TS] AGENT start: onboard-test-killed-agent-$$-nonexistent (timeout 30s, model sonnet)" >> "$DLOG"
reconcile_log_orphans "$DLOG"
LOST_LINE=$(grep -c "AGENT onboard-test-killed-agent-$$-nonexistent FAIL rc=LOST" "$DLOG")
echo "--- evidence: $DLOG ---"; grep "onboard-test-killed-agent-$$-nonexistent" "$DLOG"
assert "orphaned start (dead process, >60s old) gets a synthetic FAIL/LOST completion line" $([ "${LOST_LINE:-0}" -ge 1 ] && echo 0 || echo 1)

echo
echo "=== Measurement 2: 'AGENT start:' count now equals completion-line count for that agent ($(ts)) ==="
STARTS=$(grep -c "AGENT start: onboard-test-killed-agent-$$-nonexistent" "$DLOG")
DONE=$(grep -cE "AGENT onboard-test-killed-agent-$$-nonexistent (done rc=|RATE-LIMITED|TIMEOUT|FAIL)" "$DLOG")
assert "starts ($STARTS) == completions ($DONE) after reconciliation" $([ "$STARTS" -eq "$DONE" ] && echo 0 || echo 1)

echo
echo "=== Measurement 3: a young start (<60s) is NOT flagged -- no false positive on a still-running agent ($(ts)) ==="
echo "[$(ts)] AGENT start: onboard-test-still-running-$$ (timeout 3000s, model sonnet)" >> "$DLOG"
reconcile_log_orphans "$DLOG"
YOUNG_FLAGGED=$(grep -c "AGENT onboard-test-still-running-$$ FAIL rc=LOST" "$DLOG")
assert "a start younger than 60s is left alone (not falsely declared dead)" $([ "${YOUNG_FLAGGED:-0}" -eq 0 ] && echo 0 || echo 1)

echo
echo "=== Measurement 4: rc=0 with a 0-byte agent log is not swallowed as success ($(ts)) ==="
FAKE_CLAUDE="$H/fake-claude-empty-ok.sh"
cat > "$FAKE_CLAUDE" <<'FAKE'
#!/usr/bin/env bash
exit 0
FAKE
chmod +x "$FAKE_CLAUDE"
CLAUDE_BIN="$FAKE_CLAUDE" out=$(run_agent "test-empty-output" "irrelevant prompt" 30); RC=$?
echo "--- evidence: $DLOG (tail) ---"; tail -3 "$DLOG"
assert "run_agent returns non-zero for a 0-byte log even though the process exited rc=0" $([ "$RC" -ne 0 ] && echo 0 || echo 1)
EMPTY_LINE=$(grep -c "AGENT test-empty-output FAIL rc=0-EMPTY" "$DLOG")
assert "0-byte/rc=0 case gets an explicit FAIL log line, not a silent 'done rc=0'" $([ "${EMPTY_LINE:-0}" -ge 1 ] && echo 0 || echo 1)

rm -rf "$H"

echo
[ "$fail" -eq 0 ] && echo "ALL ORPHAN-AGENT MEASUREMENTS PASS" || echo "ORPHAN-AGENT MEASUREMENTS FAILED"
exit "$fail"
