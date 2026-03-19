#!/usr/bin/env bash
#
# awesome-list-pr.sh — Submit PRs to awesome-lists for APIbase visibility.
#
# Picks one random unsubmitted repo per run, forks, adds entry, creates PR.
# Designed for daily cron: randomized text + tracked state to avoid duplicates.
#
# Usage:
#   ./scripts/awesome-list-pr.sh          — auto-pick random repo
#   ./scripts/awesome-list-pr.sh list     — show all targets and status
#   ./scripts/awesome-list-pr.sh <index>  — submit to specific target (0-based)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
STATE_FILE="$PROJECT_DIR/.awesome-list-state.json"
LOG_FILE="$PROJECT_DIR/logs/awesome-list-pr.log"

# Load token
if [[ -f "$PROJECT_DIR/.env" ]]; then
  GITHUB_TOKEN=$(grep '^GITHUB_AWESOME_TOKEN=' "$PROJECT_DIR/.env" | cut -d= -f2)
fi

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "ERROR: GITHUB_AWESOME_TOKEN not found in .env"
  exit 1
fi

GH_USER="whiteknightonhorse"
APIBASE_REPO="https://github.com/$GH_USER/APIbase"
APIBASE_URL="https://apibase.pro"
GLAMA_URL="https://glama.ai/mcp/servers/$GH_USER/APIbase"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  local msg="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $1"
  echo "$msg" | tee -a "$LOG_FILE"
}

gh_api() {
  curl -sf -H "Authorization: Bearer $GITHUB_TOKEN" \
       -H "Accept: application/vnd.github+json" \
       -H "X-GitHub-Api-Version: 2022-11-28" \
       "$@"
}

gh_api_post() {
  local url="$1"; shift
  curl -sf -X POST -H "Authorization: Bearer $GITHUB_TOKEN" \
       -H "Accept: application/vnd.github+json" \
       -H "X-GitHub-Api-Version: 2022-11-28" \
       -H "Content-Type: application/json" \
       "$url" "$@"
}

gh_api_put() {
  local url="$1"; shift
  curl -sf -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" \
       -H "Accept: application/vnd.github+json" \
       -H "X-GitHub-Api-Version: 2022-11-28" \
       -H "Content-Type: application/json" \
       "$url" "$@"
}

# ─── Target Repos ───────────────────────────────────────────────────────────

# Each target: repo|section_marker|format|pr_title_template
# format: punkpeye | appcypher | wong2 | jaw9c_table | travel_table
TARGETS=(
  "punkpeye/awesome-mcp-servers|Aggregators|punkpeye_agg|Add APIbase to Aggregators"
  "punkpeye/awesome-mcp-servers|Travel & Transportation|punkpeye_travel|Add APIbase to Travel & Transportation"
  "appcypher/awesome-mcp-servers|Aggregators|appcypher|Add APIbase to Aggregators"
  "wong2/awesome-mcp-servers|Community Servers|wong2|Add APIbase to Community Servers"
  "jaw9c/awesome-remote-mcp-servers|Remote MCP Server List|jaw9c_table|Add APIbase remote MCP server"
  "unseen1980/awesome-travel|### Flights|travel_table|Add APIbase — AI-ready flight API hub"
  "caramaschiHG/awesome-ai-agents-2026|Protocols and Standards|ai_agents_2026|Add APIbase — MCP API hub for AI agents"
  "rodert/awesome-mcp|MCP Servers|rodert_mcp|Add APIbase — universal MCP gateway"
)

# ─── Randomized Descriptions ────────────────────────────────────────────────

random_choice() {
  local -a arr=("$@")
  echo "${arr[$((RANDOM % ${#arr[@]}))]}"
}

gen_punkpeye_agg() {
  local descs=(
    "Unified API hub for AI agents with 200+ tools across travel (Amadeus, Sabre), prediction markets (Polymarket), crypto, and weather. Pay-per-call via x402 micropayments in USDC."
    "MCP gateway aggregating 200+ real-time APIs: flight search (Amadeus, Sabre GDS), stocks (Finnhub), news (NewsData), maps (Geoapify), real estate (Walk Score), and 40+ more providers. x402 pay-per-call, no subscriptions."
    "API hub serving 200+ tools to AI agents — flights (Amadeus, Sabre), stocks, news, search (Google/Serper), maps, legal, OCR, and 40+ more providers. x402 micropayments on Base, auto-registration."
  )
  local desc
  desc=$(random_choice "${descs[@]}")
  echo "- [$GH_USER/APIbase]($APIBASE_REPO) [glama]($GLAMA_URL) 📇 ☁️ - $desc"
}

