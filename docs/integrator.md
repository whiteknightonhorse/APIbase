# APIbase Integrator (merchant) guide

## Registration & terms

A merchant goes `pending` → `active` in three calls. Everything is authenticated by the merchant
wallet's EIP-191 signature; the `mk_live_` API key is issued once, at the end.

| Step | REST (`/api/v1/shop`)                                        | MCP tool                       |
| ---- | ------------------------------------------------------------ | ------------------------------ |
| 1    | `GET /auth/nonce?wallet=0x…&purpose=register`                | —                              |
| 2    | `POST /merchants`                                            | `shop.merchant.register`       |
| 3    | `GET /auth/nonce?wallet=0x…&purpose=accept_terms`            | —                              |
| 4    | `POST /merchants/me/acceptances`                             | `shop.merchant.accept_terms`   |
| —    | `POST /merchants/me/keys/rotate` (Bearer)                    | `shop.merchant.rotate_key`     |
| —    | `POST /merchants/me/keys/reissue` (no Bearer, wallet-signed) | —                              |
| —    | `POST /merchants/me/deactivate` (Bearer, `orders:write`)     | `shop.merchant.deactivate`     |
| —    | `GET /merchants/me/orders` (Bearer, `orders:read`)           | `shop.merchant.orders_list`    |
| —    | `POST /merchants/me/orders/:id/confirm` (`orders:write`)     | `shop.merchant.order_confirm`  |
| —    | `POST /merchants/me/orders/:id/ship` (`orders:write`)        | `shop.merchant.order_ship`     |
| —    | `POST /merchants/me/orders/:id/document` (`orders:write`)    | `shop.merchant.order_document` |
| —    | `PUT /merchants/me/webhooks` (`webhooks:write`)              | `shop.merchant.webhook_set`    |
| —    | `GET /merchants/me/events?since=<cursor>` (`orders:read`)    | —                              |

1. **Nonce.** `GET /auth/nonce` returns `{nonce, issued_at, expires_in, message}`; `message` is the exact
   text to sign for that purpose. A nonce is single-use and lives 300 s.
2. **Register.** Sign the `register` message:

   ```
   apibase.pro wants you to sign in with your wallet.
   Address: <wallet>
   Purpose: register
   Nonce: <nonce>
   Issued At: <ISO-8601 time>
   ```

   Send the merchant fields plus `message` and `signature`. The reply is
   `{merchant_id, slug, status: "pending", docs_to_accept: [{doc_id, version, sha256, url}]}`.
   Without a signature the call is `401`.

3. **Accept the four documents** (`merchant-agreement`, `aup`, `dpa`, `refund-framework`) by signing,
   with a fresh `accept_terms` nonce, exactly this text (one line; hashes are the `sha256` values from
   `docs_to_accept`):

   ```
   I accept APIbase documents: merchant-agreement v1.0 sha256:<h1>; aup v1.0 sha256:<h2>; dpa v1.0 sha256:<h3>; refund-framework v1.0 sha256:<h4>. Wallet: <wallet>. Nonce: <nonce>. Time: <ISO-8601 time>
   ```

   Send `{wallet, doc_hashes: [{doc_id, version, sha256}], message, signature}`. All four documents are
   required and the message must match the template byte for byte. On success the merchant is
   `active` and the response is `{status: "active", api_key: "mk_live_…"}` — the key is shown once.
   Repeating the call returns `{status: "active"}` without a new key. The message and signature are
   stored whole as the acceptance record.

4. **New document versions.** When a document is republished you have 30 days to accept it again:
   merchant-tool responses carry `terms_update_pending: {docs: [...]}` during that window; afterwards new
   quotes are refused with `428 terms_not_accepted`.
5. **Deactivate.** `deactivate` stops new quotes and shows the storefront as `410`. Open orders stay
   serviceable: existing keys keep `orders:read`/`orders:write`; `catalog:write` calls get `410`.

### Errors

Every error carries `error_code`, `message`, `suggested_action`, `documentation_url`.

<a id="country_not_supported"></a>

**`country_not_supported`** (403) — the entity country or the sign-up IP's country/region is not served.
See `/legal/aup`.

<a id="category_prohibited"></a>

**`category_prohibited`** (403) — the category is not supported; `alternatives[]` lists the nearest
allowed categories. See `/legal/aup#categories`.

<a id="terms_not_accepted"></a>

**`terms_not_accepted`** (428) — the merchant is `pending`, a document hash/version in the request is not
the current one, fewer than four documents were sent, or a re-acceptance is overdue. `docs[]` holds the
current `{doc_id, version, sha256, url}` of all four documents.

<a id="merchant_unavailable"></a>

**`merchant_unavailable`** (410) — the merchant is not available (deactivated or otherwise).
The reason is not disclosed. Policy: `/legal/refund-framework`.

Other codes: `unauthorized` (401, bad/missing signature, nonce used or expired), `rate_limited` (429),
`validation_failed` (422), `slug_taken`/`wallet_registered` (409), `payout_wallet_sanctioned` (403).
Limits per IP: nonce 30/min, `POST /merchants` 5/hour, acceptances 10/min.

## Lost key

If you lost your `mk_live_` key there is no Bearer to call `keys/rotate` with. Recover with the
merchant wallet instead:

1. `GET /api/v1/shop/auth/nonce?wallet=0x…&purpose=reissue` returns a `message` to sign.
2. Sign it with the merchant (identity) wallet (EIP-191) and call
   `POST /api/v1/shop/merchants/me/keys/reissue` with `{wallet, message, signature}` and no `Authorization` header.
