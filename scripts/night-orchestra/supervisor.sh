#!/usr/bin/env bash
[ -f $HOME/.claude/oauth.env ] && . $HOME/.claude/oauth.env
# night-orchestra supervisor — autonomous 9h self-healing API-onboarding loop. $0 (Claude Max).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"
exec 9>"$STATE/orchestra.lock"
flock -n 9 || { echo "[lock] another supervisor running — exit"; exit 0; }

DEADLINE=$(( $(date +%s) + ORCH_DEADLINE_SECONDS ))
echo "{\"pid\":$$,\"deadline\":$DEADLINE,\"started\":\"$(ts)\",\"dry\":$ORCH_DRY}" > "$STATE/run-state.json"
echo "$$" > "$STATE/supervisor.pid"
trap 'rm -f "$STATE/supervisor.pid"' EXIT
log "ORCHESTRA START pid=$$ deadline=$(date -u -d @$DEADLINE +%FT%TZ) dry=$ORCH_DRY max_onboards=$ORCH_MAX_ONBOARDS max_attempts=$ORCH_MAX_ATTEMPTS"
# AUTH PRE-FLIGHT (2026-06-23): a dead claude token wasted an entire night on 401 idle-loops.
# Verify auth BEFORE the loop; if dead -> Telegram alert + skip the run (don't burn the window).
__pf=$(timeout 45 $CLAUDE_BIN --print --model haiku "reply with exactly: AUTHOK" 2>&1)
if ! printf '%s' "$__pf" | grep -q "AUTHOK"; then
  if printf '%s' "$__pf" | grep -qiE "authenticate|401|invalid authentication|not logged in|please run /login"; then
    log "AUTH PRE-FLIGHT 401 — claude token dead; alerting + skipping run"
    tg_msg "🔴 apibase night-orchestra: claude token is DEAD (401) at startup. Tonight's run is SKIPPED to avoid wasting the window. FIX (durable): run \`claude /login\` on the apibase user so it has its OWN independent token (copies from other projects die when those rotate their refresh token)."
    rm -f "$STATE/run-state.json" 2>/dev/null
    exit 1
  fi
fi

: > "$TRACKING"
gh_ensure_labels
NIGHT_ISSUE=$(gh_upsert "🌙 Night $(date -u +%F)" "Autonomous onboarding run — live log below (public-safe: names + status only)." "night-summary")
[ -n "$NIGHT_ISSUE" ] && echo "$NIGHT_ISSUE" > "$TRACKING"
read_control
report "🌙 Night orchestra started $(date -u +%F)" "Window: $((ORCH_DEADLINE_SECONDS/3600))h. Mode: $([ "$ORCH_DRY" = 1 ] && echo DRY-local || echo LIVE-batch-push). Target: connect free no-auth APIs nonstop, self-healing."

read_field(){ echo "$1" | cut -d'|' -f"$2"; }

# step_with_heal LABEL PROMPT TIMEOUT STEPNAME → 0 ok | 1 unrecoverable
step_with_heal(){
  local label="$1" prompt="$2" tmo="$3" stepname="$4"
  local fixes=0 waits=0 out rc
  while :; do
    out=$(run_agent "$label" "$prompt" "$tmo"); rc=$?
    if [ "$rc" -eq 99 ]; then
      [ "$waits" -ge 6 ] && { log "$label: rate-limit persists, giving up step"; return 1; }
      backoff "$waits"; waits=$((waits+1)); continue
    fi
    if [ "$rc" -eq 0 ]; then
      # C-03: push-batch.md ends with PUSH_OK/PUSH_BLOCKED, but that string only lived in the
      # per-step file ($out) — daily_log (orchestra-<date>.log) only got "done rc=0". Surface it
      # so the branch-protection push outcome is auditable from the one dated log file.
      local outcome; outcome=$(grep -E 'PUSH_(OK|BLOCKED)' "$out" 2>/dev/null | tail -1 | tr -d '*')
      [ -n "$outcome" ] && log "$label: $outcome"
      return 0
    fi
    if [ "$fixes" -ge 2 ]; then log "$label: unrecoverable after $fixes fixes"; return 1; fi
    local tail; tail=$(tail -40 "$out" 2>/dev/null)
    local fp; fp=$(sed -e "s/__STEP__/$stepname/" "$ROLES/fix.md")
    fp="${fp/__LOGTAIL__/$tail}"
    local fout; fout=$(run_agent "fix-$label" "$fp" 1200); 
    grep -qi "FIX_UNRECOVERABLE" "$fout" 2>/dev/null && { log "$label: fix says unrecoverable"; return 1; }
    fixes=$((fixes+1)); log "$label: applied fix #$fixes, retrying"
  done
}

