# For buyers: paying AI-enabled shops

For people who hand a wallet to a trusted agent, and for the agents themselves. Fee for the seller: {{INTEGRATOR_FEE_PCT}}; buyers pay the quoted total and nothing on top.

## Find a shop

Each shop has its own MCP storefront at `https://apibase.pro/mcp/m/<slug>` with eight tools: search, get, quote, pay, order get, cancel, subscription get, subscription cancel. `apibase.discover` also returns shops (`kind: merchant`). A public page for each shop lives at `/m/<slug>`.

## Set limits in your wallet

Spending limits belong to your wallet or your agent's client, not to the shop and not to APIbase. Before you let an agent pay, set a per-payment and a per-session limit there (for example in Coinbase Payments MCP, or with Tempo access keys). If an agent reaches its limit, it stops and asks you. How to get a wallet: /integrator/wallet.

## The price is fixed by the quote

A quote is a price snapshot with a stock hold, valid for a stated number of minutes. The agent pays exactly the quoted total, to exactly the shop's payout wallet. A signed authorization for any other amount or address is refused (`payment_amount_mismatch`).

## What we never ask for

Integrator never asks for your private keys or seed phrase, in any tool, page or message. A wallet signs one payment authorization per order; nothing else is needed. If anything asks for a key, stop.

## What you can verify

- No card number, CVV or open address is stored by APIbase. Personal data a product needs is encrypted under the seller's key before it is sent.
- The payment is an authorization for the exact quoted amount to the exact payout address; you can check the transfer on a block explorer.
- Goods are delivered only after the transfer has a successful receipt.
- Every claim above can be checked in your own orders: `shop.order.get` returns the state, the transaction hash and the refund policy.

## What stays outside our guarantees

- Spending limits are set and enforced by your wallet.
- Human confirmation is done by your agent's client.
- Safekeeping of a seller's key is the seller's.
- Refunds are the seller's duty under its stated policy and the refund framework: /legal/refund-framework.

## Streams: pay by the second

A stream product is paid with a deposit into a payment channel that pays the seller's wallet: you deposit at least the minimum shown on the product, the agent signs small vouchers off-chain as the stream runs, and the seller settles in batches. The part of the deposit that was not consumed is returned to you. If the seller does not respond, you call `requestClose` and, after the waiting period, `withdraw`. Streams are paid over MPP only, never with `X-Payment`.

## Subscriptions: pre-sign the next periods (Base)

By default an agent renews a subscription by paying each period's quote. On Base you can instead sign the next 1 to 12 periods in advance (`shop.subscription.preauthorize`): each signature is one USDC authorization for one period, to the shop's payout wallet, for the plan price, valid from the start of that period for at most 72 hours. Nobody can use it for another amount, another recipient or another time. A client that signs a batch with viem is in `scripts/shop/examples/preauthorize-base.ts`.

To revoke a stored authorization, either cancel the subscription (`shop.subscription.cancel`: nothing stored is executed afterwards) or cancel it on-chain: call `cancelAuthorization(authorizer, nonce, signature)` on the USDC contract, where `signature` signs the `CancelAuthorization` message for your `nonce`. An authorization that was canceled on-chain is never executed.

## Subscriptions: let the shop renew with its own key (Tempo)

On Tempo a shop can renew your subscription with an access key that it keeps itself. Your agent authorizes only that key's **address** (`accessKey.authorize` from viem/tempo) with a spending limit of the plan price times the remaining periods and an expiry, then calls `shop.subscription.confirm_pull`. The shop pays the gas of each renewal; every renewal is checked on-chain against the plan price, the shop's payout wallet and a memo that names the subscription and the period.

To stop it, cancel the subscription (`shop.subscription.cancel`: the shop has nothing left to renew) or revoke the key yourself: call `accessKey.revoke` for the key address from your paying account. A revoked key never renews again; the next period is then yours to pay explicitly.

## If a payment is slow

The order stays in `PAYING` and the call answers 202 `payment_pending`. Do not pay twice: read the order with `shop.order.get` until its state changes.
