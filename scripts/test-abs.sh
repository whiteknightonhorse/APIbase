#!/usr/bin/env bash
# Smoke test for ABS (Australian Bureau of Statistics) adapter — UC-532

set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local label="$1"; local url="$2"; local expected="$3"
  local actual
  actual=$(curl -sf "$url" | python3 -c "import sys,json; print(json.load(sys.stdin)$expected)" 2>&1)
  if [ "$actual" = "True" ] || [ -n "$actual" ] && [ "$actual" != "False" ] && [ "$actual" != "None" ]; then
    echo "  PASS: $label"
    PASS=$((PASS+1))
  else
    echo "  FAIL: $label (got: $actual)"
    FAIL=$((FAIL+1))
  fi
}

echo "=== ABS Australia Smoke Test ==="
echo ""

# 1. Health
echo "1. Health check"
STATUS=$(curl -sf "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
if [ "$STATUS" = "ready" ]; then
  echo "  PASS: /health/ready = ready"
  PASS=$((PASS+1))
else
  echo "  FAIL: /health/ready = $STATUS"
  FAIL=$((FAIL+1))
fi

# 2. ABS tools in catalog
echo "2. ABS tools in catalog"
ABS_COUNT=$(curl -sf "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(len([t for t in d['data'] if t['id'].startswith('abs.')]))
")
if [ "$ABS_COUNT" -eq 5 ]; then
  echo "  PASS: $ABS_COUNT ABS tools found"
  PASS=$((PASS+1))
else
  echo "  FAIL: Expected 5 ABS tools, got $ABS_COUNT"
  FAIL=$((FAIL+1))
fi

# 3. Tool detail — abs.gdp
echo "3. Tool detail: abs.gdp"
GDP_PROPS=$(curl -sf "$BASE/api/v1/tools/abs.gdp" | python3 -c "
import sys,json; t=json.load(sys.stdin)
props = list(t.get('input_schema',{}).get('properties',{}).keys())
print(','.join(props))
")
if echo "$GDP_PROPS" | grep -q "measure"; then
  echo "  PASS: abs.gdp has schema properties: $GDP_PROPS"
  PASS=$((PASS+1))
else
  echo "  FAIL: abs.gdp missing schema properties (got: $GDP_PROPS)"
  FAIL=$((FAIL+1))
fi

# 4. Tool detail — abs.cpi
echo "4. Tool detail: abs.cpi"
CPI_DESC=$(curl -sf "$BASE/api/v1/tools/abs.cpi" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('ok' if len(t.get('description',''))>20 else 'no_desc')
")
if [ "$CPI_DESC" = "ok" ]; then
  echo "  PASS: abs.cpi has description"
  PASS=$((PASS+1))
else
  echo "  FAIL: abs.cpi missing description"
  FAIL=$((FAIL+1))
fi

# 5. Tool detail — abs.labour_force
echo "5. Tool detail: abs.labour_force"
LF_SCHEMA=$(curl -sf "$BASE/api/v1/tools/abs.labour_force" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print(bool(t.get('input_schema',{}).get('properties',{})))
")
if [ "$LF_SCHEMA" = "True" ]; then
  echo "  PASS: abs.labour_force has input_schema"
  PASS=$((PASS+1))
else
  echo "  FAIL: abs.labour_force missing input_schema"
  FAIL=$((FAIL+1))
fi

# 6. Tool detail — abs.population
echo "6. Tool detail: abs.population"
POP_SCHEMA=$(curl -sf "$BASE/api/v1/tools/abs.population" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print(bool(t.get('input_schema',{}).get('properties',{})))
")
if [ "$POP_SCHEMA" = "True" ]; then
  echo "  PASS: abs.population has input_schema"
  PASS=$((PASS+1))
else
  echo "  FAIL: abs.population missing input_schema"
  FAIL=$((FAIL+1))
fi

# 7. Tool detail — abs.trade
echo "7. Tool detail: abs.trade"
TRADE_SCHEMA=$(curl -sf "$BASE/api/v1/tools/abs.trade" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print(bool(t.get('input_schema',{}).get('properties',{})))
")
if [ "$TRADE_SCHEMA" = "True" ]; then
  echo "  PASS: abs.trade has input_schema"
  PASS=$((PASS+1))
else
  echo "  FAIL: abs.trade missing input_schema"
  FAIL=$((FAIL+1))
fi

# 8. Live ABS API reachable (bypass gateway, verify upstream)
echo "8. Upstream ABS API reachable"
ABS_LIVE=$(curl -sf "https://data.api.abs.gov.au/rest/data/ABS,ERP_Q,1.0.0/1.3.TOT.AUS.Q?format=jsondata&dimensionAtObservation=AllDimensions&detail=dataonly&lastNObservations=1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
obs = d.get('data',{}).get('dataSets',[{}])[0].get('observations',{})
print('ok' if len(obs)>=1 else 'empty')
" 2>&1)
if [ "$ABS_LIVE" = "ok" ]; then
  echo "  PASS: Upstream ABS API returns data"
  PASS=$((PASS+1))
else
  echo "  FAIL: Upstream ABS API unreachable or empty"
  FAIL=$((FAIL+1))
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ $FAIL -gt 0 ]; then exit 1; fi
