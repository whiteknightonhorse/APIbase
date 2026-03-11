---
name: security
description: "Full security audit and hardening skill for APIbase. Checks all 5 defense layers (Network, Application, Infrastructure, Payment, Automation), analyzes vulnerabilities, applies safe fixes, builds, and deploys. Use /security to run a full audit, or /security <zone> to check a specific zone."
user-invocable: true
argument-hint: "[all | network | application | infrastructure | payment | containers | secrets | ssh | nginx | database | redis]"
allowed-tools: Read, Grep, Glob, Bash, Edit, Write, Agent
---

# APIbase — Security Audit & Hardening Skill

Full security audit, vulnerability detection, and auto-fix workflow for the APIbase 16-container Docker stack.
Based on spec §7 (5-layer defense model) and §12.185 (65+ invariants).

## Production Context

| Service | URL |
|---------|-----|
| Domain | `https://apibase.pro` |
| Health | `https://apibase.pro/health/ready` |
| Grafana | `http://127.0.0.1:3940` |
| Prometheus | `http://127.0.0.1:9090` |

## 5 Defense Layers (Spec §7)

1. **Network** — Firewall, SSH, Nginx, TLS, fail2ban
2. **Application** — Auth, rate limiting, input validation, headers, CORS
3. **Infrastructure** — Docker containers, volumes, secrets, backups
4. **Payment** — Escrow, ledger integrity, x402 flow
5. **Automation** — Monitoring, alerting, auto-recovery

---

## Execution Workflow

When invoked, execute ALL steps in order. If `$ARGUMENTS` specifies a zone, check only that zone. Default (`all` or empty): check everything.

### Step 1: System Overview

```bash
# Container health
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}"

# API health
curl -s https://apibase.pro/health/ready

# Uptime
uptime
```

---

### Step 2: Network Security (Layer 1)

#### 2a. Firewall (UFW/iptables)

```bash
# UFW status
sudo ufw status verbose 2>/dev/null || echo "UFW not active"

# Open ports (external)
sudo ss -tlnp | grep -v 127.0.0.1 | grep -v ::1
```

**Expected open ports:** 22 (SSH), 80 (HTTP→HTTPS redirect), 443 (HTTPS), 8880 (Docker Nginx)
Any other open port = VULNERABILITY.

#### 2b. SSH Hardening

```bash
# SSH configuration
sudo grep -E "^(PermitRootLogin|PasswordAuthentication|PubkeyAuthentication|Port|MaxAuthTries|AllowUsers|Protocol|X11Forwarding|PermitEmptyPasswords)" /etc/ssh/sshd_config 2>/dev/null

# Active SSH sessions
who

# SSH auth failures (last 100 lines)
sudo journalctl -u ssh --no-pager -n 100 2>/dev/null | grep -iE "failed|invalid|refused|break-in" | tail -20
```

**Required:**
- `PermitRootLogin no` (not `prohibit-password`)
- `PasswordAuthentication no`
- `PubkeyAuthentication yes`
- `MaxAuthTries 3`
- `X11Forwarding no`
- `PermitEmptyPasswords no`

#### 2c. fail2ban

```bash
# fail2ban status
sudo fail2ban-client status 2>/dev/null
sudo fail2ban-client status sshd 2>/dev/null

# Check for nginx/API jails
ls /etc/fail2ban/jail.d/ 2>/dev/null
ls /etc/fail2ban/filter.d/ 2>/dev/null | grep -iE "nginx|api|docker"
```

**Required:** SSH jail active. Nginx jail recommended.

#### 2d. TLS/SSL

```bash
# Certificate expiry
echo | openssl s_client -servername apibase.pro -connect apibase.pro:443 2>/dev/null | openssl x509 -noout -dates -subject 2>/dev/null

# TLS version and ciphers
curl -sI https://apibase.pro 2>/dev/null | head -5
```

#### 2e. Nginx Security Headers

