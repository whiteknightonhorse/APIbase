# Internal Demand Audit — SVC-2 / S-0

Appendix to `03-SPECIFICATION.md` §17 SVC-2 (`~/taskloop/briefs/out/03-SPECIFICATION.md`).
Not code — a measured snapshot replacing the prior UNKNOWN about real catalog usage.
Read-only `execution_ledger`/`tools` queries against `apibase-postgres-1`, this revision run
2026-09-22 04:11-04:12 UTC (`SELECT NOW()`, `attempt2_now.txt`). Every number below is the
direct output of the query printed above it; nothing here is estimated. All tables in this
revision come from one consistent back-to-back query pass (attempt-2), not mixed with the
attempt-1 snapshot — this is live production data and counts drift by the minute.

## Revision note (attempt 2, fixes attempt-1 REJECT)

Attempt 1 was rejected because §1/§3/§4/§5 counted **all** PAID rows in the window, while §2's
classification and its "36 of 36 payers, zero rows unclassified" claim covered only rows where
`payer IS NOT NULL`. Rows with `payer IS NULL` (5,520 of 58,254 PAID calls, 90d — 9.5% of
volume, $7.50 of $70.04 revenue) were silently inside the §1/§3/§4/§5 totals but outside the §2
classification and outside the text's "zero unclassified" claim. Fixed here by:

1. §1 now splits every total into *with payer* / *without payer* instead of one blended number.
2. New §2b classifies the `payer IS NULL` population by `agent_id` (the only identity available
   on those rows), using the same disclosed-signature approach as §2.
3. §3/§4/§5 headers now say explicitly that they aggregate the full PAID population (with and
   without payer) — the second option the reviewer offered, since re-deriving §3-5 under a
   `payer IS NOT NULL` filter would answer a different question (tool/provider popularity, not
   payer classification) than the one those sections exist to answer.
4. §6 (S-0 threshold) already excluded `payer IS NULL` rows structurally — that query groups by
   `payer`, so a null payer can never form a group — and §2b confirms this exclusion doesn't hide
   anything material: see "Why §2b can't change the S-0 verdict" below.

## Disclosed gap: no literal "7 test wallets" list exists

The Specification and `05-PROPOSED-FLEET-TASKS.md` both say to exclude "7 тестовых
кошельков оператора". No file in this repo, `~/taskloop/`, or the operator's Claude
Code memory (`~/.claude/projects/-home-apibase-apibase/memory/`) records seven literal
wallet addresses. What exists instead:

- `~/.claude/skills/bot-baseline/SKILL.md` names **7 external wallet-bots (Wallet-1..
  Wallet-7)** by role only, no addresses.
- One wallet address is documented anywhere in memory: `0xe03D9423D06dd5E3300Fb1c09a03ddBB5E8B274b`,
  the MCP Protocol Tester's wallet (`reference_mcp_protocol_tester.md`), a *separate*
  documented test system, not one of the 7 bot-baseline wallets.

Rather than guess which 7 of the payer addresses below are the named bot-baseline
wallets, this report classifies **every** payer in the window using an objective,
disclosed signature instead, and shows the result: the objective classification flags
*more* than 7 addresses as test/internal traffic, and — this is the actual finding —
it flags **all of them**. See "S-0 threshold check" below for why the exact mapping to
"7" turns out not to matter for the acceptance criteria this table feeds.

## Exclusion methodology applied to §2 (payer-bearing rows)

| Signal | Why it means test/internal, not an organic agent |
|---|---|
| `payer` is a literal placeholder string (`unknown-mpp-payer`, `tempo-agent`) | Not a wallet address at all — a pipeline fallback value written when the MPP payer couldn't be extracted. Real external traffic cannot produce this string. |
| One payer's `COUNT(DISTINCT tool_id)` over 90d is ≥ 50 (≈4% of the 1384-tool catalog) | No organic agent building on APIbase calls hundreds of unrelated tools across every category; this is the signature of a smoke/regression run walking the catalog. |
| One payer's `COUNT(DISTINCT tool_id)` over 90d is exactly 7, with low absolute volume (≤120 calls) and a first-seen clustered on 2026-07-06 or 2026-07-13 | An 18-wallet cluster, each touching a fixed 7-tool canary set, first appearing on one of two days — a scripted regression sweep with rotating wallets, not independent organic agents. |

