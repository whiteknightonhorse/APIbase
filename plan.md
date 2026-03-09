# APIbase.pro — Phase 1 Implementation Plan

> 45 steps across 4 milestones. Each step = 1 Claude Code iteration.
> Spec authority: `/home/apibase/tmp/APIbase_Product_Spec_v2.1.md` (v2.1-final, frozen)

---

## P1a — Platform Core (Month 1, Steps 1–16)

**Goal:** Hetzner server → 16-container Docker stack → PostgreSQL + Redis → API skeleton → health checks → seed data → pipeline foundation. `smoke-test.sh` passes on clean server.

---

### Step 1 — Repository Scaffold

**Scope:** Initialize TypeScript project with strict config, directory structure, and essential dotfiles.

**Key files:**
```
package.json
tsconfig.json
.gitignore
.env.example
.dockerignore
.prettierrc
.eslintrc.json
src/
  api/
  worker/
  outbox/
  pipeline/
  middleware/
  services/
  routes/
  config/
  jobs/
  adapters/
  normalizers/
  tools/
  types/
  utils/
prisma/
  schema.prisma
scripts/
nginx/
prometheus/
grafana/
docker/
```

**Spec refs:** §12.0, §12.194, §12.238

**Test:**
```bash
npx tsc --noEmit && echo "OK"
```

**Dependencies:** None

---

### Step 2 — Environment & Configuration Module

**Scope:** Create typed config loader that validates all required env vars at startup. Fail-fast on missing vars. `config.ts` loads and freezes config snapshot per §12.170.

**Key files:**
```
src/config/env.ts          — zod schema for all env vars (§12.238)
src/config/index.ts        — validated, frozen config export
.env.example               — all vars from §12.238
```

**Spec refs:** §12.238 (env registry), §12.195 (secrets management), §12.170 (config snapshot)

**Test:**
```bash
# Missing required var → process exits with code 1
DATABASE_URL= npx ts-node src/config/index.ts 2>&1 | grep -q "FATAL" && echo "OK"
```

**Dependencies:** Step 1

---

### Step 3 — Pino Structured Logger

**Scope:** Create Pino logger with JSON output, `request_id` correlation, 10KB max entry, field redaction (API keys, PII). Production level = INFO only.

**Key files:**
```
src/config/logger.ts       — Pino instance with redaction paths
src/middleware/request-id.middleware.ts — X-Request-ID generation/passthrough
```

**Spec refs:** §12.246 (logging rules), §11 (AP-2 observability-first)

**Test:**
```bash
# Log output is valid JSON with required fields
npx ts-node -e "require('./src/config/logger').logger.info({request_id:'test'},'hello')" | jq .level && echo "OK"
```

**Dependencies:** Step 2

---

### Step 4 — Prisma Schema & Migrations

**Scope:** Define all 6 core tables in Prisma schema. Create initial migration. Add partition SQL scripts for `execution_ledger`, `outbox`, `request_metrics`.

**Key files:**
```
prisma/schema.prisma             — 6 tables: agents, accounts, execution_ledger, outbox, request_metrics, tools
prisma/migrations/0001_init/     — initial migration SQL
scripts/create-partitions.sql    — daily partition creation script
```

**Tables (§12.241):**
- `agents` — agent_id (PK), api_key_hash (unique), tier, status, deleted_at
- `accounts` — agent_id, balance_usd
- `execution_ledger` — execution_id, agent_id, tool_id, status, cost_usd, billing_status, idempotency_key, created_at (partitioned daily, 365d retention)
- `outbox` — event_id, type, payload, status, created_at (partitioned daily, 7d retention)
- `request_metrics` — agent_id, tool_id, status_code, duration_ms, created_at (partitioned daily, 90d retention)
- `tools` — tool_id (PK), name, provider, status, price_usd, cache_ttl

**Spec refs:** §12.241 (DB schema registry), §12.244 (partition cron)

**Test:**
```bash
npx prisma validate && npx prisma migrate dev --name init && echo "OK"
```

**Dependencies:** Step 2

---

### Step 5 — Docker Compose Base (6 containers)

**Scope:** Create `docker-compose.yml` with 6 base containers: postgres, redis, api, worker, outbox-worker, nginx. Named volumes only. Single `app` network. Resource limits per §12.194.

**Key files:**
```
docker-compose.yml              — 6 base containers
docker/Dockerfile               — multi-stage Node.js build (appuser:1001)
docker/entrypoint.sh            — startup sequence (§12.194)
nginx/nginx.conf                — reverse proxy config (§12.239)
```

**Container details (§12.194):**
| Container | Image | Port | Health Check |
|-----------|-------|------|-------------|
| postgres | postgres:16.2-alpine | 5432 (internal) | pg_isready |
| redis | redis:7.2-alpine | 6379 (internal) | redis-cli ping |
| api | custom | 3000 (internal) | GET /health/ready |
| worker | custom | 3001 (internal) | GET /worker/health |
| outbox-worker | custom | 3002 (internal) | GET /outbox/health |
| nginx | nginx:1.25-alpine | 80,443 (public) | TCP 443 |

**Volumes (§12.203):** postgres_data, redis_data, certbot_conf, certbot_www

**Spec refs:** §12.194–12.203, §12.239 (nginx), §12.245 (ports), §12.200 (networking)

**Test:**
```bash
docker compose config --quiet && echo "OK"
```

**Dependencies:** Steps 1–4

---

### Step 6 — Container Security Hardening

**Scope:** Apply security matrix to all containers: read_only, cap_drop ALL, tmpfs /tmp, no-new-privileges, non-root user (appuser:1001). Nginx gets NET_BIND_SERVICE.

**Key files:**
```
docker-compose.yml             — security directives per container
docker/Dockerfile              — USER 1001:1001, minimal image
```

**Security matrix (§12.219):**
| Container | read_only | cap_drop ALL | tmpfs /tmp | non-root | no-new-privileges |
|-----------|-----------|-------------|------------|----------|-------------------|
| api | YES | YES | YES | YES | YES |
| worker | YES | YES | YES | YES | YES |
| outbox-worker | YES | YES | YES | YES | YES |
| nginx | YES | YES + NET_BIND | YES | NO | YES |
| postgres | NO | partial | NO | YES | YES |
| redis | NO | YES | NO | YES | YES |

**Spec refs:** §12.219 (container security), §7 (security rules)

**Test:**
```bash
docker compose up -d && docker exec apibase-api-1 whoami | grep -q "appuser" && echo "OK"
```

**Dependencies:** Step 5

---

### Step 7 — Express API Server Skeleton

**Scope:** Create Express server with JSON-only responses, Pino request logging, X-Request-ID middleware, graceful shutdown handler, and basic error handler. No routes yet (those come in later steps).

**Key files:**
```
src/api/server.ts              — Express app + graceful shutdown
src/api/app.ts                 — Express configuration
src/middleware/request-id.middleware.ts  — already from Step 3
src/middleware/error-handler.middleware.ts — structured JSON errors (§12.243)
src/middleware/content-type.middleware.ts — JSON-only enforcement
src/types/errors.ts            — error code types from §12.243
```

**Error format (§12.243):**
```json
{"error":"error_code","message":"...","request_id":"req_...","retry_after":60}
```

**Spec refs:** §12.243 (error codes), §12.230 (graceful shutdown), §6.1 (agent-first, no HTML)

**Test:**
```bash
curl -s http://localhost:3000/nonexistent | jq .error && echo "OK"
# Must return JSON error, never HTML
```

**Dependencies:** Steps 3, 5

---

### Step 8 — Health Check Endpoints

**Scope:** Implement `/health/live` (liveness) and `/health/ready` (readiness). Readiness checks PG connection + Redis ping + config loaded. Liveness is always 200 if process running. Dedicated PG pool for health checks.

**Key files:**
```
src/routes/health.router.ts    — /health/live, /health/ready
src/services/health.service.ts — PG + Redis + config checks
```

**Readiness checks:**
- PostgreSQL: `SELECT 1` via dedicated pool
- Redis: `PING` command
- Config: env vars loaded and validated

**Spec refs:** §12.185 (liveness ≠ readiness), §12.194 (startup sequence), §6.2 (/api/v1/health, /api/v1/ready)

