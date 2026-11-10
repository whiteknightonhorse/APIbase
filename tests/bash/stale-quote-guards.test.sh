#!/bin/bash
# T-0755: the two guards of scripts/sandbox/stale-quote.sh exit 2 before curl or docker is called.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
S="$REPO/scripts/sandbox/stale-quote.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
FAIL=0
ok(){ echo "ok   $1"; }
bad(){ echo "FAIL $1"; FAIL=1; }
mkdir "$T/bin"
for c in curl docker; do
  printf '#!/bin/sh\necho %s >> "%s/marker"\nexit 0\n' "$c" "$T" > "$T/bin/$c"
  chmod +x "$T/bin/$c"
done
run(){ PATH="$T/bin:$PATH" env "$@" bash "$S" >/dev/null 2>&1; }

rm -f "$T/marker"
run SANDBOX_URL=https://apibase.pro; rc=$?
[ "$rc" = 2 ] && [ ! -e "$T/marker" ] && ok "production host apibase.pro -> exit 2, no curl/docker" || bad "guard apibase.pro (rc=$rc)"
rm -f "$T/marker"
run SANDBOX_URL=https://www.apibase.pro/x; rc=$?
[ "$rc" = 2 ] && [ ! -e "$T/marker" ] && ok "production host www.apibase.pro -> exit 2, no curl/docker" || bad "guard www (rc=$rc)"
rm -f "$T/marker"
run SANDBOX_PG_CONTAINER=apibase-postgres-1; rc=$?
[ "$rc" = 2 ] && [ ! -e "$T/marker" ] && ok "non-sandbox container -> exit 2, no curl/docker" || bad "guard container (rc=$rc)"
bash -n "$S" && ok "bash -n clean" || bad "bash -n"
[ "$FAIL" = 0 ]
