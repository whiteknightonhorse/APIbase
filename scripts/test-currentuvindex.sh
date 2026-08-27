#!/usr/bin/env bash
# UC-616 Current UV Index smoke test (1 tool)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability
set -euo pipefail

BASE_URL="${BASE_URL:-https://apibase.pro}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-616 Current UV Index Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 1 currentuvindex tool in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('currentuvindex.')))")
[ "$N" = "1" ] && check "1 currentuvindex tool in catalog" PASS || check "expected 1 currentuvindex tool, got $N" FAIL

# 3. Tool detail schema + non-trivial description
echo "3/6 Tool detail schema"
R=$(curl -s "$BASE_URL/api/v1/tools/currentuvindex.uv_index")
OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
[ "$OK" = "1" ] && check "currentuvindex.uv_index schema+desc" PASS || check "currentuvindex.uv_index missing schema or desc" FAIL

# 4. Dashboard registers currentuvindex
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='currentuvindex']; sys.exit(0 if (m and m[0]['tool_count']==1) else 1)" \
  && check "currentuvindex in dashboard with tool_count=1" PASS \
  || check "currentuvindex missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/currentuvindex.' in path))")
[ "$HITS" -ge 1 ] && check "$HITS currentuvindex routes in OpenAPI" PASS || check "expected 1+ currentuvindex routes, got $HITS" FAIL

# 6. Upstream reachability (no auth)
echo "6/6 Upstream Current UV Index endpoint"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 15 "https://currentuvindex.com/api/v1/uvi?latitude=40.6943&longitude=-73.9249")
[ "$CODE" = "200" ] && check "currentuvindex.com/api/v1/uvi HTTP 200" PASS || check "currentuvindex.com/api/v1/uvi HTTP $CODE" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" = "0" ] || exit 1
