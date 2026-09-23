# OPERATOR ACTION — registry republish (R4/R5/R6)

**Status as of this commit (ZZ-03-10 code-part landed):** `server.json` and
`packages/mcp-client/package.json` no longer carry stale tool/provider numbers in their
`description` fields (D-2/R1). That fixes the *source*. It does **not** by itself fix
what Official MCP Registry, npm, Glama, or Smithery currently show — those are cached
copies that only update when someone actually republishes. `scripts/check-external-listings.sh`
reports this state honestly as `pending_republish` (not `drift`/`stale`) for
`official_registry` and `npm` — verify with:

```
ROOT=$(pwd) bash scripts/check-external-listings.sh
```

This document is the single index of the account-bound actions needed to close that gap.
Nothing below can be done from a commit — every step needs a human logged into an
external account (npm, GitHub device flow, Glama, Smithery, PulseMCP). Do not reorder
R4's three steps; each downstream registry reads from the one before it.

## R4 — gated republish, strict order: npm → Official Registry → Glama → Smithery

The order matters because Glama installs `apibase-mcp-client` from npm during its own
inspection (`.claude/skills/glama/SKILL.md`), and the Official Registry's `server.json`
`packages[]` entry pins an npm package version — publishing out of order means a
downstream registry re-reads a still-stale upstream source and the fix has to be redone.

### Step 1 — npm (`/npmjs publish` or `/npmjs bump-patch`)

1. Bump the version in `packages/mcp-client/package.json` (patch bump is enough — the
   `description` field changed, no code changed).
2. Run the `/npmjs publish` skill workflow (builds, publishes both
   `@apibase11/mcp-client` and `apibase-mcp-client` from the same file, restores the
   scoped name afterward — see `.claude/skills/npmjs/SKILL.md`).
3. Verify: `npm view apibase-mcp-client description` — must show the new no-number text,
   no `300+ tools across 84 providers`.

### Step 2 — Official MCP Registry (`mcp-publisher publish`)

1. In `server.json`, bump `"version"` (registry rejects republishing an unchanged
   version) and update `packages[0].version` to match the npm version just published in
   Step 1.
2. `mcp-publisher login github` if the device-flow token has expired, then
   `mcp-publisher publish` from the repo root (reads `server.json` directly).
3. Verify:
   ```
   curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=apibase" | \
     python3 -m json.tool | grep -A2 '"isLatest": true'
   ```
   The latest entry's `description` must be the new no-number text, not
   `327 tools, 92 providers...`.

### Step 3 — Glama (declined by operator, 2026-09-23)

<a name="T-R4-GLAMA-OPERATOR-DECLINED"></a>

Glama's **server listing** (`glama.ai/mcp/servers/whiteknightonhorse/APIbase`) — a
different object from the **connector** page R3 tracks below — moved to a paid ($9)
Deploy → Create Release flow. The operator declined to pay for this republish as of
2026-09-23. This is a deliberate, standing decision: **do not open follow-up tasks for
it**, do not build a scraper for the page, and do not treat it as blocking anything. The
page currently mixes stale numbers (1381/390/618 across its tool/provider counts) and
shows a D-grade quality widget; it has no Status field at all, and
`check-external-listings.sh` never checked it in the first place — `glama_health` only
reads the connector page's binary Status field (R3 below), which is unaffected by this
decision. Tracked for the record only as `glama_server_listing` in
`docs/external-drift.json` (`classification: operator-declined`, never blocking). See
`disputes/0179-glama-operator-declined-drift-escalation.ruling-1.md`.

### Step 4 — Smithery (`/smithery` skill)

1. Run the `/smithery` skill's publish command (re-scans `server-card.json` for the
   current tool count — this is the *count* refresh, separate from the description text
   fixed by R5 below).
2. This step does not touch the Description field — Smithery treats that as
   set-once-at-first-publish metadata (confirmed live 2026-09-02, see R5).

### After R4 — re-verify

```
ROOT=$(pwd) bash scripts/check-external-listings.sh
```

