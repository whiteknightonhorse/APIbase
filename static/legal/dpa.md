<!-- version: 1.1; effective_from: 2026-10-06; status: draft accepted by operator without legal review -->
# Data Processing Addendum v1.0

> Draft text. Not a legal opinion.

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

Hetzner (hosting) and Resend (email delivery).

## 6. Incidents

APIbase notifies the merchant of a personal data incident within 72 hours of becoming aware of it.

## 7. Data subject rights

Requests from data subjects go through the merchant as controller; APIbase helps on the merchant's request.

APIbase is a technology intermediary; buyer funds do not pass through APIbase; the fee is charged to the merchant; the legal entity and jurisdiction will be announced.
