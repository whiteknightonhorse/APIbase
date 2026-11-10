#!/bin/bash
# T-0755: stale-quote probe against the SANDBOX (never production). Run by the dispatcher.
#   ./scripts/sandbox/stale-quote.sh
# Proves: a catalog price change inside the quote window does not change the quote or its 402
# amount; after expires_at the quote is 410 quote_expired with a fresh quote at the current price
# and the old id cannot be paid. SQL runs only inside the sandbox postgres container (its own env).
# $0: no payment is made. The SKU price is always restored on exit.
# Exit 0 = all steps passed, 1 = a step failed, 2 = a guard refused (nothing was called).
set -uo pipefail

SANDBOX_URL="${SANDBOX_URL:-https://sandbox.apibase.pro}"
MERCHANT="${SANDBOX_MERCHANT:-apibase-demo}"
TEST_SKU="${SANDBOX_TEST_SKU:-__apibase_test}"
PG_CONTAINER="${SANDBOX_PG_CONTAINER:-apibase-sandbox-postgres-1}"

HOST="${SANDBOX_URL#*://}"
HOST="${HOST%%/*}"
HOST="${HOST%%:*}"
case "$HOST" in
  apibase.pro | www.apibase.pro)
    echo "refusing: SANDBOX_URL host $HOST is production" >&2
    exit 2
    ;;
esac
case "$PG_CONTAINER" in
  apibase-sandbox-*) ;;
  *)
    echo "refusing: SANDBOX_PG_CONTAINER must start with apibase-sandbox-" >&2
    exit 2
    ;;
esac

PASSED=0
FAILED=0
step_pass() { echo "$1 PASS $2"; PASSED=$((PASSED + 1)); }
step_fail() { echo "$1 FAIL $2"; FAILED=$((FAILED + 1)); }

BODY=""
CODE=""
call() {
  local out
  out=$(curl -sS --max-time 20 -w $'\n%{http_code}' "$@" 2>&1) || { CODE=000; BODY="$out"; return; }
  CODE="${out##*$'\n'}"
  BODY="${out%$'\n'*}"
}
# $1 = SQL text (no double quotes inside); runs in the container with the container's own env
sql() {
  docker exec "$PG_CONTAINER" sh -c "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"$1\""
}
# first value of a JSON field in $BODY: jfield <name>
jfield() { printf '%s' "$BODY" | sed -n "s/.*\"$1\":\"\\{0,1\\}\\([^\",}]*\\).*/\\1/p" | head -n1; }
# accepts[0].amount of a 402 body
accept_amount() { printf '%s' "$BODY" | sed -n 's/.*"accepts":\[{[^]]*"amount":"\{0,1\}\([0-9]*\).*/\1/p' | head -n1; }

SLUG_SQL="(SELECT merchant_id FROM shop_merchants WHERE slug = '$MERCHANT')"
P0=""
restore() {
  if [ -n "$P0" ]; then
    sql "UPDATE shop_products SET price_usd = $P0 WHERE merchant_id = $SLUG_SQL AND sku = '$TEST_SKU'" >/dev/null 2>&1
  fi
  echo "restored price=${P0:-none}"
}
trap restore EXIT

BUYER="bt_$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
AUTH=(-H "Authorization: Bearer $BUYER")
echo "Sandbox stale-quote probe against $SANDBOX_URL ($MERCHANT / $TEST_SKU)"

# SQ1a: read the price, open a quote, take the first challenge
P0=$(sql "SELECT price_usd::text FROM shop_products WHERE merchant_id = $SLUG_SQL AND sku = '$TEST_SKU'" 2>/dev/null | head -n1)
QUOTE_ID=""
T0=""
AMT0=""
if [ -z "$P0" ]; then
  step_fail SQ1a "cannot read the SKU price by SQL"
else
  call -X POST "$SANDBOX_URL/api/v1/shop/quotes" "${AUTH[@]}" -H 'Content-Type: application/json' \
    -H "x-idempotency-key: stale-quote-$(date -u +%s)-$$" \
    -d "{\"merchant\":\"$MERCHANT\",\"items\":[{\"sku\":\"$TEST_SKU\",\"qty\":1}]}"
  QUOTE_ID=$(jfield quote_id)
  T0=$(jfield total_usd)
  if [ "$CODE" = 201 ] && [ -n "$QUOTE_ID" ]; then
    call "$SANDBOX_URL/api/v1/shop/quotes/$QUOTE_ID/pay"
    AMT0=$(accept_amount)
    step_pass SQ1a "price=$P0 quote=$QUOTE_ID total=$T0 challenge_amount=${AMT0:-?}"
  else
    step_fail SQ1a "HTTP $CODE ${BODY:0:200}"
  fi