**Test:**
```bash
# With PG+Redis up:
curl -sf http://localhost:3000/health/ready | jq -e '.status == "ok"' && echo "OK"
# With Redis down:
docker compose stop redis && curl -sf http://localhost:3000/health/ready; echo $?  # must be non-zero
docker compose start redis
```

**Dependencies:** Steps 5, 7

---

### Step 9 — Seed Script

**Scope:** Idempotent seed script that creates initial tools from config, test agent with known API key, and initial partitions. Uses upsert to be safe on re-run.

**Key files:**
```
scripts/seed.ts                — idempotent upsert logic
config/tool_provider_config.yaml — tool definitions (UC-001, UC-005)
```

**Seed data (§12.196):**
- Tools: `weather.get_current` (TTL 300s), `weather.get_forecast` (TTL 600s), `polymarket.get_orderbook` (TTL 0s), etc.
- Test agent: `agent_id=test-agent-001`, `api_key=ak_live_test_0000000000000000000000000000`, `balance=$100`
- Partitions: today + tomorrow for all 3 partitioned tables

**Spec refs:** §12.196 (seed script), §12.127 (cache TTLs), §12.241 (tables)

**Test:**
```bash
npx ts-node scripts/seed.ts && npx ts-node scripts/seed.ts  # second run must succeed (idempotent)
npx prisma db seed  # if configured in package.json
echo "OK"
```

**Dependencies:** Step 4

---

### Step 10 — API Key Service

**Scope:** Generate, hash, and validate API keys. Format: `ak_live_<32 hex>` (256-bit entropy). SHA-256 hash stored in PG, plaintext returned only once at creation.

**Key files:**
```
src/services/api-key.service.ts — generate(), hash(), validate()
```

**Key format (§12.60):**
- Live: `ak_live_<32 random hex bytes>` (e.g. `ak_live_b7c41d9a6e12f4a9d83c61e0ab5c93fd`)
- Test: `ak_test_<32 random hex bytes>`
- Storage: `SHA-256(api_key)` in `agents.api_key_hash`
- Entropy: 256-bit, `crypto.randomBytes(32).toString('hex')`

**Spec refs:** §12.60 (API key format), §9.3 (agent identity)

**Test:**
```bash
npx ts-node -e "
const s = require('./src/services/api-key.service');
const key = s.generateApiKey();
console.assert(key.startsWith('ak_live_'), 'prefix');
console.assert(key.length === 40, 'length');
const hash = s.hashApiKey(key);
console.assert(hash.length === 64, 'sha256 hex');
console.log('OK');
"
```

**Dependencies:** Step 2

---

### Step 11 — Auth Middleware

**Scope:** Extract API key from `Authorization: Bearer ak_live_...` header, hash it, look up agent in PG. Reject with 401 if invalid. Populate `req.agent` with agent_id, tier, status. Never trust client-provided agent_id from body.

**Key files:**
```
src/middleware/auth.middleware.ts — API key validation
src/types/request.ts             — extended Request type with agent context
```

**Auth flow:**
1. Extract `Authorization: Bearer <key>` header
2. Validate format (`ak_live_` or `ak_test_` + 32 hex)
3. `SHA-256(key)` → lookup `agents.api_key_hash`
4. If not found → 401 `unauthorized`
5. If agent `status != active` → 403 `forbidden`
6. Set `req.agent = { agent_id, tier, status }`

**Spec refs:** §9.3 (agent identity), §12.60 (API key), §4.4 (identity invariants), §12.43 (AUTH stage)

**Test:**
```bash
# No auth header → 401
curl -s http://localhost:3000/api/v1/tools -H "Accept: application/json" | jq -e '.error == "unauthorized"' && echo "OK"
# Valid test key → 200
curl -s http://localhost:3000/api/v1/tools -H "Authorization: Bearer ak_live_test_0000000000000000000000000000" -H "Accept: application/json" | jq -e '.error' | grep -q null && echo "OK"
```

**Dependencies:** Steps 7, 10

---

### Step 12 — Idempotency Middleware

**Scope:** Check `Idempotency-Key` header. Redis key: `idempotency:{agent_id}:{key}`, TTL 10 min. States: PENDING → SUCCESS | FAILED. Return 409 if key is PENDING. Return cached response if SUCCESS/FAILED.

**Key files:**
```
src/middleware/idempotency.middleware.ts — check + store idempotency state
src/services/idempotency.service.ts     — Redis get/set/finalize
```

**Behavior (§12.171):**
- Header: `Idempotency-Key: <uuid>`
- Redis key: `idempotency:{agent_id}:{key}`, TTL: 600s (10 min)
- If key exists and PENDING → 409 Conflict with `retry_after: 2`
- If key exists and SUCCESS → return cached response
- If key exists and FAILED → return cached error
- If key not found → set PENDING, continue pipeline
- Fallback: if Redis down, check `execution_ledger` in PG

**Spec refs:** §12.171 (idempotency key), §12.43 (IDEMPOTENCY_CHECK stage)

**Test:**
```bash
# First request with key → 200
# Second request with same key → cached 200 (no provider call)
# Concurrent request with same key while first is PENDING → 409
```

**Dependencies:** Steps 8, 11

---

### Step 13 — Rate Limiter (Dual Bucket)

**Scope:** Implement dual-bucket token rate limiter: per-agent-per-tool + per-agent-global. Atomic Lua script in Redis. Lazy bucket initialization. Unauthorized requests do NOT consume tokens.

**Key files:**
```
src/middleware/rate-limit.middleware.ts — dual bucket check
src/services/rate-limit.service.ts     — Redis Lua script for atomic check+decrement
lua/rate-limit.lua                     — atomic token bucket script
```

**Rate limit design (§12.172):**
- Dual bucket: `ratelimit:{agent_id}:{tool_id}:bucket` + `ratelimit:{agent_id}:global:bucket`
- Lua script: atomically check both buckets, decrement both, return remaining
- 429 with `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After` headers
- Lazy initialization: bucket created on first request
- Tokens NOT refunded on downstream failure (prevents abuse)
- Unauthorized requests skip rate limiting (prevents DoS via fake auth)
- Single-flight waiters skip rate limiting (only lock owner consumes)

**Spec refs:** §12.172 (rate limit scope), §12.43 (RATE_LIMIT stage), §AP-8 (defense in depth)

**Test:**
```bash
# Send requests until 429, verify X-RateLimit headers
for i in $(seq 1 1001); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/tools/weather.get_current \
    -H "Authorization: Bearer ak_live_test_0000000000000000000000000000" \
    -H "Accept: application/json")
  if [ "$code" = "429" ]; then echo "Rate limit hit at request $i — OK"; break; fi
done
```

**Dependencies:** Steps 8, 11

---

### Step 14 — Pipeline Engine (13-Stage)

**Scope:** Create the pipeline execution engine. Single `PIPELINE_STAGES` array enforces stage order. Each stage has typed I/O (Result<T,E> pattern). Pipeline stops on first error. No ad-hoc `app.use()` for pipeline stages.

**Key files:**
```
src/pipeline/pipeline.ts        — PIPELINE_STAGES array + executor
src/pipeline/stages/auth.stage.ts
src/pipeline/stages/idempotency.stage.ts
src/pipeline/stages/content-negotiation.stage.ts
src/pipeline/stages/schema-validation.stage.ts
src/pipeline/stages/tool-status.stage.ts
src/pipeline/stages/cache.stage.ts
src/pipeline/stages/rate-limit.stage.ts
src/pipeline/stages/escrow.stage.ts
src/pipeline/stages/provider-call.stage.ts
src/pipeline/stages/escrow-finalize.stage.ts
src/pipeline/stages/ledger-write.stage.ts
src/pipeline/stages/cache-set.stage.ts
src/pipeline/stages/response.stage.ts
src/pipeline/types.ts           — typed stage I/O contracts (§12.170)
```

**Pipeline order (§12.43, §12.157 — NEVER reorder):**
```
1. AUTH → 2. IDEMPOTENCY → 3. CONTENT_NEG → 4. SCHEMA_VALIDATION →
5. TOOL_STATUS → 6. CACHE_OR_SINGLE_FLIGHT → 7. RATE_LIMIT →
8. ESCROW → 9. PROVIDER_CALL → 10. ESCROW_FINALIZE →
11. LEDGER_WRITE → 12. CACHE_SET → 13. RESPONSE
```

