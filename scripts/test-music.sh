#!/usr/bin/env bash
# APIbase.pro — Music / Audio Discovery upstream test (UC-018)
# Tests direct upstream calls to MusicBrainz, ListenBrainz, RadioBrowser.
set -euo pipefail

PASS=0
FAIL=0
TOTAL=7
UA="APIbase/1.0 (https://apibase.pro; contact@apibase.pro)"

check() {
  local name="$1" url="$2" jq_filter="$3" extra_header="${4:-}"
  local args=(-sf -H "Accept: application/json")
  if [ -n "$extra_header" ]; then
    args+=(-H "$extra_header")
  fi
  local body
  body=$(curl "${args[@]}" "$url" 2>/dev/null) || { echo "FAIL  $name — curl error"; FAIL=$((FAIL+1)); return; }
  local result
  result=$(echo "$body" | jq -r "$jq_filter" 2>/dev/null) || { echo "FAIL  $name — jq error"; FAIL=$((FAIL+1)); return; }
  if [ -z "$result" ] || [ "$result" = "null" ]; then
    echo "FAIL  $name — empty result"
    FAIL=$((FAIL+1))
  else
    echo "PASS  $name → $result"
    PASS=$((PASS+1))
  fi
}

echo "=== UC-018: Music / Audio Discovery — Upstream Tests ==="
echo ""

# 1. MusicBrainz — Artist Search (Radiohead)
check "artist_search (Radiohead)" \
  "https://musicbrainz.org/ws/2/artist?query=Radiohead&fmt=json&limit=3" \
  '.artists[0].name' \
  "User-Agent: $UA"

sleep 1.2  # MusicBrainz rate limit: 1 req/sec

# 2. MusicBrainz — Artist Details (Radiohead MBID: a74b1b7f-71a5-4011-9441-d0b5e4122711)
check "artist_details (Radiohead)" \
  "https://musicbrainz.org/ws/2/artist/a74b1b7f-71a5-4011-9441-d0b5e4122711?inc=url-rels+tags+ratings&fmt=json" \
  '.name' \
  "User-Agent: $UA"

sleep 1.2

# 3. MusicBrainz — Release Search (OK Computer)
check "release_search (OK Computer)" \
  "https://musicbrainz.org/ws/2/release?query=OK+Computer&fmt=json&limit=3" \
  '.releases[0].title' \
  "User-Agent: $UA"

sleep 1.2

# 4. MusicBrainz — Release Details (OK Computer MBID: b84ee12a-09ef-421b-82de-0441a926375b)
check "release_details (OK Computer)" \
  "https://musicbrainz.org/ws/2/release/b84ee12a-09ef-421b-82de-0441a926375b?inc=recordings+artist-credits+labels&fmt=json" \
  '.title' \
  "User-Agent: $UA"

sleep 1.2

# 5. MusicBrainz — Recording Search (Creep)
check "recording_search (Creep)" \
  "https://musicbrainz.org/ws/2/recording?query=Creep+artist:Radiohead&fmt=json&limit=3" \
  '.recordings[0].title' \
  "User-Agent: $UA"

# 6. ListenBrainz — Fresh Releases
check "fresh_releases" \
  "https://api.listenbrainz.org/1/explore/fresh-releases/?days=7" \
  '.payload.releases | length | tostring'

# 7. RadioBrowser — Radio Search (rock)
check "radio_search (rock)" \
  "https://de1.api.radio-browser.info/json/stations/search?tag=rock&limit=5&hidebroken=true" \
  '.[0].name'

echo ""
echo "=== Results: ${PASS}/${TOTAL} PASS, ${FAIL}/${TOTAL} FAIL ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
