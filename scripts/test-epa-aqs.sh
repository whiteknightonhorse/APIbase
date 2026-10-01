#!/bin/bash
# Smoke test for EPA AQS — epa-aqs (UC-800)
# Tests: health, catalog presence, tool details, public upstream endpoint, key-gated upstream rejects bad key

BASE="${BASE:-https://apibase.pro}"
UP="https://aqs.epa.gov/data/api"
PASS=0
FAIL=0

check() {
  if [ "$2" = "ok" ]; then echo "  PASS: $1"; PASS=$((PASS + 1)); else echo "  FAIL: $1 — $2"; FAIL=$((FAIL + 1)); fi
}

echo "=== epa-aqs Smoke Test ==="

STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health ready" "$([ "$STATUS" = "ready" ] && echo ok || echo "$STATUS")"

COUNT=$(curl -s "$BASE/api/v1/tools?limit=2000" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(len([t for t in d['data'] if t['provider']=='epa-aqs']))" 2>/dev/null)
check "5 epa-aqs tools in catalog" "$([ "$COUNT" = "5" ] && echo ok || echo "got $COUNT")"

for TOOL in list_parameters list_counties monitors daily_data annual_data; do
  HAS=$(curl -s "$BASE/api/v1/tools/epa-aqs.$TOOL" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('ok' if t.get('input_schema',{}).get('properties') else 'no schema')" 2>/dev/null)
  check "epa-aqs.$TOOL schema populated" "$HAS"
done

BODY=$(curl -s "$UP/list/states?email=test@example.com&key=invalid")
check "upstream rejects invalid key" "$(echo "$BODY" | grep -qi 'fail\|invalid' && echo ok || echo "unexpected: ${BODY:0:80}")"

echo "Passed: $PASS Failed: $FAIL"
[ "$FAIL" = "0" ]
