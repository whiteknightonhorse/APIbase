#!/bin/bash
# T-0578: fixture tests for tree-hygiene.sh, the sync-counts-cron behind/diverged branch, the
# stdin-JSON guard hook and the per-tree dirty alert.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
FAIL=0
ok(){ echo "ok   $1"; }
bad(){ echo "FAIL $1"; FAIL=1; }
LOGF="$T/log"; : > "$LOGF"
lg(){ echo "$*" >> "$LOGF"; }
. "$REPO/scripts/lib/tree-hygiene.sh"

git init -q --bare -b ci-staging "$T/origin.git"
W="$T/w"; git clone -q "$T/origin.git" "$W" 2>/dev/null
cd "$W" || exit 1
git config user.email t@t; git config user.name t
git checkout -q -b ci-staging 2>/dev/null
echo a > f.txt; git add f.txt; git commit -qm c1; git push -q origin ci-staging

# 1. MM pair with empty net diff -> cleared with a log line
echo b > f.txt; git add f.txt; echo a > f.txt
[ "$(git status --porcelain)" = "MM f.txt" ] || bad "setup MM"
tree_only_empty_mm_pairs && ok "only-empty-mm detected" || bad "only-empty-mm"
tree_clear_mm_pairs lg
[ -z "$(git status --porcelain)" ] && grep -q "cleared formatter pair: f.txt" "$LOGF" && ok "MM pair cleared with log" || bad "MM pair clear"

# 2. MM pair with a real net diff -> untouched
echo b > f.txt; git add f.txt; echo c > f.txt
tree_clear_mm_pairs lg
[ "$(git status --porcelain)" = "MM f.txt" ] && ok "real MM diff kept" || bad "real MM diff kept"
tree_only_empty_mm_pairs && bad "real diff reported as empty" || ok "real diff not empty-mm"
git checkout -q HEAD -- f.txt

# 3. stash: a foreign stash is kept
echo z > f.txt; git stash push -q -m "unrelated stash"
tree_clear_empty_lint_stash lg
[ "$(git stash list | wc -l)" = 1 ] && ok "foreign stash kept" || bad "foreign stash kept"
git stash clear

# 4. sync-counts-cron branch: behind -> fast-forward and continue; diverged -> abort
SC="$REPO/scripts/sync-counts-cron.sh"
# Prints the lines strictly between the two branch-block markers, and nothing unless the markers are well formed.
extract(){
  local n1 n2 l1 l2 body
  n1=$(grep -c '^# >>> branch-block' "$SC"); n2=$(grep -c '^# <<< branch-block' "$SC")
  [ "$n1" = 1 ] && [ "$n2" = 1 ] || return 0
  l1=$(grep -n '^# >>> branch-block' "$SC" | cut -d: -f1); l2=$(grep -n '^# <<< branch-block' "$SC" | cut -d: -f1)
  [ "$l1" -lt "$l2" ] || return 0
  body=$(sed -n "$((l1 + 1)),$((l2 - 1))p" "$SC")
  case "$body" in 'LOCAL_SHA='*) ;; *) return 0 ;; esac
  printf '%s\n' "$body" | grep -qF -e 'git commit' -e 'git push' -e 'scripts/sync-counts.sh' && return 0
  printf '%s\n' "$body"
}
run_branch(){ ( clog(){ echo "$*" >> "$T/clog"; }; calert(){ echo "ALERT $*" >> "$T/clog"; }
  eval "$(extract)"; echo continued >> "$T/clog" ); }
[ -n "$(extract)" ] && ok "branch block markers" || bad "branch block markers"
W2="$T/w2"; git clone -q "$T/origin.git" "$W2" 2>/dev/null
( cd "$W2" && git config user.email t@t && git config user.name t && git checkout -q ci-staging && echo n >> f.txt && git commit -qam c2 && git push -q origin ci-staging )
git fetch -q origin ci-staging
: > "$T/clog"; echo b > f.txt; git add f.txt; echo a > f.txt   # behind + formatter MM pair
run_branch
grep -q "behind by 1, fast-forwarded" "$T/clog" && grep -q continued "$T/clog" \
  && [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/ci-staging)" ] && ok "behind -> ff and continue" || { bad "behind -> ff"; cat "$T/clog"; }
