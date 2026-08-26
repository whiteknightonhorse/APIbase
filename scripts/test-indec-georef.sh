#!/bin/bash
# Smoke test for INDEC Georef — Argentina Geographic Reference API (UC-603)
# Tests: health, catalog presence, tool details, live upstream API calls

set -e
BASE="https://apibase.pro"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc — $result"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== INDEC Georef Smoke Test ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health ready" "$([ "$STATUS" = "ready" ] && echo ok || echo "$STATUS")"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n=[t for t in d['data'] if t['provider']=='indec-georef']
print(len(n))
" 2>/dev/null)
check "5 indec-georef tools in catalog" "$([ "$COUNT" = "5" ] && echo ok || echo "got $COUNT")"

# 3. Tool detail — schema populated
for TOOL in indec-georef.geocode indec-georef.reverse_geocode indec-georef.provincias indec-georef.departamentos indec-georef.localidades; do
  HAS_SCHEMA=$(curl -s "$BASE/api/v1/tools/$TOOL" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('ok' if t.get('input_schema',{}).get('properties') else 'no_schema')
" 2>/dev/null)
  check "$TOOL schema populated" "$HAS_SCHEMA"
done

# 4. Live upstream API calls (apis.datos.gob.ar/georef, no auth needed)
GEOCODE=$(curl -s "https://apis.datos.gob.ar/georef/api/direcciones?direccion=Av+Corrientes+1000&max=1" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if len(d.get('direcciones',[])) > 0 else 'bad_response')
" 2>/dev/null)
check "INDEC Georef geocode API live" "$GEOCODE"

REVERSE=$(curl -s "https://apis.datos.gob.ar/georef/api/ubicacion?lat=-34.6&lon=-58.45" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('ubicacion',{}).get('provincia') else 'bad_response')
" 2>/dev/null)
check "INDEC Georef reverse geocode API live" "$REVERSE"

PROVINCIAS=$(curl -s "https://apis.datos.gob.ar/georef/api/provincias?max=5" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if len(d.get('provincias',[])) > 0 else 'bad_response')
" 2>/dev/null)
check "INDEC Georef provincias API live" "$PROVINCIAS"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" = "0" ] && echo "ALL PASS" || exit 1
