#!/usr/bin/env bash
# UC-623 GEBCO smoke test (2 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-623 GEBCO Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 2 gebco tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('gebco.')))")
[ "$N" = "2" ] && check "2 gebco tools in catalog" PASS || check "expected 2 gebco tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (both tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in gebco.elevation_point gebco.elevation_profile; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all gebco tools have schema+desc" PASS || check "one or more gebco tools missing schema or desc" FAIL

# 4. Dashboard registers gebco
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='gebco']; sys.exit(0 if (m and m[0]['tool_count']==2) else 1)" \
  && check "gebco in dashboard with tool_count=2" PASS \
  || check "gebco missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/gebco.' in path))")
[ "$HITS" -ge 2 ] && check "$HITS gebco routes in OpenAPI" PASS || check "expected 2+ gebco routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — Mariana Trench point, expect a large negative depth
echo "6/6 Upstream GEBCO WMS GetFeatureInfo (Mariana Trench)"
BODY=$(curl -s -m 15 "https://wms.gebco.net/mapserv?service=WMS&version=1.1.1&request=GetFeatureInfo&layers=GEBCO_LATEST_2&query_layers=GEBCO_LATEST_2&srs=EPSG:4326&bbox=141,11,142,12&width=100&height=100&x=50&y=50&info_format=text/plain&feature_count=1")
echo "$BODY" | grep -qE "value_list = '-[0-9]{3,}'" && check "wms.gebco.net returned a plausible ocean-depth value_list" PASS || check "wms.gebco.net did not return a plausible depth value" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" = "0" ] || exit 1
