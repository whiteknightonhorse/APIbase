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

# Documentation law (FLEET-DOCS-LAW-1026, operator ruling 2026-10-24)
Observable change = anything a user, agent, integrator or self-hoster can see: behaviour, routes and response fields, MCP tools and prompts, error codes and messages, limits, prices and fees, headers, env/config defaults, CLI flags, served files, page text.
1. Same card. A card with an observable change updates this project's public documentation on the SITE and on GITHUB in the same card. The card header carries `DOCS: <repo path>[, <repo path>...]` naming every documentation surface it edits, and the body has a `## Docs` section (per surface: live URL, GitHub-main URL, the sentence that changes, the grep that proves it live). A card with no observable change carries `DOCS: none - <class>: <reason>`, class in {refactor, tests, infra, internal, journal, fix-to-spec, revert, measure}. An observable change is never exempt; `fix-to-spec` cites the doc line that already states the behaviour; a `revert` of a change that had docs reverts the docs too (then it is not exempt). `MODEL: haiku` cards (read-only, no commit) need no DOCS line.
2. Read before write. Before editing a surface: fetch the CURRENT live page (`curl -sS -D - <url>`, and again with `Accept: text/markdown` where a twin exists), fetch the CURRENT file on GitHub main (`git fetch origin main`; the raw main URL for a repo this tree does not own), and `grep -rn` the fact's key phrase over every surface in section 4. Paste that evidence in the task log BEFORE the edit. Then edit the existing sentence in place. One canonical statement per fact; every other surface links to it (or carries one line plus the link). Never add a paragraph that restates one that exists; never leave an older sentence that now contradicts the new one (grep of the superseded wording = 0 at the end). Append-only files (decision logs, release notes, dated snapshots) are not rewritten: the new entry names what it supersedes and the old entry gets a one-line "superseded by ..." marker or an "as of <date>" label. Counts and generated files are never typed by hand: use the generator or the sync token.
3. Proof. The reviewer rejects: a DOCS surface untouched without a quoted already-correct line; a fact stated twice; a surviving old wording; `DOCS: none` on a diff with an observable change ("docs exemption false"). The reviewer cannot wait for a deploy: the live site and github.com main are checked by the dispatcher after merge from the card's "## After merge (dispatcher)" section (one `curl ... | grep -c` per live URL, one per raw main file; results pasted under the card's knowledge note). A new fact also gets the permanent check named in section 4 where this project has one.
4. Surfaces of this project.
APIbase (whiteknightonhorse/APIbase; tree ~/apibase-fleet):
SITE (apibase.pro serves this tree): static/** - HTML pages and their .md twins, llms.txt, ai.txt, index.md, why.md, integrator/* (incl. integrator/llms.txt), .well-known/* (mcp.json, x402-payment.json, agent.json, server-card.json, agent-registration.json, site-facts.json, agent-skills/*), /guides/* only through its generator.
GITHUB (main): README.md, docs/payments.md, docs/architecture.md, docs/x402-facilitator.md, docs/self-hosting.md, docs/ROADMAP.md, docs/releases/* (append-only), SECURITY.md, packages/*/README.md, server.json, provek.json. Cards on ~/mcp-protocol-tester: README.md, docs/*, CLAUDE.md, .claude/CLAUDE.md, .env.example.
PERMANENT CHECK: counts via scripts/sync-counts.sh --check (tokens, never literals); every other new fact: one row in config/site-claims.tsv plus a key in gen-site-facts.ts or site-facts.manual.json (T-0542); until 0542 is merged, the After-merge curl only.
NOT documentation: AUTOPILOT-PROGRESS.md (journal), docs/OPERATOR-ACTION-*.md and docs/integrator.md (operator notes; SITE-AUDIT-1026 operator decision 1), docs/STRATEGY.md (dated), ~/taskloop/**.

# CodeQL rules (CODEQL-OPEN-ALERTS-1006 ruling-1, 2026-10-06): close alerts by code, never by dismiss
1. Any function that inspects a request-derived value (.length, .slice, .startsWith, regex) first checks `typeof x === 'string'` and declares the parameter `unknown`; Express query/body/header values can be arrays or objects (CodeQL js/type-confusion-through-parameter-tampering).
2. Every Express route whose handler reaches a DB/fs/auth call lists an express-rate-limit middleware literally in that route's handler array before the auth guard; a limiter inside a guard function or behind router.use is not counted and does not protect the pre-auth lookup (CodeQL js/missing-rate-limiting).
3. Never strip multi-character markers (`<!--`, `<script`, `../`) with a single String.replace; scan with indexOf in a loop until nothing changes, and still HTML-escape the result (CodeQL js/incomplete-multi-character-sanitization).
Reference implementations: src/services/api-key.service.ts isValidApiKeyFormat (1), src/shop/routes/merchant.router.ts probeLimiter (2), src/shop/routes/legal.router.ts stripHtmlComments (3). `gh api "repos/whiteknightonhorse/APIbase/code-scanning/alerts?state=open"` must stay empty for these three rule ids.
