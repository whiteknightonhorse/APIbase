#!/usr/bin/env bash
# UC-396 NOAA SWPC smoke test (4 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability
set -euo pipefail

BASE_URL="${BASE_URL:-https://apibase.pro}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-396 NOAA SWPC Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 4 swpc tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('swpc.')))")
[ "$N" = "4" ] && check "4 swpc tools in catalog" PASS || check "expected 4 swpc tools, got $N" FAIL

# 3. Each tool has a real schema + non-trivial description
echo "3/6 Tool detail schemas"
for t in swpc.k_index swpc.aurora swpc.solar_wind swpc.solar_regions; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$t")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] && check "$t schema+desc" PASS || check "$t missing schema or desc" FAIL
done

# 4. Dashboard registers swpc
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='swpc']; sys.exit(0 if (m and m[0]['tool_count']==4) else 1)" \
  && check "swpc in dashboard with tool_count=4" PASS \
  || check "swpc missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/swpc.' in path))")
[ "$HITS" -ge 4 ] && check "$HITS swpc routes in OpenAPI" PASS || check "expected 4+ swpc routes, got $HITS" FAIL

# 6. Upstream reachability (4 endpoints — no auth)
echo "6/6 Upstream NOAA SWPC endpoints"
for url in \
  "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json" \
  "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json" \
  "https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json" \
  "https://services.swpc.noaa.gov/json/solar_regions.json"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 15 "$url")
  [ "$CODE" = "200" ] && check "$(basename $url) HTTP 200" PASS || check "$(basename $url) HTTP $CODE" FAIL
done

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" = "0" ] || exit 1