**Typed context chain (§12.170):**
```typescript
AuthOutput → RateLimitOutput → CacheMissOutput → EscrowOutput → ProviderOutput
```

**Spec refs:** §12.43 (pipeline), §12.157 (ordering enforcement), §12.170 (typed context)

**Test:**
```bash
# Verify stage order matches spec exactly
npx ts-node -e "
const { PIPELINE_STAGES } = require('./src/pipeline/pipeline');
const expected = ['AUTH','IDEMPOTENCY','CONTENT_NEG','SCHEMA_VALIDATION','TOOL_STATUS','CACHE_OR_SINGLE_FLIGHT','RATE_LIMIT','ESCROW','PROVIDER_CALL','ESCROW_FINALIZE','LEDGER_WRITE','CACHE_SET','RESPONSE'];
console.assert(JSON.stringify(PIPELINE_STAGES.map(s=>s.name)) === JSON.stringify(expected), 'Pipeline order mismatch');
console.log('OK');
"
```

**Dependencies:** Steps 11, 12, 13

---

### Step 15 — Escrow Service

**Scope:** Reserve funds before provider call, finalize (charge or refund) after. PG row-level lock prevents negative balance. ESCROW_FINALIZE + LEDGER_WRITE in one PG transaction.

**Key files:**
```
src/services/escrow.service.ts   — reserve(), finalize(), refund()
src/pipeline/stages/escrow.stage.ts          — reserve before provider
src/pipeline/stages/escrow-finalize.stage.ts — finalize after provider
```

**Escrow flow (§12.154):**
1. `reserve()`: `UPDATE accounts SET balance = balance - $cost WHERE agent_id = $1 AND balance >= $cost`
   - If 0 rows affected → 402 Payment Required
   - Creates escrow record with `status=RESERVED`
2. On provider success: `finalize()` in same PG transaction as `LEDGER_WRITE`
   - `status=RESERVED → CHARGED`
   - Append execution_ledger row
3. On provider failure: `refund()`
   - `UPDATE accounts SET balance = balance + $cost`
   - `status=RESERVED → REFUNDED`
   - Append execution_ledger row with `status=FAILED`

**Timeout hierarchy (§12.154):**
- execution_budget: 25s
- escrow_timeout: 45s
- reconciliation_timeout: pending 60s / running 120s

**Spec refs:** §12.154 (escrow model), §12.151 (payment-ledger atomicity), §4.3 (financial invariants)

**Test:**
```bash
# Agent with $100 balance → reserve $1 → balance = $99
# Finalize → balance stays $99, ledger row created
# Refund → balance = $100, ledger row with REFUNDED
```

**Dependencies:** Step 4, 14

---

### Step 16 — Cache & Single-Flight

**Scope:** Implement per-tool cache with TTL from config. Single-flight lock prevents thundering herd. Cache key: `json-stable-stringify` → SHA-256. Lock owner calls provider; waiters poll cache.

**Key files:**
```
src/services/cache.service.ts    — get(), set(), generateKey()
src/services/single-flight.service.ts — acquireLock(), waitForResult()
src/pipeline/stages/cache.stage.ts    — CACHE_OR_SINGLE_FLIGHT logic
src/pipeline/stages/cache-set.stage.ts — write result to cache
config/tool_cache.yaml                 — per-tool TTLs
```

**Cache design (§12.127, §12.144, §12.150):**
- Key: `cache:{tool_id}:{SHA256(json-stable-stringify(params))}`
- No `agent_id` in cache key (shared across agents)
- TTLs: weather 300s, crypto 5s, polymarket 0s, aviasales 60s

**Single-flight (§12.144):**
- Lock key: `lock:{tool_id}:{param_hash}`, NX, EX 30s
- Lock value: `server_instance_id`
- Waiter: poll every 500ms, max 25s
- Lock owner: full escrow + charge
- Waiters: FREE (`billing_status=FREE, cache_status=SHARED`)
- TTL=0 tools: ephemeral 5s buffer for single-flight sharing only

**Cache hit billing (§12.173):**
- Cache hit cost = `CACHE_HIT_COST_RATIO × provider_cost` (10%)
- Direct PG debit (no escrow)

**Spec refs:** §12.127 (TTLs), §12.144 (single-flight), §12.150 (cache key), §12.173 (cache billing)

**Test:**
```bash
# First request → cache miss → provider call → cache set
# Second request (within TTL) → cache hit → no provider call
# Concurrent identical requests → only 1 provider call
```

**Dependencies:** Steps 9, 14

---

## P1b — Infrastructure & Ops (Month 2, Steps 17–28)

**Goal:** CI/CD pipeline → monitoring stack → logging pipeline → 27 alert rules → Telegram notifications → backup → security hardening. GitHub Actions deploy working, all 27 alerts active.

---

### Step 17 — Docker Compose Production (10 containers)

**Scope:** Create `docker-compose.prod.yml` extending base with 10 monitoring/ops containers: prometheus, grafana, loki, promtail, alertmanager, postgres_exporter, redis_exporter, nginx_exporter, postgres_backup, node_exporter.

**Key files:**
```
docker-compose.prod.yml         — 10 production containers
```

**Containers (§12.194):**
| Container | Image | Port | Volume |
|-----------|-------|------|--------|
| prometheus | prom/prometheus:v2.51.0 | 9090 (localhost) | prometheus_data |
| grafana | grafana/grafana:10.4.0 | 3000 (localhost) | grafana_data |
| loki | grafana/loki:2.9.0 | 3100 (internal) | loki_data |
| promtail | grafana/promtail:2.9.0 | 9080 (internal) | — |
| alertmanager | prom/alertmanager:v0.27.0 | 9093 (internal) | — |
| postgres_exporter | prometheuscommunity/postgres-exporter:v0.15.0 | 9187 | — |
| redis_exporter | oliver006/redis_exporter:v1.58.0 | 9121 | — |
| nginx_exporter | nginx/nginx-prometheus-exporter:1.1.0 | 9113 | — |
| postgres_backup | prodrigestivill/postgres-backup-local:16 | 8080 | — |
| node_exporter | prom/node-exporter:v1.7.0 | 9100 | — |

**Spec refs:** §12.194 (16-container stack), §12.197 (monitoring provisioning)

