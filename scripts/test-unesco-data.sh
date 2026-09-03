#!/usr/bin/env bash
# UC-673 UNESCO Institute for Statistics (UIS) Data API smoke test (3 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-673 UNESCO UIS Data API Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 3 unesco-data tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('unesco-data.')))")
[ "$N" = "3" ] && check "3 unesco-data tools in catalog" PASS || check "expected 3 unesco-data tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all 3 tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in unesco-data.indicator_search unesco-data.geounit_list unesco-data.get_data; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all unesco-data tools have schema+desc" PASS || check "one or more unesco-data tools missing schema or desc" FAIL

# 4. Dashboard registers unesco-data
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='unesco-data']; sys.exit(0 if (m and m[0]['tool_count']==3) else 1)" \
  && check "unesco-data in dashboard with tool_count=3" PASS \
  || check "unesco-data missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/unesco-data.' in path))")
[ "$HITS" -ge 3 ] && check "$HITS unesco-data routes in OpenAPI" PASS || check "expected 3+ unesco-data routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — India's youth literacy rate (indicator
# LR.AG15T24, geoUnit IND) for 2020 must be a real ~90-100% figure.
echo "6/6 Upstream UIS Data API"
VALUE=$(curl -s -m 20 "https://api.uis.unesco.org/api/public/data/indicators?indicator=LR.AG15T24&geoUnit=IND&start=2020&end=2020" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['records'][0]['value'])")
python3 -c "import sys; v=float('$VALUE'); sys.exit(0 if 50 < v <= 100 else 1)" \
  && check "India youth literacy rate 2020 = $VALUE%" PASS \
  || check "expected literacy rate 50-100%, got $VALUE" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
