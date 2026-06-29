#!/usr/bin/env bash
# Smoke test for US Treasury Fiscal Data (UC-527)
set -euo pipefail

BASE="https://apibase.pro"
PROVIDER="treasuryfiscal"
TOOLS=("treasuryfiscal.debt.current" "treasuryfiscal.rates.interest" "treasuryfiscal.yield.quarterly" "treasuryfiscal.debt.expense")
PASS=0
FAIL=0

check() {
  local desc="$1" result="$2" expected="$3"
  if echo "$result" | grep -q "$expected"; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc"
    echo "    Got: $(echo "$result" | head -1)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Treasury Fiscal Data smoke tests ==="

# 1. Health check
echo "1. Health check..."
check "Health ready" "$(curl -sf "${BASE}/health/ready")" '"status":"ready"'

# 2. Tools in catalog
echo "2. Tools in catalog..."
CATALOG=$(curl -sf "${BASE}/api/v1/tools")
for TOOL in "${TOOLS[@]}"; do
  check "Tool ${TOOL} in catalog" "$CATALOG" "\"$TOOL\""
done

# 3. Tool detail endpoints (schema populated)
echo "3. Tool detail (schema)..."
for TOOL in "${TOOLS[@]}"; do
  DETAIL=$(curl -sf "${BASE}/api/v1/tools/${TOOL}")
  check "${TOOL} has input_schema" "$DETAIL" '"input_schema"'
done

# 4. Upstream API live check (no auth)
echo "4. Upstream API live check..."
DEBT=$(curl -sf "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page%5Bsize%5D=1")
check "Treasury debt endpoint live" "$DEBT" '"tot_pub_debt_out_amt"'

RATES=$(curl -sf "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?sort=-record_date&page%5Bsize%5D=1")
check "Treasury interest rates endpoint live" "$RATES" '"avg_interest_rate_amt"'

YIELD=$(curl -sf "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/utf_qtr_yields?sort=-record_date&page%5Bsize%5D=1")
check "Treasury quarterly yield endpoint live" "$YIELD" '"yield_pct"'

EXPENSE=$(curl -sf "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/interest_expense?sort=-record_date&page%5Bsize%5D=1")
check "Treasury interest expense endpoint live" "$EXPENSE" '"month_expense_amt"'

# 5. Provider in dashboard
echo "5. Provider in dashboard..."
sudo docker exec apibase-redis-1 redis-cli DEL 'dashboard:data' > /dev/null 2>&1 || true
DASH=$(curl -sf "${BASE}/api/v1/dashboard")
check "${PROVIDER} in dashboard" "$DASH" '"treasuryfiscal"'

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
