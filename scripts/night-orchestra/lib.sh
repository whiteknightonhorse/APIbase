#!/usr/bin/env bash
# night-orchestra shared library. Sourced by supervisor.sh + watchdog.sh.
ROOT=/home/apibase/apibase
ORCH="$ROOT/scripts/night-orchestra"
STATE="$ORCH/state"
LOGS="$ORCH/logs"
ROLES="$ORCH/roles"
QUEUE="$STATE/queue.txt"
KEYQ="$STATE/key-required-queue.md"
FAILED="$STATE/failed.txt"
HEARTBEAT="$STATE/heartbeat"
TRACKING="$STATE/tracking-issue"
CDB="$ORCH/connected_db.py"
# connected-providers DB wrappers (T2): tracking + completion-verification + key-queue dedup
verify_onboarded(){ python3 "$CDB" verify "$1"; }            # rc0 = real src/adapters/<n>/index.ts AND config row

# L-03: verify_onboarded() only checks the filesystem — it cannot tell an honest declared
# refusal (e.g. a ToS blocker: "ONBOARD_FAILED open-meteo — upstream ToS forbids commercial
# resale") from an agent that actually claimed success and produced nothing. Both look
# identical to verify_onboarded (no adapter/config row), and prior to this function both were
# reported to the operator as "FALSE-ONBOARD" — a real production alarm — even though the
# ToS-blocker case is the batch role (roles/onboard-batch.md) working exactly as instructed.
# classify_onboard_outcome NAME → prints one of:
#   OK               agent's own status line says ONBOARD_OK <name> ...
#   FAILED_DECLARED  agent's own status line says ONBOARD_FAILED <name> ... (honest refusal,
#                    NOT a false-onboard — never route this to the false-onboard alarm)
#   SUSPICIOUS       run_agent returned rc=0 but the log has neither status line (the
#                    genuinely alarming case: something exited cleanly without declaring
#                    anything either way)
# Reads the newest onboard-<name>-*.log ($LOGS, same glob supervisor.sh already used to find
# the auth/key-required log tail below) rather than threading run_agent's per-call path through
# step_with_heal's return value, so callers only need the candidate name.
classify_onboard_outcome(){
  local name="$1" log
  log=$(ls -t "$LOGS"/onboard-"$name"-*.log 2>/dev/null | head -1)
  if [ -z "$log" ]; then echo "SUSPICIOUS"; return 0; fi
  if grep -qiE "ONBOARD_FAILED[[:space:]]+$name\b" "$log"; then echo "FAILED_DECLARED"; return 0; fi
  if grep -qiE "ONBOARD_OK[[:space:]]+$name\b" "$log"; then echo "OK"; return 0; fi
  echo "SUSPICIOUS"
}
set_connected(){ python3 "$CDB" set "$1" "$2" >/dev/null 2>&1 || true; }  # status: connected|blocked|skip|key-pending
prune_key_queue(){ python3 "$CDB" prune >/dev/null 2>&1 || true; }        # drop connected/blocked/skip from key-required-queue.md
mkdir -p "$STATE" "$LOGS"
[ -f "$STATE/tg.env" ] && . "$STATE/tg.env"
: "${ORCH_DEADLINE_SECONDS:=32400}"   # 9h default
: "${ORCH_DRY:=0}"                    # 1 = no push/Smithery (local only)
# ПОТОЛОК ВМЕСТО ОКНА (решение оператора 2026-08-24). Прежнее «0 = без потолка, работай до
# дедлайна» означало: сколько успеет за девять часов, столько и подключит — расход токенов не
# ограничен ничем, кроме времени. Оператор попросил 5-10 подключений в сутки, после чего чистый
# выход и пауза до следующего дня.
#
# Число берётся ДЕТЕРМИНИРОВАННО от даты, а не случайно: одна и та же дата всегда даёт одно и то
# же число, поэтому при разборе прогон воспроизводим — но снаружи расписание не читается как
# ровная ферма. Тот же приём, что у джиттера слотов в соседних проектах.
: "${ORCH_MAX_ONBOARDS:=$(( 5 + 10#$(date -u +%j) % 6 ))}"   # 5..10 за прогон, от дня года