§2b (rows with no `payer` value at all) uses a parallel `agent_id`-based version of the same
approach, since these rows have nothing else to key on — see that section for its own signals.

## 1. Volume summary

| Window | All PAID calls | — with payer | — without payer (`payer IS NULL`) | Revenue, all PAID | Distinct payer values |
|---|---:|---:|---:|---:|---:|
| Trailing 30d | 17,263 | 17,232 | 31 | $21.47 | 30 |
| Trailing 90d | 58,254 | 52,734 | 5,520 | $70.04 | 36 |

Source: `attempt2_totals.txt` (all-PAID + distinct-payer counts), `attempt2_nullpayer_30d.txt` /
`attempt2_nullpayer_90d.txt` (without-payer counts and revenue).

## 2. Paid calls by payer wallet, trailing 90d — full breakdown, exclusion reason per row

Population: PAID rows with `payer IS NOT NULL` only — 52,734 of 58,254 calls (90.5% of 90d
volume). The remaining 5,520 calls (9.5%) have no payer value at all and are classified
separately in §2b, not folded into "36 of 36" below.

`SELECT payer, COUNT(*), MIN(created_at), MAX(created_at), COUNT(DISTINCT tool_id) FROM
execution_ledger WHERE created_at > NOW() - INTERVAL '90 days' AND billing_status='PAID'
AND payer IS NOT NULL GROUP BY payer ORDER BY calls DESC;` — raw output:
`/home/apibase/taskloop/logs/0214-zz03-14-demand-s-0/attempt2_payer_full_distribution.txt`

