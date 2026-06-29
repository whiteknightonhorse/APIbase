#!/usr/bin/env bash
# Smoke test for OpenTopography adapter (UC-537)
set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

ok()  { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail(){ echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== OpenTopography (UC-537) Smoke Tests ==="

# 1. Health check
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))")
[ "$STATUS" = "ready" ] && ok "Health check" || fail "Health check: $STATUS"

# 2. All 4 tools appear in catalog
TOOLS=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json
d=json.load(sys.stdin)
ids=[t['id'] for t in d['data'] if t['id'].startswith('opentopo.')]
print(len(ids))
")
[ "$TOOLS" -eq 4 ] && ok "4 opentopo tools in catalog" || fail "Expected 4 tools, got $TOOLS"

# 3. Tool detail with input_schema
for TOOL in "opentopo.elevation_point" "opentopo.elevation_area" "opentopo.lidar_catalog" "opentopo.dem_catalog"; do
  RESULT=$(curl -s "$BASE/api/v1/tools/$TOOL" | python3 -c "
import sys,json
t=json.load(sys.stdin)
has_schema=bool(t.get('input_schema',{}).get('properties'))
has_desc=t.get('description','')!=t.get('name','')
print('OK' if has_schema and has_desc else 'FAIL')
")
  [ "$RESULT" = "OK" ] && ok "$TOOL schema+desc" || fail "$TOOL schema or desc missing"
done

# 4. Provider in dashboard
DASH=$(curl -s "$BASE/api/v1/dashboard" | python3 -c "
import sys,json
d=json.load(sys.stdin)
m=[p for p in d['providers'] if p['provider']=='opentopography']
print(m[0]['tool_count'] if m else 0)
")
[ "$DASH" -eq 4 ] && ok "opentopography in dashboard (4 tools)" || fail "Dashboard: expected 4, got $DASH"

# 5. Live catalog call (uses demo key via adapter)
if [ -n "${TEST_API_KEY:-}" ]; then
  echo "  [live test with TEST_API_KEY]"
  LIDAR=$(curl -s -X POST "$BASE/api/v1/tools/opentopo.lidar_catalog/call" \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"min_lon":-122,"min_lat":37,"max_lon":-121,"max_lat":38}' | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('count','?'))")
  echo "  LiDAR datasets found: $LIDAR"
  [ "$LIDAR" != "?" ] && ok "LiDAR catalog live call" || fail "LiDAR catalog call failed"
else
  echo "  [skip live call — set TEST_API_KEY to test]"
fi

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
