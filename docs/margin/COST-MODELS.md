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
| spider | metered | NOT_MEASURED; GB x $1 + CPU min x $0.0001 | tier assumed: Pay as you go | 2026-10-14 |
| diffbot | free_tier | $0 (10,000 credits/month) | tier assumed: Free | 2026-10-14 |
| exa | free_tier | $0 ($10 monthly credit, 2,500 instant searches) | tier assumed: Free | 2026-10-14 |
| tavily | free_tier | $0 (1,000 credits/month) | tier assumed: Free | 2026-10-14 |
| serper | flat | $0.001 ($50 / 50k credits) | tier assumed: Starter pack | 2026-10-14 |
| twitterapi | metered | NOT_MEASURED; items x $0.00015 per tweet, min $0.00015 per call | tier assumed: pay-as-you-go credits | 2026-10-14 |
| zerobounce | flat | $0.0195 ($39 / 2,000) | tier assumed: Pay as You Go | 2026-10-14 |
| email_verify | metered | NOT_MEASURED; credits x pool rate ($129/month pool) | tier assumed: pay-as-you-go credit pool | 2026-10-14 |
| whoisxml | metered | NOT_MEASURED; credits x pool rate ($129/month pool) | tier assumed: pay-as-you-go credit pool | 2026-10-14 |
| whoisjson | free_tier | $0 (1,000 requests/month) | tier assumed: Basic (free) | 2026-10-14 |
| convertapi | metered | NOT_MEASURED; conversions x per-conversion price (unpublished) | tier assumed: Developer / top-up | 2026-10-14 |
| apiflash | flat | $0.007 ($7 / 1,000) | tier assumed: Lite | 2026-10-14 |
| ocrspace | free_tier | $0 (25,000/month, 500/day/IP) | tier assumed: Free | 2026-10-14 |
| canopy | flat | $0.01 (PAYG per provider-limits.json, not re-verified) | tier assumed: pay-as-you-go | 2026-10-14 |
| theirstack | metered | NOT_MEASURED; results x credits x $0.0327 | tier assumed: API $49/month | 2026-10-14 |
| usrealestate | metered | NOT_MEASURED; RapidAPI price unreadable | tier assumed: RapidAPI BASIC | 2026-10-14 |
| audd | flat | $0.005 ($5 / 1,000) | tier assumed: $5/month base plan | 2026-10-14 |
| ipqs | free_tier | $0 (1,000 lookups/month) | tier assumed: Free | 2026-10-14 |
| hunter | flat | $0.0245 ($49 / 2,000) | tier assumed: Starter | 2026-10-14 |
| 17track | metered | NOT_MEASURED; register = quota units x package price | tier assumed: Free plan, paid unpriced | 2026-10-14 |
| zyte | metered | NOT_MEASURED; $0.00013-$0.00127 per HTTP response, browser $0.00101-$0.01608 | tier assumed: Pay as you go | 2026-10-14 |
| abr | free_tier | $0 (free GUID, no stated limit) | tier assumed: Free GUID registration | 2026-10-14 |
| adbkidb | free | $0 (no key) | tier assumed: Public API, no key | 2026-10-14 |
| adzuna | free_tier | $0 (250/day) | tier assumed: Free key | 2026-10-14 |
| africa | free_tier | $0 (1,000/month) | tier assumed: Free | 2026-10-14 |
| airnow | free_tier | $0 (500/hour) | tier assumed: Free EPA API key | 2026-10-14 |
| apisports | free_tier | $0 (100/day) | tier assumed: Free | 2026-10-14 |
| autodev | metered | NOT_MEASURED; first 1,000 calls/month free then usage-based, price unpublished | tier assumed: Starter / Free | 2026-10-14 |
| aviasales | free_tier | $0 (token, per-minute caps) | tier assumed: Free partner token | 2026-10-14 |
| avwx | free_tier | $0 (1,000/month) | tier assumed: Hobby (free) | 2026-10-14 |
| balldontlie | free_tier | $0 (5 req/min) | tier assumed: Free (Basic data, 1 sport) | 2026-10-14 |
| banxico | free_tier | $0 (free token) | tier assumed: Free SIE token | 2026-10-14 |
| bea | free_tier | $0 (free key) | tier assumed: Free UserID key | 2026-10-14 |
| bhl | free_tier | $0 (free key) | tier assumed: Free API key | 2026-10-14 |
| bls-macro | free_tier | $0 (500/day) | tier assumed: API v2 registered key (free) | 2026-10-14 |
| calendarific | free_tier | $0 (500/month) | tier assumed: Free | 2026-10-14 |
| checkwx | free_tier | $0 (200/day) | tier assumed: Trial Plan (free) | 2026-10-14 |
| coingecko | free_tier | $0 (10,000/month) | tier assumed: Demo (free) | 2026-10-14 |
| comtrade | free_tier | $0 (500/day) | tier assumed: Free key | 2026-10-14 |
| congress | free_tier | $0 (5,000/hour) | tier assumed: Free api.data.gov key | 2026-10-14 |
| copernicus-sentinel | free_tier | $0 (50,000 requests/month, then throttled) | tier assumed: Free account | 2026-10-14 |
| cordis | free | $0 (no key) | tier assumed: Public API, no key | 2026-10-14 |
| courtlistener | free_tier | $0 (5/min, 50/hour, 125/day) | tier assumed: Free authenticated token | 2026-10-14 |
| currents | free_tier | $0 (250/day) | tier assumed: Developer (free) | 2026-10-14 |
| currentuvindex | free | $0 (no key, 500/day/IP) | tier assumed: Public API, no key | 2026-10-14 |
| destatis | free | $0 (free of charge, no registration) | tier assumed: Public API, no key | 2026-10-14 |
| device | metered | NOT_MEASURED; plan fee / included Tuya API calls (trial 26,000/month) | tier assumed: IoT Core trial / paid plan | 2026-10-14 |
| dhl | free_tier | $0 (250/day, 1 call per 5 s) | tier assumed: Initial-development key (free) | 2026-10-14 |
| dpla | free_tier | $0 (free key, no stated limit) | tier assumed: Free key | 2026-10-14 |
| ecdc-surveillance | free | $0 (no key) | tier assumed: Public open data, no key | 2026-10-14 |
| echo | free_tier | $0 (no limit stated on page) | tier assumed: Public, no key | 2026-10-14 |
| eia | free_tier | $0 (free key) | tier assumed: Free API key | 2026-10-14 |
| ensembl | free | $0 (no key, 55,000/hour) | tier assumed: Public API, no key | 2026-10-14 |
| exchangerate | free_tier | $0 (1,500/month) | tier assumed: Free | 2026-10-14 |
| fatsecret | free_tier | $0 (5,000/day, attribution required) | tier assumed: Basic (free) | 2026-10-14 |
| fbi | free_tier | $0 (1,000/hour) | tier assumed: Free api.data.gov key | 2026-10-14 |
| fcc | free_tier | $0 (1,000/hour for ECFS; geo lookup keyless) | tier assumed: Free api.data.gov key | 2026-10-14 |
| fda_openfda | free_tier | $0 (1,000/day no key, 120,000/day with key) | tier assumed: No key / free key | 2026-10-14 |
| fec | free_tier | $0 (1,000/hour) | tier assumed: Free api.data.gov key | 2026-10-14 |
| figi | free_tier | $0 (20/min with key) | tier assumed: Free key | 2026-10-14 |
| firms | free_tier | $0 (5,000 transactions / 10 min) | tier assumed: Free MAP_KEY | 2026-10-14 |
| geo | free_tier | $0 (3,000 credits/day, soft limit) | tier assumed: Free | 2026-10-14 |
| geocodio | free_tier | $0 (2,500 lookups/day; $0.001 above if card attached) | tier assumed: Free | 2026-10-14 |
| geonames | free_tier | $0 (20,000 credits/hour) | tier assumed: Free registered account | 2026-10-14 |
| gfw | free_tier | $0 (50,000/day) | tier assumed: Free API token | 2026-10-14 |
| github-api | free_tier | $0 (5,000/hour) | tier assumed: Free account PAT | 2026-10-14 |
| global-health-covid | free | $0 (public bucket, no key) | tier assumed: Public, no key | 2026-10-14 |
| gus-poland | free_tier | $0 (anonymous quota, ~80-100/hour) | tier assumed: Anonymous | 2026-10-14 |
| health | free_tier | $0 (1,000/hour) | tier assumed: Free api.data.gov key | 2026-10-14 |
| ibanapi | free_tier | $0 (100 basic + 20 bank credits/30 days) | tier assumed: Free | 2026-10-14 |
| inaturalist | free_tier | $0 (100/min, 10,000/day) | tier assumed: Anonymous | 2026-10-14 |
| indec-georef | free | $0 (no key, 3,000,000/day) | tier assumed: Public API, no key | 2026-10-14 |
| insee | free_tier | $0 (30/min, 500,000/month) | tier assumed: Free public plan | 2026-10-14 |
| ipapi | free_tier | $0 (1,000/day with free key) | tier assumed: Free | 2026-10-14 |
| iqair | free_tier | $0 (5/min, 500/day, 10,000/month) | tier assumed: Community (free) | 2026-10-14 |
| irctc | metered | NOT_MEASURED; RapidAPI price unreadable | tier assumed: RapidAPI BASIC | 2026-10-14 |
| irena | free | $0 (no key) | tier assumed: Public API, no key | 2026-10-14 |
| jobs | free_tier | $0 (BLS 500/day) | tier assumed: Free registered keys | 2026-10-14 |
| jooble | free_tier | $0 (500 requests default) | tier assumed: Free key | 2026-10-14 |
| langbly | metered | NOT_MEASURED; characters x $0.000005 beyond 500K/month included | tier assumed: Pay-as-you-go | 2026-10-14 |
| launch-library-2 | free_tier | $0 (15/hour anonymous) | tier assumed: Free anonymous | 2026-10-14 |
| listennotes | free_tier | $0 (150/month) | tier assumed: Free | 2026-10-14 |
| materials-project | free_tier | $0 (25/sec, 640K/day) | tier assumed: Free API key | 2026-10-14 |
| mbta-transit | free_tier | $0 (500/day, 20/min no key) | tier assumed: Free API key | 2026-10-14 |
| met-norway | free | $0 (no key, User-Agent only) | tier assumed: Public API, no key | 2026-10-14 |
| meteostat | free | $0 (no key) | tier assumed: Public data dumps, no key | 2026-10-14 |
| nasa | free_tier | $0 (1,000/hour) | tier assumed: Free api.nasa.gov key | 2026-10-14 |
| ncei | free_tier | $0 (1,000/day) | tier assumed: Free CDO token | 2026-10-14 |
| newsdata | free_tier | $0 (200 credits/day) | tier assumed: Free | 2026-10-14 |
| norgesbank | free | $0 (no key) | tier assumed: Public API, no key | 2026-10-14 |
| nrel | free_tier | $0 (1,000/hour) | tier assumed: Free developer key | 2026-10-14 |
| nvd | free_tier | $0 (50 per 30 s with key) | tier assumed: Free API key | 2026-10-14 |
| oecd-stats | free | $0 (no key) | tier assumed: Public API, no key | 2026-10-14 |
| openaire | free | $0 (no key, 60/hour) | tier assumed: Public Graph API, no key | 2026-10-14 |
| openalex | free_tier | $0 (daily credit budget, free key 10x) | tier assumed: No key / free key | 2026-10-14 |
| opendota | flat | $0.0001 (premium $0.0001/call) | tier assumed: Premium key | 2026-10-14 |
| openfda_devices | free_tier | $0 (1,000/day no key, 120,000/day key) | tier assumed: No key / free key | 2026-10-14 |
| openmeteoaq | metered | NOT_MEASURED; plan fee / included calls, commercial plan price unpublished | tier assumed: free non-commercial access | 2026-10-14 |
| openstates | free_tier | $0 (500/day, 10/min) | tier assumed: Free | 2026-10-14 |
| opentopodata | free | $0 (no key, 1 req/s) | tier assumed: Public API, no key | 2026-10-14 |
| opentopography | free_tier | $0 (5,000/day) | tier assumed: Free registered key | 2026-10-14 |
| openweathermap | free_tier | $0 (60/min, 1,000,000/month) | tier assumed: Free | 2026-10-14 |
| overpass | free | $0 (no key, 2 concurrent queries) | tier assumed: Public API, no key | 2026-10-14 |
| pexels | free_tier | $0 (200/hour, 20,000/month) | tier assumed: Free key | 2026-10-14 |
| rateapi | free_tier | $0 (20/month; Pro $49 for 100) | tier assumed: Free | 2026-10-14 |
| regulations | free_tier | $0 (1,000/hour) | tier assumed: Free api.data.gov key | 2026-10-14 |
| sam | free_tier | $0 (1,000/day with SAM role) | tier assumed: Free personal API key | 2026-10-14 |
| shortio | free_tier | $0 (1,000 links, 50 req/s) | tier assumed: Free | 2026-10-14 |
| smithsonian | free_tier | $0 (1,000/hour) | tier assumed: Free api.data.gov key | 2026-10-14 |
| spoonacular | free_tier | $0 (50 points/day) | tier assumed: Free | 2026-10-14 |
| statcan | free | $0 (no key, 25 req/s per IP) | tier assumed: Public API, no key | 2026-10-14 |
| thesportsdb | free_tier | $0 (30/min) | tier assumed: Free (public key 3) | 2026-10-14 |
| threatintel | metered | NOT_MEASURED; credits x unpublished price per credit (1 credit/call, full reputation 3); provider retired | tier assumed: Free trial 100 credits then pay-per-credit | 2026-10-14 |
| ticketmaster | free_tier | $0 (5,000/day, 5/s) | tier assumed: Free API key | 2026-10-14 |
| transport-rest | free | $0 (no key, 100/min) | tier assumed: Public API, no key | 2026-10-14 |
| tvmaze | free | $0 (no key, 20 per 10 s) | tier assumed: Public API, no key | 2026-10-14 |
| unhabitat | free | $0 (no key) | tier assumed: Public API, no key | 2026-10-14 |
| upcitemdb | free_tier | $0 (100/day; DEV $99/month) | tier assumed: Free EXPLORER | 2026-10-14 |
| usajobs | free_tier | $0 (free key) | tier assumed: Free API key | 2026-10-14 |
| walkscore | free_tier | $0 (5,000/day) | tier assumed: Free | 2026-10-14 |
| weatherapi | free_tier | $0 (100K/month) | tier assumed: Free | 2026-10-14 |
| wto | free_tier | $0 (10,000/hour) | tier assumed: Free subscription key | 2026-10-14 |
| zenodo | free | $0 (no key, 60/min guest) | tier assumed: Public API, no key | 2026-10-14 |
