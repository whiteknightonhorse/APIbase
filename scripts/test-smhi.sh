#!/bin/bash
# Smoke test for SMHI Open Data integration (UC-573)
set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local label="$1" result="$2"
  if [ "$result" = "ok" ]; then
    echo "  PASS  $label"; PASS=$((PASS+1))
  else
    echo "  FAIL  $label — $result"; FAIL=$((FAIL+1))
  fi
}

echo "=== SMHI Open Data (UC-573) smoke test ==="

# 1. Health
STATUS=$(curl -sf "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null || echo "error")
check "Health check" "$([ "$STATUS" = "ready" ] && echo ok || echo "status=$STATUS")"

# 2. Tools in catalog (expect 4)
COUNT=$(curl -sf "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
smhi=[t for t in d['data'] if t['id'].startswith('smhi.')]
print(len(smhi))
" 2>/dev/null || echo "0")
check "4 smhi tools in catalog" "$([ "$COUNT" = "4" ] && echo ok || echo "count=$COUNT")"

# 3. Tool detail — smhi.forecast
SCHEMA_OK=$(curl -sf "$BASE/api/v1/tools/smhi.forecast" | python3 -c "
import sys,json; t=json.load(sys.stdin)
ok = bool(t.get('input_schema',{}).get('properties'))
print('ok' if ok else 'no_schema')
" 2>/dev/null || echo "error")
check "smhi.forecast has input_schema" "$SCHEMA_OK"

# 4. Tool detail — smhi.warnings
SCHEMA_OK2=$(curl -sf "$BASE/api/v1/tools/smhi.warnings" | python3 -c "
import sys,json; t=json.load(sys.stdin)
ok = bool(t.get('input_schema',{}).get('properties'))
print('ok' if ok else 'no_schema')
" 2>/dev/null || echo "error")
check "smhi.warnings has input_schema" "$SCHEMA_OK2"

# 5. Upstream reachability — forecast API (snow1g)
FORECAST_OK=$(curl -sf "https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/18.0686/lat/59.3293/data.json" | python3 -c "
import sys,json; d=json.load(sys.stdin)
ok = len(d.get('timeSeries', [])) > 0
print('ok' if ok else 'empty')
" 2>/dev/null || echo "error")
check "Upstream: snow1g forecast API reachable (82 steps)" "$FORECAST_OK"

# 6. Upstream reachability — fire risk API
FIRE_OK=$(curl -sf "https://opendata-download-metfcst.smhi.se/api/category/fwif1g/version/1/daily/geotype/point/lon/18.0686/lat/59.3293/data.json" | python3 -c "
import sys,json; d=json.load(sys.stdin)
ok = len(d.get('timeSeries', [])) >= 7
print('ok' if ok else 'empty')
" 2>/dev/null || echo "error")
check "Upstream: fwif1g fire risk API reachable (7 days)" "$FIRE_OK"

# 7. Upstream reachability — warnings API
WARN_OK=$(curl -sf "https://opendata-download-warnings.smhi.se/ibww/api/version/1/warning.json" | python3 -c "
import sys,json; d=json.load(sys.stdin)
ok = isinstance(d, list)
print('ok' if ok else 'wrong_type')
" 2>/dev/null || echo "error")
check "Upstream: SMHI warnings API reachable" "$WARN_OK"

# 8. Upstream reachability — observations API (Stockholm-Arlanda)
OBS_OK=$(curl -sf "https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/1/station/97400/period/latest-hour/data.json" | python3 -c "
import sys,json; d=json.load(sys.stdin)
ok = bool(d.get('value'))
print('ok' if ok else 'no_value')
" 2>/dev/null || echo "error")
check "Upstream: metobs observations API reachable (Arlanda temp)" "$OBS_OK"

# 9. Dashboard entry
DASH_OK=$(curl -sf "$BASE/api/v1/dashboard" | python3 -c "
import sys,json; d=json.load(sys.stdin)
match = [p for p in d['providers'] if p['provider'] == 'smhi']
if match:
    p=match[0]
    print(f'ok ({p[\"tool_count\"]} tools)')
else:
    print('not_found')
" 2>/dev/null || echo "error")
check "SMHI in dashboard" "$(echo "$DASH_OK" | grep -q "^ok" && echo ok || echo "$DASH_OK")"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && echo "All tests passed!" || exit 1
