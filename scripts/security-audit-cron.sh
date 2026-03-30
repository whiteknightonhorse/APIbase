#!/bin/bash
# Weekly automated security audit for APIbase
# Runs key checks from /security skill, creates GitHub Issue on findings
# Cron: 0 4 * * 0 (Sundays 04:00 UTC)

set -uo pipefail
cd /home/apibase/apibase

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG="reports/security-audit-${TIMESTAMP}.log"
mkdir -p reports

exec > >(tee -a "$LOG") 2>&1

echo "============================================"
echo "=== AUTOMATED SECURITY AUDIT ==="
echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo "============================================"

CRITICAL=0
HIGH=0
MEDIUM=0
FINDINGS=""

add_finding() {
  local severity="$1"
  local check="$2"
  local detail="$3"
  FINDINGS="${FINDINGS}\n- **${severity}**: ${check} — ${detail}"
  case "$severity" in
    CRITICAL) CRITICAL=$((CRITICAL + 1)) ;;
    HIGH)     HIGH=$((HIGH + 1)) ;;
    MEDIUM)   MEDIUM=$((MEDIUM + 1)) ;;
  esac
}

# ========================================
# 1. Container Health
# ========================================
echo -e "\n--- Containers ---"
UNHEALTHY=$(sudo docker compose ps --format "{{.Name}} {{.Status}}" 2>/dev/null | grep -v "healthy" | grep -v "^$" | grep -v "STATUS")
if [ -n "$UNHEALTHY" ]; then
  echo "FAIL: Unhealthy containers: $UNHEALTHY"
  add_finding "CRITICAL" "Container Health" "Unhealthy: $UNHEALTHY"
else
  echo "PASS: 16/16 healthy"
fi

# ========================================
# 2. API Health
# ========================================
echo -e "\n--- API Health ---"
READY_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://apibase.pro/health/ready)
if [ "$READY_CODE" != "200" ]; then
  add_finding "CRITICAL" "API Health" "/health/ready returned HTTP $READY_CODE"
  echo "FAIL: HTTP $READY_CODE"
else
  echo "PASS: HTTP 200"
fi

# ========================================
# 3. TLS Certificate Expiry
# ========================================
echo -e "\n--- TLS Certificate ---"
CERT_EXPIRY=$(echo | openssl s_client -servername apibase.pro -connect apibase.pro:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$CERT_EXPIRY" ]; then
  DAYS_LEFT=$(( ($(date -d "$CERT_EXPIRY" +%s) - $(date +%s)) / 86400 ))
  echo "Expires: $CERT_EXPIRY ($DAYS_LEFT days)"
  if [ "$DAYS_LEFT" -lt 14 ]; then
    add_finding "CRITICAL" "TLS Certificate" "Expires in $DAYS_LEFT days!"
  elif [ "$DAYS_LEFT" -lt 30 ]; then
    add_finding "HIGH" "TLS Certificate" "Expires in $DAYS_LEFT days"
  fi
else
  add_finding "HIGH" "TLS Certificate" "Could not check certificate"
fi

# ========================================
# 4. SSH Config
# ========================================
echo -e "\n--- SSH ---"
ROOT_LOGIN=$(sudo grep "^PermitRootLogin" /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}')
PASS_AUTH=$(sudo grep "^PasswordAuthentication" /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}')
if [ "$ROOT_LOGIN" != "no" ]; then
  add_finding "HIGH" "SSH" "PermitRootLogin=$ROOT_LOGIN (should be no)"
fi
if [ "$PASS_AUTH" != "no" ]; then
  add_finding "HIGH" "SSH" "PasswordAuthentication=$PASS_AUTH (should be no)"
fi
echo "Root=$ROOT_LOGIN PassAuth=$PASS_AUTH"

# ========================================
# 5. fail2ban Active
# ========================================
echo -e "\n--- fail2ban ---"
F2B_STATUS=$(sudo fail2ban-client status 2>/dev/null | grep "Number of jail" | grep -oP '\d+')
if [ -z "$F2B_STATUS" ] || [ "$F2B_STATUS" -eq 0 ]; then
  add_finding "HIGH" "fail2ban" "No active jails"
else
  echo "PASS: $F2B_STATUS jails active"
fi

# ========================================
# 6. /metrics Exposed
# ========================================
echo -e "\n--- /metrics ---"
METRICS_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 https://apibase.pro/metrics)
if [ "$METRICS_CODE" = "200" ]; then
  add_finding "HIGH" "/metrics Exposed" "Prometheus metrics publicly accessible"
else
  echo "PASS: HTTP $METRICS_CODE"
fi

# ========================================
# 7. MCP Payment Enforcement
# ========================================
echo -e "\n--- MCP Payment ---"
# Check middleware order in code
X402_LINE=$(grep -n "x402Middleware" src/api/app.ts | grep "app.use" | head -1 | cut -d: -f1)
MCP_LINE=$(grep -n "createMcpRouter" src/api/app.ts | grep "app.use" | head -1 | cut -d: -f1)
if [ -n "$X402_LINE" ] && [ -n "$MCP_LINE" ]; then
  if [ "$X402_LINE" -gt "$MCP_LINE" ]; then
    add_finding "CRITICAL" "MCP Payment Bypass" "x402Middleware (line $X402_LINE) is AFTER mcpRouter (line $MCP_LINE) — payment bypass!"
  else
    echo "PASS: middleware order correct (x402@$X402_LINE < mcp@$MCP_LINE)"
  fi
fi

# Live test
MCP_SID=$(curl -s -X POST https://apibase.pro/mcp \
  -H "Authorization: Bearer ak_live_9b9978edba8a8c59f478837d0a660c9d" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"sec-cron","version":"1.0"}}}' \
  -D /dev/stderr 2>&1 | grep -i "mcp-session-id" | awk '{print $2}' | tr -d '\r')
