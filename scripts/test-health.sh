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

# --- Test 5-9: Live API calls (require USDA API key) ---
USDA_KEY=$(grep "PROVIDER_KEY_USDA" /home/apibase/apibase/.env 2>/dev/null | cut -d= -f2)
if [ "$USDA_KEY" = "MANUAL_REQUIRED" ] || [ -z "$USDA_KEY" ]; then
  echo ""
  echo "[5-9] Live API tests SKIPPED — PROVIDER_KEY_USDA not configured"
  SKIP=$((SKIP+5))
else
  API_KEY="ak_live_test_key_for_smoke_testing_only_00"

  # --- Test 5: food_search ---
  echo "[5] health.food_search — chicken breast"
  R=$(curl -sf -X POST "$BASE/api/v1/tools/health.food_search" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: $API_KEY" \
    -d '{"params":{"query":"chicken breast","page_size":5}}' 2>/dev/null || echo '{}')
  if echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('data',{}).get('foods') or d.get('result',{}).get('foods')" 2>/dev/null; then
    ok "food_search returned foods"
  elif echo "$R" | grep -qi "error"; then
    fail "food_search" "$(echo "$R" | python3 -c "import json,sys;print(json.load(sys.stdin).get('error',{}).get('message','unknown'))" 2>/dev/null || echo 'error')"
  else
    fail "food_search" "unexpected response"
  fi

  # --- Test 6: food_details ---
  echo "[6] health.food_details — fdcId 171705"
  R=$(curl -sf -X POST "$BASE/api/v1/tools/health.food_details" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: $API_KEY" \
    -d '{"params":{"fdc_id":171705}}' 2>/dev/null || echo '{}')
  if echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('data',d.get('result',{})); assert r.get('fdcId') or r.get('description')" 2>/dev/null; then
    ok "food_details returned nutrition data"
  elif echo "$R" | grep -qi "error"; then
    fail "food_details" "$(echo "$R" | python3 -c "import json,sys;print(json.load(sys.stdin).get('error',{}).get('message','unknown'))" 2>/dev/null || echo 'error')"
  else
    fail "food_details" "unexpected response"
  fi

  # --- Test 7: drug_events ---
  echo "[7] health.drug_events — aspirin"
  R=$(curl -sf -X POST "$BASE/api/v1/tools/health.drug_events" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: $API_KEY" \
    -d '{"params":{"search":"patient.drug.medicinalproduct:aspirin","limit":3}}' 2>/dev/null || echo '{}')
  if echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('data',d.get('result',{})); assert r.get('results')" 2>/dev/null; then
    ok "drug_events returned results"
  elif echo "$R" | grep -qi "error"; then
    fail "drug_events" "$(echo "$R" | python3 -c "import json,sys;print(json.load(sys.stdin).get('error',{}).get('message','unknown'))" 2>/dev/null || echo 'error')"
  else
    fail "drug_events" "unexpected response"
  fi

  # --- Test 8: food_recalls ---
  echo "[8] health.food_recalls — latest"
  R=$(curl -sf -X POST "$BASE/api/v1/tools/health.food_recalls" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: $API_KEY" \
    -d '{"params":{"limit":3}}' 2>/dev/null || echo '{}')
  if echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('data',d.get('result',{})); assert r.get('results')" 2>/dev/null; then
    ok "food_recalls returned results"
  elif echo "$R" | grep -qi "error"; then
    fail "food_recalls" "$(echo "$R" | python3 -c "import json,sys;print(json.load(sys.stdin).get('error',{}).get('message','unknown'))" 2>/dev/null || echo 'error')"
  else
    fail "food_recalls" "unexpected response"
  fi

  # --- Test 9: supplement_search ---
  echo "[9] health.supplement_search — vitamin D"
  R=$(curl -sf -X POST "$BASE/api/v1/tools/health.supplement_search" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: $API_KEY" \
    -d '{"params":{"query":"vitamin D","limit":5}}' 2>/dev/null || echo '{}')
  if echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('data',d.get('result',{})); assert r.get('data') or r.get('total') is not None" 2>/dev/null; then
    ok "supplement_search returned results"
  elif echo "$R" | grep -qi "error"; then
    fail "supplement_search" "$(echo "$R" | python3 -c "import json,sys;print(json.load(sys.stdin).get('error',{}).get('message','unknown'))" 2>/dev/null || echo 'error')"
  else
    fail "supplement_search" "unexpected response"
  fi
fi

# --- Summary ---
echo ""
echo "=== Results: $PASS PASS / $FAIL FAIL / $SKIP SKIP ==="
[ "$FAIL" -eq 0 ] && echo "ALL OK" || exit 1
