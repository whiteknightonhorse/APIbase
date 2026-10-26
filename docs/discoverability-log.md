# Discoverability log (D-3 / track W, ZZ-03-12)

Tracks whether the nine realistic agent-discovery search queries from
`~/taskloop/briefs/out/02-RESEARCH.md` §2.10 start finding `apibase.pro` after the W1/W2
content (`/why`, the intent-answer pages) ships. This is a measurement log, not a CI gate —
nothing here is enforced by `sync-counts.sh`.

**Method** (unchanged from the §2.10 baseline, so results are comparable): each of the nine
query strings below run as a `WebSearch` query, one at a time. For each, record whether
`apibase.pro` (any page) appears in the first 8-9 organic results — yes/no — and, if yes,
which page. No prompting of a third-party LLM (no API access to one from this environment);
`WebSearch` is a search-engine result set, a proxy for "what's indexed/ranked", not identical
to "what an LLM would recommend" — same limitation noted in §2.10, not re-litigated here.

## The nine queries

1. I need access to multiple external APIs through one MCP endpoint
2. pay-per-use API infrastructure for autonomous AI agent
3. I need an MCP server that provides many external APIs
4. flight search API without integrating individual providers
5. image generation APIs with pay-per-call access for AI agents
6. I need a reliable external API provider for an autonomous agent
7. I need to discover tools for company research
8. API gateway for AI agents with machine-native payments
9. I need to search for an external capability rather than install individual MCP servers

## Stop rule (W5, fixed at task creation — not to be renegotiated per-measurement)

- **T+30** (2026-10-14): informational re-measurement, logged below, no decision attached.
- **T+60** (2026-11-13): decision point. **≥3/9** queries surfacing `apibase.pro` → track
  continues (more W2 intent pages / iteration allowed). **<3/9** → track stops; the content
  approach in `03-SPECIFICATION.md` §D-3 goes back to Fable for hypothesis reconsideration,
  not automatic continuation.

## Measurements

### 2026-09-14 — baseline (pre-W1/W2, from §2.10)

| # | Query | apibase.pro in top 8-9? |
|---|---|---|
| 1 | multiple external APIs through one MCP endpoint | No |
| 2 | pay-per-use API infrastructure for autonomous AI agent | No |
| 3 | MCP server that provides many external APIs | No |
| 4 | flight search API without integrating individual providers | No |
| 5 | image generation APIs with pay-per-call access for AI agents | No |
| 6 | reliable external API provider for an autonomous agent | No |
| 7 | discover tools for company research | No |
| 8 | API gateway for AI agents with machine-native payments | No |
| 9 | search for an external capability rather than install individual MCP servers | No |

**Score: 0/9.** Recorded before any W1/W2 content existed — this is the pre-treatment
baseline the T+30/T+60 measurements are compared against, not a measurement of the shipped
pages themselves.

### 2026-10-14 — T+30 (pending)

Not yet due. Re-run all nine queries verbatim, record here in the same table shape.

### 2026-11-13 — T+60 (pending, decision point)

Not yet due. Re-run all nine queries verbatim. If score is <3/9, stop the track and hand the
result to Fable per the rule above instead of continuing unilaterally.

## T-0430 — Bazaar content policy and MPP discovery offers (2026-10-19)

What the Coinbase Bazaar needs from a seller (docs.cdp.coinbase.com/x402/seller/get-discovered, metadata content policy):

- Tool descriptions, service metadata and discovery strings must read as plain descriptions, never as instructions to the agent. Gate: `src/utils/description-policy.ts` (phrase list), `tests/unit/description-content-policy.test.ts`, CLI `npx ts-node scripts/check-description-policy.ts`. The same rule rejects merchant catalog descriptions with `422 description_reads_as_instruction`.
- Service metadata on the discovery extension: `serviceName: 'APIbase'`, `tags: [<tool category>, 'mcp', 'api']`, `iconUrl: https://apibase.pro/icon.png`; the description is the tool's own description. Note: `declareDiscoveryExtension` (@x402/extensions 2.28, MCP transport) does not currently copy these three fields into the extension body; they are passed so a future SDK picks them up.
- Indexing happens ONLY through CDP-facilitated settles. Production runs `X402_FACILITATOR_MODE=local`, so the catalog is not indexed by design; switching a CDP facilitator on is an operator decision (money: 1000 free tx/month, then $0.001).

MPP discovery offers: superseded by T-0520 — root document carries no offers; see below.

## T-0520 — root discovery doc under 1 MiB, offers[] only in the full doc (2026-10-22)

isitagentready.com reads at most 1 MiB of the decoded `/openapi.json`; the root doc had grown to 1,284,909 bytes and was cut mid-string ("not valid JSON"). mppx `Discovery.js` refuses to mix `offers` with the flat fields (`Cannot mix offers with flat payment info fields`), so the two documents now differ:

| document | x-payment-info on a paid operation |
|---|---|
| `static/.well-known/openapi-discovery.json` (served at `/openapi.json`) | flat single-offer form: `amount`, `currency`, `intent: charge`, `method: tempo`, `description`, plus `protocols`, `pricingMode`, `price`; no `offers` |
| `static/.well-known/openapi.json` (full) | `offers[]` only (tempo chainId 4217 + evm chainId 8453) plus `protocols`, `pricingMode`, `price`; no flat spec keys |

Both are built from the same `amountMicro`, so amounts equal the 402 challenge. Root doc: `requestBody` and responses are `$ref`s into `components`; 1,284,909 -> 761,334 bytes (~549 B per operation). Gate: `scripts/discovery-size-gate.ts` fails `generate-openapi.ts` (and so `--check` and `sync-counts.sh --check`) above 900,000 bytes and warns above 800,000.

Ceiling: ~1640 tools at 900,000 B. The target of headroom for 2000 tools is unreachable with the flat contract (even dropping `protocols`/`pricingMode`/`price` gives ~962 KB at 2000). Next cut: drop those three extras (+~230 tools) or shorten `summary`. Open that task when `--check` first prints the 800 KB warning (~1460 tools).