git commit -q --allow-empty -m local-only
( cd "$W2" && echo m >> f.txt && git commit -qam c3 && git push -q origin ci-staging ); git fetch -q origin ci-staging
: > "$T/clog"; run_branch
grep -q "diverged" "$T/clog" && ! grep -q continued "$T/clog" && ok "diverged -> abort" || { bad "diverged -> abort"; cat "$T/clog"; }

# 5. hook fixture payloads
H="$REPO/scripts/hooks/bash-pretool-guard.sh"
# HOME is pinned: the hook resolves ~ through HOME and allows targets under /tmp and /var/tmp, so the result of
# the "hook home" case must not depend on the HOME of the caller. The hook deletes nothing, it only resolves the path.
hook(){ printf '{"tool_name":"Bash","tool_input":{"command":%s}}' "$(jq -Rn --arg c "$1" '$c')" | HOME=/nonexistent/t0578-home CLAUDE_PROJECT_DIR="$REPO" "$H" 2>/dev/null; }
hook 'rm -rf /etc/outside-xyz'; [ $? = 2 ] && ok "hook blocks rm -rf outside worktree" || bad "hook outside"
hook 'rm -rf ~'; [ $? = 2 ] && ok "hook blocks rm -rf ~" || bad "hook home"
hook 'rm -rf node_modules/.cache'; [ $? = 0 ] && ok "hook allows rm -rf inside worktree" || bad "hook inside"
hook 'rm -rf /etc/x; rm -rf tmp/y'; [ $? = 2 ] && ok "hook checks every rm" || bad "hook double rm"
hook 'rm -rf $HOME/x'; [ $? = 2 ] && ok "hook blocks variable target" || bad "hook var"
hook 'cd /tmp && rm -rf x'; [ $? = 2 ] && ok "hook blocks relative target after cd" || bad "hook cd"
hook 'rm -rf /tmp/t0578-x'; [ $? = 0 ] && ok "hook allows /tmp subpath" || bad "hook tmp"
hook 'git reset --hard HEAD~1'; [ $? = 2 ] && ok "hook blocks hard reset" || bad "hook reset"
hook 'ls -la'; [ $? = 0 ] && ok "hook allows ls" || bad "hook ls"
echo 'not json' | CLAUDE_PROJECT_DIR="$REPO" "$H" 2>/dev/null; [ $? = 2 ] && ok "hook fails closed on bad stdin" || bad "hook bad stdin"

# 6. dirty alert: per-tree markers
python3 - "$REPO" "$T" <<'PY' && ok "dirty alert per-tree markers" || bad "dirty alert per-tree markers"
import importlib.util, os, subprocess, sys, tempfile
repo, tmp = sys.argv[1], sys.argv[2]
spec = importlib.util.spec_from_file_location("dta", f"{repo}/scripts/deploy-tree-dirty-alert.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
assert any(t.endswith("/apibase") for t in m.TREES) and any(t.endswith("/apibase-fleet") for t in m.TREES) and any(t.endswith("/apibase-orchestra") for t in m.TREES)
m.STATE_DIR = f"{tmp}/state"; os.makedirs(m.STATE_DIR)
a, b = f"{tmp}/treeA", f"{tmp}/treeB"
for d in (a, b):
    subprocess.run(["git", "init", "-q", d], check=True)
open(f"{a}/x", "w").write("dirty")
sent = []
m.tg_send = lambda text: sent.append(text) or True
m.TREES = [a, b]
m.DIRTY_GRACE_MINUTES = 0
m.main()                       # first sight: marker for A only
assert os.path.exists(m.state_file(a)) and not os.path.exists(m.state_file(b))
m.main()                       # grace 0 elapsed: one alert naming tree A
assert len(sent) == 1 and a in sent[0], sent
m.main()
assert len(sent) == 1          # no repeat
os.remove(f"{a}/x"); m.main()  # clean again: markers reset
assert not os.path.exists(m.state_file(a)) and not os.path.exists(m.alerted_file(a))
PY

# 7. no dangling CLAUDE.md AP-/section references
if (cd "$REPO" && git grep -nE 'CLAUDE\.md (AP-|§)|apibase-autopilot\.md#AP-3' -- . ':!tests/bash/tree-hygiene.test.sh' | grep -q .); then bad "dangling CLAUDE.md AP-/section refs"; else ok "no dangling CLAUDE.md AP-/section refs"; fi
exit $FAIL
