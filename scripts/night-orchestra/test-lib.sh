#!/usr/bin/env bash
# A-09: unit tests for dedup_check() in lib.sh.
# A-10: unit tests for sanitize_public() fail-closed behavior in lib.sh.
# C-05: regression check that the sandboxed-role case branch in run_agent() never regains
#   --dangerously-skip-permissions.
# Run: bash scripts/night-orchestra/test-lib.sh
set -u
cd "$(dirname "$0")/../.." || exit 1
# shellcheck source=lib.sh
source scripts/night-orchestra/lib.sh

fail=0
assert_eq(){ # label expected actual
  if [ "$2" = "$3" ]; then
    echo "PASS: $1"
  else
    echo "FAIL: $1 (expected $2, got $3)"
    fail=1
  fi
}

# 1) Name present ONLY in candidates-registry.json (status: candidate, never onboarded, no
#    adapter dir, no YAML entry) — the registry check was removed as unreliable (it also
#    contains non-onboarded candidates), so this must be treated as NOT a duplicate.
dedup_check "AstronomyAPI"; assert_eq "registry-only name -> not a duplicate" 0 "$?"

# 2) Name present in config/tool_provider_config.yaml -> duplicate.
dedup_check "coingecko"; assert_eq "name in YAML -> duplicate" 1 "$?"

# 3) Brand-new name, absent from adapters/, YAML, and registry -> not a duplicate.
dedup_check "totally-new-fake-provider-xyz123"; assert_eq "new name -> not a duplicate" 0 "$?"

# D-04: unit tests for queue_entry_stale() in lib.sh — pre-check that catches a queue.txt
# slug already status=connected in connected.json (distinct source from dedup_check's yaml).
queue_entry_stale "coingecko"; assert_eq "connected.json status=connected -> stale" 0 "$?"
queue_entry_stale "totally-new-fake-provider-xyz123"; assert_eq "absent from connected.json -> not stale" 1 "$?"

# A-10: sanitize_public() must fail-closed (default-deny), not fail-open (default-allow).
# Group 1 — leaked-secret shapes named in the task must ALL be blocked (return 1). Built via
# printf/command-substitution (not written as literal secret-shaped text in this file) so the
# repo's own pre-commit secret scanner does not flag these test fixtures.
sanitize_public "leaked 0x$(printf 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')"
assert_eq "bare 0x + 64-hex key -> blocked" 1 "$?"
sanitize_public "ak_live_$(printf 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')"
assert_eq "ak_live_<32hex> APIbase key format -> blocked" 1 "$?"
sanitize_public "TEMPO_PRIVATE_KEY=$(printf 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')"
assert_eq "TEMPO_PRIVATE_KEY=<hex> -> blocked" 1 "$?"

# Group 2 — the ten real title+body pairs report()/gh_upsert() actually send tonight must
# still pass (return 0). Pulled verbatim from supervisor.sh call sites (dynamic parts filled
# with representative values) so this test breaks if a future edit makes them unpostable.
legit=(
  "🌙 Night 2026-08-24
Autonomous onboarding run — live log below (public-safe: names + status only)."
  "🌙 Night orchestra started 2026-08-24
Window: 9h. Mode: LIVE-batch-push. Target: connect free no-auth APIs nonstop, self-healing."
  "Discovery wall
No new free no-auth APIs after 3 finder rounds. Finishing early; growth now comes from key-required APIs (see Telegram). Onboarded this run: 5."
  "⚠️ False-onboard met-norway
Agent claimed OK but produced no adapter+config row — blocked, NOT counted. Fails: 2."
  "🚫 False-onboard: met-norway
Agent reported ONBOARD_OK but verification (adapter index.ts + tool_provider_config row) failed. Needs manual look or retry."
  "✅ Onboarded openstates
Local commit done (batch-push pending). Total tonight: 5."
  "🔑 Needs key: bankofcanada
Onboard blocked on auth → added to key-required-queue; operator will receive it in the Telegram instructions file. Fails: 1."
  "⚠️ Failed wto
Structural — self-heal exhausted. Skipped, continuing nonstop. Fails: 3."
  "⚠️ Push blocked
Hourly batch push failed self-heal; commits remain local. Will retry next hour."
  "🌅 Night orchestra finished 2026-08-24
Onboarded: 5 | Failed: 2 | Key-required queued: see key-required-queue.md | Mode: LIVE."
)
i=0
for body in "${legit[@]}"; do
  i=$((i+1))
  sanitize_public "$body"; assert_eq "legit report-string #$i -> not blocked" 0 "$?"
done

# A raw 40-line agent-log tail (what run_agent/step_with_heal produces on failure) must never
# reach a public issue even though it contains no recognizable secret pattern by itself.
logtail=$(seq 1 40 | sed 's/^/[2026-08-24T00:00:00Z] AGENT step trace line /')
sanitize_public "$logtail"; assert_eq "raw 40-line log tail -> blocked (shape, not content)" 1 "$?"

# C-05: whole-file `grep -c dangerously lib.sh` is not a valid regression check — it also
# matches the explanatory comment above the case statement and the trusted (onboard/push/etc.)
# branch, which legitimately keeps --dangerously-skip-permissions, so it reads 2 even when the
# sandboxed branch is correct. Scope the count to ONLY the
# finder*|record-*|pricing-*|test-*) case body so a future edit that reintroduces the flag
# there (and only there) actually fails this test.
sandbox_branch=$(awk '/^[[:space:]]*finder\*\|record-\*\|pricing-\*\|test-\*\)/{flag=1} flag{print} flag && /;;/{exit}' scripts/night-orchestra/lib.sh)
[ -n "$sandbox_branch" ]; assert_eq "sandboxed case branch found in lib.sh" 0 "$?"
dangerously_count=$(printf '%s\n' "$sandbox_branch" | grep -c dangerously)
assert_eq "sandboxed finder/record/pricing/test branch has no --dangerously-skip-permissions" 0 "$dangerously_count"

exit $fail
