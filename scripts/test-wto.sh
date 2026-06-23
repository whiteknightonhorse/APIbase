#!/bin/bash
# WTO Timeseries API — smoke tests (UC-494)
set -euo pipefail

API_URL="${API_URL:-https://apibase.pro}"
PASS=0; FAIL=0

check() {
  local label="$1"; local result="$2"
  if [ "$result" = "ok" ]; then
    echo "PASS: $label"; PASS=$((PASS+1))
  else
    echo "FAIL: $label — $result"; FAIL=$((FAIL+1))
  fi
}

echo "=== WTO Timeseries API smoke tests ==="

# 1. Health
STATUS=$(curl -s "$API_URL/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health ready" "$( [ "$STATUS" = "ready" ] && echo ok || echo "$STATUS" )"

# 2. WTO tools in catalog
COUNT=$(curl -s "$API_URL/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
wto=[t for t in d['data'] if t['id'].startswith('wto.')]
print(len(wto))
" 2>/dev/null)
check "4 WTO tools in catalog" "$( [ "$COUNT" = "4" ] && echo ok || echo "got $COUNT" )"

# 3. Tool detail with schema
SCHEMA_OK=$(curl -s "$API_URL/api/v1/tools/wto.trade_data" | python3 -c "
import sys,json; t=json.load(sys.stdin)
ok = bool(t.get('input_schema',{}).get('properties'))
print('ok' if ok else 'no-schema')
" 2>/dev/null)
check "wto.trade_data has input_schema" "$SCHEMA_OK"

# 4. Indicators tool detail
SCHEMA2=$(curl -s "$API_URL/api/v1/tools/wto.indicators" | python3 -c "
import sys,json; t=json.load(sys.stdin)
ok = bool(t.get('input_schema',{}).get('properties'))
print('ok' if ok else 'no-schema')
" 2>/dev/null)
check "wto.indicators has input_schema" "$SCHEMA2"

# 5. Reporters tool detail
SCHEMA3=$(curl -s "$API_URL/api/v1/tools/wto.reporters" | python3 -c "
import sys,json; t=json.load(sys.stdin)
ok = bool(t.get('input_schema',{}).get('properties'))
print('ok' if ok else 'no-schema')
" 2>/dev/null)
check "wto.reporters has input_schema" "$SCHEMA3"

# 6. Descriptions are rich (not just echoed tool name)
RICH=$(curl -s "$API_URL/api/v1/tools/wto.trade_data" | python3 -c "
import sys,json; t=json.load(sys.stdin)
desc = t.get('description','')
print('ok' if len(desc) > 100 else 'short')
" 2>/dev/null)
check "wto.trade_data has rich description" "$RICH"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
