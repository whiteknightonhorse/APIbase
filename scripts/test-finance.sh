#!/usr/bin/env bash
# UC-016: Finance / Banking — Direct upstream API tests
set -euo pipefail

PASS=0
FAIL=0
SKIP=0

ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
skip() { echo "  ⊘ $1 (skipped)"; SKIP=$((SKIP+1)); }

echo "=== UC-016: Finance / Banking — Upstream Tests ==="
echo ""

# 1. fawazahmed0 CDN — Exchange Rates (200+ currencies)
echo "→ fawazahmed0 CDN (exchange_rates)"
RESP=$(curl -sf "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json" 2>&1) || true
if echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'date' in d; assert len(d.get('usd',{})) > 100" 2>/dev/null; then
  RATES_COUNT=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('usd',{})))")
  ok "fawazahmed0: ${RATES_COUNT} currency rates for USD"
else
  fail "fawazahmed0: unexpected response"
fi

# 2. Frankfurter/ECB — ECB Rates (~33 fiat)
echo "→ Frankfurter/ECB (ecb_rates)"
RESP=$(curl -sf "https://api.frankfurter.app/latest?from=USD" 2>&1) || true
if echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['base']=='USD'; assert len(d['rates']) > 20" 2>/dev/null; then
  ECB_COUNT=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['rates']))")
  ok "Frankfurter/ECB: ${ECB_COUNT} fiat rates for USD"
else
  fail "Frankfurter/ECB: unexpected response"
fi

# 3. FRED — Economic Indicator (requires API key)
echo "→ FRED (economic_indicator)"
if [ -n "${PROVIDER_KEY_FRED:-}" ]; then
  RESP=$(curl -sf "https://api.stlouisfed.org/fred/series/observations?series_id=GDP&api_key=${PROVIDER_KEY_FRED}&file_type=json&limit=5&sort_order=desc" 2>&1) || true
  if echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); assert len(d['observations']) > 0" 2>/dev/null; then
    ok "FRED: GDP observations returned"
  else
    fail "FRED: unexpected response"
  fi
else
  skip "FRED: PROVIDER_KEY_FRED not set"
fi

# 4. World Bank — Country Data
echo "→ World Bank (country_data)"
RESP=$(curl -sf "https://api.worldbank.org/v2/country/US/indicator/NY.GDP.MKTP.CD?format=json&per_page=5" 2>&1) || true
if echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); assert len(d)==2; assert d[0]['total']>0" 2>/dev/null; then
  TOTAL=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['total'])")
  ok "World Bank: US GDP data (${TOTAL} records)"
else
  fail "World Bank: unexpected response"
fi

# 5. US Treasury Fiscal Data
echo "→ US Treasury (treasury_data)"
RESP=$(curl -sf "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?page%5Bsize%5D=5&sort=-record_date" 2>&1) || true
if echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); assert len(d['data']) > 0" 2>/dev/null; then
  ROWS=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']))")
  ok "US Treasury: avg_interest_rates (${ROWS} rows)"
else
  fail "US Treasury: unexpected response"
fi

# 6. OpenIBAN — IBAN Validation
echo "→ OpenIBAN (validate_iban)"
RESP=$(curl -sf "https://openiban.com/validate/DE89370400440532013000?getBIC=true&validateBankCode=true" 2>&1) || true
if echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['valid']==True" 2>/dev/null; then
  ok "OpenIBAN: DE89370400440532013000 → valid: true"
else
  fail "OpenIBAN: unexpected response"
fi

echo ""
echo "=== Results: ${PASS} PASS / ${FAIL} FAIL / ${SKIP} SKIP ==="
[ "$FAIL" -eq 0 ] && echo "ALL TESTS PASSED" || exit 1
