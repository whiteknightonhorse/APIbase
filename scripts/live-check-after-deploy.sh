#!/usr/bin/env bash
# T-0784: run the live check once after the deployed commit changes.
#
# Mode (the only one):
#   live-check-after-deploy.sh run
#
# Settings (environment):
#   LIVE_CHECK_DIR         directory of the state files, the lock and the output file. No default.
#   LIVE_CHECK_COMMIT_CMD  a command that prints the commit that is deployed now. No default.
#   LIVE_CHECK_CMD         the live check. No default.
#   LIVE_CHECK_SETTLE_MIN  whole minutes the commit must stay the same before the check runs (default 10).
#   LIVE_CHECK_TIMEOUT     seconds allowed for the check (default 600).
#
# Files kept in LIVE_CHECK_DIR (nothing is written outside it):
#   live-check.last   the commit that was checked last (written only after the check ran)
#   live-check.seen   "<commit> <epoch seconds when it was first seen>"
#   live-check-after-deploy.out   stdout+stderr of the last check (overwritten each time); live-check.lock is the lock.
#
# Line printed after a check:
#   <UTC YYYY-MM-DDTHH:MM:SSZ> live-check after deploy <12 chars of commit>: ran, exit <code>, <N> min after the commit was first seen
#
# The check is the command of the 06:30 cron line; this script adds no second implementation of it.
# The cron line names the command that prints the deployed commit; this script knows no host path.
# Exit codes: 0 normal, 2 a setting is missing, 3 no usable commit, 64 usage. It sends no message.
set -u

if [ "$#" -ne 1 ] || [ "$1" != "run" ]; then
  echo "usage: ${0##*/} run" >&2
  exit 64
fi

for name in LIVE_CHECK_DIR LIVE_CHECK_COMMIT_CMD LIVE_CHECK_CMD; do
  if [ -z "${!name:-}" ]; then
    echo "live-check after deploy: $name is not set"
    exit 2
  fi
done
SETTLE="${LIVE_CHECK_SETTLE_MIN:-10}"
TMO="${LIVE_CHECK_TIMEOUT:-600}"
D="$LIVE_CHECK_DIR"

mkdir -p "$D" || exit 1
exec 9>"$D/live-check.lock" || exit 1
flock -n 9 || exit 0

out="$(timeout 30 bash -c "$LIVE_CHECK_COMMIT_CMD" 2>/dev/null)"
rc=$?
commit="$(printf '%s\n' "$out" | head -n 1 | tr -d '[:space:]')"
if [ "$rc" -ne 0 ] || ! printf '%s' "$commit" | grep -Eq '^[0-9a-f]{7,40}$'; then
  echo "live-check after deploy: no commit from LIVE_CHECK_COMMIT_CMD (exit $rc)"
  exit 3
fi

last="$D/live-check.last"
seen="$D/live-check.seen"
if [ -f "$last" ] && [ "$(head -n 1 "$last")" = "$commit" ]; then
  rm -f "$seen"
  exit 0
fi

now="$(date +%s)"
s_commit=""; s_time=""
if [ -f "$seen" ]; then read -r s_commit s_time _ < "$seen" || true; fi
case "$s_time" in ''|*[!0-9]*) s_time="" ;; esac
if [ "$s_commit" != "$commit" ] || [ -z "$s_time" ]; then
  printf '%s %s\n' "$commit" "$now" > "$seen.tmp" && mv "$seen.tmp" "$seen"
  s_time="$now"
fi

minutes=$(( (now - s_time) / 60 ))
[ "$minutes" -ge "$SETTLE" ] || exit 0

timeout "$TMO" bash -c "$LIVE_CHECK_CMD" > "$D/live-check-after-deploy.out" 2>&1
code=$?
printf '%s\n' "$commit" > "$last.tmp" && mv "$last.tmp" "$last"
rm -f "$seen"
printf '%s live-check after deploy %s: ran, exit %s, %s min after the commit was first seen\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${commit:0:12}" "$code" "$minutes"
exit 0
