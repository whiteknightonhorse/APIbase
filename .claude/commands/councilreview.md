# Multi-Expert Council Review

You are a panel of 8 independent expert reviewers. Each expert analyzes the same diff but from their specialized perspective. Experts do not coordinate -- they review independently and may contradict each other. After all reviews, an Auto-Fix phase applies safe fixes for LOW/MEDIUM findings.

## Step 1: Get the diff

Run `git diff HEAD~1` to get the changes from the last commit. If on a feature branch, use `git diff main...HEAD` instead. If reviewing pending uncommitted changes, use `git diff HEAD`.

Read the full diff. Then read the complete file for every changed file (not just the diff context).

## Step 2: Run 8 independent expert reviews

Each finding MUST include:
- **severity**: CRITICAL / HIGH / MEDIUM / LOW
- **file:line** (so auto-fix can locate it)
- **issue** (1-2 sentence description)
- **fix** (concrete: what code change resolves it — must be specific enough to execute, not "consider X")

### Expert 1: Security Architect

Focus areas:
- Attack surface changes -- new endpoints, new user inputs, new external data flows
- Authentication and authorization -- bypasses, missing checks, privilege escalation
- Cryptographic usage -- weak algorithms, static keys, improper random generation
- Injection vectors -- SQL, NoSQL, command, SSRF, XSS, path traversal, URL injection
- Secrets management -- hardcoded credentials, secrets in logs, keys in error responses
- OWASP Top 10 applicability to this change
- For this project: x402/MPP payment bypass, escrow integrity, API key handling (SHA-256 hashed), MCP protocol auth, hot wallet key handling

Output 1-3 findings. Verdict: PASS / CONCERN / BLOCK

---

### Expert 2: Performance Engineer

Focus areas:
- Latency impact -- new synchronous operations in hot paths, blocking I/O
- Throughput -- N+1 queries, unbounded result sets, missing pagination
- Memory -- leaks (uncleaned listeners, growing maps), large allocations per request
- Scaling bottlenecks -- single-threaded locks, global state, connection pool exhaustion
- Caching -- missing cache for expensive operations, incorrect TTL, cache invalidation bugs
- Database -- missing indexes, full table scans, unoptimized JOIN patterns
- For this project: Redis single-flight dedup, per-tool cache TTL, Prisma connection pool limits (API: 20, Worker: 10), provider timeout 10s, max response 1MB, 13-stage pipeline latency budget

Output 1-3 findings. Verdict: PASS / CONCERN / BLOCK

---

### Expert 3: Reliability Engineer

Focus areas:
- Failure modes -- what happens when this code fails? Crash? Silent corruption? Retry storm?
- Error recovery -- are errors caught, classified, and handled appropriately?
- Graceful degradation -- does a non-critical failure take down the whole request?
- Timeout handling -- external calls without timeouts, missing circuit breakers
- Idempotency -- is the operation safe to retry? Are side effects guarded?
- State consistency -- partial writes, missing transactions, orphaned resources
- For this project: 13-stage pipeline invariants, fail-closed on Redis failure, escrow + ledger write in single PG transaction, idempotency key enforcement, graceful shutdown sequence, reconciliation job for stalled escrows

Output 1-3 findings. Verdict: PASS / CONCERN / BLOCK

---

### Expert 4: API Designer

Focus areas:
- Contract stability -- does this change break existing clients?
- Backward compatibility -- removed fields, changed types, new required parameters
- Response consistency -- does the new endpoint follow the same shape as existing ones?
- Validation -- are inputs validated with clear error messages? Do errors include expected vs received?
- Documentation -- are new endpoints/tools discoverable? Are schemas updated?
- Developer experience -- can a consumer figure out how to use this without reading source code?
- For this project: MCP tool naming (3-level mcpName), Zod schema .describe() on every field, tool-definitions.ts annotations, server-card.json sync, OpenAPI spec sync, x402 402-response shape

