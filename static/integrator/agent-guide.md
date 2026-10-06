# Agent guide: connect a merchant to AI payment

For a merchant's agent. Read this page (or its Markdown form, `Accept: text/markdown`) and run the steps in order. Every error carries `error_code`, `message`, `suggested_action` and `documentation_url`; the `documentation_url` anchors are the codes listed under "Error codes" below. Fee: {{INTEGRATOR_FEE_PCT}}. Humans can use the form at /integrator/connect instead. To see whether your site is already visible to agents, try AIpush.app: https://aipush.app

## Preconditions

1. A wallet with USDC on Base or Tempo, plus an x402 (Base) or MPP (Tempo) client able to sign a payment from it. Step 7 needs both for `payment_verified`. The merchant's own wallet signs steps 1 to 3. APIbase issues no wallets: see /integrator/wallet.
2. A shop with a public https site and a category from the allowed list (it is the drop-down in the form at /integrator/connect; a refused category returns the nearest allowed ones in `alternatives[]`).
3. A https webhook URL that resolves to public addresses (optional; the check skips `webhook_ping` without it).
4. Where to put the link afterwards: /integrator#options (variants A to D).

## Step 1. nonce

Call `GET /api/v1/shop/auth/nonce?wallet=<wallet>&purpose=register`. The reply is `{nonce, issued_at, expires_in, message}`. A nonce is single-use and lives 300 seconds. Sign `message` exactly (EIP-191 personal_sign).

Errors: `rate_limited` (429), `validation_failed` (422).

## Step 2. register

Call `POST /api/v1/shop/merchants` (MCP tool `shop.merchant.register`) with the shop fields from the tool's input schema (slug, name, category, country, contact email, site_url, payout wallets) and `encryption_key {kid, alg: "x25519", pub, sig_by_wallet}`, plus `message` and `signature` from step 1. `sig_by_wallet` signs the text `apibase.pro merchant encryption key`, a newline, `kid: <kid>`, a newline, `alg: <alg>`, a newline, `pub: <pub>`.

The reply is `{merchant_id, slug, status: "pending", docs_to_accept: [{doc_id, version, sha256, url}]}`. Without a signature the call is 401.

Errors: `country_not_supported` (403), `category_prohibited` (403, with `alternatives[]`), `slug_taken` and `wallet_registered` (409), `payout_wallet_sanctioned` (403).

## Step 3. accept_terms

Get a fresh nonce with `purpose=accept_terms`; its `message` is the acceptance text with the four document hashes. Sign it and call `POST /api/v1/shop/merchants/me/acceptances` (MCP tool `shop.merchant.accept_terms`) with `{wallet, doc_hashes: [{doc_id, version, sha256}], message, signature}`. All four documents are required: merchant-agreement, aup, dpa, refund-framework (see /legal/index.json).

The reply is `{status: "active", api_key: "mk_live_..."}`. The key is shown once; store it. Repeating the call returns `{status: "active"}` without a new key.

Errors: `terms_not_accepted` (428, `docs[]` holds the current hashes), `merchant_unavailable` (410).

## Step 4. catalog_upsert

Call `PUT /api/v1/shop/merchants/me/catalog` with `Authorization: Bearer <api_key>` and `{items: [...]}` (MCP tool `shop.merchant.catalog_upsert`). Up to 500 items per call. Include exactly one test item: `sku: "__apibase_test"`, `is_test: true`, `price_usd: 0.01`. The reply lists `upserted`, `flagged` and `rejected`; a bad item never blocks the others.

Errors: `terms_not_accepted` (428), `merchant_unavailable` (410), `category_prohibited` (an item in `rejected`).

## Step 5. webhook_set

Call `PUT /api/v1/shop/merchants/me/webhooks` with `{url, events[]}` (MCP tool `shop.merchant.webhook_set`). The reply shows the `whsec_` signing secret once. Deliveries carry `X-APIbase-Signature: t=<unix>,v1=<hex>` where `v1` is HMAC-SHA256 of `t + "." + body` with that secret. Answer any 2xx within 10 seconds.

Errors: `validation_failed` (422, for example a private address or a non-https URL), `merchant_unavailable` (410).

## Step 6. check

Call `GET /api/v1/shop/merchants/me/check` (MCP tool `shop.merchant.check`). The reply is `{status: "connected" | "incomplete", steps[], payment_verified, public_url, mcp_url}`. `connected` needs `storefront_initialize`, `tools_list_6`, `quote_test_sku` and `webhook_ping` without a failure. The same statuses, without details, are public at `/integrator/check/<slug>`.

{{SANDBOX_STATUS}}

Errors: `merchant_unavailable` (410).

## Step 7. pay test-SKU

