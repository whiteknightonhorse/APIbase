#!/bin/bash
# APIbase.pro — CoinGecko Crypto APIs Smoke Tests (UC-004)
#
# Verifies CoinGecko adapter integration:
#   Tests 1-4: Catalog presence, tool details (REST)
#   Tests 5-11: Live CoinGecko/GeckoTerminal API calls (direct)
#
# Usage:
#   API_URL=https://apibase.pro ./scripts/test-coingecko.sh
#
# Environment:
#   API_URL               — Base URL (default: https://apibase.pro)
#   PROVIDER_KEY_COINGECKO — CoinGecko Demo API key (optional, sourced from .env)
set -euo pipefail

API_URL="${API_URL:-https://apibase.pro}"
CG_BASE="https://api.coingecko.com/api/v3"
GT_BASE="https://api.geckoterminal.com/api/v2"
CG_KEY="${PROVIDER_KEY_COINGECKO:-}"
PASSED=0
FAILED=0
SKIPPED=0

pass() { echo "  PASS"; PASSED=$((PASSED + 1)); }
fail() { echo "  FAIL: $1"; FAILED=$((FAILED + 1)); }
skip() { echo "  SKIP: $1"; SKIPPED=$((SKIPPED + 1)); }

echo "=== CoinGecko Crypto APIs Smoke Tests (UC-004) ==="
echo "Target: $API_URL"
echo ""

# ---------------------------------------------------------------------------
# 1. Health check
# ---------------------------------------------------------------------------
echo -n "1/11 Health readiness..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health/ready" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass
else
  fail "expected 200, got $HTTP_CODE"
fi

# ---------------------------------------------------------------------------
# 2. Crypto tools in catalog (expect 9)
# ---------------------------------------------------------------------------
echo -n "2/11 Crypto tools in catalog..."
CATALOG=$(curl -s -H "Accept: application/json" "$API_URL/api/v1/tools?limit=100" 2>/dev/null || echo "{}")
CRYPTO_COUNT=$(echo "$CATALOG" | grep -o '"crypto\.\|"coingecko\.' | wc -l)
if [ "$CRYPTO_COUNT" -ge 9 ]; then
  pass
else
  fail "expected >= 9 crypto tools, found $CRYPTO_COUNT"
fi

# ---------------------------------------------------------------------------
# 3. Tool detail: crypto.get_price
# ---------------------------------------------------------------------------
echo -n "3/11 Tool detail crypto.get_price..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v1/tools/crypto.get_price" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass
else
  fail "expected 200, got $HTTP_CODE"
fi

# ---------------------------------------------------------------------------
# 4. Tool detail: crypto.trending
# ---------------------------------------------------------------------------
echo -n "4/11 Tool detail crypto.trending..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v1/tools/crypto.trending" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass
else
  fail "expected 200, got $HTTP_CODE"
fi

# ---------------------------------------------------------------------------
# 5. Live: simple price (BTC, ETH)
# ---------------------------------------------------------------------------
echo -n "5/11 Live: crypto.get_price (BTC, ETH)..."
if [ -z "$CG_KEY" ]; then
  skip "PROVIDER_KEY_COINGECKO not set"
else
  RESULT=$(curl -sf "$CG_BASE/simple/price?ids=bitcoin,ethereum&vs_currencies=usd" \
    -H "x-cg-demo-api-key: $CG_KEY" 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -q '"usd"'; then
    pass
  else
    fail "expected USD prices, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 6. Live: coin markets
# ---------------------------------------------------------------------------
echo -n "6/11 Live: coingecko.get_market..."
if [ -z "$CG_KEY" ]; then
  skip "PROVIDER_KEY_COINGECKO not set"
else
  RESULT=$(curl -sf "$CG_BASE/coins/markets?vs_currency=usd&per_page=5&order=market_cap_desc" \
    -H "x-cg-demo-api-key: $CG_KEY" 2>/dev/null || echo "[]")
  if echo "$RESULT" | grep -q '"bitcoin"'; then
    pass
  else
    fail "expected bitcoin in top markets, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 7. Live: coin detail (bitcoin)
# ---------------------------------------------------------------------------
echo -n "7/11 Live: crypto.coin_detail (bitcoin)..."
if [ -z "$CG_KEY" ]; then
  skip "PROVIDER_KEY_COINGECKO not set"
else
  RESULT=$(curl -sf "$CG_BASE/coins/bitcoin?localization=false&tickers=false" \
    -H "x-cg-demo-api-key: $CG_KEY" 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -q '"symbol"'; then
    pass
  else
    fail "expected coin detail, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 8. Live: trending coins
# ---------------------------------------------------------------------------
echo -n "8/11 Live: crypto.trending..."
if [ -z "$CG_KEY" ]; then
  skip "PROVIDER_KEY_COINGECKO not set"
else
  RESULT=$(curl -sf "$CG_BASE/search/trending" \
    -H "x-cg-demo-api-key: $CG_KEY" 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -q '"coins"'; then
    pass
  else
    fail "expected trending coins, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 9. Live: global stats
# ---------------------------------------------------------------------------
echo -n "9/11 Live: crypto.global..."
if [ -z "$CG_KEY" ]; then
  skip "PROVIDER_KEY_COINGECKO not set"
else
  RESULT=$(curl -sf "$CG_BASE/global" \
    -H "x-cg-demo-api-key: $CG_KEY" 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -q '"active_cryptocurrencies"'; then
    pass
  else
    fail "expected global data, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# 10. Live: DEX pools (GeckoTerminal, no auth)
# ---------------------------------------------------------------------------
echo -n "10/11 Live: crypto.dex_pools (WETH)..."
RESULT=$(curl -sf "$GT_BASE/search/pools?query=WETH" 2>/dev/null || echo "{}")
if echo "$RESULT" | grep -q '"data"'; then
  pass
else
  fail "expected pool data, got: $(echo "$RESULT" | head -c 200)"
fi

# ---------------------------------------------------------------------------
# 11. Live: search (bitcoin)
# ---------------------------------------------------------------------------
echo -n "11/11 Live: crypto.search (bitcoin)..."
if [ -z "$CG_KEY" ]; then
  skip "PROVIDER_KEY_COINGECKO not set"
else
  RESULT=$(curl -sf "$CG_BASE/search?query=bitcoin" \
    -H "x-cg-demo-api-key: $CG_KEY" 2>/dev/null || echo "{}")
  if echo "$RESULT" | grep -q '"coins"'; then
    pass
  else
    fail "expected search results, got: $(echo "$RESULT" | head -c 200)"
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=== Results: $PASSED passed, $FAILED failed, $SKIPPED skipped ==="
if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
echo "CoinGecko Crypto APIs integration OK"