**Test:**
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet && echo "OK"
```

**Dependencies:** Step 5

---

### Step 18 — Prometheus Configuration

**Scope:** Configure Prometheus scrape targets for all containers, 15s scrape interval, 15-day retention.

**Key files:**
```
prometheus/prometheus.yml       — scrape configs
```

**Scrape targets (§12.197):**
- `api:3000/metrics`
- `worker:3001/metrics`
- `outbox-worker:3002/metrics`
- `nginx_exporter:9113/metrics`
- `postgres_exporter:9187/metrics`
- `redis_exporter:9121/metrics`
- `node_exporter:9100/metrics`
- Alertmanager: `alertmanager:9093`

**Spec refs:** §12.197 (monitoring provisioning), §12.240 (alerts)

**Test:**
```bash
# Prometheus up and scraping targets
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets | length' && echo "OK"
```

**Dependencies:** Step 17

---

### Step 19 — Application Metrics (Prometheus Client)

**Scope:** Instrument API server with prom-client. Expose `/metrics` endpoint. Counters, histograms, gauges for: request count, latency, error rate, cache hits, escrow balance, rate limit hits. NO agent_id in labels (cardinality explosion).

**Key files:**
```
src/services/metrics.service.ts  — metric definitions
src/middleware/metrics.middleware.ts — request instrumentation
src/routes/metrics.router.ts     — /metrics endpoint
```

**Key metrics:**
- `http_requests_total{method, path, status}` — counter
- `http_request_duration_seconds{method, path}` — histogram
- `cache_hits_total{tool_id}` — counter
- `cache_misses_total{tool_id}` — counter
- `escrow_active_count` — gauge
- `escrow_age_seconds` — histogram
- `rate_limit_hits_total{tool_id}` — counter
- `provider_call_duration_seconds{provider}` — histogram
- `provider_errors_total{provider}` — counter
- `ledger_writes_total{status}` — counter

**Forbidden labels:** `agent_id`, `request_id` (§7 — cardinality explosion)

**Spec refs:** §12.197, §AP-2 (observability-first), §7 (no agent_id in labels)

**Test:**
```bash
curl -s http://localhost:3000/metrics | grep "http_requests_total" && echo "OK"
```

**Dependencies:** Steps 7, 18

---

### Step 20 — Prometheus Alert Rules (27 alerts)

**Scope:** Define all 27 Prometheus alert rules per §12.240. Critical severity → 1h repeat interval. Warning → 4h repeat.

**Key files:**
```
prometheus/rules/alerts.yml     — 27 alert rules
```

**Alert summary (§12.240):**
| # | Alert | Severity |
|---|-------|----------|
| 1 | EscrowLeak (stale > 60s, count > 5) | critical |
| 2 | ContainerRestartLoop (> 3 in 5m) | critical |
| 3 | OutboxLagHigh (> 5000ms for 2m) | warning |
| 4 | OutboxBacklogHigh (> 1000 for 5m) | warning |
| 5 | OutboxBacklogCritical (> 10000 for 2m) | critical |
| 6 | DiskUsageWarning (> 80% for 5m) | warning |
| 7 | DiskUsageCritical (> 90% for 2m) | critical |
| 8 | PrometheusHighCardinality (series > 500K for 10m) | warning |
| 9 | ProviderErrorRateHigh (> 20% for 5m) | warning |
| 10 | ToolUnavailable (status == unavailable for 1m) | critical |
| 11 | ClockDriftHigh (offset > 100ms for 5m) | warning |
| 12 | BackupMissing (last backup > 25h) | critical |
| 13 | PartitionCleanupFailed (count > 400 for 24h) | warning |
| 14 | HighErrorRate (> 5% for 5m) | warning |
| 15 | HighLatency (p95 > 500ms for 5m) | warning |
| 16 | PGDiskUsage (> 80% allocated) | warning |
| 17 | RedisMemoryHigh (> 1.8GB) | warning |
| 18 | RedisFragmentation (ratio > 1.5) | warning |
| 19 | WorkerStuck (heartbeat > 15s) | critical |
| 20 | DLQSizeHigh (> 100) | warning |
| 21 | LogVolumeHigh (> 100MB/h for 30m) | warning |
| 22 | RunawayAgentDetected (budget suspended) | critical |
| 23 | HighMemoryUsage (> 80% limit for 10m) | warning |
| 24 | MemoryGrowthAnomaly (> 50MB/h for 30m) | warning |
| 25 | SlowQueryAlert (PG p95 > 500ms for 10m) | warning |
| 26 | PGConnectionsHigh (> 80/100 for 5m) | warning |
| 27 | PGDeadTuplesHigh (> 1M for 30m) | warning |

**Spec refs:** §12.240 (alert registry)

**Test:**
```bash
# Validate alert rules syntax
docker exec prometheus promtool check rules /etc/prometheus/rules/alerts.yml && echo "OK"
```

**Dependencies:** Step 18

---

### Step 21 — Alertmanager + Telegram

**Scope:** Configure Alertmanager to route critical alerts every 1h and warnings every 4h to Telegram. Also email `whiteknightonhorse@gmail.com` for Phase 1.

**Key files:**
```
alertmanager/alertmanager.yml   — routing + Telegram receiver
```

**Routing (§12.240):**
- `severity: critical` → Telegram + email, repeat 1h
- `severity: warning` → Telegram + email, repeat 4h
- Group by: `alertname`, `severity`
- Group wait: 30s, group interval: 5m

**Spec refs:** §12.240 (alert routing), §12.207 (Telegram)

**Test:**
```bash
# Alertmanager healthy
curl -sf http://localhost:9093/-/healthy && echo "OK"
```

**Dependencies:** Step 20

---

### Step 22 — Log Pipeline (Loki + Promtail)

**Scope:** Configure Promtail to collect all container logs (stdout → json-file driver → Promtail → Loki). Loki 14-day retention.

**Key files:**
```
loki/loki-config.yml            — storage, retention (14 days)
promtail/promtail-config.yml    — Docker log collection
```

**Log pipeline (§12.198):**
```
container stdout → Docker json-file driver → Promtail → Loki → Grafana
```

**Retention (§12.198):**
- Loki: 14 days
- Prometheus: 15 days
- Execution ledger: 365 days (PG)
- x402 records: indefinite (PG)

**Spec refs:** §12.198 (log aggregation), §12.246 (logging rules)

**Test:**
```bash
# Loki ready
curl -sf http://localhost:3100/ready && echo "OK"
# Promtail ready
curl -sf http://localhost:9080/ready && echo "OK"
```

**Dependencies:** Step 17

---

### Step 23 — Grafana Dashboards (6 auto-provisioned)

**Scope:** Create 6 Grafana dashboards with auto-provisioning (config files, zero manual setup). Add Prometheus and Loki as datasources.

**Key files:**
```
grafana/provisioning/datasources/datasources.yml — Prometheus + Loki
grafana/provisioning/dashboards/dashboards.yml    — auto-provision config
grafana/provisioning/dashboards/json/api-overview.json
grafana/provisioning/dashboards/json/financial.json
grafana/provisioning/dashboards/json/rate-limiting.json
grafana/provisioning/dashboards/json/cache-performance.json
grafana/provisioning/dashboards/json/provider-health.json
grafana/provisioning/dashboards/json/sre-slo.json
```

**Dashboards (§12.242):**
| Dashboard | Key Panels |
|-----------|-----------|
| API Overview | req/s, p95 latency, error rate %, active agents, status distribution |
| Financial | revenue/tool, escrow balance, provider cost, margin %, daily revenue |
| Rate Limiting | tokens/s, 429 responses, top rate-limited agents |
| Cache Performance | hit rate %, single-flight shares, cache size, TTL distribution |
| Provider Health | provider p95, error rate/provider, tool status map, circuit breaker |
| SRE SLO | availability 30d, error budget remaining, p95 latency 30d |

**Spec refs:** §12.242 (Grafana dashboards), §12.197 (monitoring provisioning)

**Test:**
```bash
# Grafana healthy and dashboards provisioned
curl -sf http://localhost:3000/api/health && echo "OK"
curl -s -u admin:$GF_ADMIN_PASSWORD http://localhost:3000/api/search | jq 'length >= 6' && echo "OK"
```

**Dependencies:** Steps 18, 22

---

### Step 24 — PostgreSQL Backup Container

**Scope:** Configure postgres_backup container for daily pg_dump at 03:00 UTC. Alert if backup missed > 25h.

**Key files:**
```
docker-compose.prod.yml         — postgres_backup service config
```

**Backup config (§12.244):**
- Schedule: daily 03:00 UTC
- Format: `pg_dump -Fc` (custom format, compressed)
- Retention: 7 daily, 4 weekly (on same server, Phase 1)
- Health check: TCP 8080
- Alert: `BackupMissing` fires if `time() - last_backup > 25h`

**Phase 1 limitations (explicit in spec):**
- No offsite backup (offsite + WAL archiving deferred to Phase 2)
- RPO: 24 hours
- RTO: 1–3 hours via `bootstrap.sh`

**Spec refs:** §12.244 (cron job #4), §16 (Phase 1 scope)

**Test:**
```bash
# Backup container healthy
curl -sf http://localhost:8080/ && echo "OK"
```

**Dependencies:** Step 17

---

### Step 25 — Nginx Hardened Config

**Scope:** Finalize nginx.conf per §12.239. JSON log format, rate limiting (100r/s burst 200), TLS 1.3, custom JSON error pages (never HTML for 502/503/504), SSE support for `/mcp`, static `.well-known/` serving.

**Key files:**
```
nginx/nginx.conf                — canonical config
nginx/error-pages/502.json
nginx/error-pages/503.json
nginx/error-pages/504.json
```

**Nginx config highlights (§12.239):**
- Log: JSON format `json_combined`, stdout/stderr
- Rate limit: `limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/s`
- Upstream: `api:3000`
- Stub status: port 8080 (internal, for exporter)
- HTTP → HTTPS redirect + ACME challenge
- TLS 1.3 only, `ssl_prefer_server_ciphers off`
- Timeouts: `proxy_read_timeout 60s`, `proxy_connect_timeout 5s`
- `client_max_body_size 1m`
- `/api/` routes: burst=200 nodelay, pass `X-Request-ID`
- `/mcp`: `proxy_buffering off`, `proxy_cache off`, HTTP/1.1 (SSE)
- `/.well-known/`: static files from `/var/www/static`
- `/health/`: no rate limit
- Error pages: JSON for 502, 503, 504

**Spec refs:** §12.239 (canonical nginx config)

**Test:**
```bash
docker exec nginx nginx -t && echo "OK"
# Verify JSON error response
curl -s http://localhost/nonexistent-backend-route | jq .error && echo "OK"
```

**Dependencies:** Step 5

---

### Step 26 — Cron Jobs (Partition + Reconciliation)

**Scope:** Implement 3 application-level cron jobs: partition create (daily 23:00), partition cleanup (daily 04:00), and escrow reconciliation (every 60s).

**Key files:**
```
src/jobs/partition-create.job.ts   — create tomorrow's partitions
src/jobs/partition-cleanup.job.ts  — drop expired partitions
src/jobs/reconciliation.job.ts     — timeout stale escrows
```

**Partition create (§12.244 job #1):**
- Daily 23:00 UTC
- Creates partitions for tomorrow: `execution_ledger_YYYY_MM_DD`, `outbox_YYYY_MM_DD`, `request_metrics_YYYY_MM_DD`
- Naming: `{table}_{YYYY}_{MM}_{DD}`

**Partition cleanup (§12.244 job #2):**
- Daily 04:00 UTC
- Drop: execution_ledger > 365 days, outbox > 7 days, request_metrics > 90 days

**Reconciliation (§12.244 job #3):**
- Every 60s (runs in Worker container)
- `pending` > 60s → timeout + refund
- `running` > 120s → timeout + refund
- `provider_success` > 30s → re-finalize (idempotent)

**Spec refs:** §12.244 (cron registry), §12.155 (execution state machine), §12.154 (escrow timeout)

**Test:**
```bash
# Manually trigger partition create and verify partition exists
npx ts-node -e "require('./src/jobs/partition-create.job').run()" && \
psql $DATABASE_URL -c "\dt execution_ledger_*" | grep -q "$(date -d tomorrow +%Y_%m_%d)" && echo "OK"
```

**Dependencies:** Steps 4, 15

---

### Step 27 — Worker & Outbox-Worker Processes

**Scope:** Create worker (BullMQ job processor) and outbox-worker (transactional outbox pattern) as separate Node.js processes with health endpoints.

**Key files:**
```
src/worker/server.ts            — BullMQ worker process, port 3001
src/worker/health.ts            — GET /worker/health
src/outbox/server.ts            — outbox processor, port 3002
src/outbox/health.ts            — GET /outbox/health (§12.201)
```

**Worker health (§12.201):**
```json
{"status":"ok","lag_ms":N,"processed_total":N,"last_processed_at":"..."}
```

**Outbox pattern (§12.153, §12.176):**
- PG `outbox` table → poll for `status=PENDING` → process → update `status=PROCESSED`
- Event types: cache_invalidation, notification, webhook (Phase 2)
- Alert: `OutboxLagHigh` fires when `lag_ms > 5000` for 2 minutes

**Spec refs:** §12.201 (outbox health), §12.153 (outbox pattern), §12.194 (container startup)

**Test:**
```bash
curl -sf http://localhost:3001/worker/health | jq -e '.status == "ok"' && echo "Worker OK"
curl -sf http://localhost:3002/health | jq -e '.status == "ok"' && echo "Outbox OK"
```

**Dependencies:** Steps 7, 4

---

### Step 28 — Graceful Shutdown

**Scope:** Implement ordered graceful shutdown per §12.230. API drains in-flight requests (18s timeout + 2s buffer). Worker drains jobs (60s). Script for manual ordered shutdown.

**Key files:**
```
src/api/server.ts               — SIGTERM handler (20s grace)
src/worker/server.ts            — SIGTERM handler (60s grace)
src/outbox/server.ts            — SIGTERM handler (30s grace)
scripts/graceful-shutdown.sh    — ordered: nginx → api → worker → outbox → monitoring → redis → postgres
```

**Shutdown order (§12.230):**
```
1. SIGTERM → nginx         (10s grace)
2. SIGTERM → api           (20s: 18s drain + 2s buffer)
3. SIGTERM → worker        (60s: drain jobs)
4. SIGTERM → outbox-worker (30s: drain events)
5. Stop monitoring containers
6. SIGTERM → redis         (10s: AOF flush)
7. SIGTERM → postgres      (30s: WAL flush, checkpoint)
```

**Spec refs:** §12.230 (graceful shutdown), §9 (reliability)

**Test:**
```bash
# Send request, trigger shutdown, verify request completes
curl -s http://localhost:3000/health/ready &
bash scripts/graceful-shutdown.sh
wait  # curl should have returned 200
echo "OK"
```

**Dependencies:** Steps 7, 27

---

## P1c — First Product (Month 3, Steps 29–40)

**Goal:** UC-001 Polymarket + UC-005 Weather working → x402 testnet → MCP discovery → agent can discover and call tools via MCP. Full end-to-end flow.

---

### Step 29 — Tool Registry & Catalog API

**Scope:** Implement `/api/v1/tools` endpoint returning tool catalog. Tool versioning (suffix `_v2`). `Cache-Control: public, max-age=3600`. Require `Accept: application/json` (406 otherwise).

**Key files:**
```
src/routes/tools.router.ts      — GET /api/v1/tools, GET /api/v1/tools/:toolId
src/services/tool-registry.service.ts — tool catalog from PG
```

**Tool entry fields (§6.15):**
```json
{
  "id": "weather.get_current",
  "name": "Get Current Weather",
  "description": "...",
  "endpoint": "/api/v1/tools/weather.get_current",
  "method": "GET",
  "category": "weather",
  "pricing": {"price_usd": 0.001, "cache_hit_price_usd": 0.0001},
  "input_schema": {...}
}
```

**Spec refs:** §6.15 (Agent Tool Index), §6.2 (URL structure), §12.43 (TOOL_STATUS stage)

**Test:**
```bash
# Valid request → 200 + tools array
curl -sf http://localhost:3000/api/v1/tools \
  -H "Authorization: Bearer ak_live_test_0000000000000000000000000000" \
  -H "Accept: application/json" | jq '.tools | length > 0' && echo "OK"