```bash
# Check response headers
curl -sI https://apibase.pro/health/live 2>&1 | grep -iE "strict-transport|x-frame|x-content|content-security|x-xss|referrer-policy|permissions-policy|server"

# Nginx config — security headers
sudo docker exec apibase-nginx-1 cat /etc/nginx/nginx.conf 2>/dev/null | grep -iE "add_header|server_tokens|ssl_protocol|ssl_cipher" | head -20
```

**Required headers (spec §12.239):**
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Content-Security-Policy: default-src 'none'`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `server_tokens off` (hide Nginx version)

---

### Step 3: Application Security (Layer 2)

#### 3a. API Key Security

```bash
# Verify API keys are hashed in DB (not plaintext)
PG_IP=$(sudo docker inspect apibase-postgres-1 2>/dev/null | python3 -c "import sys,json; c=json.load(sys.stdin)[0]; nets=c['NetworkSettings']['Networks']; print(list(nets.values())[0]['IPAddress'])")

sudo docker exec apibase-postgres-1 psql -U apibase -d apibase -c "SELECT id, LEFT(key_hash, 20) || '...' as key_hash_preview, LENGTH(key_hash) as hash_length FROM api_keys LIMIT 5;" 2>/dev/null
```

**Required:** Keys stored as SHA-256 hashes (64 char hex), NOT plaintext.

#### 3b. Rate Limiting

```bash
# Check rate limit config in code
grep -r "rateLimit\|rate_limit\|rateLimiter" /home/apibase/apibase/src/ --include="*.ts" -l 2>/dev/null

# Redis rate limit keys
sudo docker exec apibase-redis-1 redis-cli KEYS "rl:*" 2>/dev/null | head -10
sudo docker exec apibase-redis-1 redis-cli KEYS "rate:*" 2>/dev/null | head -10
```

#### 3c. Input Validation (Zod Schemas)

```bash
# Count Zod schemas
grep -r "z\.object" /home/apibase/apibase/src/schemas/ --include="*.ts" -l 2>/dev/null | wc -l

# Check .strip() is used on all schemas
grep -r "\.strip()" /home/apibase/apibase/src/schemas/ --include="*.ts" 2>/dev/null | wc -l
```

#### 3d. Log Masking

```bash
# Check sensitive data masking
grep -rn "mask\|redact\|sanitize\|censor" /home/apibase/apibase/src/ --include="*.ts" | head -20

# Check no secrets in logs
sudo docker logs apibase-api-1 --tail=200 2>&1 | grep -iE "api[_-]?key|secret|password|token|credential|bearer" | grep -v "key_hash\|api_key_id\|masked\|redact\|x-api-key" | head -10
```

#### 3e. CORS Configuration

```bash
# Check CORS settings
grep -rn "cors\|CORS\|Access-Control" /home/apibase/apibase/src/ --include="*.ts" | head -10
```

#### 3f. Security Middleware

```bash
# Check for security middleware (helmet, etc.)
grep -rn "helmet\|security.*middleware\|x-powered-by" /home/apibase/apibase/src/ --include="*.ts" | head -10

# Check Express trust proxy
grep -rn "trust.proxy" /home/apibase/apibase/src/ --include="*.ts" | head -5
```

---

### Step 4: Infrastructure Security (Layer 3)

#### 4a. Container Hardening (Spec §12.219)

```bash
# Check container security options
for container in apibase-api-1 apibase-worker-1 apibase-outbox-worker-1 apibase-nginx-1 apibase-postgres-1 apibase-redis-1; do
  echo "=== $container ==="
  sudo docker inspect "$container" 2>/dev/null | python3 -c "
