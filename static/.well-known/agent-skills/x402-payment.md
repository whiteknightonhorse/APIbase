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
| x402 | HTTP 402 (Coinbase) | USDC | Base mainnet, chain 8453 | `X-PAYMENT: <base64>` |
| MPP | Machine Payments Protocol (Stripe/Tempo) | USDC.e | Tempo mainnet, chain 4217 | `Authorization: Payment <base64url>` |

**Do not send both headers on the same request.** The server will reject the
second one.

Full metadata: <https://apibase.pro/.well-known/x402-payment.json>

## Flow

1. **Agent calls a paid tool without a payment header.**

   ```
   POST https://apibase.pro/mcp
   { "method": "tools/call", "params": { "name": "amadeus.flight_search", ... } }
   ```

2. **Server responds `402 Payment Required`** with a challenge describing
   accepted rails, recipient address, amount (USDC, 6 decimals), and nonce.

3. **Agent signs a payment voucher** for one of the accepted rails using its
   wallet SDK. See `x402` or `mppx` npm packages for ready-made helpers.

4. **Agent retries the same request with the payment header attached.** The
   server verifies on-chain (x402 via PayAI / CDP facilitator; MPP via direct
   RPC), escrows the charge in PostgreSQL, calls the provider, then finalizes
   the escrow into a ledger entry.

5. **Response includes** the tool output plus `X-Receipt-Id`. Agent can retrieve
   a verifiable receipt at `GET /x402/retrieve/<receipt-id>`.

## Idempotency

Include an `Idempotency-Key: <uuid>` header on retries so the server does not
double-charge when a client re-sends after a timeout. The ledger is
append-only; duplicate keys return the original response with `Idempotency-Replay: true`.

## Prices

Per-call cost ranges from **$0.001 to $0.035** depending on upstream cost.
Exact price per tool: `x-payment-info` in the OpenAPI spec
(<https://apibase.pro/.well-known/openapi.json>).

## Free tier

Tools that wrap free upstream APIs (government data, CC0 datasets) still charge
$0.001/call to cover infrastructure. There is currently no free-trial credit
for new agents; agents must arrive with funded wallets.

## SDK hints

- **mppx (MPP):** set `polyfill: false` in the SDK config. Without it the SDK
  intercepts every outbound `fetch`, including x402 calls on other hosts.
- **x402 middleware:** use `@x402/express`, `@x402/hono`, or `@x402/next` on
  the client side to auto-retry on 402 challenges.
