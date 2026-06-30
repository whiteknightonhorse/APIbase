#!/usr/bin/env bash
# Smoke test for CMS Provider Data (UC-561)
# Tests: health, catalog presence, tool details, live API calls

set -e
BASE="https://apibase.pro"
PASS=0; FAIL=0

ok() { echo "PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== CMS Provider Data Smoke Test ==="

# 1. Health check
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
[ "$STATUS" = "ready" ] && ok "Health check" || fail "Health check: $STATUS"

# 2. CMS tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
cms=[t for t in d['data'] if t['id'].startswith('cms.')]
print(len(cms))
" 2>/dev/null)
[ "$COUNT" = "4" ] && ok "4 CMS tools in catalog" || fail "Expected 4 CMS tools, got $COUNT"

# 3. Tool detail endpoints
for TOOL in cms.hospital_search cms.nursing_home_search cms.home_health_search cms.dialysis_search; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
  [ "$HTTP" = "200" ] && ok "Tool detail $TOOL (200)" || fail "Tool detail $TOOL: HTTP $HTTP"
done

# 4. Schema populated
PROPS=$(curl -s "$BASE/api/v1/tools/cms.hospital_search" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print(len(t.get('input_schema',{}).get('properties',{})))
" 2>/dev/null)
[ "$PROPS" -ge "5" ] && ok "hospital_search has $PROPS schema properties" || fail "hospital_search schema empty"

# 5. Live call — hospital search California 5-star
# 401 = missing auth (expected without API key), 402 = payment required, 200 = success
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/tools/cms.hospital_search/call" \
  -H "Content-Type: application/json" \
  -d '{"state":"CA","min_rating":5,"limit":3}')
case "$HTTP" in
  200|401|402) ok "hospital_search call returns HTTP $HTTP (tool registered)" ;;
  *) fail "hospital_search call: unexpected HTTP $HTTP" ;;
esac

# 6. Dashboard shows CMS provider
DASH=$(curl -s "$BASE/api/v1/dashboard" | python3 -c "
import sys,json; d=json.load(sys.stdin)
m=[p for p in d['providers'] if p['provider']=='cms']
print(m[0]['tool_count'] if m else 0)
" 2>/dev/null)
[ "$DASH" = "4" ] && ok "Dashboard: cms provider shows 4 tools" || fail "Dashboard: cms shows $DASH tools"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" = "0" ] && exit 0 || exit 1
