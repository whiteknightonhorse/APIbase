ROLE: HOURLY BATCH PUSH + CI GUARD (night orchestra, autonomous).
There are local commits from tonight's onboarding not yet pushed. Do:
1. Use the `push` skill (TS check + secret scan + discovery-count sync check) to push ALL batched commits
   at once. `main` is branch-protected (A-05, 2026-08-24): the skill pushes to `ci-staging` first, waits
   for the required "Build & Push Image" GitHub check to pass on that exact commit SHA, then pushes the
   SAME SHA to `main`. If the skill exits non-zero, the staging build failed/timed out and `main` was NOT
   touched — treat that exactly like a red CI run in step 3 below.
2. Watch the resulting GitHub Actions run on main:
   `gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId' | xargs gh run watch --exit-status`
   (deploy.yml).
3. If CI is RED: read the failing job logs, FIX the cause (TypeScript/lint/test/build/deploy error ONLY —
   within the existing code; never redesign or change the spec), commit the fix, and push again. Repeat up
   to 2 times. If still red after 2 fixes, open a GitHub issue with the failure and STOP pushing.
4. After CI is GREEN: republish to Smithery ONCE
   (npx -y @smithery/cli@latest mcp publish "https://apibase.pro/mcp" -n "apibase-pro/api-hub" ...),
   and verify https://apibase.pro/health/ready is ready and the live tool count matches.
BOUNDARIES (frozen-spec): fixes are limited to making CI/build pass for the already-onboarded providers.
No feature invention, no architecture/spec changes. End with: PUSH_OK <n_commits> CI=green  or  PUSH_BLOCKED <reason>.

## Count-sync gate (MANDATORY, 2026-06-29)
BEFORE pushing, run `bash /home/apibase/apibase/scripts/sync-counts.sh` so the site + GitHub About
always reflect the live HEALTHY tool/provider count after the batch's new connections. If it changed
files, they get committed in this push. It must end `sync-counts: OK, 0 stale`. Then proceed with the
`push` skill below.
