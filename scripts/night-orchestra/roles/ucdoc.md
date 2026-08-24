ROLE: UC-DOC backfill for provider "__NAME__", already onboarded and verified (adapter + config row exist).

M-03: the sandboxed record-__NAME__ step cannot get write approval for files under `.claude/` in
headless mode (it printed "I need permission to write the UC file" and stopped) — that is a
structural gap in the sandboxed role's permission set, not a content decision, so this step runs
outside that sandbox to close it mechanically.

1. Find the UC number: `git log --grep="__NAME__" --oneline -5` — the onboarding commit message is
   `feat: integrate __NAME__ — N tools (UC-NNN)`. Use that exact UC-NNN. If no such commit exists yet,
   STOP and report UCDOC_FAIL __NAME__ (do not guess a number).
2. If `.claude/skills/user-usecases/usecases/UC-NNN-__NAME__*.md` does not already exist, create it by
   reading the REAL files (do not invent anything):
   - `src/adapters/__NAME__/index.ts` and `types.ts` (endpoints, tool logic)
   - `src/schemas/__NAME__.schema.ts` (input schemas)
   - `src/mcp/tool-definitions.ts` (grep for `__NAME__.` — toolId, mcpName, description)
   - `config/tool_provider_config.yaml` (grep for `__NAME__` — price_usd, cache_ttl per tool)
   Follow the format of the most recent existing UC file in that directory (Meta table, Overview,
   API Endpoints Verified, Tool Mapping, Pricing Rationale, Input Schemas, Implementation Files,
   Notes).
3. If `.claude/skills/user-usecases/SKILL.md` has no index row for this UC, add one row before the
   `## How to Use` section, matching the existing row format exactly (one line per UC, pipe table).
4. BOUNDARIES: documentation only inside `.claude/skills/user-usecases/`. No code/spec changes, no
   git push, no reading `.env`.

End with exactly one line: UCDOC_OK __NAME__ UC-NNN   OR   UCDOC_FIXED __NAME__ UC-NNN <what was
missing>   OR   UCDOC_FAIL __NAME__ <reason>.
