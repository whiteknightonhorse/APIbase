#!/usr/bin/env bash
#
# Cron wrapper for awesome-list-pr.sh
# Adds random delay (0-25200s = 0-7h) so PRs don't go out at exact same time daily.
# Run this from cron at a fixed time (e.g. 10:00 UTC).
#

DELAY=$((RANDOM % 25200))
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Sleeping ${DELAY}s before PR submission..." >> /home/apibase/apibase/logs/awesome-list-pr.log
sleep "$DELAY"

cd /home/apibase/apibase
exec bash scripts/awesome-list-pr.sh auto >> logs/awesome-list-pr.log 2>&1
