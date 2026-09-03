#!/usr/bin/env bash
# sync-counts-cron.sh — the 05:00 cron entry point for sync-counts.sh (T-75, 2026-09-03, Fable
# ruling on disputes/75-sync-counts-dirties-deploy-tree.q-1.md).
#
# sync-counts.sh self-heal writes TRACKED files. It used to run against the DEPLOY tree
# (/home/apibase/apibase), which dirtied it every morning and made deploy.sh's F2 gate abort
# the next deploy ("[deploy] ABORT: working tree has uncommitted changes"). Worse: since F5
# (static-current / static-releases/<SHA>), the deploy tree's working copy of static/ was never
# even what shipped -- so the cron's writes there were ALSO invisible to production. It edited
# a tree nobody reads and then blocked the tree that matters.
#
# This script runs the same self-heal in the FLEET worktree instead and, if it produced a real
# diff, commits it with an explicit pathspec and pushes to ci-staging -- the only way a change
# to a tracked file reaches production in this repo (commit -> CI -> deploy.sh checkout by SHA).
# sync-counts.sh itself now refuses to self-heal from the deploy tree at all (see the guard
# right after its ROOT/cd lines) so this is the only path left.
#
# Guardrails, in order, ANY failure = exit nonzero, NOTHING committed:
#   0. flock on the fleet worktree's own lock file (T-703: state/worktree-fleet.lock, split off
#      taskloop's scheduler-only state/tick.lock -- this cron never wants the scheduler lock, it
#      only ever wanted the tree) -- the fleet worktree's git index is shared (T-72); cron and a
#      running taskloop task, or (rare, only while ~/apibase-orchestra/.env is still pending its
#      one-time human symlink -- see scripts/night-orchestra/lib.sh's ROOT fallback, T-704) the
#      night orchestra, must never write it at the same time. This lock is held by whichever
#      taskloop TASK is currently executing (up to
#      5400s exec + up to 1800s arbiter + up to 900s fix-pass + up to 1800s second arbiter =
#      ~9900s worst case, see taskloop.sh) -- at 05:00 with a non-empty backlog the lock is MORE
#      likely busy than free. See the retry loop below (T-75 update, 2026-09-03): this is not
#      optional polish, it is the fix for a defect a real dispatcher-triggered run exposed the
#      same morning.
#   1. must be on ci-staging, not detached, not behind origin/ci-staging (T-72 ancestry guard
#      shape -- refuse to build a commit on a base that's already stale).
#   2. every file sync-counts.sh is allowed to touch must be clean BEFORE it runs -- refuses to
#      fold someone else's uncommitted edit into a cron commit.
#   3. after it runs, the actual diff must be a SUBSET of that same allow-list -- refuses to
#      commit if the generator touched something unexpected.
#   4. commit only via explicit pathspec (T-72 shared-index rule -- never bare/`-a`), push
#      without --force.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

# Durable logging + alerting, independent of whatever the crontab line redirects stdout to.
# T-75 update (2026-09-03): the crontab's own redirect target
# (apibase-fleet/scripts/night-orchestra/logs/sync-counts.log) lives under a path that's
# entirely .gitignore'd (night-orchestra is a private repo, T-71) -- on a fresh worktree
# checkout that directory DOES NOT EXIST, and bash refuses to even start this script when the
# `>>` target's parent directory is missing (verified live: the whole cron line no-ops with
# "No such file or directory", this script never runs at all). This script therefore never
# depends on that path to make its own critical lines visible: it always also writes to
# $HOME/taskloop/logs, which taskloop.sh itself `mkdir -p`s every single tick and which is
# already what a human/dispatcher greps when something in this system misbehaves.
LOG_DIR="${SYNC_COUNTS_CRON_LOG_DIR:-$HOME/taskloop/logs}"
mkdir -p "$LOG_DIR"
clog(){ echo "$(date -u +%FT%TZ) sync-counts-cron: $*" | tee -a "$LOG_DIR/sync-counts-cron.log" "$LOG_DIR/tick.log" >/dev/null; }
# Best-effort Telegram alert, same shape as taskloop.sh's own tg() (state/tg.env, silently
# no-ops if absent/unconfigured -- never fatal, never blocks the guardrails above/below it).
calert(){
  local envf="$HOME/taskloop/state/tg.env"
  [ -f "$envf" ] || return 0
  ( . "$envf"; [ -n "${TG_BOT_TOKEN:-}" ] && [ -n "${TG_CHAT_ID:-}" ] && \
    curl -sS --max-time 30 -F "chat_id=$TG_CHAT_ID" -F "text=[sync-counts-cron] $1" \
      "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" >/dev/null 2>&1 ) || true
}

