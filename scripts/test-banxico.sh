#!/usr/bin/env bash
# Smoke test for Banco de México SIE (UC-544)
set -euo pipefail

BASE="${1:-https://apibase.pro}"
PASS=0; FAIL=0

check() {
  local desc="$1"; local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS: $desc"; PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc — $result"; FAIL=$((FAIL + 1))
  fi
}

echo "=== Banxico SIE smoke test ($BASE) ==="

# 1. Health
STATUS=$(curl -sf "$BASE/health/ready" | python3 -c "import sys,json; print('ok' if json.load(sys.stdin).get('status')=='ready' else 'fail')" 2>/dev/null || echo "fail")
check "Health ready" "$STATUS"

# 2. Banxico tools in catalog
COUNT=$(curl -sf "$BASE/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len([t for t in d['data'] if t['id'].startswith('banxico')]))" 2>/dev/null || echo "0")
[ "$COUNT" -ge 5 ] && check "5 banxico tools in catalog" "ok" || check "5 banxico tools in catalog" "got $COUNT"

# 3. Tool detail — schema populated
for tool in banxico.fix_rate banxico.fx_rates banxico.target_rate banxico.tiie_rate banxico.cpi; do
  SCHEMA=$(curl -sf "$BASE/api/v1/tools/$tool" | python3 -c "import sys,json; t=json.load(sys.stdin); print('ok' if t.get('input_schema',{}).get('properties') else 'no-schema')" 2>/dev/null || echo "fail")
  check "Tool detail $tool has schema" "$SCHEMA"
done

# 4. Live API call via upstream (direct key test)
if [ -f .env ]; then
  KEY=$(grep PROVIDER_KEY_BANXICO .env | cut -d= -f2- 2>/dev/null || echo "")
  if [ -n "$KEY" ]; then
    RATE=$(curl -sf "https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/oportuno" \
      -H "Bmx-Token: $KEY" | python3 -c "import sys,json; d=json.load(sys.stdin); v=d['bmx']['series'][0]['datos'][0]['dato']; print('ok' if float(v)>0 else 'zero')" 2>/dev/null || echo "fail")
    check "Live USD/MXN FIX rate from Banxico API" "$RATE"
  else
    echo "  SKIP: PROVIDER_KEY_BANXICO not set"
  fi
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
