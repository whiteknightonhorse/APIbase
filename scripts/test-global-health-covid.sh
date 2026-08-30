#!/usr/bin/env bash
# UC-639 Google "COVID-19 Open Data" smoke test (3 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-639 Google COVID-19 Open Data Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 3 global-health-covid tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools?limit=2000" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('global-health-covid.')))")
[ "$N" = "3" ] && check "3 global-health-covid tools in catalog" PASS || check "expected 3 global-health-covid tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in global-health-covid.location_search global-health-covid.latest_snapshot global-health-covid.location_history; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all global-health-covid tools have schema+desc" PASS || check "one or more global-health-covid tools missing schema or desc" FAIL

# 4. Dashboard registers global-health-covid
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='global-health-covid']; sys.exit(0 if (m and m[0]['tool_count']==3) else 1)" \
  && check "global-health-covid in dashboard with tool_count=3" PASS \
  || check "global-health-covid missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/global-health-covid.' in path))")
[ "$HITS" -ge 3 ] && check "$HITS global-health-covid routes in OpenAPI" PASS || check "expected 3+ global-health-covid routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — index.csv + latest/epidemiology.csv against the live GCS bucket
echo "6/6 Upstream Google COVID-19 Open Data bucket"
CSV_BODY=$(curl -s -m 15 "https://storage.googleapis.com/covid19-open-data/v3/latest/epidemiology.csv")
VALUE=$(printf '%s' "$CSV_BODY" | python3 -c "
import sys
lines = sys.stdin.read().split(chr(10))
line = lines[1] if len(lines) > 1 else ''
cells = line.split(',')
print('1' if len(cells) >= 9 and cells[1] else '0')
")
[ "$VALUE" = "1" ] && check "epidemiology.csv returned plausible row data" PASS || check "epidemiology.csv returned no/implausible value" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" = "0" ] || exit 1
