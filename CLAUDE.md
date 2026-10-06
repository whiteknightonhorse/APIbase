# Language rule (ABSOLUTE) — ENGLISH-ONLY-1006, operator ruling 2026-10-05
English only, everywhere in this repository and in everything the product emits:
source code, comments, docstrings, UI text (HTML/Markdown/SVG), JSON/YAML config,
API/MCP responses, error messages, logs, Telegram notices, outgoing e-mail,
tests, docs, README, commit messages, branch and file names.
No Cyrillic characters anywhere in tracked files except the three Telegram slots below. No bilingual (RU/EN) copies.
Gate: tests/unit/english-only.test.ts — any Cyrillic in `git diff` means NOT DONE.
Outside the rule: the operator's own chat and ~/taskloop cards/rulings (outside this repo).

# Telegram exception (ENGLISH-ONLY-1006 ruling-2, operator answer 2026-10-05: "TG in Russian")
The text of Telegram notifications the autopilot sends to the operator MAY be Russian.
That text lives in exactly three slots and nowhere else:
  1. config/autopilot/tg-strings.ru.json -- string VALUES only (keys ASCII, flat object);
  2. config/autopilot/routing.json -- string elements of `variants` arrays only
     (they render as the Telegram "Variants:" line and, through the same function,
     in the operator file);
  3. scripts/sync-counts-cron.sh -- the first argument of `calert "..."` only.
Everything else, in those files and in the whole repository, is English: code, comments,
docstrings, JSON keys and `_comment` fields, notice()/notices.log lines, incident fields
(what, system_did), operator files, fleet task files, tests, selftests.
New Telegram text goes into tg-strings.ru.json (loaded at import, fail-closed), never inline.
The gate tests/unit/english-only.test.ts enforces exactly these three rules; widening the
allowlist needs a new ruling in ~/taskloop/disputes.