| Payer | Calls 90d | Distinct tools 90d | First seen | Classification |
|---|---:|---:|---|---|
| `0xe03D9423D06dd5E3300Fb1c09a03ddBB5E8B274b` | 12,303 | 477 | 2026-06-29 | **TEST** — documented (MCP Protocol Tester) |
| `unknown-mpp-payer` | 8,280 | 518 | 2026-09-06 | **EXCLUDE — not a wallet** (payer-extraction fallback placeholder) |
| `tempo-agent` | 7,353 | 352 | 2026-06-29 | **EXCLUDE — not a wallet** (payer-extraction fallback placeholder) |
| `0x769439fFDaf4C13d77576Cd3f4dFfbA93AaE2e2c` | 2,124 | 489 | 2026-06-29 | **TEST** — full-catalog signature (≥50 tools) |
| `0x688130810f0BEdE38742b66E7A443274c01D4213` | 2,107 | 484 | 2026-06-29 | **TEST** — full-catalog signature |
| `0x1Eb51C15Eebf9eC76D0e12655335d47E496f04Fd` | 2,088 | 496 | 2026-06-29 | **TEST** — full-catalog signature |
| `0x6B414116d641d9AF479297dAf9892DE91f72b4Cf` | 2,037 | 487 | 2026-06-29 | **TEST** — full-catalog signature |
| `0x18D76291Ec67eb0E90a44353a816fD89A5de6EA4` | 2,021 | 480 | 2026-06-29 | **TEST** — full-catalog signature |
| `0x781DFd3f2687F8e5656313B2179fdEFdf99D339d` | 2,002 | 480 | 2026-06-29 | **TEST** — full-catalog signature |
| `0x46f110B1ad8195aC1E59366149dFc39e3A88638b` | 2,002 | 478 | 2026-06-29 | **TEST** — full-catalog signature |
| `0x03C545A6d6f1254E4bC4fB16dD6898863f0ea0a3` | 1,997 | 491 | 2026-06-29 | **TEST** — full-catalog signature |
| `0xc6AEE9ee80EEab4A9d524A50E10476b7Bd684B04` | 1,971 | 485 | 2026-06-29 | **TEST** — full-catalog signature |
| `0x941c2a1A7e3297F564f664Dd5027FE59621A27e6` | 1,967 | 483 | 2026-06-29 | **TEST** — full-catalog signature |
| `0x672f6B63074e47988084b69a3795701a3f94FF2D` | 1,952 | 488 | 2026-06-29 | **TEST** — full-catalog signature |
| `0xb968DeA0e8bEF38d39Dc2539d8eeFcD383878B14` | 525 | 301 | 2026-09-06 | **TEST** — broad-catalog signature (≥50 tools) |
| `0x5656DcE7D16fC7dEdCe3A6EB02b9C6443dFD08a1` | 506 | 301 | 2026-09-06 | **TEST** — broad-catalog signature |
| `0x5FcBc361e7fb231f558b18DD99Fb15DF42c90310` | 459 | 291 | 2026-09-06 | **TEST** — broad-catalog signature |
| `0xd040adad70B3Bed22CCe174e1F6470FeBF857EbC` | 112 | 7 | 2026-07-06 | **TEST** — fixed-7-tool canary cluster |
| `0x582AAF16F3D7EE391c99f2324fA0c79CFd730838` | 90 | 7 | 2026-07-06 | **TEST** — fixed-7-tool canary cluster |
| `0x18Ca4D4968f3414c8C18A57fb3E047771cc2f483` | 74 | 7 | 2026-07-06 | **TEST** — fixed-7-tool canary cluster |
| `0x1f9EbAFDB698B59E8aF75759C7A9186Da5B0A5B9` | 65 | 7 | 2026-07-13 | **TEST** — fixed-7-tool canary cluster |
| `0x32b0EE0D22d4c01850B8ce4F98eD5A2Ce485367d` | 65 | 7 | 2026-07-06 | **TEST** — fixed-7-tool canary cluster |
| `0xfCf8E26747DC6f0247c3B456439e342E8575e3bC` | 60 | 7 | 2026-07-13 | **TEST** — fixed-7-tool canary cluster |
| `0xA54F03b959Dd48B08785f23AAEAbE244EbC40EA9` | 59 | 7 | 2026-07-06 | **TEST** — fixed-7-tool canary cluster |
| `0xDB2Ed35Bd53e096946ee2a35fE32DF506a5a0081` | 59 | 7 | 2026-07-13 | **TEST** — fixed-7-tool canary cluster |
| `0xFCfDFaD83aa01A47644Fe9032C1e141b6B170B39` | 56 | 7 | 2026-07-06 | **TEST** — fixed-7-tool canary cluster |
| `0x22866b0396Ed6bf71D175264b35aC92dd6B475B5` | 53 | 7 | 2026-07-13 | **TEST** — fixed-7-tool canary cluster |
| `0x21BF85Ad7911ea74A6CC35dAD5d8425EB4d986fE` | 50 | 7 | 2026-07-13 | **TEST** — fixed-7-tool canary cluster |
| `0x6D45cd2fF0b79e5349418488e3D60E82649a1282` | 50 | 7 | 2026-07-06 | **TEST** — fixed-7-tool canary cluster |
| `0xBE1EB00e3E32076450e3aEDF07e0383f96B72E02` | 49 | 7 | 2026-07-13 | **TEST** — fixed-7-tool canary cluster |
| `0x198992291ecF9bf4dE2999E3b7Df346BBE67fba3` | 49 | 7 | 2026-07-06 | **TEST** — fixed-7-tool canary cluster |
| `0x2129b6935b51251386075d10A37C0241888F3b2f` | 46 | 7 | 2026-07-06 | **TEST** — fixed-7-tool canary cluster |
| `0xac13b1bb16a41203eB4742A37fDD108db36EE292` | 36 | 7 | 2026-07-13 | **TEST** — fixed-7-tool canary cluster |
| `0xFfB3cd128C9E18655217004Bd8D5106903f70c08` | 33 | 7 | 2026-07-13 | **TEST** — fixed-7-tool canary cluster |
| `0x879aE248F756078d5e04D8B1a2D78E4E847013D9` | 30 | 7 | 2026-07-06 | **TEST** — fixed-7-tool canary cluster |
| `0x3554523B4FE113ffFbc5884C3eE71e36Ec6D2Ae4` | 4 | 3 | 2026-07-04 | **TEST** — below-threshold single burst, 3 tools in one 4-min session |

