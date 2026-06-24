#!/usr/bin/env bash
# Smoke test for GeoNames adapter (UC-512)
set -uo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local desc="$1"; local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc — $result"; FAIL=$((FAIL+1))
  fi
}

echo "=== GeoNames Smoke Test (UC-512) ==="
echo "Target: $BASE"

# 1. Health
R=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('status')=='ready' else 'not ready')")
check "Health check" "$R"

# 2. Tools in catalog (4 expected)
R=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
ids = [t['id'] for t in d['data'] if t['id'].startswith('geonames.')]
print('ok' if len(ids)==4 else f'expected 4, got {len(ids)}: {ids}')
")
check "GeoNames tools in catalog (4)" "$R"

# 3. Tool detail endpoints
for TOOL in geonames.place.search geonames.postal.lookup geonames.country.info geonames.place.timezone; do
  R=$(curl -s "$BASE/api/v1/tools/$TOOL" | python3 -c "
import sys,json; t=json.load(sys.stdin)
ok = bool(t.get('id')) and bool(t.get('input_schema',{}).get('properties'))
print('ok' if ok else f'missing schema: {list(t.keys())}')
")
  check "Tool detail: $TOOL" "$R"
done

# 4. Live API test (direct, bypassing auth)
echo "  INFO: Direct GeoNames API test (no auth needed)"
R=$(curl -s "https://secure.geonames.org/searchJSON?q=Berlin&maxRows=2&username=APIbase" | python3 -c "
import sys,json; d=json.load(sys.stdin)
ok = len(d.get('geonames',[])) > 0
print('ok' if ok else f'no results: {d}')
")
check "GeoNames upstream: place search (Berlin)" "$R"

R=$(curl -s "https://secure.geonames.org/postalCodeSearchJSON?postalcode=10115&country=DE&username=APIbase" | python3 -c "
import sys,json; d=json.load(sys.stdin)
ok = len(d.get('postalCodes',[])) > 0
print('ok' if ok else f'no results: {d}')
")
check "GeoNames upstream: postal lookup (10115 DE)" "$R"

R=$(curl -s "https://secure.geonames.org/countryInfoJSON?country=DE&username=APIbase" | python3 -c "
import sys,json; d=json.load(sys.stdin)
ok = len(d.get('geonames',[])) > 0
print('ok' if ok else f'no results: {d}')
")
check "GeoNames upstream: country info (Germany)" "$R"

R=$(curl -s "https://secure.geonames.org/timezoneJSON?lat=52.52&lng=13.40&username=APIbase" | python3 -c "
import sys,json; d=json.load(sys.stdin)
ok = bool(d.get('timezoneId'))
print('ok' if ok else f'missing tz: {d}')
")
check "GeoNames upstream: timezone (Berlin coords)" "$R"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && echo "ALL PASS" || exit 1
