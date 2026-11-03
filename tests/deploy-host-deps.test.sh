#!/usr/bin/env bash
# T-0680: tests for scripts/lib/host-deps.sh. Fake npm/npx/node on PATH and a fake
# scripts/sync-counts.sh in a temp "tree"; every call is recorded in $TMP/calls.
# Mutation self-check at the end: deleting the stamp comparison must turn test 2 red.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB="${HOST_DEPS_LIB:-$ROOT/scripts/lib/host-deps.sh}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FAILS=0
ok() { echo "ok   - $1"; }
bad() { echo "FAIL - $1"; FAILS=$((FAILS + 1)); }

BIN="$TMP/bin"
TREE="$TMP/tree"
CALLS="$TMP/calls"
mkdir -p "$BIN" "$TREE/scripts" "$TREE/prisma" "$TREE/node_modules"

for c in npm npx; do
  printf '#!/bin/bash\necho "%s $*" >> "%s"\n' "$c" "$CALLS" > "$BIN/$c"
  chmod +x "$BIN/$c"
done
printf '#!/bin/bash\necho v22.0.0\n' > "$BIN/node"
chmod +x "$BIN/node"
# Fake sync-counts: prints $TMP/verify.out, exits with $TMP/verify.rc.
cat > "$TREE/scripts/sync-counts.sh" <<EOF
#!/bin/bash
echo "sync-counts \$*" >> "$CALLS"
cat "$TMP/verify.out"
exit "\$(cat "$TMP/verify.rc")"
EOF

export PATH="$BIN:$PATH"
export HOST_DEPS_LOCK="$TMP/host-deps.lock"
echo '{"lock":1}' > "$TREE/package-lock.json"
echo 'model A {}' > "$TREE/prisma/schema.prisma"

run() { # prints rc via global RC, stdout+stderr into $TMP/out
  : > "$CALLS"
  # shellcheck source=/dev/null
  RC=0; ( . "$LIB"; host_deps_sync "$TREE" ) > "$TMP/out" 2>&1 || RC=$?
}
reset() { rm -f "$TREE/node_modules/.apibase-deps-stamp"; echo ok > "$TMP/verify.out"; echo 0 > "$TMP/verify.rc"; }

# 1: no stamp -> npm ci then prisma generate, in order; stamp written
reset; run
if [ "$RC" = 0 ] && [ "$(grep -n '^npm ci --ignore-scripts --legacy-peer-deps$' "$CALLS" | cut -d: -f1)" = 1 ] \
  && [ "$(grep -n '^npx prisma generate$' "$CALLS" | cut -d: -f1)" = 2 ] \
  && [ -s "$TREE/node_modules/.apibase-deps-stamp" ]; then ok "1 no stamp: npm ci, prisma generate, stamp"; else bad "1 no stamp"; cat "$CALLS"; fi

# 2: stamp equal -> zero calls
run
if [ "$RC" = 0 ] && [ ! -s "$CALLS" ] && grep -q 'host deps: current' "$TMP/out"; then ok "2 stamp equal: zero calls"; else bad "2 stamp equal"; cat "$CALLS"; fi

# 3: package-lock.json changed -> both called
echo '{"lock":2}' > "$TREE/package-lock.json"; run
if [ "$RC" = 0 ] && grep -q '^npm ci' "$CALLS" && grep -q '^npx prisma generate' "$CALLS"; then ok "3 lock changed: reinstall"; else bad "3 lock changed"; fi

# 3b: schema changed -> reinstall
echo 'model B {}' > "$TREE/prisma/schema.prisma"; run
if [ "$RC" = 0 ] && grep -q '^npx prisma generate' "$CALLS"; then ok "3b schema changed: reinstall"; else bad "3b schema changed"; fi

# 4: crash signature -> rc 1, stamp not written
reset; echo "TypeError: z.string().guid is not a function" > "$TMP/verify.out"; echo 1 > "$TMP/verify.rc"; run
if [ "$RC" = 1 ] && [ ! -e "$TREE/node_modules/.apibase-deps-stamp" ] && grep -q 'TypeError' "$TMP/out"; then ok "4 crash signature: rc 1, no stamp"; else bad "4 crash signature (rc=$RC)"; fi

# 5: drift without signature -> rc 0, stamp written
reset; echo "STALE_tools: expected 1369 got 1370 exit 1" > "$TMP/verify.out"; echo 1 > "$TMP/verify.rc"; run
if [ "$RC" = 0 ] && [ -s "$TREE/node_modules/.apibase-deps-stamp" ] && grep -q 'drift, owned by Static Counts Drift' "$TMP/out"; then ok "5 drift: rc 0, stamp written"; else bad "5 drift (rc=$RC)"; fi

# 6: npm ci failure -> rc 1, prisma not called
reset; printf '#!/bin/bash\necho "npm $*" >> "%s"; echo boom >&2; exit 1\n' "$CALLS" > "$BIN/npm"; run
if [ "$RC" = 1 ] && ! grep -q '^npx' "$CALLS" && [ ! -e "$TREE/node_modules/.apibase-deps-stamp" ]; then ok "6 npm ci fails: rc 1"; else bad "6 npm ci fails"; fi
printf '#!/bin/bash\necho "npm $*" >> "%s"\n' "$CALLS" > "$BIN/npm"

# Mutation: remove the stamp comparison -> test 2 must fail
if [ -z "${HOST_DEPS_LIB:-}" ]; then
  MUT="$TMP/host-deps.mut.sh"
  sed 's/\[ "\$want" = "\$have" \]/false/' "$LIB" > "$MUT"
  if cmp -s "$LIB" "$MUT"; then bad "mutation did not apply"; else
    MUT_OUT="$(HOST_DEPS_LIB="$MUT" bash "${BASH_SOURCE[0]}" 2>&1 || true)"
    if grep -q '^FAIL - 2 stamp equal' <<<"$MUT_OUT"; then ok "mutation: test 2 goes red"; else bad "mutation: test 2 stayed green"; fi
  fi
fi

[ "$FAILS" = 0 ] && { echo "ALL PASS"; exit 0; }
echo "$FAILS FAILED"; exit 1
