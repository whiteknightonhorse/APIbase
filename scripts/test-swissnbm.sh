#!/usr/bin/env bash
# Smoke test for Swiss National Bank (SNB) adapter (UC-541)
set -e

BASE="https://apibase.pro"
SMOKE_KEY="${SMOKE_TEST_KEY:-$(grep SMOKE_TEST_KEY /home/apibase/apibase/.env 2>/dev/null | cut -d= -f2-)}"

echo "=== SNB Smoke Test (UC-541) ==="
echo ""

# 1. Health check
echo "1/5 Health check..."
HEALTH=$(curl -sf "$BASE/health/ready" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['status'])")
[ "$HEALTH" = "ready" ] && echo "   PASS (status=ready)" || { echo "   FAIL: $HEALTH"; exit 1; }

# 2. SNB tools in catalog
echo "2/5 SNB tools in catalog..."
COUNT=$(curl -sf "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
snb=[t for t in d['data'] if t['id'].startswith('swissnbm')]
print(len(snb))
")
[ "$COUNT" -eq 4 ] && echo "   PASS ($COUNT/4 SNB tools)" || { echo "   FAIL: expected 4 tools, got $COUNT"; exit 1; }

# 3. Tool detail with schema
echo "3/5 Tool detail with schema..."
for tool in swissnbm.fx_rates swissnbm.policy_rate swissnbm.saron_rates swissnbm.monetary_aggregates; do
  SCHEMA=$(curl -sf "$BASE/api/v1/tools/$tool" | python3 -c "
import sys,json; d=json.load(sys.stdin)
has_schema=bool(d.get('input_schema',{}).get('properties'))
print('ok' if has_schema else 'missing')
")
  [ "$SCHEMA" = "ok" ] && echo "   PASS $tool (schema present)" || { echo "   FAIL $tool: schema missing"; exit 1; }
done

# 4. Payment enforcement (402 expected)
echo "4/5 Payment enforcement (402 expected)..."
STATUS=$(curl -so /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/tools/swissnbm.fx_rates/call" \
  -H "Authorization: Bearer $SMOKE_KEY" -H "Content-Type: application/json" -d '{"limit":2}')
[ "$STATUS" = "402" ] && echo "   PASS (402 payment required)" || { echo "   FAIL: expected 402, got $STATUS"; exit 1; }

# 5. Upstream SNB API live
echo "5/5 Upstream SNB API live..."
SNB_STATUS=$(curl -so /dev/null -w "%{http_code}" "https://data.snb.ch/api/cube/snbgwdzid/data/json/en")
[ "$SNB_STATUS" = "200" ] && echo "   PASS (SNB API responding)" || { echo "   FAIL: SNB API returned $SNB_STATUS"; exit 1; }

echo ""
echo "=== SNB Smoke Test PASSED (5/5) ==="
