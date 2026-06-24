#!/usr/bin/env bash
# Smoke test for UNHCR Population Data (UC-511)
set -euo pipefail

BASE="${API_BASE:-https://apibase.pro}"
TEST_KEY="${TEST_API_KEY:-}"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

# 1. Health
STATUS=$(curl -s "${BASE}/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && pass "Health" || fail "Health: $STATUS"

# 2. UNHCR tools in catalog
COUNT=$(curl -s "${BASE}/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n=[t for t in d['data'] if t['id'].startswith('unhcr.')]
print(len(n))
")
[ "$COUNT" -eq 4 ] && pass "Catalog: 4 UNHCR tools" || fail "Expected 4 UNHCR tools, got $COUNT"

# 3. Tool detail schemas
for TOOL in unhcr.population unhcr.solutions unhcr.asylum_applications unhcr.asylum_decisions; do
  PROPS=$(curl -s "${BASE}/api/v1/tools/${TOOL}" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print(len(t.get('input_schema',{}).get('properties',{})))
")
  [ "$PROPS" -gt 0 ] && pass "Schema: ${TOOL} (${PROPS} props)" || fail "No schema for ${TOOL}"
done

# 4. Live API calls (if TEST_API_KEY set)
if [ -n "$TEST_KEY" ]; then
  echo "--- Live API calls ---"

  # population: global 2023
  RESULT=$(curl -s -X POST "${BASE}/api/v1/tools/unhcr.population/call" \
    -H "Authorization: Bearer ${TEST_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"year":2023,"limit":1}')
  REFUGEES=$(echo "$RESULT" | python3 -c "import sys,json; r=json.load(sys.stdin)['result']; print(r['items'][0]['refugees'])")
  [ -n "$REFUGEES" ] && pass "population: 2023 global refugees=$REFUGEES" || fail "population: no data"

  # solutions: global 2022
  RESULT=$(curl -s -X POST "${BASE}/api/v1/tools/unhcr.solutions/call" \
    -H "Authorization: Bearer ${TEST_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"year":2022,"limit":1}')
  RESET=$(echo "$RESULT" | python3 -c "import sys,json; r=json.load(sys.stdin)['result']; print(r['items'][0]['resettlement'])")
  [ -n "$RESET" ] && pass "solutions: 2022 resettlement=$RESET" || fail "solutions: no data"

  # asylum_applications: 2022
  RESULT=$(curl -s -X POST "${BASE}/api/v1/tools/unhcr.asylum_applications/call" \
    -H "Authorization: Bearer ${TEST_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"year":2022,"limit":1}')
  APP=$(echo "$RESULT" | python3 -c "import sys,json; r=json.load(sys.stdin)['result']; print(r['items'][0]['applied'])")
  [ -n "$APP" ] && pass "asylum_applications: 2022 applied=$APP" || fail "asylum_applications: no data"

  # asylum_decisions: 2022
  RESULT=$(curl -s -X POST "${BASE}/api/v1/tools/unhcr.asylum_decisions/call" \
    -H "Authorization: Bearer ${TEST_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"year":2022,"limit":1}')
  DEC=$(echo "$RESULT" | python3 -c "import sys,json; r=json.load(sys.stdin)['result']; print(r['items'][0]['total_decisions'])")
  [ -n "$DEC" ] && pass "asylum_decisions: 2022 total=$DEC" || fail "asylum_decisions: no data"
else
  echo "(Set TEST_API_KEY for live API call tests)"
fi

echo ""
echo "=== UNHCR smoke test complete ==="
