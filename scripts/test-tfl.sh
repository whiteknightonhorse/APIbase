#!/bin/bash
# Smoke test for Transport for London (TfL) adapter (UC-568)
set -e

BASE="https://apibase.pro"
echo "=== TfL London Smoke Test (UC-568) ==="

echo "1/4 Health check..."
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && echo "  PASS" || { echo "  FAIL: $STATUS"; exit 1; }

echo "2/4 TfL tools in catalog..."
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
tfl=[t for t in d['data'] if t['id'].startswith('tfl.')]
print(len(tfl))
")
[ "$COUNT" = "4" ] && echo "  PASS ($COUNT tfl tools)" || { echo "  FAIL: expected 4, got $COUNT"; exit 1; }

echo "3/4 Tool detail endpoints..."
for TOOL in tfl.line_status tfl.arrivals tfl.journey_plan tfl.bike_points; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/tools/$TOOL")
  [ "$HTTP" = "200" ] && echo "  PASS $TOOL" || { echo "  FAIL $TOOL: HTTP $HTTP"; exit 1; }
done

echo "4/4 Input schema populated..."
SCHEMA=$(curl -s "$BASE/api/v1/tools/tfl.line_status" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print(len(t.get('input_schema',{}).get('properties',{})))
")
[ "$SCHEMA" -ge "2" ] && echo "  PASS (tfl.line_status has $SCHEMA params)" || { echo "  FAIL: schema missing"; exit 1; }

echo ""
echo "=== TfL smoke test PASSED ==="