# Missing Accept → 406
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/tools \
  -H "Authorization: Bearer ak_live_test_0000000000000000000000000000" | grep -q 406 && echo "OK"
```

**Dependencies:** Steps 9, 11

---

### Step 30 — Schema Validation Stage

**Scope:** Validate tool request parameters against JSON Schema (zod). Reject with 400 + `schema_validation_failed` on invalid params. Per-tool input schemas defined in tool config.

**Key files:**
```
src/pipeline/stages/schema-validation.stage.ts — zod validation
src/schemas/weather.schema.ts                  — weather tool schemas
src/schemas/polymarket.schema.ts               — polymarket tool schemas
```

**Spec refs:** §12.43 (SCHEMA_VALIDATION stage), §12.243 (error codes)

**Test:**
```bash
# Invalid params → 400
curl -s http://localhost:3000/api/v1/tools/weather.get_current \
  -H "Authorization: Bearer ak_live_test_0000000000000000000000000000" \
  -H "Accept: application/json" | jq -e '.error == "schema_validation_failed"' && echo "OK"
```

**Dependencies:** Step 14

---

### Step 31 — Provider Adapter Framework

**Scope:** Create the three-layer wrapper architecture: Protocol Adapter → Semantic Normalizer → Payment Injector. Abstract base class with timeout (10s), retries (2, exponential backoff), structured error handling.

**Key files:**
```
src/adapters/base.adapter.ts        — abstract adapter with timeout/retry
src/normalizers/base.normalizer.ts  — abstract normalizer
src/types/provider.ts               — ProviderResponse, ProviderError types
```

**Three-layer architecture (§10):**
1. **Protocol Adapter** — auth, pagination, rate limiting, retry per provider
2. **Semantic Normalizer** — provider fields → canonical domain model
3. **Referral + Payment Injector** — affiliate IDs, x402 headers

**Provider call constraints:**
- Timeout: 10s
- Retries: 2 with exponential backoff
- Max response: 1MB raw, 512KB normalized
- On failure: structured error with provider name, status code, duration

**Spec refs:** §10 (API schema), §12.43 (PROVIDER_CALL stage)

**Test:**
```bash
# Unit test: adapter handles timeout correctly
npx jest --testPathPattern=adapters/base.adapter.test.ts && echo "OK"
```

**Dependencies:** Step 14

---

### Step 32 — UC-005 Weather Provider (OpenWeatherMap)

**Scope:** Implement weather adapter + normalizer for OpenWeatherMap. Tools: `weather.get_current`, `weather.get_forecast`. Cache TTL: 300s (current), 600s (forecast). This is the best first demo UC — zero payments, zero legal risk.

**Key files:**
```
src/adapters/openweathermap/index.ts          — OWM API adapter
src/adapters/openweathermap/types.ts          — OWM response types
src/normalizers/weather.normalizer.ts         — normalize to canonical weather model
src/schemas/weather.schema.ts                 — input validation (city, lat/lon, units)
```

**Tools:**
- `weather.get_current` — current weather by city/coordinates, TTL 300s, price $0.001
- `weather.get_forecast` — 5-day forecast, TTL 600s, price $0.002

**Provider details:**
- API: `https://api.openweathermap.org/data/2.5/weather`, `/data/2.5/forecast`
- Auth: `appid` query param
- Free tier: 1000 calls/day

