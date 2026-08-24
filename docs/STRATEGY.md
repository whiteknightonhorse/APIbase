# APIbase.pro — Strategy

_Author: Fable (systems architect audit, 2026-08-24). Executable directions only — no aspirations without an owner-facing "done when"._

Current state: 1108 tools / 307 providers, single Hetzner box, x402 (Base) + MPP (Tempo), MCP endpoint `/mcp`. This document assumes the audit fixes A-01…A-14 are landing in parallel; strategy below is what to build once the platform is safe to grow.

## 1. Product direction

The moat is not tool count — competitors can wrap APIs too. The moat is **one payment-native endpoint an agent can discover, trust, and pay without a human**. Everything below defends that.

- **Reliability as the product.** At 1108 tools the buyer's real question is "will call N+1 work". Publish a live per-tool health/success-rate surface (already have Prometheus + provider dashboard) as an agent-readable discovery field, not just a human page. A tool that is green 99% beats ten tools that are amber.
- **Tool discovery, not tool dumping.** `tools/list` returning everything (A-13) is the wrong primitive at scale. Ship a **search/filter tool** (`apibase.catalog.search` by category/price/freshness) so agents pull the 5 tools they need, not 3000. This is also the single biggest MCP-client context saver.
- **Outcome tools over primitive tools.** AP-7 says "1 tool = 1 request". Keep that as the base, but add a thin **compose layer**: a few high-value multi-provider tools (e.g. "enrich this company: registry + jobs + tech-stack + news") priced as a bundle. Agents pay more for one call than for orchestrating four — this raises revenue per call without breaking the atomic base.

## 2. MCP server directions

- **Registry from config, not code (A-11).** Generate `resolveAdapter` from YAML at build time; this is the precondition for onboarding velocity past 800 providers.
- **One generator for all discovery artifacts (A-08/A-10).** `ai.txt`, `ai-capabilities.json`, `agent.json`, `server-card.json`, `openapi.json` all from `TOOL_DEFINITIONS` via TS import. Kills the count-drift class permanently and retires the fragile regex.
- **Pagination + lazy schema (A-13).** Cursor on `tools/list`; register tools once per process. Required before 2000 tools.
- **Payment nonce store (A-01) as a platform primitive**, reused by any future rail (not just x402/MPP). Every new rail binds the exact signed value + single-use nonce — encode this as a shared middleware, not per-rail code.

## 3. Promising APIs to add (pay-per-use, agent-relevant, thin upstream)

Prioritise categories where agents already spend and where upstream is cheap/free so margin is high:

- **Web/data extraction at scale** — already have Zyte/Diffbot; add a cheaper bulk-scrape rail and a JS-render tier. Agents pay per page.
- **Financial market depth** — options chains, futures, on-chain analytics beyond Coingecko. High willingness-to-pay per call.
- **Identity/compliance** — sanctions (have OFAC), add company-registry coverage per country (have BrasilAPI/IBGE — extend to EU/US registries), KYB primitives.
- **Geospatial/logistics** — routing, tolls, customs, carrier rates (have ShipEngine/DHL/17TRACK) — bundle into "landed cost" compose tool.
- **LLM-adjacent utilities** — embeddings-as-a-tool, rerank, OCR, transcription — agents chaining these will pay per call rather than run infra.

Selection rule stays as `resort` defines it: pay-per-use pricing, cacheable, no commercial-use ban, thin upstream cost.

## 4. Scaling

- **Move build off the prod host (A-07)** — CI builds image, prod pulls from GHCR. Frees disk and decouples deploy from build time.
- **Horizontal path before it's forced.** Today one API process serves REST + MCP. Split MCP and REST into separate services behind the existing Nginx so they scale independently; this is the last cheap moment to do it (before a multi-host rewrite is mandatory).
- **Per-provider memory files (audit §1.1 / MEMORY.md at 402 lines).** Index-only MEMORY.md, one file per provider — the operator (Claude) loses onboarding recall otherwise past ~800 providers.
- **Ledger stays partitioned + archived** (already good) — no change needed; document the retention as a compliance feature (AP-9 / EU AI Act), it's a selling point.

## 5. Monetization

- **Compose/bundle tools** (§1) — highest-leverage revenue lever, raises revenue-per-call without new providers.
- **Tiered freshness pricing** — same tool, cached (cheap) vs forced-fresh (premium). The pipeline already has per-tool TTL; expose freshness as a paid parameter.
- **Volume commitments for repeat wallet-bots** — the 7 external bots are the first real customers; offer a prepaid balance discount (already have balance-based billing) to convert per-call into committed spend.
- **Facilitator independence (already in flight per flywheel 2026-05-01)** — self-hosted x402 facilitator removes Coinbase-CDP dependency and the KYC block; finish it, it's a revenue-continuity fix.

## 6. Developer / agent UX

- **Self-correcting errors as a feature** — the pipeline already returns `expected_params`/`hint` on 400 and fault-classified 422/503 (flywheel 2026-04-05, 2026-06-06). Extend to every error path; an agent that fixes itself churns less.
- **A demo tool that works with zero setup** (flywheel 2026-03-31 feedback) — one free, no-website, no-key tool so a new agent gets a green call in the first 10 seconds.
- **Single onboarding form is the only human touch (AP-10)** — keep it; everything else stays autonomous.

## 7. AI-Orchestra & Agent Ecosystem

The orchestra is currently paused, lying about its own status, and prompt-only sandboxed (audit §1.3, A-03/A-04/A-09). Before scaling it:

- **Fix the trust boundary first (A-04).** Per-role tool allowlists, no blanket `--dangerously-skip-permissions`, `git push` isolated with a scoped credential. The orchestra reads untrusted API docs — treat every role as processing hostile input.
- **State must not lie (A-03).** Liveness check in the status path; "last run > N days" alert. An autonomous system that can't report its own death is worse than no automation.
- **Real gates, not prompt guardrails (A-09).** `verify_onboarded` checks config+adapter; `dedup_check` actually returns its result; `sanitize_public` becomes an allowlist (fail-closed) before anything it clears reaches the public repo.
- **Then, and only then, scale cadence.** Once boundaries are code-enforced, raise `ORCH_MAX_ONBOARDS`, add Haiku only to genuinely mechanical roles (recorder), keep Sonnet on pricing/onboard where a wrong call costs money — currently pricing-audit runs on Haiku, which is backwards.
- **Ecosystem play:** publish the onboarding contract (adapter interface + config schema) so third parties can submit providers via PR into the config-driven registry (A-11). That turns onboarding from an operator bottleneck into a community funnel — the real path to 3000 tools.

## 8. Architect's own bets

- **The count is a vanity metric; freshness + success-rate is the real catalog.** Invest tooling there, not in racing to 3000.
- **Payment replay (A-01) proves the pattern**: every value the client signs must be reconstructed server-side and single-used. Make this an architectural invariant (a new AP-11), because every future rail will reintroduce the bug otherwise.
- **The knowledge base is now the bottleneck, not the code.** 20+ drifted count copies, missing precedence hierarchy, contract referencing nonexistent tools. A codebase this automated is only as reliable as the documents its agents read — treat `CLAUDE.md` + discovery files as production artifacts with CI assertions, not prose.
