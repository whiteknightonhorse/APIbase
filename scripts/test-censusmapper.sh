#!/bin/bash
# Smoke test for CensusMapper — censusmapper (UC-799)
# Tests: health, catalog presence, tool details, public upstream endpoint, key-gated upstream rejects bad key

BASE="${BASE:-https://apibase.pro}"
UP="https://censusmapper.ca/api/v1"
PASS=0
FAIL=0

check() {
  if [ "$2" = "ok" ]; then echo "  PASS: $1"; PASS=$((PASS + 1)); else echo "  FAIL: $1 — $2"; FAIL=$((FAIL + 1)); fi
}

echo "=== censusmapper Smoke Test ==="

STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health ready" "$([ "$STATUS" = "ready" ] && echo ok || echo "$STATUS")"

COUNT=$(curl -s "$BASE/api/v1/tools?limit=2000" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(len([t for t in d['data'] if t['provider']=='censusmapper']))" 2>/dev/null)
check "2 censusmapper tools in catalog" "$([ "$COUNT" = "2" ] && echo ok || echo "got $COUNT")"

for TOOL in list_datasets data; do
  HAS=$(curl -s "$BASE/api/v1/tools/censusmapper.$TOOL" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('ok' if t.get('input_schema',{}).get('properties') else 'no schema')" 2>/dev/null)
  check "censusmapper.$TOOL schema populated" "$HAS"
done

CODE=$(curl -s -o /dev/null -w '%{http_code}' "$UP/list_datasets")
check "upstream list_datasets (public)" "$([ "$CODE" = "200" ] && echo ok || echo "HTTP $CODE")"

CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST -d "api_key=invalid&dataset=CA21&level=Regions" "$UP/data.csv")
check "upstream data.csv rejects invalid key (401)" "$([ "$CODE" = "401" ] && echo ok || echo "HTTP $CODE")"

echo "Passed: $PASS Failed: $FAIL"
[ "$FAIL" = "0" ]
