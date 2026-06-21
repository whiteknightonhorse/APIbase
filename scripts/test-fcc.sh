#!/usr/bin/env bash
# FCC Open Data smoke tests (UC-455)
set -euo pipefail

BASE="https://apibase.pro"
TOOL_API="${BASE}/api/v1/tools"
OK=0; FAIL=0

pass() { echo "PASS: $1"; OK=$((OK+1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== FCC Open Data Smoke Tests ==="

# 1. Health check
curl -sf "${BASE}/health/ready" > /dev/null && pass "Health check" || fail "Health check"

# 2. FCC tools in catalog (expect 4)
COUNT=$(curl -s "${TOOL_API}" | python3 -c "
import sys, json
d = json.load(sys.stdin)
fcc = [t for t in d['data'] if t['id'].startswith('fcc.')]
print(len(fcc))
")
[ "$COUNT" -eq 4 ] && pass "FCC tool count ($COUNT/4)" || fail "FCC tool count ($COUNT/4)"

# 3. Tool detail endpoints
for TID in fcc.geo.block_fips fcc.regulatory.proceedings fcc.regulatory.filings fcc.regulatory.proceeding_detail; do
  SC=$(curl -s -o /dev/null -w "%{http_code}" "${TOOL_API}/${TID}")
  [ "$SC" -eq 200 ] && pass "Tool detail ${TID} (${SC})" || fail "Tool detail ${TID} (${SC})"
done

# 4. Schema populated
PROPS=$(curl -s "${TOOL_API}/fcc.geo.block_fips" | python3 -c "
import sys, json
t = json.load(sys.stdin)
print(len(t.get('input_schema', {}).get('properties', {})))
")
[ "$PROPS" -ge 2 ] && pass "fcc.geo.block_fips schema ($PROPS props)" || fail "fcc.geo.block_fips schema empty"

# 5. Upstream geo endpoint responds
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://geo.fcc.gov/api/census/block/find?latitude=38.9&longitude=-77.0&format=json")
[ "$STATUS" -eq 200 ] && pass "geo.fcc.gov upstream healthy" || fail "geo.fcc.gov upstream unreachable ($STATUS)"

echo ""
echo "Results: ${OK} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