# I-02 (решение оператора 2026-08-24): ORCH_MAX_ONBOARDS считает только УСПЕХИ. Ночь, где
# кандидаты один за другим падают (FAILS растёт, ONBOARDS — нет), этот потолок не видит и не
# трогает — цикл идёт до 9-часового дедлайна, прогоняя каждый кандидат через step_with_heal
# (onboard + до 2 циклов self-heal fix = до 5 вызовов агента на один провальный кандидат).
# Заявленная цель («5-10 подключений в сутки, дальше чистый выход») — это бюджет РАСХОДА, а не
# счётчик успехов. ORCH_MAX_ATTEMPTS ограничивает ОБРАБОТАННЫХ кандидатов (успех + провал) —
# множитель ×3 даёт запас на ночь, где часть кандидатов проходит с первого раза и часть падает,
# но всё равно останавливает расход, если всё подряд ломается. Детерминировано от той же даты,
# что и ORCH_MAX_ONBOARDS (наследует день года через него) — воспроизводимо при разборе.
: "${ORCH_MAX_ATTEMPTS:=$(( ORCH_MAX_ONBOARDS * 3 ))}"
: "${QUEUE_THRESHOLD:=6}"
CLAUDE_BIN="${CLAUDE_BIN:-/usr/bin/claude}"

ts(){ date -u +%FT%TZ; }
daily_log(){ echo "$LOGS/orchestra-$(date -u +%F).log"; }
log(){ echo "[$(ts)] $*" | tee -a "$(daily_log)"; }

