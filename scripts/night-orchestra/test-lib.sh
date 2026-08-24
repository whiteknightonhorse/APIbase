#!/usr/bin/env bash
# A-09: unit tests for dedup_check() in lib.sh. Run: bash scripts/night-orchestra/test-lib.sh
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

exit $fail
