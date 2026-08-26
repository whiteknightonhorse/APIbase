#!/bin/bash
# Smoke test for EPA EnviroAtlas — community ecosystem-service metrics (UC-604)
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

echo "=== EPA EnviroAtlas Smoke Test ==="

# 1. Health
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
check "Health ready" "$([ "$STATUS" = "ready" ] && echo ok || echo "$STATUS")"

# 2. Tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "
import sys,json; d=json.load(sys.stdin)
n=[t for t in d['data'] if t['provider']=='enviroatlas']
print(len(n))
" 2>/dev/null)
check "3 enviroatlas tools in catalog" "$([ "$COUNT" = "3" ] && echo ok || echo "got $COUNT")"

# 3. Tool detail — schema populated
for TOOL in enviroatlas.communities enviroatlas.block_group_metrics enviroatlas.community_summary; do
  HAS_SCHEMA=$(curl -s "$BASE/api/v1/tools/$TOOL" | python3 -c "
import sys,json; t=json.load(sys.stdin)
print('ok' if t.get('input_schema',{}).get('properties') else 'no_schema')
" 2>/dev/null)
  check "$TOOL schema populated" "$HAS_SCHEMA"
done

# 4. Live upstream ArcGIS REST calls (enviroatlas.epa.gov, no auth needed)
COMM_OK=$(curl -s "https://enviroatlas.epa.gov/arcgis/rest/services/Communities/Community_Locations/MapServer/0/query?where=1%3D1&outFields=Community,CommST&returnGeometry=false&f=json" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('ok' if len(d.get('features',[])) == 32 else f'got {len(d.get(\"features\",[]))} communities')
" 2>/dev/null)
check "Live: 32 pilot communities returned" "$COMM_OK"

BG_OK=$(curl -s "https://enviroatlas.epa.gov/arcgis/rest/services/Communities/Community_BGmetrics/MapServer/2/query?geometry=-93.6091,41.5868&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=GEOID10,Community,MFor_P&returnGeometry=false&f=json" | python3 -c "
import sys,json
d=json.load(sys.stdin)
feats = d.get('features',[])
print('ok' if feats and feats[0]['attributes'].get('Community') == 'Des Moines, IA' else 'no match')
" 2>/dev/null)
check "Live: point-in-polygon block-group query (Des Moines, IA)" "$BG_OK"

STATS_OK=$(curl -s "https://enviroatlas.epa.gov/arcgis/rest/services/Communities/Community_BGmetrics/MapServer/2/query?where=CommST%3D%27DMIA%27&outStatistics=%5B%7B%22statisticType%22%3A%22avg%22%2C%22onStatisticField%22%3A%22MFor_P%22%2C%22outStatisticFieldName%22%3A%22avg_tree_cover%22%7D%5D&f=json" | python3 -c "
import sys,json
d=json.load(sys.stdin)
feats = d.get('features',[])
print('ok' if feats and feats[0]['attributes'].get('avg_tree_cover') is not None else 'no stats')
" 2>/dev/null)
check "Live: community-level outStatistics aggregation (DMIA)" "$STATS_OK"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
