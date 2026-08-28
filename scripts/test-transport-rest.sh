#!/usr/bin/env bash
# UC-626 transport.rest (Berlin/Brandenburg transit) smoke test (4 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-626 transport.rest Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 4 transport-rest tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('transport-rest.')))")
[ "$N" = "4" ] && check "4 transport-rest tools in catalog" PASS || check "expected 4 transport-rest tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all 4 tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in transport-rest.location_search transport-rest.nearby_stops transport-rest.stop_departures transport-rest.journey_search; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all transport-rest tools have schema+desc" PASS || check "one or more transport-rest tools missing schema or desc" FAIL

# 4. Dashboard registers transport-rest
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='transport-rest']; sys.exit(0 if (m and m[0]['tool_count']==4) else 1)" \
  && check "transport-rest in dashboard with tool_count=4" PASS \
  || check "transport-rest missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/transport-rest.' in path))")
[ "$HITS" -ge 4 ] && check "$HITS transport-rest routes in OpenAPI" PASS || check "expected 4+ transport-rest routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — location search for Alexanderplatz
echo "6/6 Upstream v6.bvg.transport.rest"
STOP_NAME=$(curl -s -4 -m 15 "https://v6.bvg.transport.rest/locations?query=Alexanderplatz&results=1" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d[0]['name'] if d else '')
")
[ -n "$STOP_NAME" ] && check "v6.bvg.transport.rest locations search returned: ${STOP_NAME}" PASS || check "v6.bvg.transport.rest locations search returned no result" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS/$((PASS+FAIL))"
if [ "$FAIL" -gt 0 ]; then
  red "=== SOME TESTS FAILED ==="
  exit 1
else
  green "=== All UC-626 tests passed ==="
fi
