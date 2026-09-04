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

# T-05 (2026-09-04, ruling-1): a SECOND flock, taken BEFORE the wait above, coalesces concurrent
# launches into at most one waiter. AP-8's trigger_sync_counts() now fires at most once per tick
# (see incident-engine.py's own T-05 fix), but the daily 05:00 cron can still overlap an
# AP-8-triggered run, and a live incident recorded ~15 instances of this script starting within
# one minute before that fix -- each one would otherwise queue up its OWN up-to-MAX_WAIT_S wait,
# and whichever won the race would read a DB state the others had already made stale by the time
# THEY got the lock. `flock -n` (non-blocking): at most one process holds this pending slot; every
# other launch that shows up while it's held reads the SAME OR NEWER DB state once the holder (or
# its successor) finishes, so it has nothing useful left to do and exits immediately instead of
# joining the queue for worktree-fleet.lock. Released the moment the real lock (fd 9) is held, so
# the NEXT launch after this one is free to queue as its own pending waiter.
PENDING_LOCK="$LOCK.pending"
exec 8>"$PENDING_LOCK"
if ! flock -n 8; then
  clog "COALESCED -- another sync-counts-cron already queued (holds $PENDING_LOCK), it will read the same or newer DB state; not joining the queue"
  exit 0
fi

exec 9>"$LOCK"
clog "waiting for worktree-fleet.lock, up to ${MAX_WAIT_S}s (2*(TASK_TIMEOUT+600), TASK_TIMEOUT=$TASK_TIMEOUT from $CONFIG_ENV) -- this cron is DAILY, no reason to hurry"
if ! flock -w "$MAX_WAIT_S" 9; then
  date -u +%FT%TZ > "$MISS_FLAG"
  clog "SKIPPED after ${MAX_WAIT_S}s -- worktree-fleet.lock still held by another writer. This cron is DAILY: today's self-heal is skipped, the next attempt is the ordinary tomorrow 05:00 firing, not \"the next tick\". Marked $MISS_FLAG."
  calert "🔴 sync-counts-cron: суточный self-heal ПРОПУЩЕН после ${MAX_WAIT_S}s ожидания (worktree-fleet.lock busy) -- следующий штатный запуск завтра в 05:00."
  exit 1
fi
clog "worktree-fleet.lock acquired"
flock -u 8 2>/dev/null || true  # release the pending slot -- the next launch may now queue its own
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

# T-708 (~/FLEET-LOCKS-AND-AUTH-2026-09-03.md §2): every git op that runs while a lock is held
# gets its own bound -- an unbounded fetch/push here would hold worktree-fleet.lock hostage
# forever, exactly the next deadlock after the one T-705's wait-with-timeout already fixed on the
# ACQUIRE side. `set -e` above still exits nonzero on a timeout (rc=124), this just names it.
timeout 300 git fetch origin ci-staging --quiet \
  || { clog "ABORT -- git fetch origin ci-staging timed out or failed (300s bound)"; exit 1; }
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
  # T-05 (2026-09-04, ruling-1): this is the ONE case this script cannot self-heal -- dirt on an
  # allow-listed path that predates THIS run (a killed prior run's leftovers, or a real
  # in-progress hand-edit). Both look identical to `git status`; a human has to tell them apart.
  # The trap below (installed after this check passes) auto-reverts what THIS run itself dirties,
  # but it can't run for dirt that was already here when we started -- so give whoever reads this
  # log enough to decide without re-deriving it by hand: each path's mtime (a killed run's files
  # all share one mtime cluster from whenever it died; a real hand-edit in progress usually
  # doesn't) next to the timestamp of the last time this exact ABORT fired, plus the exact command
  # to discard them if they turn out to be orphaned.
  DIRTY_PATHS="$(echo "$PRE_DIRTY" | cut -c4-)"
  MTIMES="$(while IFS= read -r p; do [ -f "$p" ] && stat -c '%y %n' "$p" 2>/dev/null; done <<<"$DIRTY_PATHS")"
  LAST_ABORT_TS="$(grep -m1 'ABORT -- target file' "$LOG_DIR/sync-counts-cron.log" 2>/dev/null | awk '{print $1}' || true)"
  clog "ABORT -- target file(s) already have uncommitted changes, refusing to fold them into a cron commit: $(echo "$PRE_DIRTY" | tr '\n' ';')"
  clog "ABORT detail -- mtimes: $(echo "$MTIMES" | tr '\n' '; ') | previous ABORT at: ${LAST_ABORT_TS:-none recorded} | if these mtimes predate/cluster around a killed run (not a real in-progress edit), confirm then discard with: git -C '$HERE' checkout -- $DIRTY_PATHS"
  exit 1