**Spec refs:** UC-005 spec file, §12.127 (TTLs)

**Test:**
```bash
# End-to-end: call weather tool with test agent
curl -sf "http://localhost:3000/api/v1/tools/weather.get_current?city=Berlin" \
  -H "Authorization: Bearer ak_live_test_0000000000000000000000000000" \
  -H "Accept: application/json" | jq -e '.data.temperature' && echo "OK"
```

**Dependencies:** Steps 30, 31

---

### Step 33 — UC-001 Polymarket Provider

**Scope:** Implement Polymarket adapter + normalizer. Tools: `polymarket.search`, `polymarket.market_detail`, `polymarket.prices`, `polymarket.orderbook` (TTL 0s). Geo-fence: block US requests.

**Key files:**
```
src/adapters/polymarket/index.ts              — Polymarket API adapter (Gamma, CLOB, Data APIs)
src/adapters/polymarket/types.ts              — Polymarket response types
src/normalizers/polymarket.normalizer.ts      — normalize to canonical prediction market model
src/schemas/polymarket.schema.ts              — input validation
src/config/geo-restrictions.ts                — US geo-fence for UC-001
```

**Tools:**
- `polymarket.search` — search markets, TTL 30s, price $0.0005
- `polymarket.market_detail` — market details, TTL 30s, price $0.0005
- `polymarket.prices` — current prices, TTL 0s, price $0.0005
- `polymarket.orderbook` — order book, TTL 0s, price $0.001

**Geo-restriction (§8.8):** US jurisdiction → HTTP 451 `{"error":"geo_restricted","jurisdiction":"US"}`

**Spec refs:** UC-001 spec file, §12.127 (TTLs), §8.8 (legal compliance)

**Test:**
```bash
# Call polymarket search
curl -sf "http://localhost:3000/api/v1/tools/polymarket.search?query=election" \
  -H "Authorization: Bearer ak_live_test_0000000000000000000000000000" \
  -H "Accept: application/json" | jq -e '.data' && echo "OK"
```

**Dependencies:** Steps 30, 31

---

### Step 34 — Execution Ledger Write

**Scope:** Implement LEDGER_WRITE stage. Append-only execution record for every request (including cache hits with cost=0). Atomic with ESCROW_FINALIZE (one PG transaction).

**Key files:**
```
src/pipeline/stages/ledger-write.stage.ts    — append execution record
src/services/ledger.service.ts               — write to execution_ledger table
```

**Ledger record fields:**
- `execution_id` (UUID)
- `agent_id`, `tool_id`
- `status` (success/failed/timeout/shared_success)
- `cost_usd`, `billing_status` (CHARGED/FREE/REFUNDED)
- `cache_status` (MISS/HIT/SHARED)
- `provider_duration_ms`
- `idempotency_key`
- `created_at`
- `shared_from_execution_id` (for single-flight waiters)

**Atomicity (§12.151):**
- ESCROW_FINALIZE + LEDGER_WRITE = one `BEGIN/COMMIT` PG transaction
- On provider error: refund + REFUNDED ledger row in same transaction

**Spec refs:** §12.146 (execution ledger), §12.151 (atomicity), §AP-9 (immutable audit trail)

**Test:**
```bash
# After a tool call, verify ledger row exists
psql $DATABASE_URL -c "SELECT COUNT(*) FROM execution_ledger WHERE tool_id='weather.get_current'" | grep -q "[1-9]" && echo "OK"
```

**Dependencies:** Steps 15, 14

---

### Step 35 — Agent Registration

**Scope:** Implement agent registration: explicit (`POST /api/v1/agents/register`) and implicit (auto-create anonymous on first request). KYA Basic level. Return `agent_id` + `api_key` (shown once).

**Key files:**
```
src/routes/agents.router.ts     — POST /api/v1/agents/register
src/services/agent.service.ts   — create agent, auto-register
```

**Explicit registration (§9.3):**
```
POST /api/v1/agents/register
Body: {"agent_name":"...","agent_version":"...","public_key":"optional"}
Response: {"agent_id":"agt_...","api_key":"ak_live_...","status":"active","rate_limits":{...}}
```

**Implicit registration:**
- Agent sends request without valid API key but with `X-Agent-Name` header
- System auto-creates anonymous agent (100 req/day limit)

**KYA levels (Phase 1):**
| Level | Requirements | Limit |
|-------|-------------|-------|
| Anonymous | Auto-create | 100 req/day |
| Basic | Explicit register | $10/day |

**Freemium:** 1000 calls/month per account, max 3 free agents per account

**Spec refs:** §9.3 (KYA), §12.60 (API key format)

**Test:**
```bash
# Register new agent
curl -sf -X POST http://localhost:3000/api/v1/agents/register \
  -H "Content-Type: application/json" \
  -d '{"agent_name":"test-bot","agent_version":"1.0"}' | jq -e '.api_key | startswith("ak_live_")' && echo "OK"
```

**Dependencies:** Steps 10, 11

---

### Step 36 — MCP Server Endpoint

**Scope:** Implement MCP (Model Context Protocol) server at `/mcp` using SSE transport (Phase 1 — no WebSocket). Expose tools as MCP tools. Handle tool list and tool call requests.

**Key files:**
```
src/mcp/server.ts               — MCP server with SSE transport
src/mcp/tool-adapter.ts         — convert tool catalog to MCP tool definitions
src/mcp/types.ts                — MCP protocol types
```

**MCP requirements:**
- Endpoint: `https://apibase.pro/mcp`
- Transport: SSE (Phase 1, WebSocket deferred to Phase 2+)
- Operations: `tools/list`, `tools/call`
- Each tool call routes through the 13-stage pipeline

**Spec refs:** §12.1 (MCP), §6.14 (MCP discovery), §16 (SSE only Phase 1)

**Test:**
```bash
# MCP tools/list returns tools
curl -sf http://localhost:3000/mcp \
  -H "Authorization: Bearer ak_live_test_0000000000000000000000000000" \
  -H "Accept: text/event-stream" -N | head -5 && echo "OK"
```

**Dependencies:** Steps 29, 14

---

### Step 37 — MCP Discovery Stack

**Scope:** Serve static `.well-known/` files for agent discoverability. Three-level discovery: `mcp.json` → `/api/tools` → `ai-capabilities.json`.

