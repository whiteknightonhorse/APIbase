# Release procedure

One version number: the git tag equals `version` in `package.json`.

1. In the release PR, bump `version` in `package.json` and add `docs/releases/vX.Y.Z.md`
   (the release notes; it becomes the GitHub release body).
2. Merge the PR.
3. After acceptance, the dispatcher tags the merge commit and pushes the tag:
   `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`
4. `.github/workflows/release.yml` runs `scripts/release-check.sh`, then publishes the
   GitHub release (skipped if it already exists).
5. The next hourly self-heal stamps the site footer BUILD label (T-SITE-A).

Tags are never created before `docs/releases/<tag>.md` is merged: the workflow fails the
check when the tag, `package.json` version, or notes file disagree.

Local check: `bash scripts/release-check.sh vX.Y.Z`; self-test: `bash scripts/release-check.sh --selftest`.

## Tool list routes: bounded and compact on request (T-0836)

`GET /api/tools` and `GET /api/v1/tools` accept `limit` (1 to 2000), `cursor`, `category` and `view=full|compact`; an unknown `view` is a 400. `view=compact` items hold `id`, `name`, `category`, `price_usd` and `summary` (the first sentence of the description, at most 160 characters). When any of the four parameters is sent, the response also carries `total` (rows matching the filters) and `truncated` (true when more rows exist than returned), next to the pagination cursor. A request without these parameters returns the same response as before.

Planned: the defaults of both routes become `view=compact&limit=100`, with `view=full` keeping today's response. The date is added when that change ships.
