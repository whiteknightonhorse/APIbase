# Integrator guide: internal notes

Public guide: static/integrator/docs.md, served at /integrator/docs

## Implementation status (T-INT-20 reconciliation)

Checked against the code of wave 1: every tool of spec §6.1/§6.2 and every route of §6.3 below is marked `yes` (implemented, covered by `tests/unit/shop-integrator-doc-parity.test.ts`) or `no` (not in wave 1; the wave that adds it is named). `tests/integration/shop-adversarial-e2e.test.ts` runs the wave-1 flows end to end.

**Buyer tools (§6.1)**

| Tool                       | Wave 1 | Notes                                             |
| -------------------------- | ------ | ------------------------------------------------- |
| `shop.catalog.search`      | yes    |                                                   |
| `shop.catalog.get`         | yes    |                                                   |
| `shop.order.quote`         | yes    |                                                   |
| `shop.order.pay`           | yes    | `pii` envelopes (INT-21), physical goods (INT-22) |
| `shop.order.get`           | yes    |                                                   |
| `shop.order.cancel`        | yes    |                                                   |
| `shop.order.dispute`       | yes    | the payer only                                    |
| `shop.subscription.get`    | yes    | T-INT-41, the payer only                          |
| `shop.subscription.cancel` | yes    | T-INT-41, the payer only                          |

**Merchant tools (§6.2)**

| Tool                           | Wave 1 | Notes        |
| ------------------------------ | ------ | ------------ |
| `shop.merchant.register`       | yes    |              |
| `shop.merchant.accept_terms`   | yes    |              |
| `shop.merchant.catalog_upsert` | yes    |              |
| `shop.merchant.catalog_delete` | yes    |              |
| `shop.merchant.orders_list`    | yes    |              |
| `shop.merchant.order_confirm`  | yes    |              |
| `shop.merchant.order_document` | yes    |              |
| `shop.merchant.webhook_set`    | yes    |              |
| `shop.merchant.check`          | yes    |              |
| `shop.merchant.rotate_key`     | yes    |              |
| `shop.merchant.deactivate`     | yes    |              |
| `shop.merchant.order_ship`     | yes    |              |
| `shop.merchant.refund`         | yes    |              |
| `shop.merchant.stats`          | yes    | `stats:read` |

**REST routes (§6.3, under `/api/v1/shop`)**

| Route                                          | Wave 1 | Notes                                                                                                    |
| ---------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `GET /shops`                                   | yes    |                                                                                                          |
| `GET /shops/:slug`                             | yes    |                                                                                                          |
| `GET /shops/:slug/products`                    | yes    |                                                                                                          |
| `POST /quotes`                                 | yes    |                                                                                                          |
| `GET /quotes/:id`                              | yes    |                                                                                                          |
| `POST /quotes/:id/pay`                         | yes    | x402 and MPP                                                                                             |
| `GET /quotes/:id/pay`                          | yes    | the challenge only                                                                                       |
| `GET /orders/:id`                              | yes    |                                                                                                          |
| `POST /orders/:id/cancel`                      | yes    |                                                                                                          |
| `POST /orders/:id/disputes`                    | yes    | the payer only                                                                                           |
| `GET /subscriptions/:id`                       | yes    | T-INT-41                                                                                                 |
| `POST /subscriptions/:id/cancel`               | yes    | T-INT-41                                                                                                 |
| `POST /subscriptions/:id/preauthorize`         | yes    | T-INT-47, the payer only                                                                                 |
| `POST /subscriptions/:id/confirm-pull`         | yes    | T-INT-49, the payer only                                                                                 |
| `GET /merchants/me/subscriptions`              | yes    | T-INT-41                                                                                                 |
| `POST /merchants/me/subscriptions/:id/cancel`  | yes    | T-INT-41                                                                                                 |
| `PUT /merchants/me/renewer-key`                | yes    | T-INT-49, address only                                                                                   |
| `DELETE /merchants/me/renewer-key`             | yes    | T-INT-49                                                                                                 |
| `GET /merchants/me/subscriptions/renew-queue`  | yes    | T-INT-49                                                                                                 |
| `POST /merchants/me/subscriptions/:id/renewed` | yes    | T-INT-49                                                                                                 |
| `GET /auth/nonce`                              | yes    |                                                                                                          |
| `POST /merchants`                              | yes    |                                                                                                          |
| `POST /merchants/me/acceptances`               | yes    |                                                                                                          |
| `PUT /merchants/me/catalog`                    | yes    |                                                                                                          |
| `DELETE /merchants/me/catalog`                 | yes    | T-0294 `{skus[1..200]}`, `shop.merchant.catalog_delete`; an open quote on a sku → `409`, nothing deleted |
| `POST /merchants/me/catalog/import`            | yes    | T-INT-32                                                                                                 |
| `GET /merchants/me/catalog/import/:id`         | yes    | T-INT-32                                                                                                 |
| `GET /merchants/me/orders`                     | yes    |                                                                                                          |
| `GET /merchants/me/orders/:id`                 | yes    | T-0294 one order card + `events[]`; another merchant's id → `404`                                        |
| `POST /merchants/me/orders/:id/confirm`        | yes    |                                                                                                          |
| `GET /merchants/me/orders/:id/pii`             | yes    | buyer-data envelopes                                                                                     |
| `POST /merchants/me/orders/:id/document`       | yes    |                                                                                                          |
| `POST /merchants/me/orders/:id/ship`           | yes    |                                                                                                          |
| `POST /merchants/me/refunds`                   | yes    | `refunds:write`                                                                                          |
| `PUT /merchants/me/webhooks`                   | yes    |                                                                                                          |
| `GET /merchants/me/stats`                      | yes    | `stats:read`                                                                                             |
| `GET /merchants/me/events`                     | yes    |                                                                                                          |
| `GET /merchants/me/check`                      | yes    |                                                                                                          |
| `POST /merchants/me/deactivate`                | yes    |                                                                                                          |
| `POST /merchants/me/keys/rotate`               | yes    |                                                                                                          |
| `POST /merchants/me/keys/reissue`              | yes    |                                                                                                          |

