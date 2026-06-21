#!/usr/bin/env bash
# test-overpass.sh — Smoke tests for Overpass API (UC-460)
set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

ok()   { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== Overpass API smoke tests ==="

# 1. Health
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health/ready")
[ "$STATUS" = "200" ] && ok "Health ready" || fail "Health: $STATUS"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
tools=[t for t in d['data'] if t['id'].startswith('overpass.')]
print(len(tools))
")
[ "$COUNT" = "4" ] && ok "4 overpass tools in catalog" || fail "Expected 4, got $COUNT"

# 3. Tool detail endpoints
for TOOL in overpass.amenities overpass.pois_nearby overpass.named_place overpass.public_transport; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
  [ "$HTTP" = "200" ] && ok "Tool detail $TOOL" || fail "$TOOL detail: $HTTP"
done

# 4. Schema populated
PROPS=$(curl -s "$BASE/api/v1/tools/overpass.amenities" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print(len(t.get('input_schema',{}).get('properties',{})))
")
[ "$PROPS" -ge 5 ] && ok "overpass.amenities has schema ($PROPS props)" || fail "Schema missing ($PROPS props)"

# 5. Live API call via MCP (requires TEST_API_KEY)
if [ -n "${TEST_API_KEY:-}" ]; then
  RESULT=$(curl -s -X POST "$BASE/api/v1/tools/overpass.amenities/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"amenity_type":"cafe","lat_min":51.50,"lon_min":-0.13,"lat_max":51.52,"lon_max":-0.10,"limit":3}' \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'count={d.get(\"count\",\"?\")} places={len(d.get(\"places\",[]))}')" 2>/dev/null)
  [ -n "$RESULT" ] && ok "Live amenities call: $RESULT" || fail "Live call failed"

  RESULT2=$(curl -s -X POST "$BASE/api/v1/tools/overpass.pois_nearby/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"lat":48.8566,"lon":2.3522,"radius_m":300,"amenity_type":"cafe","limit":3}' \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'count={d.get(\"count\",\"?\")} places={len(d.get(\"places\",[]))}')" 2>/dev/null)
  [ -n "$RESULT2" ] && ok "Live pois_nearby call: $RESULT2" || fail "Live pois_nearby failed"
else
  echo "  SKIP: Live API calls (set TEST_API_KEY to enable)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
