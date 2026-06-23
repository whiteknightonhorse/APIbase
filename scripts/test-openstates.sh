#!/usr/bin/env bash
# OpenStates smoke test — UC-498

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local label="$1"; local result="$2"; local expected="$3"
  if echo "$result" | grep -q "$expected"; then
    echo "  PASS: $label"; PASS=$((PASS + 1))
  else
    echo "  FAIL: $label — expected '$expected' in: $result"; FAIL=$((FAIL + 1))
  fi
}

echo "=== OpenStates Smoke Test (UC-498) ==="

# 1. Health
echo "1/5 Health check..."
check "health" "$(curl -s $BASE/health/ready)" '"status":"ready"'

# 2. Tools in catalog
echo "2/5 OpenStates tools in catalog..."
CATALOG=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
os_tools=[t['id'] for t in d['data'] if t['id'].startswith('openstates.')]
print(','.join(os_tools))
")
check "catalog_bills_search" "$CATALOG" "openstates.bills_search"
check "catalog_people_search" "$CATALOG" "openstates.people_search"
check "catalog_bill_detail" "$CATALOG" "openstates.bill_detail"
check "catalog_committees" "$CATALOG" "openstates.committees"

# 3. Tool details
echo "3/5 Tool detail endpoints..."
check "bills_search_schema" "$(curl -s $BASE/api/v1/tools/openstates.bills_search)" '"jurisdiction"'
check "bill_detail_schema" "$(curl -s $BASE/api/v1/tools/openstates.bill_detail)" '"session"'

# 4. Live execution (requires TEST_API_KEY)
if [ -n "$TEST_API_KEY" ]; then
  echo "4/5 Live API calls..."
  BILLS=$(curl -s -X POST "$BASE/api/v1/tools/openstates.bills_search/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"jurisdiction":"ca","q":"climate","per_page":2}')
  check "bills_search_live" "$BILLS" '"results"'
else
  echo "4/5 Live calls skipped (set TEST_API_KEY)"
fi

# 5. Dashboard
echo "5/5 Dashboard..."
sudo docker exec apibase-redis-1 redis-cli DEL 'dashboard:data' > /dev/null 2>&1 || true
DASH=$(curl -s "$BASE/api/v1/dashboard" | python3 -c "
import sys,json; d=json.load(sys.stdin)
m=[p for p in d['providers'] if p['provider']=='openstates']
print('found=%d,tools=%d' % (len(m), m[0]['tool_count']) if m else 'not_found')
")
check "dashboard_openstates" "$DASH" "found=1,tools=4"

echo ""
echo "=== Results: PASS=$PASS FAIL=$FAIL ==="
if [ $FAIL -eq 0 ]; then echo "ALL PASSED"; else exit 1; fi
