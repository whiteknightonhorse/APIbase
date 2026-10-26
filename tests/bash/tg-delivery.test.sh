#!/usr/bin/env bash
# T-0575: sync-counts-cron.sh calert() sends through ~/taskloop/lib/tg.sh, so every call leaves a
# delivery line and the script itself holds no direct Telegram API call. Fake curl on PATH, temp FS.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$REPO/scripts/sync-counts-cron.sh"
LIB="${TG_LIB:-$HOME/taskloop/lib/tg.sh}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()   { echo "ok:   $1"; }
fail() { echo "FAIL: $1"; FAIL=1; }

if [ ! -f "$LIB" ]; then echo "SKIP: $LIB not present (fleet-host only)"; exit 0; fi

# no direct API call left in the script
if grep -q 'api\.telegram\.org' "$SCRIPT"; then fail "sync-counts-cron.sh still calls the Telegram API directly"; else ok "no direct api call"; fi

mkdir -p "$TMP/bin" "$TMP/state"
cat > "$TMP/bin/curl" <<'EOF'
#!/bin/sh
out=""; prev=""
for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done
[ -n "$out" ] && echo '{"ok":true}' > "$out"
printf 200
EOF
chmod +x "$TMP/bin/curl"
printf 'TG_BOT_TOKEN=fake-bot-credential\nTG_CHAT_ID=424242\n' > "$TMP/tg.env"

awk '/^calert\(\)\{/{p=1} p{print} p&&/^\}/{p=0}' "$SCRIPT" > "$TMP/calert.sh"
[ -s "$TMP/calert.sh" ] || { fail "could not extract calert()"; exit 1; }

export PATH="$TMP/bin:$PATH" TG_LIB="$LIB" TG_ENV_FILE="$TMP/tg.env" \
  TG_DELIVERY_LOG="$TMP/tg-delivery.log" TG_DEAD_MARKER="$TMP/dead" TG_DEAD_STREAK_FILE="$TMP/streak"
STATE_DIR="$TMP/state"; TODAY="2026-10-26"
# shellcheck disable=SC1091
source "$TMP/calert.sh"

calert "count drift" "cause-a"
if grep -qE '^[0-9T:Z-]+ SENT http=200 ok=yes desc=none bytes=[0-9]+ head=\[sync-counts-cron\] count drift$' "$TMP/tg-delivery.log" 2>/dev/null; then
  ok "calert leaves a SENT delivery line"
else fail "no SENT line: $(cat "$TMP/tg-delivery.log" 2>/dev/null)"; fi
if grep -q 'fake-bot-credential\|424242' "$TMP/tg-delivery.log"; then fail "credentials leaked into the log"; else ok "no credentials in the log"; fi

calert "count drift" "cause-a"   # same cause, same UTC day: deduped, no second line
[ "$(wc -l < "$TMP/tg-delivery.log")" = 1 ] && ok "same-day duplicate cause sends nothing" || fail "dedup broke"

# mutation control: a failing Telegram must log FAILED
cat > "$TMP/bin/curl" <<'EOF'
#!/bin/sh
out=""; prev=""
for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done
[ -n "$out" ] && echo '{"ok":false,"description":"nope"}' > "$out"
printf 400
EOF
calert "other" "cause-b"
grep -q ' FAILED http=400 ok=no desc=nope ' "$TMP/tg-delivery.log" && ok "failing Telegram logs FAILED" || fail "no FAILED line"

[ "$FAIL" = 0 ] && echo "tg-delivery tests: all passed" || { echo "tg-delivery tests: FAILED"; exit 1; }
