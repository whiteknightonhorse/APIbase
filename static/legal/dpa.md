<!-- version: 1.4; effective_from: 2026-11-26; status: in force; drafted by the operator without legal review -->
# Data Processing Addendum v1.4

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

Hetzner Online GmbH (hosting; data centre in Hillsboro, Oregon, United States) and Resend, Inc. (transactional e-mail, United States). APIbase announces a new sub-processor at /legal and by e-mail 30 days before it starts; the merchant may terminate within that period.

## 6. Incidents

APIbase notifies the merchant of a personal data incident within 72 hours of becoming aware of it.

## 7. Data subject rights

Requests from data subjects go through the merchant as controller; APIbase helps on the merchant's request.

## 8. International transfers

Order data is stored on servers in the United States (Hetzner, Hillsboro, Oregon). For a merchant or buyer in the European Economic Area, the United Kingdom or Switzerland this is a transfer to a third country. The merchant, as controller, is responsible for its lawful basis; APIbase offers the EU Standard Contractual Clauses (controller-to-processor module) as an annex on written request and applies the measures in section 3 (fields encrypted under the merchant's own key, so APIbase cannot read them) as supplementary measures. Logs are kept in the same location for not more than 15 days.

## 9. Audit

Once per year, or after an incident, the merchant may ask APIbase in writing for the information needed to show compliance with this Addendum; APIbase answers within 30 days.

## 10. Deletion on termination

Within 30 days after the storefront is deactivated or this Agreement ends, APIbase deletes all remaining order ciphertext and field hashes, except what it must keep by law or as part of the append-only financial records (order amounts and transaction hashes carry no personal data fields).

APIbase is operated by its operator, an individual independent open-source developer (the "Operator"), identified by the domain apibase.pro, the public repository github.com/whiteknightonhorse/APIbase and the address support@apibase.pro. There is no registered company. "APIbase" in these documents means the Operator. The Operator may transfer this role to a company or a successor operator of apibase.pro with 30 days' notice at /legal.

These documents were prepared without a lawyer and are not legal advice; a professional review is planned.
