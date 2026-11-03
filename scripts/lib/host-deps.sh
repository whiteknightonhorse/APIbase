#!/bin/bash
# scripts/lib/host-deps.sh -- T-0680
# Keeps the host tree's node_modules and generated Prisma client in step with package-lock.json and
# prisma/schema.prisma. Host scripts (sync-counts.sh, count-mcp-tools.ts, gen-discovery.ts) run with the
# host tree's own node_modules; nothing else reinstalls them. Source this file; do not execute.
#
# The stamp lives in <dir>/node_modules/ (ignored by git). The lock lives OUTSIDE the tree: the F2 guard
# in the deploy script aborts on any untracked file, so a lock or stamp file in the tree would fail the
# next deploy. Static Counts Drift takes the same lock (.github/workflows/security.yml).

HOST_DEPS_LOCK_DEFAULT="${HOME}/.apibase-host-deps.lock"
# Environment-level failures of a host script (as opposed to real count drift).
HOST_DEPS_CRASH_RE='TypeError|ReferenceError|SyntaxError|Cannot find module|ERR_MODULE_NOT_FOUND|is not a function'

# host_deps_stamp DIR -- one line: sha256(package-lock.json) sha256(prisma/schema.prisma) node version
host_deps_stamp() {
  local dir="$1" a b c
  a="$(sha256sum "$dir/package-lock.json" 2>/dev/null | cut -d' ' -f1)" || a=""
  b="$(sha256sum "$dir/prisma/schema.prisma" 2>/dev/null | cut -d' ' -f1)" || b=""
  c="$(node -v 2>/dev/null)" || c=""
  printf '%s %s %s\n' "${a:-none}" "${b:-none}" "${c:-none}"
}

# _host_deps_install DIR LOG -- runs inside the lock; returns 1 on any failing step.
_host_deps_install() {
  local dir="$1" log="$2" vlog rc=0
  cd "$dir" || return 1
  npm ci --ignore-scripts --legacy-peer-deps >>"$log" 2>&1 || return 1
  npx prisma generate >>"$log" 2>&1 || return 1
  # Verify one host script. The deploy must not judge counts: only a crash signature fails here.
  vlog="$(mktemp)"
  bash scripts/sync-counts.sh --check --no-fetch >"$vlog" 2>&1 || rc=$?
  if grep -Eq "$HOST_DEPS_CRASH_RE" "$vlog"; then
    echo "host deps: verify crashed (environment)" >>"$log"
    cat "$vlog" >>"$log"
    rm -f "$vlog"
    return 1
  fi
  if [ "$rc" -ne 0 ]; then
    echo "host deps: drift, owned by Static Counts Drift (sync-counts rc=${rc})" | tee -a "$log"
  fi
  rm -f "$vlog"
  mkdir -p "$dir/node_modules"
  host_deps_stamp "$dir" >"$dir/node_modules/.apibase-deps-stamp"
}

# host_deps_sync DIR -- 0 when current or reinstalled+verified, 1 otherwise (last 20 lines on stderr).
host_deps_sync() {
  local dir="$1" want have lock log rc=0
  want="$(host_deps_stamp "$dir")"
  have="$(cat "$dir/node_modules/.apibase-deps-stamp" 2>/dev/null || true)"
  if [ "$want" = "$have" ]; then
    echo "host deps: current"
    return 0
  fi
  lock="${HOST_DEPS_LOCK:-$HOST_DEPS_LOCK_DEFAULT}"
  log="$(mktemp)"
  echo "host deps: stamp differs, running npm ci + prisma generate"
  (
    exec 9>"$lock" || exit 1
    flock -w 900 9 || { echo "host deps: lock timeout" >>"$log"; exit 1; }
    _host_deps_install "$dir" "$log"
  ) || rc=$?
  if [ "$rc" -ne 0 ]; then
    tail -n 20 "$log" >&2
    rm -f "$log"
    return 1
  fi
  rm -f "$log"
  echo "host deps: synced"
}
