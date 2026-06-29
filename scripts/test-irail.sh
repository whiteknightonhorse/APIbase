#!/usr/bin/env bash
# iRail Belgium Rail smoke test (UC-524)
set -euo pipefail

API_URL="${API_URL:-https://apibase.pro}"
PASSED=0
FAILED=0

check() {
  local label="$1"
  local result="$2"
  if [ "$result" = "ok" ]; then
    echo "PASS  $label"
    PASSED=$((PASSED + 1))
  else
    echo "FAIL  $label — $result"
    FAILED=$((FAILED + 1))
  fi
}

echo "=== iRail Belgium Rail smoke tests ==="
echo "Target: $API_URL"
echo ""

# 1. Health check
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health/ready")
check "1/5 Health check" "$([ "$HTTP" = "200" ] && echo ok || echo "HTTP $HTTP")"

# 2. iRail tools in catalog
COUNT=$(curl -s "$API_URL/api/v1/tools" | python3 -c "
import sys,json
d=json.load(sys.stdin)
n = len([t for t in d['data'] if t['id'].startswith('irail.')])
print(n)
" 2>/dev/null)
check "2/5 iRail tools in catalog (expect 5)" "$([ "$COUNT" = "5" ] && echo ok || echo "got $COUNT")"

# 3. Tool detail — stations (schema check)
SCHEMA=$(curl -s "$API_URL/api/v1/tools/irail.stations" | python3 -c "
import sys,json
t=json.load(sys.stdin)
props = list(t.get('input_schema',{}).get('properties',{}).keys())
print('ok' if props else 'no-schema')
" 2>/dev/null)
check "3/5 irail.stations has input_schema" "$SCHEMA"

# 4. Tool detail — liveboard (schema check)
SCHEMA2=$(curl -s "$API_URL/api/v1/tools/irail.liveboard" | python3 -c "
import sys,json
t=json.load(sys.stdin)
props = list(t.get('input_schema',{}).get('properties',{}).keys())
print('ok' if 'station' in props else 'missing-station-param')
" 2>/dev/null)
check "4/5 irail.liveboard schema has station param" "$SCHEMA2"

# 5. Tool detail — connections (schema check)
SCHEMA3=$(curl -s "$API_URL/api/v1/tools/irail.connections" | python3 -c "
import sys,json
t=json.load(sys.stdin)
props = list(t.get('input_schema',{}).get('properties',{}).keys())
print('ok' if 'from' in props and 'to' in props else 'missing-from-to-params')
" 2>/dev/null)
check "5/5 irail.connections schema has from+to params" "$SCHEMA3"

echo ""
echo "Results: $PASSED passed, $FAILED failed"
[ "$FAILED" -eq 0 ] && echo "=== All iRail tests passed ===" || { echo "=== FAILURES DETECTED ==="; exit 1; }
