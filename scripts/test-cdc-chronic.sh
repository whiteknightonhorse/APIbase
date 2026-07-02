#!/usr/bin/env bash
# Smoke test: CDC Chronic Disease Indicators (UC-565)
set -uo pipefail

BASE="https://apibase.pro"
PASS=0; FAIL=0

check() {
  local desc="$1"; local cmd="$2"; local expect="$3"
  if result=$(eval "$cmd" 2>/dev/null) && echo "$result" | grep -q "$expect"; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc (expected '$expect')"; echo "  Got: ${result:-<empty>}" | head -3; FAIL=$((FAIL+1))
  fi
}

echo "=== CDC Chronic Disease Indicators smoke test ==="
echo ""

echo "1. Health check"
check "API healthy" \
  "curl -s $BASE/health/ready" \
  '"status":"ready"'

echo ""
echo "2. Tools in catalog"
check "cdc_chronic.indicators in catalog" \
  "curl -s '$BASE/api/v1/tools' | python3 -c \"import sys,json; d=json.load(sys.stdin); ids=[t['id'] for t in d['data']]; print('found' if 'cdc_chronic.indicators' in ids else 'missing')\"" \
  "found"

check "cdc_chronic.topics in catalog" \
  "curl -s '$BASE/api/v1/tools' | python3 -c \"import sys,json; d=json.load(sys.stdin); ids=[t['id'] for t in d['data']]; print('found' if 'cdc_chronic.topics' in ids else 'missing')\"" \
  "found"

check "cdc_chronic.state_compare in catalog" \
  "curl -s '$BASE/api/v1/tools' | python3 -c \"import sys,json; d=json.load(sys.stdin); ids=[t['id'] for t in d['data']]; print('found' if 'cdc_chronic.state_compare' in ids else 'missing')\"" \
  "found"

check "cdc_chronic.trend in catalog" \
  "curl -s '$BASE/api/v1/tools' | python3 -c \"import sys,json; d=json.load(sys.stdin); ids=[t['id'] for t in d['data']]; print('found' if 'cdc_chronic.trend' in ids else 'missing')\"" \
  "found"

echo ""
echo "3. Tool detail endpoints (schema present)"
check "indicators has input schema" \
  "curl -s '$BASE/api/v1/tools/cdc_chronic.indicators' | python3 -c \"import sys,json; t=json.load(sys.stdin); print('ok' if t.get('input_schema',{}).get('properties') else 'missing')\"" \
  "ok"

check "topics has input schema" \
  "curl -s '$BASE/api/v1/tools/cdc_chronic.topics' | python3 -c \"import sys,json; t=json.load(sys.stdin); print('ok' if 'input_schema' in t else 'missing')\"" \
  "ok"

echo ""
echo "4. Live API calls"
check "topics — lists 19 topics" \
  "curl -s 'https://chronicdata.cdc.gov/resource/hksd-2xuw.json?\$select=topicid,topic&\$group=topicid,topic&\$limit=30' | python3 -c \"import sys,json; d=json.load(sys.stdin); print(f'{len(d)} topics')\"" \
  "19 topics"

check "indicators — diabetes data CA 2023" \
  "curl -s 'https://chronicdata.cdc.gov/resource/hksd-2xuw.json?%24where=topicid%3D%27DIA%27%20AND%20locationabbr%3D%27CA%27%20AND%20yearstart%3D%272023%27&%24limit=1' | python3 -c \"import sys,json; d=json.load(sys.stdin); print('diabetes' if d and d[0].get('topic')=='Diabetes' else 'missing')\"" \
  "diabetes"

check "trend — smoking US" \
  "curl -s 'https://chronicdata.cdc.gov/resource/hksd-2xuw.json?%24where=questionid%3D%27TOB04%27%20AND%20locationabbr%3D%27US%27&%24select=yearstart,datavalue&%24order=yearstart%20DESC&%24limit=3' | python3 -c \"import sys,json; d=json.load(sys.stdin); print('trend-ok' if len(d)>=2 else 'missing')\"" \
  "trend-ok"

check "state compare — diabetes all states" \
  "curl -s 'https://chronicdata.cdc.gov/resource/hksd-2xuw.json?%24where=questionid%3D%27DIA01%27%20AND%20stratificationid1%3D%27OVR%27%20AND%20yearstart%3D%272023%27&%24select=locationabbr,datavalue&%24order=locationabbr&%24limit=55' | python3 -c \"import sys,json; d=json.load(sys.stdin); print(f'{len(d)} states')\"" \
  "states"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -eq 0 ]; then
  echo "ALL TESTS PASSED"
else
  echo "SOME TESTS FAILED"
  exit 1
fi