# Overridable only for the mutation-control tests in T-75's own writeup (a real cron/taskloop
# run always uses the default -- this must be the SAME file taskloop.sh flocks for the fleet
# worktree, that's the whole point of the lock). T-703: this used to point at taskloop's old
# single lock file; renamed to state/worktree-fleet.lock when taskloop split its scheduler
# lock from its tree lock.
LOCK="${SYNC_COUNTS_CRON_LOCK:-$HOME/taskloop/state/worktree-fleet.lock}"
mkdir -p "$(dirname "$LOCK")"
STATE_DIR="${SYNC_COUNTS_CRON_STATE_DIR:-$HOME/taskloop/state}"
mkdir -p "$STATE_DIR"
TODAY="$(date -u +%F)"
MISS_FLAG="$STATE_DIR/.sync-counts-cron-missed-$TODAY"

# T-705 (2026-09-03, ~/FLEET-LOCKS-AND-AUTH-2026-09-03.md §2/§6): the wait ceiling used to be a
# second hardcoded literal (10800s) eyeballed from taskloop.sh's worst case. T-703 already put
# that worst case in exactly one place -- config.env's TASK_TIMEOUT -- so this derives from it
# instead of restating a second guessed number that would silently drift the moment TASK_TIMEOUT
# changes and this literal doesn't (LAW #ONE-PLACE / a-guessed-constant).
CONFIG_ENV="${SYNC_COUNTS_CRON_CONFIG_ENV:-$HOME/taskloop/config.env}"
if [ ! -f "$CONFIG_ENV" ]; then
  clog "REFUSAL -- $CONFIG_ENV missing, cannot derive the lock-wait ceiling"
  calert "🔴 sync-counts-cron: $CONFIG_ENV отсутствует -- отказ прибора, счётчики НЕ синхронизированы."
  exit 1
fi
. "$CONFIG_ENV"
case "${TASK_TIMEOUT:-}" in
  ''|*[!0-9]*)
    clog "REFUSAL -- TASK_TIMEOUT in $CONFIG_ENV is not a positive integer ('${TASK_TIMEOUT:-}')"
    calert "🔴 sync-counts-cron: TASK_TIMEOUT в $CONFIG_ENV не число -- отказ прибора."
    exit 1
    ;;
esac
# 2*(TASK_TIMEOUT+600): a single worst-case taskloop task holds worktree-fleet.lock for at most
# TASK_TIMEOUT+600 (exec timeout + the same pull/verdict/mv grace taskloop.sh itself uses for
# every lock-hold ceiling); doubling it survives two such tasks back to back. A daily 05:00 cron
# has no reason to be in a hurry, so this WAITS for real via flock's own -w timeout, rather than
# the plain `flock -n` immediate-skip this used to be (that version exited 0 on a busy lock and
# promised "next cron tick will retry" on a cron that only runs once a day -- both false).
MAX_WAIT_S="${SYNC_COUNTS_CRON_MAX_WAIT_S:-$((2*(TASK_TIMEOUT+600)))}"
exec 9>"$LOCK"
clog "waiting for worktree-fleet.lock, up to ${MAX_WAIT_S}s (2*(TASK_TIMEOUT+600), TASK_TIMEOUT=$TASK_TIMEOUT from $CONFIG_ENV) -- this cron is DAILY, no reason to hurry"
if ! flock -w "$MAX_WAIT_S" 9; then
  date -u +%FT%TZ > "$MISS_FLAG"
  clog "SKIPPED after ${MAX_WAIT_S}s -- worktree-fleet.lock still held by another writer. This cron is DAILY: today's self-heal is skipped, the next attempt is the ordinary tomorrow 05:00 firing, not \"the next tick\". Marked $MISS_FLAG."
  calert "🔴 sync-counts-cron: суточный self-heal ПРОПУЩЕН после ${MAX_WAIT_S}s ожидания (worktree-fleet.lock busy) -- следующий штатный запуск завтра в 05:00."
  exit 1
