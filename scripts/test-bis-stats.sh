#!/usr/bin/env bash
# UC-682 BIS Statistics (Bank for International Settlements) smoke test (3 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-682 BIS Statistics Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 3 bis-stats tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('bis-stats.')))")
[ "$N" = "3" ] && check "3 bis-stats tools in catalog" PASS || check "expected 3 bis-stats tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all 3 tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in bis-stats.policy_rates bis-stats.exchange_rates bis-stats.property_prices; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all bis-stats tools have schema+desc" PASS || check "one or more bis-stats tools missing schema or desc" FAIL

# 4. Dashboard registers bis-stats
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='bis-stats']; sys.exit(0 if (m and m[0]['tool_count']==3) else 1)" \
  && check "bis-stats in dashboard with tool_count=3" PASS \
  || check "bis-stats missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/bis-stats.' in path))")
[ "$HITS" -ge 3 ] && check "$HITS bis-stats routes in OpenAPI" PASS || check "expected 3+ bis-stats routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — US central bank policy rate
echo "6/6 Upstream BIS Statistics API"
OK=$(curl -s -m 20 "https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/M.US?lastNObservations=1" -H "Accept: application/vnd.sdmx.data+json;version=1.0.0" | python3 -c "
import sys,json
d=json.load(sys.stdin)
ds=d.get('data',{}).get('dataSets',[])
print('1' if ds and ds[0].get('series') else '0')
" 2>/dev/null || echo "0")
[ "$OK" = "1" ] && check "policy rate query returned a valid series" PASS || check "policy rate query did not return a valid series" FAIL

echo
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
