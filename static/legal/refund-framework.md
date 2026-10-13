<!-- version: 1.3; effective_from: 2026-10-12; status: accepted by operator without legal review -->
# Refund Framework v1.3

## 1. What the merchant must publish

In the catalog, for every storefront:

- `refund_window_days` — the number of days after delivery in which a return or refund is accepted;
- `returns_accepted` — whether physical goods can be returned;
- for digital content — whether the buyer waives the right of withdrawal, where the law of the merchant's country allows it.

Returns follow the law of the merchant's country and cannot be narrower than that law.

## 2. How a refund is executed

The buyer's funds are with the merchant, so the merchant makes the refund in a transaction from its own wallet and reports the transaction hash. APIbase checks the amount, the recipient and the network on-chain and then marks the order as refunded. Partial refunds are several records, up to the order total.

## 3. Role of APIbase

APIbase is not an arbitrator. It records orders, refunds and dispute statements and passes them between the parties. The outcome of a dispute is between the buyer and the merchant.

On-chain payments are irreversible. An order placed by the buyer's agent binds the buyer; a refund of an order placed by mistake is made only under this Framework and the merchant's published policy.

## 4. Subscriptions and streams

- Subscription: a cancelled subscription is not charged again; the current paid period is not refunded unless the merchant's published policy says so. A renewal charged outside the renewal window or above the authorised amount is refunded in full within 7 days.
- Stream: the unconsumed deposit is returned through the payment channel when the stream closes; consumed seconds are refunded only under the merchant's published policy.

APIbase is a technology intermediary; buyer funds do not pass through APIbase; the fee is charged to the merchant; APIbase has no registered legal entity and is operated as a decentralised autonomous organisation of independent open-source developers.
