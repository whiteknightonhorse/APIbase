# T-0808: installed by copy to ~/.config/husky/init.sh by the dispatcher (STAGING-STASH-1113 ruling-2).
# Sourced by the husky runner before every hook; acts only for pre-push (n = hook name, stdin = hook stdin).
# The guard that runs is the pushing worktree's own copy; a worktree without the guard file is not checked.
if [ "${n-}" = "pre-push" ] && [ "${HUSKY-}" != "0" ]; then
  prg_top=$(git rev-parse --show-toplevel 2>/dev/null) || prg_top=""
  if [ -n "$prg_top" ] && [ -f "$prg_top/scripts/lib/push-range-guard.sh" ]; then
    sh "$prg_top/scripts/lib/push-range-guard.sh" || exit 1
  fi
fi
:
