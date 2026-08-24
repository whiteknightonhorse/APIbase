ROLE: PROVIDER ONBOARDING — BATCH MODE (night orchestra, autonomous, serialized).
Onboard the provider "__NAME__" (candidate line: "__LINE__") into APIbase using the
`onboard-provider` skill, but in BATCH MODE:

- Execute onboard-provider steps 1–14 fully: adapter, Zod schemas, registry/config/env edits,
  tool-definitions, tool_provider_config.yaml pricing, provider-limits.json, TS compile + ESLint
  (ZERO errors), DB seed, local `docker compose build api && docker compose up -d api`, verify in
  local production (health, has_more:false, schema populated), smoke test, UC file + index + MEMORY.md,
  regenerate OpenAPI + server-card.json.
- Then `git add` the specific changed files and make a LOCAL COMMIT
  (message: "feat: integrate __NAME__ — N tools (UC-NNN)").
- DO **NOT** run `git push` and DO **NOT** publish to Smithery. The hourly batch-pusher does that.
- This is a NO-AUTH / no-registration provider: verify endpoints live via curl; no credentials needed.
- PRICING: free/open upstream → price_usd in the $0.001–0.005 range (~100% margin). If any tool has a
  real upstream cost, set price = upstream × 1.4 (keep within 1.3–1.5). Record the margin in the UC
  "Pricing Rationale" table.

BOUNDARIES (frozen-spec): follow the existing skill EXACTLY. Do not invent features, do not redesign
architecture, do not change API contracts or the frozen spec. If onboarding this provider would require
any spec/contract change, STOP, write why to scripts/night-orchestra/state/failed.txt, and exit — do not
improvise. If endpoints are unreliable or ToS forbids resale, mark it failed and exit cleanly.

## A-06 — IDEMPOTENCY (this role may be re-run up to 2x by step_with_heal's fix-and-retry loop)
A prior attempt for the same "__NAME__" may have already written some of these files before it failed.
Before every append-style edit, check whether the target already exists — never blindly append a second
time:
- `config/tool_provider_config.yaml` (step 4f): for each tool_id you are about to add, first run
  `grep -qF "tool_id: <tool_id>" config/tool_provider_config.yaml` — only append the entry if this
  reports no match. Never add a tool_id that is already present in the file.
- Same rule for every other append-style step: `src/adapters/registry.ts` (registry case), tool
  definitions, `static/.well-known/mcp/server-card.json`, `README.md` counts, `MEMORY.md`,
  `config/provider-limits.json`. Read current state first; only add what is genuinely missing.
- DB seed (step 6, `scripts/seed.ts`) is already upsert-keyed on `tool_id` — safe to re-run as-is, no
  special handling needed.
- Do not delete or recreate files that already exist from a partial prior attempt — resume from what's
  there instead of starting over, so a retry never doubles up prior work.

End with a clear status line: ONBOARD_OK <name> <toolcount> UC-NNN   OR   ONBOARD_FAILED <name> <reason>.

## REC #4 — reuse shared api.data.gov key
If this provider is on the **api.data.gov** namespace (api.govinfo.gov, api.data.gov, api.fec.gov, api.eia.gov,
api.nasa.gov, api.census.gov, etc.) and a shared key exists in .env (PROVIDER_KEY_API_DATA_GOV or similar), use
that existing key as the X-Api-Key / api_key — do NOT block on a new signup. This makes these effectively no-auth.
