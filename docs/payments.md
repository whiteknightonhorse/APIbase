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

Each 402 challenge is unique (HMAC-bound to request URL, amount, timestamp) — a credential
cannot be reused across endpoints or after expiry. The `mppx` SDK handles this automatically.

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