gen_punkpeye_travel() {
  local descs=(
    "Real-time flight search and pricing via Amadeus and Sabre GDS — 17 aviation tools for AI agents via MCP. Airport search, route discovery, flight status, price confirmation."
    "Flight search API hub for AI agents: Amadeus + Sabre GDS with 17 tools — search flights, confirm prices, check status, find airports, discover routes. MCP native."
    "Aviation API gateway with 17 MCP tools: flight search, price confirmation, flight status (Amadeus), destination finder, airline lookup (Sabre GDS). Built for AI agents."
  )
  local desc
  desc=$(random_choice "${descs[@]}")
  echo "- [$GH_USER/APIbase]($APIBASE_REPO) [glama]($GLAMA_URL) 📇 ☁️ - $desc"
}

gen_appcypher() {
  local descs=(
    "Unified MCP gateway to 200+ tools: flight search (Amadeus, Sabre), prediction markets (Polymarket), crypto, weather. Pay-per-call via x402 micropayments."
    "API hub for AI agents — 200+ tools including travel (Amadeus, Sabre GDS), prediction markets, crypto data, weather. x402 USDC micropayments, auto-registration."
    "Multi-provider MCP server: 200+ real-time API tools across travel, finance, search, news, legal, real estate, and 15+ more categories. x402 pay-per-call in USDC on Base."
  )
  local desc
  desc=$(random_choice "${descs[@]}")
  echo "- [APIbase]($APIBASE_REPO) - $desc"
}

gen_wong2() {
  local descs=(
    "Unified API hub for AI agents with 200+ tools — flight search (Amadeus, Sabre), prediction markets (Polymarket), crypto, weather. x402 pay-per-call."
    "MCP gateway aggregating 200+ real-time APIs across travel, finance, news, maps, legal, real estate, and more. Pay-per-call via x402 micropayments."
    "API hub serving 200+ tools to AI agents: flights, prediction markets, crypto, weather, and more. x402 USDC micropayments, auto-registration."
  )
  local desc
  desc=$(random_choice "${descs[@]}")
  echo "- **[APIbase]($APIBASE_REPO)** - $desc"
}

gen_jaw9c_table() {
  local descs=(
    "200+ API tools: flights, prediction markets, crypto, weather"
    "Unified API hub: flight search, prediction markets, crypto data"
    "Multi-provider API gateway: travel, finance, crypto, weather tools"
  )
  local desc
  desc=$(random_choice "${descs[@]}")
  echo "| [APIbase]($APIBASE_URL) | Aggregator | \`$APIBASE_URL/mcp\` | API Key / x402 | [$GH_USER]($APIBASE_REPO) | $desc |"
}

gen_travel_table() {
  local descs=(
    "AI-ready API hub wrapping Amadeus + Sabre GDS for flight search, pricing, status. MCP native, x402 micropayments."
    "MCP gateway for flight search via Amadeus and Sabre GDS — 17 aviation tools for AI agents."
    "Unified flight API for AI agents: Amadeus + Sabre GDS wrapped in MCP. Search, price, status, routes."
  )
  local desc
  desc=$(random_choice "${descs[@]}")
  echo "| APIbase | $desc | [Go!]($APIBASE_URL) |"
}

gen_ai_agents_2026() {
  local descs=(
    "Universal MCP gateway — 200+ tools across flights, stocks, news, maps, legal, OCR, image gen, email, SMS. x402 USDC micropayments on Base. One endpoint for any AI agent."
    "MCP API hub with 200+ tools (Amadeus, Finnhub, Serper, Tavily, NASA, USGS, Twilio). Pay-per-call via x402, no subscriptions. Production-ready, open source."
    "Single MCP endpoint giving AI agents access to 200+ real-world APIs — travel, finance, search, legal, real estate, and more. x402 micropayments, auto-registration."
  )
  local desc
  desc=$(random_choice "${descs[@]}")
  echo "- [APIbase](https://apibase.pro) - $desc"
}

