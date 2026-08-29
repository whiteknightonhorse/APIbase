#!/usr/bin/env bash
# UC-630 World Bank Climate Change Knowledge Portal (CCKP) smoke test (3 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-630 World Bank CCKP Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 3 world-bank-cckp tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('world-bank-cckp.')))")
[ "$N" = "3" ] && check "3 world-bank-cckp tools in catalog" PASS || check "expected 3 world-bank-cckp tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all 3 tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in world-bank-cckp.climate_normal world-bank-cckp.climate_projection world-bank-cckp.extreme_indices; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all world-bank-cckp tools have schema+desc" PASS || check "one or more world-bank-cckp tools missing schema or desc" FAIL

# 4. Dashboard registers world-bank-cckp
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='world-bank-cckp']; sys.exit(0 if (m and m[0]['tool_count']==3) else 1)" \
  && check "world-bank-cckp in dashboard with tool_count=3" PASS \
  || check "world-bank-cckp missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/world-bank-cckp.' in path))")
[ "$HITS" -ge 3 ] && check "$HITS world-bank-cckp routes in OpenAPI" PASS || check "expected 3+ world-bank-cckp routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — historical mean temperature for Brazil
echo "6/6 Upstream CCKP API (climate normal)"
VALUE=$(curl -s -m 15 "https://cckpapi.worldbank.org/cckp/v1/cmip6-x0.25_climatology_tas_climatology_annual_1995-2014_median_historical_ensemble_all_mean/BRA?_format=json" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); v=list(d['data']['BRA'].values())[0]; print('1' if 0 < v < 40 else '0')")
[ "$VALUE" = "1" ] && check "CCKP API returned plausible BRA mean temperature" PASS || check "CCKP API returned no/implausible value" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" = "0" ] || exit 1
