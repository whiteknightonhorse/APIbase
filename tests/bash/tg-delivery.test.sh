#!/usr/bin/env bash
# T-0797: calert() of scripts/sync-counts-cron.sh, tested with a stand-in sender written by this test.
# Reads nothing from the host: HOME is a temp directory. The engine sender is tested by
# tests/host/tg-delivery-engine.test.sh.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="${TG_DELIVERY_SCRIPT:-$REPO/scripts/sync-counts-cron.sh}"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
export HOME="$T/home"; mkdir -p "$HOME"
unset TG_ENV_FILE
FAIL=0
ok()   { echo "ok:   $1"; }
fail() { echo "FAIL: $1"; FAIL=1; }

# a. no direct API call left in the script
if grep -q 'api\.telegram\.org' "$SCRIPT"; then fail "no direct api call (script calls the Telegram API directly)"; else ok "no direct api call"; fi

awk '/^calert\(\)\{/{p=1} p{print} p&&/^\}/{p=0}' "$SCRIPT" > "$T/calert.sh"
[ -s "$T/calert.sh" ] || { echo "FAIL could not extract calert()"; exit 1; }

# Stand-in sender: one line "<TG_ENV_FILE><TAB><first argument>" per call.
cat > "$T/sender.sh" <<'X'
tg_send(){ printf '%s\t%s\n' "${TG_ENV_FILE-}" "$1" >> "$TG_STANDIN_OUT"; return "${TG_STANDIN_RC:-0}"; }
X
export TG_LIB="$T/sender.sh" TG_STANDIN_OUT="$T/out"
: > "$T/out"
STATE_DIR="$T/state"; mkdir -p "$STATE_DIR"; TODAY="2026-10-26"
# shellcheck disable=SC1091
source "$T/calert.sh"
lines(){ wc -l < "$T/out" | tr -d ' '; }

# b. first calert for a cause: exactly one line with the prefixed text
calert "count drift" "cause-a"
if [ "$(lines)" = 1 ] && [ "$(cut -f2 "$T/out")" = "[sync-counts-cron] count drift" ]; then ok "first calert sends one line with the prefixed text"
else fail "first calert sends one line with the prefixed text: $(cat "$T/out")"; fi

# f. the sender saw this tenant's own env file
[ "$(cut -f1 "$T/out" | head -n 1)" = "$HOME/taskloop/state/tg.env" ] && ok "sender saw the tenant env file" || fail "sender saw the tenant env file: $(cut -f1 "$T/out" | head -n 1)"

# c. same cause, same day
calert "count drift" "cause-a"
[ "$(lines)" = 1 ] && ok "same cause on the same day sends nothing" || fail "same cause on the same day sends nothing"

# d. new cause, same day
calert "other" "cause-b"
[ "$(lines)" = 2 ] && ok "new cause on the same day sends at once" || fail "new cause on the same day sends at once"

# e. same cause, next day
TODAY="2026-10-27"; calert "count drift" "cause-a"
[ "$(lines)" = 3 ] && ok "same cause sends again on the next day" || fail "same cause sends again on the next day"

# g. a failing sender does not stop the caller
TG_STANDIN_RC=1; calert "failing" "cause-c"; rc=$?; unset TG_STANDIN_RC
[ "$rc" = 0 ] && ok "failing sender does not stop the caller" || fail "failing sender does not stop the caller: rc=$rc"

# h. a missing sender file does not stop the caller
before="$(lines)"; TG_LIB="$T/no-such-sender.sh" calert "missing" "cause-d"; rc=$?
{ [ "$rc" = 0 ] && [ "$(lines)" = "$before" ]; } && ok "missing sender file does not stop the caller" || fail "missing sender file does not stop the caller: rc=$rc"

[ "$FAIL" = 0 ] && echo "tg-delivery tests: all passed" || { echo "tg-delivery tests: FAILED"; exit 1; }
