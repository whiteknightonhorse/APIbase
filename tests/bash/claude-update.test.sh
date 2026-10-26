#!/bin/bash
# T-0579: claude-update.sh refuses while a card is active; swaps atomically otherwise.
# shellcheck disable=SC2319  # ok() deliberately reports the result of the preceding test
set -u
S="$(cd "$(dirname "$0")/../.." && pwd)/scripts/ops/claude-update.sh"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/tl/active" "$T/tl/state" "$T/ch"
cat > "$T/bin/npm" <<'NPM'
#!/bin/bash
if [ "$1" = view ]; then echo 9.9.9; exit 0; fi
if [ "$1" = install ]; then
  while [ "$1" != "--prefix" ]; do shift; done; p="$2"
  mkdir -p "$p/node_modules/.bin"
  printf '#!/bin/sh\necho 9.9.9\n' > "$p/node_modules/.bin/claude"; chmod +x "$p/node_modules/.bin/claude"
fi
NPM
chmod +x "$T/bin/npm"
export PATH="$T/bin:$PATH" CLAUDE_HOME="$T/ch" TASKLOOP_DIR="$T/tl" CLAUDE_UPDATE_LOG="$T/log"
fail=0
ok() { if [ "$2" = 0 ]; then echo "ok   $1"; else echo "FAIL $1"; fail=1; fi; }

touch "$T/tl/active/card.md"
bash "$S" >/dev/null; [ ! -e "$T/ch/current" ]; ok "active card -> no swap" $?
grep -q 'SKIP none -> 9.9.9: a card is active' "$T/log"; ok "refusal logged" $?
rm "$T/tl/active/card.md"
bash "$S" >/dev/null; [ "$(cat "$T/ch/current/version")" = 9.9.9 ]; ok "idle -> swapped" $?
"$T/ch/current/bin/claude" --version | grep -q 9.9.9; ok "current/bin/claude runs" $?
grep -q 'none -> 9.9.9' "$T/log"; ok "swap logged" $?
bash "$S" --check | grep -q 'current=9.9.9 latest=9.9.9'; ok "--check prints versions" $?
exit $fail
