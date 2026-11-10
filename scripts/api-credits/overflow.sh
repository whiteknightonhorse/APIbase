#!/usr/bin/env bash
# API-CREDITS-1108/2: Fable acceptance overflow + universal key-unset assertion. Sourced by ~/taskloop/taskloop.sh
# (plug-in site: taskloop.sh:claude_print for the assertion, the Fable acceptance review call for the overflow).
# Functions only; nothing runs at source time. The credential is never read here: only api-call sets it.

API_OVERFLOW_LIMIT_RE='hit your session limit|weekly limit'

# T-KEY-1: api_key_assert_unset / api_key_guard live in ONE place, the shared helper (no local definition here).
. "${API_KEY_GUARD:-$HOME/taskloop/lib/api-key-guard.sh}"

# api_overflow_limit_text <answer-file> -> rc 0 iff the answer is real limit text.
# Same shape gate as the card-0590 review_outage: no verdict and <= 5 non-empty lines, so a full review that merely
# mentions "weekly limit" is never taken for a limit hit.
api_overflow_limit_text(){
  [ -f "$1" ] || return 1
  if declare -F review_verdict >/dev/null; then [ "$(review_verdict "$1")" = NONE ] || return 1; fi
  [ "$(grep -cv '^[[:space:]]*$' "$1" 2>/dev/null)" -le 5 ] || return 1
  grep -qiE "$API_OVERFLOW_LIMIT_RE" "$1" 2>/dev/null
}

# api_overflow_run <answer-file> <prompt-file> <model-id> <state-dir> <card-id> <today> <label>
# Re-runs the identical prompt once per card through `api-call --lane overflow --max-turns 1`.
# rc 0: answer-file replaced by the API answer, state/passes-<today>.<label>.api (label = the count_model_call label, e.g. fable) incremented.
# rc 1: not applicable, already tried for this card, exit 75 or any failure; answer-file untouched
#       (the caller then does exactly what it did before: card-0590 marker + park).
api_overflow_run(){
  local out="$1" pfile="$2" model="$3" state="$4" tid="$5" today="$6" label="${7:-fable}"
  local bin="${API_CALL_BIN:-$(dirname "${BASH_SOURCE[0]}")/api-call}" once="$state/$tid.overflow-used" tmp f
  api_overflow_limit_text "$out" || return 1
  [ -e "$once" ] && return 1
  : > "$once"
  tmp=$(mktemp) || return 1
  if "$bin" --lane overflow --model "$model" --max-turns 1 < "$pfile" > "$tmp" 2>/dev/null && [ -s "$tmp" ]; then
    cp "$tmp" "$out"; rm -f "$tmp"
    f="$state/passes-$today.$label.api"
    echo "$(( $(cat "$f" 2>/dev/null || echo 0) + 1 ))" > "$f"
    return 0
  fi
  rm -f "$tmp"; return 1
}
