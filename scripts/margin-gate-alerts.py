#!/usr/bin/env python3
"""margin-gate-alerts.py — F1/C-4: file/update a GitHub issue for every tool the
runtime TOOL_STATUS margin gate is currently refusing to serve.

Same pattern as provider-limit-alerts.py (this repo, hourly cron): re-derive the
violation from the DB directly (never from application logs — the hot path never
calls out to GitHub itself, see src/pipeline/stages/tool-status.stage.ts doc
comment), dedup by an existing open issue title prefix, idempotent re-run.

A tool shows up here iff price_usd < upstream_cost_usd * MARGIN_MULTIPLIER AND
upstream_cost_usd IS NOT NULL (rows still pending migration never match — see
scripts/migrate-upstream-cost.py). Every hit here is currently 503-ing real
clients; this is a revenue-protection alert, not a housekeeping one.

F6: MARGIN_MULTIPLIER used to be a second hardcoded `1.3` here (three literal
occurrences), independent of src/pipeline/stages/tool-status.stage.ts's own
`MARGIN_MULTIPLIER = 1.3` -- the same policy constant in two places with no
link between them. Now read from src/config/margin.json, the one file both the
TS runtime gate and this alert cron load.
"""
import json, subprocess

ROOT = "/home/apibase/apibase"
REPO = "whiteknightonhorse/APIbase"
TITLE_PREFIX = "Margin gate blocking: "

with open(f"{ROOT}/src/config/margin.json") as f:
    MARGIN_MULTIPLIER = json.load(f)["MARGIN_MULTIPLIER"]


def psql(sql):
    out = subprocess.run(
        ["docker", "exec", "apibase-postgres-1", "psql", "-U", "apibase", "-d", "apibase", "-tAF", "\t", "-c", sql],
        capture_output=True, text=True,
    )
    return out.stdout.strip()


def gh(*args):
    return subprocess.run(["gh", *args], capture_output=True, text=True, cwd=ROOT)


rows = psql(
    f"""
    SELECT tool_id, provider, price_usd, upstream_cost_usd
    FROM tools
    WHERE upstream_cost_usd IS NOT NULL
      AND price_usd < ROUND(upstream_cost_usd * {MARGIN_MULTIPLIER}, 8)
    ORDER BY tool_id
    """
)
violations = []
if rows:
    for line in rows.splitlines():
        tool_id, provider, price, cost = line.split("\t")
        violations.append((tool_id, provider, price, cost))

if not violations:
    print("margin-gate-alerts: 0 tools currently blocked — nothing to do")
    raise SystemExit(0)


def open_issues():
    r = gh("issue", "list", "--repo", REPO, "--state", "open", "--search", f"{TITLE_PREFIX} in:title",
           "--limit", "100", "--json", "number,title")
    try:
        return json.loads(r.stdout or "[]")
    except Exception:
        return []


existing_titles = {i["title"] for i in open_issues()}

created = 0
for tool_id, provider, price, cost in violations:
    title = f"{TITLE_PREFIX}{tool_id}"
    if title in existing_titles:
        print(f"skip (already open): {tool_id}")
        continue
    required = round(float(cost) * MARGIN_MULTIPLIER, 8)
    body = (
        f"Runtime margin gate (TOOL_STATUS stage, F1/C-4) is refusing to serve **`{tool_id}`** "
        f"(provider `{provider}`) — clients get 503.\n\n"
        f"- `price_usd` = {price}\n"
        f"- `upstream_cost_usd` = {cost}\n"
        f"- required minimum (cost × {MARGIN_MULTIPLIER}) = {required}\n\n"
        f"Fix by raising `price_usd` for this tool in `config/tool_provider_config.yaml` to at "
        f"least {required}, or re-verify `upstream_cost_usd` if it was migrated wrong, then re-seed. "
        f"Auto-detected by margin-gate-alerts (hourly)."
    )
    # NO --label: this repo's gh label create fails here (see provider-limit-alerts.py) — skip it.
    r = gh("issue", "create", "--repo", REPO, "--title", title, "--body", body)
    ok = r.returncode == 0
    print(f"{'created' if ok else 'FAILED'}: {title} -> {(r.stdout or r.stderr).strip().splitlines()[-1] if (r.stdout or r.stderr) else ''}")
    if ok:
        created += 1

print(f"margin-gate-alerts: {len(violations)} blocked tool(s), {created} new issue(s) filed")
