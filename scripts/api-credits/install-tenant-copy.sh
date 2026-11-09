#!/usr/bin/env bash
# T-0746: install the api-credits tooling into /home/<tenant>/bin/api-credits/. Run by the dispatcher on apibase
# (cron/dispatcher context), never by the executor. SUDO (default "sudo -n") and HOME_BASE (default /home) are
# overridable for tests exactly like lib-drift.sh; SUDO="" means no elevation and no ownership change.
# Usage: install-tenant-copy.sh <tenant>
set -u
set +x
tenant="${1:-}"
[[ "$tenant" =~ ^[a-z][a-z0-9_-]*$ ]] || { echo "usage: install-tenant-copy.sh <tenant>" >&2; exit 2; }
SUDO="${SUDO-sudo -n}"
HOME_BASE="${HOME_BASE:-/home}"
here="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
repo_cfg="$here/../../config/api-credits.json"
dest="$HOME_BASE/$tenant/bin/api-credits"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
own=(); [ -n "$SUDO" ] && own=(-o "$tenant")
$SUDO install -d "${own[@]}" -m 0755 "$dest" || { echo "cannot create $dest" >&2; exit 1; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
rc=0
files=(api-call api-batch api-spend api-key-install api-cycle-rollover api_credits.py api-credits.json)
for f in "${files[@]}"; do
  if [ "$f" = api-credits.json ]; then src="$repo_cfg"; mode=0644; else src="$here/$f"; mode=0755; fi
  if $SUDO test -e "$dest/$f"; then
    $SUDO cp -p "$dest/$f" "$dest/$f.bak-pre-0746-$ts" || { echo "backup of $f failed" >&2; rc=1; continue; }
  fi
  $SUDO install "${own[@]}" -m "$mode" "$src" "$dest/$f" || { echo "install of $f failed" >&2; rc=1; continue; }
done
# Compile check on the installed bytes, in a scratch dir so no __pycache__ lands in the tenant tree.
$SUDO cat "$dest/api_credits.py" > "$tmp/api_credits.py" && python3 -I -m py_compile "$tmp/api_credits.py" || { echo "py_compile failed" >&2; rc=1; }
for f in "${files[@]}"; do
  $SUDO md5sum "$dest/$f" || rc=1
done
exit $rc
