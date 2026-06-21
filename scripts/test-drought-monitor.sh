#!/usr/bin/env bash
# US Drought Monitor (UC-482) smoke tests
# Tests drought.national_stats, drought.dsci, drought.county_stats, drought.weeks_in_drought
set -euo pipefail

API_URL="${API_URL:-https://apibase.pro}"
PASSED=0
FAILED=0

pass() { echo "  PASS"; PASSED=$((PASSED + 1)); }
fail() { echo "  FAIL: $1"; FAILED=$((FAILED + 1)); }

echo "=== US Drought Monitor (UC-482) Smoke Tests ==="
echo ""

# 1. Health check
echo -n "1/6 Health check..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health/ready")
[ "$STATUS" = "200" ] && pass || fail "health returned $STATUS"

# 2. Provider in tool catalog
echo -n "2/6 Provider in tool catalog..."
COUNT=$(curl -s "$API_URL/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
tools = [t for t in d['data'] if t['id'].startswith('drought.')]
print(len(tools))
")
[ "$COUNT" = "4" ] && pass || fail "expected 4 drought tools, got $COUNT"

# 3. Tool detail endpoints (must have schema)
echo -n "3/6 Tool detail - drought.national_stats..."
RESP=$(curl -s "$API_URL/api/v1/tools/drought.national_stats")
HAS_SCHEMA=$(echo "$RESP" | python3 -c "import sys,json; t=json.load(sys.stdin); print('yes' if t.get('input_schema',{}).get('properties') else 'no')")
[ "$HAS_SCHEMA" = "yes" ] && pass || fail "missing input_schema properties"

# 4. Tool detail - drought.county_stats
echo -n "4/6 Tool detail - drought.county_stats..."
RESP=$(curl -s "$API_URL/api/v1/tools/drought.county_stats")
HAS_AOI=$(echo "$RESP" | python3 -c "import sys,json; t=json.load(sys.stdin); print('yes' if 'aoi' in t.get('input_schema',{}).get('properties',{}) else 'no')")
[ "$HAS_AOI" = "yes" ] && pass || fail "missing aoi param in county_stats schema"

# 5. Upstream API reachable (direct check)
echo -n "5/6 Upstream API reachable..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Accept: application/json" \
  "https://usdmdataservices.unl.edu/api/USStatistics/GetDSCI?aoi=us&startdate=1/1/2024&enddate=1/8/2024&statisticsType=1")
[ "$STATUS" = "200" ] && pass || fail "upstream returned $STATUS"

# 6. Dashboard shows drought-monitor
echo -n "6/6 Dashboard shows drought-monitor..."
COUNT=$(curl -s "$API_URL/api/v1/dashboard" | python3 -c "
import sys,json; d=json.load(sys.stdin)
match = [p for p in d['providers'] if p['provider'] == 'drought-monitor']
print(match[0]['tool_count'] if match else 0)
")
[ "$COUNT" = "4" ] && pass || fail "dashboard shows $COUNT tools for drought-monitor (expected 4)"

echo ""
echo "=== Results: $PASSED passed, $FAILED failed ==="
[ "$FAILED" = "0" ] && echo "=== All tests passed ===" && exit 0 || exit 1