**Result (payer-bearing population only): 36 of 36 distinct payers in the trailing-90-day
window classify as test/internal by an objective, disclosed rule.** No payer shows the
ragged, tool-specific repeat pattern an organic integration would leave. This claim covers the
52,734 calls that have a payer value; see §2b for the other 5,520 calls.

## 2b. PAID calls with no payer value (`payer IS NULL`), trailing 90d

`payer` is nullable (see `\d execution_ledger`) and is only populated once the pipeline can
extract a payer identity from the request; 5,520 of 58,254 PAID calls (90d) have no such value
and so cannot appear in §2's payer-keyed table at all. These rows still have an `agent_id`
(not nullable), so this section classifies them by that instead.

Raw output: `attempt2_nullpayer_agent_revenue_90d.txt` (90d breakdown), `attempt2_nullpayer_agent_30d.txt`
(30d call counts per agent), `attempt2_nullpayer_90d.txt` / `attempt2_nullpayer_30d.txt` (population totals).

| `agent_id` | Calls 90d | Revenue | Distinct tools 90d | First seen | Last seen | Classification |
|---|---:|---:|---:|---|---|---|
| `b5759b1e-6ab3-422b-b323-94fb109003c4` | 2,692 | $2.69 | 4 | 2026-06-24 | 2026-06-28 | **PRE-ATTRIBUTION** — entirely before the earliest non-null `payer` row (2026-06-29 05:18 UTC, §2); payer capture wasn't live yet |
| `2659bd4d-b930-4d6f-8b40-976083c05618` | 2,288 | $4.27 | 372 | 2026-06-24 | 2026-06-29 | **PRE-ATTRIBUTION**, full-catalog-sweep signature (372 tools ≈ 27% of catalog) — same shape as §2's full-catalog TEST payers |
| `c0968de8-565f-4016-97a2-62a4c6da54af` | 272 | $0.27 | 7 | 2026-06-26 | 2026-06-26 | **PRE-ATTRIBUTION**, fixed-7-tool canary signature — same shape as §2's canary-cluster TEST payers |
| `7ea830f1-a8a6-4b54-a0e7-b73b93f25001` | 233 | $0.23 | 78 | 2026-06-26 | 2026-06-26 | **PRE-ATTRIBUTION**, broad-catalog signature |
| `00000000-0000-0000-0000-000000000002` | 14 | $0.01 | 8 | 2026-09-02 | 2026-09-06 | **SENTINEL** — all-zero placeholder UUID, not a real agent identity |
| `11111111-1111-4111-8111-111111111105` | 3 | $0.00 | 1 | 2026-09-01 | 2026-09-01 | **SENTINEL** — all-one placeholder UUID pattern |
| `11111111-1111-4111-8111-111111111106` | 1 | $0.00 | 1 | 2026-09-01 | 2026-09-01 | **SENTINEL** — all-one placeholder UUID pattern |
| `6ab70be4-a224-4475-b419-47a8002cf418` | 10 | $0.02 | 3 | 2026-09-02 | 2026-09-02 | **UNRESOLVED** — no sentinel or pre-attribution signature; volume too small (10 calls total) to classify with confidence |
| `87740b8e-c2ae-4c0d-bf5f-0e9563085d39` | 7 | $0.00 | 2 | 2026-06-29 | 2026-09-20 | **UNRESOLVED** — no sentinel or pre-attribution signature; spans nearly 3 months at 2 tools / 7 calls total |

**Result: 5,503 of 5,520 null-payer calls (99.7%) classify as PRE-ATTRIBUTION or SENTINEL test
traffic** under the signals above, all pre-dating or structurally matching §2's test cohort.
The remaining **17 calls (0.3% of the null-payer population, 0.03% of all 90d PAID volume)**
are UNRESOLVED — genuinely ambiguous, disclosed as such rather than forced into either bucket.

