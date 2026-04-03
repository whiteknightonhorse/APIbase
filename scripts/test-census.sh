#!/usr/bin/env bash
# Smoke test for UC-333: US Census Bureau (4 tools)
set -uo pipefail
BASE="https://apibase.pro"
PASS=0; FAIL=0
pass() { echo "  PASS  $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL  $1"; FAIL=$((FAIL + 1)); }

echo "=== US Census Bureau Smoke Test ==="

if curl -sf "$BASE/health/ready" >/dev/null 2>&1; then pass "Health ready"; else fail "Health ready"; fi

COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "import sys,json; print(sum(1 for t in json.load(sys.stdin)['data'] if t['id'].startswith('census.')))")
if [ "$COUNT" -eq 4 ]; then pass "4 Census tools ($COUNT)"; else fail "4 Census tools ($COUNT)"; fi

for TOOL in census.population census.demographics census.economic census.housing; do
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/tools/$TOOL")
  if [ "$STATUS" = "200" ]; then pass "Tool detail $TOOL"; else fail "Tool detail $TOOL ($STATUS)"; fi
done

POP=$(curl -s "https://api.census.gov/data/2022/acs/acs5?get=NAME,B01001_001E&for=state:06&key=$(grep PROVIDER_KEY_CENSUS /home/apibase/apibase/.env | cut -d= -f2-)" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[1][1])" 2>/dev/null)
if [ -n "$POP" ] && [ "$POP" -gt 30000000 ]; then pass "Upstream → CA pop=$POP"; else fail "Upstream → $POP"; fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -eq 0 ]; then echo "=== All tests passed ==="; else exit 1; fi
