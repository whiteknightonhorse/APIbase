# For buyers: paying AI-enabled shops

For people who hand a wallet to a trusted agent, and for the agents themselves. Fee for the seller: {{INTEGRATOR_FEE_PCT}}; buyers pay the quoted total and nothing on top.

## Find a shop

Each shop has its own MCP storefront at `https://apibase.pro/mcp/m/<slug>` with eight tools: search, get, quote, pay, order get, cancel, subscription get, subscription cancel. Find shops with `apibase.discover`: pass what the buyer wants as `intent`; shops come back as results of `kind: "merchant"` (add `kind=merchant` to get shops only). A public page for each shop lives at `/m/<slug>`.

## Set limits in your wallet

Limits live in the wallet, not in the prompt: a prompt can change what an agent wants; it cannot change what its wallet can sign.

- **Per payment and per session:** set both in the client (Coinbase Payments MCP, or `@x402/fetch` `spendControls`; the $1 default is described in /integrator/agent-guide#x402-clients-and-the-1-default-cap). An agent that reaches a limit stops and asks you.
- **Per agent:** one wallet, or one Tempo access key, per agent, funded with its share (see "Several agents, one budget" below).
- **The sum:** a cap set inside one shop's account covers that shop only; with ten shops you have ten caps and nothing that adds them up. The paying wallet is the one place that does: fund it with the budget, and every shop, API and agent draws from the same ceiling.
- **Human confirmation:** when a quote carries `requires_human_confirmation` (total above `limits.human_confirm_above_usd`, default $100), the client asks the human first (see /integrator/docs#quotes).

How to get a wallet: /integrator/wallet.

## Several agents, one budget

No cap across several agents or wallets is imposed by APIbase or by any shop: nobody here holds your keys or your balance. A shared budget is enforced by how you fund and authorize the agents' wallets.

- **On Base (x402, USDC):** a payment is signed by the wallet that holds the USDC, so each agent's hard cap is the balance of its own wallet. Give every agent its own wallet, fund each one with only its share, and top them up from one treasury wallet on your own schedule. The fleet budget is the sum you fund; an agent that runs dry stops and asks you. Keep the per-payment and per-session limits in each client as before.
- **On Tempo (MPP):** keep one funding wallet and authorize one access key per agent with a spending limit and an expiry (the same `accessKey.authorize` step described under subscriptions below). The sum of the limits is the fleet budget; revoke one key to stop one agent without touching the others.
- **What the server can see:** the boundary is the paying wallet, not an agent or a session. A mutated request is a new purchase, and idempotency never prevents it. Cross-agent budgets live in how you fund wallets, or in an agent-side budget middleware of your choice.
- **What you can reconcile against:** every order you pay can be read back with `shop.order.get`, which returns the state, the transaction hash and the refund policy.

If you need a cap enforced by the shop rather than by the wallet, write to support@apibase.pro — today we deliberately do not hold that role.

## The price is fixed by the quote

A quote is a price snapshot with a stock hold, valid for a stated number of minutes. The agent pays exactly the quoted total, to exactly the shop's payout wallet. A signed authorization for any other amount or address is refused (`payment_amount_mismatch`).

## Buy step by step (REST)

1. `POST /api/v1/shop/quotes` with `{merchant, items}` and no key. An anonymous quote carries `buyer_token`; keep it and send it as `Authorization: Bearer <buyer_token>` on every later call for this order (pay, order get, cancel, dispute).
2. `GET` or `POST /api/v1/shop/quotes/<id>/pay` without a payment is the 402 challenge. Check that `accepts[0].payTo` equals the shop's payout wallet and `amount` equals the quote.
3. `POST /api/v1/shop/quotes/<id>/pay` with the signed `X-Payment` (any x402 v2 client) answers `200 paid` with `order {order_id, state, tx_hash, fulfillment?}`, or `202 payment_pending`.
4. A `state` of `PAID` means the shop has not delivered yet: poll `GET /api/v1/shop/orders/<order_id>` with the Bearer until `FULFILLED`. `fulfillment` appears there, for the paying identity only (`viewer: payer`, see /integrator/docs#orders).
5. `fulfillment` is always a string. When it begins with `{"type":"url"` it is the JSON text of `{type, urls[]}`: parse it. The links are the shop's own and may expire or be limited by the shop; APIbase does not add or check limits.
6. Repeating `/pay` without a payment on a quote you already paid returns `already_placed` with the same order; nothing is charged twice.
7. `waive_withdrawal: true` in the pay body is yours to send, only for digital content you want delivered without the withdrawal window; the order then closes at once and cannot be cancelled.

Errors: see /integrator/agent-guide#error-codes.

## What we never ask for

Integrator never asks for your private keys or seed phrase, in any tool, page or message. A wallet signs one payment authorization per order; nothing else is needed. If anything asks for a key, stop.

## What you can verify

- No card number, CVV or open address is stored by APIbase. Personal data a product needs is encrypted under the seller's key before it is sent.
- The payment is an authorization for the exact quoted amount to the exact payout address; you can check the transfer on a block explorer.
- Goods are delivered only after the transfer has a successful receipt.
- Every claim above can be checked in your own orders: `shop.order.get` returns the state, the transaction hash and the refund policy. What each caller sees (`viewer`: `payer` or `public`) is defined in [the Orders section of the integrator docs](/integrator/docs).

## What stays outside our guarantees

- Spending limits are set and enforced by your wallet.
- Human confirmation is done by your agent's client.
- Safekeeping of a seller's key is the seller's.
- Refunds are the seller's duty under its stated policy and the refund framework: /legal/refund-framework.
- USDC is issued by Circle, which can block addresses under its terms; a lost key means lost funds; stablecoin balances are not insured deposits. Keep agent wallets small and funded from a treasury you control.

## Streams: pay by the second

A stream product is paid with a deposit into a payment channel that pays the seller's wallet: you deposit at least the minimum shown on the product, the agent signs small vouchers off-chain as the stream runs, and the seller settles in batches. The part of the deposit that was not consumed is returned to you. If the seller does not respond, you call `requestClose` and, after the waiting period, `withdraw`. After you request a close on-chain you can withdraw the unspent deposit yourself once the grace period of {{STREAM_CLOSE_GRACE_S}} seconds has passed. Streams are paid over MPP only, never with `X-Payment`.

## Subscriptions: pre-sign the next periods (Base)

By default an agent renews a subscription by paying each period's quote. On Base you can instead sign the next 1 to 12 periods in advance (`shop.subscription.preauthorize`): each signature is one USDC authorization for one period, to the shop's payout wallet, for the plan price, valid from the start of that period for at most 72 hours. Nobody can use it for another amount, another recipient or another time. A client that signs a batch with viem is in `scripts/shop/examples/preauthorize-base.ts`.

To revoke a stored authorization, either cancel the subscription (`shop.subscription.cancel`: nothing stored is executed afterwards) or cancel it on-chain: call `cancelAuthorization(authorizer, nonce, signature)` on the USDC contract, where `signature` signs the `CancelAuthorization` message for your `nonce`. An authorization that was canceled on-chain is never executed.

## Subscriptions: let the shop renew with its own key (Tempo)

On Tempo a shop can renew your subscription with an access key that it keeps itself. Your agent authorizes only that key's **address** (`accessKey.authorize` from viem/tempo) with a spending limit of the plan price times the remaining periods and an expiry, then calls `shop.subscription.confirm_pull`. The shop pays the gas of each renewal; every renewal is checked on-chain against the plan price, the shop's payout wallet and a memo that names the subscription and the period.

To stop it, cancel the subscription (`shop.subscription.cancel`: the shop has nothing left to renew) or revoke the key yourself: call `accessKey.revoke` for the key address from your paying account. A revoked key never renews again; the next period is then yours to pay explicitly.

## Subscriptions: let the platform renew with a periodic key (Tempo, day and week plans)

For a plan that renews every day or every week the quote of period 1 can carry `pay.mpp_subscription`. Pay it with an mppx client (0.9.3 or newer) at `POST /api/v1/shop/quotes/<id>/pay?intent=subscription`: the 402 challenge has intent `subscription`, and your client signs one periodic key authorization for a key address that belongs to APIbase. Period 1 is charged right away; each later period is renewed by the platform with that key, which also pays the gas. You never sign a renewal and no private key of yours is stored. `shop.subscription.get` shows `pull_mode: mpp_subscription` and `renewal_key`, the address you authorized.

Which mode applies: `none` (you pay each period's quote), `base_preauth` (Base, signatures stored ahead), `tempo_keychain` (the shop renews with its own key) and `mpp_subscription` (this one, day and week plans only; monthly plans keep the other modes).

To stop it, cancel the subscription (`shop.subscription.cancel` ends all renewals but does not touch the chain) and revoke the key yourself: call `accessKey.revoke` from viem/tempo for the `renewal_key` address from your paying account. If the key is revoked, expired or its limit no longer covers a period, the period stays unpaid and you pay the renewal quote explicitly before it is canceled unpaid.

## If a payment is slow

The order stays in `PAYING` and the call answers 202 `payment_pending`. Do not pay twice: read the order with `shop.order.get` until its state changes.
