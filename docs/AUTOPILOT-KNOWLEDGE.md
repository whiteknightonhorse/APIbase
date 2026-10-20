# Autopilot knowledge

Durable lessons recorded by autopilot tasks. One section per task, newest last.

## T-0280-tg-policy-mpp-refund-digest

Task: Telegram policy plus a digest for MPP refunds owed (sub-cent debt from external payers).

Operator decision (2026-10-06, ruling-1 section Q2), option (b): external MPP payers with
sub-cent debt accumulate per wallet. The wallet is refunded in ONE transfer once its open
sum is >= $0.05 or its oldest open row is >= 7 days old. Digest and PAGE thresholds are as
in section Q3 of the ruling.

Where it lives:
- scripts/mpp-refund-owed-alerts.py: `DUE_WALLET_USD = Decimal("0.05")`, `due_wallets()`
  selects the wallets due for a one-transfer refund, `build_digest()` lists them, and
  `find_pages()` holds the PAGE rules.
- config/autopilot/internal-wallets.json: the 14 Heartbeat addresses. Their rows are written
  processed=true by recordMppRefundOwed, are reported separately as "internal", and never page.
- Telegram text (Russian allowed) lives only in config/autopilot/tg-strings.ru.json.

Gotchas:
- `due_wallets()` must skip rows with an unknown payer; otherwise they would be grouped under
  one bogus wallet and look due.
- If the open-rows query fails, the digest logs a warning and still sends the pending part.
  It must not silently report "nothing due".
- The digest only tells the operator; refunds stay manual (standing rule), closed via mpp-refund-resolve.py.
- Outbox rows are retained 7 days by partition-cleanup.job.ts, which refuses to purge unprocessed
  rows. The 7-day age trigger therefore sits at the edge of retention, so the digest has to
  run daily.
- The selftest asserts that internal-wallets.json holds exactly 14 addresses. Update that
  number when the allowlist changes.

## T-A-GA-01-public-receipts
A-GA-01: every on-chain-billed call (x402 settle confirmed with tx hash, or MPP with tx hash) gets one write-once receipt `apibase-receipt/1` in table `public_receipts` (migration 0043, UPDATE/DELETE blocked by trigger), served at `GET /r/<32hex>.json` (`src/routes/receipt.router.ts`). `src/services/public-receipt.service.ts` plans it from the finished PipelineContext (read-only: no price, verify or settle code touched); REST sets `X-APIbase-Receipt` and writes after `res.json`, MCP puts `apibase/receipt_url` in result `_meta` and writes on `setImmediate`. Write failures are logged only. Prepaid-balance and unbilled calls get no receipt; batch endpoints are not covered in v0. The write is post-response, so a fetch in the first ms can 404 (404 is `no-store`). Deploy needs migration 0043 applied and the `/r/` nginx location (nginx.conf, apibase-host.conf, sandbox conf); the operator makes the first live receipt.
