#!/bin/bash
# Ф5 -- post-run log hygiene gate for the physical-device MCP layer.
#
# Run this after any real device-connect flow (staging or production) to
# grep the ACTUAL served logs for a leaked vendor token or password. Exits
# non-zero (fail closed) if it finds one. This is a COMPLEMENT to
# tests/integration/device-connect-e2e.test.ts (which proves the same thing
# against a synthetic, in-memory run) -- this script proves it against
# whatever the container actually wrote.
#
# Usage:
#   scripts/check-device-no-plaintext-secrets.sh                # last 10k lines of the api container
#   scripts/check-device-no-plaintext-secrets.sh /path/to/log.txt  # a saved log file
set -euo pipefail

SRC="${1:-}"
TMP=""
if [ -z "$SRC" ]; then
  TMP="$(mktemp)"
  docker logs --tail 10000 apibase-api-1 2>&1 > "$TMP" || docker logs --tail 10000 $(docker ps --filter name=api --format '{{.Names}}' | head -1) 2>&1 > "$TMP"
  SRC="$TMP"
fi

# Patterns that must NEVER appear in plaintext in logs:
#  - a Tuya access_token/refresh_token VALUE (the field name alone is fine --
#    pino's redactObject only masks known key names like api_key/email, so
#    this checks for the actual base64 ciphertext blob leaking, and for any
#    JSON key literally named access_token/refresh_token carrying a real value
#    rather than our own masked/omitted shape).
PATTERNS=(
  '"access_token":"[A-Za-z0-9_-]{10,}"'
  '"refresh_token":"[A-Za-z0-9_-]{10,}"'
  '"vendor_password"'
  '"password":"[^"]{3,}"'
)

FOUND=0
for p in "${PATTERNS[@]}"; do
  if grep -qE "$p" "$SRC"; then
    echo "LEAK DETECTED: pattern matched -> $p"
    grep -E "$p" "$SRC" | head -3
    FOUND=1
  fi
done

[ -n "$TMP" ] && rm -f "$TMP"

if [ "$FOUND" -eq 1 ]; then
  echo "FAIL: plaintext secret pattern found in logs -- see above."
  exit 1
fi

echo "PASS: no plaintext vendor token or password pattern found in $([ -n "$TMP" ] && echo 'container logs' || echo "$1")."