**Key files:**
```
static/.well-known/mcp.json              — MCP server manifest (§6.14)
static/.well-known/ai-capabilities.json  — semantic capabilities (§6.16)
static/.well-known/openapi.json          — OpenAPI 3.1 spec
static/.well-known/x402-payment.json     — payment info
static/.well-known/kya-policy.json       — KYA verification policy
static/robots.txt
static/ai.txt
static/llms.txt
```

**Three-level discovery (§6.16):**
| Level | Endpoint | Agent question |
|-------|----------|---------------|
| 1 | `/.well-known/mcp.json` | Where is the MCP server? |
| 2 | `/api/tools` | What tools are available? |
| 3 | `/.well-known/ai-capabilities.json` | What tasks can this platform solve? |

**Cache-Control:** `public, max-age=3600` for all `.well-known/` files

**Spec refs:** §6.14 (MCP discovery), §6.15 (tool index), §6.16 (capability manifest)

**Test:**
```bash
curl -sf https://localhost/.well-known/mcp.json | jq -e '.protocol == "MCP"' && echo "OK"
curl -sf https://localhost/.well-known/ai-capabilities.json | jq -e '.capabilities | length > 0' && echo "OK"
```

**Dependencies:** Step 25

---

### Step 38 — x402 Payment Middleware (Testnet)

**Scope:** Implement x402 payment flow for testnet (Base Sepolia). Agent receives 402 → pays USDC → receives data. Receipt replay via idempotency key. Price lock 60s window.

**Key files:**
```
src/middleware/x402.middleware.ts    — x402 payment verification
src/services/receipt.service.ts     — receipt storage + replay
src/config/x402.config.ts           — testnet config (Base Sepolia)
```

**x402 flow (§8.6–8.9):**
1. Agent calls paid tool without payment → 402 with `price_usd`, `payment_address`, `price_version`
2. Agent sends USDC payment on Base Sepolia
3. Agent retries request with payment receipt
4. Middleware verifies receipt on-chain
5. Pipeline continues from ESCROW stage

**Receipt replay (§8.7):**
- `idempotency_key = SHA256(payment_tx_hash + request_hash)`
- 1 payment = 1 execution, cached 24h for replay
- `GET /x402/retrieve/{receipt_id}`

**Phase 1:** Testnet only (Base Sepolia), agent starts with 1000 testnet credits

**Packages:** `@x402/express`, `@x402/evm`

**Spec refs:** §8.6–8.9 (x402), §16 (testnet only Phase 1)

**Test:**
```bash
# Paid tool without payment → 402
curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:3000/api/v1/tools/polymarket.orderbook?market_id=test" \
  -H "Authorization: Bearer ak_live_test_0000000000000000000000000000" \
  -H "Accept: application/json" | grep -q 402 && echo "OK"
```

**Dependencies:** Steps 14, 15

---

### Step 39 — Smart Onboarding Form

**Scope:** Implement `/onboard` — dual access (HTML form for humans, JSON API for agents). Validation + honeypot + rate limit (5 req/IP/hour). LLM content moderation queue.

**Key files:**
```
src/routes/onboard.router.ts        — GET (HTML) + POST (JSON)
src/services/onboard.service.ts     — validation, moderation queue
templates/onboard.html              — minimal HTML form
```

**Form fields (§6.12):**
- `company_name`, `api_url`, `contact_email`
- `category` (travel/food/finance/e-commerce/other)
- `description` (500 chars max)
- `affiliate_program` (optional), `monthly_volume` (optional)
- `_honeypot` (hidden, anti-spam)

**Dual access:**
- `GET /onboard` + `Accept: text/html` → HTML form
- `POST /onboard` + `Content-Type: application/json` → JSON API

**Response (§6.12):**
```json
{"status":"accepted","submission_id":"sub_abc123","message":"...","estimated_processing":"24-48 hours"}
```

**Error codes:** 422 (validation), 429 (rate limit 5/IP/hour)

**Spec refs:** §6.12 (Smart Onboarding), §AP-10 (minimal human involvement)

**Test:**
```bash
# JSON API submission
curl -sf -X POST http://localhost:3000/onboard \
  -H "Content-Type: application/json" \
  -d '{"company_name":"Test","api_url":"https://api.test.com","contact_email":"test@test.com","category":"other","description":"Test API"}' \
  | jq -e '.status == "accepted"' && echo "OK"
# Honeypot rejection
curl -sf -X POST http://localhost:3000/onboard \
  -H "Content-Type: application/json" \
  -d '{"company_name":"Test","api_url":"https://api.test.com","contact_email":"test@test.com","category":"other","description":"Test","_honeypot":"spam"}' \
  -o /dev/null -w "%{http_code}" | grep -q 200 && echo "OK"  # silently accepted but discarded
```

**Dependencies:** Step 7

---

### Step 40 — Smoke Test Suite

**Scope:** Implement the 8 smoke tests from §12.199 as an executable script. This validates the complete end-to-end flow after deployment.

**Key files:**
```
scripts/smoke-test.sh           — 8 automated smoke tests
```

**Smoke tests (§12.199):**
1. `GET /health/ready` → 200
2. `GET /api/v1/tools` → 200 + tools > 0
3. `GET /api/v1/tools/weather.get_current?city=Berlin` → 200 + data field
4. Parse response → `data` + `request_id` present
5. `GET /.well-known/mcp.json` → 200 + valid JSON
6. `GET /api/v1/tools` without `Accept` → 406
7. `GET /api/v1/tools/weather.get_current` without API key → 401
8. Check `X-RateLimit-*` headers present

**Spec refs:** §12.199 (smoke tests)

**Test:**
```bash
bash scripts/smoke-test.sh && echo "ALL 8 SMOKE TESTS PASSED"
```

**Dependencies:** Steps 8, 11, 25, 29, 32, 37

---

## P1d — Stabilization (Month 4, Steps 41–45)

**Goal:** Load testing → chaos testing → SLO verification → production runbook → 1,000 agents without degradation, 99.9% availability confirmed.

---

### Step 41 — CI/CD Pipeline (GitHub Actions)

**Scope:** GitHub Actions workflow: lint → typecheck → test → build Docker image → SSH deploy to Hetzner → run smoke tests. Deploy strategy: `docker compose up -d` (5–10s downtime acceptable Phase 1).

**Key files:**
```
.github/workflows/deploy.yml    — CI/CD pipeline
.github/workflows/test.yml      — lint + typecheck + unit tests on PR
scripts/deploy.sh               — SSH deploy script
```

**CI/CD pipeline:**
1. `npm run lint` — ESLint
2. `npm run typecheck` — tsc --noEmit
3. `npm run test` — Jest unit tests
4. `docker build` → push to GHCR
5. SSH to Hetzner → `docker compose pull && docker compose up -d`
6. Run `scripts/smoke-test.sh` on remote
7. If smoke fails → rollback to previous image tag

**Deploy strategy (Phase 1):** 5–10s downtime acceptable; zero-downtime deferred to Phase 2

**Spec refs:** §12.194 (containers), §16 (Phase 1 deploy strategy)

**Test:**
```bash
# Validate workflow syntax
act -l 2>/dev/null || echo "Validate via GitHub Actions UI"
```

**Dependencies:** Steps 1–40

---

### Step 42 — Load Testing (k6)

**Scope:** Write k6 load test scripts simulating 1,000 concurrent agents. Validate: P95 < 500ms, error rate < 1%, no escrow leaks, no double charges under load.

**Key files:**
```
tests/load/k6-config.js         — k6 test configuration
tests/load/scenarios/            — load test scenarios
  tools-api.js                   — tool call load test
  registration.js                — agent registration load test
  mixed-workload.js              — realistic mixed workload
```

**Load test targets (§16 P1d):**
- 1,000 concurrent agents
- 100 req/s sustained
- P95 latency < 500ms
- Error rate < 1%
- Zero double charges (idempotency)
- Zero orphaned escrows after test

**Verification queries post-test:**
```sql
-- No orphaned escrows
SELECT COUNT(*) FROM execution_ledger WHERE status = 'pending' AND created_at < NOW() - INTERVAL '2 minutes';
-- No double charges
SELECT idempotency_key, COUNT(*) FROM execution_ledger WHERE billing_status = 'CHARGED' GROUP BY idempotency_key HAVING COUNT(*) > 1;
```

