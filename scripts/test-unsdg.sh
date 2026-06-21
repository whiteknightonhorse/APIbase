#!/bin/bash
# APIbase.pro — UN SDG API Smoke Test (UC-457)
# Tests: health, catalog, tool detail, live API calls

set -euo pipefail

API_URL="${API_URL:-https://apibase.pro}"
PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== UN SDG API Smoke Test (UC-457) ==="
echo "Target: $API_URL"
echo ""

# 1. Health check
echo "1. Health check..."
STATUS=$(curl -s "$API_URL/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && pass "Health ready" || fail "Health not ready: $STATUS"

# 2. UN SDG tools in catalog
echo "2. UN SDG tools in catalog..."
COUNT=$(curl -s "$API_URL/api/v1/tools" | python3 -c "
import sys,json
d=json.load(sys.stdin)
n=[t for t in d['data'] if t['id'].startswith('unsdg.')]
print(len(n))
")
[ "$COUNT" -eq 5 ] && pass "$COUNT unsdg tools in catalog" || fail "Expected 5 unsdg tools, got $COUNT"

# 3. Tool detail - goals
echo "3. Tool detail - unsdg.goals.list..."
DETAIL=$(curl -s "$API_URL/api/v1/tools/unsdg.goals.list")
HAS_SCHEMA=$(echo "$DETAIL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(bool(d.get('input_schema',{}).get('properties')))")
[ "$HAS_SCHEMA" = "True" ] && pass "unsdg.goals.list has input_schema" || fail "unsdg.goals.list missing input_schema"

# 4. Tool detail - data query
echo "4. Tool detail - unsdg.data.query..."
DETAIL=$(curl -s "$API_URL/api/v1/tools/unsdg.data.query")
HAS_REQUIRED=$(echo "$DETAIL" | python3 -c "import sys,json; d=json.load(sys.stdin); print('series_code' in str(d.get('input_schema',{})))")
[ "$HAS_REQUIRED" = "True" ] && pass "unsdg.data.query has series_code param" || fail "unsdg.data.query missing series_code param"

# 5. Live endpoint - verify upstream API is reachable
echo "5. Live upstream API check..."
GOALS=$(curl -s "https://unstats.un.org/sdgs/UNSDGAPIV5/v1/sdg/Goal/List" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "0")
[ "$GOALS" -eq 17 ] && pass "Upstream returns 17 SDG goals" || fail "Upstream goal count: $GOALS (expected 17)"

# 6. Live upstream - targets
echo "6. Live upstream targets check..."
TARGETS=$(curl -s "https://unstats.un.org/sdgs/UNSDGAPIV5/v1/sdg/Target/List?goal=1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "0")
[ "$TARGETS" -gt 0 ] && pass "Upstream returns $TARGETS targets for Goal 1" || fail "Upstream targets empty"

# 7. Live upstream - series data
echo "7. Live upstream data check..."
RECORDS=$(curl -s "https://unstats.un.org/sdgs/UNSDGAPIV5/v1/sdg/Series/Data?seriesCode=SI_POV_DAY1&pageSize=5" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('totalElements',0))" 2>/dev/null || echo "0")
[ "$RECORDS" -gt 0 ] && pass "Upstream returns $RECORDS records for SI_POV_DAY1" || fail "Upstream data empty"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && echo "All tests PASSED" || { echo "Some tests FAILED"; exit 1; }
