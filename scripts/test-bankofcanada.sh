#!/bin/bash
# Bank of Canada Valet API smoke tests (UC-503)
set -euo pipefail

API_URL="${API_URL:-https://apibase.pro}"
PASSED=0
FAILED=0

pass() { echo "  PASS"; PASSED=$((PASSED + 1)); }
fail() { echo "  FAIL: $1"; FAILED=$((FAILED + 1)); }

echo "=== Bank of Canada (UC-503) Smoke Tests ==="
echo ""

# 1. Health
echo -n "1/6 Health check..."
STATUS=$(curl -s "${API_URL}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
[ "$STATUS" = "ready" ] && pass || fail "expected ready, got: $STATUS"

# 2. Tools in catalog
echo -n "2/6 bankofcanada tools in catalog..."
COUNT=$(curl -s "${API_URL}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
boc=[t for t in d['data'] if t['id'].startswith('bankofcanada.')]
print(len(boc))
" 2>/dev/null)
[ "$COUNT" = "4" ] && pass || fail "expected 4 tools, got: $COUNT"

# 3. fx_rates tool detail
echo -n "3/6 bankofcanada.fx_rates tool detail..."
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/api/v1/tools/bankofcanada.fx_rates")
[ "$HTTP" = "200" ] && pass || fail "expected 200, got: $HTTP"

# 4. policy_rate tool detail
echo -n "4/6 bankofcanada.policy_rate tool detail..."
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/api/v1/tools/bankofcanada.policy_rate")
[ "$HTTP" = "200" ] && pass || fail "expected 200, got: $HTTP"

# 5. inflation tool detail
echo -n "5/6 bankofcanada.inflation tool detail..."
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/api/v1/tools/bankofcanada.inflation")
[ "$HTTP" = "200" ] && pass || fail "expected 200, got: $HTTP"

# 6. Upstream Valet API reachable
echo -n "6/6 Valet API reachable (FXCADUSD)..."
RATE=$(curl -s "https://www.bankofcanada.ca/valet/observations/FXCADUSD/json?recent=1" | python3 -c "
import sys,json; d=json.load(sys.stdin)
obs=d.get('observations',[])
print(obs[-1].get('FXCADUSD',{}).get('v','') if obs else '')
" 2>/dev/null)
[ -n "$RATE" ] && pass || fail "no rate returned from Valet API"

echo ""
echo "=== Results: $PASSED passed, $FAILED failed ==="
[ "$FAILED" = "0" ] && echo "All tests passed." || { echo "FAILED"; exit 1; }
