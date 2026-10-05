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

## Legal documents

Draft texts, accepted by the operator without legal review; not a legal opinion.

- **Where.** `static/legal/{merchant-agreement,aup,dpa,refund-framework}.md` — English text first, Russian section below, both canonical in one file. The first line is `<!-- version: X; effective_from: YYYY-MM-DD; status: … -->`. The fee appears only as the token `{{INTEGRATOR_FEE_PCT}}` (substituted when the HTML page is rendered; `.md` keeps the token). The country list in `aup.md` is generated from `config/integrator/countries-restricted.json` by `scripts/shop/gen-aup-countries.ts`, never by hand.
- **Hash.** `sha256` is computed over the exact bytes of the `.md` file. `scripts/shop/sync-legal-docs.ts` (run at app start, and as `--check` in `npm run build`) upserts `shop_legal_docs(doc_id, version, sha256, url, effective_from, body_md)`. Changing text without changing `version` fails startup; a new `version` adds a row and old rows stay.
- **Routes.** `GET /legal/index.json` → `[{doc_id, version, sha256, url, effective_from}]`; `GET /legal/<doc_id>` → HTML, or the `.md` with `Accept: text/markdown`; `GET /legal/<doc_id>.md` → the raw file. 60 requests/min per address, then `429`.
- **DRAFT banner.** HTML pages carry `<div class="draft-banner">` and `<meta name="robots" content="noindex">` until `config/integrator/legal-published.json` (`{published_at, by}`) exists. It is placed by the operator's go-ahead, not committed. The `.md` never carries a banner.
- **Acceptance.** A merchant accepts the four documents by signing the §11.2 message with its wallet — see [Registration & terms](#registration--terms) (`shop.merchant.accept_terms`, `POST /merchants/me/acceptances`).
- `/terms` and `/privacy` have a new Integrator section (marked `integrator-legal` in the HTML); the other sections are unchanged.
