# APIbase.pro — Production Runbook

Operational procedures for the APIbase.pro production environment.
Single Hetzner server, 16-container Docker stack, PostgreSQL + Redis.

---

## 1. Container Management

### 1.1 Stack Overview

```
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

16 containers: 6 base + 10 production.

| Container | Port | Purpose |
|-----------|------|---------|
| postgres | 5432 (internal) | Primary database |
| redis | 6379 (internal) | Cache, rate limits, locks |
| api | 3000 (internal) | API server |
| worker | 3001 (internal) | Background jobs |
| outbox-worker | 3002 (internal) | Outbox event processing |
| nginx | 80, 443 (public) | Reverse proxy, TLS |
| prometheus | 9090 (localhost) | Metrics |
| grafana | 3000 (localhost) | Dashboards |
| loki | 3100 (internal) | Log aggregation |
| promtail | 9080 (internal) | Log collection |
| alertmanager | 9093 (internal) | Alert routing |
| postgres_exporter | 9187 (internal) | PG metrics |
| redis_exporter | 9121 (internal) | Redis metrics |
| nginx_exporter | 9113 (internal) | Nginx metrics |
| postgres_backup | 8080 (internal) | Daily backups |
| node_exporter | 9100 (internal) | Host metrics |

### 1.2 Start / Stop / Restart

```bash
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

# Start entire stack
$COMPOSE up -d

# Stop entire stack (parallel SIGTERM)
$COMPOSE down

# Ordered graceful shutdown (nginx first, postgres last)
bash scripts/graceful-shutdown.sh

# Restart single service
$COMPOSE restart api

# Restart app containers only (no DB/Redis restart)
$COMPOSE restart api worker outbox-worker
```

### 1.3 Logs

```bash
# Follow API logs
$COMPOSE logs -f api --tail 100

# All app logs
$COMPOSE logs -f api worker outbox-worker --tail 50

# Search for errors (last 1000 lines)
$COMPOSE logs api --tail 1000 | grep '"level":"error"'

# Structured log query via Loki/Grafana
# http://localhost:3000 → Explore → Loki → {container="api"} |= "error"
```

Log rotation: 50MB x 3 files per container (Docker daemon.json). Max entry: 10KB.

### 1.4 Health Checks

```bash
# Liveness (process alive)
curl http://localhost:3000/health/live

# Readiness (PG + Redis + config)
curl http://localhost:3000/health/ready

# Via Nginx (full stack)
curl http://localhost:80/health/ready
curl https://apibase.pro/health/ready
```

---

## 2. Database Operations

### 2.1 Backup

Automated daily at 03:00 UTC via `postgres_backup` container.

```bash
# Verify backup container is running
$COMPOSE ps postgres_backup

# Check last backup
ls -la backups/

# Manual backup
$COMPOSE exec postgres pg_dump -U apibase -Fc apibase > backup-$(date +%Y%m%d).dump
```

Retention: 7 daily, 4 weekly, 6 monthly.

Alert: `BackupMissing` fires if no backup in 25 hours.

### 2.2 Restore

```bash
# Full restore (requires downtime)
$COMPOSE stop api worker outbox-worker
$COMPOSE exec -T postgres pg_restore -U apibase -d apibase --clean < backup.dump
$COMPOSE start api worker outbox-worker

# Wait for readiness
for i in $(seq 1 30); do
  curl -sf http://localhost:3000/health/ready && break
  sleep 2
done
bash scripts/smoke-test.sh
```

### 2.3 Partition Management

Partitions created automatically by node-cron (daily 23:00 UTC).
Old partitions dropped by node-cron (daily 04:00 UTC).

```bash
# Verify partitions exist
$COMPOSE exec postgres psql -U apibase -d apibase -c "
  SELECT tablename FROM pg_tables
  WHERE tablename LIKE '%_p_%'
  ORDER BY tablename DESC LIMIT 10;"

# Manual partition creation (if cron missed)
$COMPOSE exec postgres psql -U apibase -d apibase < scripts/create-partitions.sql
```

Partitioned tables: `execution_ledger`, `outbox`, `request_metrics`.

### 2.4 Connection Pool

Prisma built-in pool (no PgBouncer in Phase 1):
- API: 20 connections
- Worker: 10 connections
- Outbox: 5 connections

```bash
# Check active connections
$COMPOSE exec postgres psql -U apibase -d apibase -c "
  SELECT count(*), state FROM pg_stat_activity
  WHERE datname = 'apibase'
  GROUP BY state;"
