#!/usr/bin/env bash
# UC-628 Copernicus Data Space Ecosystem (Sentinel satellite imagery) smoke test (3 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-628 Copernicus Data Space Ecosystem Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 3 copernicus-sentinel tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('copernicus-sentinel.')))")
[ "$N" = "3" ] && check "3 copernicus-sentinel tools in catalog" PASS || check "expected 3 copernicus-sentinel tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all 3 tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in copernicus-sentinel.search_scenes copernicus-sentinel.scene_detail copernicus-sentinel.list_collections; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all copernicus-sentinel tools have schema+desc" PASS || check "one or more copernicus-sentinel tools missing schema or desc" FAIL

# 4. Dashboard registers copernicus-sentinel
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='copernicus-sentinel']; sys.exit(0 if (m and m[0]['tool_count']==3) else 1)" \
  && check "copernicus-sentinel in dashboard with tool_count=3" PASS \
  || check "copernicus-sentinel missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/copernicus-sentinel.' in path))")
[ "$HITS" -ge 3 ] && check "$HITS copernicus-sentinel routes in OpenAPI" PASS || check "expected 3+ copernicus-sentinel routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — search Sentinel-2 scenes over London
echo "6/6 Upstream CDSE STAC catalog (search)"
N_FEATURES=$(curl -s -m 15 -X POST "https://catalogue.dataspace.copernicus.eu/stac/search" \
  -H "Content-Type: application/json" \
  -d '{"collections":["sentinel-2-l2a"],"bbox":[-0.5,51.3,0.3,51.7],"datetime":"2026-01-01T00:00:00Z/2026-08-29T00:00:00Z","limit":1}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('features',[])))")
[ "$N_FEATURES" = "1" ] && check "CDSE STAC search returned $N_FEATURES scene over London" PASS || check "CDSE STAC search returned no scenes" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" = "0" ] || exit 1
