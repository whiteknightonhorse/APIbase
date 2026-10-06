<!-- version: 1.1; effective_from: 2026-10-06; status: draft accepted by operator without legal review -->
# Merchant Agreement v1.0

> Draft text. Not a legal opinion.

## 1. Role of APIbase

APIbase is a technology intermediary; buyer funds do not pass through APIbase; the fee is charged to the merchant; the legal entity and jurisdiction will be announced.

APIbase is not the seller, is not a payment institution, and does not hold funds. The buyer pays USDC directly to the merchant's wallet. APIbase provides the storefront, the quote, the order record and the notifications.

## 2. Fee and settlement

- Fee: {{INTEGRATOR_FEE_PCT}}, minimum $0.05 per order, charged to the merchant.
- Tempo (MPP): the fee is taken in the buyer's transaction as a split; the merchant receives the order total minus the fee.
- Base (x402): the fee is not part of the transaction. APIbase records it as a receivable and sends the merchant an invoice, payable in USDC.
- Pilot: the fee is 0%. The Fee Switch can change this only under section 8.

## 3. Merchant obligations

1. Goods and services offered are lawful in the merchant's country and in the buyer's country.
2. Returns follow the law of the merchant's country and the published refund policy (see Refund Framework).
3. The merchant issues closing documents (invoices, receipts) to the buyer.
4. The merchant is responsible for its own taxes.
5. The merchant answers order disputes within 7 days.
6. The merchant confirms a paid order within 48 hours (SLA).
7. If an order is duplicated through APIbase's fault, the refund is made within 7 days.

## 4. Suspension and termination

APIbase may suspend or disconnect a merchant that breaks this Agreement or the Acceptable Use Policy. The merchant may deactivate its storefront at any time; open orders remain to be served.

## 5. Reputation

APIbase may show order statistics and dispute outcomes for a merchant on its storefront.

## 6. Changes

APIbase may publish a new version of these documents. The merchant has 30 days to accept the new version; after that, new quotes are refused until it is accepted again.

## 7. Liability

APIbase's liability to the merchant is limited to the fees received from that merchant in the previous 12 months.

## 8. Fee Switch

The fee may be switched on or off by APIbase. The current state is shown at /pricing.

## 9. Governing law

Governing law and jurisdiction: will be announced.
