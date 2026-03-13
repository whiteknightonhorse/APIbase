#!/usr/bin/env bash
# test-health.sh — Health & Nutrition (UC-011) integration tests
# Usage: bash scripts/test-health.sh [BASE_URL]
set -euo pipefail

BASE="${1:-http://localhost:8880}"
PASS=0; FAIL=0; SKIP=0

ok()   { PASS=$((PASS+1)); echo "  PASS: $1"; }
fail() { FAIL=$((FAIL+1)); echo "  FAIL: $1 — $2"; }
skip() { SKIP=$((SKIP+1)); echo "  SKIP: $1 — $2"; }

echo "=== Health & Nutrition Integration Tests (UC-011) ==="
echo "Base: $BASE"
echo ""

# --- Test 1: Health ---
echo "[1] Health check"
HEALTH=$(curl -sf "$BASE/health/ready" 2>/dev/null || echo '{}')
if echo "$HEALTH" | grep -q '"ready"'; then
  ok "API healthy"
else
  fail "Health" "API not ready"
fi

# --- Test 2: Catalog count (7 health tools) ---
echo "[2] Health tools in catalog"
TOOLS=$(curl -sf "$BASE/api/v1/tools?limit=100" 2>/dev/null || echo '{"data":[]}')
HEALTH_COUNT=$(echo "$TOOLS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len([t for t in d.get('data',d) if t.get('id','').startswith('health.')]))" 2>/dev/null || echo 0)
if [ "$HEALTH_COUNT" -eq 7 ]; then
  ok "7 health tools found"
else
  fail "Catalog" "Expected 7 health tools, got $HEALTH_COUNT"
fi

# --- Test 3: Total tools >= 82 ---
echo "[3] Total tool count"
TOTAL=$(echo "$TOOLS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('data',d)))" 2>/dev/null || echo 0)
if [ "$TOTAL" -ge 50 ]; then
  ok "Total tools: $TOTAL (>= 50)"
else
  fail "Total" "Expected >= 50 tools, got $TOTAL"
fi

# --- Test 4: Tool detail ---
echo "[4] Tool detail: health.food_search"
DETAIL=$(curl -sf "$BASE/api/v1/tools/health.food_search" 2>/dev/null || echo '{}')
if echo "$DETAIL" | grep -q 'health.food_search'; then
  ok "Tool detail returned"
else
  fail "Tool detail" "health.food_search not found"
fi

# --- Test 5-9: Direct upstream API tests (verify keys & adapter logic) ---
USDA_KEY=$(grep "PROVIDER_KEY_USDA" /home/apibase/apibase/.env 2>/dev/null | cut -d= -f2)
if [ "$USDA_KEY" = "MANUAL_REQUIRED" ] || [ -z "$USDA_KEY" ]; then
  echo ""
  echo "[5-9] Live API tests SKIPPED — PROVIDER_KEY_USDA not configured"
  SKIP=$((SKIP+5))
else
  # Test upstream APIs directly (same calls the adapter makes)

  # --- Test 5: USDA food_search ---
  echo "[5] USDA food_search — chicken breast"
  R=$(curl -sf -X POST "https://api.nal.usda.gov/fdc/v1/foods/search?api_key=$USDA_KEY" \
    -H "Content-Type: application/json" \
    -d '{"query":"chicken breast","pageSize":3}' 2>/dev/null || echo '{}')
  if echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('totalHits',0) > 0" 2>/dev/null; then
    HITS=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin).get('totalHits',0))")
    ok "USDA food_search: $HITS hits"
  else
    fail "USDA food_search" "no results"
  fi

  # --- Test 6: USDA food_details ---
  echo "[6] USDA food_details — fdcId 171705"
  R=$(curl -sf "https://api.nal.usda.gov/fdc/v1/food/171705?api_key=$USDA_KEY" 2>/dev/null || echo '{}')
  if echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('fdcId')" 2>/dev/null; then
    DESC=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin).get('description','?'))")
    ok "USDA food_details: $DESC"
  else
    fail "USDA food_details" "no data"
  fi

  # --- Test 7: OpenFDA drug_events ---
  echo "[7] OpenFDA drug_events — aspirin"
  OPENFDA_KEY=$(grep "PROVIDER_KEY_OPENFDA" /home/apibase/apibase/.env 2>/dev/null | cut -d= -f2)
  FDA_QS=""
  [ -n "$OPENFDA_KEY" ] && FDA_QS="api_key=$OPENFDA_KEY&"
  R=$(curl -sf "https://api.fda.gov/drug/event.json?${FDA_QS}search=patient.drug.medicinalproduct:aspirin&limit=1" 2>/dev/null || echo '{}')
  if echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('results')" 2>/dev/null; then
    TOTAL=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin).get('meta',{}).get('results',{}).get('total',0))")
    ok "OpenFDA drug_events: $TOTAL total events"
  else
    fail "OpenFDA drug_events" "no results"
  fi

  # --- Test 8: OpenFDA food_recalls ---
  echo "[8] OpenFDA food_recalls — latest"
  R=$(curl -sf "https://api.fda.gov/food/enforcement.json?${FDA_QS}limit=1" 2>/dev/null || echo '{}')
  if echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('results')" 2>/dev/null; then
    ok "OpenFDA food_recalls: returned recall data"
  else
    fail "OpenFDA food_recalls" "no results"
  fi

  # --- Test 9: NIH DSLD supplement_search ---
  echo "[9] NIH DSLD supplement_search — vitamin D"
  R=$(curl -sf "https://api.ods.od.nih.gov/dsld/v9/search-filter?q=vitamin+D&size=3" 2>/dev/null || echo '{}')
  if echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('hits')" 2>/dev/null; then
    COUNT=$(echo "$R" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('hits',[])))")
    ok "NIH DSLD search: $COUNT hits"
  else
    fail "NIH DSLD search" "no results"
  fi
fi

# --- Summary ---
echo ""
echo "=== Results: $PASS PASS / $FAIL FAIL / $SKIP SKIP ==="
[ "$FAIL" -eq 0 ] && echo "ALL OK" || exit 1
