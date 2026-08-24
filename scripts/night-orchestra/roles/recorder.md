ROLE: RECORD-KEEPING verification for provider "__NAME__".
Confirm the connection is fully recorded:
1. UC file exists: .claude/skills/user-usecases/usecases/UC-*-__NAME__*.md (with Pricing Rationale + tool list).
2. The UC index table in .claude/skills/user-usecases/SKILL.md has a row for it.
3. MEMORY.md (/home/apibase/.claude/projects/-home-apibase-apibase/memory/MEMORY.md) lists the provider in
   Connected Providers with adapter path + auth method + pricing note.
If any is missing, BACKFILL it from the actual adapter/config (do not invent — read the real files).
BOUNDARIES: documentation only; no code/spec changes. End with: RECORD_OK <name> or RECORD_FIXED <name> <what>.