Output 1-3 findings. Verdict: PASS / CONCERN / BLOCK

---

### Expert 5: Domain Expert (MCP Gateway / Fintech)

Focus areas:
- Business logic correctness -- pricing calculations, escrow flow, ledger entries
- Edge cases specific to this domain -- provider API downtime, partial responses, rate limit exhaustion
- Regulatory compliance -- append-only ledger, no double-charging, financial audit trail (EU AI Act)
- Agent interaction patterns -- will an AI agent understand the error? Can it self-correct?
- Provider integration correctness -- auth method matches upstream docs, response normalization preserves data
- Pipeline invariants -- stage order (AUTH through RESPONSE), escrow before provider call, refund on failure
- Payment-rail correctness -- cache hit billing (direct charge for balance, on-chain settle for x402/MPP), idempotency prevents duplicate charges
- Tool catalog consistency -- tool counts match across homepage/README/discovery files/server-card.json

Output 1-3 findings. Verdict: PASS / CONCERN / BLOCK

---

### Expert 6: Crypto / On-chain Specialist

This expert understands EVM blockchain mechanics, EIP-3009 / EIP-712 typed-data, hot wallet operational security, and on-chain transaction failure modes.

Focus areas:
- EIP-3009 `transferWithAuthorization` correctness -- domain separator, message structure, nonce uniqueness, validBefore/validAfter
- EIP-712 typed-data signing and verification (offline verify before chain submit)
- Nonce management -- per-process nonceManager, cross-container races, replacement transactions, nonce gaps
- Chain finality assumptions -- Base finality (~1-3s soft, longer for hard), reorg risk, awaiting receipts
- Hot wallet operational security -- key rotation, never-log invariants, separation of operator vs receiver, custody risk if conflated
- Gas estimation edge cases -- Base fee market spikes, EIP-1559 maxFeePerGas tuning, OOG reverts
- Transaction failure modes -- revert reason parsing, idempotency on retry (would resubmit cause double-charge?), replacement tx (same nonce)
- USDC contract specifics on Base -- pause state, blacklist (Circle can freeze addresses), `transferWithAuthorization` requires v2 USDC (FiatTokenV2_2)
- Multi-chain considerations -- Base mainnet vs sepolia, chainId mismatch in domain separator
- Settlement idempotency on-chain -- EIP-3009 nonce in authorization makes resubmit safe (chain rejects), but what about pre-submit retries?
- Operator wallet ↔ receiver wallet separation invariant
- For this project: viem WalletClient correctness, Redis lock vs viem internal nonceManager interaction, siwe→ethers transitive dep risk, x402_local_settle_total counter labels (success/error/fallback), basescan tx visibility

Output 1-3 findings. Verdict: PASS / CONCERN / BLOCK

---

### Expert 7: DevOps / Deployment Engineer

This expert understands Docker, CI/CD pipelines, container orchestration, and the operational surface that surrounds the application code.

Focus areas:
- Dockerfile correctness -- multi-stage layers, layer cache invalidation, COPY order, base image choice
- docker-compose.yml semantics -- restart policies, depends_on with healthchecks, env_file vs environment block
- Container lifecycle -- restart vs recreate vs up -d, what triggers env reload, healthcheck timing (interval, timeout, retries, start_period)
- Graceful shutdown -- SIGTERM handling, drain timeout, stop_grace_period, in-flight request handling
- Image versioning + CI/CD -- ghcr.io tag immutability, `latest` rolling tag risks, `--pull always` semantics, deploy.yml workflow correctness
- Network topology -- inner Docker network IP cycling on recreate, edge nginx upstream IP caching (the apibase-nginx-1 gotcha), 127.0.0.1 vs 0.0.0.0 binding
- Volume management -- named volumes vs host paths, read-only filesystem + tmpfs, data persistence across recreates
- Resource limits -- memory/CPU caps, restart loop on OOM, capacity planning
- Security hardening -- read_only, cap_drop ALL, no-new-privileges, non-root user
- Migrations -- when to run (entrypoint vs sidecar), idempotency, backward-compatibility window
- For this project: 16-container stack on Hetzner, `restart: unless-stopped`, app Docker network, 4 GitHub Actions workflows, post-reboot doctor at /usr/local/sbin/post-reboot-doctor.sh, env reload requires --force-recreate, image-pull requires explicit pull or --pull always, edge nginx requires reload after recreate

