#!/usr/bin/env bash
# Smoke test for Brreg (UC-501) — Norway Business Registry
set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local desc="$1"; local result="$2"
  if [ "$result" = "OK" ]; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc — $result"; FAIL=$((FAIL+1))
  fi
}

echo "=== Brreg smoke test (UC-501) ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print('OK' if json.load(sys.stdin).get('status')=='ready' else 'FAIL')")
check "Health check" "$STATUS"

# 2. Brreg tools in catalog (expect 4)
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n = sum(1 for t in d['data'] if t['id'].startswith('brreg.'))
print('OK' if n==4 else f'EXPECTED 4, GOT {n}')
")
check "Brreg tools in catalog (4)" "$COUNT"

# 3. Tool detail endpoints
for TOOL in brreg.search brreg.entity brreg.sub_units brreg.roles; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
  check "Tool detail $TOOL" "$([ "$CODE" = "200" ] && echo OK || echo "HTTP $CODE")"
done

# 4. Live search via Brreg API directly
RESULT=$(curl -s "https://data.brreg.no/enhetsregisteret/api/enheter?navn=DNB&size=2" | python3 -c "
import sys,json; d=json.load(sys.stdin)
items = d.get('_embedded',{}).get('enheter',[])
print('OK' if len(items)>0 else 'FAIL: no results')
")
check "Live Brreg search (DNB)" "$RESULT"

# 5. Entity detail
RESULT=$(curl -s "https://data.brreg.no/enhetsregisteret/api/enheter/923609016" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('OK' if d.get('navn')=='EQUINOR ASA' else f'FAIL: unexpected {d.get(\"navn\")}')
")
check "Live entity detail (Equinor)" "$RESULT"

echo ""
echo "=== Results: Passed $PASS, Failed $FAIL ==="
[ "$FAIL" -eq 0 ] && echo "=== All tests passed ===" || exit 1
