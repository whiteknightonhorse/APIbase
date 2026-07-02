#!/bin/bash
# Smoke test for JMA Bosai (UC-593)
# Tests: health, catalog presence, tool details, live API calls

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

echo "=== JMA Bosai Smoke Test ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health ready" "$([ "$STATUS" = "ready" ] && echo ok || echo "$STATUS")"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n=[t for t in d['data'] if t['provider']=='jma-bosai']
print(len(n))
" 2>/dev/null)
check "5 jma-bosai tools in catalog" "$([ "$COUNT" = "5" ] && echo ok || echo "got $COUNT")"

# 3. Tool detail — schema populated
for TOOL in jma-bosai.forecast jma-bosai.overview jma-bosai.warnings jma-bosai.earthquakes jma-bosai.areas; do
  HAS_SCHEMA=$(curl -s "$BASE/api/v1/tools/$TOOL" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('ok' if t.get('input_schema',{}).get('properties') else 'no_schema')
" 2>/dev/null)
  check "$TOOL schema populated" "$HAS_SCHEMA"
done

# 4. Live API calls (direct to JMA, no payment needed)
AREAS=$(curl -s "https://www.jma.go.jp/bosai/common/const/area.json" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if len(d['offices']) >= 50 else 'too_few')
" 2>/dev/null)
check "JMA areas API live (50+ offices)" "$AREAS"

FORECAST=$(curl -s "https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if isinstance(d,list) and len(d)>0 and 'timeSeries' in d[0] else 'bad_response')
" 2>/dev/null)
check "JMA forecast API live (Tokyo)" "$FORECAST"

QUAKES=$(curl -s "https://www.jma.go.jp/bosai/quake/data/list.json" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if isinstance(d,list) and len(d)>0 and 'mag' in d[0] else 'bad_response')
" 2>/dev/null)
check "JMA earthquake API live" "$QUAKES"

OVERVIEW=$(curl -s "https://www.jma.go.jp/bosai/forecast/data/overview_forecast/130000.json" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if 'text' in d and 'headlineText' in d else 'bad_response')
" 2>/dev/null)
check "JMA overview API live (Tokyo)" "$OVERVIEW"

WARNINGS=$(curl -s "https://www.jma.go.jp/bosai/warning/data/warning/130000.json" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('ok' if 'areaTypes' in d and 'reportDatetime' in d else 'bad_response')
" 2>/dev/null)
check "JMA warnings API live (Tokyo)" "$WARNINGS"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" = "0" ] && echo "ALL PASS" || exit 1
