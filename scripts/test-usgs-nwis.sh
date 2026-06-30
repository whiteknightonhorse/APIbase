#!/usr/bin/env bash
# Smoke test for USGS NWIS Streamflow (UC-557)
# Tests: health, catalog presence, tool detail schemas, live NWIS API endpoints
set -euo pipefail

BASE="https://apibase.pro"
PROVIDER="usgs-nwis"
TOOLS="nwis.daily_values nwis.annual_stats nwis.basin_conditions nwis.site_info"
PASS=0
FAIL=0

ok() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== USGS NWIS Streamflow Smoke Test (UC-557) ==="

# 1. Health check
echo "1/5 Health check..."
STATUS=$(curl -s "$BASE/health/ready" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
[ "$STATUS" = "ready" ] && ok "Health: $STATUS" || fail "Health: $STATUS"

# 2. Tools in catalog
echo "2/5 Tools in catalog..."
CATALOG=$(curl -s "$BASE/api/v1/tools")
for TOOL in $TOOLS; do
  COUNT=$(echo "$CATALOG" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len([t for t in d['data'] if t['id']=='$TOOL']))")
  [ "$COUNT" = "1" ] && ok "Tool in catalog: $TOOL" || fail "Tool missing: $TOOL"
done

# 3. Tool detail has input_schema
echo "3/5 Tool detail schemas..."
for TOOL in $TOOLS; do
  HAS_SCHEMA=$(curl -s "$BASE/api/v1/tools/$TOOL" | python3 -c "import sys,json; t=json.load(sys.stdin); print(bool(t.get('input_schema',{}).get('properties')))")
  [ "$HAS_SCHEMA" = "True" ] && ok "Schema: $TOOL" || fail "No schema: $TOOL"
done

# 4. Direct USGS API endpoint tests (bypassing payment)
echo "4/5 Direct USGS API endpoints..."

# Test daily values
DV=$(curl -s "https://waterservices.usgs.gov/nwis/dv/?format=json&sites=01646500&parameterCd=00060&period=P7D")
DV_COUNT=$(echo "$DV" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['value']['timeSeries']))")
[ "$DV_COUNT" -ge "1" ] && ok "NWIS DV endpoint: $DV_COUNT timeSeries" || fail "NWIS DV endpoint failed"

# Test annual stats
STAT=$(curl -s "https://waterservices.usgs.gov/nwis/stat/?format=rdb&sites=01646500&statReportType=annual&statType=mean&parameterCd=00060")
echo "$STAT" | grep -q "year_nu" && ok "NWIS stat endpoint: annual stats available" || fail "NWIS stat endpoint failed"

# Test basin conditions (HUC)
BASIN=$(curl -s "https://waterservices.usgs.gov/nwis/iv/?format=json&huc=02070008&parameterCd=00060&period=PT1H&siteType=ST&siteStatus=active")
BASIN_SITES=$(echo "$BASIN" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['value']['timeSeries']))")
[ "$BASIN_SITES" -ge "5" ] && ok "NWIS basin endpoint: $BASIN_SITES sites in HUC 02070008" || fail "NWIS basin endpoint: too few sites ($BASIN_SITES)"

# Test site info
SITE=$(curl -s "https://waterservices.usgs.gov/nwis/site/?format=rdb&sites=01646500&siteOutput=expanded")
echo "$SITE" | grep -q "01646500" && ok "NWIS site endpoint: site metadata available" || fail "NWIS site endpoint failed"

# 5. Provider in dashboard
echo "5/5 Dashboard check..."
sudo docker exec apibase-redis-1 redis-cli DEL 'dashboard:data' > /dev/null 2>&1 || true
sleep 2
DASH=$(curl -s "$BASE/api/v1/dashboard")
TOOL_COUNT=$(echo "$DASH" | python3 -c "import sys,json; d=json.load(sys.stdin); p=[x for x in d['providers'] if x['provider']=='$PROVIDER']; print(p[0]['tool_count'] if p else 0)")
[ "$TOOL_COUNT" = "4" ] && ok "Dashboard: $PROVIDER shows $TOOL_COUNT tools" || fail "Dashboard: $PROVIDER shows $TOOL_COUNT tools (expected 4)"

echo ""
echo "=== Results: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" -eq 0 ] && echo "ALL PASSED" || exit 1
