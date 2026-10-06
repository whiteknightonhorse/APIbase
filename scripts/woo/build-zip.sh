#!/usr/bin/env bash
# Builds dist/woocommerce-apibase.zip from packages/woocommerce-apibase (no tests/, no .git).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${1:-$ROOT/dist/woocommerce-apibase.zip}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/woocommerce-apibase" "$(dirname "$OUT")"
cp -R "$ROOT/packages/woocommerce-apibase/." "$STAGE/woocommerce-apibase/"
rm -rf "$STAGE/woocommerce-apibase/tests" "$STAGE/woocommerce-apibase/.git"
rm -f "$OUT"
(cd "$STAGE" && python3 - "$OUT" <<'PY'
import os, sys, zipfile
with zipfile.ZipFile(sys.argv[1], "w", zipfile.ZIP_DEFLATED) as z:
    for d, _, files in os.walk("woocommerce-apibase"):
        for f in sorted(files):
            z.write(os.path.join(d, f))
PY
)
echo "$OUT"
