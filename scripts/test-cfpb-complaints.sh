#!/bin/bash
# Smoke test for CFPB Consumer Complaint Database API — search/trends/geo_states (UC-614)
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

echo "=== CFPB Consumer Complaint Database Smoke Test ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health ready" "$([ "$STATUS" = "ready" ] && echo ok || echo "$STATUS")"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n=[t for t in d['data'] if t['provider']=='cfpb-complaints']
print(len(n))
" 2>/dev/null)
check "3 cfpb-complaints tools in catalog" "$([ "$COUNT" = "3" ] && echo ok || echo "got $COUNT")"

# 3. Tool detail — schema populated
for TOOL in cfpb-complaints.search cfpb-complaints.trends cfpb-complaints.geo_states; do
  HAS_SCHEMA=$(curl -s "$BASE/api/v1/tools/$TOOL" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('ok' if t.get('input_schema',{}).get('properties') else 'no_schema')
" 2>/dev/null)
  check "$TOOL schema populated" "$HAS_SCHEMA"
done

# 4. Live upstream API calls (consumerfinance.gov, no auth needed)
SEARCH_OK=$(curl -s "https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/?no_aggs=true&size=2" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('ok' if d['hits']['total']['value'] > 0 and len(d['hits']['hits']) == 2 else 'no results')
" 2>/dev/null)
check "Live: complaint search" "$SEARCH_OK"

TRENDS_OK=$(curl -s "https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/trends?lens=overview&trend_interval=month&date_min=2024-01-01&date_max=2024-02-01" | python3 -c "
import sys,json
d=json.load(sys.stdin)
buckets=d['aggregations']['dateRangeBrush']['dateRangeBrush']['buckets']
print('ok' if len(buckets) > 0 else 'no buckets')
" 2>/dev/null)
check "Live: complaint volume trend" "$TRENDS_OK"

GEO_OK=$(curl -s "https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/geo/states?date_received_min=2024-01-01&date_received_max=2024-02-01" | python3 -c "
import sys,json
d=json.load(sys.stdin)
buckets=d['aggregations']['state']['state']['buckets']
print('ok' if len(buckets) > 10 else 'unexpected shape')
" 2>/dev/null)
check "Live: per-state complaint aggregation" "$GEO_OK"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
