#!/usr/bin/env bash
# Smoke test: CPSC SaferProducts.gov (UC-562)
set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

ok()   { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== CPSC SaferProducts.gov Smoke Test (UC-562) ==="

# 1. Health check
echo "1/5 Health check..."
HEALTH=$(curl -sf "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$HEALTH" = "ready" ] && ok "Health ready" || fail "Health: $HEALTH"

# 2. CPSC tools appear in catalog
echo "2/5 Tool catalog..."
COUNT=$(curl -sf "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
cpsc=[t for t in d['data'] if t['provider']=='cpsc']
print(len(cpsc))
")
[ "$COUNT" -eq 4 ] && ok "4 CPSC tools in catalog" || fail "Expected 4 CPSC tools, got $COUNT"

# 3. Tool detail — input_schema populated
echo "3/5 Tool detail schemas..."
for TOOL in cpsc.search cpsc.detail cpsc.recent cpsc.by_manufacturer; do
  SCHEMA=$(curl -sf "$BASE/api/v1/tools/$TOOL" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props=t.get('input_schema',{}).get('properties',{})
print(len(props))
")
  [ "$SCHEMA" -gt 0 ] && ok "$TOOL has $SCHEMA input params" || fail "$TOOL missing input_schema"
done

# 4. Live API call: cpsc.search (no payment needed for catalog checks)
echo "4/5 Upstream API reachability..."
HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallDateStart=2026-06-01&pager.count=1")
[ "$HTTP" = "200" ] && ok "SaferProducts.gov API reachable (HTTP $HTTP)" || fail "API returned HTTP $HTTP"

# 5. Quick data validation
echo "5/5 Data format validation..."
RESULT=$(curl -s "https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallDateStart=2026-06-25&pager.count=1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if isinstance(d,list) and len(d)>0 and 'RecallID' in d[0] and 'Title' in d[0]:
    print('ok')
else:
    print('unexpected: '+str(d)[:100])
")
[ "$RESULT" = "ok" ] && ok "Recall JSON structure valid (RecallID, Title present)" || fail "Unexpected response: $RESULT"

echo ""
echo "=== Results ==="
echo "Passed: $PASS/5"
[ $FAIL -eq 0 ] && echo "=== All CPSC smoke tests passed ===" || echo "=== $FAIL test(s) FAILED ==="
exit $FAIL
