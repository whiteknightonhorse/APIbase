#!/usr/bin/env bash
# UC-658 Statistics Portugal (INE) JSON Indicator API smoke test (2 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-658 INE Portugal Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 2 ine-portugal tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('ine-portugal.')))")
[ "$N" = "2" ] && check "2 ine-portugal tools in catalog" PASS || check "expected 2 ine-portugal tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (both tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in ine-portugal.indicator_data ine-portugal.indicator_metadata; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all ine-portugal tools have schema+desc" PASS || check "one or more ine-portugal tools missing schema or desc" FAIL

# 4. Dashboard registers ine-portugal
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='ine-portugal']; sys.exit(0 if (m and m[0]['tool_count']==2) else 1)" \
  && check "ine-portugal in dashboard with tool_count=2" PASS \
  || check "ine-portugal missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/ine-portugal.' in path))")
[ "$HITS" -ge 2 ] && check "$HITS ine-portugal routes in OpenAPI" PASS || check "expected 2+ ine-portugal routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — known indicator returns real Portuguese data
echo "6/6 Upstream INE Portugal API (indicator_data varcd=0008273)"
VALUE=$(curl -s -m 20 "https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&varcd=0008273&Dim1=S7A2023&lang=EN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); env=d[0]; print('1' if 'Dados' in env and env.get('IndicadorCod')=='0008273' else '0')")
[ "$VALUE" = "1" ] && check "INE Portugal API returned valid indicator data" PASS || check "INE Portugal API returned no/invalid data" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
