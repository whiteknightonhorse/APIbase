#!/bin/sh
# T-0808 (STAGING-STASH-1113 ruling-1): pre-push range guard. POSIX sh only (husky runs hooks with `sh -e`).
# Reads pre-push stdin lines "<local ref> <local sha> <remote ref> <remote sha>" and exits 1 when a pushed
# commit to ci-staging or main is a git-stash commit ("index on ", "WIP on ", "untracked files on " subjects)
# or an empty commit (one parent, same tree as the parent). Fails open: any git error = skip that line.
ZERO=0000000000000000000000000000000000000000
bad=0

while read -r lref lsha rref rsha; do
  case "$rref" in
    refs/heads/ci-staging) target=ci-staging ;;
    refs/heads/main) target=main ;;
    *) continue ;;
  esac
  [ -n "$lsha" ] || continue
  [ "$lsha" = "$ZERO" ] && continue
  if [ "$rsha" = "$ZERO" ]; then
    git rev-parse -q --verify origin/main >/dev/null 2>&1 </dev/null || continue
    range="origin/main..$lsha"
  else
    range="$rsha..$lsha"
  fi
  commits=$(git rev-list --no-merges "$range" 2>/dev/null </dev/null) || continue
  for c in $commits; do
    subject=$(git log -1 --format=%s "$c" 2>/dev/null </dev/null) || continue
    kind=""
    case "$subject" in
      "index on "*|"WIP on "*|"untracked files on "*) kind="a git-stash commit" ;;
    esac
    if [ -z "$kind" ]; then
      parents=$(git rev-list --parents -n 1 "$c" 2>/dev/null </dev/null) || continue
      # shellcheck disable=SC2086
      set -- $parents
      if [ "$#" -eq 2 ]; then
        t1=$(git rev-parse "$c^{tree}" 2>/dev/null </dev/null) || continue
        t2=$(git rev-parse "$c^^{tree}" 2>/dev/null </dev/null) || continue
        [ "$t1" = "$t2" ] && kind="an empty commit"
      fi
    fi
    [ -n "$kind" ] || continue
    short=$(printf '%s' "$c" | cut -c1-8)
    subj80=$(printf '%s' "$subject" | cut -c1-80)
    {
      echo "BLOCKED: $short \"$subj80\" is $kind and must not reach $target."
      echo "         It carries no task prefix, gets no verdict and stops promotion for every commit after it (STAGING-STASH-1113)."
      echo "         Remove it from your local history (git rebase --onto $short^ $short) and push again. Never check out, reset to or rebase onto \"stash\"."
    } >&2
    bad=1
  done
done

exit "$bad"
