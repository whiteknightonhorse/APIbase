---
name: logs
description: "System health and log analysis skill for APIbase. Checks all 16 containers, analyzes logs for errors/warnings, diagnoses issues, applies fixes, builds, and deploys. Use /logs to run a full system check, or /logs <service> to check a specific service."
user-invocable: true
argument-hint: "[all | api | worker | outbox | nginx | postgres | redis | prometheus | grafana | loki | promtail | alertmanager]"
allowed-tools: Read, Grep, Glob, Bash, Edit, Write, Agent
---

# APIbase — System Logs & Health Analysis Skill

Full-stack log analysis, error detection, and auto-fix workflow for the APIbase 16-container Docker stack.

## Production URLs

| Service | URL |
|---------|-----|
| Health (live) | `https://apibase.pro/health/live` |
| Health (ready) | `https://apibase.pro/health/ready` |
| Grafana | `http://127.0.0.1:3940` |
| Prometheus | `http://127.0.0.1:9090` |

## Containers (16 total)

### Base (6)
| Container | Service | Port | Log Format |
|-----------|---------|------|------------|
| `apibase-api-1` | API server | 3000 | Pino JSON |
| `apibase-worker-1` | BullMQ worker | 3001 | Pino JSON |
| `apibase-outbox-worker-1` | Outbox processor | 3002 | Pino JSON |
| `apibase-postgres-1` | PostgreSQL 16.2 | 5432 | PostgreSQL log |
| `apibase-redis-1` | Redis 7.2 | 6379 | Redis log |
| `apibase-nginx-1` | Nginx reverse proxy | 80 | JSON access + stderr |

### Production (10)
| Container | Service | Port | Log Format |
|-----------|---------|------|------------|
| `apibase-prometheus-1` | Prometheus | 9090 | Text |
| `apibase-grafana-1` | Grafana | 3940 | Text |
| `apibase-loki-1` | Loki | 3100 | Text |
| `apibase-promtail-1` | Promtail | 9080 | Text |
| `apibase-alertmanager-1` | Alertmanager | 9093 | Text |
| `apibase-postgres_exporter-1` | PG exporter | 9187 | Text |
| `apibase-redis_exporter-1` | Redis exporter | 9121 | Text |
| `apibase-nginx_exporter-1` | Nginx exporter | 9113 | Text |
| `apibase-postgres_backup-1` | PG backup | 8080 | Text |
| `apibase-node_exporter-1` | Node exporter | 9100 | Text |

---

## Execution Workflow

When invoked, execute ALL steps in order.

### Step 1: Container Health Overview

Check all containers are running and healthy:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}"
```

Report any containers that are NOT "Up" or NOT "healthy".

### Step 2: Health Endpoints

```bash
# API readiness
curl -s https://apibase.pro/health/ready

# Worker health (internal)
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api curl -s http://worker:3001/worker/health 2>/dev/null

# Outbox health (internal)
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api curl -s http://outbox-worker:3002/outbox/health 2>/dev/null
```

### Step 3: Analyze Logs

Check logs for each service group. If `$ARGUMENTS` specifies a service, check only that service.
Default (`all` or empty): check all services.

**Critical services (always check):**

```bash
# API server — last 200 lines, filter errors and warnings
sudo docker logs apibase-api-1 --tail=200 2>&1 | grep -iE '"level":"(error|warn|fatal)"' | tail -30

# Worker
sudo docker logs apibase-worker-1 --tail=200 2>&1 | grep -iE '"level":"(error|warn|fatal)"' | tail -20

# Outbox worker
sudo docker logs apibase-outbox-worker-1 --tail=200 2>&1 | grep -iE '"level":"(error|warn|fatal)"' | tail -20

# PostgreSQL
sudo docker logs apibase-postgres-1 --tail=200 2>&1 | grep -iE 'error|fatal|panic|deadlock' | tail -20

# Redis
sudo docker logs apibase-redis-1 --tail=200 2>&1 | grep -iE 'error|warning|oom|rejected' | tail -20

# Nginx
sudo docker logs apibase-nginx-1 --tail=200 2>&1 | grep -iE 'error|emerg|crit|alert' | tail -20
```

**Monitoring services (check for issues):**

```bash
# Prometheus
sudo docker logs apibase-prometheus-1 --tail=100 2>&1 | grep -iE 'error|warn|fail' | tail -10

