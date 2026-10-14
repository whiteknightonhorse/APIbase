# Upstream cost models (T-SITE-E)

Every paid tool (`price_usd` > 0) in `config/tool_provider_config.yaml` must say what the upstream call costs us,
or be explicitly listed as unknown. This file defines the five models and the YAML shape of each.

Cost fields NEVER change `price_usd`. A tool priced below its floor surfaces through `scripts/margin-gate-alerts.py`
and is re-priced by a separate operator-approved card.

## Fields (YAML only, no DB column except `upstream_cost_usd`)

| Field | Meaning |
|---|---|
| `upstream_cost_usd` | per-call upstream cost, string, e.g. `"0.0080"`; seeded into `tools.upstream_cost_usd` |
| `upstream_cost_status: NOT_MEASURED` | no number yet; used only with model `metered` |
| `upstream_cost_model` | one of `free`, `free_tier`, `flat`, `subscription`, `metered` |
| `upstream_cost_note` | mandatory whenever model is not `free`: pricing URL + quote + date + tier |

An assumed tier is written literally: `tier assumed: <name>; operator to confirm`.
Legacy rule: `upstream_cost_usd: "0"` without a model is read as `free` (T-0352 backfill); no churn.

## The five models

### free
No-auth public API with positive evidence (backfill rule in `scripts/backfill-upstream-cost.py`).
```yaml
    upstream_cost_usd: "0"
    upstream_cost_model: free
    upstream_cost_note: "<docs URL> — no API key required — <date>"
```

### free_tier
Keyed API on a free plan. No card attached, so overage means the provider refuses the call; it never bills us.
`src/config/provider-limits.json` has an entry with `limit_type` / `free_limit` and NO billing / pricing keys.
```yaml
    upstream_cost_usd: "0"
    upstream_cost_model: free_tier
    upstream_cost_note: "https://example.com/pricing — \"Free: 1,000 calls/month\" — 2026-10-14 — tier: Free; no card attached, overage = refusal"
```

### flat
Per-call list price on the plan the operator actually holds.
```yaml
    upstream_cost_usd: "0.0080"
    upstream_cost_model: flat
    upstream_cost_note: "https://example.com/pricing — \"$0.008 per call\" — 2026-09-06 — tier: Growth"
```

### subscription
Monthly fee divided by included calls. Write the formula in the note.
```yaml
    upstream_cost_usd: "0.002"
    upstream_cost_model: subscription
    upstream_cost_note: "https://example.com/pricing — \"$49/mo, 25,000 calls\" — 2026-10-14 — tier: Starter; $49 / 25000 = $0.00196, rounded up"
```

### metered
Cost depends on load (size, compute time). Until 30 days of `execution_ledger.upstream_cost_usd` exist, no number is
written: status `NOT_MEASURED` plus the formula in the note. After 30 days, replace with the p80 per tool_id and
switch the model to `flat`-style `upstream_cost_usd` (api2pdf pattern, see `pdf.from_html`).
```yaml
    upstream_cost_status: NOT_MEASURED
    upstream_cost_model: metered
    upstream_cost_note: "https://example.com/pricing — formula: $0.001/MB + $0.0002/s — 2026-10-14 — tier: PAYG; needs 30d real traffic for p80"
    upstream_cost_remeasure_by: "2026-11-14"
```

## The gate: `tests/unit/cost-model-required.test.ts`

Parses the real YAML and fails (naming tool_id, provider and rule) when:
1. `cost-model-required` — a paid tool has no `upstream_cost_usd`, is not a `NOT_MEASURED` + `metered` + non-empty note
   block, and its provider has no `## <provider>` section in `docs/margin/unknown-cost-providers.md`.
2. `model-enum` — `upstream_cost_model` is present but not one of the five.
3. `note-required` — model is not `free` and the note is empty or has no `http` URL.
4. `list-only-shrinks` — a provider has a cost set on any tool but still has a section in the md.

## The unknown list only shrinks

`docs/margin/unknown-cost-providers.md` is generated: `python3 scripts/backfill-upstream-cost.py --write-unknown-md`.
A batch that gives a provider a cost model adds the YAML fields, then regenerates the md, which drops that section.
A PR that ADDS a section is NOT DONE: new providers ship with a model from day one.

## New provider blocks

Night-orchestra and the onboard-provider skill emit the `free` shape for every new block. A paid-upstream provider
replaces it with the right model above before the block is committed.

## Assigned

Provider | model | cost | tier | source date. Every tier below is assumed (operator answer 2026-10-14: tiers unknown); see `operator-tiers.md`.

| provider | model | cost | tier | source date |
|---|---|---|---|---|
| telnyx | metered | NOT_MEASURED; SMS = parts x ($0.004 + carrier fee) | tier assumed: Pay-as-you-go | 2026-10-14 |
| twilio | metered | NOT_MEASURED; SMS = segments x ($0.0083 + carrier fee); lookup $0.008 with carrier | tier assumed: Pay-as-you-go | 2026-10-14 |
| namesilo | metered | NOT_MEASURED; register = years x getPrices price | tier assumed: pre-funded balance | 2026-10-14 |
| stability | metered | NOT_MEASURED; credits x $0.01 (Core 3 credits) | tier assumed: pay-as-you-go credits | 2026-10-14 |
| hf_inference | metered | NOT_MEASURED; compute seconds x hardware $/s | tier assumed: Free account + purchased credits | 2026-10-14 |
| assemblyai | metered | NOT_MEASURED; audio hours x $0.15 (Universal-2) / $0.21 (3.5 Pro) | tier assumed: pay-as-you-go | 2026-10-14 |
| amadeus | metered | NOT_MEASURED; per-endpoint price unreadable | tier assumed: Self-Service free quota then pay-per-call | 2026-10-14 |
| browserbase | metered | NOT_MEASURED; browser hours x $0.12 beyond 100 included | tier assumed: Developer | 2026-10-14 |
| api2pdf | metered | NOT_MEASURED; $0.001/MB + $0.00019551/s + $1/mo | tier assumed: pay-per-use | 2026-10-14 |
| resend | free_tier | $0 (3,000/month, 100/day, no overage) | tier assumed: Free | 2026-10-14 |
