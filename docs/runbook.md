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

Auto-renewed via the **systemd timer `certbot.timer`** (not a cron job — verified 2026-09-05,
there is no `/etc/cron.d/apibase` on this box). `OnCalendar=*-*-* 00,12:00:00` with
`RandomizedDelaySec=43200` (up to 12h jitter), so it fires twice a day but not at a fixed
clock time — e.g. observed run 2026-09-04 14:23 UTC, next due 2026-09-05 ~11:33-14:23 UTC.
`apibase.pro` expiry sits at ~30 days remaining right after each successful renewal (Let's
Encrypt certs are issued for 90 days and certbot's default renew window is "<30 days left");
that is the expected steady state, not a problem — see `CertExpiring` note below.

```bash
# Check the timer itself (last/next run, enabled state)
systemctl status certbot.timer
systemctl list-timers certbot.timer

# Check cert expiry
echo | openssl s_client -connect apibase.pro:443 2>/dev/null | openssl x509 -noout -dates

# Manual renewal
certbot renew --quiet
$COMPOSE exec nginx nginx -s reload
```

`CertExpiring` (§3.4) fires at < 14 days remaining — too late to be the primary signal for a
missed renewal: by the time it's red, `certbot.timer` has already missed many scheduled runs,
not just the most recent one. The renewal window opens at `notAfter - 30d` (certbot's default
`renew_before_expiry`), and inside that window `certbot.timer` fires at least once every ~24h
(`OnCalendar=*-*-* 00,12:00:00` + up to 12h jitter — worst-case gap between two firings is just
under 24h, never a full day with zero attempts). That gives an earlier, sharper signal than
`CertExpiring`:

- Remaining days slipping from 30 to 29 is, **by itself, not yet a failure** — the window has
  only just opened and the timer may simply not have fired inside it yet (e.g. a tester run early
  in the window can legitimately observe 29-point-something days with no renewal attempt made).
- Remaining days at **29 or fewer IS a renewal failure** once `systemctl status certbot.service`
  shows a run that happened *after* the window opened (i.e. after `notAfter - 30d`) and the cert
  is still unrenewed — that run attempted the renewal and it did not take effect. Treat this as an
  incident and act immediately; do not wait ~16 more days for `CertExpiring` to go red.
- If `certbot.service` shows **no run at all** more than ~24h after the window opened, that's a
  *different* failure — the timer itself isn't firing. Check `systemctl list-timers certbot.timer`
  and `systemctl status certbot.timer` for `enabled`/`active` state, not `certbot.service` history.

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
| Certbot Renewal | 2x/day, `OnCalendar=00,12:00 UTC` + up to 12h jitter | systemd timer (`certbot.timer`) | CertExpiring alert |
| Docker Prune | 4x/day, `0 4,10,16,22 * * *` UTC | Host cron | Disk usage alert |
| SecurityAudit | Weekly Sun 04:00 UTC, `0 4 * * 0` | Host cron | Manual review |

There is no single "host cron file" — host-level jobs above split across two real, different
mechanisms, verified live on the box rather than assumed:
- **Host cron** rows (Docker Prune, SecurityAudit): the `apibase` user's crontab. Inspect with
  `crontab -l` (not a directly-readable file for this user — `/var/spool/cron/crontabs/apibase`
  exists but is root/`crontab`-group only; use the command, not the path). Previously this table
  claimed SecurityAudit ran as `node-cron (Worker)` at `Weekly Sun 02:00 UTC` — neither was true:
  there is no such job in `src/worker/server.ts`, and the real crontab line
  (`0 4 * * 0 .../security-audit-cron.sh`) runs Sundays 04:00 UTC, not 02:00. Fixed 2026-09-05
  alongside the Docker Prune schedule, which likewise said "Weekly Sun 04:00 UTC" while the real
  crontab entry (`0 4,10,16,22 * * *`) runs four times a day, not once a week.
- **Certbot Renewal**: `certbot.timer`, a systemd timer unit, not cron at all. Inspect with
  `systemctl list-timers certbot.timer` or `systemctl cat certbot.timer`.

(Previously this claimed a single host cron file at `/etc/cron.d` + `apibase` — that path has
never existed on this box; whoever wrote it named the intended mechanism, not the one actually
deployed. Fixed 2026-09-05 after the tester's internal-truth drift check caught it.)

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

---

## 10. Autopilot

Internal API reliability/control plane (AP-1..AP-11, `~/AUTOPILOT-DESIGN-2026-09-03.md` on the
server — architecture, all thresholds, full failure-scenario table). Detect → diagnose → act →
verify → escalate, zero model calls at rest (Detect/Diagnose/Plan are all deterministic Python;
the only AI spend is the email haiku cascade, capped 3/day). Money is never an auto-action —
`config/autopilot/routing.json` has no auto-branch for `PAYMENT_REQUIRED`, enforced at load time
(fails closed) and re-checked in `incident-cli.py --selftest` as a test on absence.

### 10.1 Provider health state machine (F1)

```
UNKNOWN --first OK--> HEALTHY <--2 consecutive OK (recovery)--+
   |                     | 2 consecutive FAIL_TRANSIENT       |
   |                     v                                    |
   +--3 FAIL-->      DEGRADED --3 more FAIL--> DOWN ----------+
                         ^  any FAIL_DETERMINISTIC (401/403 with a
                         |  configured key, 404 on the canonical probe
                         |  URL, schema mismatch) skips the counters
                         +  entirely: straight to DEGRADED/DOWN, probe
                            paused (`deterministic_paused_until`, +24h) —
                            "детерминированный отказ не перезапускается",
                            zero retries until that anchor expires or the
                            key contour reports a fix.
```

Thresholds live ONCE, in `src/config/autopilot.ts` (`FAIL_THRESHOLD_DEGRADED=2`,
`FAIL_THRESHOLD_DOWN=5` total, `RECOVERY_STREAK_TO_HEALTHY=2`) — `provider-health.job.ts` (active
probe, cron `*/2 * * * *`) and `tool-quality.job.ts` (passive, real traffic) both import from
there, neither hardcodes a number. AP-8 mirrors this state onto `tools.status`
(healthy|degraded|unavailable, `status_source='autopilot'`) every incident-engine tick —
`status_source='manual'` (or legacy NULL sitting at a non-healthy status) is never touched.

### 10.2 Incident lifecycle (F2)

```
OPEN --router--> REMEDIATION_QUEUED --fleet DONE--> VERIFYING --re-probe OK--> RESOLVED
  |                    | fleet stuck/exhausted            | re-probe FAIL
  +--HUMAN class--> WAITING_HUMAN --human-done file--> REMEDIATION_QUEUED (follow-up)
  |                    | 72h no answer -> TG reminder (1x/72h, suppressed ones logged)      |
  +--money/unknown--> WAITING_HUMAN                                                          v
                                                                                            STUCK (human only)
```

Route classes (`config/autopilot/routing.json`, one file, loaded once): `AUTO`/`MIXED` file a real
fleet task (`≤3/day` cap, severity-ordered so SEV1 never loses a slot to an older SEV3);
`AUTO_NO_MODEL` (`RATE_LIMITED`) is an engine self-action, zero model, zero fleet task;
`HUMAN_KEY` (`AUTH_FAILED`/`CREDENTIAL_EXPIRED`) opens straight into `WAITING_HUMAN` and bridges
into the existing `connected_db.py` key-request letter — **no fleet task, no duplicate operator
file** (the letter IS the one place); `HUMAN_ONLY`/`HUMAN_GENERIC` (`PAYMENT_REQUIRED`, `UNKNOWN`)
open into `WAITING_HUMAN` with a generated operator file at
`~/autopilot/operator/INC-<short_id>.md` — reply by dropping a filled-in file in
`~/taskloop/human-done/`.

### 10.3 Where to look

| What | Where |
|---|---|
| Durable provider truth | `provider_status` table (Redis `provider:health:*`/`provider:limits:*` stay a cache, never the source of truth) |
| Every measurement, including suppressed ones | `probe_log` (append-only; `kind='suppressed'` rows are budget/pause skips, not silence) |
| Incidents | `incidents` table — `incident-cli.py list [--state] [--severity] [--provider]` |
| Email intake decisions | `email_events` table |
| Engine heartbeat | `/tmp/autopilot-incident-engine.hb` (cron `*/10`, staleness caught by `fleet-check.sh`) |
| Operator files | `~/autopilot/operator/INC-<id>.md` |
| Human replies | `~/taskloop/human-done/` (processed ones move to `human-done/processed/`) |
| Suppressed-action journal | `~/taskloop/logs/notices.log` |
| Fleet tasks the router files | `~/taskloop/queue/9<sev>xx-autopilot-remediation-<KIND>-<provider>.md` |

```bash
# Live incident list
python3 scripts/autopilot/incident-cli.py list --state WAITING_HUMAN

# One provider's recent probes
$COMPOSE exec -T postgres psql -U apibase -d apibase -c \
  "SELECT ts, kind, result, http_status, detail FROM probe_log WHERE provider = 'X' ORDER BY ts DESC LIMIT 20;"

# Reliability score / dashboard JOIN for one provider
curl -s https://apibase.pro/api/v1/dashboard | jq '.providers[] | select(.provider == "X")'
curl -s "https://apibase.pro/api/v1/incidents?provider=X"
```

### 10.4 Running the acceptance drills (AP-11)

Three synthetic, sandboxed scenarios prove the whole chain actually fires, not just each piece in
isolation — a real local HTTP socket standing in for a "fake health_url", a disposable
`postgres:16.2-alpine` container standing in for prod Postgres (never `apibase-postgres-1`), every
`~/taskloop`/`~/autopilot`/`tg.env` path pointed at `/tmp` scratch dirs. Nothing here touches
production state, sends a real Telegram message, or spends a real haiku call.

```bash
python3 scripts/autopilot/drills.py            # all three, ~20s
python3 scripts/autopilot/drills.py --skip-jest # skip the jest leg (needs npx)

# Individually:
npx jest tests/integration/autopilot-drill-provider-health.test.ts --no-coverage
python3 scripts/autopilot/drill-incident-lifecycle.py
python3 scripts/autopilot/drill-email-injection.py
```

| Drill | Proves | Terminus |
|---|---|---|
| Synthetic DOWN provider | Real socket 500s → F1 DEGRADED→DOWN (5 fails) → PROVIDER_DOWN incident → fleet task → fix → re-probe → RESOLVED, `/api/v1/dashboard`+`/api/v1/incidents` agree at every step, AP-8 demotes/promotes `tools.status`/`tool_count` in lockstep | `RESOLVED` |
| Synthetic 401 | Real socket 401 → FAIL_DETERMINISTIC, 24h pause; a second tick makes **zero** further real requests; AUTH_FAILED never gets a fleet task, bridges to the existing key-request letter instead | `WAITING_HUMAN` (correct terminus for a `HUMAN_KEY` kind — key rotation is human-only by design) |
| Synthetic prompt-injection email | RFC2047-encoded header decode, rules path never reaches the model at all, haiku path rejects an out-of-enum "classification" the injection tried to force, and even a within-enum compliant reply (`MARKETING`) opens no incident | classified, never executed |

Mutation control (required, not optional — a check that can't go red proves nothing): each drill
was run once against a deliberately broken line of the production code it covers (confirmed RED),
then against the reverted original (confirmed GREEN). Exact lines mutated and both transcripts are
in `AUTOPILOT-PROGRESS.md`'s `T-820-autopilot-drills` entry — re-run any of the three against a
one-line break of your own to re-prove it any time; don't trust a green run you haven't personally
seen go red first.

### 10.5 N-table — 20 failure scenarios, coverage status

Full scenario table: design doc section N. Status as actually measured (never claim `PROVEN` from
memory — the drills above are the only three that touch a live-ish system; everything else is
either a targeted unit/selftest or design-only):

| # | Scenario | Coverage |
|---|---|---|
| 1 | API key expired | AP-11 drill 2 (401→DEGRADED+pause+WAITING_HUMAN) proves the detection/routing half; the "key renewed → auto re-probe → RESOLVED" half is design-only (untested) |
| 2 | API key revoked | Same code path as #1 (dedup by `dedup_key`), same coverage |
| 3 | Provider fully down | **AP-11 drill 1, full cycle to RESOLVED** |
| 4 | Endpoint changed (404/schema) | `_classify_deterministic_fail` unit-covered (`incident-engine.py --selftest`); no drill exercises the adapter-fix fleet task itself |
| 5 | Breaking API version | Design-only |
| 6 | Rate limit exhausted | Design-only (`AUTO_NO_MODEL` self-action code exists, `route_auto_incidents` unit path not drilled) |
| 7 | Paid quota near exhaustion | `provider-limit-alerts.py --selftest` (burn-rate math) — not an AP-11 drill |
| 8 | Payment failed | `incident-cli.py --selftest` proves the ABSENCE of an auto-branch; no drill opens a live PAYMENT_REQUIRED incident |
| 9 | Email warning (generic) | `email-intake.py --selftest-db` worlds 1/3/5 |
| 10 | Email prompt injection | **AP-11 drill 3** (own new scenarios, independent of email-intake.py's own H4 fixture) |
| 11 | Agent couldn't fix it | Existing taskloop STUCK mechanism (unmodified); AP-11 drill 1 simulates a `done/` marker only, never a `stuck/` one |
| 12 | Partial fix | Design-only (`advance_verifying`'s re-probe-FAIL→STUCK branch has no drill) |
| 13 | Fix broke something else | Process guarantee (REVIEW: fable + CI + protocol-tester), not a mechanism this table can drill |
| 14 | Two agents, one incident | `incident-engine.py --selftest-db` (dedup unique-index proof) |
| 15 | Redis down | Design-only |
| 16 | Database down | Design-only |
| 17 | Telegram down | `incident-cli.py`/`autopilot_common.py` selftests (`tg_send` best-effort) |
| 18 | Email/IMAP down | Design-only (NOINFO-vs-zero distinction exists in code, not drilled live) |
| 19 | Monitoring worker down | Design-only |
| 20 | Whole subsystem down | External to this repo by design (`mcp-protocol-tester`, fleet-pulse) |

### 10.6 Troubleshooting

| Symptom | Check |
|---|---|
| No incidents opening for a clearly-down provider | Engine heartbeat fresh? `provider_status.state` actually DEGRADED/DOWN? Migration 0009+0010 applied? |
| Incident stuck OPEN past 24h for a PROVIDER_DOWN | `route_auto_incidents`'s own age gate (`PROVIDER_DOWN_MIN_AGE_SECONDS=24h`) — working as designed, not a bug |
| WAITING_HUMAN never clears after a key rotation | HUMAN_KEY has no automated re-close path by design (F2) — needs `incident-cli.py resolve-request` (or a human/agent transition) once the key is confirmed fixed |
| `/api/v1/dashboard` tool_count disagrees with the catalog | Check `t.status != 'unavailable'` FILTER on `tool_count` is still separate from the row-level WHERE (T-8181 ruling-3 — a regression here silently re-breaks the counter) |
| Fleet task never files despite an OPEN incident | Daily cap (`≤3/day`, `~/taskloop/state/autopilot-router-daily.count`) already spent, or `PROVIDER_DOWN`'s age gate not yet crossed |
