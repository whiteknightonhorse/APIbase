#!/usr/bin/env bash
# test-tmdb.sh — TMDB (UC-010) integration tests
# Usage: bash scripts/test-tmdb.sh [BASE_URL]
set -euo pipefail

BASE="${1:-http://localhost:8880}"
PASS=0; FAIL=0; SKIP=0

ok()   { PASS=$((PASS+1)); echo "  PASS: $1"; }
fail() { FAIL=$((FAIL+1)); echo "  FAIL: $1 — $2"; }
skip() { SKIP=$((SKIP+1)); echo "  SKIP: $1 — $2"; }

echo "=== TMDB Integration Tests (UC-010) ==="
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

# --- Test 2: Catalog count (7 TMDB tools) ---
echo "[2] TMDB tools in catalog"
TOOLS=$(curl -sf "$BASE/api/v1/tools?limit=100" 2>/dev/null || echo '{"data":[]}')
TMDB_COUNT=$(echo "$TOOLS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len([t for t in d.get('data',d) if t.get('id','').startswith('tmdb.')]))" 2>/dev/null || echo 0)
if [ "$TMDB_COUNT" -eq 7 ]; then
  ok "7 TMDB tools found"
else
  fail "Catalog" "Expected 7 TMDB tools, got $TMDB_COUNT"
fi

# --- Test 3: Total tools = 75 ---
echo "[3] Total tool count"
TOTAL=$(echo "$TOOLS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('data',d)))" 2>/dev/null || echo 0)
if [ "$TOTAL" -ge 75 ]; then
  ok "Total tools: $TOTAL (>= 75)"
else
  fail "Total" "Expected >= 75 tools, got $TOTAL"
fi

# --- Test 4: Tool detail ---
echo "[4] Tool detail: tmdb.movie_search"
DETAIL=$(curl -sf "$BASE/api/v1/tools/tmdb.movie_search" 2>/dev/null || echo '{}')
if echo "$DETAIL" | grep -q 'tmdb.movie_search'; then
  ok "Tool detail returned"
else
  fail "Tool detail" "tmdb.movie_search not found"
fi

# --- Test 5-11: Live API calls (require real TMDB token) ---
# Check if TMDB adapter is available by examining the env
TOKEN_STATUS=$(grep "TMDB_ACCESS_TOKEN" /home/apibase/apibase/.env 2>/dev/null | cut -d= -f2)
if [ "$TOKEN_STATUS" = "MANUAL_REQUIRED" ] || [ -z "$TOKEN_STATUS" ]; then
  echo ""
  echo "[5-11] Live API tests SKIPPED — TMDB_ACCESS_TOKEN not configured"
  SKIP=$((SKIP+7))
else
  # Test 5: movie_search
  echo "[5] Live: movie_search (Inception)"
  RESP=$(curl -sf -X POST "$BASE/api/v1/tools/tmdb.movie_search" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: ak_live_test_00000000000000000000000000000000" \
    -d '{"query":"Inception"}' 2>/dev/null || echo '{}')
  if echo "$RESP" | grep -q '"results"'; then
    ok "movie_search returned results"
  else
    fail "movie_search" "$(echo "$RESP" | head -c 200)"
  fi

  # Test 6: movie_details
  echo "[6] Live: movie_details (27205 = Inception)"
  RESP=$(curl -sf -X POST "$BASE/api/v1/tools/tmdb.movie_details" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: ak_live_test_00000000000000000000000000000000" \
    -d '{"id":27205}' 2>/dev/null || echo '{}')
  if echo "$RESP" | grep -q '"Inception"'; then
    ok "movie_details returned Inception"
  else
    fail "movie_details" "$(echo "$RESP" | head -c 200)"
  fi

  # Test 7: movie_trending
  echo "[7] Live: movie_trending"
  RESP=$(curl -sf -X POST "$BASE/api/v1/tools/tmdb.movie_trending" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: ak_live_test_00000000000000000000000000000000" \
    -d '{"type":"movie","window":"week"}' 2>/dev/null || echo '{}')
  if echo "$RESP" | grep -q '"results"'; then
    ok "movie_trending returned results"
  else
    fail "movie_trending" "$(echo "$RESP" | head -c 200)"
  fi

  # Test 8: movie_discover
  echo "[8] Live: movie_discover (top rated 2024)"
  RESP=$(curl -sf -X POST "$BASE/api/v1/tools/tmdb.movie_discover" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: ak_live_test_00000000000000000000000000000000" \
    -d '{"type":"movie","sort_by":"vote_average.desc","year":2024,"vote_average_gte":7}' 2>/dev/null || echo '{}')
  if echo "$RESP" | grep -q '"results"'; then
    ok "movie_discover returned results"
  else
    fail "movie_discover" "$(echo "$RESP" | head -c 200)"
  fi

  # Test 9: movie_similar
  echo "[9] Live: movie_similar (27205 = Inception)"
  RESP=$(curl -sf -X POST "$BASE/api/v1/tools/tmdb.movie_similar" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: ak_live_test_00000000000000000000000000000000" \
    -d '{"id":27205}' 2>/dev/null || echo '{}')
  if echo "$RESP" | grep -q '"results"'; then
    ok "movie_similar returned results"
  else
    fail "movie_similar" "$(echo "$RESP" | head -c 200)"
  fi

  # Test 10: movie_person
  echo "[10] Live: movie_person (Tom Hanks)"
  RESP=$(curl -sf -X POST "$BASE/api/v1/tools/tmdb.movie_person" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: ak_live_test_00000000000000000000000000000000" \
    -d '{"query":"Tom Hanks"}' 2>/dev/null || echo '{}')
  if echo "$RESP" | grep -q '"results"'; then
    ok "movie_person returned results"
  else
    fail "movie_person" "$(echo "$RESP" | head -c 200)"
  fi

  # Test 11: movie_where_to_watch
  echo "[11] Live: movie_where_to_watch (27205 = Inception)"
  RESP=$(curl -sf -X POST "$BASE/api/v1/tools/tmdb.movie_where_to_watch" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: ak_live_test_00000000000000000000000000000000" \
    -d '{"id":27205,"type":"movie"}' 2>/dev/null || echo '{}')
  if echo "$RESP" | grep -q '"results"'; then
    ok "movie_where_to_watch returned results"
  else
    fail "movie_where_to_watch" "$(echo "$RESP" | head -c 200)"
  fi
fi

echo ""
echo "=== Results: $PASS PASS, $FAIL FAIL, $SKIP SKIP ==="
[ "$FAIL" -eq 0 ] && echo "ALL PASSED" || exit 1