fi
clog "worktree-fleet.lock acquired"
if [ -f "$MISS_FLAG" ]; then
  clog "lock acquired -- clearing yesterday's/earlier miss marker"
  rm -f "$MISS_FLAG"
fi
echo "$$" > "$LOCK.pid"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "ci-staging" ]; then
  clog "ABORT -- fleet worktree is not on ci-staging (on '$BRANCH')"
  exit 1
fi

git fetch origin ci-staging --quiet
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse origin/ci-staging)"
if [ "$LOCAL_SHA" != "$REMOTE_SHA" ] && ! git merge-base --is-ancestor "$REMOTE_SHA" "$LOCAL_SHA"; then
  clog "ABORT -- HEAD ($LOCAL_SHA) has diverged from origin/ci-staging ($REMOTE_SHA), refusing to commit on a stale/diverged base"
  exit 1
fi

# Every path sync-counts.sh's self-heal pass is known to write (kept in sync with its own
# `for f in ...` loops and hand-written surfaces -- see git blame if this list needs updating).
FILES=(
  static/index.html static/terms.html static/frameworks.html static/contact.html
  static/privacy.html static/dashboard.html static/pricing.html static/connect.html
  static/llms.txt static/ai.txt static/policy-moderation.html README.md
  static/.well-known/api-catalog static/.well-known/mcp.json
  static/.well-known/mcp/server-card.json static/catalog.html static/sitemap.xml
)

PRE_DIRTY="$(git status --porcelain -- "${FILES[@]}")"
if [ -n "$PRE_DIRTY" ]; then
  clog "ABORT -- target file(s) already have uncommitted changes, refusing to fold them into a cron commit: $(echo "$PRE_DIRTY" | tr '\n' ';')"
  exit 1
fi

# Whole-tree baseline, NOT scoped to FILES -- the whitelist check below has to see everything
# sync-counts.sh touches, including a brand new untracked path, or it can never actually catch
# one (a pathspec-scoped `git diff -- FILES` is blind to anything outside FILES by
# construction -- caught live in this task's own mutation test: a stub that wrote an extra file
# outside FILES got committed anyway because the check was filtering before it could see it).
PRE_STATUS="$(git status --porcelain)"

RUN_OUT="$(ROOT="$HERE" bash scripts/sync-counts.sh 2>&1)" && RUN_RC=0 || RUN_RC=$?
echo "$RUN_OUT"
if [ "$RUN_RC" != 0 ]; then
  clog "ABORT -- sync-counts.sh exited $RUN_RC"
  exit 1
fi
COUNTS_MSG="$(echo "$RUN_OUT" | grep -m1 'live active' || true)"
TOOLS="$(echo "$COUNTS_MSG" | grep -oE '[0-9]+ tools' | grep -oE '[0-9]+')"
PROV="$(echo "$COUNTS_MSG" | grep -oE '[0-9]+ providers' | grep -oE '[0-9]+')"

POST_STATUS="$(git status --porcelain)"
if [ "$PRE_STATUS" = "$POST_STATUS" ]; then
  clog "0 drift, nothing committed ($TOOLS tools / $PROV providers)"
  exit 0
fi
# Lines present after the run but not before -- i.e. exactly what THIS run introduced, not any
# unrelated pre-existing dirt elsewhere in the tree (which PRE_DIRTY above didn't check, on
# purpose: this script only owns FILES, not the whole working copy).
mapfile -t NEW_LINES < <(comm -13 <(echo "$PRE_STATUS" | sort) <(echo "$POST_STATUS" | sort))
mapfile -t CHANGED < <(printf '%s\n' "${NEW_LINES[@]}" | cut -c4-)

for f in "${CHANGED[@]}"; do
  allowed=0
  for a in "${FILES[@]}"; do
    [ "$f" = "$a" ] && allowed=1 && break
  done
  if [ "$allowed" != 1 ]; then
    clog "ABORT -- sync-counts.sh touched an unexpected path outside the allow-list, refusing to commit anything this run: $f"
    exit 1
  fi
done

git commit -m "counts: sync ${TOOLS:-?} tools / ${PROV:-?} providers (cron 05:00)" -- "${CHANGED[@]}"
git push origin HEAD:ci-staging
clog "committed and pushed $(git rev-parse --short HEAD) (${#CHANGED[@]} file(s): ${CHANGED[*]})"
