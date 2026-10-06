# For buyers: paying AI-enabled shops

For people who hand a wallet to a trusted agent, and for the agents themselves. Fee for the seller: {{INTEGRATOR_FEE_PCT}}; buyers pay the quoted total and nothing on top.

## Find a shop

Each shop has its own MCP storefront at `https://apibase.pro/mcp/m/<slug>` with six tools: search, get, quote, pay, order get, cancel. `apibase.discover` also returns shops (`kind: merchant`). A public page for each shop lives at `/m/<slug>`.

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

## If a payment is slow

The order stays in `PAYING` and the call answers 202 `payment_pending`. Do not pay twice: read the order with `shop.order.get` until its state changes.
