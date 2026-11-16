#!/usr/bin/env bash
# Usage: registry-version-check.sh [--write] [root] | --selftest
# T-0864: server.json has no version of its own. Its top-level `version` is package.json's and its
# packages[0].version (the npm client) is packages/mcp-client/package.json's.
#   (no flag)  read-only: exit 1 with STALE_SERVER_JSON_VERSION / STALE_SERVER_JSON_CLIENT_VERSION on a mismatch.
#   --write    set both lines from their sources (what sync-counts.sh self-heal calls); never edit by hand.
# Used by scripts/sync-counts.sh and by the mcp-registry job of .github/workflows/release.yml (no DB needed).
set -u

versions() { # <root>: prints "server pkg client_in_server client_pkg"
  local r="$1"
  echo "$(jq -r .version "$r/server.json") $(jq -r .version "$r/package.json") $(jq -r '.packages[0].version' "$r/server.json") $(jq -r .version "$r/packages/mcp-client/package.json")"
}

check() { # <root>
  local rc=0 sv pv sc cv
  read -r sv pv sc cv < <(versions "$1")
  if [ "$sv" != "$pv" ]; then
    echo "STALE_SERVER_JSON_VERSION: server.json $sv != package.json $pv"; rc=1
  fi
  if [ "$sc" != "$cv" ]; then
    echo "STALE_SERVER_JSON_CLIENT_VERSION: server.json packages[0] $sc != packages/mcp-client/package.json $cv"; rc=1
  fi
  return $rc
}

write() { # <root>
  local r="$1" sv pv sc cv tmp
  read -r sv pv sc cv < <(versions "$r")
  [ "$sv" = "$pv" ] && [ "$sc" = "$cv" ] && return 0
  tmp=$(mktemp) || return 1
  jq --arg v "$pv" --arg c "$cv" '.version = $v | .packages[0].version = $c' "$r/server.json" > "$tmp" \
    && mv "$tmp" "$r/server.json" || { rm -f "$tmp"; return 1; }
  echo "  updated server.json (version $pv, client $cv)"
}

selftest() {
  local fail=0 out
  d=$(mktemp -d) || exit 1
  trap 'rm -rf "$d"' EXIT
  mkdir -p "$d/packages/mcp-client"
  echo '{"version":"2.2.0"}' > "$d/package.json"
  echo '{"version":"1.0.4"}' > "$d/packages/mcp-client/package.json"
  echo '{"version":"2.2.0","packages":[{"version":"1.0.4"}]}' > "$d/server.json"
  check "$d" >/dev/null || { echo "selftest: equal case failed"; fail=1; }
  echo '{"version":"1.0.3","packages":[{"version":"1.0.4"}]}' > "$d/server.json"
  out=$(check "$d") && { echo "selftest: version mismatch passed"; fail=1; }
  echo "$out" | grep -qF 'STALE_SERVER_JSON_VERSION: server.json 1.0.3 != package.json 2.2.0' \
    || { echo "selftest: version mismatch not reported"; fail=1; }
  echo '{"version":"2.2.0","packages":[{"version":"1.0.0"}]}' > "$d/server.json"
  out=$(check "$d") && { echo "selftest: client mismatch passed"; fail=1; }
  echo "$out" | grep -qF 'STALE_SERVER_JSON_CLIENT_VERSION: server.json packages[0] 1.0.0 != packages/mcp-client/package.json 1.0.4' \
    || { echo "selftest: client mismatch not reported"; fail=1; }
  echo '{"version":"1.0.3","packages":[{"version":"1.0.0"}]}' > "$d/server.json"
  write "$d" >/dev/null && check "$d" >/dev/null || { echo "selftest: write did not fix"; fail=1; }
  [ "$fail" = 0 ] && echo "OK"
  return $fail
}

case "${1:-}" in
  --selftest) selftest ;;
  --write) write "${2:-.}" ;;
  *) check "${1:-.}" ;;
esac
