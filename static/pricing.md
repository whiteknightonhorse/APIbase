# Pricing

Pay per call over the x402 protocol or MPP. No subscription, no seat fees, no monthly minimum. HTML version: https://apibase.pro/pricing

- Price: $0.0005–$29.99 per call (p90 $0.003)
- Rails: x402 / MPP (balance: refund credit)
- Minimum: $0

## Per-call price ranges

Every tool has a fixed, published USD price, set at or above the provider's cost where that cost is known; tools whose provider is free carry no upstream cost. There is no plan, no included quota, no overage fee — every call, at any volume, costs exactly its listed price.

| Tier | Price | Typical tools |
|---|---|---|
| Micro | under $0.01 | Free-upstream data — public government datasets, open-source lookups, simple reference data |
| Standard | $0.01 – $0.99 | Most tools — weather, finance, geocoding, entertainment, e-commerce lookups |
| Premium | $1 and above | Domain registration and two AIpush reports |

<!--tiers-->Micro (1349 of the tools, under $0.01). Standard (25 of the tools, $0.01–$0.99). Premium (3 of the tools, $1 and above: domain registration and two AIpush reports).<!--/tiers-->

Exact per-tool prices: full JSON catalog at https://apibase.pro/api/v1/tools (filter with `?tier=micro|standard|premium` or `?max_price=N`) or the human-readable catalog page https://apibase.pro/catalog.

## Per-audio-minute tools

`transcribe.submit` (speech-to-text) is priced per audio minute: `max($0.01, ceil(minutes) × $0.005)`, rounded up to a cent — 1 minute $0.01, 10 minutes $0.05, 30 minutes $0.15, 61 minutes $0.31. You declare `duration_seconds` (required, up to 4 hours); the 402 quote shows the computed price and the job is cut at the declared duration.

## Cache discount

A tool response is cached per its own TTL (<!--cache-ttl-->1 second to 30 days<!--/cache-ttl-->). A cache hit on x402 or MPP is still billed at 100%; the 10% price exists only on the credit-balance rail.

x402 and MPP payments are verified against the full listed price before the call runs, so there is no post-hoc discount on those rails. On x402 an identical repeated lookup by the same wallet within 2 minutes is answered from cache and not charged at all; the response carries `X-APIbase-Charged: false` and the original receipt. Each billed x402 or MPP call returns an `X-APIbase-Receipt` header with its public receipt URL; what a receipt contains is in the privacy policy (https://apibase.pro/privacy).

## How you pay — x402 protocol or MPP, pick per request

| Rail | Network / asset | How it works | Best for |
|---|---|---|---|
| x402 | USDC on Base mainnet | Server replies HTTP 402 with a payment challenge; your wallet signs an EIP-3009 `transferWithAuthorization`; our self-hosted facilitator settles on-chain. A payment alone can bootstrap a brand-new agent identity too, same as MPP — no prior signup needed. | Base Account / Base MCP users, on-chain-native agents |
| MPP | USDC.e on Tempo (chain 4217) | The `mppx` SDK signs a lightweight off-chain-style payment against your Tempo wallet. A payment alone can bootstrap a brand-new agent identity — no prior signup at all. | Agents that want to pay from a fresh wallet with zero prior registration |
| Balance | Refund credit, debited per call | Balance — a credit created by refunds (or by the operator). There is no self-service top-up; x402 and MPP are the two ways to pay. Cache hits on the balance rail are billed at 10%. | Callers holding a refund credit |

Rate limits: <!--rate-limits-->free: 10 requests per second, 100 per day; paid: 50 requests per second, 10,000 per day; enterprise: 200 requests per second, 100,000 per day<!--/rate-limits-->.

Free tools (price $0) need no payment on any rail. Paid tools enforce payment server-side and fail closed — there is no unpaid fallback.

## Integrator orders

Integrator: 0% (pilot) fee from the merchant, min $0.05, orders from $1.00; on Tempo inside the transaction, on Base inside the transaction for clients that support fee-split and invoiced otherwise.

Orders placed through a merchant storefront are priced by the merchant, not by the tool table above. Details: https://apibase.pro/integrator.

## What "no hidden costs" actually means

- No subscription tier, no seat count, no annual contract.
- No overage fee — the price per call is the price per call at any volume.
- No markup surprise at settlement — the price is locked at the moment of the HTTP 402 challenge, not renegotiated after the call runs.
- A tool whose free upstream quota is exhausted is withdrawn until it resets; you are not charged (the call answers 503 `tool_unavailable` with `retry_after` before any payment challenge).
- <!-- refund-truth: canonical -->If APIbase owes you money — a call that was charged but not delivered, or APIbase's own fee share of an order payment that arrived twice or after the order had closed — the debt is recorded the moment we detect it and shown next to your receipt (`/r/<id>.refund.json`, linked from the receipt's `refund_url`) or in `shop.order.get`. Refunds are sent automatically, to the wallet that paid, in a weekly batch (Mondays, UTC), from a dedicated APIbase refund wallet, once the amount owed to your wallet exceeds ten times the network fee of sending it (about $0.01 on Base, less on Tempo). Smaller amounts carry forward and stay visible; they never expire. The rest of a duplicate or late order payment sits with the seller, who refunds it to the paying wallet within 7 days under the [refund framework](/legal/refund-framework); shop refunds for returns or cancellations remain the seller's duty as well. APIbase never holds your keys or your balance: the refund wallet holds APIbase's own money. On x402 a failed provider call is not settled: nothing leaves your wallet. Calls paid from the credit balance are credited back. The first live weekly run is Monday 2026-11-16 07:00 UTC.