# K-02: an "AGENT start: LABEL" line with no matching completion line is a silent loss — it
# happens when the WHOLE run_agent process tree (this bash function, the `timeout` wrapper, and
# the claude child) gets killed externally (harness timeout, OOM, manual kill, session teardown)
# before the trailing `log "AGENT $label done/RATE-LIMITED/TIMEOUT/AUTH-FAIL..."` line executes —
# nothing after that point in the function ever runs, so no bash-side fix inside run_agent itself
# can guarantee its OWN completion line (a SIGKILL is not catchable). What CAN be guaranteed is
# that the loss is never permanent: this walks the daily log, pairs each "AGENT start: LABEL"
# with the next "AGENT LABEL <outcome>" line for that SAME label (FIFO — labels repeat across
# retries, e.g. onboard-remotive ran 3 times in one night), and for a start left unpaired it
# checks two things before declaring it dead — (a) at least 60s old, so a start line from an
# agent that is still legitimately mid-run within its declared timeout is never flagged, and
# (b) no live process on the host still mentions the label on its command line (best-effort
# `pgrep -af`, not a tracked PID — this must ALSO catch orphans that were logged before this
# function existed, e.g. K-02's own reproduction case, which have no PID to check). If both hold,
# it appends a synthetic "AGENT LABEL FAIL rc=LOST" line so `grep -c 'AGENT start:'` always equals
# the completion-line count. Cost of a false positive: one extra diagnostic line (the real agent,
# if it is in fact still alive, still writes its own completion line later — this function never
# touches the process). Cost of staying silent: a swallowed failure indistinguishable from "still
# running", which is the exact defect this closes. Bias to alert, per CLAUDE.md AP-3 fail-fast.
reconcile_log_orphans(){
  local logfile="$1"
  [ -f "$logfile" ] || return 0
  python3 - "$logfile" <<'PYEOF'
import sys, os, re, collections, subprocess, datetime

logfile = sys.argv[1]
with open(logfile) as f:
    lines = f.readlines()

start_re = re.compile(r'^\[([^\]]+)\] AGENT start: (\S+) \(timeout (\d+)s')
outcome_re = re.compile(r'^\[([^\]]+)\] AGENT (\S+) (done|RATE-LIMITED|TIMEOUT|AUTH-FAIL|EMPTY-OUTPUT|FAIL)\b')

pending = collections.OrderedDict()  # label -> deque of (started_iso, timeout_s)
for line in lines:
    m = start_re.match(line)
    if m:
        pending.setdefault(m.group(2), collections.deque()).append((m.group(1), int(m.group(3))))
        continue
    m = outcome_re.match(line)
    if m and pending.get(m.group(2)):
        pending[m.group(2)].popleft()

# pgrep -af matches full cmdlines, including our OWN ancestor shells if the label text happens
# to appear on their command line (e.g. an interactive debug session that greps the same label
# right next to the reconcile call) -- exclude our own ancestor PIDs so that can never look like
# "still alive". A genuinely running sibling agent process is never our ancestor.
def ancestor_pids():
    pids, pid = set(), os.getpid()
    for _ in range(50):
        pids.add(pid)
        try:
            with open(f'/proc/{pid}/stat') as f:
                stat = f.read()
            ppid = int(stat[stat.rfind(')') + 2:].split()[1])
        except Exception:
            break
        if ppid in pids or ppid <= 1:
            pids.add(ppid)
            break
        pid = ppid
    return pids

ancestors = ancestor_pids()
now = datetime.datetime.now(datetime.timezone.utc)
new_lines = []
for label, q in pending.items():
    for started_iso, tmo in q:
        try:
            started = datetime.datetime.strptime(started_iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
        except ValueError:
            continue
        age = (now - started).total_seconds()
        if age < 60:
            continue  # too young to judge -- could still be legitimately running
        try:
            out = subprocess.run(['pgrep', '-af', label], capture_output=True, text=True, timeout=5).stdout
            matches = [l for l in out.splitlines() if l.strip()]
            found = any(int(l.split(None, 1)[0]) not in ancestors for l in matches)
        except Exception:
            found = True  # can't verify -> don't falsely declare dead
        if found:
            continue
        stamp = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        new_lines.append(
            f"[{stamp}] AGENT {label} FAIL rc=LOST (start logged at {started_iso}, declared timeout "
            f"{tmo}s, age {int(age)}s, no completion line ever written and no matching process found "
            f"on the host -- process died silently; reconciled by K-02 orphan check)\n"
        )

if new_lines:
    with open(logfile, 'a') as f:
        f.writelines(new_lines)
PYEOF
}

# run a headless claude agent. $1=label $2=prompt $3=timeout_sec.
# returns: 0 ok | 99 rate-limited | 1 error/other. Output saved to a per-step log; tail echoed.
run_agent(){
  local label="$1" prompt="$2" tmo="${3:-1800}"
  reconcile_log_orphans "$(daily_log)"  # surface any prior orphaned "AGENT start" before adding a new one
  # Per-role model (token cost): cheap/high-frequency roles -> Haiku; code/debug -> Sonnet.
  local model="sonnet"
  case "$label" in
    # Haiku — там, где нужен ОБЪЁМ и скорость: поиск кандидатов, запись US-cases, тесты,
    # инструкции по ключам, уборка диска. Всё это перебор и оформление, не суждение.
    finder*|record-*|test-*|key-instructions*|disk-cleanup*) model="haiku";;
    # ⚠️ pricing-audit НАМЕРЕННО остаётся на Sonnet. Постановление Fable 2026-08-24: это самый
    # чувствительный к деньгам шаг — он назначает наценку и решает, сколько будет стоить вызов.
    # Экономия на модели, которая считает цену, — это не экономия, а перенос риска на выручку.
    pricing-*) model="sonnet";;
  esac
  # A-04 / I-01 SANDBOX: finder/record/pricing/test read untrusted web pages or third-party
  # output (a prompt-injection vector). onboard ALSO reads untrusted web content — it is the
  # role that fetches/curls the candidate provider's live docs site (onboard-batch.md) — so it
  # gets the SAME permission-checked profile (no .env, no git push, no gh writes — see
  # roles/sandbox-settings.json) instead of --dangerously-skip-permissions. Before this fix
  # onboard fell into the trusted `*)` branch below: a page-injected "cat .env" would have run
  # with full read access to every payment key (TEMPO_PRIVATE_KEY, X402_OPERATOR_PRIVATE_KEY,
  # MPP_SECRET_KEY) and `git push`, with model refusal as the only defense. "fix-<label>"
  # retries of these roles inherit the same sandbox (the log tail they diagnose can itself
  # carry injected content). push/security-sweep/etc. build prompts from local templates only,
  # never touch fetched web content, and keep full local access.
  local core="${label#fix-}" flags
  case "$core" in
    finder*|record-*|pricing-*|test-*|onboard-*)
      flags="--print --model $model --no-session-persistence --settings $ROLES/sandbox-settings.json";;
    *)
      flags="--print --dangerously-skip-permissions --model $model --no-session-persistence";;
  esac
  local out="$LOGS/${label}-$(date -u +%H%M%S).log"
  log "AGENT start: $label (timeout ${tmo}s, model $model)" >&2
  cd "$ROOT" || return 1
  # pricing and onboard (DB seed step) need DB write access but must not read .env themselves:
  # the trusted orchestrator (this script, never exposed to fetched web content) extracts ONLY
  # DATABASE_URL via dotenv (not a blind `source .env` — some values contain literal `$` and
  # corrupt under shell sourcing) and hands it to the sandboxed subprocess as a plain env var,
  # same as any other inherited env var. onboard-batch.md tells the agent to run
  # `npx tsx scripts/seed.ts` directly (DATABASE_URL already in its environment) instead of the
  # general skill's `grep POSTGRES_PASSWORD .env` construction, which the sandbox hook blocks.
  local db_url=""
  case "$core" in
    pricing-*|onboard-*) db_url=$(node -e "require('dotenv').config({path:'$ROOT/.env'});process.stdout.write(process.env.DATABASE_URL||'')" 2>/dev/null);;
  esac
  if [ -n "$db_url" ]; then
    timeout "$tmo" env "DATABASE_URL=$db_url" $CLAUDE_BIN $flags "$prompt" >"$out" 2>&1
  else
    timeout "$tmo" $CLAUDE_BIN $flags "$prompt" >"$out" 2>&1
  fi
  local rc=$?
  if grep -qiE "Failed to authenticate|Invalid authentication credentials|401 Invalid authentication|Not logged in|Please run /login" "$out"; then
    log "AGENT $label AUTH-FAIL 401 (claude token dead)" >&2; echo "$out"; return 98
  fi
  if grep -qiE "rate limit|usage limit|exceeded your .*limit|5-hour limit|please try again later|overloaded_error|too many requests|529|overloaded|server-side issue|service unavailable|internal server error|api error: 5[0-9][0-9]" "$out"; then
    log "AGENT $label RATE-LIMITED (rc=$rc)" >&2; echo "$out"; return 99
  fi
  if [ "$rc" -eq 124 ]; then log "AGENT $label TIMEOUT" >&2; echo "$out"; return 1; fi
  # K-02: rc=0 with a 0-byte agent log is not a real success -- a genuinely successful claude
  # call always writes SOME output (at minimum its final text). 0 bytes at rc=0 means the process
  # was reaped/replaced/killed in a way that still returned exit code 0 (e.g. `timeout` racing a
  # parent teardown) -- silently returning 0 here would have step_with_heal read it as a
  # completed, verified step. Fail loud instead of swallowing it.
  if [ "$rc" -eq 0 ] && [ ! -s "$out" ]; then
    log "AGENT $label FAIL rc=0-EMPTY (0-byte agent log with rc=0 -- suspicious silent 'success', treated as failure, not swallowed)" >&2
    echo "$out"; return 1
  fi
  log "AGENT $label done rc=$rc (log: $out)" >&2
  echo "$out"; return $rc
}