fi

# Whole-tree baseline, NOT scoped to FILES -- the whitelist check below has to see everything
# sync-counts.sh touches, including a brand new untracked path, or it can never actually catch
# one (a pathspec-scoped `git diff -- FILES` is blind to anything outside FILES by
# construction -- caught live in this task's own mutation test: a stub that wrote an extra file
# outside FILES got committed anyway because the check was filtering before it could see it).
PRE_STATUS="$(git status --porcelain)"

# T-05 (2026-09-04, ruling-1): owns cleanup of dirt THIS run produces if it dies before
# committing (killed mid-run, a generator crash, an unhandled error) -- the class of "orphaned
# dirty tree" this task exists to fix. PRE_DIRTY above already proved every FILES path was clean
# at this exact moment under the exclusive worktree-fleet.lock; anything in FILES that's dirty
# when we exit was written by OUR OWN child process (sync-counts.sh) this run, so reverting it is
# safe -- unlike the flotilla cycle's "dirty at start" detector, this owns dirt whose origin it
# just proved, not dirt of unknown origin. Anything outside FILES is left alone and only logged --
# this script has never claimed ownership of the whole tree, only of FILES. Cleared right after a
# successful commit (the changes are safe once committed, not just when the tree is clean).
cleanup_orphaned_dirt() {
  local post
  post="$(git status --porcelain)"
  [ "$post" = "$PRE_STATUS" ] && return 0
  local new_lines to_revert=() path allowed a
  mapfile -t new_lines < <(comm -13 <(echo "$PRE_STATUS" | sort) <(echo "$post" | sort))
  for line in "${new_lines[@]}"; do
    path="${line:3}"
    allowed=0
    for a in "${FILES[@]}"; do [ "$path" = "$a" ] && allowed=1 && break; done
    [ "$allowed" = 1 ] && to_revert+=("$path")
  done
  if [ "${#to_revert[@]}" -gt 0 ]; then
    clog "cleanup: run exited without committing -- reverting ${#to_revert[@]} allow-listed path(s) this run itself dirtied: ${to_revert[*]}"
    git checkout -- "${to_revert[@]}" 2>>"$LOG_DIR/sync-counts-cron.log" || clog "cleanup: git checkout -- failed for one or more paths, tree may still be dirty"
  fi
  local still
  still="$(git status --porcelain)"
  if [ "$still" != "$PRE_STATUS" ]; then
    clog "cleanup: dirt remains outside FILES after cleanup, NOT touched (not this script's to revert): $(echo "$still" | tr '\n' ';')"
  fi
}
trap cleanup_orphaned_dirt EXIT ERR INT TERM

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
# Committed -- these changes are safe now (tracked in git history, not just clean working tree),
# so cleanup_orphaned_dirt must stop reverting anything on exit from here on. A push failure below
# still exits nonzero, but the commit itself stays (see its own comment) -- nothing left to revert.
trap - EXIT ERR INT TERM
# T-708: same 300s bound as the fetch above. A timed-out push here leaves the commit sitting
# local (never lost, never force-pushed) -- tomorrow's run re-fetches, sees HEAD ahead of
# origin/ci-staging (still an ancestor, so the divergence guard above does not ABORT it), and the
# next successful push carries it along.
timeout 300 git push origin HEAD:ci-staging \
  || { clog "ABORT -- git push origin HEAD:ci-staging timed out or failed (300s bound); commit $(git rev-parse --short HEAD) stays local, will push next run"; exit 1; }
clog "committed and pushed $(git rev-parse --short HEAD) (${#CHANGED[@]} file(s): ${CHANGED[*]})"
