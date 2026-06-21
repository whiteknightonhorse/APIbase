#!/usr/bin/env bash
# DataCite smoke tests (UC-458)

BASE="https://apibase.pro"
PASS=0; FAIL=0

ok()  { echo "PASS: $1"; PASS=$((PASS+1)); }
bad() { echo "FAIL: $1 — ${2:0:200}"; FAIL=$((FAIL+1)); }

echo "=== DataCite smoke tests ==="

# 1. Health
OUT=$(curl -s "$BASE/health/ready")
echo "$OUT" | grep -q "ready" && ok "Health" || bad "Health" "$OUT"

# 2. 4 tools in catalog
COUNT=$(curl -s "$BASE/api/v1/tools" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len([t for t in d['data'] if t['id'].startswith('datacite.')]))")
[ "$COUNT" = "4" ] && ok "4 datacite tools in catalog" || bad "expected 4 tools, got $COUNT" ""

# 3. doi.search has input_schema properties
SCHEMA=$(curl -s "$BASE/api/v1/tools/datacite.doi.search" | python3 -c "import sys,json; t=json.load(sys.stdin); print(bool(t.get('input_schema',{}).get('properties')))")
[ "$SCHEMA" = "True" ] && ok "doi.search has input_schema" || bad "doi.search schema" "$SCHEMA"

# 4. doi.lookup in catalog
OUT=$(curl -s "$BASE/api/v1/tools/datacite.doi.lookup")
echo "$OUT" | grep -q '"id"' && ok "doi.lookup in catalog" || bad "doi.lookup" "$OUT"

# 5. works.stats in catalog
OUT=$(curl -s "$BASE/api/v1/tools/datacite.works.stats")
echo "$OUT" | grep -q '"id"' && ok "works.stats in catalog" || bad "works.stats" "$OUT"

# 6. client.search in catalog
OUT=$(curl -s "$BASE/api/v1/tools/datacite.client.search")
echo "$OUT" | grep -q '"id"' && ok "client.search in catalog" || bad "client.search" "$OUT"

# 7. Dashboard shows datacite with 4 tools
DTCOUNT=$(curl -s "$BASE/api/v1/dashboard" | python3 -c "import sys,json; d=json.load(sys.stdin); m=[p for p in d['providers'] if p['provider']=='datacite']; print(m[0]['tool_count'] if m else 0)")
[ "$DTCOUNT" = "4" ] && ok "datacite in dashboard (4 tools)" || bad "dashboard datacite tools" "$DTCOUNT"

echo ""
echo "=== Results: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" -eq 0 ] && echo "ALL PASSED" || exit 1
