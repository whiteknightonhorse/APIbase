#!/usr/bin/env bash
# UC-671 e-Stat Japan Dashboard (dashboard.e-stat.go.jp) smoke test (3 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-671 e-Stat Japan Dashboard Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 3 estat-japan-dashboard tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('estat-japan-dashboard.')))")
[ "$N" = "3" ] && check "3 estat-japan-dashboard tools in catalog" PASS || check "expected 3 estat-japan-dashboard tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all 3 tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in estat-japan-dashboard.indicator_info estat-japan-dashboard.region_info estat-japan-dashboard.get_data; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all estat-japan-dashboard tools have schema+desc" PASS || check "one or more estat-japan-dashboard tools missing schema or desc" FAIL

# 4. Dashboard registers estat-japan-dashboard
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='estat-japan-dashboard']; sys.exit(0 if (m and m[0]['tool_count']==3) else 1)" \
  && check "estat-japan-dashboard in dashboard with tool_count=3" PASS \
  || check "estat-japan-dashboard missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/estat-japan-dashboard.' in path))")
[ "$HITS" -ge 3 ] && check "$HITS estat-japan-dashboard routes in OpenAPI" PASS || check "expected 3+ estat-japan-dashboard routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — Japan's total population (indicator
# 0201010000000010000, region 00000) for 2022 must be a real ~100M+ figure.
echo "6/6 Upstream e-Stat Dashboard getData"
VALUE=$(curl -s -m 20 "https://dashboard.e-stat.go.jp/api/1.0/Json/getData?Lang=EN&IndicatorCode=0201010000000010000&RegionCode=00000&TimeFrom=2022CY00&TimeTo=2022CY00" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['GET_STATS']['STATISTICAL_DATA']['DATA_INF']['DATA_OBJ'][0]['VALUE']['\$'])")
[ "$VALUE" -gt 100000000 ] 2>/dev/null && check "Japan total population 2022 = $VALUE" PASS || check "expected Japan population > 100,000,000, got $VALUE" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
