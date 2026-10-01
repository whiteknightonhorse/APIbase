#!/bin/bash
# Smoke test for Malaysia data.gov.my — malaysiagov (UC-798)
# Tests: health, catalog presence, tool details, live upstream API calls

BASE="${BASE:-https://apibase.pro}"
UP="https://api.data.gov.my"
PASS=0
FAIL=0

check() {
  if [ "$2" = "ok" ]; then echo "  PASS: $1"; PASS=$((PASS + 1)); else echo "  FAIL: $1 — $2"; FAIL=$((FAIL + 1)); fi
}

echo "=== malaysiagov Smoke Test ==="

STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health ready" "$([ "$STATUS" = "ready" ] && echo ok || echo "$STATUS")"

COUNT=$(curl -s "$BASE/api/v1/tools?limit=2000" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(len([t for t in d['data'] if t['provider']=='malaysiagov']))" 2>/dev/null)
check "5 malaysiagov tools in catalog" "$([ "$COUNT" = "5" ] && echo ok || echo "got $COUNT")"

for TOOL in dataset weather_forecast weather_warning earthquake flood_warning; do
  HAS=$(curl -s "$BASE/api/v1/tools/malaysiagov.$TOOL" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('ok' if t.get('input_schema',{}).get('properties') else 'no schema')" 2>/dev/null)
  check "malaysiagov.$TOOL schema populated" "$HAS"
done

for P in "data-catalogue/?id=fuelprice&limit=1" "weather/forecast/?limit=1" "weather/warning/?limit=1" "weather/warning/earthquake/?limit=1" "flood-warning/?limit=1"; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "$UP/$P")
  check "upstream $P" "$([ "$CODE" = "200" ] && echo ok || echo "HTTP $CODE")"
  sleep 1
done

echo "Passed: $PASS Failed: $FAIL"
[ "$FAIL" = "0" ]
