#!/usr/bin/env bash
# Relaunch supervisor if it died while still inside the active 9h window.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
RS="$STATE/run-state.json"
[ -f "$RS" ] || exit 0
DL=$(grep -oE '"deadline":[0-9]+' "$RS" | cut -d: -f2)
[ -z "$DL" ] && exit 0
NOW=$(date +%s)
[ "$NOW" -ge "$DL" ] && exit 0   # window over; nothing to do
PID=$(cat "$STATE/supervisor.pid" 2>/dev/null)
if [ -z "$PID" ]; then rm -f "$RS"; exit 0; fi   # pidfile removed = clean finish (not a crash) -> clean stale run-state, no relaunch
if kill -0 "$PID" 2>/dev/null && grep -q supervisor.sh "/proc/$PID/cmdline" 2>/dev/null; then exit 0; fi   # alive (same process, not a PID-reuse impostor)
log "WATCHDOG: supervisor CRASHED (pid $PID dead, pidfile present) inside window -> relaunching"
setsid nohup bash "$ORCH/supervisor.sh" >> "$LOGS/supervisor-relaunch.log" 2>&1 < /dev/null &