# escalating backoff while rate-limited. $1 = attempt index.
backoff(){
  local n="${1:-0}" secs
  case "$n" in 0) secs=300;; 1) secs=900;; 2) secs=1800;; *) secs=3600;; esac
  log "BACKOFF ${secs}s (rate-limit, attempt $n)"; sleep "$secs"
}

disk_guard(){
  local use; use=$(df -P "$ROOT" | awk 'NR==2{gsub("%","",$5);print $5}')
  if [ "${use:-0}" -ge 95 ]; then
    log "DISK HARD-STOP ${use}%"
    tg_msg "🔴 apibase night-orchestra: DISK HARD-STOP ${use}% — pausing before it takes down PG/the stack (invariant 12.187). Free space manually; next scheduled run starts fresh, no reset needed."
    touch "$STATE/pause"
    return 1
  fi
  if [ "${use:-0}" -ge 88 ]; then
    log "DISK ${use}% >=88 — running disk-cleanup agent"
    run_agent "disk-cleanup" "Use the disk-cleanup skill to free space on this server. Disk is ${use}% full. Be safe — never delete data/DB/backups; clean caches, old logs, docker dangling images. Report freed space." 900 >/dev/null || true
  fi
  return 0
}

# PUBLIC-REPO GUARD (A-10): GitHub repo is public. Default-DENY, not default-allow — a report
# is a short templated status line (provider name + status + counters); anything shaped like a
# raw agent-log dump (many lines / long) is refused even if no known secret pattern matches it,
# because the blocklist below can never be a complete list of every key format we'll ever add.
sanitize_public(){ # $1 = text → 0 = safe to post, 1 = MUST stay local
  local text="$1"
  # Layer 1: known secret / credential / commercial-info shapes.
  printf '%s' "$text" | grep -qiE 'sk-[a-z0-9]{8}|ghp_|gho_|github_pat|xox[baprs]-|AKIA[0-9A-Z]{6}|-----BEGIN|api[_-]?key[\"'"'"' :=]|bearer [a-z0-9]|password|client[_-]?secret|ak_live_|0x[0-9a-fA-F]{40,}|\b[0-9a-f]{40,}\b|[A-Za-z0-9+/]{40,}={0,2}|\b[A-Z][A-Z0-9_]*_(PRIVATE|SECRET)_KEY\b|\$[0-9]|\b(margin|markup|revenue|profit|pricing|cost basis|monetiz)\b|[0-9]+ ?% ?(margin|markup|profit)' && return 1
  # Layer 2: shape check. A legit report()/gh_upsert() body is title+text, at most 2 lines,
  # well under the length of a pasted log tail (run_agent tails 40 log lines on failure —
  # that text must never reach here, and if it ever does this line stops it regardless of
  # whether it happens to contain a recognizable secret pattern).
  local lines; lines=$(printf '%s' "$text" | grep -c '')
  [ "$lines" -gt 2 ] && return 1
  [ "${#text}" -gt 600 ] && return 1
  return 0
}

