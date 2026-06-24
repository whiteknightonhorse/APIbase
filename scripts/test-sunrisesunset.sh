#!/usr/bin/env bash
# Test script for UC-517: SunriseSunset.io integration
# Usage: bash scripts/test-sunrisesunset.sh

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local desc="$1" result="$2"
  if [ "$result" = "true" ]; then
    echo "PASS: $desc"; PASS=$((PASS+1))
  else
    echo "FAIL: $desc"; FAIL=$((FAIL+1))
  fi
}

echo "=== SunriseSunset.io (UC-517) Tests ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
check "Health check" "$([ "$STATUS" = "ready" ] && echo true || echo false)"

# 2. 4 sunrisesunset tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(sum(1 for t in d['data'] if t['id'].startswith('sunrisesunset')))
")
check "4 sunrisesunset tools in catalog" "$([ "$COUNT" -eq 4 ] && echo true || echo false)"

# 3. Tool detail endpoints (200 + schema)
for TOOL in sunrisesunset.daily sunrisesunset.range sunrisesunset.moon_phase sunrisesunset.sun_position; do
  HAS_SCHEMA=$(curl -s "$BASE/api/v1/tools/$TOOL" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('true' if t.get('input_schema',{}).get('properties') else 'false')
")
  check "Tool detail $TOOL has schema" "$HAS_SCHEMA"
done

# 4. Direct upstream API verification
UPSTREAM=$(curl -s "https://api.sunrisesunset.io/json?lat=40.7128&lng=-74.0060&date=today" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('true' if d.get('status') == 'OK' else 'false')
")
check "Upstream API returns OK" "$UPSTREAM"

# 5. Range API verification
RANGE=$(curl -s "https://api.sunrisesunset.io/json?lat=48.8566&lng=2.3522&date_start=2026-06-01&date_end=2026-06-07" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('true' if d.get('status') == 'OK' and len(d.get('results', [])) == 7 else 'false')
")
check "Upstream range API returns 7 days" "$RANGE"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