```

---

## 3. Monitoring

### 3.1 Access

| Service | URL | Auth |
|---------|-----|------|
| Grafana | http://localhost:3000 | admin / (GF_ADMIN_PASSWORD) |
| Prometheus | http://localhost:9090 | none (localhost only) |
| Alertmanager | (internal only) | via Grafana |

### 3.2 Grafana Dashboards (6)

1. **API Overview** — request rate, latency, error rate, status codes
2. **Financial** — escrow states, ledger entries, balances
3. **Infrastructure** — CPU, memory, disk, network
4. **PostgreSQL** — connections, queries, replication lag
5. **Redis** — memory, commands, keys, hit rate
6. **SRE SLO** — availability, error budget, burn rate

### 3.3 Key Prometheus Queries

```promql
# Error rate (1h)
rate(http_requests_total{status=~"5.."}[1h]) / rate(http_requests_total[1h])

# P95 latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Escrow leaks (age > 60s)
escrow_pending_count{age_seconds="gt60"}

# Provider error rate
rate(provider_errors_total[5m])

# Redis memory
redis_memory_used_bytes / redis_memory_max_bytes
```

### 3.4 Alert Rules (27)

Alerts route to Telegram via Alertmanager.

Critical alerts (immediate action):
- `APIDown` — /health/ready 503 for > 1m
- `HighErrorRate` — 5xx > 5% for 5m
- `EscrowLeak` — pending escrows > 5 with age > 60s
- `BackupMissing` — no backup in 25h
- `PGDiskUsageCritical` — disk > 95%
- `RedisOOM` — memory > 90%

Warning alerts (investigate within 1h):
- `HighLatency` — P95 > 500ms for 5m
- `PGDiskUsageHigh` — disk > 85%
- `ProviderDegraded` — provider error rate > 10%
- `CertExpiring` — TLS cert expires in < 14 days

---

## 4. Incident Response

### 4.1 Severity Classification

| Severity | Definition | Response Time |
|----------|-----------|---------------|
| SEV-1 | Platform fully unavailable | < 15 minutes |
| SEV-2 | Critical functionality degraded | < 1 hour |
| SEV-3 | Non-critical issue | < 4 hours |

### 4.2 Response Flow

```
Detection (alert / monitoring / user report)
  -> Acknowledge (< 5 min for SEV-1)
  -> Triage: severity classification
  -> Investigate: logs -> metrics -> traces -> recent deploys
  -> Mitigate: rollback / restart / failover / disable tool
  -> Resolve: root cause fix + deploy
  -> Postmortem (within 48h for SEV-1/2)
```

### 4.3 Common Scenarios

**API 5xx spike:**
1. Check `$COMPOSE logs api --tail 200`
2. Check `/health/ready` — identify which dependency is down
3. If recent deploy: rollback via `bash scripts/deploy.sh <prev-sha>`
4. If not deploy-related: restart `$COMPOSE restart api`

**Redis down (§12.186 — fail-closed):**
1. All tool requests return 503
2. `/health/ready` shows `redis: false`
3. Docker auto-restarts Redis (restart: unless-stopped)
4. Recovery: ~20s automatic
5. If no recovery: `$COMPOSE restart redis`

**PG disk full (§12.187):**
1. Pipeline aborts at ESCROW stage — no provider calls, no charges
2. Emergency: `docker system prune -f`, remove old log files
3. Increase disk via Hetzner console
4. Verify: `df -h` + `$COMPOSE exec postgres psql -U apibase -c "SELECT 1"`

**Provider timeout:**
1. Provider calls timeout after 10s, 2 retries with backoff
2. Escrow refunded via reconciliation (60-120s)
3. Check provider status page
4. If persistent: disable tool via DB (`UPDATE tools SET status = 'unavailable'`)

**Escrow leak:**
1. Alert: `EscrowLeak` — pending escrows with age > 60s
2. Reconciliation job runs every 60s (should auto-fix)
3. Manual check: `SELECT * FROM execution_ledger WHERE status = 'pending' AND created_at < NOW() - INTERVAL '2 minutes'`
4. Manual fix: `UPDATE execution_ledger SET status = 'failed', billing_status = 'REFUNDED' WHERE ...`

### 4.4 Rollback

```bash
# Image rollback (< 60 seconds)
cat /opt/app/.last-successful-sha  # Previous good SHA
bash scripts/deploy.sh <previous-sha>

# Emergency: restart with last known good image
export IMAGE_TAG="sha-$(cat /opt/app/.last-successful-sha)"
$COMPOSE pull api worker outbox-worker
$COMPOSE up -d api worker outbox-worker
```

### 4.5 Tool Kill Switch

Disable a tool immediately:

```bash
$COMPOSE exec postgres psql -U apibase -d apibase -c "
  UPDATE tools SET status = 'unavailable' WHERE tool_id = 'weather.get_current';"
```

Pipeline TOOL_STATUS_CHECK stage (stage 5) rejects requests for disabled tools with 503.

Re-enable:

```bash
$COMPOSE exec postgres psql -U apibase -d apibase -c "
  UPDATE tools SET status = 'healthy' WHERE tool_id = 'weather.get_current';"