gh_issue(){ cd "$ROOT"; gh issue create --title "$1" --body "$2" 2>/dev/null | grep -oE '[0-9]+$' ; }
gh_comment(){ cd "$ROOT"; [ -n "$1" ] && gh issue comment "$1" --body "$2" >/dev/null 2>&1 || true; }
report(){ # title, body  → comment on tracking issue (create if none). PUBLIC repo → sanitized.
  if ! sanitize_public "$1
$2"; then log "report BLOCKED — secret/commercial pattern; kept local (not posted to public GitHub)"; return 0; fi
  local num; num=$(cat "$TRACKING" 2>/dev/null)
  if [ -z "$num" ]; then num=$(gh_issue "$1" "$2"); [ -n "$num" ] && echo "$num" >"$TRACKING"; else gh_comment "$num" "**$1**\n$2"; fi
}

tg_doc(){ # file caption — send a TXT/doc to operator Telegram (dailyvideo157_bot). Best-effort.
  local file="$1" cap="$2"
  [ -n "${TG_BOT_TOKEN:-}" ] && [ -n "${TG_CHAT_ID:-}" ] && [ -f "$file" ] || { log "tg_doc skipped (no creds/file)"; return 1; }
  if curl -sS --max-time 90 -F "chat_id=$TG_CHAT_ID" -F "document=@$file" -F "caption=$cap" \
       "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendDocument" 2>/dev/null | grep -q '"ok":true'; then
    log "tg_doc sent: $(basename "$file")"; return 0
  fi
  log "tg_doc FAILED: $(basename "$file")"; return 1
}
tg_msg(){ # text — plain message, best-effort
  [ -n "${TG_BOT_TOKEN:-}" ] && [ -n "${TG_CHAT_ID:-}" ] || return 1
  curl -sS --max-time 30 -F "chat_id=$TG_CHAT_ID" -F "text=$1" \
    "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" >/dev/null 2>&1
}