**Spec refs:** §16 (P1d scope), §12.185 (invariants)

**Test:**
```bash
k6 run tests/load/scenarios/mixed-workload.js && echo "OK"
```

**Dependencies:** Steps 1–40

---

### Step 43 — Chaos Testing

**Scope:** Test system resilience: Redis restart, PG disk pressure simulation, provider timeout simulation, concurrent identical requests. Verify fail-closed behavior and self-healing.

**Key files:**
```
tests/chaos/redis-restart.sh     — kill Redis, verify fail-closed, restart, verify recovery
tests/chaos/pg-disk-pressure.sh  — simulate PG disk full, verify pipeline aborts before provider call
tests/chaos/provider-timeout.sh  — simulate 10s+ provider timeout, verify escrow refund
tests/chaos/thundering-herd.sh   — 100 identical concurrent requests, verify single provider call
```

**Chaos scenarios:**
1. **Redis down (§12.186):** `/health/ready` → 503, all tool requests rejected, Redis restarts → traffic restored
2. **PG disk full (§12.187):** ESCROW_RESERVE fails → 500 → NO provider call → no financial damage
3. **Provider timeout:** provider > 10s → timeout → escrow refund → ledger row with FAILED
4. **Thundering herd (§12.144):** 100 concurrent identical requests → 1 provider call, 99 waiters → all get result

**Spec refs:** §12.186 (Redis fail-closed), §12.187 (PG disk full), §12.144 (single-flight), §9 (reliability)

**Test:**
```bash
bash tests/chaos/redis-restart.sh && echo "Redis chaos OK"
bash tests/chaos/thundering-herd.sh && echo "Single-flight OK"
```

**Dependencies:** Steps 1–40

---

### Step 44 — Bootstrap Script

**Scope:** Create `bootstrap.sh` — takes a clean Hetzner server from zero to production in 2–3 minutes. Installs Docker, pulls images, starts stack, runs migrations, seeds data, runs smoke tests.

**Key files:**
```
scripts/bootstrap.sh            — clean server → production
```

**Bootstrap sequence (§12.69, §12.194):**
1. Update system packages
2. Install Docker + Docker Compose
3. Configure UFW (22, 80, 443 only)
4. Create `appuser:1001`
5. Clone repo / download release
6. Decrypt `.env.enc` → `.env` (chmod 600)
7. `docker compose -f docker-compose.yml -f docker-compose.prod.yml pull`
8. `docker compose up -d` (entrypoint.sh handles migrations + seed)
9. Wait for `/health/ready` → 200
10. Run `scripts/smoke-test.sh`
11. Setup certbot for TLS
12. Setup host cron jobs (certbot renewal, Docker image prune)

**UFW rules (§12.245):**
```
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw default deny incoming
```

**Spec refs:** §12.69 (bootstrap), §12.194 (startup), §12.245 (ports)

**Test:**
```bash
# On a fresh Hetzner server:
bash scripts/bootstrap.sh && bash scripts/smoke-test.sh && echo "BOOTSTRAP OK"
```

**Dependencies:** Steps 1–40

---

### Step 45 — SLO Verification & Production Runbook

**Scope:** Verify SLO targets over 24h observation window. Create production runbook documenting all operational procedures. Final sign-off checklist.

**Key files:**
```
docs/runbook.md                 — production operations runbook
docs/slo-report.md              — SLO verification results
```

**SLO targets (§16 P1d):**
- Availability: 99.9% (< 8.76h downtime/year)
- P95 latency: < 500ms
- Error rate: < 1%
- Escrow leak count: 0
- Data loss: 0 (PG + backup verified)
- Recovery time: < 3h (bootstrap.sh)

**Runbook sections:**
- Container management (start, stop, restart, logs)
- Database operations (backup, restore, partition management)
- Monitoring (Grafana access, alert triage)
- Incident response (escalation, rollback, kill switch)
- Scaling triggers (>10K agents → add servers)
- Security (key rotation, audit, cert renewal)

**Sign-off checklist:**
- [ ] All 8 smoke tests pass
- [ ] All 27 alert rules active
- [ ] 6 Grafana dashboards provisioned
- [ ] Backup container running (daily 03:00 UTC)
- [ ] Partition cron jobs active
- [ ] Reconciliation running (every 60s)
- [ ] TLS certificate valid
- [ ] UFW configured (22, 80, 443 only)
- [ ] Container security matrix verified
- [ ] k6 load test: 1000 agents without degradation
- [ ] Chaos tests pass (Redis restart, PG pressure, provider timeout)
- [ ] x402 testnet flow complete (402 → pay → 200)
- [ ] MCP discovery stack serves valid manifests
- [ ] UC-005 weather tool returns real data
- [ ] UC-001 polymarket tool returns real data
- [ ] Execution ledger has no orphaned records
- [ ] Graceful shutdown completes in-flight requests

**Spec refs:** §16 (P1d scope), §12.185 (invariants), §12.199 (smoke tests)

**Test:**
```bash
# 24h observation → generate SLO report
# Manual: review Grafana SRE SLO dashboard
echo "SLO verification requires 24h observation window"
```

**Dependencies:** Steps 41–44

---

## Dependency Graph Summary

```
Step 1 (scaffold)
├── Step 2 (config)
│   ├── Step 3 (logger)
│   ├── Step 4 (prisma)
│   │   ├── Step 9 (seed)
│   │   ├── Step 15 (escrow) ← Step 14
│   │   ├── Step 26 (cron jobs) ← Step 15
│   │   ├── Step 27 (worker/outbox)
│   │   └── Step 34 (ledger) ← Step 14
│   └── Step 10 (api-key)
│       └── Step 11 (auth) ← Step 7
│           ├── Step 12 (idempotency) ← Step 8
│           ├── Step 13 (rate-limit) ← Step 8
│           ├── Step 29 (tool catalog) ← Step 9
│           └── Step 35 (agent registration)
├── Step 5 (docker base) ← Steps 1-4
│   ├── Step 6 (security hardening)
│   ├── Step 17 (docker prod)
│   │   ├── Step 18 (prometheus)
│   │   │   ├── Step 19 (app metrics) ← Step 7
│   │   │   ├── Step 20 (alert rules)
│   │   │   │   └── Step 21 (alertmanager)
│   │   │   └── Step 23 (grafana) ← Step 22
│   │   ├── Step 22 (loki/promtail)
│   │   └── Step 24 (backup)
│   └── Step 25 (nginx)
│       └── Step 37 (MCP discovery)
├── Step 7 (express) ← Steps 3, 5
│   ├── Step 8 (health) ← Step 5
│   ├── Step 28 (graceful shutdown) ← Step 27
│   └── Step 39 (onboard form)
└── Step 14 (pipeline) ← Steps 11, 12, 13
    ├── Step 30 (schema validation)
    ├── Step 31 (adapter framework)
    │   ├── Step 32 (UC-005 weather) ← Step 30
    │   └── Step 33 (UC-001 polymarket) ← Step 30
    ├── Step 16 (cache/single-flight) ← Step 9
    ├── Step 36 (MCP server) ← Step 29
    └── Step 38 (x402) ← Step 15

Step 40 (smoke tests) ← Steps 8, 11, 25, 29, 32, 37
Step 41 (CI/CD) ← Steps 1-40
Step 42 (load test) ← Steps 1-40
Step 43 (chaos test) ← Steps 1-40
Step 44 (bootstrap) ← Steps 1-40
Step 45 (SLO) ← Steps 41-44
```

---

## Quick Reference

| Milestone | Steps | Duration | Completion Criterion |
|-----------|-------|----------|---------------------|
| **P1a** | 1–16 | Month 1 | `smoke-test.sh` passes on clean server |
| **P1b** | 17–28 | Month 2 | GitHub Actions deploy working, 27 alerts active |
| **P1c** | 29–40 | Month 3 | Agent discovers and calls tool via MCP |
| **P1d** | 41–45 | Month 4 | 1,000 agents, SLO 99.9% confirmed |

**Total:** 45 steps, ~45 Claude Code iterations, 4 months.

---

*Spec authority: APIbase_Product_Spec_v2.1.md (v2.1-final, frozen)*
*Generated: 2026-03-08*
