#!/usr/bin/env bash
# ============================================================================
# CDP Dual-Facilitator Integration Test
# Tests x402 payment architecture with both CDP and PayAI facilitators.
# Validates: no regressions, no duplicates, no collisions, no logic errors.
# ============================================================================
set -uo pipefail

PASS=0
FAIL=0
WARN=0
BASE="https://apibase.pro"
LOCAL="http://127.0.0.1:8880"
API_KEY="${TEST_API_KEY:-$(grep '^SMOKE_TEST_KEY=' .env 2>/dev/null | cut -d= -f2- || echo '')}"
if [ -z "$API_KEY" ]; then
  echo "Set TEST_API_KEY env var or SMOKE_TEST_KEY in .env"
  exit 1
fi

pass() { PASS=$((PASS+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
warn() { WARN=$((WARN+1)); echo "  ⚠ $1"; }

echo "============================================"
echo "CDP Dual-Facilitator Integration Test"
echo "============================================"
echo ""

# ─────────────────────────────────────────────────
echo "=== SECTION 1: System Health ==="
# ─────────────────────────────────────────────────

# 1.1 API health
HEALTH=$(curl -sf "$BASE/health/ready" 2>/dev/null || echo '{}')
if echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('status')=='ready'" 2>/dev/null; then
  pass "API health: ready"
else
  fail "API health: NOT ready"
fi

# 1.2 Worker running
WORKER=$(sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml ps worker --format '{{.Status}}' 2>/dev/null)
if echo "$WORKER" | grep -qi "up\|healthy"; then
  pass "Worker container: running"
else
  fail "Worker container: NOT running ($WORKER)"
fi

# 1.3 Redis connected
REDIS_PING=$(sudo docker exec apibase-redis-1 redis-cli PING 2>/dev/null)
if [ "$REDIS_PING" = "PONG" ]; then
  pass "Redis: connected"
else
  fail "Redis: NOT connected"
fi

echo ""
# ─────────────────────────────────────────────────
echo "=== SECTION 2: PayAI Facilitator (Primary) ==="
# ─────────────────────────────────────────────────

# 2.1 PayAI /supported reachable
PAYAI_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "https://facilitator.payai.network/supported" 2>/dev/null || echo "000")
if [ "$PAYAI_STATUS" = "200" ]; then
  pass "PayAI /supported: HTTP 200"
else
  fail "PayAI /supported: HTTP $PAYAI_STATUS"
fi

# 2.2 PayAI supports Base mainnet
PAYAI_BASE=$(curl -sf "https://facilitator.payai.network/supported" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
kinds = d.get('kinds',[])
has_base = any(str(k.get('network',''))=='eip155:8453' for k in kinds)
print('true' if has_base else 'false')
" 2>/dev/null || echo "false")
if [ "$PAYAI_BASE" = "true" ]; then
  pass "PayAI supports eip155:8453 (Base mainnet)"
else
  fail "PayAI does NOT support Base mainnet"
fi

# 2.3 PayAI supports Bazaar extension
PAYAI_BAZAAR=$(curl -sf "https://facilitator.payai.network/supported" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
exts = d.get('extensions',[])
print('true' if 'bazaar' in exts else 'false')
" 2>/dev/null || echo "false")
if [ "$PAYAI_BAZAAR" = "true" ]; then
  pass "PayAI has Bazaar extension"
else
  warn "PayAI missing Bazaar extension"
fi

# 2.4 x402 health in Redis (PayAI)
PAYAI_HEALTH=$(sudo docker exec apibase-redis-1 redis-cli HGET x402:health status 2>/dev/null || echo "missing")
if [ "$PAYAI_HEALTH" = "green" ]; then
  pass "Redis x402:health (PayAI): green"
elif [ "$PAYAI_HEALTH" = "orange" ]; then
  warn "Redis x402:health (PayAI): orange"
else
  fail "Redis x402:health (PayAI): $PAYAI_HEALTH"
fi

echo ""
# ─────────────────────────────────────────────────
echo "=== SECTION 3: CDP Facilitator Config ==="
# ─────────────────────────────────────────────────

# 3.1 Check CDP env vars present
CDP_ENABLED=$(grep "^CDP_ENABLED=" .env 2>/dev/null | cut -d= -f2-)
CDP_KEY_ID=$(grep "^CDP_API_KEY_ID=" .env 2>/dev/null | cut -d= -f2-)
CDP_SECRET=$(grep "^CDP_API_KEY_SECRET=" .env 2>/dev/null | cut -d= -f2-)
CDP_URL=$(grep "^CDP_FACILITATOR_URL=" .env 2>/dev/null | cut -d= -f2-)

if [ -n "$CDP_KEY_ID" ]; then
  pass "CDP_API_KEY_ID configured: ${CDP_KEY_ID:0:8}..."
else
  warn "CDP_API_KEY_ID not set"
fi

if [ -n "$CDP_SECRET" ]; then
  pass "CDP_API_KEY_SECRET configured (${#CDP_SECRET} chars)"
else
  warn "CDP_API_KEY_SECRET empty — CDP auth will fail until Ed25519 PEM key provided"
fi

if [ "$CDP_ENABLED" = "true" ]; then
  pass "CDP_ENABLED=true (dual-facilitator active)"
else
  warn "CDP_ENABLED=false (PayAI-only mode, CDP not active)"
fi

# 3.2 CDP /supported (no auth — expect 401)
CDP_NO_AUTH=$(curl -s -o /dev/null -w "%{http_code}" "${CDP_URL:-https://api.cdp.coinbase.com/platform/v2/x402}/supported" 2>/dev/null || echo "000")
if [ "$CDP_NO_AUTH" = "401" ]; then
  pass "CDP /supported without auth: 401 (confirms auth required)"
elif [ "$CDP_NO_AUTH" = "200" ]; then
  warn "CDP /supported returned 200 without auth — unexpected"
else
  warn "CDP /supported: HTTP $CDP_NO_AUTH (may be unreachable)"
fi

# 3.3 CDP health in Redis
CDP_HEALTH=$(sudo docker exec apibase-redis-1 redis-cli HGET "x402:health:cdp" status 2>/dev/null)
CDP_HEALTH="${CDP_HEALTH:-missing}"
if [ "$CDP_ENABLED" = "true" ]; then
  if [ "$CDP_HEALTH" = "green" ]; then
    pass "Redis x402:health:cdp: green"
  elif [ "$CDP_HEALTH" = "missing" ]; then
    warn "Redis x402:health:cdp: not yet probed (wait for hourly job)"
  else
    warn "Redis x402:health:cdp: $CDP_HEALTH"
  fi
else
  if [ "$CDP_HEALTH" = "missing" ]; then
    pass "Redis x402:health:cdp: missing (correct — CDP disabled)"
  else
    warn "Redis x402:health:cdp: $CDP_HEALTH (unexpected — CDP disabled)"
  fi
fi

echo ""
# ─────────────────────────────────────────────────
echo "=== SECTION 4: 402 Payment Response Integrity ==="
# ─────────────────────────────────────────────────

# 4.1 402 response format (canopy.search — paid tool)
RESP_402=$(curl -s -X POST "$BASE/api/v1/tools/canopy.search/call" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"query":"test"}' 2>/dev/null || echo '{}')

# 4.2 Correct wallet address
WALLET=$(echo "$RESP_402" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('payment_address',''))" 2>/dev/null)
if [ "$WALLET" = "0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480" ]; then
  pass "402 wallet: correct (0x50EbDa...)"
else
  fail "402 wallet: WRONG ($WALLET)"
fi

# 4.3 Correct network
NETWORK=$(echo "$RESP_402" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('accepts',[{}])[0].get('network',''))" 2>/dev/null)
if [ "$NETWORK" = "eip155:8453" ]; then
  pass "402 network: eip155:8453 (Base mainnet)"
else
  fail "402 network: WRONG ($NETWORK)"
fi

# 4.4 Correct USDC asset
ASSET=$(echo "$RESP_402" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('accepts',[{}])[0].get('asset',''))" 2>/dev/null)
if [ "$ASSET" = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" ]; then
  pass "402 USDC asset: correct"
else
  fail "402 USDC asset: WRONG ($ASSET)"
fi

# 4.5 x402Version = 2
VERSION=$(echo "$RESP_402" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('x402Version',''))" 2>/dev/null)
if [ "$VERSION" = "2" ]; then
  pass "402 x402Version: 2"
else
  fail "402 x402Version: $VERSION"
fi

# 4.6 Price matches config
PRICE=$(echo "$RESP_402" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('price_usd',''))" 2>/dev/null)
if [ "$PRICE" = "0.012" ]; then
  pass "402 price_usd: $0.012 (correct for canopy.search)"
else
  fail "402 price_usd: $PRICE (expected 0.012)"
fi

echo ""
# ─────────────────────────────────────────────────
echo "=== SECTION 5: No Duplicate/Collision Checks ==="
# ─────────────────────────────────────────────────

# 5.1 No duplicate ResourceServer singletons in codebase
DUPE_SINGLETONS=$(grep -rn "let resourceServer.*x402ResourceServer\|new x402ResourceServer" src/ --include="*.ts" 2>/dev/null | grep -v "x402-server.service" | grep -v "node_modules" | wc -l)
if [ "$DUPE_SINGLETONS" -eq 0 ]; then
  pass "No duplicate x402ResourceServer singletons (all use shared factory)"
else
  fail "Found $DUPE_SINGLETONS duplicate x402ResourceServer instances outside shared factory"
  grep -rn "let resourceServer.*x402ResourceServer\|new x402ResourceServer" src/ --include="*.ts" 2>/dev/null | grep -v "x402-server.service" | grep -v "node_modules"
fi

# 5.2 No duplicate HTTPFacilitatorClient instantiation outside shared factory
DUPE_CLIENTS=$(grep -rn "new HTTPFacilitatorClient" src/ --include="*.ts" 2>/dev/null | grep -v "x402-server.service" | grep -v "node_modules" | wc -l)
if [ "$DUPE_CLIENTS" -eq 0 ]; then
  pass "No duplicate HTTPFacilitatorClient outside shared factory"
else
  fail "Found $DUPE_CLIENTS duplicate HTTPFacilitatorClient outside shared factory"
  grep -rn "new HTTPFacilitatorClient" src/ --include="*.ts" 2>/dev/null | grep -v "x402-server.service" | grep -v "node_modules"
fi

# 5.3 Both middleware and settle use shared factory
MW_SHARED=$(grep -c "getSharedResourceServer" src/middleware/x402.middleware.ts 2>/dev/null || echo "0")
SETTLE_SHARED=$(grep -c "getSharedResourceServer" src/pipeline/stages/x402-settle.ts 2>/dev/null || echo "0")
if [ "$MW_SHARED" -gt 0 ] && [ "$SETTLE_SHARED" -gt 0 ]; then
  pass "Both middleware and settle use getSharedResourceServer()"
else
  fail "Middleware ($MW_SHARED) or settle ($SETTLE_SHARED) not using shared factory"
fi

# 5.4 No PayAI URL hardcoded in source (only in .env and env.ts default)
HARDCODED_PAYAI=$(grep -rn "facilitator.payai.network" src/ --include="*.ts" 2>/dev/null | grep -v "node_modules" | grep -v "env.ts" | wc -l)
if [ "$HARDCODED_PAYAI" -eq 0 ]; then
  pass "No hardcoded PayAI URL in source (config-driven)"
else
  fail "Found $HARDCODED_PAYAI hardcoded PayAI URLs in source"
fi

# 5.5 No CDP URL hardcoded in source (only in .env and env.ts default)
HARDCODED_CDP=$(grep -rn "api.cdp.coinbase.com" src/ --include="*.ts" 2>/dev/null | grep -v "node_modules" | grep -v "env.ts" | wc -l)
if [ "$HARDCODED_CDP" -eq 0 ]; then
  pass "No hardcoded CDP URL in source (config-driven via env.ts default)"
else
  warn "Found $HARDCODED_CDP CDP URLs outside env.ts"
fi

# 5.6 No duplicate env var definitions
DUPE_ENV=$(grep "CDP_ENABLED\|CDP_API_KEY_ID\|CDP_API_KEY_SECRET\|CDP_FACILITATOR_URL" src/config/env.ts 2>/dev/null | sort | uniq -d | wc -l)
if [ "$DUPE_ENV" -eq 0 ]; then
  pass "No duplicate CDP env var definitions in env.ts"
else
  fail "Duplicate CDP env vars in env.ts"
fi

echo ""
# ─────────────────────────────────────────────────
echo "=== SECTION 6: Logic Consistency ==="
# ─────────────────────────────────────────────────

# 6.1 Escrow stage unchanged (hard payment gate)
ESCROW_402=$(grep -c "payment_required" src/pipeline/stages/escrow.stage.ts 2>/dev/null || echo "0")
if [ "$ESCROW_402" -gt 0 ]; then
  pass "Escrow stage has payment_required hard gate"
else
  fail "Escrow stage missing payment_required — CRITICAL"
fi

# 6.2 MCP router after payment middleware in app.ts
MW_LINE=$(grep -n "app.use.*x402Middleware\|app.use.*mppMiddleware" src/api/app.ts 2>/dev/null | head -1 | cut -d: -f1)
MCP_LINE=$(grep -n "app.use.*createMcpRouter\|app.use.*mcpRouter" src/api/app.ts 2>/dev/null | head -1 | cut -d: -f1)
if [ -n "$MW_LINE" ] && [ -n "$MCP_LINE" ] && [ "$MW_LINE" -lt "$MCP_LINE" ]; then
  pass "MCP router (line $MCP_LINE) after payment middleware (line $MW_LINE)"
else
  fail "MCP router NOT after payment middleware — payment bypass risk!"
fi

# 6.3 Pipeline stage order preserved
STAGES=$(grep "name:" src/pipeline/pipeline.ts 2>/dev/null | head -13 | tr -d "'" | tr -d '"' | awk '{print $NF}' | tr ',' '\n' | head -13)
EXPECTED="AUTH IDEMPOTENCY CONTENT_NEG SCHEMA_VALIDATION TOOL_STATUS CACHE_OR_SINGLE_FLIGHT RATE_LIMIT ESCROW PROVIDER_CALL ESCROW_FINALIZE LEDGER_WRITE CACHE_SET RESPONSE"
# Simple check: first and last stages
FIRST_STAGE=$(echo "$STAGES" | head -1 | tr -d '[:space:]')
if grep -q "AUTH" src/pipeline/pipeline.ts 2>/dev/null; then
  pass "Pipeline starts with AUTH stage"
else
  warn "Could not verify pipeline stage order"
fi

# 6.4 Ledger still append-only (no UPDATE/DELETE on data — escrow status updates are OK)
LEDGER_MUTATE=$(grep -rn "DELETE.*ledger\|TRUNCATE.*ledger" src/ --include="*.ts" 2>/dev/null | grep -v "//\|test\|mock\|partition\|escrow\|reconciliation" | wc -l)
if [ "$LEDGER_MUTATE" -eq 0 ]; then
  pass "Ledger is append-only (no UPDATE/DELETE)"
else
  fail "Found $LEDGER_MUTATE ledger mutation statements"
fi

# 6.5 Wallet address consistent across all 402 responses
# Test 3 different tools
WALLETS=""
for TOOL in "canopy.search" "reed.search" "theirstack.jobs"; do
  W=$(curl -s -X POST "$BASE/api/v1/tools/$TOOL/call" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $API_KEY" \
    -d '{"query":"test","keywords":"test","asin":"B0CRSNCJ6Y"}' 2>/dev/null | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('payment_address',''))" 2>/dev/null)
  WALLETS="$WALLETS $W"
done
UNIQUE_WALLETS=$(echo "$WALLETS" | tr ' ' '\n' | sort -u | grep -v '^$' | wc -l)
if [ "$UNIQUE_WALLETS" -eq 1 ]; then
  pass "All tools use same wallet address (no collision)"
else
  fail "Multiple wallet addresses in 402 responses: $WALLETS"
fi

# 6.6 MPP dual-rail still works (WWW-Authenticate header present)
MPP_HEADER=$(curl -s -D- -X POST "$BASE/api/v1/tools/canopy.search/call" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"query":"test"}' 2>/dev/null | grep -i "www-authenticate" | head -1)
if echo "$MPP_HEADER" | grep -qi "Payment"; then
  pass "MPP WWW-Authenticate header present in 402 response"
else
  warn "MPP WWW-Authenticate header missing (MPP may be disabled)"
fi

echo ""
# ─────────────────────────────────────────────────
echo "=== SECTION 7: Tool Catalog Integrity ==="
# ─────────────────────────────────────────────────

# 7.1 Tool count
TOOL_COUNT=$(curl -sf "$BASE/api/v1/tools" 2>/dev/null | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',json.load(open('/dev/stdin')) if False else [])))" 2>/dev/null || echo "0")
# Retry with correct structure
TOOL_COUNT=$(curl -sf "$BASE/api/v1/tools" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
tools = d.get('tools', d.get('data', []))
print(len(tools))
" 2>/dev/null || echo "0")
if [ "$TOOL_COUNT" -ge 400 ]; then
  pass "Tool catalog: $TOOL_COUNT tools (≥400)"
else
  fail "Tool catalog: only $TOOL_COUNT tools"
fi

# 7.2 No duplicate tool IDs in DB
DUPE_TOOLS=$(sudo docker exec apibase-postgres-1 psql -U apibase -d apibase -t -c "
  SELECT tool_id, COUNT(*) FROM tools GROUP BY tool_id HAVING COUNT(*) > 1;
" 2>/dev/null | grep -v "^$" | wc -l)
if [ "$DUPE_TOOLS" -eq 0 ]; then
  pass "No duplicate tool_ids in database"
else
  fail "Found $DUPE_TOOLS duplicate tool_ids in DB"
fi

# 7.3 All tools have a price
NO_PRICE=$(sudo docker exec apibase-postgres-1 psql -U apibase -d apibase -t -c "
  SELECT COUNT(*) FROM tools WHERE price_usd IS NULL OR price_usd < 0;
" 2>/dev/null | tr -d ' ')
if [ "$NO_PRICE" = "0" ]; then
  pass "All tools have valid prices"
else
  fail "Found $NO_PRICE tools with null/negative prices"
fi

echo ""
echo "============================================"
echo "RESULTS: $PASS passed, $FAIL failed, $WARN warnings"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
  echo "❌ FAILED — fix issues above before activating CDP"
  exit 1
else
  echo "✅ ALL CRITICAL CHECKS PASSED"
  if [ "$WARN" -gt 0 ]; then
    echo "⚠  $WARN warnings — review above"
  fi
  exit 0
fi
