<!-- version: 1.1; effective_from: 2026-10-06; status: draft accepted by operator without legal review -->
# Refund Framework v1.0

> Draft text. Not a legal opinion.

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

APIbase is a technology intermediary; buyer funds do not pass through APIbase; the fee is charged to the merchant; the legal entity and jurisdiction will be announced.