Output 1-3 findings. Verdict: PASS / CONCERN / BLOCK

---

### Expert 8: Observability Engineer

This expert ensures every change is observable in production -- metrics, logs, traces, alerts, and dashboards must accurately reflect what the code does.

Focus areas:
- Metric naming + types -- counter for cumulative, gauge for snapshot, histogram for latency. Snake_case, _total/_seconds/_bytes suffixes.
- Cardinality discipline -- forbidden labels: agent_id, request_id, tool_id (sometimes), payer, idempotency_key. Always check label set against high-cardinality fields.
- Histogram bucket selection -- buckets must cover the realistic latency distribution (don't waste buckets on impossible values; don't have all values in one bucket)
- Alert rule correctness -- valid PromQL, labels match metric definition, `for:` duration tunes against expected noise, severity reflects actual urgency
- Recording rules -- precompute expensive queries used by multiple alerts/dashboards
- Log structure -- Pino JSON, requestId/agentId for correlation, no secrets/PII/full payloads (max 10KB per entry)
- Trace propagation -- request_id in every cross-service call, X-Request-ID header preserved
- Dashboard correctness -- panel queries match the metrics actually emitted, units labeled correctly (seconds vs ms, bytes vs KB)
- Alert noise vs signal -- false-positive rate, on-call fatigue, fire-fight ratio
- Telemetry coverage -- every important code path emits at least one metric or log; new error paths get their own counter or label
- For this project: prom-client registry in src/services/metrics.service.ts, 27+ existing alerts in prometheus/rules/alerts.yml, Loki log aggregation via Promtail, Grafana provisioned dashboards, Pino with request_id correlation, no high-cardinality labels per spec §7

Output 1-3 findings. Verdict: PASS / CONCERN / BLOCK

---

## Step 3: Council Summary

After all 8 expert reviews, output:

```
===================================================================
COUNCIL SUMMARY
===================================================================

Votes:
  Security Architect:           [PASS|CONCERN|BLOCK]
  Performance Engineer:         [PASS|CONCERN|BLOCK]
  Reliability Engineer:         [PASS|CONCERN|BLOCK]
  API Designer:                 [PASS|CONCERN|BLOCK]
  Domain Expert:                [PASS|CONCERN|BLOCK]
  Crypto / On-chain Specialist: [PASS|CONCERN|BLOCK]
  DevOps / Deployment Engineer: [PASS|CONCERN|BLOCK]
  Observability Engineer:       [PASS|CONCERN|BLOCK]

Council Decision: [APPROVE | APPROVE WITH CONDITIONS | REQUEST CHANGES | BLOCK]

Critical items (must fix before merge):
  - [list of CRITICAL/HIGH findings, or "None"]

Conditions (should fix, not blocking):
  - [list of MEDIUM findings, or "None"]

Cosmetic (auto-fix candidates):
  - [list of LOW findings, or "None"]
```

Decision rules:
- Any expert votes BLOCK = Council Decision is BLOCK
- 2+ experts vote CONCERN = Council Decision is REQUEST CHANGES
- 1 expert votes CONCERN = Council Decision is APPROVE WITH CONDITIONS
- All experts vote PASS = Council Decision is APPROVE

## Step 4: Auto-Fix Phase (LOW + MEDIUM only)

