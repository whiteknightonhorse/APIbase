#!/usr/bin/env bash
# Test script for NOAA Aviation Weather Center (AWC) adapter — UC-422

API_BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local desc="$1"; local status="$2"
  if [ "$status" -eq 0 ]; then
    echo "PASS: $desc"
    PASS=$((PASS+1))
  else
    echo "FAIL: $desc"
    FAIL=$((FAIL+1))
  fi
}

echo "=== AWC Adapter Tests ==="

# 1. Health check
curl -sf "$API_BASE/health/ready" > /dev/null 2>&1
check "Health check" $?

# 2. AWC tools in catalog
COUNT=$(curl -s "$API_BASE/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len([t for t in d['data'] if t['id'].startswith('awc.')]))")
if [ "$COUNT" -eq 3 ]; then check "3 AWC tools in catalog" 0; else check "3 AWC tools in catalog (got $COUNT)" 1; fi

# 3. METAR tool detail
STATUS=$(curl -so /dev/null -w "%{http_code}" "$API_BASE/api/v1/tools/awc.metar")
if [ "$STATUS" -eq 200 ]; then check "METAR tool detail 200" 0; else check "METAR tool detail (got $STATUS)" 1; fi

# 4. TAF tool detail
STATUS=$(curl -so /dev/null -w "%{http_code}" "$API_BASE/api/v1/tools/awc.taf")
if [ "$STATUS" -eq 200 ]; then check "TAF tool detail 200" 0; else check "TAF tool detail (got $STATUS)" 1; fi

# 5. SIGMET tool detail
STATUS=$(curl -so /dev/null -w "%{http_code}" "$API_BASE/api/v1/tools/awc.sigmet")
if [ "$STATUS" -eq 200 ]; then check "SIGMET tool detail 200" 0; else check "SIGMET tool detail (got $STATUS)" 1; fi

# 6. Upstream METAR API (direct)
METAR=$(curl -s "https://aviationweather.gov/api/data/metar?ids=KJFK&format=json&taf=false&hours=2")
echo "$METAR" | python3 -c "import sys,json; d=json.load(sys.stdin); assert isinstance(d, list) and d[0]['icaoId']=='KJFK'" 2>/dev/null
check "Upstream METAR KJFK returns valid data" $?

# 7. Upstream TAF API (direct)
TAF=$(curl -s "https://aviationweather.gov/api/data/taf?ids=KJFK&format=json")
echo "$TAF" | python3 -c "import sys,json; d=json.load(sys.stdin); assert isinstance(d, list) and 'TAF' in d[0].get('rawTAF','')" 2>/dev/null
check "Upstream TAF KJFK returns valid data" $?

# 8. Upstream SIGMET API (direct) — empty array is valid
SIGMET=$(curl -s "https://aviationweather.gov/api/data/airsigmet?format=json&type=sigmet")
echo "$SIGMET" | python3 -c "import sys,json; d=json.load(sys.stdin); assert isinstance(d, list)" 2>/dev/null
check "Upstream SIGMET returns array (empty or active alerts)" $?

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -eq 0 ]; then exit 0; else exit 1; fi