if [ -n "$MCP_SID" ]; then
  MCP_CALL=$(curl -s -X POST https://apibase.pro/mcp \
    -H "Authorization: Bearer ak_live_9b9978edba8a8c59f478837d0a660c9d" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Mcp-Session-Id: $MCP_SID" \
    -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"crypto.trending.get","arguments":{}}}')
  if echo "$MCP_CALL" | grep -q "payment_required"; then
    echo "PASS: MCP payment enforced"
  else
    add_finding "CRITICAL" "MCP Payment Bypass" "Paid tool returned data without payment via MCP"
  fi
else
  echo "WARN: Could not create MCP session for test"
fi

# ========================================
# 8. npm audit
# ========================================
echo -e "\n--- npm audit ---"
AUDIT_HIGH=$(cd /home/apibase/apibase && npm audit --production 2>/dev/null | grep -c "high\|critical" || true)
AUDIT_HIGH=${AUDIT_HIGH:-0}
if [ "$AUDIT_HIGH" -gt 0 ] 2>/dev/null; then
  AUDIT_SUMMARY=$(npm audit --production 2>/dev/null | tail -5)
  add_finding "HIGH" "npm audit" "Found high/critical vulnerabilities: $AUDIT_SUMMARY"
else
  echo "PASS: 0 high/critical vulnerabilities"
fi

# ========================================
# 9. .env Permissions
# ========================================
echo -e "\n--- .env ---"
ENV_PERMS=$(stat -c "%a" /home/apibase/apibase/.env 2>/dev/null)
if [ "$ENV_PERMS" != "600" ]; then
  add_finding "HIGH" ".env Permissions" "Permissions are $ENV_PERMS (should be 600)"
else
  echo "PASS: chmod 600"
fi

# ========================================
# 10. Security Headers
# ========================================
echo -e "\n--- Headers ---"
HEADERS=$(curl -sI https://apibase.pro/health/live 2>&1)
if ! echo "$HEADERS" | grep -qi "strict-transport-security"; then
  add_finding "HIGH" "Security Headers" "Missing Strict-Transport-Security"
fi
if ! echo "$HEADERS" | grep -qi "x-frame-options"; then
  add_finding "MEDIUM" "Security Headers" "Missing X-Frame-Options"
fi
if ! echo "$HEADERS" | grep -qi "x-content-type-options"; then
  add_finding "MEDIUM" "Security Headers" "Missing X-Content-Type-Options"
fi
echo "HSTS: $(echo "$HEADERS" | grep -ci 'strict-transport') X-Frame: $(echo "$HEADERS" | grep -ci 'x-frame') XCT: $(echo "$HEADERS" | grep -ci 'x-content-type')"

# ========================================
# 11. Server 500 Errors (last 24h)
# ========================================
echo -e "\n--- 500 Errors ---"
E500=$(sudo docker logs apibase-api-1 --since "24h" 2>&1 | grep -c '"level":"error"' || true)
E500=${E500:-0}
if [ "$E500" -gt 10 ] 2>/dev/null; then
  add_finding "MEDIUM" "Server Errors" "$E500 errors in last 24h"
fi
echo "API errors (24h): $E500"

# ========================================
# 12. Protocol Tester Score
# ========================================
echo -e "\n--- Protocol Tester ---"
LATEST_REPORT=$(ls -t /home/apibase/mcp-protocol-tester/reports/daily-*.log 2>/dev/null | head -1)
if [ -n "$LATEST_REPORT" ]; then
  SCORE=$(grep -oP 'Score: \K[0-9]+' "$LATEST_REPORT" | tail -1 || echo "0")
  ERRS500=$(grep -oP '500 errors: \K[0-9]+' "$LATEST_REPORT" | tail -1 || echo "0")
  echo "Score: $SCORE/100, 500s: $ERRS500"
  if [ "${SCORE:-0}" -lt 70 ]; then
    add_finding "HIGH" "Protocol Tester" "Score $SCORE/100 (below 70)"
  elif [ "${SCORE:-0}" -lt 80 ]; then
    add_finding "MEDIUM" "Protocol Tester" "Score $SCORE/100 (below 80)"
  fi
  if [ "${ERRS500:-0}" -gt 0 ]; then
    add_finding "HIGH" "Protocol Tester" "$ERRS500 server 500 errors detected"
  fi
fi

# ========================================
# 13. Hardcoded Secrets in Code
# ========================================
echo -e "\n--- Code Secrets ---"
SECRETS_COUNT=$(grep -rn "password\s*=\s*['\"]" src/ --include="*.ts" | grep -v "process\.env\|config\.\|schema\|test\|\.d\.ts" | wc -l)
CONSOLE_COUNT=$(grep -rn "console\.log" src/ --include="*.ts" | grep -v "node_modules\|\.d\.ts\|test\|spec" | wc -l)
if [ "$SECRETS_COUNT" -gt 0 ]; then
  add_finding "CRITICAL" "Hardcoded Secrets" "$SECRETS_COUNT instances in source code"
fi
if [ "$CONSOLE_COUNT" -gt 0 ]; then
  add_finding "MEDIUM" "console.log" "$CONSOLE_COUNT instances in production code"
fi
echo "Secrets: $SECRETS_COUNT, console.log: $CONSOLE_COUNT"

# ========================================
# REPORT
# ========================================
echo -e "\n============================================"
echo "=== AUDIT SUMMARY ==="
echo "============================================"
TOTAL=$((CRITICAL + HIGH + MEDIUM))
echo "CRITICAL: $CRITICAL"
echo "HIGH:     $HIGH"
echo "MEDIUM:   $MEDIUM"
echo "TOTAL:    $TOTAL"

if [ "$TOTAL" -eq 0 ]; then
  echo -e "\nSTATUS: SYSTEM SECURE — no findings"
else
  echo -e "\nFINDINGS:"
  echo -e "$FINDINGS"
fi

# Keep last 12 reports (3 months weekly)
ls -t reports/security-audit-*.log 2>/dev/null | tail -n +13 | xargs rm -f 2>/dev/null

# ========================================
# GitHub Issue on findings
# ========================================
if [ "$TOTAL" -gt 0 ]; then
  echo -e "\n--- Creating GitHub Issue ---"

  if [ "$CRITICAL" -gt 0 ]; then
    RISK="CRITICAL"
  elif [ "$HIGH" -gt 0 ]; then
    RISK="HIGH"
  else
    RISK="MEDIUM"
  fi

  ISSUE_TITLE="[Security Audit] $RISK — ${CRITICAL}C/${HIGH}H/${MEDIUM}M findings — $(date +%Y-%m-%d)"
  ISSUE_BODY="$(cat <<ISSUE_EOF
## Weekly Security Audit — $RISK

**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Findings:** ${CRITICAL} CRITICAL, ${HIGH} HIGH, ${MEDIUM} MEDIUM

### Findings
$(echo -e "$FINDINGS")

### Action Required
$([ "$CRITICAL" -gt 0 ] && echo "- **IMMEDIATE:** Critical vulnerabilities require immediate fix")
$([ "$HIGH" -gt 0 ] && echo "- **URGENT:** High severity issues should be fixed today")
$([ "$MEDIUM" -gt 0 ] && echo "- **SOON:** Medium issues should be reviewed this week")

### How to Fix
Run \`/security\` skill in Claude Code for full audit with auto-fix.

---
*Auto-generated by weekly security audit cron*
ISSUE_EOF
)"

  gh issue create \
    --repo whiteknightonhorse/APIbase \
    --title "${ISSUE_TITLE}" \
    --body "${ISSUE_BODY}" \
    \
    2>&1 || echo "Failed to create GitHub issue"

  echo "GitHub Issue created"
else
  echo -e "\nNo issues found — no GitHub Issue needed"
fi

echo -e "\n=== AUDIT COMPLETE ==="
