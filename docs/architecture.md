# Architecture

APIbase is a single Node.js/TypeScript API server in front of a 16-container Docker stack
(API, Worker, Outbox, PostgreSQL, Redis, Nginx, Prometheus, Grafana, Loki, Promtail,
Alertmanager, exporters) on a single Hetzner server, with automated health checks, graceful
shutdown, and Prometheus alerting <!--alert-rules-->(31 alert rules)<!--/alert-rules-->. PostgreSQL is the append-only source of truth for
every financial record; Redis is cache, rate limiting, and single-flight deduplication only —
it holds nothing that would need to survive a restart. Every tool call passes through the same
14-stage pipeline in a fixed order:

```
AUTH → IDEMPOTENCY → CONTENT_NEG → SCHEMA_VALIDATION → TOOL_STATUS →
CACHE_OR_SINGLE_FLIGHT → RATE_LIMIT → ESCROW → MODERATION → PROVIDER_CALL →
ESCROW_FINALIZE → LEDGER_WRITE → CACHE_SET → RESPONSE
```

- **Quota-aware catalog**: a tool whose provider's free upstream quota is exhausted is withdrawn (`status_reason = quota_exhausted`) from `/api/v1/tools` and MCP `tools/list`; TOOL_STATUS answers a call to it with 503 `tool_unavailable` and `retry_after` before ESCROW, so no 402 challenge is issued and nothing is settled. It returns automatically once the quota resets and the provider probes healthy.
- **Escrow-first**: funds are reserved before the provider call. <!-- refund-truth: re-word when REFUND-WALLET-1026 lands -->x402: not settled on failure; MPP: refund owed, paid by the operator ([details](https://apibase.pro/pricing#refunds)).
- **Idempotent**: same request + same key = same result, no double charges.
- **Cache**: per-tool TTL (as short as 5s for stock prices, days for slow-changing data).
- **Fail-closed**: Redis down: payment, cache and rate-limit stages reject; the idempotency stage lets the request through (payment nonces still prevent a double charge).
- **Content-moderated**: MODERATION runs after escrow (so a paid request's payment already
  exists before a block is decided — enables settle-on-block: a blocked paid request keeps
  the charge and returns an `appeal_url` instead of silently keeping the money with no
  recourse) and before the provider call.
- **Catalog reject memory (Integrator)**: a layer-3/human product reject is remembered per merchant by a SHA-256 of the normalised title, description and instant payload, so renaming the SKU or deleting and re-listing does not clear it; layer 1 scans the instant payload and runs instruction rules on the normalised text too (policy: [/policy/moderation](https://apibase.pro/policy/moderation#merchant-catalogs)).
- **Layer-3 catalog review**: an independent nightly job (`scripts/moderation/layer3-review.sh`, haiku, hard cap 60 items per night, oldest first) that does not stop with the orchestra or the generic fleet pause; the time of the newest review is `moderation.last_llm_review_at` on `/api/v1/dashboard` (policy: [/policy/moderation](https://apibase.pro/policy/moderation#merchant-catalogs)).
- **Dashboard truth (T-0586)**: on `/api/v1/dashboard` a provider's `health.status` comes from the Postgres `provider_status.state` alone and is `green` only while `probe_age_s` is at most 7200, otherwise `stale`; a provider that was never probed has `health.measured: false` and is counted in `totals.providers_unmeasured`, not `providers_down`; the Redis check only adds `health.latency_status`, and a disagreement shows as `health.conflict: true`. `limits.used` counts calls inside `limits.window` (`hourly`, `daily`, `monthly`, `lifetime`), is `null` for unlimited providers, and turns red at 10 % remaining or less. Open incidents of subsystems without a `provider_status` row are listed in `system_incidents`. Every worker cron job is started through `registerJob`, which writes its `worker_job_runs` row at startup (`last_*` columns NULL until the first run), so monthly jobs such as `shop-fee-invoice` are visible before they first fire (page: [/dashboard](https://apibase.pro/dashboard)).
- **Sign-up IP country (UC-22)**: merchant registration looks up the caller's IP country in-process in a monthly-refreshed DB-IP Country Lite database (country level, refreshed by the worker job `geo-db-refresh`); a trusted edge header overrides it, and a missing database means the IP rule is not applied (policy: [/legal/aup](https://apibase.pro/legal/aup)).
- **Wallet screening (T-0570)**: one module (`src/shop/moderation/wallet-screen.ts`, `screenWallet`) checks the OFAC SDN list and the platform's own wallets (including the facilitator operator signer) on registration, identity change, payout change and payout apply; after each daily `ofac-sdn-sync` update every non-deactivated merchant is re-screened, a match suspends the merchant (`sanctions_match`) and opens the human-only `SANCTIONS_HIT` incident, and money never moves automatically (policy: [/legal/aup](https://apibase.pro/legal/aup)).

- **Autopilot incident exit (T-0574)**: an incident parked in `WAITING_HUMAN` with no operator file leaves it only on evidence about its own kind. Reachability kinds (`PROVIDER_DOWN`, `DEGRADED_QUALITY`) auto-close when the provider is HEALTHY, the last probe is OK and no `FAIL_*` probe is newer than 72 h; `QUOTA_LOW` and `QUOTA_EXHAUSTED` ignore probe health and move to `VERIFYING` only when the quota risk drops below CRITICAL (or a human file arrives). A reopened incident keeps its original `created_at` and records `evidence.episode_started_at`; a flapping incident sends one Telegram message on entering `FLAPPING` and none for later reopens or its auto-close.
- **Autopilot probing (T-0585)**: DOWN providers are re-probed at most every 6 h (the DOWN backoff doubles from 1 h and is capped at 6 h, so down-to-healthy latency is at most 6 h; healthy intervals are unchanged). A SEV1 incident in `STUCK` does not collect daily recurrence notes: the engine writes one `human-done/INC-<id>.ask.md` (retire the provider, or provide a key or plan), sends one Telegram line, and later ticks go to `notices.log` only.
- **Issue tracker split (T-0581)**: operational issues (orchestra, autopilot, tester, health, margin and limit alerts) live in the private repository `apibase-internal`, set by one constant `OPS_ISSUES_REPO` with host details scrubbed from every body (`config/autopilot/redact.json`); public GitHub issues are for users.
- **CI tests (T-0597)**: the test workflow (`.github/workflows/test.yml`) runs unit + DB suites on a disposable Postgres service (`TEST_DATABASE_URL`); the jest reporter prints `DB suites skipped: N` and fails the job when N is above 0.

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
