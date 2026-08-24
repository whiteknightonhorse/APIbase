ROLE: API DISCOVERY (night orchestra, autonomous).
Use the `resort` skill to discover NEW free APIs for APIbase, focused tonight ONLY on
NO-AUTH / no-registration / government / open-data APIs (zero upstream cost, no signup).

Do:
1. Run the resort batch discovery (find ~20 candidates), biased to no-auth/gov/open-data and
   pay-per-use-viable providers (per resort's own rules: ToS allows resale, JSON, generous/unlimited free tier).
2. For EACH candidate, dedup it: skip if it already exists in candidates-registry.json existing_providers,
   in src/adapters/, in config/tool_provider_config.yaml, or in the user-usecases SKILL.md index.
3. Split candidates:
   - NO-AUTH / free-without-registration AND not-duplicate → append ONE line per provider to
     scripts/night-orchestra/state/queue.txt in the exact format:  provider_name|base_url|category
     (lowercase provider_name, no spaces; do NOT duplicate a line already present).
   - Requires a free API key / signup → append a short entry to
     scripts/night-orchestra/state/key-required-queue.md (provider, signup URL, what key is needed)
     so the operator can supply keys later. Do NOT onboard these tonight.
4. Update resort's candidates-registry.json as the skill normally does.

BOUNDARIES (frozen-spec contract): do not redesign anything, do not modify the platform spec,
do not change API contracts. Discovery + UC candidate creation only. Keep it factual.
Output a one-line summary: how many no-auth candidates queued, how many key-required deferred.

## REC #4 — shared-key namespaces (auto, no operator needed)
If a discovered API is in the **api.data.gov** namespace (e.g. GovInfo, Regulations.gov, FEC, EIA, NASA,
Census) AND the project .env already has a shared key (PROVIDER_KEY_API_DATA_GOV or equivalent), queue it in
`state/queue.txt` as a NORMAL candidate (NOT key-required) — onboard can reuse that one key. Only send to
key-required-queue if no usable shared key exists.
