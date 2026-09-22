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
