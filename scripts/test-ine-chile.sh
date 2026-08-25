#!/bin/bash
# Smoke test for INE Chile SIMEL — Instituto Nacional de Estadísticas, Chile (UC-602)
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

echo "=== INE Chile SIMEL Smoke Test ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health ready" "$([ "$STATUS" = "ready" ] && echo ok || echo "$STATUS")"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n=[t for t in d['data'] if t['provider']=='ine-chile']
print(len(n))
" 2>/dev/null)
check "3 ine-chile tools in catalog" "$([ "$COUNT" = "3" ] && echo ok || echo "got $COUNT")"

# 3. Tool detail — schema populated
for TOOL in ine-chile.dataflows ine-chile.structure ine-chile.data; do
  HAS_SCHEMA=$(curl -s "$BASE/api/v1/tools/$TOOL" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('ok' if t.get('input_schema',{}).get('properties') else 'no_schema')
" 2>/dev/null)
  check "$TOOL schema populated" "$HAS_SCHEMA"
done

# 4. Live upstream SDMX API calls (sdmx.ine.gob.cl, no auth needed)
# NOTE: Accept-Language must be set explicitly — the NSI Web Service backend
# 500s on undici's default `Accept-Language: *` (see src/adapters/ine-chile/index.ts).
DATAFLOWS=$(curl -s -H "Accept: application/vnd.sdmx.structure+json;version=1.0" -H "Accept-Language: es" \
  "https://sdmx.ine.gob.cl/rest/dataflow/CL01/all/latest" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if len(d.get('data',{}).get('dataflows',[])) > 0 else 'bad_response')
" 2>/dev/null)
check "INE Chile dataflow list API live" "$DATAFLOWS"

STRUCTURE=$(curl -s -H "Accept: application/vnd.sdmx.structure+json;version=1.0" -H "Accept-Language: es" \
  "https://sdmx.ine.gob.cl/rest/dataflow/CL01/DF_NOCU_SEXO/1.0?references=all" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if d.get('data',{}).get('dataStructures') else 'bad_response')
" 2>/dev/null)
check "INE Chile dataflow structure API live (DF_NOCU_SEXO)" "$STRUCTURE"

DATA=$(curl -s -H "Accept: application/vnd.sdmx.data+json;version=1.0" -H "Accept-Language: es" \
  "https://sdmx.ine.gob.cl/rest/data/CL01,DF_NOCU_SEXO,1.0/all?lastNObservations=3" | python3 -c "
import sys,json; d=json.load(sys.stdin)
series = d.get('data',{}).get('dataSets',[{}])[0].get('series',{})
print('ok' if len(series) > 0 else 'bad_response')
" 2>/dev/null)
check "INE Chile data API live (employed persons by sex)" "$DATA"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" = "0" ] && echo "ALL PASS" || exit 1
