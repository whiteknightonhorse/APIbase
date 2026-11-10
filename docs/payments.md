# Payment Protocols (x402 + MPP)

APIbase supports **dual payment rails** — agents can pay using either protocol. Moved out of
the top-level README (2026-09-02, README compaction per Fable's ruling on T-30 dispute q-1,
Q3) so integration detail lives with the rest of the docs, not in the ten-second overview.

## x402 (USDC on Base)

| Field | Value |
|-------|-------|
| Protocol | **x402** (HTTP 402 Payment Required) |
| Token | USDC on Base |
| Wallet | `0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480` |
| Price range | $0.0005 – $29.99 per call (p90 $0.003) |
| SDK | `@x402/core`, `@x402/evm`, `@x402/extensions` 2.28 (spec v2, V1 payloads accepted) |
| Settlement | **Self-hosted on-chain facilitator** is the primary path; PayAI fallback: see the paragraph below. See [`x402-facilitator.md`](x402-facilitator.md). |

APIbase runs its own x402 facilitator in-process: every successful payment is settled by
submitting `transferWithAuthorization` directly on Base via [`viem`](https://viem.sh). There
is no Coinbase CDP and no third-party intermediary on the primary path. Implementation:
[`src/payments/local-facilitator.ts`](../src/payments/local-facilitator.ts).
Primary path: the self-hosted facilitator. PayAI is wired as a fallback used only when the local facilitator returns an error or times out (30 s); it never sees a payment that the local path settled.

On x402 a failed provider call is not settled, so nothing leaves the payer's wallet; a settle that landed on chain without a delivered result is refunded as in [Refunds owed by APIbase](#refunds-owed-by-apibase).

Order of events on a paid x402 call stays **verify before, deliver, settle after**: the payment is
verified and bound to the tool price before the provider is called, the result is delivered, and the
on-chain settle runs afterwards. REST calls have a 60-second gateway deadline (MCP 300 s); if the client connection closes before the result is written, the x402 authorization is not settled and the call is recorded NOT_CHARGED (client_disconnected); an MPP charge in that case becomes a refund-owed row. If the ledger write fails after a successful settle, the result is still delivered and the failure is recorded as a `ledger.write_failed` outbox event (request id, payer, tx hash, amount) and the row is booked by the reconcile job into the ledger (counter `apibase_ledger_write_failed_booked_total`). Every 402 response carries `Cache-Control: no-store`.

### Dedup window (T-0526)

- Dedup window: `DEDUP_WINDOW_SECONDS = 120` (= x402 maxTimeoutSeconds). Scope: **x402 rail only**, cacheable tools only (cache TTL > 0 and the request is a cache hit), tool id not starting with `shop.`. MPP: no dedup, because mppx settles inside the middleware before the tool runs; a repeated MPP read is charged as today. Balance rail: unchanged (10 % on a cache hit).
- Key: Redis `dedup:x402:{payer}:{cacheKey}`, payer = the facilitator-verified payer (`result.payer`, lowercase), cacheKey = the existing cache key. Value = the public receipt id of the charged call or `-`. TTL 120 s. Set only after a charged x402 call completes (settled or settlement_pending), once the public receipt id is known (response surface, after the pipeline).
- Position of the read: inside `verifyX402Binding`, after `result.isValid` and the afterVerify screen, before `claimOrReject`. On a hit the nonce claim and the settle are skipped; the signed authorization is not consumed. Verify is still paid once per repeated read; that is the cost of an authenticated payer.
- Response on a hit: cached answer, `X-APIbase-Charged: false`, `X-APIbase-Receipt` = original receipt URL when the value is a receipt id; MCP `_meta["apibase/charged"]: false` and original `_meta["apibase/receipt_url"]`. No new receipt, no billed ledger row (a `NOT_CHARGED` row with reason `dedup_hit`), one `dedup_hit` log line with tool id and rail.
- Different payer, same arguments: charged. Window expired: charged. Redis unreachable: charged, logged once. Exact resend of the same signed payload within the window: dedup hit (before: a nonce 402); after the window it hits the nonce guard as today.
- Volatile fields: a property in a tool's `input_schema` may carry `"x-apibase-volatile": true`; it is removed from params before hashing the cache key and the dedup key. No tool annotates anything by default; the annotation is part of `definition_sha256`.

### Unknown settlement outcome (T-0428)

A settle has four outcomes, not two:

| Outcome | Signal | Who resolves it | When |
|---|---|---|---|
| settled | `success:true` | nobody, done | immediately |
| failed | `success:false` with a bare `invalid_exact_evm_transaction_failed` (receipt reverted or Transfer mismatch) or a known-failed reason | operator pages (`x402_settle_failed`) | immediately |
| unknown | `success:false, errorReason:'settlement_pending', transaction:<hash>` (broadcast, receipt not seen) or `FacilitatorTimeoutError` (30 s, outcome indeterminate), or a thrown `invalid_exact_evm_transaction_failed: <message>` / `settle_threw` timeout (outcome indeterminate) | the chain reconcile, by reading the chain | within 60 s per tick |
| rpc verdict | `invalid_exact_evm_signature` returned by settle after a verify that passed | one retry within the validBefore window, then pending; the chain reconcile decides | within 60 s per tick |

A settle whose broadcast result is unknown (RPC timeout) is held as pending and decided from the chain within minutes; only a reverted transaction is recorded as failed.

Law: unknown is resolved only by reading the chain, and nobody calls settle again for an authorization that may have been broadcast. The single rpc-verdict retry runs only when nothing was sent (verify failed before broadcast, `invalid_exact_evm_signature`).

Base RPC: public primary with an optional reserve `X402_BASE_RPC_URL_FALLBACK`; settle fails only when both fail.

- **API tools** (`src/pipeline/stages/x402-settle.ts`): one outbox event `x402_settle_pending {request_id, execution_id, tool_id, payer, amount_usd, tx_hash?, network, nonce, valid_before}`, never `x402_settle_failed`; the ledger row gets `x402_settle_state='pending'` and `settle_tx_hash`. The worker job `x402-settle-pending` (every 60 s, owns that outbox type only) reads `receiptOk(tx_hash)`, then `authorizationUsed(payer, nonce)` plus the USDC transfer: settled closes the event and flips the ledger row to `settled`. An authorization that is still unused after `valid_before` writes `x402_settle_failed` with reason `pending_expired_unsettled` (the revenue-leak page). Otherwise the row waits for the next tick; an RPC failure leaves it untouched.
- **Shop orders** (`src/pipeline/stages/shop-settle.ts`): both signals return `pending` (order stays `PAYING`, the hash is stored on the payment row). `shop-payment-reconcile` (every 60 s) checks that receipt first, then `authorizationState`/`Transfer`. Every other throw is still `PAYMENT_FAILED`.

### MCP (T-0429)

Protocol versions: see /.well-known/mcp.json.

Transport on `/mcp`, same rules as REST: the x402 payment travels in the `X-Payment` header or in `params._meta["x402/payment"]` of a `tools/call` (x402 MCP transport v2; key names `x402/payment`, `x402/payment-response` from `@x402/mcp` 2.28, a dev dependency used only by tests). Header wins; both present with different payloads is a 400; explicit nulls on optional fields are dropped before parsing. `src/middleware/x402.middleware.ts` re-encodes a `_meta` payment as the X-Payment value, so ESCROW binds both the same way.

A 402 tool result keeps `isError:true` and its JSON text and adds the PaymentRequired object of the HTTP 402 body in `_meta["x402/payment-required"]` and in `structuredContent` (the official transport reads `structuredContent`; the `_meta` key is our addition, the spec defines none for the challenge). The facilitator settle is awaited before the result is built (at most `maxTimeoutSeconds`), so the result carries one of two shapes (T-0596). Settled: `_meta["x402/payment-response"]` `{success, transaction, network, payer}`. Settle outcome unknown (`settlement_pending` or a facilitator timeout, T-0428): no `x402/payment-response`, instead `_meta["apibase/settle"]` `{status: "pending", receipt_id, retrieve_url}`; `retrieve_url` is `https://apibase.pro/r/<receipt_id>.json`, which returns the same body with `status: "pending"` until the reconcile job resolves the settle, then the final receipt with `payment_tx` (or `status: "failed"` if the authorization expired unsettled). A settle that failed returns the result with `isError` false and `_meta["apibase/settle"]` `{status: "failed"}`. REST follows the same rule: settled -> `PAYMENT-RESPONSE` header (base64 JSON, same fields); pending or failed -> `X-APIbase-Settle: pending|failed`, and `X-APIbase-Receipt` carries the retrieve URL when a receipt exists. `maxTimeoutSeconds` is 120 (the validBefore window; @x402/mcp clients derive their tool-call timeout from it).

Idempotency key on `/mcp` (T-0526): `params._meta["apibase/idempotency_key"]`, a string of 16-128 characters, becomes the `X-Idempotency-Key` of the call, so the idempotency stage (10 minutes, per authenticated agent or paying wallet where known, 409 with `retry_after` on a concurrent duplicate) applies as on REST; other lengths are ignored. A dedup hit answers with `_meta["apibase/charged"]: false` and the original `_meta["apibase/receipt_url"]`; `shop.order.pay` keeps the x402 payment-identifier.

Difference from x402 2.24 ("withhold the result when the after-call settle fails"): APIbase verifies before the call and settles after; an unsettled call is reconciled (T-0428), the result is not withheld.

MPP exists only on `POST /api/v1/tools/{tool_id}/call` and `POST /api/v1/shop/quotes/{id}/pay`; `/mcp` pays by x402 only (`X-Payment` or `_meta`), returns no `WWW-Authenticate: Payment` challenge, and answers an MPP credential in either header with 400. On those two routes the credential is read from `Payment-Authorization: Payment <cred>` first, then `Authorization: Payment <cred>` (mppx < 0.9 clients); both present is a 400. No challenge advertises `header="Payment-Authorization"` (the mppx default is used), but a credential in `Payment-Authorization` is accepted, so agents keep `Authorization: Bearer <api key>` and send the credential in that header (T-0686).

## MPP (Machine Payments Protocol)

| Field | Value |
|-------|-------|
| Protocol | **MPP** (IETF draft-ryan-httpauth-payment) |
| Token | USDC.e on Tempo (chain 4217) |
| SDK | `mppx` (npm) |
| Agent setup | [wallet.tempo.xyz](https://wallet.tempo.xyz) |
| Discovery | [mpp.dev/services](https://mpp.dev/services) |
| Price range | $0.0005 – $29.99 per call (p90 $0.003) |

No subscriptions, no minimums. Paid tools are set at or above the provider's cost where the cost is known; tools whose provider is free carry no upstream cost (see [pricing](https://apibase.pro/pricing)). On x402 a failed provider call is not settled; on MPP the payment is already settled when the call runs, so a failure leaves a refund owed to you, paid out automatically in the weekly batch (see [Refunds owed by APIbase](#refunds-owed-by-apibase) and [pricing](https://apibase.pro/pricing#refunds)).

Settlement-side check: every 15 minutes a job re-books any MPP refund-owed row whose first write failed (reason `reconcile_missing:<original reason>`) and compares the USDC.e transfers into the revenue wallet of the last 24 hours, once they are 10 minutes old, with our ledger, refund, receipt and payment rows. A transfer that matches none raises the `MppSettleUnmatched` alert and is left to a human; no refund is booked for it. A failed call has no receipt: the debt is keyed by the request id and the payment transaction (`original_tx`).

### MPP Payment Flow

MPP uses a **challenge–credential–receipt** cycle:

```
1. Agent → POST /api/v1/tools/{tool}/call (with Authorization: Bearer <key>)
2. Server → 402 + WWW-Authenticate: Payment id="...", method="tempo", request="..."
3. Agent signs payment on Tempo → retries with Authorization: Payment <credential>
4. Server verifies on-chain → 200 + Payment-Receipt header + tool result
```

Each 402 challenge is unique: its `id` is an HMAC over realm, method, intent, the payment request (amount, currency, recipient, chain), expiry and body digest — **not** over the URL. A credential cannot be reused after expiry or presented with a different amount; in addition APIbase binds the paid amount to the tool price in its ESCROW stage and accepts MPP credentials only on `POST /api/v1/tools/{tool_id}/call`, the route that issued the challenge. The `mppx` SDK handles the challenge→credential cycle automatically.

```typescript
import { Mppx, tempo } from 'mppx/client'

const mppx = Mppx.create({ methods: [tempo({ account: myTempoWallet })] })
const response = await fetch('https://apibase.pro/api/v1/tools/crypto.get_price/call', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ak_live_<your_key>',
    'X-API-Key': 'ak_live_<your_key>',  // preserved when mppx replaces Authorization
  },
  body: JSON.stringify({ coins: ['bitcoin'] }),
})
```

### Troubleshooting: "MPP payment verification failed" on x402 requests

**Symptom:** Agent sends x402 payment (`X-Payment` header) but gets `400 MPP payment
verification failed` instead of data.

**Root cause:** `Mppx.create()` with default settings installs a global `fetch()` polyfill
that intercepts ALL HTTP requests, including x402 ones. On any 402 response it auto-signs an
MPP credential and retries — invalid for an x402 request, so the server returns 400.

**Fix:** `Mppx.create({ wallet, polyfill: false })`, then use `mppx.fetch()` only for MPP
payments; use plain `fetch()` for x402. Do not send both `X-Payment` and `Authorization:
Payment` headers on the same request — both middlewares activate and one fails.

## Public receipts (A-GA-01)

Every tool call that was billed on-chain (x402 on Base, or MPP on Tempo) gets one immutable public receipt, written after billing and after the response is sent. Calls that were not billed get **no** receipt in v0 (nothing to attest), and neither do calls paid from the refund credit balance (no on-chain payment transaction). The privacy policy discloses what a receipt contains: [apibase.pro/privacy#public-receipts](https://apibase.pro/privacy#public-receipts).

- **Where to find it.** REST: response header `X-APIbase-Receipt: https://apibase.pro/r/<receipt_id>.json`. MCP: the tool result `_meta` carries `"apibase/receipt_url": "https://apibase.pro/r/<receipt_id>.json"` and, next to it, `"apibase/dispute_url": "https://apibase.pro/dispute/?r=<receipt_id>"` (the page of the Disputes item below). `https://apibase.pro/r/<receipt_id>` (no `.json`) is the same receipt as a page with a "Dispute this receipt" link.
- **Fetch.** `GET https://apibase.pro/r/<receipt_id>.json` is public: `Content-Type: application/json`, `Access-Control-Allow-Origin: *`, and the `Cache-Control` given under Immutable below. An unknown id answers `404` with `{"error":"no such receipt"}`. The receipt is written just after the response, so a fetch in the first moments can still 404; retry.
- **By transaction.** `GET https://apibase.pro/r/by-tx/<payment_tx>.json` lists the receipts of one payment transaction: `{"schema":"apibase-receipt-index/1","payment_tx","receipt_ids":[...],"refund_tx":"0x..."|null,"first_seen_at":ISO|null}`, `Cache-Control: no-store`. A malformed hash answers `400`; any well-formed hash answers `200`, and a transaction APIbase never saw is `receipt_ids: []`, `refund_tx: null`, `first_seen_at: null` (an honest answer, not a 404).
- **Pending settlements.** Calls whose x402 settlement ends in `settlement_pending` (facilitator timeout or broadcast without receipt) get no receipt in v0, even if chain reconcile later confirms them; the receipt is written only in the response path of a confirmed settle.
- **Immutable.** Receipts are write-once; there is no update or delete path. The served bytes are the stored bytes and the response carries `Cache-Control: public, max-age=31536000, immutable`. The receipt never changes after issuance: refund state lives at `https://apibase.pro/r/<receipt_id>.refund.json` (`Cache-Control: public, max-age=60`; 404 `{"error":"no_refund"}` = nothing owed; `503` `{"error":"refund lookup unavailable"}` = the ledger could not be read, retry). The refund booked for a GenLayer dispute (see [Refunds owed by APIbase](#refunds-owed-by-apibase)) is served at `https://apibase.pro/r/<dispute_id>.refund.json` (64 hex characters), the same fields with `dispute_id` in place of `receipt_id`.
- **Body.** Canonical JSON (sorted keys, no whitespace), schema `apibase-receipt/1`:
  `schema`, `receipt_id` (32 hex chars), `issued_at` (ISO 8601 UTC), `tool`, `upstream_status`, `response_sha256` (sha256 of the exact response body sent), `billed` (always `true`), `rail` (`x402-base` or `mpp-tempo`), `chain_id`, `asset` (`USDC`), `amount_atomic` (integer string, 6 decimals), `payer`, `payee`, `retrieve_url`, `result_retained_until` (ISO 8601 UTC, `issued_at` + 24 h, or `null`), `payment_tx` (lowercase hex). `refund_url` (static text `https://apibase.pro/r/<receipt_id>.refund.json`, written at issuance; absent on receipts issued before T-0659). `upstream_tx` (optional, upstream-paid tools only, see [Upstream-paid providers](#upstream-paid-providers)). The sibling resource is `{receipt_id, status, amount_atomic, rail, detected_at, refund_tx, sent_at, reason}`, shown only when APIbase owes the payer a refund for this receipt.
- **Never included.** Request body, response body, headers, IP, user agent, API keys, retry or idempotency identifiers. The response body is not part of the receipt; it is held separately for the payer (next item).
- **Result for 24 h (T-0554).**
  - Storage: when a billed x402/MPP call issues a public receipt, the response body (as sent to the caller) is stored in Redis under `result:{receipt_id}` with a 24 h TTL, only if its size is at most 64 KiB and the payer is not an internal wallet; otherwise nothing is stored and the receipt says `result_retained_until: null`. The receipt carries `retrieve_url` (`https://apibase.pro/x402/retrieve/<receipt_id>`); REST announces it in `X-APIbase-Retrieve`, MCP in the result `_meta["apibase/retrieve_url"]`.
  - Retrieve: `GET /x402/retrieve/<receipt_id>` with headers `X-Payer-Address` (the receipt `payer`) and `X-Payer-Signature` = EIP-191 `personal_sign` by the payer wallet over the exact string `apibase-retrieve:<receipt_id>:<unix minute>` (the server accepts the current and the previous minute). Wrong or missing signature: `401 retrieve_signature_invalid`. Result present: `200 {receipt_id, status:"delivered", charged:false, upstream_status, response_sha256, result}`. Expired or never stored: `410 {receipt_id, status:"delivered", result_retained_until, response_sha256, message}` (the receipt proves what was delivered). Unknown receipt: `404`. Receipt store or result store unreachable: `503 retrieve_unavailable` (retry later; nothing is charged).
  - Free: the route never charges and never issues a receipt. MPP payers whose credential key is not secp256k1 cannot sign EIP-191 and get `401 retrieve_unsupported_key`; contract wallets are not supported either.
- **Attestation.** Anyone can ask GenLayer validators to check a receipt against its USDC transfer on Base at `https://apibase.pro/attest/?r=<receipt_id>` (contract address, network and fee in the [README](../README.md)). Fee and reset notes are on the page itself.
- **Load note for validators.** Validators fetch each receipt several times within one minute. This is expected load, served from cache.

## Refunds owed by APIbase

- **Ledger.** Every amount APIbase owes a payer (a failed MPP call, a failed x402 settle that landed on chain, the APIbase fee share of a duplicate order payment) is one row in `refund_ledger`, in USD, on the rail it was paid on, to the paying wallet. The refund state of a receipt is served next to it at `https://apibase.pro/r/<receipt_id>.refund.json`.
- **Weekly batch.** A job pays the ledger every Monday at 07:00 UTC, one transfer per payer and rail, back to the wallet that paid. A row younger than 24 hours waits for the next run.
- **Threshold.** A payer is paid when what is owed is at least ten times the live network fee of that transfer, and never below $0.01. A smaller amount carries forward and never expires; after 90 days it is paid once the fee is at most half of it.
- **Funds.** Refunds are paid from a dedicated refund wallet per rail (Base USDC, Tempo USDC.e) that holds operator funds only. The key is generated and held on the server; it is not the revenue wallet and not the gas wallet.
- **Policy JSON scope.** `policy/refunds.json` lists the Base refund wallet only (it covers the Base dispute claims); the Tempo refund wallet is listed in `GET /health/refund-wallet`. The first live weekly run is Monday 2026-11-16 07:00 UTC.
- **Disputes.** The refund policy is published as versioned JSON at `https://apibase.pro/policy/refunds.json` (claims, booking window, wallets, caps; its sha256 is pinned in the GenLayer dispute contract). A REFUND verdict of that contract is executed by APIbase's refund worker: after recomputing the same rule from the same documents it books the debt in this ledger, and the weekly payout pays it under the published caps; a verdict above the per-refund cap waits for the operator, and there is one refund per payment transaction, ever. A mismatch between verdict and recomputation pays nothing and raises an alert. Anyone can file from a browser wallet at `https://apibase.pro/dispute/?r=<receipt_id>` (billed receipt) or `https://apibase.pro/dispute/?tx=<payment_tx>` (payment without a receipt): the page shows what the rule would decide before you sign (no chain read is awaited by the page; a store that does not answer shows `not_measured`), then files `dispute_receipt` / `dispute_payment` with a Bradbury test-GEN fee, never USDC. The two dispute contracts (receipt claim and payment claim) are read and filed on separately; the worker is off until `GL_DISPUTE_CONTRACT` (receipt) or `GL_DISPUTE_PAYMENT_CONTRACT` (payment) is set.
- **Operator only.** The kill switch, the per-run, per-payer and 30-day caps and the wallet ceiling are operator settings; an agent cannot change them. `GET /health/refund-wallet` shows the wallet addresses, balances, whether payouts are enabled and the last run, never a key.

## Upstream-paid providers

Some providers are themselves paid per call over x402 or MPP. For them APIbase pays the provider's own 402 from a dedicated payer wallet and resells the call at a published markup; the buyer pays APIbase exactly as for any other tool (T-0655).

- **Provider config.** `config/tool_provider_config.yaml` → `upstream_pay.<provider>: {rail: x402|mpp, network, asset, listed_price_usd, max_price_usd, pay_to_allowlist: [addr...], tools: {<tool_id>: {method, url}}}`, validated at load (zod, closed set: x402 on Base `eip155:8453`/`eip155:84532`, MPP on Tempo `eip155:4217`/`eip155:42431`; `max_price_usd` must not exceed the tool's `price_usd`). An invalid block disables every upstream-paid tool.
- **Price, locked in our 402.** The tool's `price_usd` = ceil_to_grid(provider's listed price × (1 + `UPSTREAM_MARKUP_BPS`/10000)), grid $0.001, markup 2000 bps (20 %), written into the YAML at onboarding (`upstreamToolPriceUsd`; a test fails when the YAML and the formula disagree) and never computed per request. The buyer's 402 is fixed as for every tool; the upstream price is read from the provider's 402 and must fit under `max_price_usd`. The ledger records what APIbase paid in `execution_ledger.upstream_cost_usd`; the tool's cost source is `upstream_402`.
- **Payer wallet.** `UPSTREAM_PAYER_KEY_BASE` (x402) and `UPSTREAM_PAYER_KEY_TEMPO` (MPP), generated on the server by `scripts/server-wallet-init.sh <ENV_NAME> <base|tempo>` exactly as the refund keys (one key per name, no backup, address recorded, never logged). At use the payer address is compared with the operator gas wallet, the revenue wallets and the refund wallets and with its record: equal or different from the record = the rail is off. The operator funds it by hand, start $30, ceiling `UPSTREAM_PAYER_CEILING_USD` ($100).
- **Before any charge.** The pre-payment check answers 503 `tool_unavailable` with `retry_after` and `status_reason` (`upstream_payer_key_missing`, `upstream_payer_key_mismatch`, `upstream_payer_balance_low`, `upstream_payer_balance_unknown`, `upstream_daily_cap_reached`) when the key is absent or mismatched, the payer balance (read at most once per minute) is below 2 × `max_price_usd`, or the provider's spend today would pass `UPSTREAM_DAILY_CAP_USD_PER_PROVIDER` ($5, Redis counter per UTC day; the upstream price is reserved against it just before signing and is not released if the paid request then fails or is refused). Nothing is charged.
- **Call order, x402 buyer.** Verify the buyer's payment → call the provider and read its 402 → refuse, before signing, when no offer matches the network, the asset, a `pay_to_allowlist` address and `max_price_usd` (`upstream_network_mismatch`, `upstream_asset_mismatch`, `upstream_payto_not_allowed`, `upstream_price_exceeded`; the buyer is not charged) → reserve the daily cap → sign with the payer key → provider 200 → deliver → settle the buyer. Any upstream failure stops the pipeline before settlement: the buyer is not charged. If the provider took our payment without a 200, the loss (at most `max_price_usd`) is counted as `upstream_loss` (log line, metric, alert).
- **Call order, MPP buyer.** The MPP charge is settled before the call; the same upstream flow runs, and any upstream failure books the refund in `refund_ledger` with reason `upstream_failed:<code>` (the note carries `upstream_loss` when APIbase paid the provider). Refunds are paid as in [Refunds owed by APIbase](#refunds-owed-by-apibase).
- **Only paid buyers.** An upstream-paid tool is served only to a call paid over x402 or MPP; a prepaid-balance call gets 503 `tool_unavailable`. A paid upstream request is never retried.
- **Receipt.** The public receipt carries the optional key `upstream_tx` (the provider-side settlement transaction) when the provider returned one.
- **Metrics and alerts.** `upstream_pay_total{provider,result}`, `upstream_spend_usd_total{provider}`, `upstream_payer_balance_usd{rail}`; alerts: payer balance low (`UPSTREAM_PAYER_LOW_BALANCE_USD`, $5), daily cap hit, `upstream_loss` in the last hour.

## Authentication

| Method | Header | Format |
|--------|--------|--------|
| API Key | `Authorization` | `Bearer ak_live_<32hex>` |
| x402 Payment | `X-Payment` | signed payment payload |
| MPP Payment | `Payment-Authorization` | `Payment <credential>` (via `mppx` SDK; `Authorization: Payment <credential>` is also read when no Bearer key is sent) |

Auto-registration: agents get API keys instantly on first request. No forms, no approval.

## Error Codes (Agent-Friendly)

Every error response includes machine-readable recovery hints:

```json
{
  "error": "rate_limit_exceeded",
  "error_code": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests",
  "request_id": "abc123",
  "suggested_action": "retry_after_delay",
  "documentation_url": "https://apibase.pro/frameworks#rest",
  "retry_after": 15
}
```

| HTTP | Code | `suggested_action` |
|------|------|--------------------|
| 400 | `bad_request` / `schema_validation_failed` | `fix_request` |
| 401 | `unauthorized` | `fix_request` |
| 402 | `payment_required` | `add_payment` |
| 404 | `not_found` | `use_different_tool` |
| 429 | `rate_limit_exceeded` | `retry_after_delay` |
| 502 | `bad_gateway` | `retry_after_delay` |
| 503 | `service_unavailable` | `retry_after_delay` |

Idempotency: the IDEMPOTENCY stage fails open on Redis errors only while `accounts.balance_usd` is refund-only (operator decision 2026-09-15); a top-up-able balance requires it to fail closed.

## Integrator orders

Orders placed through a merchant storefront (`/mcp/m/<slug>`, `/integrator`) use the same two rails but are not tool calls: they are paid to the **merchant's** wallet taken from the quote, never to the platform `payTo`. Tool-call settlement above is unchanged.

- **Binding from the quote.** The amount, the recipient wallet and (on Tempo) the splits are read from the `shop_quotes` row in PG — server data only, never from the request. A credential or authorization for any other amount or recipient is refused (`payment_amount_mismatch`). A Tempo payment is tied to its quote by the challenge id (stored in `shop_quotes.mpp_challenge_id`) and the receipt's transaction hash; no custom payment reference is added.
- **Settle before delivery.** An order is delivered only after the USDC transfer has a successful receipt; a payment that is still unconfirmed leaves the order `PAYING` (`202 payment_pending`) and is reconciled on-chain, never assumed.
- **Tempo: `splits`.** The challenge carries `recipient = payout_wallet_tempo`, `amount = total` and, only while the Integrator fee is on, one split to the platform fee wallet — the fee is taken inside the same transaction.
- **Base: fee-split or receivable.** A client that sends one authorization pays the merchant wallet exactly `total_usd`; the Integrator fee is then not deducted in the transfer but booked as a receivable from the merchant and invoiced. While the fee is on and `INTEGRATOR_FEE_WALLET_BASE` is set, the 402 also carries `accepts[0].extra.fee_split = {v, fee_to, fee_amount, merchant_amount, how}`. A client that supports it signs a second EIP-3009 `TransferWithAuthorization` to `fee_to` for `fee_amount`, sends it as `payload.feeAuthorization` (`{authorization, signature}`) and signs the first authorization for `merchant_amount`. Both authorizations must come from the same payer and carry different nonces; both nonces are claimed or neither. The two transfers settle in one Multicall3 `aggregate3` call with `allowFailure = false` (both land or neither), the order row gets `fee_settlement = in_tx` and the fee ledger row is `collected`. Any other amount, recipient or payer is refused with `payment_amount_mismatch`.
- **Idempotent x402 payments (`payment-identifier`).** The order 402 declares the optional x402 `payment-identifier` extension in `extensions` (tool-call 402s do not). A payer that adds an `id` (16-128 characters) to the payment payload gets one answer per id for 24 hours: the same id with the same request returns the stored response (`order_id`, `state`, `tx_hash`; never the `fulfillment`, which is read with `order.get`) without a second verify or settle; the same id with another quote, amount, recipient or payer is `409 payment_identifier_conflict`; the same id while the first request is still running is `409 payment_in_flight`. The 409 body carries `retry_after` (seconds; also the `Retry-After` header on REST), `order_id` when known and `poll`; a conflict carries `reason` (`payer` | `request`); a repeated answer carries `replayed: true`. A `payment_in_flight` row older than 180 s is resolved from the order (paid → the order, `PAYING` → 409 with `order_id`, failed or none → pay again). Field meaning: see the `payment_identifier_conflict` and `payment_in_flight` sections of `static/integrator/agent-guide.md`. A request that fails with an error is not remembered, so it can be retried with the same id. Without the extension nothing changes and the nonce claim still refuses a repeated authorization.
- **Re-pay after a failed settle.** An EIP-3009 authorization cannot execute after its `validBefore`, so a failed settle is re-checked on chain (`authorizationState`) at +15 s, +45 s, +120 s and at `validBefore` + 60 s, and by the 60-second reconcile job as the backstop. `PAYMENT_FAILED` -> `PAYING` is refused with `409 payment_in_flight` (`retry_after` = seconds until `validBefore` + 60 s, minimum 5; `order_id`) while any failed payment of the order can still land; if it did land, it is refunded as a payment that arrives twice (next bullet). Reconcile fails an order for good only after a successful read of the chain; an RPC outage raises a `payment_unknown_rpc` flag instead.
- **Duplicate or late payment.** A payment that arrives twice or after the order closed is refunded to the paying wallet by the seller within 7 days (a system refund request on the order); APIbase refunds its own fee share automatically — see [Refunds owed by APIbase](#refunds-owed-by-apibase).
- **One MPP challenge per quote.** The challenge (`id`, expiry, header) is stored on the quote and reused until it expires, so a retry gets the same challenge and a paid credential cannot be replayed against a second one.
- **Fee-enable checklist.** `INTEGRATOR_FEE_ENABLED=true` needs both `INTEGRATOR_FEE_WALLET` (Tempo) and `INTEGRATOR_FEE_WALLET_BASE` (Base) set to 0x addresses, whichever rails are on today; the API, worker and outbox processes refuse to start with the switch on and either one missing.
- **Numbers.** Fee, minimum fee and minimum order are published through `sync-counts` (`INTEGRATOR_FEE_PCT`, `INTEGRATOR_MIN_ORDER`) from `static/.well-known/mcp.json` → `integrator`; none is typed by hand on a public page.
- **Legal.** Legal documents: `/legal` (versions and hashes).
