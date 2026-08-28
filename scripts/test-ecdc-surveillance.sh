#!/usr/bin/env bash
# UC-625 ECDC COVID-19 Surveillance smoke test (3 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-625 ECDC COVID-19 Surveillance Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 3 ecdc-surveillance tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('ecdc-surveillance.')))")
[ "$N" = "3" ] && check "3 ecdc-surveillance tools in catalog" PASS || check "expected 3 ecdc-surveillance tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all 3 tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in ecdc-surveillance.cases_deaths ecdc-surveillance.testing_rate ecdc-surveillance.hospital_icu; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all ecdc-surveillance tools have schema+desc" PASS || check "one or more ecdc-surveillance tools missing schema or desc" FAIL

# 4. Dashboard registers ecdc-surveillance
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='ecdc-surveillance']; sys.exit(0 if (m and m[0]['tool_count']==3) else 1)" \
  && check "ecdc-surveillance in dashboard with tool_count=3" PASS \
  || check "ecdc-surveillance missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/ecdc-surveillance.' in path))")
[ "$HITS" -ge 3 ] && check "$HITS ecdc-surveillance routes in OpenAPI" PASS || check "expected 3+ ecdc-surveillance routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — Germany COVID deaths, week 2022-15
echo "6/6 Upstream ECDC opendata (nationalcasedeath)"
DE_DEATHS=$(curl -s -m 15 "https://opendata.ecdc.europa.eu/covid19/nationalcasedeath/json/" | python3 -c "
import sys, json
d = json.load(sys.stdin)
row = next((r for r in d if r.get('country_code')=='DEU' and r['indicator']=='deaths' and r['year_week']=='2022-15'), None)
print(row['weekly_count'] if row else '')
")
[ -n "$DE_DEATHS" ] && check "ECDC nationalcasedeath DEU deaths 2022-15 = ${DE_DEATHS}" PASS || check "ECDC nationalcasedeath returned no DEU 2022-15 value" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" = "0" ] || exit 1
