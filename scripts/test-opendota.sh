#!/usr/bin/env bash
# test-opendota.sh — Smoke tests for OpenDota adapter (UC-418)
set -euo pipefail

BASE="${API_BASE:-https://apibase.pro}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name — $result"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== OpenDota Smoke Tests (UC-418) ==="

# 1. Health check
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/health/ready")
check "Health check" "$([ "$STATUS" = "200" ] && echo ok || echo "HTTP $STATUS")"

# 2. OpenDota tools in catalog
COUNT=$(curl -s "${BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
opendota=[t for t in d['data'] if t['id'].startswith('opendota.')]
print(len(opendota))
")
check "OpenDota tools in catalog (expect 4)" "$([ "$COUNT" = "4" ] && echo ok || echo "got $COUNT")"

# 3. Tool detail endpoints
for TOOL in opendota.player_summary opendota.player_matches opendota.match_detail opendota.pro_teams; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/v1/tools/${TOOL}")
  check "Tool detail: ${TOOL}" "$([ "$STATUS" = "200" ] && echo ok || echo "HTTP $STATUS")"
done

# 4. Input schema validation (player_summary must have account_id property)
HAS_SCHEMA=$(curl -s "${BASE}/api/v1/tools/opendota.player_summary" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props = t.get('input_schema',{}).get('properties',{})
print('ok' if 'account_id' in props else 'missing account_id')
")
check "player_summary input schema has account_id" "$HAS_SCHEMA"

# 5. Upstream live test (Dendi player profile)
if [ -n "${PROVIDER_KEY_OPENDOTA:-}" ]; then
  UPSTREAM=$(curl -s "https://api.opendota.com/api/players/105248644?api_key=${PROVIDER_KEY_OPENDOTA}" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('ok' if 'profile' in d else 'no profile')
" 2>/dev/null)
  check "Upstream: Dendi player profile" "$UPSTREAM"
else
  echo "  SKIP: Upstream test (PROVIDER_KEY_OPENDOTA not set)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