fi

# SQ1b: double the price; the open quote and its 402 amount must not move
if [ -z "$QUOTE_ID" ]; then
  step_fail SQ1b "no quote from SQ1a"
else
  sql "UPDATE shop_products SET price_usd = $P0 * 2 WHERE merchant_id = $SLUG_SQL AND sku = '$TEST_SKU'" >/dev/null 2>&1
  call "${AUTH[@]}" "$SANDBOX_URL/api/v1/shop/quotes/$QUOTE_ID"
  G_CODE=$CODE
  T1=$(jfield total_usd)
  call "$SANDBOX_URL/api/v1/shop/quotes/$QUOTE_ID/pay"
  AMT1=$(accept_amount)
  if [ "$G_CODE" = 200 ] && [ "$T1" = "$T0" ] && [ "$CODE" = 402 ] && [ -n "$AMT0" ] && [ "$AMT1" = "$AMT0" ]; then
    step_pass SQ1b "GET 200 total=$T1; pay 402 amount=$AMT1 unchanged"
  else
    step_fail SQ1b "GET $G_CODE total=$T1 (want $T0); pay $CODE amount=${AMT1:-?} (want ${AMT0:-?})"
  fi
fi

# SQ2a: expire the quote; GET answers 410 with a fresh quote at the doubled price
NEW_QUOTE=""
if [ -z "$QUOTE_ID" ]; then
  step_fail SQ2a "no quote from SQ1a"
else
  sql "UPDATE shop_quotes SET expires_at = now() - interval '1 minute' WHERE quote_id = '$QUOTE_ID'::uuid" >/dev/null 2>&1
  call "${AUTH[@]}" "$SANDBOX_URL/api/v1/shop/quotes/$QUOTE_ID"
  EC=$(jfield error_code)
  NEW_QUOTE=$(printf '%s' "$BODY" | sed -n 's/.*"quote":{.*"quote_id":"\([^"]*\)".*/\1/p' | head -n1)
  NT=$(printf '%s' "$BODY" | sed -n 's/.*"quote":{.*"total_usd":"\{0,1\}\([0-9.]*\).*/\1/p' | head -n1)
  EXPECT=$(awk -v t="${T0:-0}" 'BEGIN{printf "%.2f", t*2}')
  NTN=$(awk -v t="${NT:-0}" 'BEGIN{printf "%.2f", t}')
  if [ "$CODE" = 410 ] && [ "$EC" = quote_expired ] && [ -n "$NEW_QUOTE" ] && [ "$NEW_QUOTE" != "$QUOTE_ID" ] && [ "$NTN" = "$EXPECT" ]; then
    step_pass SQ2a "410 quote_expired; fresh quote=$NEW_QUOTE total=$NT"
  else
    step_fail SQ2a "HTTP $CODE error_code=$EC fresh=${NEW_QUOTE:-none} total=${NT:-?} (want 2*T0=$EXPECT)"
  fi
fi

# SQ2b: the old id must not be payable at the old amount
if [ -z "$QUOTE_ID" ]; then
  step_fail SQ2b "no quote from SQ1a"
else
  call "$SANDBOX_URL/api/v1/shop/quotes/$QUOTE_ID/pay"
  EC=$(jfield error_code)
  AMT2=$(accept_amount)
  echo "  old id pay: status=$CODE error_code=${EC:-none}"
  if [ "$CODE" != 200 ] && ! { [ "$CODE" = 402 ] && [ -n "$AMT0" ] && [ "$AMT2" = "$AMT0" ]; }; then
    step_pass SQ2b "old id not payable (status=$CODE error_code=${EC:-none})"
  else
    step_fail SQ2b "old id still payable: status=$CODE amount=${AMT2:-?}"
  fi
fi

# cancel the fresh quote's order with the same buyer token (best effort)
if [ -n "$NEW_QUOTE" ]; then
  call "${AUTH[@]}" "$SANDBOX_URL/api/v1/shop/quotes/$NEW_QUOTE"
  FRESH_ORDER=$(jfield order_id)
  if [ -n "$FRESH_ORDER" ]; then
    curl -sS --max-time 20 -o /dev/null "${AUTH[@]}" -X POST "$SANDBOX_URL/api/v1/shop/orders/$FRESH_ORDER/cancel" || true
  fi
fi

echo "Passed: $PASSED  Failed: $FAILED"
[ "$FAILED" -eq 0 ]