**Why §2b can't change the S-0 verdict, regardless of how the UNRESOLVED rows are read:**
SVC-6 (§6 below) requires a **payer wallet value** with ≥100 paid calls in a trailing 30-day
window. Rows with `payer IS NULL` have no wallet value by definition, so §6's query (which
groups by `payer`) already excludes all of §2b's population structurally — that was correct
before this revision, not an oversight. Separately, even reading the two UNRESOLVED
`agent_id`s as generously as possible: their 30-day call counts are 10 and 3 respectively
(`attempt2_nullpayer_agent_30d.txt`) — over 10× below SVC-6's ≥100-calls/30d bar on their own,
before even reaching the "is this a wallet" question. No plausible reclassification of this
17-call slice moves the S-0 conclusion.

## 3. Paid calls by provider × category, trailing 90d (top 40 of 299 total combinations)

Population: **all PAID calls, with and without payer** (see §1 for the split; §2/§2b classify
who made them). "Distinct payers" below counts only rows with a payer value, so it undercounts
by construction for providers touched by null-payer traffic — this is a payer-identity count,
not a call-volume count, and call volume already includes both populations.

Raw output: `/home/apibase/taskloop/logs/0214-zz03-14-demand-s-0/attempt2_provider_category_90d.txt`

| Provider | Category | Calls 90d | Revenue (USD) | Distinct payers |
|---|---|---:|---:|---:|
| usgs-earthquake | world | 12,764 | $12.76 | 17 |
| coingecko | crypto | 957 | $0.96 | 4 |
| polymarket | crypto | 781 | $0.45 | 17 |
| weatherapi | developer | 705 | $0.71 | 21 |
| igdb | entertainment | 636 | $0.64 | 17 |
| rawg | entertainment | 586 | $0.59 | 16 |
| who | health | 572 | $0.57 | 32 |
| music | entertainment | 572 | $1.59 | 17 |
| npm | developer | 563 | $0.56 | 17 |
| disease | health | 553 | $0.55 | 17 |
| climate | weather | 541 | $1.62 | 17 |
| finnhub | finance | 529 | $0.89 | 18 |
| gbif | education | 500 | $0.50 | 17 |
| carbon-intensity-uk | world | 482 | $0.48 | 17 |
| gutendex | education | 479 | $0.48 | 17 |
| finance | finance | 478 | $0.94 | 17 |
| openlibrary | education | 468 | $0.46 | 17 |
| timeapi | developer | 455 | $0.46 | 32 |
| education | education | 453 | $1.02 | 17 |
| nps | travel | 453 | $0.45 | 17 |
| ... | ... | ... | ... | ... (279 more rows in the raw output file) |

Even here the distinct-payer column corroborates §2: single-digit-to-thirties distinct
payers per provider, out of only 36 payer values total in the whole window (plus the 9
`agent_id`s in §2b), each provider touched by a small, mechanically-repeating set — not
organic agents picking their own narrow toolset.

## 4. Top tools by volume, trailing 90d (top 20)

Population: **all PAID calls, with and without payer** (see §1).

Raw output: `/home/apibase/taskloop/logs/0214-zz03-14-demand-s-0/attempt2_top_tools_90d.txt`

| tool_id | Calls 90d | Revenue (USD) |
|---|---:|---:|
| earthquake.feed | 12,425 | $12.425 |
| crypto.trending | 652 | $0.652 |
| wikidata.search | 392 | $0.392 |
| books.search | 336 | $0.335 |
| worldclock.current | 332 | $0.332 |
| who.countries | 318 | $0.314 |
| who.indicators | 243 | $0.243 |
| weatherapi.current | 240 | $0.240 |
| weatherapi.search | 219 | $0.219 |
| weatherapi.forecast | 211 | $0.211 |
| earthquake.search | 188 | $0.188 |
| holidays.by_country | 186 | $0.186 |
| finnhub.quote | 164 | $0.164 |
| rawg.game_search | 163 | $0.163 |
| disease.covid_country | 158 | $0.158 |
| earthquake.count | 151 | $0.151 |
| country.search | 151 | $0.151 |
| igdb.game_search | 148 | $0.148 |
| holidays.next | 148 | $0.148 |
| hf.datasets | 148 | $0.148 |

