# Language rule (ABSOLUTE) — ENGLISH-ONLY-1006, operator ruling 2026-10-05
English only, everywhere in this repository and in everything the product emits:
source code, comments, docstrings, UI text (HTML/Markdown/SVG), JSON/YAML config,
API/MCP responses, error messages, logs, Telegram notices, outgoing e-mail,
tests, docs, README, commit messages, branch and file names.
No Cyrillic characters anywhere in tracked files. No bilingual (RU/EN) copies.
Gate: tests/unit/english-only.test.ts — any Cyrillic in `git diff` means NOT DONE.
Only exception: the operator's own chat and ~/taskloop cards/rulings (outside this repo).
