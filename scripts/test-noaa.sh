#!/usr/bin/env bash
# Smoke test for UC-324: NOAA NWS Weather (3 tools)
set -uo pipefail
BASE="https://apibase.pro"
PASS=0
FAIL=0

pass() { echo "  PASS  $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL  $1"; FAIL=$((FAIL + 1)); }

echo "=== NOAA NWS Weather Smoke Test ==="

# 1. Health
if curl -sf "$BASE/health/ready" >/dev/null 2>&1; then pass "Health ready"; else fail "Health ready"; fi

# 2. Tools in catalog
NOAA_COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "import sys,json; print(sum(1 for t in json.load(sys.stdin)['data'] if t['id'].startswith('noaa.')))")
if [ "$NOAA_COUNT" -eq 3 ]; then pass "3 NOAA tools in catalog ($NOAA_COUNT)"; else fail "3 NOAA tools in catalog ($NOAA_COUNT)"; fi

# 3. Tool detail endpoints
for TOOL in noaa.forecast noaa.hourly noaa.observation; do
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/tools/$TOOL")
  if [ "$STATUS" = "200" ]; then pass "Tool detail $TOOL"; else fail "Tool detail $TOOL ($STATUS)"; fi
done

# 4. Upstream API test (Chicago, IL)
UPSTREAM=$(curl -s -H "User-Agent: (apibase.pro, support@apibase.pro)" \
  "https://api.weather.gov/points/41.8781,-87.6298" | python3 -c "import sys,json; print(json.load(sys.stdin)['properties']['relativeLocation']['properties']['city'])" 2>/dev/null)
if [ "$UPSTREAM" = "Chicago" ]; then pass "Upstream /points → $UPSTREAM"; else fail "Upstream /points → $UPSTREAM"; fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -eq 0 ]; then echo "=== All tests passed ==="; else exit 1; fi