`official_registry` and `npm` should now read `status: ok_no_number` (no number in the
description at all, so it can never drift on a count again — same permanence rule as
Smithery's Q2.3). If either still shows `pending_republish`, the corresponding step above
did not take — check `mcp-publisher`/`npm` auth before re-running.

## R5 — Smithery Description UI edit (deadline **2026-10-02**)

Full detail already written up: **`docs/OPERATOR-ACTION-smithery-listing-description.md`**
— one Settings-UI field edit, no CLI override exists. Do this independently of R4 Step 4
(R4 Step 4 refreshes the tool *count* Smithery scans; R5 fixes the free-text
*description*, which Smithery never auto-refreshes regardless of how many times R4 Step 4
is re-run). Missing the 2026-10-02 deadline doesn't break anything mechanically — it just
means the listing keeps showing "95 tools" to every visitor for that much longer.

## R6 — PulseMCP (conditional, operator-timed)

PulseMCP's listing is not merely stale — per `02-RESEARCH.md` §2.9/§2.12 it shows
materially wrong content (`"API development platform with testing, monitoring, and
documentation tools"`, not a description of what APIbase does at all), and the site was,
as of that research pass, refusing new submissions while it redesigned listing
management. `check-external-listings.sh`'s `pulsemcp` check is Cloudflare-blocked from
both the production box and the documented `pulsemcp.com` v0.1 API (which additionally
needs a key this repo doesn't hold) — it will reliably report `unreachable`. This is
expected, not a bug to chase.

**Action (operator, by hand, 7 days after R4 completes — not before):**

1. Visit `https://www.pulsemcp.com/servers/apibase` in a normal browser and read the
   current description.
2. If it has self-corrected (PulseMCP resumed submissions and re-crawled, or auto-reads
   from the Official Registry the way the registry table in the `mcp-registries`
   reference memory claims) — nothing further to do, close this out.
3. If it is still wrong: the fleet prepares a draft correction request (what PulseMCP's
   own submission/contact flow requires, or an email to `hello@pulsemcp.com` per their
   public API docs contact) as a follow-up task — the fleet drafts, the operator reviews
   and sends. Do not have the fleet send outreach email directly (see
   `reference_outreach_gmail.md`: draft-only, operator sends).

## R7 — mcp.so / G2 AI Marketplace (P2, not gated on R4-R6)

Two more listings with stale, account-bound descriptions, lower priority than R4-R6
(`03-SPECIFICATION.md` §10 D-2, "R7 mcp.so/G2 — P2") — do these only after R4-R6, and
only when picked up as their own dispatched task; nothing here is queued yet.

- **mcp.so** (`mcp.so/servers/APIbase`) — listed, HTTP 200, meta description reads
  "1108 tools, 307 providers" against the live count. No submission/edit flow has been
  confirmed yet (02-RESEARCH.md §2.12/§2.16.1 marks the correction path UNKNOWN, not
  established) — first step for whoever picks this up is finding out whether mcp.so
  even offers a self-serve edit, before drafting anything.
- **G2 AI Marketplace** (`ai.g2.com/marketplace/tools/apibase`) — listed with
  "Unified MCP gateway for 1100+ pay-per-call tools" against the live count. G2 listings
  are normally managed through a G2 seller/vendor account; confirm which APIbase account
  (if any) already owns this listing before attempting a correction — do not create a
  new one if one already exists, that would split the listing in two.

## R3 — Glama Unhealthy diagnosis — RESOLVED 2026-09-22

Root cause found and fixed, not a guess. `src/mcp/server.ts` returned a hard `401` on the
MCP `initialize` request whenever no `Authorization` header was present — exactly how
Glama's own connector health-checker probes `/mcp`, so every probe failed before the
handshake could even start. nginx access logs for the Glama prober (IP `40.160.65.14`, UA
`node`) show the flip cleanly:

```
2026-09-09 .. 2026-09-21: POST /mcp -> 401, 62-218/day, zero 200s
2026-09-22 before 02:52Z: 401 x8
2026-09-22 from 02:52Z:   200 x390 / 202 x114 (full initialize 200 -> initialized 202 ->
                          tools/list 200 handshake now succeeding)
2026-09-23:               200 x237 / 202 x68
```

Fixed by commit `5df51566` (T-0211, ZZ-03-11), deployed 2026-09-22 02:52Z. Glama's
connector Status field read **Healthy** at 2026-09-23 14:46Z — the first confirmed
reading. Per the **Final acceptance** section below, ZZ-03-11 needs a second Healthy
reading **≥6 hours later** (not before 2026-09-23 20:46Z) before this counts as durably
fixed rather than a one-off lucky crawl; that second reading is a separate task (T-B), not
part of this fix. Uptime% shown on the connector page is a rolling window over the prior
35 days of 401s and will climb back up on its own — it is not a sign the fix didn't take.

`docs/external-drift.json`'s `glama_health` entry carries a `resolved: "2026-09-22"`
field so `check-external-listings.sh`'s `classify()` resets its 30-day escalation clock
to age=0; if the connector ever regresses to Unhealthy again despite that field, the
script surfaces a `"note":"recurred after resolved ..."` flag rather than silently
treating the regression as brand new — the fix at that point is committing a fresh
`first_seen`, not editing `resolved`.

R4 Step 3 above (Glama server listing) is a **different Glama object** and is unrelated
to this fix — it only rebuilds the inspection image, it never touched the health prober.
See `disputes/0179-glama-operator-declined-drift-escalation.ruling-1.md` for the full
investigation (nginx log excerpts, both Glama objects compared side by side).

## Final acceptance (all of R4/R5/R6 done)

`ROOT=$(pwd) bash scripts/check-external-listings.sh` should report `ok`/`ok_no_number`
for all five checked registries (`smithery`, `official_registry`, `npm`, `glama_health`,
`pulsemcp`). Glama additionally needs **Healthy shown twice, ≥6 hours apart** before it
counts as fixed rather than a one-off lucky crawl — that verification pass is ZZ-03-11,
not this document.