```

---

## 5. Deploy

### 5.1 Standard Deploy (CI/CD)

Push to main -> GitHub Actions -> build -> push GHCR -> SSH deploy -> smoke test.

```bash
git push origin main
# CI/CD handles the rest
```

### 5.2 Manual Deploy

```bash
ssh deploy@apibase.pro
cd /opt/app
bash scripts/deploy.sh <commit-sha>
```

Deploy script: pull images -> restart app containers -> wait for readiness -> smoke test -> save SHA or rollback.

### 5.3 Smoke Tests

```bash
API_URL=http://localhost:80 bash scripts/smoke-test.sh
```

8 tests: health, catalog, tool detail, response structure, MCP discovery, content negotiation, auth, rate limits.

---

## 6. Security

### 6.1 Provider Key Rotation (< 5 minutes)

1. Generate new key at provider dashboard
2. Update `.env` on server: `vim /opt/app/.env`
3. Restart app containers: `$COMPOSE restart api worker outbox-worker`
4. Verify: smoke test or manual tool call
5. Revoke old key at provider dashboard

### 6.2 TLS Certificate

Auto-renewed 2x/day (03:00, 15:00 UTC) via host cron.

```bash
# Check cert expiry
echo | openssl s_client -connect apibase.pro:443 2>/dev/null | openssl x509 -noout -dates

# Manual renewal
certbot renew --quiet
$COMPOSE exec nginx nginx -s reload
```

### 6.3 Container Security Matrix

| Container | read_only | cap_drop ALL | non-root | no-new-privileges |
|-----------|-----------|-------------|----------|-------------------|
| api | YES | YES | YES (1001) | YES |
| worker | YES | YES | YES (1001) | YES |
| outbox-worker | YES | YES | YES (1001) | YES |
| nginx | YES | partial | NO | YES |
| postgres | NO | partial | YES | YES |
| redis | NO | YES | YES | YES |

### 6.4 Firewall

```bash
# Verify UFW rules
ufw status

# Expected: 22, 80, 443 only
# 22/tcp    ALLOW  Anywhere
# 80/tcp    ALLOW  Anywhere
# 443/tcp   ALLOW  Anywhere
```

### 6.5 SSH Access

Root login disabled. Password auth disabled. Access via `deploy` user only.

```bash
ssh deploy@apibase.pro
```

---

## 7. Scaling Triggers

Phase 1: single server. Scale triggers for Phase 2:

| Metric | Threshold | Action |
|--------|-----------|--------|
| Concurrent agents | > 10,000 | Add application servers |
| P95 latency | > 500ms sustained | Optimize queries, add caching |
| CPU usage | > 80% sustained | Upgrade server or add replicas |
| PG connections | > 80% pool | Add read replicas |
| Disk usage | > 80% | Expand volume |
| Request rate | > 4,000 req/s | Multi-server deployment |

---

## 8. Cron Jobs (7 total)

| Job | Schedule | Owner | Monitor |
|-----|----------|-------|---------|
| Partition Create | Daily 23:00 UTC | node-cron (API) | PartitionCleanupFailed alert |
| Partition Cleanup | Daily 04:00 UTC | node-cron (API) | PartitionCleanupFailed alert |
| Reconciliation | Every 60s | node-cron (Worker) | EscrowLeak alert |
| PG Backup | Daily 03:00 UTC | postgres_backup container | BackupMissing alert |
| Certbot Renewal | 03:00, 15:00 UTC | Host cron | CertExpiring alert |
| Docker Prune | Weekly Sun 04:00 UTC | Host cron | Disk usage alert |
| SecurityAudit | Weekly Sun 02:00 UTC | node-cron (Worker) | Manual review |

Host cron file: `/etc/cron.d/apibase`

---

## 9. Disaster Recovery

### 9.1 Full Server Loss

RPO: 24 hours (daily backup). RTO: < 3 hours.

1. Provision new Hetzner server
2. Run `bash scripts/bootstrap.sh`
3. Restore database from backup
4. Verify with smoke tests

### 9.2 Database Corruption

1. Stop write traffic: `$COMPOSE stop api worker outbox-worker`
2. Restore from backup: `pg_restore -U apibase -d apibase --clean < backup.dump`
3. Restart: `$COMPOSE start api worker outbox-worker`
4. Verify: smoke tests + ledger integrity check

### 9.3 Backup Verification

Monthly: restore backup to a test database, verify row counts and data integrity.

```bash
# Create test DB
$COMPOSE exec postgres createdb -U apibase apibase_test
$COMPOSE exec -T postgres pg_restore -U apibase -d apibase_test < backup.dump
# Verify
$COMPOSE exec postgres psql -U apibase -d apibase_test -c "SELECT count(*) FROM agents;"
# Cleanup
$COMPOSE exec postgres dropdb -U apibase apibase_test
```
