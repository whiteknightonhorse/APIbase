#!/usr/bin/env bash
# UC-648 HDX Humanitarian API (HAPI) v2 smoke test (4 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-648 HDX Humanitarian API (HAPI) Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 4 hdx-hapi tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools?limit=2000" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('hdx-hapi.')))")
[ "$N" = "4" ] && check "4 hdx-hapi tools in catalog" PASS || check "expected 4 hdx-hapi tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in hdx-hapi.operational_presence hdx-hapi.humanitarian_needs hdx-hapi.baseline_population hdx-hapi.food_security; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all hdx-hapi tools have schema+desc" PASS || check "one or more hdx-hapi tools missing schema or desc" FAIL

# 4. Dashboard registers hdx-hapi
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='hdx-hapi']; sys.exit(0 if (m and m[0]['tool_count']==4) else 1)" \
  && check "hdx-hapi in dashboard with tool_count=4" PASS \
  || check "hdx-hapi missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/hdx-hapi.' in path))")
[ "$HITS" -ge 4 ] && check "$HITS hdx-hapi routes in OpenAPI" PASS || check "expected 4+ hdx-hapi routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth, self-declared app_identifier) — real
# operational-presence lookup for Mali against the live HDX HAPI API. HAPI Terms of Service
# ask callers to self-throttle to ~1 req/sec, so this script makes only ONE upstream call.
echo "6/6 Upstream HDX HAPI API"
APP_ID="QVBJYmFzZTpjb250YWN0QGFwaWJhc2UucHJv"
VALUE=$(curl -s -m 15 "https://hapi.humdata.org/api/v2/coordination-context/operational-presence?location_code=MLI&output_format=json&limit=1&app_identifier=$APP_ID" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('data',[]); print('1' if r and r[0].get('location_code')=='MLI' else '0')")
[ "$VALUE" = "1" ] && check "HDX HAPI operational-presence lookup returned plausible data (Mali)" PASS || check "HDX HAPI operational-presence lookup returned no/implausible value" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" = "0" ] || exit 1