import sys,json
c = json.load(sys.stdin)[0]
hc = c.get('HostConfig', {})
print(f\"  ReadOnly: {hc.get('ReadonlyRootfs', False)}\")
print(f\"  Privileged: {hc.get('Privileged', False)}\")
print(f\"  CapDrop: {hc.get('CapDrop', [])}\")
print(f\"  CapAdd: {hc.get('CapAdd', [])}\")
print(f\"  SecurityOpt: {hc.get('SecurityOpt', [])}\")
print(f\"  User: {c.get('Config', {}).get('User', 'root')}\")
" 2>/dev/null
done
```

**Required (spec §12.219):**
- `read_only: true` for stateless containers (api, worker, outbox)
- `cap_drop: ALL` on all containers
- `no-new-privileges: true`
- Non-root user (`appuser:1001` or service-specific)
- NOT privileged

#### 4b. Docker Network Isolation

```bash
# List Docker networks
sudo docker network ls --format "{{.Name}}\t{{.Driver}}\t{{.Scope}}"

# Check containers are on same internal network
sudo docker network inspect apibase_app 2>/dev/null | python3 -c "
import sys,json
n = json.load(sys.stdin)[0]
containers = n.get('Containers', {})
print(f'Network: {n[\"Name\"]}')
print(f'Internal: {n.get(\"Internal\", False)}')
print(f'Containers: {len(containers)}')
for cid, info in containers.items():
    print(f'  - {info[\"Name\"]}: {info[\"IPv4Address\"]}')
" 2>/dev/null
```

#### 4c. Volume Security

```bash
# Check volumes (named only, no host paths)
sudo docker volume ls --format "{{.Name}}\t{{.Driver}}"

# Check docker-compose for host mounts
grep -n "volumes:" /home/apibase/apibase/docker-compose*.yml
grep -n "\./" /home/apibase/apibase/docker-compose*.yml | grep -v "#"
```

#### 4d. Secrets Management

```bash
# Check .env permissions
ls -la /home/apibase/apibase/.env 2>/dev/null

# Check .env is in .gitignore
grep "\.env" /home/apibase/apibase/.gitignore 2>/dev/null

# Check no secrets in committed files
grep -rn "PROVIDER_KEY\|CLIENT_SECRET\|API_KEY\|PASSWORD" /home/apibase/apibase/src/ --include="*.ts" | grep -v "process.env\|env\.\|config\.\|\.env\|schema\|example\|test" | head -10

# Check .env is not in git history (recent commits)
cd /home/apibase/apibase && git log --oneline --diff-filter=A -- .env 2>/dev/null | head -5
```

**Required:** `.env` chmod 600, in .gitignore, no secrets in source code.

---

### Step 5: Database Security (Layer 3b)

```bash
PG_IP=$(sudo docker inspect apibase-postgres-1 2>/dev/null | python3 -c "import sys,json; c=json.load(sys.stdin)[0]; nets=c['NetworkSettings']['Networks']; print(list(nets.values())[0]['IPAddress'])")

# PostgreSQL auth method
sudo docker exec apibase-postgres-1 cat /var/lib/postgresql/data/pg_hba.conf 2>/dev/null | grep -v "^#" | grep -v "^$"

# Check for superuser connections
sudo docker exec apibase-postgres-1 psql -U apibase -d apibase -c "SELECT usename, usesuper FROM pg_user;" 2>/dev/null

# Check connection encryption
sudo docker exec apibase-postgres-1 psql -U apibase -d apibase -c "SHOW ssl;" 2>/dev/null

# Active connections
sudo docker exec apibase-postgres-1 psql -U apibase -d apibase -c "SELECT count(*) as total, state FROM pg_stat_activity GROUP BY state;" 2>/dev/null

# Check for exposed port
sudo ss -tlnp | grep 5432
```

**Required:** PostgreSQL NOT exposed to host network. Internal Docker network only.

---

### Step 6: Redis Security (Layer 3c)

```bash
# Redis auth
sudo docker exec apibase-redis-1 redis-cli CONFIG GET requirepass 2>/dev/null

# Redis bind address
sudo docker exec apibase-redis-1 redis-cli CONFIG GET bind 2>/dev/null

# Redis protected mode
sudo docker exec apibase-redis-1 redis-cli CONFIG GET protected-mode 2>/dev/null

# Check for exposed port
sudo ss -tlnp | grep 6379

# Redis memory info
sudo docker exec apibase-redis-1 redis-cli INFO memory 2>/dev/null | grep -E "used_memory_human|maxmemory_human|maxmemory_policy"
```

**Required:** Redis NOT exposed to host. If on Docker internal network only, no auth is acceptable (spec). If exposed, auth is MANDATORY.

---

### Step 7: Payment Security (Layer 4)

```bash
# Escrow configuration
grep -rn "escrow\|ESCROW" /home/apibase/apibase/src/ --include="*.ts" | grep -v node_modules | head -20

# Ledger append-only check
grep -rn "DELETE\|UPDATE.*ledger\|TRUNCATE.*ledger" /home/apibase/apibase/src/ --include="*.ts" | grep -v node_modules | grep -v "// \|test\|mock" | head -10

# x402 configuration
grep -rn "x402\|X402\|payment.*network\|chain.*id\|sepolia\|mainnet" /home/apibase/apibase/src/ --include="*.ts" | head -10

# Check escrow reconciliation
grep -rn "reconcil\|orphan.*escrow\|stale.*escrow" /home/apibase/apibase/src/ --include="*.ts" | head -10
```

**Required:**
- Escrow BEFORE provider call
- Refund on failure
- Ledger append-only (no UPDATE/DELETE)
- Atomic ESCROW_FINALIZE + LEDGER_WRITE in one PG transaction

---

### Step 8: Monitoring & Alerting Security (Layer 5)

```bash
# Prometheus targets
curl -s 'http://127.0.0.1:9090/api/v1/query?query=up' 2>/dev/null | python3 -c "
import sys,json
data = json.load(sys.stdin)
for r in data.get('data',{}).get('result',[]):
    job = r['metric'].get('job','?')
    val = r['value'][1]
    status = 'UP' if val == '1' else 'DOWN'
    print(f'  {job}: {status}')
" 2>/dev/null

# Active alerts
curl -s http://127.0.0.1:9090/api/v1/alerts 2>/dev/null | python3 -c "
import sys,json
data = json.load(sys.stdin)
alerts = data.get('data',{}).get('alerts',[])
firing = [a for a in alerts if a.get('state') == 'firing']
print(f'Total alerts: {len(alerts)}, Firing: {len(firing)}')
for a in firing:
    name = a.get('labels',{}).get('alertname','?')
    print(f'  FIRING: {name}')
" 2>/dev/null

# Check Prometheus/Grafana not exposed externally
sudo ss -tlnp | grep -E "9090|3940"
```

**Required:** Prometheus (9090) and Grafana (3940) bound to 127.0.0.1 ONLY.

---

### Step 9: Dependency Security

```bash
# Check for known vulnerabilities
cd /home/apibase/apibase && npm audit --production 2>/dev/null | tail -20

# Check outdated critical packages
npm outdated 2>/dev/null | grep -iE "express|prisma|pino|bullmq|zod|cors" | head -10
```

---

### Step 10: Recent Attack Detection

```bash
# Suspicious API requests (last 500 lines)
sudo docker logs apibase-nginx-1 --tail=500 2>&1 | grep -iE "sqlmap|union.*select|<script|\.\.\/|etc/passwd|eval\(|exec\(" | tail -20

# 4xx/5xx surge detection
sudo docker logs apibase-nginx-1 --tail=1000 2>&1 | grep -oP '"status":\s*\K[0-9]+' 2>/dev/null | sort | uniq -c | sort -rn | head -10

# Failed auth attempts
sudo docker logs apibase-api-1 --tail=500 2>&1 | grep -iE "unauthorized|forbidden|invalid.*key|auth.*fail" | tail -20

# Brute force detection (same IP, many requests)
sudo docker logs apibase-nginx-1 --tail=2000 2>&1 | grep -oP '"remote_addr":"[^"]+' 2>/dev/null | sort | uniq -c | sort -rn | head -10
```

---

### Step 11: Analyze and Report

Produce a structured security report:

```
=== APIbase Security Audit Report ===
Date: YYYY-MM-DD HH:MM UTC

OVERALL RISK LEVEL: [LOW / MEDIUM / HIGH / CRITICAL]

LAYER 1 — NETWORK:
  Firewall: [OK/ISSUE]
  SSH: [OK/ISSUE]
  TLS: [OK/ISSUE]
  fail2ban: [OK/ISSUE]
  Headers: [OK/ISSUE]

LAYER 2 — APPLICATION:
  API Keys: [OK/ISSUE]
  Rate Limiting: [OK/ISSUE]
  Input Validation: [OK/ISSUE]
  Log Masking: [OK/ISSUE]
  CORS: [OK/ISSUE]

LAYER 3 — INFRASTRUCTURE:
  Containers: [OK/ISSUE]
  Network Isolation: [OK/ISSUE]
  Volumes: [OK/ISSUE]
  Secrets: [OK/ISSUE]
  Database: [OK/ISSUE]
  Redis: [OK/ISSUE]

LAYER 4 — PAYMENT:
  Escrow: [OK/ISSUE]
  Ledger: [OK/ISSUE]
  x402: [OK/ISSUE]

LAYER 5 — MONITORING:
  Prometheus: [OK/ISSUE]
  Alerts: [OK/ISSUE]
  Exposure: [OK/ISSUE]

VULNERABILITIES FOUND:
  [CRITICAL] ...
  [HIGH] ...
  [MEDIUM] ...
  [LOW] ...

ATTACK INDICATORS:
  [any suspicious patterns detected]
```

---

### Step 12: Fix Vulnerabilities (if any)

For each vulnerability found, ordered by severity (CRITICAL first):

1. **Assess** — Can this be fixed without breaking business logic?
2. **Categorize**:
   - Config fix → apply, restart service
   - Code fix → fix in source, verify with `npx tsc --noEmit`, build & deploy
   - Infrastructure fix → apply directly (firewall, SSH, fail2ban)
   - Manual action → report to user (e.g., commercial/billing changes)
3. **Fix** — Apply the safest fix
4. **Verify** — Confirm fix worked

**SAFETY RULES:**
- NEVER fix something if it could break the 13-stage pipeline
- NEVER change auth logic without explicit approval
- NEVER modify financial/escrow code without explicit approval
- NEVER expose new ports
- NEVER weaken existing security
- If unsure about a fix → report to user, do NOT apply

---

### Step 13: Build & Deploy (if fixes applied)

Only if code changes were made:

```bash
# Type check
npx tsc --noEmit 2>&1 | grep "src/" || echo "No errors"

# Build affected services
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml build api worker outbox-worker

# Deploy
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d api worker outbox-worker

# Wait and verify
sleep 5
curl -s https://apibase.pro/health/ready
```

---

### Step 14: Post-Fix Verification

```bash
# Verify no new errors
sudo docker logs apibase-api-1 --tail=50 2>&1 | grep -iE '"level":"(error|fatal)"' | wc -l

# Re-run failed checks
# (re-execute specific checks from above that previously failed)
```

Report final status: **SYSTEM SECURE** or **ISSUES REMAINING** with details.

---

## Vulnerability Classification

| Severity | Action | Examples |
|----------|--------|----------|
| CRITICAL | Immediate fix | Exposed secrets, open DB port, no auth on external service, RCE |
| HIGH | Fix now | Missing security headers, weak SSH config, no fail2ban |
| MEDIUM | Fix soon | Missing Content-Security-Policy, outdated dependencies with CVEs |
| LOW | Monitor | Redis no auth (internal network), verbose error messages |
| INFO | No action | Security best practice already met |

## Prohibited Actions

- Never log or display API keys, secrets, or credentials in output
- Never modify PostgreSQL data directly
- Never expose internal services (Redis, Postgres, Prometheus) externally
- Never disable rate limiting
- Never weaken TLS configuration
- Never add passwordless authentication
- Never skip escrow for paid requests
- Never modify the 13-stage pipeline order

## Spec References

| Topic | Section |
|-------|---------|
| Security Architecture (5 layers) | §7 |
| API Key Format & Hashing | §12.60 |
| Log Masking | §12.92 |
| Container Security | §12.219 |
| Graceful Shutdown | §12.230 |
| System Invariants (65+) | §12.185 |
| Rate Limiting (3 layers) | §12.172 |
| Escrow Flow | §12.154 |
| Error Codes | §12.243 |
| Nginx Config Registry | §12.239 |
| Port Mapping | §12.245 |
| Environment Variables | §12.238 |
