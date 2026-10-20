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
| Price range | $0.001 – $1.00 per call |
| SDK | `@x402/core`, `@x402/evm`, `@x402/extensions` 2.28 (spec v2, V1 payloads accepted) |
| Settlement | **Self-hosted on-chain facilitator** — no third-party SaaS in the payment path. See [`x402-facilitator.md`](x402-facilitator.md). |

APIbase runs its own x402 facilitator in-process: every successful payment is settled by
submitting `transferWithAuthorization` directly on Base via [`viem`](https://viem.sh). There
is no Coinbase CDP, no PayAI, no third-party intermediary in the critical path of a paid
request. Implementation: [`src/payments/local-facilitator.ts`](../src/payments/local-facilitator.ts).
PayAI HTTP facilitator stays wired as transparent in-client fallback (30 s timeout per call).

Order of events on a paid x402 call stays **verify before, deliver, settle after**: the payment is
verified and bound to the tool price before the provider is called, the result is delivered, and the
on-chain settle runs afterwards. Every 402 response carries `Cache-Control: no-store`.

### Unknown settlement outcome (T-0428)

A settle has three outcomes, not two:

| Outcome | Signal | Who resolves it | When |
|---|---|---|---|
| settled | `success:true` | nobody, done | immediately |
| failed | `success:false` with any other `errorReason`, or any other throw | operator pages (`x402_settle_failed`) | immediately |
| unknown | `success:false, errorReason:'settlement_pending', transaction:<hash>` (broadcast, receipt not seen) or `FacilitatorTimeoutError` (30 s, outcome indeterminate) | the chain reconcile, by reading the chain | within 60 s per tick |

Law: unknown is resolved only by reading the chain, and nobody calls settle again for the same authorization.

- **API tools** (`src/pipeline/stages/x402-settle.ts`): one outbox event `x402_settle_pending {request_id, execution_id, tool_id, payer, amount_usd, tx_hash?, network, nonce, valid_before}`, never `x402_settle_failed`; the ledger row gets `x402_settle_state='pending'` and `settle_tx_hash`. The worker job `x402-settle-pending` (every 60 s, owns that outbox type only) reads `receiptOk(tx_hash)`, then `authorizationUsed(payer, nonce)` plus the USDC transfer: settled closes the event and flips the ledger row to `settled`. An authorization that is still unused after `valid_before` writes `x402_settle_failed` with reason `pending_expired_unsettled` (the revenue-leak page). Otherwise the row waits for the next tick; an RPC failure leaves it untouched.
- **Shop orders** (`src/pipeline/stages/shop-settle.ts`): both signals return `pending` (order stays `PAYING`, the hash is stored on the payment row). `shop-payment-reconcile` (every 60 s) checks that receipt first, then `authorizationState`/`Transfer`. Every other throw is still `PAYMENT_FAILED`.

### MCP (T-0429)

Transport on `/mcp`, same rules as REST: the x402 payment travels in the `X-Payment` header or in `params._meta["x402/payment"]` of a `tools/call` (x402 MCP transport v2; key names `x402/payment`, `x402/payment-response` from `@x402/mcp` 2.28, a dev dependency used only by tests). Header wins; both present with different payloads is a 400; explicit nulls on optional fields are dropped before parsing. `src/middleware/x402.middleware.ts` re-encodes a `_meta` payment as the X-Payment value, so ESCROW binds both the same way.

A 402 tool result keeps `isError:true` and its JSON text and adds the PaymentRequired object of the HTTP 402 body in `_meta["x402/payment-required"]` and in `structuredContent` (the official transport reads `structuredContent`; the `_meta` key is our addition, the spec defines none for the challenge). A settled call adds `_meta["x402/payment-response"]` `{success, transaction, network, payer}`. `maxTimeoutSeconds` is 120 (the validBefore window; @x402/mcp clients derive their tool-call timeout from it).

Difference from x402 2.24 ("withhold the result when the after-call settle fails"): APIbase verifies before the call and settles after; an unsettled call is reconciled (T-0428), the result is not withheld.

MPP: the credential is read from `Payment-Authorization: Payment <cred>` first, then `Authorization: Payment <cred>` (mppx < 0.9 clients); both present is a 400. Only the `/mcp` challenge is created with mppx `requiresAuth` (`header="Payment-Authorization"`), so agents keep `Authorization: Bearer <api key>`; tool-call routes keep the default.

## MPP (Machine Payments Protocol)

| Field | Value |
|-------|-------|
| Protocol | **MPP** (IETF draft-ryan-httpauth-payment) |
| Token | USDC.e on Tempo (chain 4217) |
| SDK | `mppx` (npm) |
| Agent setup | [wallet.tempo.xyz](https://wallet.tempo.xyz) |
| Discovery | [mpp.dev/services](https://mpp.dev/services) |
| Price range | $0.001 – $1.00 per call |

No subscriptions, no minimums. Agent pays only for successful calls; failed provider calls
are auto-refunded.

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
const response = await fetch('https://apibase.pro/api/v1/tools/nasa.apod/call', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ak_live_<your_key>',
    'X-API-Key': 'ak_live_<your_key>',  // preserved when mppx replaces Authorization
  },
  body: JSON.stringify({}),
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

Every tool call that was billed on-chain (x402 on Base, or MPP on Tempo) gets one immutable public receipt, written after billing and after the response is sent. Calls that were not billed get **no** receipt in v0 (nothing to attest), and neither do calls paid from a prepaid balance (no on-chain payment transaction).

- **Where to find it.** REST: response header `X-APIbase-Receipt: https://apibase.pro/r/<receipt_id>.json`. MCP: the tool result `_meta` carries `"apibase/receipt_url": "https://apibase.pro/r/<receipt_id>.json"`.
- **Fetch.** `GET https://apibase.pro/r/<receipt_id>.json` is public: `Content-Type: application/json`, `Cache-Control: public, max-age=31536000, immutable`, `Access-Control-Allow-Origin: *`. An unknown id answers `404` with `{"error":"no such receipt"}`. The receipt is written just after the response, so a fetch in the first moments can still 404; retry.
- **Immutable.** Receipts are write-once; there is no update or delete path. The served bytes are exactly the stored bytes.
- **Body.** Canonical JSON (sorted keys, no whitespace), schema `apibase-receipt/1`:
  `schema`, `receipt_id` (32 hex chars), `issued_at` (ISO 8601 UTC), `tool`, `upstream_status`, `response_sha256` (sha256 of the exact response body sent), `billed` (always `true`), `rail` (`x402-base` or `mpp-tempo`), `chain_id`, `asset` (`USDC`), `amount_atomic` (integer string, 6 decimals), `payer`, `payee`, `payment_tx` (lowercase hex).
- **Never included.** Request body, response body, headers, IP, user agent, API keys.
- **Load note for validators.** Validators fetch each receipt several times within one minute. This is expected load, served from cache.

## Authentication

| Method | Header | Format |
|--------|--------|--------|
| API Key | `Authorization` | `Bearer ak_live_<32hex>` |
| x402 Payment | `X-Payment` | Base64 payment receipt |
| MPP Payment | `Authorization` | `Payment <credential>` (via `mppx` SDK) |

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
- **Idempotent x402 payments (`payment-identifier`).** The order 402 declares the optional x402 `payment-identifier` extension in `extensions` (tool-call 402s do not). A payer that adds an `id` (16-128 characters) to the payment payload gets one answer per id for 24 hours: the same id with the same request returns the stored response (`order_id`, `state`, `tx_hash`; never the `fulfillment`, which is read with `order.get`) without a second verify or settle; the same id with another quote, amount, recipient or payer is `409 payment_identifier_conflict`; the same id while the first request is still running is `409 payment_in_flight`. A request that fails with an error is not remembered, so it can be retried with the same id. Without the extension nothing changes and the nonce claim still refuses a repeated authorization.
- **One MPP challenge per quote.** The challenge (`id`, expiry, header) is stored on the quote and reused until it expires, so a retry gets the same challenge and a paid credential cannot be replayed against a second one.
- **Numbers.** Fee, minimum fee and minimum order are published through `sync-counts` (`INTEGRATOR_FEE_PCT`, `INTEGRATOR_MIN_ORDER`) from `static/.well-known/mcp.json` → `integrator`; none is typed by hand on a public page.
