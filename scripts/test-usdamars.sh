#!/bin/bash
# USDA AMS MARS MyMarketNews smoke test (UC-528)
set -euo pipefail

API_URL="${API_URL:-https://apibase.pro}"
PASS=0; FAIL=0

ok()   { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== USDA AMS MARS Smoke Test (UC-528) ==="

# 1. Health
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health/ready")
[ "$HTTP" = "200" ] && ok "Health ready" || fail "Health $HTTP"

# 2. Tools in catalog
COUNT=$(curl -s "$API_URL/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
usdamars=[t for t in d['data'] if t['id'].startswith('usdamars.')]
print(len(usdamars))" 2>/dev/null || echo 0)
[ "$COUNT" -eq 4 ] && ok "4 usdamars tools in catalog" || fail "Expected 4 tools, got $COUNT"

# 3. Tool detail with schema
SCHEMA=$(curl -s "$API_URL/api/v1/tools/usdamars.list_reports" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print(bool(t.get('input_schema',{}).get('properties')))" 2>/dev/null || echo False)
[ "$SCHEMA" = "True" ] && ok "usdamars.list_reports has input_schema" || fail "Missing schema"

# 4. Tool detail: get_report
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v1/tools/usdamars.get_report")
[ "$HTTP" = "200" ] && ok "usdamars.get_report detail 200" || fail "get_report detail $HTTP"

# 5. search_reports detail
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v1/tools/usdamars.search_reports")
[ "$HTTP" = "200" ] && ok "usdamars.search_reports detail 200" || fail "search_reports detail $HTTP"

# 6. Live API check (upstream v3.1 public)
UPSTREAM=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://marsapi.ams.usda.gov/services/v3.1/public/listPublishedReports/1?format=json" 2>/dev/null || echo 000)
[ "$UPSTREAM" = "200" ] && ok "Upstream MARS v3.1 public API reachable" || fail "Upstream unreachable ($UPSTREAM)"

echo ""
echo "=== Results: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" -eq 0 ] && echo "ALL PASS" || { echo "FAILURES DETECTED"; exit 1; }
