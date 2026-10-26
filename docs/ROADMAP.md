# Roadmap

Machine-checkable log of planned/shipped/dropped changes that affect what an AI agent
using APIbase can **do** or **see** (new tools, new discovery surfaces, new response
fields, new guarantees). It does not list internal refactors, ops runbooks, or anything
that doesn't change agent-visible behavior.

Format, enforced by `sync-counts.sh --check`'s `STALE_ROADMAP` gate (fatal):

```
[PLANNED|IN PROGRESS T-NNNN|SHIPPED YYYY-MM-DD <sha>|DROPPED YYYY-MM-DD <reason>] Q<N> — <one line>
```

Each real entry below is that bracket/status/code/text shape prefixed with a markdown
list dash (`- `).

A line is never deleted — only its status changes, to `SHIPPED <date> <sha>` (sha must
resolve in this repo) or `DROPPED <date> <reason>`. `Q<N>` is this roadmap's own running
line number, not an external ticket ID; the spec item code each line traces back to
(e.g. `P-1`, `GH-1`) is named in the one-line text for cross-reference to
`03-SPECIFICATION.md` (`~/taskloop/briefs/out/03-SPECIFICATION.md`).

First population (2026-09-22): every P0-P2 item in that Specification. Status per line:
each line carries its own status, and a SHIPPED line names the commit that shipped it. P3
items (blocked on an operator threshold — R-3, SVC-6) are intentionally not listed here;
they enter this roadmap only once unblocked.

Last reviewed: 2026-10-26

## P0

- [SHIPPED 2026-09-15 66f526a3] Q1 — P-1: `apibase.discover` MCP tool + `GET /api/v1/discover`, single discovery contract replacing the unreachable MCP prompt
- [SHIPPED 2026-09-15 c4a6455a] Q2 — P-2: unified `tools.category` taxonomy, single source of truth (closes GitHub #282)
- [SHIPPED 2026-09-15 f990408d] Q3 — M-2: `SERVER_INFO` version/description read from `package.json`, no more hardcoded tool/provider counts
- [SHIPPED 2026-09-15 b1ef6ea8] Q4 — T-2: `buildToolQuality()` builder replaces zero-fabrication in quality adapters (`null` instead of `0` for unmeasured tools, `MGET` replaces `KEYS`)
- [SHIPPED 2026-09-22 8433a6b6] Q5 — R-1: rename "cross-provider routing" to "health-aware routing" everywhere (honest KEEP wording, no overclaim)
- [SHIPPED 2026-09-15 391ea390] Q6 — Q-1: single live `quality` field on `ToolCatalogEntry` (provider score + tool success_rate/p50/p95, from one builder)
- [SHIPPED 2026-09-22 85833ed8] Q7 — D-2: remove hardcoded tool/provider counts from `server.json`, both npm `package.json` files, and `SERVER_INFO`; extend `sync-counts.sh --check`/`check-external-listings.sh` to all 6 tracked registries (the remaining `provek.json` count: T-0539)
- [PLANNED] Q8 — WEB-2: verifiability-test rule applied to every public page (no present-tense claim without a checkable source)
- [SHIPPED 2026-09-22 8433a6b6] Q9 — POS-1: canonical positioning sentence as the single source for README/llms.txt/GitHub/registries
- [PLANNED] Q10 — POS-2: forbidden-phrase gate blocking unshipped-capability claims ("capability layer", "intelligent/smart routing", "automatic failover/fallback", "best provider", ...) across all lead surfaces
- [SHIPPED 2026-09-22 277a827e] Q11 — SVC-1: remove the unreachable balance-discount claim from `static/llms.txt`
- [SHIPPED 2026-09-21 18cc5b81] Q12 — DOC-2 (public part): remove hardcoded "13-stage" pipeline-stage count from public copy (`static/index.md`, `devto-article-1.md`)

## P1

- [PLANNED] Q13 — R-2: equivalents registry (`capability`/`scope`/`same_upstream_as` on ~55 tools) + advisory `alternatives[]` on tool detail responses
- [PLANNED] Q14 — REL-3: mark same-upstream duplicate providers so they are never offered as a false alternative
- [PLANNED] Q15 — UX-1: `alternatives[]` surfaced in every 503/502/504 error body and MCP `isError` content
- [PLANNED] Q16 — P-3: capability registry as data (`config/capabilities.yaml`, ≤10 entries in the first version)
- [PLANNED] Q17 — PAY-1: `fresh: true` reserved field — freshness as a declared, priced contract, not in the cache key
- [SHIPPED 2026-09-22 a11ca5f8] Q18 — D-3: `/why` page + 3 intent-answer pages (the other §2.10 queries are covered by `/why`, per a11ca5f8) + `docs/discoverability-log.md` measurement, with a built-in T+30/T+60 stop rule
- [SHIPPED 2026-09-22 011120ba] Q19 — POS-3: this roadmap (`docs/ROADMAP.md`), machine-checkable format
- [PLANNED] Q20 — MKT-1: single set of allowed claims for content skills (devto/reddit/farcaster/awesome-lists)
- [SHIPPED 2026-09-22 85833ed8] Q21 — DOC-1: `docs/OPERATOR-ACTION-registry-listings.md`, single index of account-bound registry actions
- [SHIPPED 2026-10-13 038aff37] Q22 — DOC-2 (internal part): remove hardcoded "13-stage" wording from internal comments and docs (now "14-stage (STAGE_NAMES, src/pipeline/types.ts)")
- [SHIPPED 2026-09-22 011120ba] Q23 — GH-1: GitHub repo description + topics aligned to canonical positioning
- [PLANNED] Q24 — SVC-2: internal demand audit of `execution_ledger` (read-only, informs future Services decisions)

## P2

- [PLANNED] Q25 — P-4: composite/bundle tools, gated behind measured demand (≥50 co-call events/30d from ≥10 distinct `agent_id`s, cost-model coverage on every component)
- [PLANNED] Q26 — M-3: cursor pagination for `tools/list`, flagged for a separate design pass before it enters an Implementation Plan
- [PLANNED] Q27 — PAY-2: rail-neutral cache-hit price, so x402/MPP payers reach the same HIT discount prepaid balance already gets
- [PLANNED] Q28 — UX-2: extend existing self-correcting error hints (`expected_params`/`hint`) to every error path, not just today's subset
- [PLANNED] Q29 — MKT-2: named competitor comparisons on `/why`, using the competitor table already in `03-SPECIFICATION.md`

## Shipped after the first population

- [SHIPPED 2026-10-20 447b194f] Q30 — A-GA-01: public immutable receipt `GET /r/<id>.json` (`apibase-receipt/1`) for every on-chain-billed call
- [SHIPPED 2026-10-19 61c53366] Q31 — T-0500: `definition_sha256` per tool (REST field + MCP `tools/list` `_meta`) and `GET /api/v1/tools/manifest` with ETag
- [SHIPPED 2026-10-19 00e3946b] Q32 — T-0429: x402 over MCP (`_meta` payment transport, MPP `Payment-Authorization` header, `maxTimeoutSeconds` 120)
- [SHIPPED 2026-10-12 4b8114e7] Q33 — Integrator (v1.7.0): a merchant gets its own MCP storefront, a buyer's agent pays in USDC straight to the merchant wallet
- [SHIPPED 2026-10-26 7a59a1a9] Q34 — T-0526: same-wallet repeated cacheable read within 120 s on x402 is answered from cache and not charged
- [SHIPPED 2026-10-26 d736ed71] Q35 — T-0525: payment-identifier 409 carries `Retry-After`/`retry_after`, `order_id` and the conflict reason
