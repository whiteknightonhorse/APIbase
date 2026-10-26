# Architecture

APIbase is a single Node.js/TypeScript API server in front of a 16-container Docker stack
(API, Worker, Outbox, PostgreSQL, Redis, Nginx, Prometheus, Grafana, Loki, Promtail,
Alertmanager, exporters) on a single Hetzner server, with automated health checks, graceful
shutdown, and Prometheus alerting <!--alert-rules-->(30 alert rules)<!--/alert-rules-->. PostgreSQL is the append-only source of truth for
every financial record; Redis is cache, rate limiting, and single-flight deduplication only —
it holds nothing that would need to survive a restart. Every tool call passes through the same
14-stage pipeline in a fixed order:

```
AUTH → IDEMPOTENCY → CONTENT_NEG → SCHEMA_VALIDATION → TOOL_STATUS →
CACHE_OR_SINGLE_FLIGHT → RATE_LIMIT → ESCROW → MODERATION → PROVIDER_CALL →
ESCROW_FINALIZE → LEDGER_WRITE → CACHE_SET → RESPONSE
```

- **Escrow-first**: funds are reserved before the provider call. <!-- refund-truth: re-word when REFUND-WALLET-1026 lands -->x402: not settled on failure; MPP: refund owed, paid by the operator ([details](https://apibase.pro/pricing#refunds)).
- **Idempotent**: same request + same key = same result, no double charges.
- **Cache**: per-tool TTL (as short as 5s for stock prices, days for slow-changing data).
- **Fail-closed**: Redis down: payment, cache and rate-limit stages reject; the idempotency stage lets the request through (payment nonces still prevent a double charge).
- **Content-moderated**: MODERATION runs after escrow (so a paid request's payment already
  exists before a block is decided — enables settle-on-block: a blocked paid request keeps
  the charge and returns an `appeal_url` instead of silently keeping the money with no
  recourse) and before the provider call.

## Documentation sync

Every fact a page, the README or `llms.txt` states beyond the counts is read from one generated file,
`/.well-known/site-facts.json` (`scripts/gen-site-facts.ts`: values imported from the code, plus
anchored manual facts in `config/site-facts.manual.json`). `config/site-claims.tsv` lists what each
surface says about those facts; `scripts/site-facts.py check` compares them offline, and the daily job
`scripts/site-sync-check.sh` runs `check-live` against production (claims, page metadata crawl, link and
GenLayer probes, agent-ready checks). A mismatch reaches the operator through fleet-check and opens a
docs-drift card.

Payment settlement (self-hosted x402 facilitator, MPP dual-rail, auth, error codes): see
[`payments.md`](payments.md). Day-2 operations (container management, restarts, backups,
monitoring): see [`runbook.md`](runbook.md). Self-hosting your own instance: see
[`self-hosting.md`](self-hosting.md).
