#!/bin/bash
# Smoke test for Jolpica F1 (UC-585)
set -euo pipefail

BASE="https://apibase.pro"
PROVIDER="f1"
TOOLS=4
PASS=0; FAIL=0

ok()   { echo "  PASS $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL $1: $2"; FAIL=$((FAIL+1)); }

echo "=== Jolpica F1 Smoke Test (UC-585) ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && ok "health" || fail "health" "$STATUS"

# 2. F1 tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
f1=[t for t in d['data'] if t['id'].startswith('f1.')]
print(len(f1))
")
[ "$COUNT" -eq $TOOLS ] && ok "catalog ($COUNT/$TOOLS f1 tools)" || fail "catalog" "expected $TOOLS, got $COUNT"

# 3. Tool detail endpoints
for TOOL in f1.races.schedule f1.races.results f1.standings.drivers f1.standings.constructors; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
  [ "$HTTP" = "200" ] && ok "detail $TOOL" || fail "detail $TOOL" "HTTP $HTTP"
done

# 4. Live API endpoints (no auth required upstream)
echo "  --- Live upstream checks ---"
SCHEDULE=$(curl -s "https://api.jolpi.ca/ergast/f1/current.json?limit=1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['MRData']['RaceTable']['season'])")
[ -n "$SCHEDULE" ] && ok "upstream schedule (season=$SCHEDULE)" || fail "upstream schedule" "empty"

DRIVERS=$(curl -s "https://api.jolpi.ca/ergast/f1/current/driverstandings.json?limit=1" | python3 -c "import sys,json; d=json.load(sys.stdin); stl=d['MRData']['StandingsTable']['StandingsLists'][0]; print(stl['DriverStandings'][0]['Driver']['familyName'])")
[ -n "$DRIVERS" ] && ok "upstream driver standings (leader=$DRIVERS)" || fail "upstream driver standings" "empty"

CONSTRUCTORS=$(curl -s "https://api.jolpi.ca/ergast/f1/current/constructorstandings.json?limit=1" | python3 -c "import sys,json; d=json.load(sys.stdin); stl=d['MRData']['StandingsTable']['StandingsLists'][0]; print(stl['ConstructorStandings'][0]['Constructor']['name'])")
[ -n "$CONSTRUCTORS" ] && ok "upstream constructor standings (leader=$CONSTRUCTORS)" || fail "upstream constructor standings" "empty"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] && exit 0 || exit 1
