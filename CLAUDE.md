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

# CodeQL rules (CODEQL-OPEN-ALERTS-1006 ruling-1, 2026-10-06): close alerts by code, never by dismiss
1. Any function that inspects a request-derived value (.length, .slice, .startsWith, regex) first checks `typeof x === 'string'` and declares the parameter `unknown`; Express query/body/header values can be arrays or objects (CodeQL js/type-confusion-through-parameter-tampering).
2. Every Express route whose handler reaches a DB/fs/auth call lists an express-rate-limit middleware literally in that route's handler array before the auth guard; a limiter inside a guard function or behind router.use is not counted and does not protect the pre-auth lookup (CodeQL js/missing-rate-limiting).
3. Never strip multi-character markers (`<!--`, `<script`, `../`) with a single String.replace; scan with indexOf in a loop until nothing changes, and still HTML-escape the result (CodeQL js/incomplete-multi-character-sanitization).
Reference implementations: src/services/api-key.service.ts isValidApiKeyFormat (1), src/shop/routes/merchant.router.ts probeLimiter (2), src/shop/routes/legal.router.ts stripHtmlComments (3). `gh api "repos/whiteknightonhorse/APIbase/code-scanning/alerts?state=open"` must stay empty for these three rule ids.
