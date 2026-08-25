#!/bin/bash
# Smoke test for INE — Instituto Nacional de Estadística, Spain (UC-596)
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

echo "=== INE Smoke Test ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health ready" "$([ "$STATUS" = "ready" ] && echo ok || echo "$STATUS")"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n=[t for t in d['data'] if t['provider']=='ine']
print(len(n))
" 2>/dev/null)
check "4 ine tools in catalog" "$([ "$COUNT" = "4" ] && echo ok || echo "got $COUNT")"

# 3. Tool detail — schema populated
for TOOL in ine.operations ine.tables ine.series_metadata ine.series_data; do
  HAS_SCHEMA=$(curl -s "$BASE/api/v1/tools/$TOOL" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('ok' if t.get('input_schema',{}).get('properties') else 'no_schema')
" 2>/dev/null)
  check "$TOOL schema populated" "$HAS_SCHEMA"
done

# 4. Live upstream API calls (INE wstempus, no auth needed)
OPERATIONS=$(curl -s "https://servicios.ine.es/wstempus/js/ES/OPERACIONES_DISPONIBLES" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if isinstance(d, list) and len(d) > 0 else 'bad_response')
" 2>/dev/null)
check "INE operations list API live" "$OPERATIONS"

TABLES=$(curl -s "https://servicios.ine.es/wstempus/js/ES/TABLAS_OPERACION/IPC?tip=A" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if isinstance(d, list) and len(d) > 0 else 'bad_response')
" 2>/dev/null)
check "INE tables API live (IPC operation)" "$TABLES"

SERIES_META=$(curl -s "https://servicios.ine.es/wstempus/js/ES/SERIE/IPC206449?det=2&tip=A" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('COD') else 'bad_response')
" 2>/dev/null)
check "INE series metadata API live" "$SERIES_META"

SERIES_DATA=$(curl -s "https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/IPC251852?tip=AM&nult=3" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('Data') and len(d['Data']) > 0 else 'bad_response')
" 2>/dev/null)
check "INE series data API live (national CPI index)" "$SERIES_DATA"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" = "0" ] && echo "ALL PASS" || exit 1