3. The response is `{api_key}`: a fresh `mk_live_` key, shown once. **All earlier keys are revoked**
   immediately. The nonce is single-use and expires after 5 minutes; a bad or replayed signature is `401`.

The route is rate-limited to 5 requests per hour per address. A `merchant.keys_reissued` event is
recorded (subscribable through webhooks, also in `GET /merchants/me/events`). This route is an addition to §6.3 of the spec.

## Catalog

Write path (merchant key `mk_live_…`, scope `catalog:write`, 60 writes/min per key; merchants must have accepted the current documents — pending → `428`, deactivated/suspended → `410`):

- `PUT /api/v1/shop/merchants/me/catalog` with `{ "items": [ … ] }` (≤500 items, body ≤1 MB) · MCP `shop.merchant.catalog_upsert`. Idempotent by `sku`; the merchant is always the key's owner (a `merchant` field in the body is ignored). A price change applies to new quotes at once.
- MCP `shop.merchant.catalog_delete {skus[]}` — refused with `409` and `quote_ids` while an open quote holds a sku.

Item (zod schema `CatalogItemSchema`, `src/shop/catalog.service.ts`):

| field                                                                                                                                                                                       | rule                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `sku`                                                                                                                                                                                       | `[A-Za-z0-9._:-]`, ≤64                                                                 |
| `title`                                                                                                                                                                                     | ≤120 after HTML/control/zero-width stripping                                           |
| `description`                                                                                                                                                                               | ≤2 000 after stripping                                                                 |
| `price_usd`                                                                                                                                                                                 | decimal, ≤2 fractional digits, `$1.00` … `limits.max_order_usd`                        |
| `is_test`                                                                                                                                                                                   | only for the test SKU (below)                                                          |
| `stock`                                                                                                                                                                                     | integer ≥0; `null`/absent = not tracked                                                |
| `fulfillment_mode`                                                                                                                                                                          | `instant` · `merchant` · `physical`                                                    |
| `fulfillment.instant.payload`                                                                                                                                                               | required for `instant`; stored encrypted with the server key, never returned or logged |
| `tax_included`, `tax_note`, `shipping_options[]`, `delivery_slots[]`, `requires_pii[]`, `refund_window_days`, `returns_accepted`, `currency_display`, `images[]` (https URLs), `variants[]` | as in the spec; no discounts or coupons                                                |
| `category`                                                                                                                                                                                  | one of `config/integrator/prohibited-categories.json` → `allowed`                      |

Response: `{ upserted, flagged[{sku,reason}], rejected[{sku,reason,category,status:422}], errors[{index,sku,status:422,message}] }`. Items are judged one by one: a bad item never blocks the rest of the batch. More than 500 items → `422` for the whole call.

**Test SKU.** Exactly one item per merchant may be `sku: "__apibase_test"`, `is_test: true`, `price_usd: 0.01` (any other price or a second test item → `422`). It is not listed by `shop.catalog.search`, but `shop.catalog.get` returns it, so an agent can run an end-to-end purchase. No fee is taken on it.

**Moderation.** Order per item: category in `allowed` (else `rejected`, `category_prohibited`) → prohibited-category keywords and the platform content filter (`rejected`) → hidden characters and instruction-like text (`ignore previous`, `you must`, `system:`, non-`https` URL schemes → `flagged`). Every check writes a `shop_moderation_reviews` row (`scope=product`, `layer=rules`). A `flagged` product is saved but invisible to buyers (`search` omits it, `get` → `404`) until it passes the LLM check; re-uploading the item moderates it again. A call with rejected items also emits one `shop.catalog.rejected` event.

Buyer path (`/mcp`, free, read-only, `merchant` = slug is required, only `active` merchants — otherwise `410 merchant_unavailable`):

- `shop.catalog.search {merchant, query?, category?, max_price_usd?, limit≤50, cursor?}` → `products[{sku,title,price_usd,availability,requires_pii,fulfillment_mode}]`, `merchant{name,reputation,policy_summary}`, `next_cursor`. Full-text over title+description, ordered by rank then product id.
- `shop.catalog.get {merchant, sku}` → full card incl. `shipping_options`, `delivery_slots`, `refund_policy`, `variants[]`, `merchant_encryption_key`. `contact_email` is never returned.

## Quotes

Buyer path. A quote is a price snapshot plus a stock hold; nothing is charged by it (payment is a separate step).

