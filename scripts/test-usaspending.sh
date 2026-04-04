#!/usr/bin/env bash
set -uo pipefail
BASE="https://apibase.pro"
PASS=0; FAIL=0
pass() { echo "  PASS  $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL  $1"; FAIL=$((FAIL + 1)); }
echo "=== USAspending Smoke Test ==="
if curl -sf "$BASE/health/ready" >/dev/null 2>&1; then pass "Health ready"; else fail "Health ready"; fi
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "import sys,json; print(sum(1 for t in json.load(sys.stdin)['data'] if t['id'].startswith('spending.')))")
if [ "$COUNT" -eq 3 ]; then pass "3 spending tools ($COUNT)"; else fail "3 spending tools ($COUNT)"; fi
for TOOL in spending.awards spending.agency spending.geography; do
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/tools/$TOOL")
  if [ "$STATUS" = "200" ]; then pass "Tool detail $TOOL"; else fail "Tool detail $TOOL ($STATUS)"; fi
done
TOP=$(curl -s -X POST "https://api.usaspending.gov/api/v2/search/spending_by_geography/" -H "Content-Type: application/json" \
  -d '{"scope":"place_of_performance","geo_layer":"state","filters":{"time_period":[{"start_date":"2024-10-01","end_date":"2025-09-30"}],"award_type_codes":["A","B","C","D"]}}' | python3 -c "
import sys,json; r=sorted(json.load(sys.stdin).get('results',[]),key=lambda x:x.get('aggregated_amount',0),reverse=True); print(r[0]['display_name'] if r else '?')" 2>/dev/null)
if [ -n "$TOP" ]; then pass "Upstream → top state=$TOP"; else fail "Upstream"; fi
echo ""; echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -eq 0 ]; then echo "=== All tests passed ==="; else exit 1; fi
