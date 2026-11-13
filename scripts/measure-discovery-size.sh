#!/usr/bin/env bash
# Measure the size of APIbase discovery surfaces (T-0834).
# Usage: scripts/measure-discovery-size.sh [base_url]   (default https://apibase.pro)
# Read-only: GET requests and one MCP initialize + tools/list per view. No key, no payment.
# Output: tab-separated lines: UTC date, surface, HTTP status, body bytes, tool count, note.
# Bytes are uncompressed (Accept-Encoding: identity). The script never fails on a bad surface.
set -u

BASE="${1:-https://apibase.pro}"
BASE="${BASE%/}"
DATE="$(date -u +%Y-%m-%dT%H:%MZ)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

printf '# measure-discovery-size base=%s date=%s Accept-Encoding: identity (bytes are uncompressed)\n' "$BASE" "$DATE"
printf '# columns: date\tsurface\thttp_status\tbytes\ttools\tnote\n'

line() { printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$DATE" "$1" "$2" "$3" "$4" "$5"; }

# Extract the JSON payload from a body that is plain JSON or an SSE stream.
payload() {
  if head -c 6 "$1" | grep -q '^event:\|^data:'; then
    grep '^data:' "$1" | sed 's/^data: \{0,1\}//'
  else
    cat "$1"
  fi
}

rest() { # rest <path-with-query>
  local path="$1" code bytes count
  code="$(curl -sS -m 60 -H 'Accept-Encoding: identity' -H 'Accept: application/json' \
    -o "$TMP/body" -w '%{http_code}' "$BASE$path" 2>/dev/null)" || code="000"
  bytes="$(wc -c <"$TMP/body" 2>/dev/null | tr -d ' ')"
  count="-"
  if [ "$code" = "200" ]; then
    count="$(jq -r 'if type=="object" then (if (.tools|type)=="array" then (.tools|length) elif (.data|type)=="array" then (.data|length) elif (.results|type)=="array" then (.results|length) elif (.categories|type)=="array" then (.categories|length) else "-" end) else "-" end' "$TMP/body" 2>/dev/null)" || count="-"
    [ -n "$count" ] || count="-"
  fi
  line "GET $path" "$code" "${bytes:-0}" "$count" ""
}

mcp() { # mcp <path-with-query>
  local path="$1" hdr="$TMP/hdr" sid code1 code2 b1 b2 count cursor
  : >"$TMP/b2"
  code1="$(curl -sS -m 60 -D "$hdr" -H 'Accept-Encoding: identity' \
    -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"measure-discovery-size","version":"1"}}}' \
    -o "$TMP/b1" -w '%{http_code}' "$BASE$path" 2>/dev/null)" || code1="000"
  b1="$(wc -c <"$TMP/b1" | tr -d ' ')"
  sid="$(grep -i '^mcp-session-id:' "$hdr" 2>/dev/null | head -n1 | cut -d: -f2- | tr -d ' \r\n')"
  local sidh=()
  [ -n "$sid" ] && sidh=(-H "mcp-session-id: $sid")
  curl -sS -m 60 -o /dev/null -H 'Accept-Encoding: identity' -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' "${sidh[@]}" \
    -d '{"jsonrpc":"2.0","method":"notifications/initialized"}' "$BASE$path" >/dev/null 2>&1 || true
  code2="$(curl -sS -m 120 -H 'Accept-Encoding: identity' \
    -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
    "${sidh[@]}" -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
    -o "$TMP/b2" -w '%{http_code}' "$BASE$path" 2>/dev/null)" || code2="000"
  b2="$(wc -c <"$TMP/b2" | tr -d ' ')"
  count="-"
  cursor="nextCursor=unknown"
  if [ "$code2" = "200" ]; then
    payload "$TMP/b2" >"$TMP/b2.json" 2>/dev/null
    count="$(jq -rs 'map(.result.tools // empty | length) | first // "-"' "$TMP/b2.json" 2>/dev/null)" || count="-"
    cursor="nextCursor=$(jq -rs 'map(.result // {} | has("nextCursor")) | first // false' "$TMP/b2.json" 2>/dev/null || echo unknown)"
  fi
  line "MCP initialize+tools/list $path" "$code1/$code2" "$((b1 + b2))" "$count" "init=${b1}B list=${b2}B $cursor"
}

mcp "/mcp"
mcp "/mcp?tools=lean"
mcp "/mcp?tools=shop"
mcp "/mcp?tools=all"
rest "/api/tools"
rest "/api/tools?view=compact&limit=100"
rest "/api/v1/tools"
rest "/api/v1/categories"
rest "/api/v1/discover?limit=1"
rest "/api/v1/discover?category=finance&limit=5"
exit 0
