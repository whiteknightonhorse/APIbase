#!/usr/bin/env bash
# Smoke test for FAO FAOSTAT SDG API (UC-530)
set -uo pipefail
BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local desc="$1"; local result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS  $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL  $desc — $result"; FAIL=$((FAIL+1))
  fi
}

echo "=== FAO FAOSTAT SDG smoke test ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health check" "$( [ "$STATUS" = "ready" ] && echo ok || echo "status=$STATUS" )"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n=[t for t in d['data'] if t['provider']=='faostat']
print(len(n))
" 2>/dev/null)
check "5 faostat tools in catalog" "$( [ "$COUNT" = "5" ] && echo ok || echo "count=$COUNT" )"

# 3. Tool detail endpoints (must return 200 with schema)
for tool in food_security food_insecurity water_stress forest_area food_loss; do
  HTTP=$(curl -so /dev/null -w "%{http_code}" "$BASE/api/v1/tools/faostat.$tool")
  check "Tool detail faostat.$tool" "$( [ "$HTTP" = "200" ] && echo ok || echo "http=$HTTP" )"
done

# 4. Live SDMX API: food security (India)
INDIA_PREV=$(curl -s \
  "https://nsi-release-ro-statsuite.fao.org/rest/data/FAO,DF_SDG_2_1_1,1.0/A.SN_ITK_DEFC.356._T._T._T._T._T.PT._T._T._T?detail=dataonly&startPeriod=2022&endPeriod=2022" \
  -H "Accept: application/json" | python3 -c "
import sys,json
d = json.load(sys.stdin)
ds = d['dataSets'][0]
struct = d['structure']
time_dim = struct['dimensions']['observation']
for sk, sd in ds['series'].items():
    for ti, obs in sd['observations'].items():
        val = obs[0]
        if val not in ('', None):
            print('ok')
            break
" 2>/dev/null)
check "Live: India undernourishment 2022" "$( [ "$INDIA_PREV" = "ok" ] && echo ok || echo "no data" )"

# 5. Live SDMX API: water stress (France)
FRANCE_WS=$(curl -s \
  "https://nsi-release-ro-statsuite.fao.org/rest/data/FAO,DF_SDG_6_4_2,1.0/A.ER_H2O_STRESS.250._T._T._T._T._T.PT._T._T._T?detail=dataonly&startPeriod=2022&endPeriod=2022" \
  -H "Accept: application/json" | python3 -c "
import sys,json
d = json.load(sys.stdin)
ds = d['dataSets'][0]
time_dim = d['structure']['dimensions']['observation']
dims = d['structure']['dimensions']['series']
for sk, sd in ds['series'].items():
    parts = [int(x) for x in sk.split(':')]
    activ = dims[5]['values'][parts[5]]['name']
    for ti, obs in sd['observations'].items():
        val = obs[0]
        if val not in ('', None) and activ == 'No breakdown':
            print('ok')
            break
" 2>/dev/null)
check "Live: France water stress 2022" "$( [ "$FRANCE_WS" = "ok" ] && echo ok || echo "no data" )"

# 6. Live SDMX API: forest area (Brazil)
BRAZIL_FA=$(curl -s \
  "https://nsi-release-ro-statsuite.fao.org/rest/data/FAO,DF_SDG_15_1_1,1.0/A.AG_LND_FRST.076._T._T._T._T._T.PT._T._T._T?detail=dataonly&startPeriod=2020&endPeriod=2020" \
  -H "Accept: application/json" | python3 -c "
import sys,json
d = json.load(sys.stdin)
ds = d['dataSets'][0]
for sk, sd in ds['series'].items():
    for ti, obs in sd['observations'].items():
        val = obs[0]
        if val not in ('', None):
            print('ok')
            break
" 2>/dev/null)
check "Live: Brazil forest area 2020" "$( [ "$BRAZIL_FA" = "ok" ] && echo ok || echo "no data" )"

# 7. Live SDMX API: food loss
FOOD_LOSS=$(curl -s \
  "https://nsi-release-ro-statsuite.fao.org/rest/data/FAO,DF_SDG_12_3_1,1.0?detail=dataonly&startPeriod=2022&endPeriod=2022" \
  -H "Accept: application/json" | python3 -c "
import sys,json
d = json.load(sys.stdin)
ds = d['dataSets'][0]
n = sum(len(s['observations']) for s in ds['series'].values())
print('ok' if n > 10 else f'n={n}')
" 2>/dev/null)
check "Live: food loss global data 2022" "$( [ "$FOOD_LOSS" = "ok" ] && echo ok || echo "$FOOD_LOSS" )"

echo ""
echo "=== Results ==="
echo "Passed: $PASS/$((PASS+FAIL))"
[ "$FAIL" -eq 0 ] && echo "=== All FAO FAOSTAT tests passed ===" || echo "=== $FAIL test(s) FAILED ==="
exit "$FAIL"
