#!/bin/bash
# T-0685: sandbox-image.sh tag filter and restore, against a fake docker on PATH.
set -u
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/deploy/sandbox/sandbox-image.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/sb"
cp "$SRC" "$T/sb/sandbox-image.sh"; : > "$T/sb/docker-compose.sandbox.yml"
echo "SECRET_MARKER=hunter2" > "$T/sb/.env.sandbox"
cat > "$T/bin/docker" <<'F'
#!/bin/bash
echo "$*" >> "$FAKE_LOG"
case "$1" in
  image) [ "$2" = inspect ] || exit 1
         case "$3" in *:latest|*:some-name|*:t0566-8a774a9d|*:sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa|sha256:1111111111111111) exit 0;; *) exit 1;; esac ;;
  inspect) if grep -q '^compose' "$FAKE_LOG"; then echo "sha256:2222222222222222"; else echo "sha256:1111111111111111"; fi ;;
  tag) ;;
  compose) echo "IMAGE_TAG=$IMAGE_TAG" >> "$FAKE_LOG" ;;
esac
F
chmod +x "$T/bin/docker"
export PATH="$T/bin:$PATH" FAKE_LOG="$T/log"
S="$T/sb/sandbox-image.sh"; fail=0
ok()  { echo "ok   $1"; }
bad() { echo "FAIL $1"; fail=1; }
refuse() { : > "$FAKE_LOG"; rm -f "$T/sb/.sandbox-image-state"
  if "$S" "$1" >"$T/out" 2>&1; then bad "accepted '$1'"
  elif grep -q '^compose' "$FAKE_LOG"; then bad "compose ran for '$1'"; else ok "refused '$1'"; fi; cat "$T/out" >> "$T/allout"; }
accept() { : > "$FAKE_LOG"; rm -f "$T/sb/.sandbox-image-state"
  if "$S" "$1" >"$T/out" 2>&1 && grep -q "IMAGE_TAG=$1" "$FAKE_LOG"; then cat "$T/out" >> "$T/allout"; ok "accepted '$1'"; else bad "refused '$1'"; fi; }
: > "$T/allout"
accept t0566-8a774a9d
accept sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
refuse latest
refuse some-name
refuse t0566-8a774a9e
refuse sha-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
refuse 'sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa;ls'
refuse ''
grep -q hunter2 "$T/allout" && bad "env file content printed" || ok "env file not printed"
: > "$FAKE_LOG"; rm -f "$T/sb/.sandbox-image-state"
"$S" t0566-8a774a9d >/dev/null 2>&1
[ "$(cat "$T/sb/.sandbox-image-state")" = "sha256:1111111111111111" ] && ok "state records previous id" || bad "state"
"$S" sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa >/dev/null 2>&1
[ "$(cat "$T/sb/.sandbox-image-state")" = "sha256:1111111111111111" ] && ok "second swap keeps original" || bad "state overwritten"
: > "$FAKE_LOG"; "$S" restore >/dev/null 2>&1
if grep -q 'tag sha256:1111111111111111 ghcr.io/whiteknightonhorse/apibase:sandbox-restore' "$FAKE_LOG" \
   && grep -q 'IMAGE_TAG=sandbox-restore' "$FAKE_LOG" && [ ! -e "$T/sb/.sandbox-image-state" ]; then ok restore; else bad restore; fi
"$S" restore >/dev/null 2>&1 && bad "restore without state" || ok "restore without state refused"
exit $fail