gen_rodert_mcp() {
  local descs=(
    "Universal MCP gateway aggregating 200+ tools from 46 providers — flights, stocks, news, search, maps, legal, OCR, image generation. x402 USDC pay-per-call on Base."
    "Production MCP server with 200+ tools: Google Search (Serper), AI search (Tavily, Exa), stocks (Finnhub), news (NewsData), and 40+ more providers. x402 micropayments."
    "MCP API hub — 200+ tools across 15+ categories. One endpoint, pay per call in USDC. Open source, 13-stage pipeline, auto-registration."
  )
  local desc
  desc=$(random_choice "${descs[@]}")
  echo "- [APIbase](https://apibase.pro) - $desc"
}

# ─── State Management ───────────────────────────────────────────────────────

init_state() {
  if [[ ! -f "$STATE_FILE" ]]; then
    echo '{}' > "$STATE_FILE"
  fi
}

get_state() {
  local key="$1"
  STATE_KEY="$key" python3 -c "
import json, os
with open('$STATE_FILE') as f:
    state = json.load(f)
print(state.get(os.environ['STATE_KEY'], ''))
" 2>/dev/null || echo ""
}

set_state() {
  local key="$1" value="$2"
  STATE_KEY="$key" STATE_VAL="$value" python3 -c "
import json, os
with open('$STATE_FILE') as f:
    state = json.load(f)
state[os.environ['STATE_KEY']] = os.environ['STATE_VAL']
with open('$STATE_FILE', 'w') as f:
    json.dump(state, f, indent=2)
"
}

# ─── Core Logic ─────────────────────────────────────────────────────────────

list_targets() {
  init_state
  echo "=== Awesome-List PR Targets ==="
  echo ""
  for i in "${!TARGETS[@]}"; do
    IFS='|' read -r repo section format title <<< "${TARGETS[$i]}"
    local state_key="${repo//\//_}_${format}"
    local status
    status=$(get_state "$state_key")
    local marker="[ ]"
    [[ -n "$status" ]] && marker="[x] ($status)"
    printf "  %d. %s %s — %s\n     Section: %s\n\n" "$i" "$marker" "$repo" "$title" "$section"
  done
}

