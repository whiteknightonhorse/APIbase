#!/bin/bash
# T-0355: stale-pull check for the laptop-initiated offsite backup pull.
# Reads $STAGING/.last-pull ("<name> <ISO-8601 UTC>"), keeps state in $STAGING/.stale-state (ok|stale).
# Prints one line only on a state transition (or with --verbose while ok). Exit 1 while stale.
# Usage: backup-offsite-check.sh [--staging <dir>] [--now <ISO>] [--verbose]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$ROOT/config/backup/offsite.json"
STAGING=""
NOW_ARG=""
VERBOSE=0
MAX_HOURS=48

while [ $# -gt 0 ]; do
  case "$1" in
    --staging) STAGING="$2"; shift 2 ;;
    --now) NOW_ARG="$2"; shift 2 ;;
    --verbose) VERBOSE=1; shift ;;
    *) echo "unknown argument $1" >&2; exit 2 ;;
  esac
done

if [ -z "$STAGING" ]; then
  REL="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["staging_dir"])' "$CONFIG")"
  case "$REL" in /*) STAGING="$REL" ;; *) STAGING="$ROOT/$REL" ;; esac
fi
mkdir -p -m 750 "$STAGING"

if [ -n "$NOW_ARG" ]; then NOW=$(date -u -d "$NOW_ARG" +%s); else NOW=$(date -u +%s); fi

STATE_FILE="$STAGING/.stale-state"
PREV="ok"
[ -r "$STATE_FILE" ] && PREV="$(head -n1 "$STATE_FILE")"

LAST_NAME="none"
AGE_H=""
CUR="stale"
if [ -s "$STAGING/.last-pull" ]; then
  read -r name ts _ < "$STAGING/.last-pull" || true
  if [ -n "${name:-}" ] && [ -n "${ts:-}" ] && PULL=$(date -u -d "$ts" +%s 2>/dev/null); then
    LAST_NAME="$name"
    AGE_H=$(( (NOW - PULL) / 3600 ))
    [ "$AGE_H" -le "$MAX_HOURS" ] && CUR="ok"
  fi
fi
[ -n "$AGE_H" ] || AGE_H="never"
[ "$AGE_H" = "never" ] && AGE_OUT="unknown" || AGE_OUT="${AGE_H}h"

echo "$CUR" > "$STATE_FILE"

if [ "$CUR" = "ok" ]; then
  if [ "$PREV" = "stale" ]; then
    echo "OFFSITE-PULL RESOLVED last=$LAST_NAME"
  elif [ "$VERBOSE" = 1 ]; then
    echo "OFFSITE-PULL OK last=$LAST_NAME age=$AGE_OUT"
  fi
  exit 0
fi
[ "$PREV" = "stale" ] || echo "OFFSITE-PULL STALE age=$AGE_OUT last=$LAST_NAME"
exit 1
