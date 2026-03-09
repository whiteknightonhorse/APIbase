#!/usr/bin/env bash
set -euo pipefail

# APIbase.pro — Ordered Graceful Shutdown (§12.230)
#
# docker compose down sends SIGTERM to ALL containers in parallel.
# This script enforces the correct ordered shutdown:
#   1. nginx         (10s) — stop accepting new connections
#   2. api           (20s) — drain in-flight requests
#   3. worker        (60s) — drain active jobs
#   4. outbox-worker (30s) — drain outbox events
#   5. monitoring    (10s) — prometheus, grafana, loki, promtail, alertmanager, exporters
#   6. redis         (10s) — AOF flush
#   7. postgres      (30s) — WAL flush, checkpoint
#
# Usage:
#   bash scripts/graceful-shutdown.sh
#   bash scripts/graceful-shutdown.sh --compose-file docker-compose.yml -f docker-compose.prod.yml

COMPOSE_FILES="${*:---file docker-compose.yml --file docker-compose.prod.yml}"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $1"
}

stop_container() {
  local name="$1"
  local timeout="$2"
  log "Stopping ${name} (timeout: ${timeout}s)..."
  docker compose ${COMPOSE_FILES} stop --timeout "${timeout}" "${name}" 2>/dev/null || true
}

# --- Phase 1: Stop accepting traffic ---
log "=== Phase 1: Stop accepting traffic ==="
stop_container nginx 10

# --- Phase 2: Drain application processes ---
log "=== Phase 2: Drain application processes ==="
stop_container api 20
stop_container worker 60
stop_container outbox-worker 30

# --- Phase 3: Stop monitoring ---
log "=== Phase 3: Stop monitoring ==="
for svc in prometheus grafana loki promtail alertmanager \
           postgres_exporter redis_exporter nginx_exporter node_exporter postgres_backup; do
  stop_container "${svc}" 10
done

# --- Phase 4: Stop infrastructure (last) ---
log "=== Phase 4: Stop infrastructure ==="
stop_container redis 10
stop_container postgres 30

log "=== Graceful shutdown complete ==="