**Public routes (outside `/api/v1/shop`)**: `GET /m/:slug`, `/m/:slug/p/:sku`, `/m/:slug/cart`, `/m/:slug/agent.json`, `/m/:slug/llms.txt`, `/shops`, `/integrator/check/:slug`, `/legal/index.json` — yes. `/api/v1/fleet/sea` (spec §13.3) — no, it is not part of the shop surface.

## Demo merchant seed

`POST /integrator/demo-webhook` is a demo receiver, logs only.

`apibase-demo` (category `digital-goods`) sells the test SKU `__apibase_test` at $0.01 and two instant text products, `demo-guide` ($1.00) and `demo-bundle` ($5.00), refund window 14 days, plus `demo-tour` ($1.00, `requires_pii: ['passport']`, instant) for the end-to-end encrypted passport flow, plus `demo-stream` (a 10 KB text stream, $0.0001 per second, minimum deposit $1; see Streams: it sells only after the operator sets `INTEGRATOR_STREAM_PILOT_TEMPO_KEY` to the key of the demo shop's Tempo payout wallet and sets its `stream_settler` to `apibase_pilot`). It is created only through the public API by `scripts/shop/seed-demo-merchant.ts`:

0. Decide the seller identity wallet yourself (an EOA you control and can sign with). It is not read from any endpoint; no `/health/operator` or other lookup is involved.
1. `npx tsx scripts/shop/seed-demo-merchant.ts --prepare --wallet <seller identity wallet> --base-url https://apibase.pro` prints three messages (register, accept_terms, encryption_key) and writes nothing. Sign each with the seller wallet (EIP-191 `personal_sign`) within 5 minutes and save `{wallet, register:{message, signature}, accept_terms:{message, signature}, encryption_key:{signature}}` as a JSON file.
2. `npx tsx scripts/shop/seed-demo-merchant.ts --submit --signatures <file> --base-url https://apibase.pro --payout-base <Base wallet> --payout-tempo <Tempo wallet> --webhook-url <https receiver>` runs `POST /merchants`, `POST /merchants/me/acceptances`, `PUT /merchants/me/catalog`, `PUT /merchants/me/webhooks` and `GET /merchants/me/check`, then prints the `mk_live_` key and the webhook secret once. Right after `accept_terms` it prints one line `{"step":"accept_terms","merchant_id":...,"api_key":...}`: save it. If a later step fails, the error ends with "api_key already written to stdout"; put the key on the first line of a file and run `npx tsx scripts/shop/seed-demo-merchant.ts --resume --api-key-file <file> --base-url https://apibase.pro [--webhook-url <https receiver>]` to run catalog, webhooks and check with the existing key.

The automated test runs it only against an in-process test instance with a throwaway wallet; it is never run by CI against production.
