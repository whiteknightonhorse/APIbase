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

# 2) Docker dangling image prune
pruned=$(docker image prune -f 2>/dev/null | tail -1)
log "INFO  Docker prune: $pruned"

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

# 5) Disk usage alert
usage=$(df / --output=pcent | tail -1 | tr -d ' %')
if [ "$usage" -ge "$CRIT_THRESHOLD" ]; then
    log "CRIT  Disk usage ${usage}% >= ${CRIT_THRESHOLD}% — immediate attention required"
    exit 1
elif [ "$usage" -ge "$WARN_THRESHOLD" ]; then
    log "WARN  Disk usage ${usage}% >= ${WARN_THRESHOLD}%"
else
    log "INFO  Disk usage ${usage}% — healthy"
fi