# Loki
sudo docker logs apibase-loki-1 --tail=100 2>&1 | grep -iE 'error|warn|fail' | tail -10

# Promtail
sudo docker logs apibase-promtail-1 --tail=100 2>&1 | grep -iE 'error|warn|fail' | tail -10

# Grafana
sudo docker logs apibase-grafana-1 --tail=100 2>&1 | grep -iE 'error|warn|fail' | tail -10

# Alertmanager
sudo docker logs apibase-alertmanager-1 --tail=100 2>&1 | grep -iE 'error|warn|fail' | tail -10
```

### Step 4: Check Prometheus Alerts

```bash
# Active alerts
curl -s http://127.0.0.1:9090/api/v1/alerts 2>/dev/null | python3 -m json.tool 2>/dev/null | head -50

# Target health
curl -s 'http://127.0.0.1:9090/api/v1/query?query=up' 2>/dev/null | python3 -c "
import sys,json
data = json.load(sys.stdin)
for r in data.get('data',{}).get('result',[]):
    job = r['metric'].get('job','?')
    val = r['value'][1]
    status = 'UP' if val == '1' else 'DOWN'
    print(f'  {job}: {status}')
" 2>/dev/null
```

### Step 5: Resource Usage

```bash
sudo docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null | head -20
```

### Step 6: Disk Usage

```bash
df -h / | tail -1
sudo docker system df 2>/dev/null
```

### Step 7: Analyze and Report

After collecting all data, produce a structured report:

```
=== APIbase System Health Report ===

Containers: X/16 healthy
Health endpoints: API [OK/FAIL], Worker [OK/FAIL], Outbox [OK/FAIL]

ERRORS FOUND:
  [list each error with container, timestamp, message]

WARNINGS:
  [list each warning]

RESOURCE CONCERNS:
  [high CPU/memory/disk usage]

PROMETHEUS ALERTS:
  [active alerts if any]
```

### Step 8: Fix Errors (if any)

For each error found:

1. **Diagnose** — identify root cause by reading relevant source code
2. **Categorize** — is it:
   - Code bug → fix in source, build & deploy
   - Config issue → fix config, restart service
   - Resource issue → report to user (manual action needed)
   - Transient error → log and monitor, no action needed
   - Known/expected → ignore (e.g., test agent UUID error in seed script)
3. **Fix** — apply the fix
4. **Verify** — ensure the fix compiles (`npx tsc --noEmit`)

### Step 9: Build & Deploy (if fixes applied)

Only if code changes were made:

```bash
# Build
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml build api

# Deploy
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d api

# Wait for readiness
sleep 5
curl -s https://apibase.pro/health/ready
```

### Step 10: Post-Fix Verification

After deploy, re-run the error checks from Step 3 to confirm errors are resolved.

```bash
# Verify no new errors in last 50 lines
sudo docker logs apibase-api-1 --tail=50 2>&1 | grep -iE '"level":"(error|fatal)"' | wc -l
```

Report final status: **SYSTEM OK** or **ISSUES REMAINING** with details.

---

## Error Classification (§12.243)

| Severity | Action | Examples |
|----------|--------|---------|
| FATAL | Immediate fix + deploy | Process crash, DB connection lost, config validation fail |
| ERROR | Diagnose + fix if code bug | Provider call failure, escrow error, pipeline stage failure |
| WARN | Monitor, fix if recurring | Rate limit hit, cache miss spike, slow query |
| INFO | No action | Normal operations |

## Prohibited Actions

- Never log or display API keys, secrets, or provider credentials
- Never modify PostgreSQL data directly (always through application code)
- Never restart postgres or redis without checking for in-flight transactions
- Never force-kill containers (use graceful shutdown)
- Never ignore financial errors (escrow, ledger, billing)

## Spec References

| Topic | Section |
|-------|---------|
| Logging architecture | §12.32 |
| Log levels | §12.246 |
| API key masking | §12.92 |
| Health checks | §12.167 |
| Prometheus metrics | §12.169 |
| Alert rules (27) | §12.240 |
| Error codes | §12.243 |
| Docker log management | §12.55 |
| Grafana dashboards | §12.242 |
| Log aggregation pipeline | §12.198 |