`earthquake.feed` alone is 21% of all 90d paid calls — consistent with a scheduled poll
(cron-style repeat calls), not ad hoc agent usage.

## 5. Cache HIT/MISS ratio by `cache_status`

Population: **all PAID calls, with and without payer** (see §1).

Raw output: `/home/apibase/taskloop/logs/0214-zz03-14-demand-s-0/attempt2_cache_hitmiss.txt`

| Window | cache_status | Calls | % of window |
|---|---|---:|---:|
| 30d | MISS | 10,391 | 60.19% |
| 30d | HIT | 6,872 | 39.81% |
| 90d | HIT | 31,931 | 54.82% |
| 90d | MISS | 26,323 | 45.18% |

No `SHARED` or null `cache_status` rows in either window. The 90d HIT share is higher than
30d's — consistent with the full-catalog sweep cohort (first-seen 2026-06-29, §2) aging
into more re-hits as their 90d window includes more repeat traffic than the newer
2026-09-06 cohort dominating the 30d window.

## 6. S-0 threshold check (SVC-6 gate)

Spec text (`03-SPECIFICATION.md` §17 SVC-6): volume commitments stay blocked until S-0 shows
**≥5 external payer wallets (excluding the 7 test wallets) with ≥100 paid calls in a trailing
30-day window.**

This query groups by `payer`, so `payer IS NULL` rows (§2b) are structurally excluded from
this result — not a gap, since S-0 is defined in terms of *wallets*, and null rows carry no
wallet value. See "Why §2b can't change the S-0 verdict" above for why that population
couldn't meet the bar even under a generous reading of its `agent_id` proxy.

Query — join 30d call counts to 90d tool-diversity, apply §"Exclusion methodology", explicit output:
`/home/apibase/taskloop/logs/0214-zz03-14-demand-s-0/attempt2_s0_threshold_check.txt`

```sql
WITH profile_90d AS (
  SELECT payer, COUNT(DISTINCT tool_id) AS distinct_tools_90d
  FROM execution_ledger
  WHERE created_at > NOW() - INTERVAL '90 days' AND billing_status='PAID' AND payer IS NOT NULL
  GROUP BY payer
),
calls_30d AS (
  SELECT payer, COUNT(*) AS calls_30d
  FROM execution_ledger
  WHERE created_at > NOW() - INTERVAL '30 days' AND billing_status='PAID' AND payer IS NOT NULL
  GROUP BY payer
)
SELECT c.payer, c.calls_30d, p.distinct_tools_90d
FROM calls_30d c JOIN profile_90d p USING (payer)
WHERE c.calls_30d >= 100
  AND p.distinct_tools_90d < 50
  AND c.payer NOT IN ('unknown-mpp-payer','tempo-agent')
ORDER BY c.calls_30d DESC;
```

**Result: 0 rows.**

**S-0 verdict: threshold not met — not close.** Not "5 wallets, need one more": zero payers
in the entire 90-day window fall outside the test/internal signature at all, at any call
count, and the null-payer population (§2b) can't move this even in the most generous reading
of its two UNRESOLVED rows. SVC-6 (volume commitments) stays blocked on this gate; re-run this
exact query before revisiting that threshold.

## Reproduction

All raw query output lives under
`/home/apibase/taskloop/logs/0214-zz03-14-demand-s-0/attempt2_*.txt`, generated
2026-09-22 04:11-04:12 UTC by `docker exec apibase-postgres-1 psql -U apibase -d apibase -c
"<query>"` against the live production database, read-only, in one consistent back-to-back
pass. No writes were made to any table. (Attempt-1's `attempt1_*.txt` files remain on disk for
audit trail but are superseded by attempt-2's numbers throughout this document.)
