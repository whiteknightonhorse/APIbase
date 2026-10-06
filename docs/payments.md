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
| Settlement | **Self-hosted on-chain facilitator** — no third-party SaaS in the payment path. See [`x402-facilitator.md`](x402-facilitator.md). |

APIbase runs its own x402 facilitator in-process: every successful payment is settled by
submitting `transferWithAuthorization` directly on Base via [`viem`](https://viem.sh). There
is no Coinbase CDP, no PayAI, no third-party intermediary in the critical path of a paid
request. Implementation: [`src/payments/local-facilitator.ts`](../src/payments/local-facilitator.ts).
PayAI HTTP facilitator stays wired as transparent in-client fallback.

## MPP (Machine Payments Protocol)

| Field | Value |
|-------|-------|
| Protocol | **MPP** (IETF draft-ryan-httpauth-payment) |
| Token | USDC on Tempo (chain 4217) |
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

- **Binding from the quote.** The amount, the recipient wallet and (on Tempo) the memo and splits are read from the `shop_quotes` row in PG — server data only, never from the request. A credential or authorization for any other amount or recipient is refused (`payment_amount_mismatch`).
- **Settle before delivery.** An order is delivered only after the USDC transfer has a successful receipt; a payment that is still unconfirmed leaves the order `PAYING` (`202 payment_pending`) and is reconciled on-chain, never assumed.
- **Tempo: `splits`.** The challenge carries `recipient = payout_wallet_tempo`, `amount = total` and, only while the Integrator fee is on, one split to the platform fee wallet — the fee is taken inside the same transaction.
- **Base: fee-split or receivable.** A client that sends one authorization pays the merchant wallet exactly `total_usd`; the Integrator fee is then not deducted in the transfer but booked as a receivable from the merchant and invoiced. While the fee is on and `INTEGRATOR_FEE_WALLET_BASE` is set, the 402 also carries `accepts[0].extra.fee_split = {v, fee_to, fee_amount, merchant_amount, how}`. A client that supports it signs a second EIP-3009 `TransferWithAuthorization` to `fee_to` for `fee_amount`, sends it as `payload.feeAuthorization` (`{authorization, signature}`) and signs the first authorization for `merchant_amount`. Both authorizations must come from the same payer and carry different nonces; both nonces are claimed or neither. The two transfers settle in one Multicall3 `aggregate3` call with `allowFailure = false` (both land or neither), the order row gets `fee_settlement = in_tx` and the fee ledger row is `collected`. Any other amount, recipient or payer is refused with `payment_amount_mismatch`.
- **Idempotent x402 payments (`payment-identifier`).** The order 402 declares the optional x402 `payment-identifier` extension in `extensions` (tool-call 402s do not). A payer that adds an `id` (16-128 characters) to the payment payload gets one answer per id for 24 hours: the same id with the same request returns the stored response (`order_id`, `state`, `tx_hash`; never the `fulfillment`, which is read with `order.get`) without a second verify or settle; the same id with another quote, amount, recipient or payer is `409 payment_identifier_conflict`; the same id while the first request is still running is `409 payment_in_flight`. A request that fails with an error is not remembered, so it can be retried with the same id. Without the extension nothing changes and the nonce claim still refuses a repeated authorization.
- **One MPP challenge per quote.** The challenge (`id`, expiry, header) is stored on the quote and reused until it expires, so a retry gets the same challenge and a paid credential cannot be replayed against a second one.
- **Numbers.** Fee, minimum fee and minimum order are published through `sync-counts` (`INTEGRATOR_FEE_PCT`, `INTEGRATOR_MIN_ORDER`) from `static/.well-known/mcp.json` → `integrator`; none is typed by hand on a public page.
