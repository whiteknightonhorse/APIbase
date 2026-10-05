# APIbase Integrator (merchant) guide

## Registration & terms

A merchant goes `pending` → `active` in three calls. Everything is authenticated by the merchant
wallet's EIP-191 signature; the `mk_live_` API key is issued once, at the end.

| Step | REST (`/api/v1/shop`)                                    | MCP tool                     |
| ---- | -------------------------------------------------------- | ---------------------------- |
| 1    | `GET /auth/nonce?wallet=0x…&purpose=register`            | —                            |
| 2    | `POST /merchants`                                        | `shop.merchant.register`     |
| 3    | `GET /auth/nonce?wallet=0x…&purpose=accept_terms`        | —                            |
| 4    | `POST /merchants/me/acceptances`                         | `shop.merchant.accept_terms` |
| —    | `POST /merchants/me/keys/rotate` (Bearer)                | `shop.merchant.rotate_key`   |
| —    | `POST /merchants/me/deactivate` (Bearer, `orders:write`) | `shop.merchant.deactivate`   |

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
- Digital items only for now: `shipping_option`/`delivery_slot` → `422`; a `physical` product → `422 physical fulfillment not available yet`.

**Response** (`201`): `quote_id, order_id, items[{sku, variant?, title, qty, unit_price_usd, line_total_usd}], total_usd, fee_disclosed: false, expires_at, requires_pii[], requires_human_confirmation, pay`. Prices come from the server catalog, never from the request.

**`pay`** contains only the rails the quote offers: `x402: {payTo, amount, network, asset, extra: {quote_id}}` — `payTo` is the merchant's `payout_wallet_base` (never the platform wallet), `amount` is micro-USDC (`toMicroUsdc(total_usd)`); `mpp: {url}` = `POST /api/v1/shop/quotes/{id}/pay`. On `/mcp` orders are paid by x402 only, so `pay.mpp` is omitted there.

**TTL.** 15 minutes by default (`limits.quote_ttl_s`, merchant range 5–60 min). Past `expires_at` the quote is `expired`: `GET` returns `410 quote_expired` with a fresh quote in `quote` (same items, current prices); if the items have meanwhile sold out, `410` carries `alternatives` instead.

**Reservations.** Items with tracked `stock` are held atomically when the quote is made (all lines or none) until `expires_at`; the loser of a race gets `409 out_of_stock` with `available` and up to 3 `alternatives` of the same category. Expiry or cancel releases the hold.

**Limits.** Order total ≥ `$1.00` (`INTEGRATOR_MIN_ORDER_USD`), ≤ `limits.max_order_usd`; merchants younger than 30 days with fewer than 10 closed orders are capped at `limits.new_merchant_cap_usd` (`$200`) → `422`. `requires_human_confirmation` is true above `limits.human_confirm_above_usd` (default `$100`). Quotes per buyer identity (agent, wallet hash or IP): 30/min, 300/hour → `429 rate_limited`; a banned identity → `429 banned`. The merchant must have accepted the current terms (`428`) and be active (`410`).

**Test SKU.** `__apibase_test` is bought alone, qty 1, no minimum, `fee_usd = 0`. At most `INTEGRATOR_TEST_SKU_DAILY_CAP` (3) paid test orders per merchant per 24 hours; the next quote → `429 test_sku_daily_cap`.

**Fee** (internal, not in the response): when `INTEGRATOR_FEE_ENABLED=true`, `max(total × INTEGRATOR_FEE_BPS / 10000, INTEGRATOR_FEE_MIN_USD)` rounded up to the cent (150 bps, min `$0.05`); `0` otherwise and for the test SKU. With the fee on it must also be ≥ `X402_GAS_ESTIMATE_USD × 10`, else `422`.

Error codes: `quote_expired` (410), `out_of_stock` (409), `test_sku_daily_cap` (429), `below_minimum`/`above_max_order`/`new_merchant_cap` (422), `not_cancellable` (409), `quote_not_open` (409).

## Legal documents

Draft texts, accepted by the operator without legal review; not a legal opinion.

- **Where.** `static/legal/{merchant-agreement,aup,dpa,refund-framework}.md` — English text first, Russian section below, both canonical in one file. The first line is `<!-- version: X; effective_from: YYYY-MM-DD; status: … -->`. The fee appears only as the token `{{INTEGRATOR_FEE_PCT}}` (substituted when the HTML page is rendered; `.md` keeps the token). The country list in `aup.md` is generated from `config/integrator/countries-restricted.json` by `scripts/shop/gen-aup-countries.ts`, never by hand.
- **Hash.** `sha256` is computed over the exact bytes of the `.md` file. `scripts/shop/sync-legal-docs.ts` (run at app start, and as `--check` in `npm run build`) upserts `shop_legal_docs(doc_id, version, sha256, url, effective_from, body_md)`. Changing text without changing `version` fails startup; a new `version` adds a row and old rows stay.
- **Routes.** `GET /legal/index.json` → `[{doc_id, version, sha256, url, effective_from}]`; `GET /legal/<doc_id>` → HTML, or the `.md` with `Accept: text/markdown`; `GET /legal/<doc_id>.md` → the raw file. 60 requests/min per address, then `429`.
- **DRAFT banner.** HTML pages carry `<div class="draft-banner">` and `<meta name="robots" content="noindex">` until `config/integrator/legal-published.json` (`{published_at, by}`) exists. It is placed by the operator's go-ahead, not committed. The `.md` never carries a banner.
- **Acceptance.** A merchant accepts the four documents by signing the §11.2 message with its wallet — see [Registration & terms](#registration--terms) (`shop.merchant.accept_terms`, `POST /merchants/me/acceptances`).
- `/terms` and `/privacy` have a new Integrator section (marked `integrator-legal` in the HTML); the other sections are unchanged.