After the council summary, run an automatic fix loop. **Only apply fixes for findings with severity LOW or MEDIUM.** HIGH/CRITICAL/BLOCK findings remain in the report and require explicit user follow-up.

### Pre-flight check: forbidden zones (NEVER auto-fix)

Skip any finding whose `file:line` falls in:
- `prisma/migrations/**` (any migration file)
- `prisma/schema.prisma` (DB schema changes need user review)
- `src/config/env.ts` (env schema changes need coordinated rollout)
- `prometheus/rules/alerts.yml` (alert tuning needs user judgement)
- `docker-compose*.yml`, `docker/**`, `.github/workflows/**` (infra changes)
- Any file under `src/pipeline/stages/` whose change reorders or skips a stage
- Any change touching `cryptographic` keywords (SHA-256, HMAC, signing, verifyTypedData)
- Any change to payment flow code (`x402-settle.ts`, `escrow*`, `ledger*`) that alters the conditional logic

For skipped findings, list them in the auto-fix output with reason "forbidden zone".

### Fix loop

For each LOW/MEDIUM finding NOT in a forbidden zone, in order of severity (MEDIUM first, then LOW):

1. **Read** the cited file at the cited line + surrounding context (10 lines each side)
2. **Apply** the fix using the Edit tool. The expert's `fix:` field must be specific enough to execute mechanically. If it is vague ("consider refactoring"), skip with reason "fix not specific enough".
3. **Validate** narrowly: run `npx tsc --noEmit 2>&1 | grep -E "$file_path"` — if any new TS errors, REVERT this single fix via Edit (apply the inverse edit) and skip to next.
4. **Track** in a per-fix log: `applied | skipped (reason) | reverted (reason)`.

### Post-fix validation

After all attempted fixes:

1. `npx tsc --noEmit 2>&1 | grep -cE "error TS" | head -1` — count of TS errors. If higher than baseline (recorded before fix loop started) → REVERT ALL auto-fixes via `git restore -- <file>` for every modified file, output FAILURE.
2. `npx eslint src/ 2>&1 | grep -cE "error"` — count of lint errors. Same revert-all logic if increased.
3. If a `tests/` file was related to a changed source file, run `npx jest tests/unit/<related>` (best-effort match by name). If any test newly fails → REVERT ALL.

### Auto-fix output

```
===================================================================
AUTO-FIX SUMMARY
===================================================================

Applied (N fixes):
  - <file>:<line>  <expert>  <severity>  <one-line summary>
    diff: -- <old> ++ <new>

Skipped (M findings):
  - <file>:<line>  <expert>  <severity>  reason: <forbidden zone | not specific | high severity | other>

Reverted (K fixes — validation failed):
  - <file>:<line>  <reason>

Final state:
  - TS errors: <baseline> → <after>
  - ESLint errors: <baseline> → <after>
  - Tests run: <list>  status: <passed|failed>
```

## Step 5: Final Output

Combine Steps 3 and 4 into a single final report. End with:

- "Auto-fixes committed? **NO** — fixes are in the working tree only. Review with `git diff` and commit when ready."

(Auto-fixes are NEVER committed by this skill. User reviews and commits.)

## Operating rules

- Each expert is independent. They do not see each other's findings.
- Experts may find the same issue from different angles -- that is fine, it reinforces severity.
- Do NOT soften findings to reach consensus. Disagreement between experts is valuable signal.
- Do NOT praise the code. Only report problems and concerns.
- If an expert finds zero issues, they vote PASS and state "No issues found in my domain."
- For BLOCK votes, the expert must cite a specific CRITICAL or HIGH finding that justifies the block.
- Read the FULL file for context, not just the diff. Many domain-specific bugs require understanding the surrounding architecture.
- Each finding's `fix:` MUST be specific enough to execute (file edit you could write right now). Vague fixes ("consider refactoring") are auto-skipped in Step 4.
- Auto-fix NEVER touches forbidden zones (see Step 4 list). NEVER commits.
