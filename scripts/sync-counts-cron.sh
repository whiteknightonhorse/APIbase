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
#   1. flock on taskloop's own lock file -- the fleet worktree's git index is shared (T-72);
#      cron and a running taskloop tick must never write it at the same time.
#   2. must be on ci-staging, not detached, not behind origin/ci-staging (T-72 ancestry guard
#      shape -- refuse to build a commit on a base that's already stale).
#   3. every file sync-counts.sh is allowed to touch must be clean BEFORE it runs -- refuses to
#      fold someone else's uncommitted edit into a cron commit.
#   4. after it runs, the actual diff must be a SUBSET of that same allow-list -- refuses to
#      commit if the generator touched something unexpected.
#   5. commit only via explicit pathspec (T-72 shared-index rule -- never bare/`-a`), push
#      without --force.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

# Overridable only for the mutation-control tests in T-75's own writeup (a real cron/taskloop
# run always uses the default -- this must be the SAME file taskloop.sh flocks, that's the
# whole point of the lock).
LOCK="${SYNC_COUNTS_CRON_LOCK:-$HOME/taskloop/state/lock}"
mkdir -p "$(dirname "$LOCK")"
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "sync-counts-cron: taskloop lock held by another writer -- skipping this run, next cron tick will retry"
  exit 0
fi
echo "$$" > "$LOCK.pid"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "ci-staging" ]; then
  echo "sync-counts-cron: ABORT -- fleet worktree is not on ci-staging (on '$BRANCH')" >&2
  exit 1
fi

git fetch origin ci-staging --quiet
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse origin/ci-staging)"
if [ "$LOCAL_SHA" != "$REMOTE_SHA" ] && ! git merge-base --is-ancestor "$REMOTE_SHA" "$LOCAL_SHA"; then
  echo "sync-counts-cron: ABORT -- HEAD ($LOCAL_SHA) has diverged from origin/ci-staging ($REMOTE_SHA), refusing to commit on a stale/diverged base" >&2
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
  echo "sync-counts-cron: ABORT -- target file(s) already have uncommitted changes, refusing to fold them into a cron commit:" >&2
  echo "$PRE_DIRTY" >&2
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
  echo "sync-counts-cron: ABORT -- sync-counts.sh exited $RUN_RC" >&2
  exit 1
fi
COUNTS_MSG="$(echo "$RUN_OUT" | grep -m1 'live active' || true)"
TOOLS="$(echo "$COUNTS_MSG" | grep -oE '[0-9]+ tools' | grep -oE '[0-9]+')"
PROV="$(echo "$COUNTS_MSG" | grep -oE '[0-9]+ providers' | grep -oE '[0-9]+')"

POST_STATUS="$(git status --porcelain)"
if [ "$PRE_STATUS" = "$POST_STATUS" ]; then
  echo "sync-counts-cron: 0 drift, nothing committed"
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
    echo "sync-counts-cron: ABORT -- sync-counts.sh touched an unexpected path outside the allow-list, refusing to commit anything this run: $f" >&2
    exit 1
  fi
done

git commit -m "counts: sync ${TOOLS:-?} tools / ${PROV:-?} providers (cron 05:00)" -- "${CHANGED[@]}"
git push origin HEAD:ci-staging
echo "sync-counts-cron: committed and pushed $(git rev-parse --short HEAD) (${#CHANGED[@]} file(s): ${CHANGED[*]})"