ONBOARDS=0; FAILS=0; last_push=$(date +%s)
DRY_ROUNDS=0; MAX_DRY_ROUNDS=${ORCH_MAX_DRY_ROUNDS:-3}
# T8: security-sweep ONCE at night start — own CodeQL/npm-audit HIGH findings (mechanical fix or track).
step_with_heal "security-sweep" "$(cat "$ROLES/security-sweep.md")" 1500 "security-sweep" || log "security-sweep soft-fail (non-fatal)"
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  date -u +%FT%TZ > "$HEARTBEAT"
  [ -f "$STATE/pause" ] && { log "PAUSE flag set → exiting loop"; rm -f "$STATE/pause"; break; }
  disk_guard || { rm -f "$STATE/pause"; break; }

  if [ "$(queue_size)" -lt "$QUEUE_THRESHOLD" ]; then
    log "queue low ($(queue_size)) → running finder"
    fprompt="$(cat "$ROLES/finder.md")"
    [ -s "$STATE/priority.txt" ] && fprompt="$fprompt

OPERATOR PRIORITY CATEGORIES TONIGHT: $(cat "$STATE/priority.txt") — prefer discovering APIs in these."
    step_with_heal "finder" "$fprompt" 2400 "api-discovery" || log "finder step failed (non-fatal)"
  fi

  # FINDER FALLBACK (rec #5): if discovery produced nothing (e.g. transient 529),
  # seed from a curated free no-auth list so onboarding never stalls on a finder blip.
  if [ "$(queue_size)" -eq 0 ] && [ -f "$STATE/seed-candidates.txt" ]; then
    log "queue empty after finder → seeding from seed-candidates.txt"
    while IFS= read -r sl; do
      [ -z "$sl" ] && continue
      sn=$(read_field "$sl" 1)
      if dedup_check "$sn" && ! grep -qF "$sn" "$QUEUE" 2>/dev/null; then echo "$sl" >> "$QUEUE"; fi
    done < "$STATE/seed-candidates.txt"
  fi

  LINE=$(queue_pop) || {
    DRY_ROUNDS=$((DRY_ROUNDS+1))
    if [ "$DRY_ROUNDS" -ge "$MAX_DRY_ROUNDS" ]; then
      log "nothing new after $DRY_ROUNDS dry finder rounds (discovery wall) -> finishing early instead of idling to deadline"
      report "Discovery wall" "No new free no-auth APIs after $DRY_ROUNDS finder rounds. Finishing early; growth now comes from key-required APIs (see Telegram). Onboarded this run: $ONBOARDS."
      break
    fi
    log "queue empty after finder (dry round $DRY_ROUNDS/$MAX_DRY_ROUNDS); sleep"
    sleep 120; continue
  }
  NAME=$(read_field "$LINE" 1)
  [ -z "$NAME" ] && continue
  if grep -qxF "$(printf '%s' "$NAME" | tr 'A-Z' 'a-z')" "$STATE/skip.txt" 2>/dev/null; then log "SKIP $NAME (operator skip-list)"; continue; fi
  if queue_entry_stale "$NAME"; then log "SKIP stale $NAME (already connected in connected.json — stale queue.txt entry)"; continue; fi
  if ! dedup_check "$NAME"; then log "DEDUP skip $NAME (already exists)"; continue; fi

  log "ONBOARD candidate: $NAME"
  P=$(sed -e "s/__NAME__/$NAME/g" "$ROLES/onboard-batch.md"); P="${P/__LINE__/$LINE}"
  if step_with_heal "onboard-$NAME" "$P" 3000 "onboard-$NAME"; then
    # T2 VERIFICATION GATE: agent may claim ONBOARD_OK but produce no adapter/config (destatis bug).
    if ! verify_onboarded "$NAME"; then
      FAILS=$((FAILS+1))
      mark_failed "$NAME" "verification gate: ONBOARD_OK but no src/adapters/$NAME/index.ts + config row (false-onboard)"
      set_connected "$NAME" blocked
      report "⚠️ False-onboard $NAME" "Agent claimed OK but produced no adapter+config row — blocked, NOT counted. Fails: $FAILS."
      gh_upsert "🚫 False-onboard: $NAME" "Agent reported ONBOARD_OK but verification (adapter index.ts + tool_provider_config row) failed. Needs manual look or retry." "blocked-structural" >/dev/null 2>&1
      continue
    fi
    set_connected "$NAME" connected
    step_with_heal "pricing-$NAME" "$(sed "s/__NAME__/$NAME/g" "$ROLES/pricing-audit.md")" 900 "pricing-$NAME" || log "pricing audit soft-fail $NAME"
    step_with_heal "test-$NAME" "Run the test-quick skill (phases 0 and 18) and the provider smoke test for $NAME. These cost \$0 (zero-balance key → 402). Confirm P0 discovery and P18 payment-bypass PASS and the new $NAME tools execute without errors. End with TEST_OK $NAME or TEST_FAIL $NAME <reason>." 1500 "test-$NAME" || log "test soft-fail $NAME"
    step_with_heal "record-$NAME" "$(sed "s/__NAME__/$NAME/g" "$ROLES/recorder.md")" 600 "record-$NAME" || log "record soft-fail $NAME"
    ONBOARDS=$((ONBOARDS+1)); log "✅ ONBOARDED $NAME (total $ONBOARDS)"; DRY_ROUNDS=0
    report "✅ Onboarded $NAME" "Local commit done (batch-push pending). Total tonight: $ONBOARDS."
  else
    FAILS=$((FAILS+1))
    # CLASSIFY (rec #3): needs-key/auth → route to key-required-queue (operator gets it in the
    # nightly Telegram instructions file); else structural → failed.txt as before.
    llog=$(ls -t "$LOGS"/onboard-"$NAME"-*.log 2>/dev/null | head -1)
    if [ -n "$llog" ] && grep -qiE "api[ _-]?key|requires? (a )?key|register|sign[ -]?up|\b401\b|\b403\b|unauthor|subscription-key|access token|oauth" "$llog"; then
      mark_failed "$NAME" "onboard needs key/auth → key-required"
      KU=$(echo "$NAME" | tr 'a-z-' 'A-Z_')
      grep -qi "^## $NAME\b" "$KEYQ" 2>/dev/null || printf '\n## %s (auto-detected: onboard blocked on auth)\n- **Provider:** %s\n- **Candidate line:** %s\n- **Why:** onboard agent stopped needing a key / registration.\n- **Operator:** register, then supply PROVIDER_KEY_%s — I will finish onboarding next run.\n' "$NAME" "$NAME" "$LINE" "$KU" >> "$KEYQ"
      report "🔑 Needs key: $NAME" "Onboard blocked on auth → added to key-required-queue; operator will receive it in the Telegram instructions file. Fails: $FAILS."
      gh_upsert "🔑 Needs key: $NAME" "Onboard blocked on auth. Register + supply the key (full step-by-step sent via Telegram). Auto-onboards once the key is in .env." "needs-key" >/dev/null 2>&1
    else
      mark_failed "$NAME" "onboard unrecoverable (structural)"
      report "⚠️ Failed $NAME" "Structural — self-heal exhausted. Skipped, continuing nonstop. Fails: $FAILS."
      gh_upsert "🚫 Blocked: $NAME" "Onboard unrecoverable (structural) — self-heal exhausted. Comment 'retry $NAME' on the Orchestra Control issue to re-attempt." "blocked-structural" >/dev/null 2>&1
    fi
  fi

  if [ "$ORCH_MAX_ONBOARDS" -gt 0 ] && [ "$ONBOARDS" -ge "$ORCH_MAX_ONBOARDS" ]; then log "MAX_ONBOARDS reached → stop"; break; fi
  # I-02: ceiling on ATTEMPTS (onboards+fails), not just successes — a night where every
  # candidate fails must still stop burning tokens instead of running to DEADLINE.
  if [ "$ORCH_MAX_ATTEMPTS" -gt 0 ] && [ "$((ONBOARDS+FAILS))" -ge "$ORCH_MAX_ATTEMPTS" ]; then
    log "MAX_ATTEMPTS reached (attempt-cap onboards=$ONBOARDS fails=$FAILS >= $ORCH_MAX_ATTEMPTS) → stop"
    break
  fi

  if [ "$ORCH_DRY" != "1" ] && [ $(( $(date +%s) - last_push )) -ge 3600 ]; then
    log "hourly batch push"
    step_with_heal "push" "$(cat "$ROLES/push-batch.md")" 2400 "batch-push" || report "⚠️ Push blocked" "Hourly batch push failed self-heal; commits remain local. Will retry next hour."
    last_push=$(date +%s)
  fi
done

# deadline reached / max hit → final push + summary
if [ "$ORCH_DRY" != "1" ]; then
  log "final batch push"; step_with_heal "push-final" "$(cat "$ROLES/push-batch.md")" 2400 "final-push" || report "⚠️ Final push blocked" "Commits remain local for morning review."
fi
send_key_instructions
report "🌅 Night orchestra finished $(date -u +%F)" "Onboarded: $ONBOARDS | Failed: $FAILS | Key-required queued: see key-required-queue.md | Mode: $([ "$ORCH_DRY" = 1 ] && echo DRY || echo LIVE)."
rm -f "$STATE/supervisor.pid"
log "ORCHESTRA END onboarded=$ONBOARDS fails=$FAILS"