- `shop.order.quote {merchant, items[{sku, variant?, qty}], shipping_option?, delivery_slot?, buyer_ref?}` on `/mcp` · `POST /api/v1/shop/quotes` (same body, `X-Idempotency-Key` supported: a replay returns the same `quote_id` and holds stock once) · `GET /api/v1/shop/quotes/:id`.
- `shop.order.cancel {order_id, reason}` · `POST /api/v1/shop/orders/:id/cancel {reason}`: free while the order is `QUOTED`; the quote is voided and the held stock released. After payment: `409 not_cancellable` (refund flow).
- **Physical items (T-INT-22).** A quote with a `physical` product needs `shipping_option` (an `id` from the product's `shipping_options[]`, else `422` listing the offered options); its `price_usd` is added once as `shipping_usd` and is part of `total_usd`. When the product lists `delivery_slots[]`, `delivery_slot` is required too: the slot is held until the quote expires (one live hold per product and slot); a taken slot answers `409 slot_unavailable` with `alternatives` (the free slots). A paid order keeps its slot. `requires_pii` always includes `shipping_address` (end-to-end encrypted, see the PII section); paying without it is `422 pii_required`. `shipping_option`/`delivery_slot` on a quote without physical items → `422`.
- **Physical order flow.** `PAID` → `CONFIRMED` (merchant only, `order_confirm`; sets `ship_due_at = now + policy.ship_sla_h`, default 72 h) → `SHIPPED` (`order_ship {order_id, tracking: {carrier, number, url?}, delivery_eta}`; the buyer sees `tracking` and `delivery_eta` in `order.get`) → `DELIVERED` (the merchant calls `order_ship {order_id, delivered_at}`, or automatically `delivery_eta + 7 days`) → `CLOSED` when `close_after` (`DELIVERED` + `refund_window_days`) passes. There is no buyer-side confirm-delivery tool (not in §6): the buyer's way out is `shop.order.cancel` within the refund window or the automatic `DELIVERED`.

**Response** (`201`): `quote_id, order_id, items[{sku, variant?, title, qty, unit_price_usd, line_total_usd}], total_usd, fee_disclosed: false, expires_at, requires_pii[], requires_human_confirmation, pay`. Prices come from the server catalog, never from the request.

**`pay`** contains only the rails the quote offers: `x402: {payTo, amount, network, asset, extra: {quote_id}}` — `payTo` is the merchant's `payout_wallet_base` (never the platform wallet), `amount` is micro-USDC (`toMicroUsdc(total_usd)`); `mpp: {url}` = `POST /api/v1/shop/quotes/{id}/pay`. On `/mcp` orders are paid by x402 only, so `pay.mpp` is omitted there. Tempo memo is bytes32: 16 zero bytes followed by the 16 bytes of `quote_id`; decode it to find the quote on-chain.

**TTL.** 15 minutes by default (`limits.quote_ttl_s`, merchant range 5–60 min). Past `expires_at` the quote is `expired`: `GET` returns `410 quote_expired` with a fresh quote in `quote` (same items, current prices); if the items have meanwhile sold out, `410` carries `alternatives` instead.

**Reservations.** Items with tracked `stock` are held atomically when the quote is made (all lines or none) until `expires_at`; the loser of a race gets `409 out_of_stock` with `available` and up to 3 `alternatives` of the same category. Expiry or cancel releases the hold.

**Limits.** Order total ≥ `$1.00` (`INTEGRATOR_MIN_ORDER_USD`), ≤ `limits.max_order_usd`; merchants younger than 30 days with fewer than 10 closed orders are capped at `limits.new_merchant_cap_usd` (`$200`) → `422`. `requires_human_confirmation` is true above `limits.human_confirm_above_usd` (default `$100`). Quotes per buyer identity (agent, wallet hash or IP): 30/min, 300/hour → `429 rate_limited`; a banned identity → `429 banned`. The merchant must have accepted the current terms (`428`) and be active (`410`).

**Test SKU.** `__apibase_test` is bought alone, qty 1, no minimum, `fee_usd = 0`. At most `INTEGRATOR_TEST_SKU_DAILY_CAP` (3) paid test orders per merchant per 24 hours; the next quote → `429 test_sku_daily_cap`.

**Fee** (internal, not in the response): when `INTEGRATOR_FEE_ENABLED=true`, `max(total × INTEGRATOR_FEE_BPS / 10000, INTEGRATOR_FEE_MIN_USD)` rounded up to the cent (150 bps, min `$0.05`); `0` otherwise and for the test SKU. With the fee on it must also be ≥ `X402_GAS_ESTIMATE_USD × 10`, else `422`.

Error codes: `quote_expired` (410), `out_of_stock` (409), `test_sku_daily_cap` (429), `below_minimum`/`above_max_order`/`new_merchant_cap` (422), `not_cancellable` (409), `quote_not_open` (409).

## Payment & fulfillment

Buyer path after a quote: pay with x402 (Base). **Settle comes before delivery** — the order is delivered only after the USDC transfer has a successful receipt.

- `shop.order.pay {quote_id}` on `/mcp` (X-Payment header on that call) · `POST /api/v1/shop/quotes/:id/pay` (`X-Payment` / `PAYMENT-SIGNATURE`). The authorization must be for exactly `total_usd` to the merchant payout wallet; the platform verifies it, claims its nonce (single use; Redis unavailable → `503`, nothing is settled), then settles through the platform facilitator and waits for the receipt (≤ 30 s). The PayAI facilitator is used only if the local one throws; a refused settle (`success:false`) is final — no retry, no second facilitator.
- **`200 paid`** — `order {order_id, state, tx_hash, fulfillment?}`. Instant products go `PAID → CONFIRMED → FULFILLED`; `waive_withdrawal: true` closes the order at once (`CLOSED`), otherwise it closes after `refund_window_days` (default 14). The test SKU delivers `test ok`. `merchant` fulfillment stays `PAID` until the merchant confirms.
- **`202 payment_pending {order_id}`** — the receipt was not seen in time; the order stays `PAYING`. Poll `shop.order.get` / `GET /api/v1/shop/orders/:id`. The `shop-payment-reconcile` job (every 5 minutes, 24 h window) reads `authorizationState(payer, nonce)` and the USDC `Transfer` on-chain: confirmed → `PAID` and delivery; not confirmed after 24 h → `PAYMENT_FAILED` for good, the quote expires and the stock reservation is released. Only `pending`/`failed` payments are reconciled, never wallets.
- **`402 payment_required`** — the settle was refused (`PAYMENT_FAILED`, nothing delivered); the quote stays open until its TTL, sign a new authorization (new nonce) and pay again: the same order row goes `PAYMENT_FAILED → PAYING`. A quote that is already paid, or has a payment in progress, also answers `402`.
- **`200 already_placed`** — a repeat of `shop.order.pay` **without** a payment on a quote the same identity already paid returns the same order (with `fulfillment`); any other identity gets `402`.
- `shop.order.get {order_id}` · `GET /api/v1/shop/orders/:id` → `{order_id, state, tx_hash, events[], tracking (null in wave 1), refund_policy {refund_window_days, returns_accepted}}`; for the identity that paid (the quote's buyer, or the wallet identity of the payer) also `fulfillment?` (same on every call), `documents[]` (merchant links) and, while the order is open (`PAID` … `DELIVERED`, `REFUND_PENDING`, `DISPUTED`; not `CLOSED`), `merchant_contact {email, site_url}`.
- `shop.order.cancel` after payment: before the merchant confirms (`PAID`) it is always a refund → `REFUND_PENDING` and a `shop_refunds` row due in 7 days (`shop.refund.requested`); after `CONFIRMED` only if the SKUs accept returns and `refund_window_days` is still open, otherwise `409 not_cancellable` with the policy. Digital content delivered under `waive_withdrawal` (`FULFILLED`/`CLOSED`) is `409`.
- **Merchant order tools.** `orders_list {state?, since?, cursor?, limit?}` (own orders only, `next_cursor` for the next page), `order_confirm {order_id}` (`PAID → CONFIRMED`, stops the confirm SLA; another merchant's order is `404`), `order_ship {order_id, tracking?, delivery_eta?, delivered_at?}` (physical orders: `CONFIRMED → SHIPPED`, then `delivered_at` → `DELIVERED`; `409 not_shippable` otherwise), `order_document {order_id, url}` (`https://` only, else `422`; shown in the buyer's `order.get.documents`).
- **Refunds** (`shop.merchant.refund {order_id, amount, tx_hash}` / `POST /merchants/me/refunds`, scope `refunds:write`). A refund is the merchant's own transaction: send USDC back to the payer's wallet on the order's rail, then pass the hash. APIbase only reads the chain (viem, read-only; it never sends or signs anything): the transaction must be confirmed, carry a USDC `Transfer` with `to` = the payer and `value >= amount`. Verified → `shop_refunds.verified`, the order goes `REFUND_PENDING → REFUNDED` (the refunds add up to `total_usd`) or `PARTIALLY_REFUNDED` (a further refund moves it through `REFUND_PENDING` again). A transaction that does not prove it → `422 refund_rejected` with `reject_reason`, the record is `rejected` and the order is unchanged; more than the order total is `400 refund_exceeds_total`; a transaction settles one refund only (`409 tx_already_used`). The platform fee is not returned; for `reason = duplicate` the fee leg is already `written_off`.
- **Disputes** (`shop.order.dispute {order_id, reason_code, note?}` / `POST /orders/:id/disputes`, the payer only, another identity gets `404`). `reason_code`: `not_received | not_as_described | duplicate | canceled_recurring | agent_error | other`; `note` up to 1000 characters. `PAID`…`DELIVERED` → `DISPUTED`, `due_at` = +7 days, one open dispute per order, `shop.dispute.opened`. Merchant dispute response channel: the refund tool (a verified refund resolves the dispute) or the mail intake of §12.2 MERCHANT_REPLY; §6.3 has no REST reply route. After `due_at` the dispute is `expired`, the order returns to its prior state and one `shop.dispute.unanswered` (DISPUTE_UNANSWERED, pull-only) is queued. Escalation is reputation and suspension only.
- **Reputation** (`shop_merchants.reputation`, recomputed by the sweeper once an hour): `closed_on_time_pct`, `dispute_rate`, `refund_rate` (fractions, `0.02` = 2%), `orders_closed`, `as_of`; published in `catalog.search`/`catalog.get`/`discover` (`merchant.reputation`) and on `/m/<slug>`. The test SKU and `reason = duplicate` are not counted. At 10 or more closed orders `dispute_rate >= 1%` queues a warning (mail + `shop.merchant.dispute_rate_warning`, at most weekly); `>= 2%` sets `status_reason = disputes` and quotes answer `410` until the operator clears it.
- **SLA sweeper** (`shop-sla-sweeper`, worker, every 5 minutes): expired open quotes → `expired` (stock released, `QUOTED` orders → `EXPIRED`); `PAID` past `confirm_due_at` (`PAID` + `policy.confirm_sla_h`, default 48 h, merchant-fulfilled orders only) → one `shop.order.confirm_overdue`, repeated every 24 h; `CONFIRMED` physical past `ship_due_at` → one `shop.order.ship_overdue` (pull-only); `SHIPPED` with `delivery_eta` + 7 days passed → `DELIVERED`; three late orders in a row → the merchant gets `status_reason = unresponsive` and quotes answer `410` until the operator clears it; `close_after` passed → `CLOSED`; refund `due_at` passed → `overdue` + one `shop.refund.overdue`; dispute `due_at` passed → `expired` + one `shop.dispute.unanswered`; merchant reputation recomputed hourly (disputes ≥ 1% warn, ≥ 2% suspend); `payout_pending.effective_at` passed → the new payout wallet is applied; `shop_connect_events` older than 30 days are deleted.
- Paid orders emit the `shop.order.paid` event; the `PAID` order event records `request_id`, the buyer agent (client name/version or user agent) and the first 8 hex characters of the payer wallet's SHA-256 — never the wallet.

## Buyer PII (end-to-end encrypted) {#pii}

Some products need buyer data (`requires_pii`: `shipping_address`, `passport`, `phone`, `company`). APIbase is a processor on the merchant's behalf and **cannot read this data**: the buyer's agent encrypts it to the merchant's public key and the platform stores only the ciphertext. There is no server-side decryption anywhere, and no way to ask the platform for a plaintext copy.

**1. Generate the key pair (merchant).** An X25519 pair, the public key as base64 of the raw 32 bytes:

```sh
# Node
node -e "const c=require('crypto');const k=c.generateKeyPairSync('x25519');console.log('pub',k.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('base64'));console.log('priv',k.privateKey.export({type:'pkcs8',format:'der'}).subarray(-32).toString('base64'))"
# Python (cryptography)
python3 -c "import base64;from cryptography.hazmat.primitives import serialization as s;from cryptography.hazmat.primitives.asymmetric import x25519;k=x25519.X25519PrivateKey.generate();r=lambda b:base64.b64encode(b).decode();print('pub',r(k.public_key().public_bytes(s.Encoding.Raw,s.PublicFormat.Raw)));print('priv',r(k.private_bytes(s.Encoding.Raw,s.PrivateFormat.Raw,s.NoEncryption())))"
# CLI (age-keygen prints an X25519 recipient; convert its key to raw bytes yourself)
age-keygen
```

The private key never leaves you. Keep it out of APIbase, out of logs and out of the repository.

**2. Publish it.** `encryption_key {kid, alg, pub, sig_by_wallet}` at registration (`kid` up to 64 characters). `sig_by_wallet` is an EIP-191 signature by the merchant identity wallet over exactly this text (the same text at registration and at rotation; `--prepare` of the seed script prints it):

```
apibase.pro merchant encryption key
kid: <kid>
alg: <alg>
pub: <pub>
```

The signature is stored and handed to the buyer's agent together with the key (`merchant_encryption_key` in `shop.catalog.get` and in every quote that has `requires_pii`), so the agent can check that the key belongs to the merchant wallet.

**3. Envelope (buyer's agent).** Encrypt the JSON (`{full_name, passport_number, nationality, dob, expiry}` for a passport, the address object for `shipping_address`) to `pub` with HPKE (RFC 9180, X25519-HKDF-SHA256 + ChaCha20-Poly1305, `alg: "hpke-x25519-sha256-chacha20"`) or libsodium `crypto_box_seal` (`alg: "sealed-box-x25519"`). **AAD = the `quote_id`** (HPKE; sealed boxes have no AAD, so the merchant checks the quote inside the decrypted JSON). Send one envelope per kind in `shop.order.pay` / `POST /quotes/:id/pay`:

```json
{
  "pii": {
    "passport": {
      "kid": "<merchant kid>",
      "alg": "hpke-x25519-sha256-chacha20",
      "ciphertext_b64": "<base64>"
    }
  }
}
```

At most 16 KB decoded per envelope. The platform accepts nothing else: a string, a number, an object with readable fields (`passport_number`, `address`, …), any extra field, a bad base64 or an oversize envelope is `400 pii_plaintext_rejected` ("encrypt with merchant key, see docs"); the value is never echoed, stored or logged. Other errors: `422 pii_required` (a kind the quote needs is missing; `extra.merchant_encryption_key` and `extra.required` say what to send), `409 merchant_key_rotated` (the `kid` is not the current one; `extra.merchant_encryption_key` is the new key; re-encrypt and pay, or request a new quote), `400 pii_unexpected_kind`, `400 pii_alg_unsupported`. The platform cannot check the AAD (it cannot decrypt): a wrong AAD only fails at the merchant.

**4. Delivery to the merchant.** The same bytes arrive in the `order.paid` webhook as `data.pii[{kind, kid, alg, ciphertext_b64, sha256}]` and on `GET /api/v1/shop/merchants/me/orders/:id/pii` (Bearer, scope `orders:read`, 60 per minute) as `{order_id, envelopes[...]}`; another merchant's order is `404`. `sha256` is the hash of the ciphertext bytes. The buyer's `shop.order.get` and the merchant's `orders_list` show only `pii: {kinds, sha256}`, never ciphertext.

**5. Merchant duties.** Fetch the envelopes (webhook or GET) **before** you rotate the key; decrypt with your private key; **store what you need yourself** — the platform keeps data only temporarily and cannot restore it. Retention (spec 10.3), enforced by the `shop-sla-sweeper` with a physical `DELETE` and a `pii.purged` order event:

- passport: the first of 7 days after `delivered_to_merchant_at` (first successful webhook or first GET), the order reaching `DELIVERED`, `CANCELLED`, `REFUNDED` or `PAYMENT_FAILED`, or 30 days after creation;
- shipping address, phone, company: 30 days after the order is `CLOSED`;
- logs never contain an envelope or its hash; metrics are counters only.

The merchant gets a "stored temporarily, keep your own copy" e-mail on the first delivery. There is no early-purge request route: data is purged by rule only. Terms: the data-processing agreement at [/legal/dpa](/legal/dpa) (APIbase acts as a processor on the merchant's behalf).

**6. Rotation.** `POST /merchants/me/keys/rotate` / `shop.merchant.rotate_key` with `encryption_key {kid, alg, pub, sig_by_wallet}` (a NEW `kid`, signature as in step 2; this call also rotates the API key as before) replaces the published key and emits `merchant.key_rotated`. Stored envelopes are not re-encrypted: those not yet delivered get a `pii.undeliverable` order event and a `pii_undeliverable` e-mail (one per order) — fetch them and open them with the OLD private key. Open quotes keep their `requires_pii`; paying one with the old `kid` is `409 merchant_key_rotated`.

### For buyer agents

Passing a passport or an address to merchant X is a legal and privacy decision for your user: **a human confirmation is recommended before you send it** (UC-2). Always encrypt to the key in the quote, check `sig_by_wallet` if you can, send one envelope per required kind, and never log, echo or store the plaintext.

## Webhooks

Register an endpoint with `PUT /merchants/me/webhooks` (`shop.merchant.webhook_set`) — body `{url, events[], endpoint_id?, rotate_secret?}`. `events` is a non-empty subset of `order.paid`, `order.confirmed`, `order.shipped`, `order.delivered`, `order.cancelled`, `refund.requested`, `refund.verified`, `dispute.opened`, `catalog.rejected`, `merchant.key_rotated`, `merchant.keys_reissued` (`shipped`, `delivered`, `refund.verified` and `dispute.opened` start flowing with the shipping/dispute waves). A new endpoint returns its signing `secret` (`whsec_` + 32 hex) **once**; APIbase keeps only its SHA-256 and an encrypted copy for signing. Pass `endpoint_id` to change an endpoint of yours (another merchant's id is `404`; `rotate_secret: true` issues a new secret).

**URL rules.** `https://` only; every address the host resolves to must be public — RFC 1918, loopback, link-local (`169.254.169.254` included), CGNAT and IPv6 equivalents are `422`. The name is resolved again at every delivery and the connection is pinned to that address; redirects are never followed (a `3xx` counts as a failed attempt).

**Delivery.** `POST` with a JSON body `{id, event, created_at, data}` and the headers `X-APIbase-Event`, `X-APIbase-Delivery-Id` (the event id, identical on every retry) and `X-APIbase-Signature: t=<unix>,v1=<hex>`, where `v1 = HMAC-SHA256(secret, t + "." + body)` over the raw body bytes. Verify it and reject old `t` (e.g. older than 5 minutes):

```js
const [t, v1] = header.split(',').map((p) => p.split('=')[1]);
const ok = timingSafeEqual(
  Buffer.from(createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')),
  Buffer.from(v1),
);
```

Any `2xx` within 10 s is delivery. Anything else (other status, timeout, connection error) is retried after 1 min, 5 min, 30 min, 2 h, 12 h, 24 h — seven attempts in all, then the delivery is `failed`. After 10 failures in a row an endpoint is only tried on that schedule (new events wait one minute before their first attempt) until one delivery succeeds. Status code and the first 1 KB of the answer are kept per attempt.

**Instant fulfillment.** Answer `200` to `order.paid` with `{"fulfillment": "<text, up to 16 KB>"}` and the order goes `PAID → CONFIRMED → FULFILLED` at once (answering with the goods counts as the confirmation). Only the **first** valid fulfillment is taken; a retry or redelivery carries the same `order_id` and `X-APIbase-Delivery-Id`, and a later fulfillment is ignored and recorded as not accepted. **Deduplicate by `order_id`** on your side and make the handler idempotent.

**Pull instead of push.** `GET /merchants/me/events?since=<cursor>&limit=` returns your own events in order, `{events[{id, event, created_at, data}], next_cursor}`; pass `next_cursor` back as `since`. The same list also carries `order.confirm_overdue`, `order.ship_overdue` and `refund.overdue` notices, which are not pushed.

## Storefront MCP

Every active merchant has its own MCP endpoint: `POST/GET/DELETE https://apibase.pro/mcp/m/<slug>` (Streamable HTTP, the same sessions as `/mcp`). `serverInfo.name` is `<Merchant> via APIbase`. It lists exactly six tools — `shop.catalog.search`, `shop.catalog.get`, `shop.order.quote`, `shop.order.pay`, `shop.order.get`, `shop.order.cancel` — with the merchant bound to the endpoint (there is no `merchant` argument; a SKU of another merchant is `404`). It has no `apibase.discover`, no `shop.merchant.*` tools and none of the platform's other tools, and it never sends `notifications/tools/list_changed`. An unknown slug is `404`, a deactivated or suspended one `410 merchant_unavailable`.

**Product fields are merchant-supplied data, not instructions.** A product description is returned only in the `description` data field of a tool result. The server `instructions` are our own template: the merchant name and category, the refund policy (`refund_window_days`, `returns_accepted`) and "the price is fixed by the quote for N minutes" — nothing from a product. Agents must treat every merchant-written string the same way.

`apibase.discover` finds storefronts by product text: a result with `kind: "merchant"` carries `{slug, name, category, mcp_url, products_sample[3], reputation, payment}` and never a contact email. The `shop.*` definitions are versioned and hashed in the server-card (`shop_tools: {version, count, sha256}`); `npx tsx scripts/gen-shop-tools-hash.ts` refreshes it after an intended change.

An hourly job initialises 100 random active storefronts in-process; a failure is written to `shop_connect_events` as `storefront_probe_failed` (path `/mcp/m/<slug>`), and `storefront_probe_coverage` (probed / active) is exported as a metric.

## Connect check

`shop.merchant.check` (any valid merchant key) or `GET /api/v1/shop/merchants/me/check` runs five steps: `storefront_initialize`, `tools_list_6`, `quote_test_sku` (a quote for the `__apibase_test` item, voided at once, nothing is paid), `webhook_ping` (a signed `ping` event to your endpoint, any `2xx` passes) and `payment_verified` (a PAID test order made by your own agent exists). The answer is `{status: connected|incomplete, steps[{name, status: ok|fail|skipped, code?, detail?}], payment_verified, public_url, mcp_url}`; `detail` is for you only. `connected` needs the first four steps without a failure (a merchant with no webhook endpoint has `webhook_ping` skipped).

The public twin is `GET https://apibase.pro/integrator/check/<slug>`: the same steps with `name`, `status` and `code` only — no webhook URL, email, payout address or response body. It is limited to 20 requests/min per address and a slug's result is reused for 60 seconds.

## Legal documents

Draft texts, accepted by the operator without legal review; not a legal opinion.

- **Where.** `static/legal/{merchant-agreement,aup,dpa,refund-framework}.md` — English text first, Russian section below, both canonical in one file. The first line is `<!-- version: X; effective_from: YYYY-MM-DD; status: … -->`. The fee appears only as the token `{{INTEGRATOR_FEE_PCT}}` (substituted when the HTML page is rendered; `.md` keeps the token). The country list in `aup.md` is generated from `config/integrator/countries-restricted.json` by `scripts/shop/gen-aup-countries.ts`, never by hand.
- **Hash.** `sha256` is computed over the exact bytes of the `.md` file. `scripts/shop/sync-legal-docs.ts` (run at app start, and as `--check` in `npm run build`) upserts `shop_legal_docs(doc_id, version, sha256, url, effective_from, body_md)`. Changing text without changing `version` fails startup; a new `version` adds a row and old rows stay.
- **Routes.** `GET /legal/index.json` → `[{doc_id, version, sha256, url, effective_from}]`; `GET /legal/<doc_id>` → HTML, or the `.md` with `Accept: text/markdown`; `GET /legal/<doc_id>.md` → the raw file. 60 requests/min per address, then `429`.
- **DRAFT banner.** HTML pages carry `<div class="draft-banner">` and `<meta name="robots" content="noindex">` until `config/integrator/legal-published.json` (`{published_at, by}`) exists. It is placed by the operator's go-ahead, not committed. The `.md` never carries a banner.
- **Acceptance.** A merchant accepts the four documents by signing the §11.2 message with its wallet — see [Registration & terms](#registration--terms) (`shop.merchant.accept_terms`, `POST /merchants/me/acceptances`).
- `/terms` and `/privacy` have a new Integrator section (marked `integrator-legal` in the HTML); the other sections are unchanged.

## Integrator pages (INT-17)

Served by `src/shop/routes/integrator.router.ts` from `static/integrator/` (copied into the image by `docker/Dockerfile`). Each page is HTML, or Markdown with `Accept: text/markdown`; `Vary: Accept`; 120 requests/min per address.

| Path                                                           | Source                    | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/integrator`                                                  | `index.html` / `index.md` | 12 blocks in the §13.1 order: offer (RU/EN canon), flow diagram, shop illustration, variants A–D, connect in 10 minutes, sandbox + check, fee, security, FAQ, legal, AIpush.app, buyers. HTML ≤ 35 KB, no external resources, no script.                                                                                                                                                                                                                                   |
| `/integrator/llms.txt`                                         | `llms.txt`                | links to every page below.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `/integrator/agent-guide`                                      | `agent-guide.md`          | `nonce → register → accept_terms → catalog_upsert → webhook_set → check → pay test-SKU → payment_verified`, wallet precondition first, and one anchor per §6.4 error code (`#quote_expired` … `#test_sku_daily_cap`) for `documentation_url`.                                                                                                                                                                                                                              |
| `/integrator/buyers`, `/integrator/wallet`                     | `buyers.md`, `wallet.md`  | limits live in the buyer's wallet, price fixed by the quote, keys are never requested, what stays outside the guarantees; wallet help (no wallet is issued).                                                                                                                                                                                                                                                                                                               |
| `/integrator/why-base-tempo`                                   | `why-base-tempo.md`       | the F-5 text, without evaluative words.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `/integrator/platforms/{shopify,woocommerce,tilda,wix,custom}` | `platforms/*.md`          | paste link A–C; no script (UC-20).                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `/integrator/connect`                                          | `connect.html`            | human form: fields, category list from `prohibited-categories.json`, checkbox with the document hashes from `/legal/index.json`, three `personal_sign` signatures (encryption key, register, accept_terms), `POST /api/v1/shop/merchants` then `POST /api/v1/shop/merchants/me/acceptances` with `method: checkbox+wallet_signature`; one inline script ≤ 40 lines, no libraries. The browser generates an X25519 key; its private half is shown once next to the API key. |

**Tokens.** Templates carry `{{INTEGRATOR_FEE_PCT}}`, `{{INTEGRATOR_MIN_ORDER}}`, `{{MERCHANTS_COUNT}}`, `{{SANDBOX_STATUS}}`; they are filled at request time from `INTEGRATOR_FEE_ENABLED`/`INTEGRATOR_FEE_BPS`, `INTEGRATOR_MIN_ORDER_USD`, `SANDBOX_STATUS`; `MERCHANTS_COUNT` comes from `static/.well-known/mcp.json` (sync-counts baseline, in the image), not from env (INT-19 replaces the env defaults with sync-counts values). With the fee off the canon reads "0% fee during the pilot". The default sandbox line is "Sandbox: not yet available — use the $0.01 test SKU on mainnet".

## Implementation status (T-INT-20 reconciliation)

Checked against the code of wave 1: every tool of spec §6.1/§6.2 and every route of §6.3 below is marked `yes` (implemented, covered by `tests/unit/shop-integrator-doc-parity.test.ts`) or `no` (not in wave 1; the wave that adds it is named). `tests/integration/shop-adversarial-e2e.test.ts` runs the wave-1 flows end to end.

**Buyer tools (§6.1)**

| Tool                  | Wave 1 | Notes                                             |
| --------------------- | ------ | ------------------------------------------------- |
| `shop.catalog.search` | yes    |                                                   |
| `shop.catalog.get`    | yes    |                                                   |
| `shop.order.quote`    | yes    |                                                   |
| `shop.order.pay`      | yes    | `pii` envelopes (INT-21), physical goods (INT-22) |
| `shop.order.get`      | yes    |                                                   |
| `shop.order.cancel`   | yes    |                                                   |
| `shop.order.dispute`  | yes    | the payer only                                    |

**Merchant tools (§6.2)**

| Tool                           | Wave 1 | Notes  |
| ------------------------------ | ------ | ------ |
| `shop.merchant.register`       | yes    |        |
| `shop.merchant.accept_terms`   | yes    |        |
| `shop.merchant.catalog_upsert` | yes    |        |
| `shop.merchant.catalog_delete` | yes    |        |
| `shop.merchant.orders_list`    | yes    |        |
| `shop.merchant.order_confirm`  | yes    |        |
| `shop.merchant.order_document` | yes    |        |
| `shop.merchant.webhook_set`    | yes    |        |
| `shop.merchant.check`          | yes    |        |
| `shop.merchant.rotate_key`     | yes    |        |
| `shop.merchant.deactivate`     | yes    |        |
| `shop.merchant.order_ship`     | yes    |        |
| `shop.merchant.refund`         | yes    |        |
| `shop.merchant.stats`          | no     | wave 2 |

**REST routes (§6.3, under `/api/v1/shop`)**

| Route                                    | Wave 1 | Notes                |
| ---------------------------------------- | ------ | -------------------- |
| `GET /shops`                             | yes    |                      |
| `GET /shops/:slug`                       | yes    |                      |
| `GET /shops/:slug/products`              | yes    |                      |
| `POST /quotes`                           | yes    |                      |
| `GET /quotes/:id`                        | yes    |                      |
| `POST /quotes/:id/pay`                   | yes    | x402 and MPP         |
| `GET /quotes/:id/pay`                    | yes    | the challenge only   |
| `GET /orders/:id`                        | yes    |                      |
| `POST /orders/:id/cancel`                | yes    |                      |
| `POST /orders/:id/disputes`              | yes    | the payer only       |
| `GET /auth/nonce`                        | yes    |                      |
| `POST /merchants`                        | yes    |                      |
| `POST /merchants/me/acceptances`         | yes    |                      |
| `PUT /merchants/me/catalog`              | yes    |                      |
| `POST /merchants/me/catalog/import`      | no     | wave 2               |
| `GET /merchants/me/orders`               | yes    |                      |
| `POST /merchants/me/orders/:id/confirm`  | yes    |                      |
| `GET /merchants/me/orders/:id/pii`       | yes    | buyer-data envelopes |
| `POST /merchants/me/orders/:id/document` | yes    |                      |
| `POST /merchants/me/orders/:id/ship`     | yes    |                      |
| `POST /merchants/me/refunds`             | yes    | `refunds:write`      |
| `PUT /merchants/me/webhooks`             | yes    |                      |
| `GET /merchants/me/stats`                | no     | wave 2               |
| `GET /merchants/me/events`               | yes    |                      |
| `GET /merchants/me/check`                | yes    |                      |
| `POST /merchants/me/deactivate`          | yes    |                      |
| `POST /merchants/me/keys/rotate`         | yes    |                      |
| `POST /merchants/me/keys/reissue`        | yes    |                      |

**Public routes (outside `/api/v1/shop`)**: `GET /m/:slug`, `/m/:slug/p/:sku`, `/m/:slug/cart`, `/m/:slug/agent.json`, `/m/:slug/llms.txt`, `/shops`, `/integrator/check/:slug`, `/legal/index.json` — yes. `/api/v1/fleet/sea` (spec §13.3) — no, it is not part of the shop surface.

## Demo merchant seed

`POST /integrator/demo-webhook` is a demo receiver, logs only.

`apibase-demo` (category `digital-goods`) sells the test SKU `__apibase_test` at $0.01 and two instant text products, `demo-guide` ($1.00) and `demo-bundle` ($5.00), refund window 14 days, plus `demo-tour` ($1.00, `requires_pii: ['passport']`, instant) for the end-to-end encrypted passport flow. It is created only through the public API by `scripts/shop/seed-demo-merchant.ts`:

0. Decide the seller identity wallet yourself (an EOA you control and can sign with). It is not read from any endpoint; no `/health/operator` or other lookup is involved.
1. `npx tsx scripts/shop/seed-demo-merchant.ts --prepare --wallet <seller identity wallet> --base-url https://apibase.pro` prints three messages (register, accept_terms, encryption_key) and writes nothing. Sign each with the seller wallet (EIP-191 `personal_sign`) within 5 minutes and save `{wallet, register:{message, signature}, accept_terms:{message, signature}, encryption_key:{signature}}` as a JSON file.
2. `npx tsx scripts/shop/seed-demo-merchant.ts --submit --signatures <file> --base-url https://apibase.pro --payout-base <Base wallet> --payout-tempo <Tempo wallet> --webhook-url <https receiver>` runs `POST /merchants`, `POST /merchants/me/acceptances`, `PUT /merchants/me/catalog`, `PUT /merchants/me/webhooks` and `GET /merchants/me/check`, then prints the `mk_live_` key and the webhook secret once. Right after `accept_terms` it prints one line `{"step":"accept_terms","merchant_id":...,"api_key":...}`: save it. If a later step fails, the error ends with "api_key already written to stdout"; put the key on the first line of a file and run `npx tsx scripts/shop/seed-demo-merchant.ts --resume --api-key-file <file> --base-url https://apibase.pro [--webhook-url <https receiver>]` to run catalog, webhooks and check with the existing key.

The automated test runs it only against an in-process test instance with a throwaway wallet; it is never run by CI against production.
