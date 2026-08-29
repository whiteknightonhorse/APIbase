#!/usr/bin/env bash
# UC-633 Bank of England IADB smoke test (4 tools)
# Verifies: catalog presence, schema+desc, dashboard, OpenAPI, upstream reachability + value sanity
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8880}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "PASS" ]; then green "  PASS  $1"; PASS=$((PASS+1)); else red "  FAIL  $1"; FAIL=$((FAIL+1)); fi; }

echo "=== UC-633 Bank of England IADB Smoke Test ==="
echo "Target: $BASE_URL"
echo

# 1. Health
echo "1/6 Health"
curl -s "$BASE_URL/health/ready" | grep -q '"status":"ready"' && check "health/ready" PASS || check "health/ready" FAIL

# 2. 4 bank-of-england tools in catalog
echo "2/6 Catalog"
N=$(curl -s "$BASE_URL/api/v1/tools?limit=2000" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for t in d['data'] if t['id'].startswith('bank-of-england.')))")
[ "$N" = "4" ] && check "4 bank-of-england tools in catalog" PASS || check "expected 4 bank-of-england tools, got $N" FAIL

# 3. Tool detail schema + non-trivial description (all 4 tools)
echo "3/6 Tool detail schema"
ALL_OK=1
for tool in bank-of-england.bank_rate bank-of-england.sonia_rate bank-of-england.money_supply_m4 bank-of-england.mortgage_rate_2y_fixed; do
  R=$(curl -s "$BASE_URL/api/v1/tools/$tool")
  OK=$(echo "$R" | python3 -c "import sys,json; t=json.load(sys.stdin); print('1' if t.get('input_schema',{}).get('properties') and t.get('description','')!=t.get('name','') else '0')" 2>/dev/null || echo "0")
  [ "$OK" = "1" ] || ALL_OK=0
done
[ "$ALL_OK" = "1" ] && check "all bank-of-england tools have schema+desc" PASS || check "one or more bank-of-england tools missing schema or desc" FAIL

# 4. Dashboard registers bank-of-england
echo "4/6 Dashboard provider entry"
R=$(curl -s "$BASE_URL/api/v1/dashboard")
echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='bank-of-england']; sys.exit(0 if (m and m[0]['tool_count']==4) else 1)" \
  && check "bank-of-england in dashboard with tool_count=4" PASS \
  || check "bank-of-england missing from dashboard" FAIL

# 5. OpenAPI MPP discovery
echo "5/6 OpenAPI MPP discovery"
HITS=$(curl -s "$BASE_URL/.well-known/openapi.json" | python3 -c "import sys,json; s=json.load(sys.stdin); print(sum(1 for path in s.get('paths',{}) if '/bank-of-england.' in path))")
[ "$HITS" -ge 4 ] && check "$HITS bank-of-england routes in OpenAPI" PASS || check "expected 4+ bank-of-england routes, got $HITS" FAIL

# 6. Upstream reachability + value sanity (no auth) — Official Bank Rate, last few days
echo "6/6 Upstream Bank of England IADB"
VALUE=$(curl -s -m 15 "https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/2026&Dateto=now&SeriesCodes=IUDBEDR&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N" \
  -H "User-Agent: APIbase/1.0 (https://apibase.pro)" \
  | python3 -c "
import sys
lines = [l for l in sys.stdin.read().strip().split(chr(10)) if l]
ok = len(lines) > 1 and lines[0].startswith('DATE,IUDBEDR')
if ok:
    last = lines[-1].split(',')
    try:
        float(last[1])
    except (IndexError, ValueError):
        ok = False
print('1' if ok else '0')
")
[ "$VALUE" = "1" ] && check "Bank of England IADB returned plausible Bank Rate data" PASS || check "Bank of England IADB returned no/implausible value" FAIL

echo
echo "=== Results ==="
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" = "0" ] || exit 1
