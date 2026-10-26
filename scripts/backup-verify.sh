#!/bin/bash
# T-0571: scheduled integrity check of every dump in backups/daily: gzip -t and sha256 against the
# .sha256 that backup-encrypt.sh records when it first sees the dump.
# Usage: backup-verify.sh [--dumps-dir <dir>] [--outbox <file>]
# Last stdout line: "BACKUP-VERIFY OK checked=<n>" or "BACKUP-VERIFY FAIL checked=<n> bad=<m>: <names>" (exit 1).
# On failure one JSON line {"event":"backup_verify_failed",...} is appended to the outbox file for the
# incident engine (default: backups/verify-outbox.jsonl).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DUMPS="$ROOT/backups/daily"
OUTBOX="$ROOT/backups/verify-outbox.jsonl"

while [ $# -gt 0 ]; do
  case "$1" in
    --dumps-dir) DUMPS="$2"; shift 2 ;;
    --outbox) OUTBOX="$2"; shift 2 ;;
    *) echo "unknown argument $1" >&2; exit 2 ;;
  esac
done

CHECKED=0
BAD=()
shopt -s nullglob
for f in "$DUMPS"/*-[0-9]*.sql.gz; do
  name="$(basename "$f")"
  CHECKED=$((CHECKED + 1))
  if ! gzip -t "$f" 2>/dev/null; then BAD+=("$name:gzip"); continue; fi
  if [ ! -s "$f.sha256" ]; then BAD+=("$name:no-sha256"); continue; fi
  (cd "$DUMPS" && sha256sum -c --status "$name.sha256") 2>/dev/null || BAD+=("$name:sha256")
done

if [ "${#BAD[@]}" -eq 0 ]; then
  echo "BACKUP-VERIFY OK checked=$CHECKED"
  exit 0
fi

list="${BAD[*]}"
printf '{"event":"backup_verify_failed","ts":"%s","checked":%d,"bad":"%s"}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$CHECKED" "$list" >> "$OUTBOX"
echo "BACKUP-VERIFY FAIL checked=$CHECKED bad=${#BAD[@]}: $list"
exit 1
