<!-- version: 1.3; effective_from: 2026-10-12; status: accepted by operator without legal review -->
# Data Processing Addendum v1.3

## 1. Roles

For personal data in orders (delivery address, passport data, contact data of the payer), the merchant is the controller and APIbase is the processor.

## 2. Instructions

APIbase processes this data only to store it temporarily and to pass it to the merchant, following the merchant's documented instructions and this Addendum.

## 3. Encryption

Fields marked as personal data are encrypted by the buyer's agent under the merchant's public key before they reach APIbase. APIbase stores only the ciphertext and its sha256. It does not write envelopes or field hashes to logs; metrics are counters only.

## 4. Retention

- Delivery address: deleted when the order is CLOSED plus 30 days (dispute window), or earlier on the merchant's request.
- Passport data: deleted at the first of: 7 days after delivery to the merchant; DELIVERED; CANCELLED or REFUNDED. Maximum 30 days from creation.
- Storage at APIbase is temporary; the merchant must keep its own copy.

## 5. Sub-processors

Hetzner (hosting, European Union) and Resend (email delivery). APIbase announces a new sub-processor at /legal and by e-mail 30 days before it starts; the merchant may terminate within that period.

## 6. Incidents

APIbase notifies the merchant of a personal data incident within 72 hours of becoming aware of it.

## 7. Data subject rights

Requests from data subjects go through the merchant as controller; APIbase helps on the merchant's request.

## 8. International transfers

Order data is stored on servers in the European Union. Where the merchant or the buyer is outside the European Economic Area, the merchant as controller is responsible for the lawful basis of the transfer; on request, APIbase signs the standard contractual clauses the merchant needs.

## 9. Audit

Once per year, or after an incident, the merchant may ask APIbase in writing for the information needed to show compliance with this Addendum; APIbase answers within 30 days.

## 10. Deletion on termination

Within 30 days after the storefront is deactivated or this Agreement ends, APIbase deletes all remaining order ciphertext and field hashes, except what it must keep by law or as part of the append-only financial records (order amounts and transaction hashes carry no personal data fields).

APIbase is a technology intermediary; buyer funds do not pass through APIbase; the fee is charged to the merchant; APIbase has no registered legal entity and is operated as a decentralised autonomous organisation of independent open-source developers.
