#!/bin/bash
# check-sitemap-slash-canon.sh — SLASH-canonical (T-0217) verifier.
#
# Every page in static/sitemap.xml is canonical at exactly one trailing-slash
# form; the OTHER form must 301 to it, never 404 (that was the whole bug:
# nginx has no catch-all `location /`, so any unmatched spelling of an
# otherwise-live page fell to the default root and 404'd). This script reads
# the sitemap out of the working tree and hits BASE over the network to
# confirm both forms behave, plus the two directory-backed exceptions
# (/video/, /guides/, canonical WITH the slash) and the negative case (API/
# protocol prefixes must never pick up a stray redirect).
#
# nginx (nginx/nginx.conf, SLASH-canonical block) hardcodes the redirect
# target as https://apibase.pro regardless of how it was reached -- the
# container sees $scheme=http behind the host TLS proxy -- so expected
# Location headers below are always https://apibase.pro, even when BASE
# points at a local/staging address for the request itself.
#
# Usage:
#   bash scripts/check-sitemap-slash-canon.sh
#   BASE=http://127.0.0.1:8880 HOST_HEADER=apibase.pro bash scripts/check-sitemap-slash-canon.sh
set -euo pipefail

ROOT="${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SITEMAP="$ROOT/static/sitemap.xml"
BASE="${BASE:-https://apibase.pro}"
CANON="https://apibase.pro"
HOST_HEADER="${HOST_HEADER:-}"
FAILED=0

CURL_OPTS=(-s -o /dev/null --max-time 10)
[ -n "$HOST_HEADER" ] && CURL_OPTS+=(-H "Host: $HOST_HEADER")

# prints "<http_code> <redirect_url_or_empty>" for one request, no -L (we want
# the raw first-hop response, not what it eventually resolves to).
probe() {
  curl "${CURL_OPTS[@]}" -w "%{http_code} %{redirect_url}" "$1"
}

report() {
  local label="$1" exp_code="$2" got_code="$3" exp_loc="${4:-}" got_loc="${5:-}"
  if [ "$got_code" != "$exp_code" ]; then
    echo "FAIL $label expected=$exp_code got=$got_code"
    FAILED=$((FAILED + 1))
  elif [ -n "$exp_loc" ] && [ "$got_loc" != "$exp_loc" ]; then
    echo "FAIL $label expected=$exp_loc got=$got_loc"
    FAILED=$((FAILED + 1))
  else
    echo "PASS $label"
  fi
}

[ -f "$SITEMAP" ] || { echo "sitemap not found: $SITEMAP" >&2; exit 1; }
mapfile -t LOCS < <(grep -oP '(?<=<loc>)[^<]*' "$SITEMAP")
[ "${#LOCS[@]}" -gt 0 ] || { echo "no <loc> entries found in $SITEMAP" >&2; exit 1; }

echo "=== 1. every sitemap <loc> responds 200 ==="
for loc in "${LOCS[@]}"; do
  path="${loc#$CANON}"
  out=$(probe "$BASE$path")
  report "$path" 200 "${out%% *}"
done

echo "=== 2. extensionless, non-root, non-.well-known pages: slashed form 301s to the canonical (no-slash) form ==="
for loc in "${LOCS[@]}"; do
  path="${loc#$CANON}"
  [ "$path" = "/" ] && continue
  case "$path" in
    /.well-known/*) continue ;;
    */) continue ;;  # already slash-canonical (e.g. would be /video/, /guides/ if listed)
  esac
  last="${path##*/}"
  case "$last" in *.*) continue ;; esac  # file-like (.txt/.md/.json/...), no slash form applies
  out=$(probe "$BASE$path/")
  report "$path/ -> $path" 301 "${out%% *}" "$CANON$path" "${out#* }"
done

echo "=== 3. directory-backed roots: canonical WITH the slash ==="
out=$(probe "$BASE/video");  report "/video -> /video/" 301 "${out%% *}" "$CANON/video/" "${out#* }"
out=$(probe "$BASE/video/"); report "/video/" 200 "${out%% *}"
out=$(probe "$BASE/guides");  report "/guides -> /guides/" 301 "${out%% *}" "$CANON/guides/" "${out#* }"
out=$(probe "$BASE/guides/"); report "/guides/" 200 "${out%% *}"

echo "=== 4. query string survives the redirect ==="
out=$(probe "$BASE/autopilot/incident/?id=test")
report "/autopilot/incident/?id=test" 301 "${out%% *}" "$CANON/autopilot/incident?id=test" "${out#* }"

echo "=== 5. API/protocol prefixes never get caught by the whitelist regex ==="
for path in /api/v1/tools/ /mcp/ /health/ready/ /.well-known/mcp.json/; do
  out=$(probe "$BASE$path")
  code="${out%% *}"
  if [ "$code" = "301" ] || [ "$code" = "302" ]; then
    echo "FAIL $path expected=not-redirect got=$code"
    FAILED=$((FAILED + 1))
  else
    echo "PASS $path (got=$code, not a redirect)"
  fi
done

echo ""
echo "$FAILED failure(s)"
[ "$FAILED" -eq 0 ]
