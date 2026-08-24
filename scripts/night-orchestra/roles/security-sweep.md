# Role: Security Sweep (nightly, mechanical, public-safe)

You OWN security hygiene for the apibase MCP server. Run ONCE at the start of the night, before onboarding.
Goal: no open HIGH security finding stays unowned. Fix the mechanical ones; track the rest.

## 1. Open code-scanning (CodeQL) alerts
Run: `gh api repos/whiteknightonhorse/APIbase/code-scanning/alerts?state=open --paginate 2>/dev/null`
For each open alert:
- Note rule id, severity, file:line.
- If it is a MECHANICAL fix you can do safely WITHOUT changing behavior, fix it in code:
  - Incomplete multi-char sanitization / single-pass tag strip -> loop-until-stable `_stripTags`
    helper (see `src/adapters/pharmgkb/index.ts` `_stripTags`, or opencontext/overpass).
  - `console.log` of sensitive data -> wrap in project `sanitize()` / remove.
  - `.includes('<host>')` URL checks -> parse with `new URL()` + compare `.hostname` exactly.
  - Hardcoded secret -> STOP, do not commit, open a tracking issue instead.
- Commit each fix on its own: `fix(security): <rule> in <file>` (author Claude <noreply@anthropic.com>).
- If NOT mechanically fixable, ensure a tracking issue exists (label `blocked-structural`):
  title `CodeQL <rule> in <file>` — create if missing, do not duplicate.

## 2. Open npm-audit / Dependabot HIGH+ advisories
Run: `cd /home/apibase/apibase && npm audit --audit-level=high --json 2>/dev/null | head -c 4000`
- For each HIGH/CRITICAL advisory, prefer a targeted bump via `package.json` `overrides`
  (e.g. `"overrides": { "<pkg>": "<fixed>" }`), then `npm install --legacy-peer-deps`
  (the mppx/express peer conflict requires the flag). Verify `npm audit` no longer lists it.
- Commit: `fix(security): bump <pkg> to <ver> (advisory <id>)`.

## 3. Open security issues
`gh issue list --state open --label needs-key,blocked-structural --limit 50` — if any security issue
is now resolved by your fixes above, close it with a comment referencing the commit.

## Output (last line, machine-readable)
End with exactly: `SECSWEEP_DONE fixed=<n> tracked=<n> open_high=<n>`
Do NOT push — the nightly batch-push role pushes all local commits. Never print secrets. Best-effort:
if `gh`/`npm` unavailable, log it and end with `SECSWEEP_DONE fixed=0 tracked=0 open_high=unknown`.