send_key_instructions(){ # generate RU instructions from key-required-queue + send as a TXT to Telegram. Best-effort.
  prune_key_queue  # T2: drop already-connected/blocked/skip providers BEFORE asking operator again
  [ -s "$KEYQ" ] || { log "key-instructions: queue empty, nothing to send"; return 0; }
  run_agent "key-instructions" "$(cat "$ROLES/key-instructions.md")" 900 >/dev/null 2>&1 || log "key-instructions agent failed (non-fatal)"
  local file="$STATE/key-instructions-ru.txt"
  if [ -f "$file" ]; then
    tg_doc "$file" "🔑 Инструкции по API-ключам ($(date -u +%F)) — зарегистрируйся по ссылкам и пришли ключи обратно, я до-подключу сам"
  else
    log "key-instructions: file not produced"
  fi
}

# ============ GitHub coordination (public-safe, all best-effort) ============
gh_ensure_labels(){
  cd "$ROOT" 2>/dev/null || return 0
  local l existing; existing=$(gh label list --limit 200 2>/dev/null | awk "{print tolower(\$1)}")
  for l in night-summary needs-key blocked-structural retry operator-command done; do
    printf "%s\n" "$existing" | grep -qx "$l" || gh label create "$l" >/dev/null 2>&1 || true
  done
}
gh_open_by_title(){ # exact title -> issue number (or empty). Live list (no search-index lag).
  cd "$ROOT" 2>/dev/null || return 0
  gh issue list --state open --limit 200 --json number,title 2>/dev/null \
    | jq -r --arg t "$1" '.[] | select(.title==$t) | .number' 2>/dev/null | head -1
}
gh_upsert(){ # title body [label] -> number. Sanitized + idempotent (comment if title already open).
  sanitize_public "$1
$2" || { log "gh_upsert BLOCKED (sensitive): $1"; return 0; }
  cd "$ROOT" 2>/dev/null || return 0
  local num; num=$(gh_open_by_title "$1")
  if [ -n "$num" ]; then gh issue comment "$num" --body "$2" >/dev/null 2>&1
  else
    num=$(gh issue create --title "$1" --body "$2" ${3:+--label "$3"} 2>/dev/null | grep -oE '[0-9]+$')
    [ -z "$num" ] && num=$(gh issue create --title "$1" --body "$2" 2>/dev/null | grep -oE '[0-9]+$')
  fi
  echo "$num"
}
control_issue(){ # ensure the Orchestra Control issue exists; echo its number (cached). CREATE-ONLY.
  local n; n=$(cat "$STATE/control-issue" 2>/dev/null)
  cd "$ROOT" 2>/dev/null || { echo "$n"; return 0; }
  if [ -n "$n" ] && gh issue view "$n" >/dev/null 2>&1; then echo "$n"; return 0; fi
  n=$(gh_open_by_title "Orchestra Control")
  if [ -z "$n" ]; then
    n=$(gh issue create --title "Orchestra Control" --body "Remote control for the night-orchestra (its comments are read at each night start). Comment ONE command per line:
  skip <provider>       — never attempt this provider again
  retry <provider>      — clear its skip/failed so it is eligible again
  priority: <a>, <b>    — finder focuses these categories tonight
  pause-tonight         — orchestra exits early tonight
Use real provider NAMES in your comments. Keep credentials and commercial data off this public repo." 2>/dev/null | grep -oE '[0-9]+$')
  fi
  [ -n "$n" ] && echo "$n" > "$STATE/control-issue"
  echo "$n"
}
read_control(){ # parse operator command-comments -> apply to local state. Best-effort.
  local cn body; cn=$(control_issue); [ -n "$cn" ] || return 0
  cd "$ROOT" 2>/dev/null || return 0
  body=$(gh issue view "$cn" --json comments --jq '.comments[].body' 2>/dev/null)
  [ -n "$body" ] || return 0
  printf '%s\n' "$body" | grep -oiE 'skip +[a-z0-9._-]+' | awk '{print tolower($2)}' | sort -u | while read -r n; do
    [ -n "$n" ] && { grep -qxF "$n" "$STATE/skip.txt" 2>/dev/null || { echo "$n" >> "$STATE/skip.txt"; log "CONTROL skip: $n"; }; }
  done
  printf '%s\n' "$body" | grep -oiE 'retry +[a-z0-9._-]+' | awk '{print tolower($2)}' | sort -u | while read -r n; do
    [ -n "$n" ] && { sed -i "/^$n\$/d" "$STATE/skip.txt" 2>/dev/null; sed -i "/[^a-z0-9]$n[^a-z0-9]/d" "$FAILED" 2>/dev/null; log "CONTROL retry: $n (cleared skip/failed)"; }
  done
  local pr; pr=$(printf '%s\n' "$body" | grep -oiE 'priority: ?[a-z0-9, _-]+' | tail -1 | sed -E 's/priority: *//I')
  [ -n "$pr" ] && { printf '%s' "$pr" > "$STATE/priority.txt"; log "CONTROL priority: $pr"; }
  printf '%s\n' "$body" | grep -qiE 'pause-tonight' && { touch "$STATE/pause"; log "CONTROL pause requested"; }
}

# dedup: 0 = NEW (onboard ok), 1 = already exists
dedup_check(){
  local name="$1"; local lc; lc=$(echo "$name" | tr 'A-Z' 'a-z')
  [ -d "$ROOT/src/adapters/$lc" ] && return 1
  grep -qiE "^- *tool_id:.*$lc\\.|provider: *$lc\$" "$ROOT/config/tool_provider_config.yaml" 2>/dev/null && return 1
  return 0
}

# D-04: queue.txt stale-entry pre-check — is $1 already status=connected in connected.json?
# Distinct from dedup_check() (adapter-dir + yaml only): catches a queue slug for a provider
# the finder re-discovered under a name that still resolves to an already-connected entry in
# the ledger, even before/without a matching yaml row. 0 = stale (already connected), 1 = not.
# Cheap python read of the ledger file, no agent spawned.
queue_entry_stale(){
  local lc; lc=$(echo "$1" | tr 'A-Z' 'a-z')
  python3 "$CDB" is-connected "$lc" >/dev/null 2>&1
}

queue_size(){ [ -f "$QUEUE" ] || { echo 0; return; }; local n; n=$(grep -cvE '^\s*$' "$QUEUE" 2>/dev/null); echo "${n:-0}"; }
queue_pop(){ local line; line=$(grep -vE '^\s*$' "$QUEUE" 2>/dev/null | head -1) || return 1
  [ -z "$line" ] && return 1
  grep -vxF "$line" "$QUEUE" > "$QUEUE.tmp" 2>/dev/null; mv "$QUEUE.tmp" "$QUEUE"; echo "$line"; }
mark_failed(){ echo "[$(ts)] $1 — $2" >> "$FAILED"; }