With the wallet from the preconditions, act as a buyer of your own shop:

1. `POST /api/v1/shop/quotes` with `{merchant: "<slug>", items: [{sku: "__apibase_test", qty: 1}]}`. The reply carries `quote_id`, `total_usd` and `pay`.
2. Pay by x402: sign the authorization described in `pay.x402` and send it as `X-Payment` to `POST /api/v1/shop/quotes/<quote_id>/pay` (on the storefront MCP endpoint `/mcp/m/<slug>` the tool is `shop.order.pay`). On Tempo use the MPP challenge from the same URL.
3. A `200` with `state` of `FULFILLED` or `CLOSED` and fulfillment text `test ok` means the order is paid. At most three paid test orders per day are allowed.

Errors: `quote_expired`, `out_of_stock`, `test_sku_daily_cap`, `payment_required`, `payment_amount_mismatch`, `payment_pending`, `quote_already_paying`, `already_placed`, `pii_required`, `pii_plaintext_rejected`.

## Step 8. payment_verified

Call the check again (step 6). `payment_verified` is `true` once a PAID test order made by your own agent exists. Then place link A, B, C or D on the merchant's site: /integrator#options.

## Fee-split on Base: two signatures

When the fee is on, the Base 402 of `POST /api/v1/shop/quotes/:id/pay` carries `accepts[0].extra.fee_split`:

```json
{"v": 1, "fee_to": "0x...", "fee_amount": "1340000", "merchant_amount": "87660000", "how": "..."}
```

A client that supports it signs two EIP-3009 `TransferWithAuthorization` messages with the same wallet and different random nonces: the first to `accepts[0].payTo` for `merchant_amount`, the second to `fee_to` for `fee_amount`. It sends the second one inside the payment payload:

```json
{
  "x402Version": 2,
  "accepted": {"scheme": "exact", "network": "eip155:8453"},
  "payload": {
    "authorization": {"from": "0x...", "to": "<payTo>", "value": "<merchant_amount>", "validAfter": "0", "validBefore": "<unix>", "nonce": "0x<32 bytes>"},
    "signature": "0x...",
    "feeAuthorization": {
      "authorization": {"from": "0x...", "to": "<fee_to>", "value": "<fee_amount>", "validAfter": "0", "validBefore": "<unix>", "nonce": "0x<32 bytes>"},
      "signature": "0x..."
    }
  }
}
```

Base64-encode the JSON into the `X-Payment` header as usual. Any other amount, recipient or payer is refused with `payment_amount_mismatch` and nothing is claimed. Without `feeAuthorization` the single authorization for the full total still works and the fee is invoiced. Example client: `scripts/shop/examples/x402-fee-split-client.ts`.

## Error codes

### `quote_expired`

HTTP 410. The quote is past `expires_at`. The reply carries a fresh quote in `extra.quote` with current prices. Pay that one.

### `out_of_stock`

HTTP 409. Another buyer took the last unit. The reply has `available` and up to three `alternatives`.

### `payment_required`

HTTP 402. The settle was refused or no payment was sent. Nothing was delivered. Sign a new authorization (new nonce) and pay again before the quote expires.

### `payment_amount_mismatch`

HTTP 402. The signed amount or address differs from the quote. Sign again for exactly `total_usd` to the `payTo` address in the quote.

### `payment_pending`

HTTP 202 with `order_id`. The receipt was not seen in time. Do not pay again; poll `GET /api/v1/shop/orders/<order_id>` until the state changes. A job reconciles the chain.

### `quote_already_paying`

HTTP 409. An MPP payment for this quote is already in progress. Wait and read the order.

### `pii_required`

HTTP 422. The product needs personal data, encrypted under the merchant's key from `shop.catalog.get`. Add it and retry.

### `pii_plaintext_rejected`

HTTP 400. Personal data was sent in the clear; the value is not echoed. Send it encrypted.

### `merchant_unavailable`

HTTP 410 or 503. The shop is deactivated, suspended or temporarily unavailable. The reason is not disclosed.

### `country_not_supported`

HTTP 403. The entity country or the sign-up address country is not served. See /legal/aup.

### `category_prohibited`

HTTP 403. The category is not supported. `alternatives[]` lists the nearest allowed categories. See /legal/aup.

### `terms_not_accepted`

HTTP 428. The merchant is pending, a document hash or version is not the current one, or a re-acceptance is overdue. `docs[]` holds the current hashes: redo step 3.

### `already_placed`

HTTP 200. The same buyer already paid this quote; the reply is the same order. Nothing is charged twice.

### `test_sku_daily_cap`

HTTP 429. The daily limit of paid test orders is reached. Try again after 24 hours.
