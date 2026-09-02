# Architecture

APIbase is a single Node.js/TypeScript API server in front of a 16-container Docker stack
(API, Worker, Outbox, PostgreSQL, Redis, Nginx, Prometheus, Grafana, Loki, Promtail,
Alertmanager, exporters) on a single Hetzner server, with automated health checks, graceful
shutdown, and 27+ Prometheus alert rules. PostgreSQL is the append-only source of truth for
every financial record; Redis is cache, rate limiting, and single-flight deduplication only —
it holds nothing that would need to survive a restart. Every tool call passes through the same
13-stage pipeline in a fixed order:

```
AUTH → IDEMPOTENCY → CONTENT_NEG → SCHEMA_VALIDATION → TOOL_STATUS →
CACHE → RATE_LIMIT → ESCROW → PROVIDER_CALL →
ESCROW_FINALIZE → LEDGER_WRITE → CACHE_SET → RESPONSE
```

- **Escrow-first**: funds locked before the provider call, refunded on failure.
- **Idempotent**: same request + same key = same result, no double charges.
- **Cache**: per-tool TTL (as short as 5s for stock prices, days for slow-changing data).
- **Fail-closed**: Redis down = reject all requests, never silently degrade.

Payment settlement (self-hosted x402 facilitator, MPP dual-rail, auth, error codes): see
[`payments.md`](payments.md). Day-2 operations (container management, restarts, backups,
monitoring): see [`runbook.md`](runbook.md). Self-hosting your own instance: see
[`self-hosting.md`](self-hosting.md).
