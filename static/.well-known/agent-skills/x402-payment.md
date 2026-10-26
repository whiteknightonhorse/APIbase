---
name: x402-payment
description: How to pay for APIbase tools using x402 (USDC on Base) or MPP (USDC.e on Tempo). Covers the 402 challenge, payment construction, and the Payment-Required retry.
---

# Skill: Pay for APIbase tools

APIbase supports two HTTP-native payment rails in parallel. An agent chooses
one per request based on which wallet it controls.

## Rails

| Rail | Standard | Token | Network | Request header |
|---|---|---|---|---|
| x402 | HTTP 402 (x402 Foundation) | USDC | Base mainnet, chain 8453 | `X-PAYMENT: <base64>` |
| MPP | Machine Payments Protocol (Stripe/Tempo) | USDC.e | Tempo mainnet, chain 4217 | `Authorization: Payment <base64url>` |

**Do not send both rail headers on the same request.** The server will reject the
second one. Each rail has one currency: x402 pays USDC on Base, MPP pays USDC.e on
Tempo (pathUSD on the testnet). Other Tempo tokens are not accepted.

## Transports

Both rails work on two transports, with the same 402 challenge and the same price:

- **HTTP header:** `X-PAYMENT` (x402), `Authorization: Payment` (MPP).
- **MCP `/mcp`:** x402 in `params._meta["x402/payment"]` (receipt in result
  `_meta["x402/payment-response"]`); MPP in `Authorization: Payment` or, next to a
  Bearer API key, in `Payment-Authorization: Payment`.

Full metadata: <https://apibase.pro/.well-known/x402-payment.json>

## Flow

1. **Agent calls a paid tool without a payment header.**

   ```
   POST https://apibase.pro/mcp
   { "method": "tools/call", "params": { "name": "sabre.search_flights", ... } }
   ```

2. **Server responds `402 Payment Required`** with a challenge describing
   accepted rails, recipient address, amount (6 decimals; USDC on Base, USDC.e on
   Tempo), and nonce. Over `/mcp` the same challenge also arrives in the tool result
   `_meta` (`isError: true`). Challenges are valid for 120 seconds
   (`maxTimeoutSeconds`) and are never cached (`Cache-Control: no-store`).

3. **Agent signs a payment voucher** for one of the accepted rails using its
   wallet SDK. See `x402` or `mppx` npm packages for ready-made helpers.

4. **Agent retries the same request with the payment attached** (header or `_meta`). The
   server verifies on-chain (x402 via the self-hosted facilitator on Base, PayAI
   as fallback; MPP via direct RPC), escrows the charge in PostgreSQL, calls the provider, then finalizes
   the escrow into a ledger entry.

5. **Response includes** the tool output plus `X-APIbase-Receipt: https://apibase.pro/r/<id>.json`,
   an immutable public receipt (payer, payee, payment_tx, response_sha256). A response
   served from the dedup cache carries `X-APIbase-Charged: false` instead; see
   <https://github.com/whiteknightonhorse/APIbase/blob/main/docs/payments.md>.

## Idempotency

Calls are idempotent when you send `X-Idempotency-Key: <uuid>` (optional; 10 minutes,
per wallet), so the server does not double-charge when a client re-sends after a
timeout. Without it only the payment nonce protects you. The ledger is append-only.

## Prices

Per-call cost ranges from **$0.0005 to $29.99** depending on upstream cost.
Exact price per tool: `x-payment-info` in the OpenAPI spec
(<https://apibase.pro/.well-known/openapi.json>).

## Free tier

Tools that wrap free upstream APIs (government data, CC0 datasets) are priced
from $0.0005 per call; <!--free-tools-->8<!--/free-tools--> platform tools are free ($0). Paid tools are paid per call with x402 or MPP;
there is no self-service top-up and no free-trial credit (see <https://apibase.pro/pricing>).

## SDK hints

- **mppx (MPP):** set `polyfill: false` in the SDK config. Without it the SDK
  intercepts every outbound `fetch`, including x402 calls on other hosts.
- **x402 client:** use `@x402/fetch` (SDK 2.28) to auto-retry on 402 challenges.
  Clients on `@x402/fetch` >= 2.23 refuse amounts above $1 by default
  (`spendControls`); tools priced above $1 need `spendControls: false` or an
  explicit cap.