pick_random_target() {
  init_state
  local available=()
  for i in "${!TARGETS[@]}"; do
    IFS='|' read -r repo section format title <<< "${TARGETS[$i]}"
    local state_key="${repo//\//_}_${format}"
    local status
    status=$(get_state "$state_key")
    if [[ -z "$status" ]]; then
      available+=("$i")
    fi
  done

  if [[ ${#available[@]} -eq 0 ]]; then
    log "All targets already submitted. Nothing to do."
    exit 0
  fi

  echo "${available[$((RANDOM % ${#available[@]}))]}"
}

submit_pr() {
  local idx="$1"
  IFS='|' read -r repo section format title <<< "${TARGETS[$idx]}"
  local state_key="${repo//\//_}_${format}"
  local owner="${repo%%/*}"
  local reponame="${repo##*/}"

  log "=== Submitting PR to $repo (format: $format) ==="

  # 1. Check if already submitted
  local existing
  existing=$(get_state "$state_key")
  if [[ -n "$existing" ]]; then
    log "Already submitted: $existing. Skipping."
    return 0
  fi

  # 2. Check for existing open PRs from us
  local existing_prs
  existing_prs=$(gh_api "https://api.github.com/repos/$repo/pulls?state=open&head=$GH_USER:" 2>/dev/null | python3 -c "
import json, sys
prs = json.load(sys.stdin)
for pr in prs:
    if 'apibase' in pr.get('title','').lower() or 'APIbase' in pr.get('body',''):
        print(pr['html_url'])
" 2>/dev/null || echo "")

  if [[ -n "$existing_prs" ]]; then
    log "Open PR already exists: $existing_prs"
    set_state "$state_key" "pr_exists:$existing_prs"
    return 0
  fi

  # 3. Fork the repo (idempotent — returns existing fork if already forked)
  log "Forking $repo..."
  local fork_result
  fork_result=$(gh_api_post "https://api.github.com/repos/$repo/forks" -d '{}' 2>&1) || {
    log "ERROR: Fork failed: $fork_result"
    return 1
  }
  local fork_full
  fork_full=$(echo "$fork_result" | python3 -c "import json,sys; print(json.load(sys.stdin)['full_name'])" 2>/dev/null)
  log "Fork: $fork_full"

  # Wait for fork to be ready
  sleep 5

  # 4. Get default branch
  local default_branch
  default_branch=$(gh_api "https://api.github.com/repos/$repo" | python3 -c "import json,sys; print(json.load(sys.stdin)['default_branch'])" 2>/dev/null)
  log "Default branch: $default_branch"

  # 5. Get latest commit SHA of default branch
  local base_sha
  base_sha=$(gh_api "https://api.github.com/repos/$fork_full/git/refs/heads/$default_branch" | python3 -c "import json,sys; print(json.load(sys.stdin)['object']['sha'])" 2>/dev/null)
  log "Base SHA: $base_sha"

  # 6. Create new branch
  local branch_name="add-apibase-$(date +%Y%m%d)-$RANDOM"
  log "Creating branch: $branch_name"
  gh_api_post "https://api.github.com/repos/$fork_full/git/refs" \
    -d "{\"ref\":\"refs/heads/$branch_name\",\"sha\":\"$base_sha\"}" > /dev/null

  # 7. Get README content
  local readme_path="README.md"
  local readme_data
  readme_data=$(gh_api "https://api.github.com/repos/$fork_full/contents/$readme_path?ref=$branch_name")
  local readme_sha
  readme_sha=$(echo "$readme_data" | python3 -c "import json,sys; print(json.load(sys.stdin)['sha'])")
  local readme_content
  readme_content=$(echo "$readme_data" | python3 -c "
import json, sys, base64
data = json.load(sys.stdin)
print(base64.b64decode(data['content']).decode('utf-8'))
")

  # 8. Generate entry based on format
  local new_entry
  case "$format" in
    punkpeye_agg)    new_entry=$(gen_punkpeye_agg) ;;
    punkpeye_travel) new_entry=$(gen_punkpeye_travel) ;;
    appcypher)       new_entry=$(gen_appcypher) ;;
    wong2)           new_entry=$(gen_wong2) ;;
    jaw9c_table)     new_entry=$(gen_jaw9c_table) ;;
    travel_table)    new_entry=$(gen_travel_table) ;;
    ai_agents_2026)  new_entry=$(gen_ai_agents_2026) ;;
    rodert_mcp)      new_entry=$(gen_rodert_mcp) ;;
    *)
      log "ERROR: Unknown format: $format"
      return 1
      ;;
  esac

  log "Entry: $new_entry"

  # 9. Insert entry into README
  local updated_content
  updated_content=$(SECTION_MARKER="$section" NEW_ENTRY="$new_entry" python3 -c "
import os, sys, re

section = os.environ['SECTION_MARKER']
entry = os.environ['NEW_ENTRY']
readme = sys.stdin.read()

lines = readme.split('\n')
insert_idx = None

def extract_sort_key(line):
    \"\"\"Extract alphabetical sort key from a list entry.\"\"\"
    m = re.search(r'\[([^\]]+)\]', line)
    if m:
        return m.group(1).lower()
    return line.lower()

entry_sort_key = extract_sort_key(entry)

for i, line in enumerate(lines):
    stripped = line.strip()
    if section in line and (stripped.startswith('#') or section.startswith('###')):
        # Find section entries and insert alphabetically
        in_table_header = False
        first_entry = None
        for j in range(i+1, min(i+2000, len(lines))):
            s = lines[j].strip()

            # List format (- [Name]...)
            if s.startswith('- ') or s.startswith('* '):
                if first_entry is None:
                    first_entry = j
                line_key = extract_sort_key(s)
                if line_key > entry_sort_key:
                    insert_idx = j
                    break
                continue

            # Table format
            elif s.startswith('|') and '---' in s:
                in_table_header = True
                continue
            elif s.startswith('|') and in_table_header:
                if first_entry is None:
                    first_entry = j
                in_table_header = False
                line_key = extract_sort_key(s)
                if line_key > entry_sort_key:
                    insert_idx = j
                    break
                continue
            elif s.startswith('|') and not in_table_header and first_entry is not None:
                line_key = extract_sort_key(s)
                if line_key > entry_sort_key:
                    insert_idx = j
                    break
                continue

            # Empty line between entries — skip
            elif s == '' and first_entry is not None:
                continue

            # Next section or end of list
            elif s.startswith('#') and j > i+1:
                insert_idx = j
                break
            elif first_entry is not None and not s.startswith('-') and not s.startswith('|') and s != '':
                insert_idx = j
                break

        # If we scanned all entries and didn't find one > our key, insert at end
        if insert_idx is None and first_entry is not None:
            insert_idx = j
        elif insert_idx is None:
            insert_idx = i + 2
        break

if insert_idx is None:
    print('SECTION_NOT_FOUND: ' + section, file=sys.stderr)
    sys.exit(1)

lines.insert(insert_idx, entry)
# Ensure trailing newline
result = '\n'.join(lines)
if not result.endswith('\n'):
    result += '\n'
print(result, end='')
" <<< "$readme_content" 2>/tmp/awesome_pr_err)

  if [[ $? -ne 0 ]]; then
    log "ERROR: Could not find section '$section' in README"
    cat /tmp/awesome_pr_err >> "$LOG_FILE" 2>/dev/null
    return 1
  fi

  # 10. Commit the change
  local tmp_content
  tmp_content=$(mktemp)
  echo -n "$updated_content" | base64 -w 0 > "$tmp_content"

  local commit_msg="Add APIbase to ${section//\"/}"
  log "Committing: $commit_msg"

  local tmp_payload
  tmp_payload=$(mktemp)
  COMMIT_MSG="$commit_msg" FILE_SHA="$readme_sha" BRANCH="$branch_name" B64_FILE="$tmp_content" python3 -c "
import json, os
with open(os.environ['B64_FILE']) as f:
    encoded = f.read()
print(json.dumps({
    'message': os.environ['COMMIT_MSG'],
    'content': encoded,
    'sha': os.environ['FILE_SHA'],
    'branch': os.environ['BRANCH']
}))" > "$tmp_payload"

  gh_api_put "https://api.github.com/repos/$fork_full/contents/$readme_path" \
    -d @"$tmp_payload" > /dev/null

  rm -f "$tmp_content" "$tmp_payload"

  # 11. Create PR
  local -a pr_bodies=(
    "Adding [APIbase](https://apibase.pro) — a unified MCP gateway that serves 200+ real-time API tools to AI agents across travel, finance, news, maps, legal, real estate, and more.

APIbase is an open-source, production MCP server with x402 micropayments, auto-registration, and Streamable HTTP transport."
    "Hi! Adding [APIbase](https://apibase.pro) to the list. It's an MCP server that aggregates 200+ API tools (Amadeus, Sabre, Polymarket, crypto, weather) into a single endpoint for AI agents. Pay-per-call via x402 USDC micropayments.

GitHub: https://github.com/$GH_USER/APIbase
Smithery: https://smithery.ai/servers/apibase-pro/api-hub (100/100 quality score)"
    "Submitting [APIbase](https://apibase.pro) — an MCP server providing AI agents access to 200+ tools across multiple domains (flights, prediction markets, crypto, weather). Uses x402 protocol for pay-per-call micropayments in USDC.

- MCP endpoint: https://apibase.pro/mcp
- Smithery listing: https://smithery.ai/servers/apibase-pro/api-hub
- Source: https://github.com/$GH_USER/APIbase"
  )
  local pr_body="${pr_bodies[$((RANDOM % ${#pr_bodies[@]}))]}"

  log "Creating PR: $title"
  local pr_payload
  pr_payload=$(PR_TITLE="$title" PR_BODY="$pr_body" HEAD="$GH_USER:$branch_name" BASE="$default_branch" python3 -c "
import json, os
print(json.dumps({
    'title': os.environ['PR_TITLE'],
    'body': os.environ['PR_BODY'],
    'head': os.environ['HEAD'],
    'base': os.environ['BASE']
}))
")

  local pr_result
  pr_result=$(gh_api_post "https://api.github.com/repos/$repo/pulls" \
    -d "$pr_payload" 2>&1)

  local pr_url
  pr_url=$(echo "$pr_result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('html_url','ERROR'))" 2>/dev/null)

  if [[ "$pr_url" == "ERROR" || -z "$pr_url" ]]; then
    log "ERROR: PR creation failed"
    log "$pr_result"
    return 1
  fi

  log "PR created: $pr_url"
  set_state "$state_key" "$pr_url"

  echo ""
  echo "=== SUCCESS ==="
  echo "PR: $pr_url"
  echo "Repo: $repo"
  echo "Section: $section"
}

# ─── Main ───────────────────────────────────────────────────────────────────

init_state

case "${1:-auto}" in
  list)
    list_targets
    ;;
  auto)
    idx=$(pick_random_target)
    submit_pr "$idx"
    ;;
  [0-9]*)
    submit_pr "$1"
    ;;
  *)
    echo "Usage: $0 [list | auto | <index>]"
    exit 1
    ;;
esac
