# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest (main branch) | ✅ |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

**Email:** security@apibase.pro

**Do NOT:**
- Open a public GitHub issue for security vulnerabilities
- Post vulnerability details in discussions or comments

**What to include:**
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

**Response time:**
- Acknowledgment within 48 hours
- Assessment within 7 days
- Fix deployed within 30 days for critical issues

## Security Architecture

APIbase implements a 5-layer defense model:

1. **Network** — Firewall (UFW), SSH hardening, TLS 1.3, fail2ban
2. **Application** — API key auth, rate limiting (3-layer), input validation (Zod), CORS, security headers
3. **Infrastructure** — Docker containers (read-only, non-root, cap_drop ALL), named volumes, secrets in .env only
4. **Payment** — Escrow-first model, atomic settlement, append-only ledger, idempotency keys
5. **Monitoring** — Prometheus (27 alert rules), Grafana dashboards, Loki log aggregation, daily automated testing

## Payment Security

- **x402 (USDC on Base):** Escrow locked before provider call, auto-refund on failure, facilitator-verified settlements
- **MPP (USDC on Tempo):** Direct on-chain verification, HMAC-bound challenges, replay prevention via Redis
- **No double charges:** Idempotency key enforced at pipeline stage 2
- **Append-only ledger:** Financial records are never modified or deleted

## Automated Security Testing

- **Daily automated tests** via [mcp-protocol-tester](https://github.com/whiteknightonhorse/mcp-protocol-tester) — 15 phases including security audit, payment security, SSRF/XSS/injection tests
- **CI/CD checks** on every push — lint, type check, build verification
- **Third-party security harness** — [agent-security-harness](https://github.com/msaleme/red-team-blue-team-agent-fabric) score: 18/25 (72%), zero real vulnerabilities

## Disclosure Policy

We follow coordinated disclosure. Vulnerabilities will be patched before public disclosure. Credit will be given to reporters unless they prefer anonymity.

## Known Historical Disclosures

- **2026-08-24 (P-01):** `scripts/night-orchestra/` (16 files, including `roles/pricing-audit.md`
  which states the 30–50%/~100% margin policy) was tracked in this public repo's index from
  commit `3235dbf` (2026-08-24) through `c745604`/`d179744` despite the directory having a
  private mirror (github.com/whiteknightonhorse/night-orchestra) and a `.gitignore` entry added
  in `c745604`. That `.gitignore` entry only stopped *future* staging — it did not untrack the
  16 files already in the index, so every push kept re-publishing them.
  Fixed by `git rm -r --cached scripts/night-orchestra/` (files remain on disk and in the private
  mirror; only the public working tree stopped tracking them).
  **The already-published git history (commits `3235dbf`..`d179744` on `origin/main`) still
  contains the margin-policy text and was NOT rewritten** — a history rewrite requires a
  force-push to a public shared branch, which is a destructive, hard-to-reverse action gated on
  explicit operator authorization per repo policy. The operator was not reachable at execution
  time.
  **Decision: принята как есть, эскалировано (accepted as-is, escalated)** — pending operator
  choice between "accept the historical exposure permanently" or "manual history rewrite
  (BFG/filter-repo + coordinated force-push, contributors must re-clone)".
