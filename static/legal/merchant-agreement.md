<!-- version: 1.4; effective_from: 2026-10-19; status: accepted by operator without legal review -->
# Merchant Agreement v1.4

## 1. Role of APIbase

APIbase is a technology intermediary; buyer funds do not pass through APIbase; the fee is charged to the merchant; APIbase has no registered legal entity and is operated as a decentralised autonomous organisation of independent open-source developers.

APIbase is not the seller, is not a payment institution, and does not hold funds. The buyer pays USDC directly to the merchant's wallet. APIbase provides the storefront, the quote, the order record and the notifications.

The operator is identified by the domain apibase.pro and the public repository github.com/whiteknightonhorse/APIbase. Notices to APIbase go to support@apibase.pro. Notices to the merchant go to the contact e-mail in the merchant profile; the merchant keeps it current.

## 2. Fee and settlement

- Fee: {{INTEGRATOR_FEE_PCT}}, minimum $0.05 per order, charged to the merchant.
- Tempo (MPP): the fee is taken in the buyer's transaction as a split; the merchant receives the order total minus the fee.
- Base (x402): the fee is not part of the transaction. APIbase records it as a receivable and sends the merchant an invoice, payable in USDC.
- Pilot: the fee is 0%. The Fee Switch can change this only under section 9.

## 3. Merchant obligations

1. Goods and services offered are lawful in the merchant's country and in the buyer's country.
2. Returns follow the law of the merchant's country and the published refund policy (see Refund Framework).
3. The merchant issues closing documents (invoices, receipts) to the buyer.
4. The merchant is responsible for its own taxes, including any VAT or sales tax on its orders.
5. The merchant answers order disputes within 7 days.
6. The merchant confirms a paid order within 48 hours (SLA).
7. If an order is duplicated through APIbase's fault, the refund is made within 7 days.
8. The merchant alone is responsible for its products: product safety, warranty, consumer-law compliance, delivery and after-sales service.
9. The merchant grants APIbase a non-exclusive, royalty-free licence to show its catalog, product texts, images and prices on the storefront, in agent-readable files and in discovery indexes, for as long as the storefront is active, and warrants that it holds the rights to that content.
10. The merchant represents that neither it, its owners nor its payout wallets are on a sanctions list (including the OFAC SDN list) and that it is not registered in a country listed in the Acceptable Use Policy section 4.

## 4. Suspension and termination

APIbase may suspend or disconnect a merchant that breaks this Agreement or the Acceptable Use Policy, with immediate effect for prohibited goods, fraud, sanctions matches or a lawful request. Either party may end this Agreement for convenience with 30 days' notice. The merchant may deactivate its storefront at any time; open orders remain to be served. Sections 3, 7, 8, 12, 13 and 14 survive termination.

## 5. Reputation

APIbase may show order statistics and dispute outcomes for a merchant on its storefront.

## 6. Changes

APIbase may publish a new version of these documents at /legal with its version, effective date and hash. The merchant is notified at the contact e-mail of its profile and in API responses (`terms_update_pending`). The merchant has 30 days to accept the new version by signing the new document hashes; after that, new quotes are refused until it is accepted again.

## 7. Liability

APIbase's liability to the merchant is limited to the greater of the fees received from that merchant in the previous 12 months and USD 100. Neither party is liable for indirect or consequential loss, lost profit, lost data or lost business, except for fraud, wilful misconduct or where the law does not allow this exclusion.

## 8. No warranty; blockchains and payment rails

The storefront, the quotes, the notifications and the APIbase software are provided "as is" and "as available", without warranty of any kind, including fitness for a particular purpose and uninterrupted operation. APIbase does not operate the Base or Tempo networks, the USDC token, wallets, facilitators or settlers, and is not liable for their outages, fees (gas), delays, chain reorganisations, lost keys or transactions sent to a wrong address. On-chain transactions are irreversible; a payment is treated as made when the network confirms it.

## 9. Fee Switch

The fee may be switched on or off by APIbase with 30 days' notice at the contact e-mail of the merchant profile. The current state is shown at /pricing.

## 10. Subscriptions and streams

- A subscription product states its price per period, the period length, the renewal window and the grace period on its storefront page before the buyer subscribes. Renewal is charged only inside the renewal window, only for the stated amount, and only against an authorisation the buyer's agent signed; the merchant never charges beyond it. The buyer can cancel at any time; cancellation takes effect at the end of the paid period and no further charge is made. An unpaid renewal moves the subscription to past_due and then ends it; nothing is charged retroactively. Where the buyer authorizes a periodic Tempo access key whose address belongs to APIbase, APIbase may renew each period under that authorization, up to the stated amount and period, and pays the network fee of each renewal; because that renewal is a single transfer to the merchant, the platform fee of the period is invoiced to the merchant.
- A stream product states its rate per second and the minimum deposit before the buyer opens it. The buyer may close the stream at any time; only consumed seconds are settled to the merchant and the unconsumed deposit is returned through the payment channel. Consumed seconds are refundable only under the merchant's published refund policy.
- A product sold this way is not a "negative option" under the Acceptable Use Policy when it meets this section.

## 11. Orders placed by agents

The merchant accepts orders placed by autonomous software agents. An order placed by an agent binds the principal the agent acts for; the merchant may rely on the quote, the payment and the delivery data as received. Refunds of an order placed by mistake follow the merchant's published refund policy.

## 12. Indemnity

The merchant indemnifies APIbase against third-party claims, fines and reasonable costs arising from the merchant's goods, content, taxes, data handling or breach of these documents.

## 13. Compliance

APIbase may at any time refuse a quote, suspend the storefront, withhold a fee split or invoice credit, and report to authorities where sanctions screening, anti-money-laundering rules or a lawful request require it. APIbase holds no merchant funds and therefore cannot freeze funds already paid to the merchant.

## 14. General

Neither party is liable for delay caused by events outside its reasonable control (force majeure). If a clause is unenforceable the rest stays in force. These documents are the entire agreement on their subject. The merchant may not assign this Agreement without APIbase's consent; APIbase may assign it to a successor operator of apibase.pro with notice.

## 15. Governing law and disputes

APIbase has no registered seat. No national law is chosen for these documents; mandatory rules of the merchant's country apply where they cannot be excluded. A dispute is first negotiated in good faith for 30 days from written notice. If unresolved, either party may propose final and binding arbitration before a single arbitrator under the UNCITRAL Arbitration Rules, conducted online in English, and the parties confirm that choice in writing when the dispute arises. Claims are brought individually, not as a class or representative action, where the applicable law allows this waiver.
