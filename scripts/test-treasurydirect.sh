#!/usr/bin/env bash
# Smoke test: TreasuryDirect TA_WS (UC-536)
set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local desc="$1" result="$2"
  if [ "$result" = "ok" ]; then
    echo "PASS: $desc"; PASS=$((PASS+1))
  else
    echo "FAIL: $desc — $result"; FAIL=$((FAIL+1))
  fi
}

echo "=== TreasuryDirect TA_WS Smoke Test ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
check "Health check" "$([ "$STATUS" = "ready" ] && echo ok || echo "$STATUS")"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); tools=[t for t in d['data'] if t['provider']=='treasurydirect']; print(len(tools))")
check "4 tools in catalog" "$([ "$COUNT" -eq 4 ] && echo ok || echo "got $COUNT")"

# 3. Tool detail endpoints
for TOOL in auction_results upcoming_auctions search_cusip tips_rates; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/treasurydirect.$TOOL")
  check "Tool detail: $TOOL" "$([ "$HTTP" = "200" ] && echo ok || echo "HTTP $HTTP")"
done

# 4. Upstream endpoint health
COUNT2=$(curl -s "https://www.treasurydirect.gov/TA_WS/securities/upcoming?format=json" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
check "Upstream upcoming auctions returns data" "$([ "$COUNT2" -gt 0 ] && echo ok || echo "got $COUNT2")"

COUNT3=$(curl -s "https://www.treasurydirect.gov/TA_WS/securities/auctioned?type=Bill&days=30&format=json" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
check "Upstream Bill auction results" "$([ "$COUNT3" -gt 0 ] && echo ok || echo "got $COUNT3")"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && echo "ALL PASS" && exit 0 || exit 1
