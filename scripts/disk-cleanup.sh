#!/usr/bin/env bash
# disk-cleanup.sh — Daily disk maintenance for apibase.pro (Hetzner 150GB)
# Runs via systemd timer: apibase-disk-cleanup.timer (01:00 UTC daily)
# Idempotent, safe to run manually at any time.

set -euo pipefail

WARN_THRESHOLD=70
CRIT_THRESHOLD=85
WAL_DIR="/opt/backups/pg/wal"
WAL_MAX_AGE_HOURS=24
TMP_MAX_AGE_DAYS=7
SYSLOG_ROTATE_SIZE_MB=100

log() { echo "[disk-cleanup] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $1"; }

# 1) WAL rotation — delete files older than 24h
if [ -d "$WAL_DIR" ]; then
    count=$(find "$WAL_DIR" -maxdepth 1 -type f -mmin +$((WAL_MAX_AGE_HOURS * 60)) 2>/dev/null | wc -l)
    if [ "$count" -gt 0 ]; then
        find "$WAL_DIR" -maxdepth 1 -type f -mmin +$((WAL_MAX_AGE_HOURS * 60)) -delete
        log "INFO  Deleted $count WAL files older than ${WAL_MAX_AGE_HOURS}h"
    else
        log "INFO  No stale WAL files found"
    fi
else
    log "INFO  WAL directory $WAL_DIR does not exist, skipping"
fi

# 2) Docker cleanup — dangling images + build cache + old unused images
pruned=$(docker image prune -f 2>/dev/null | tail -1)
log "INFO  Docker dangling prune: $pruned"

# 2b) Build cache cleanup (biggest disk hog — can grow to 30-40GB)
cache_pruned=$(docker builder prune --all --force 2>/dev/null | tail -1)
log "INFO  Docker build cache prune: $cache_pruned"

# 2c) Remove unused images older than 48h (keeps currently running + recently built)
old_pruned=$(docker image prune -a --filter "until=48h" --force 2>/dev/null | tail -1)
log "INFO  Docker old image prune (>48h): $old_pruned"

# 3) /tmp cleanup — files older than 7 days
tmp_count=$(find /tmp -type f -mtime +$TMP_MAX_AGE_DAYS 2>/dev/null | wc -l)
if [ "$tmp_count" -gt 0 ]; then
    find /tmp -type f -mtime +$TMP_MAX_AGE_DAYS -delete 2>/dev/null || true
    log "INFO  Deleted $tmp_count temp files older than ${TMP_MAX_AGE_DAYS} days"
fi

# 4) Force syslog rotation if syslog.1 > 100MB
if [ -f /var/log/syslog.1 ]; then
    syslog_size_mb=$(du -m /var/log/syslog.1 2>/dev/null | cut -f1)
    if [ "${syslog_size_mb:-0}" -gt "$SYSLOG_ROTATE_SIZE_MB" ]; then
        logrotate -f /etc/logrotate.d/rsyslog 2>/dev/null || true
        log "INFO  Forced syslog rotation (syslog.1 was ${syslog_size_mb}MB)"
    fi
fi

# 5) Disk usage check — escalate cleanup if needed
usage=$(df / --output=pcent | tail -1 | tr -d ' %')
if [ "$usage" -ge "$CRIT_THRESHOLD" ]; then
    log "CRIT  Disk usage ${usage}% >= ${CRIT_THRESHOLD}% — running emergency cleanup"

    # Emergency: prune ALL unused images (not just >48h)
    docker image prune -a --force 2>/dev/null | tail -1 | xargs -I{} log "INFO  Emergency image prune: {}" || true

    # Emergency: clean Docker logs (can grow huge)
    find /var/lib/docker/containers/ -name "*-json.log" -size +50M -exec truncate -s 10M {} \; 2>/dev/null || true
    log "INFO  Truncated Docker container logs >50MB"

    # Emergency: clean old journal logs
    journalctl --vacuum-size=100M 2>/dev/null || true
    log "INFO  Vacuumed journald to 100MB"

    # Re-check
    usage_after=$(df / --output=pcent | tail -1 | tr -d ' %')
    if [ "$usage_after" -ge "$CRIT_THRESHOLD" ]; then
        log "CRIT  Disk still at ${usage_after}% after emergency cleanup — manual intervention needed"
        exit 1
    else
        log "INFO  Emergency cleanup successful: ${usage}% → ${usage_after}%"
    fi
elif [ "$usage" -ge "$WARN_THRESHOLD" ]; then
    log "WARN  Disk usage ${usage}% >= ${WARN_THRESHOLD}%"
else
    log "INFO  Disk usage ${usage}% — healthy"
fi
