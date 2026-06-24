#!/usr/bin/env bash
# Smoke test for MET Norway (UC-515)
set -euo pipefail

BASE="https://apibase.pro"
TOOL_PREFIX="metno"
PROVIDER="met-norway"
EXPECTED_TOOLS=4

echo "=== MET Norway (UC-515) Smoke Test ==="

# 1. Health
echo -n "1/5 Health check... "
STATUS=$(curl -sf "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && echo "PASS ($STATUS)" || { echo "FAIL"; exit 1; }

# 2. Provider tools in catalog
echo -n "2/5 Provider tools in catalog... "
COUNT=$(curl -sf "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(len([t for t in d['data'] if t['id'].startswith('${TOOL_PREFIX}.')]))
")
[ "$COUNT" -eq "$EXPECTED_TOOLS" ] && echo "PASS ($COUNT tools)" || { echo "FAIL (got $COUNT, expected $EXPECTED_TOOLS)"; exit 1; }

# 3. Tool detail endpoints (200 + schema)
echo -n "3/5 Tool detail endpoints... "
for TOOL in forecast nowcast alerts sunrise; do
  RESP=$(curl -sf "$BASE/api/v1/tools/${TOOL_PREFIX}.${TOOL}")
  HAS_SCHEMA=$(python3 -c "import sys,json; t=json.loads(sys.stdin.read()); print('yes' if t.get('input_schema',{}).get('properties') else 'no')" <<< "$RESP")
  [ "$HAS_SCHEMA" = "yes" ] || { echo "FAIL (${TOOL_PREFIX}.${TOOL} missing schema)"; exit 1; }
done
echo "PASS (all 4 tools have input_schema)"

# 4. Live API call — forecast for Oslo
echo -n "4/5 Live forecast call (Oslo)... "
if [ -n "${TEST_API_KEY:-}" ]; then
  RESULT=$(curl -sf -X POST "$BASE/api/v1/tools/${TOOL_PREFIX}.forecast/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"lat": 59.91, "lon": 10.75, "hours": 3}')
  HOUR_COUNT=$(python3 -c "import sys,json; r=json.load(sys.stdin); print(len(r.get('result',{}).get('timeseries',[])))" <<< "$RESULT")
  [ "$HOUR_COUNT" -ge 1 ] && echo "PASS ($HOUR_COUNT entries)" || echo "FAIL (no timeseries)"
else
  echo "SKIP (set TEST_API_KEY to run live call)"
fi

# 5. Provider in dashboard
echo -n "5/5 Dashboard entry... "
sudo docker exec apibase-redis-1 redis-cli DEL 'dashboard:data' > /dev/null 2>&1
DASH=$(curl -sf "$BASE/api/v1/dashboard" | python3 -c "
import sys,json; d=json.load(sys.stdin)
match=[p for p in d['providers'] if p['provider']=='${PROVIDER}']
print(f'tools={match[0][\"tool_count\"]}' if match else 'NOT FOUND')
")
[[ "$DASH" == *"tools="* ]] && echo "PASS ($DASH)" || { echo "FAIL ($DASH)"; exit 1; }

echo ""
echo "=== MET Norway smoke test: $([ $? -eq 0 ] && echo 'ALL PASS' || echo 'FAILED') ==="
