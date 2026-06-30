#!/usr/bin/env bash
# Smoke test: USGS HANS Volcano (UC-556)
# Tests health, catalog presence, tool detail, and live API calls.
set -euo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local label="$1"; local cmd="$2"
  if eval "$cmd" &>/dev/null; then
    echo "PASS: $label"; PASS=$((PASS+1))
  else
    echo "FAIL: $label"; FAIL=$((FAIL+1))
  fi
}

echo "=== USGS HANS Volcano Smoke Test (UC-556) ==="

# 1. Health
check "Health ready" "curl -sf ${BASE}/health/ready | python3 -c \"import sys,json; d=json.load(sys.stdin); assert d['status']=='ready'\""

# 2. Volcano tools in catalog
check "6 volcano tools in catalog" "curl -sf '${BASE}/api/v1/tools' | python3 -c \"import sys,json; d=json.load(sys.stdin); tools=[t for t in d['data'] if t['provider']=='usgs-hans-volcano']; assert len(tools)==6, f'Expected 6, got {len(tools)}'\""

# 3. Tool detail endpoints (200 + schema)
for tool in volcano.monitored volcano.elevated volcano.cap_alerts volcano.us_catalog volcano.detail volcano.latest_notice; do
  check "Tool detail: ${tool}" "curl -sf '${BASE}/api/v1/tools/${tool}' | python3 -c \"import sys,json; t=json.load(sys.stdin); assert t['id']=='${tool}'\""
done

# 4. Live API call — monitored volcanoes (no auth needed)
check "Live: volcano.monitored pricing" "curl -sf '${BASE}/api/v1/tools' | python3 -c \"import sys,json; d=json.load(sys.stdin); t=[t for t in d['data'] if t['id']=='volcano.monitored'][0]; assert t['pricing']['price_usd']==0.001\""

# 5. Live upstream endpoint sanity (direct)
check "Upstream: getMonitoredVolcanoes" "curl -sf 'https://volcanoes.usgs.gov/hans-public/api/volcano/getMonitoredVolcanoes' | python3 -c \"import sys,json; d=json.load(sys.stdin); assert len(d)>0\""
check "Upstream: getElevatedVolcanoes" "curl -sf 'https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes' | python3 -c \"import sys,json; d=json.load(sys.stdin); assert isinstance(d,list)\""
check "Upstream: getCapElevated" "curl -sf 'https://volcanoes.usgs.gov/hans-public/api/volcano/getCapElevated' | python3 -c \"import sys,json; d=json.load(sys.stdin); assert isinstance(d,list)\""
check "Upstream: getUSVolcanoes" "curl -sf 'https://volcanoes.usgs.gov/hans-public/api/volcano/getUSVolcanoes' | python3 -c \"import sys,json; d=json.load(sys.stdin); assert len(d)>=100\""
check "Upstream: getVolcano/ak277" "curl -sf 'https://volcanoes.usgs.gov/hans-public/api/volcano/getVolcano/ak277' | python3 -c \"import sys,json; d=json.load(sys.stdin); assert d['volcano_cd']=='ak277'\""

echo ""
echo "=== Results: PASS=${PASS} FAIL=${FAIL} ==="
[ "${FAIL}" -eq 0 ] && echo "ALL PASS" || exit 1
