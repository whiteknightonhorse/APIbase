# APIbase merchant renewer

Renews the **Tempo subscriptions of your own APIbase shop** with **your own access key**.

A buyer's agent authorizes your key address on Tempo (`accessKey.authorize`, limited to the plan
price × the remaining periods, with an expiry). Each period, this CLI reads your renew queue from
APIbase, sends the payment from the payer's account with your key, and reports the transaction
hashes. APIbase keeps the schedule and the accounting and **verifies every renewal on-chain**
(recipient, amount, memo, payer). You pay the gas.

**The key is generated and kept by you.** `init` creates it on your machine; only its address is
registered with APIbase. The CLI never sends the key anywhere: only your merchant API key
(`mk_live_…`) and transaction hashes go to APIbase. The buyer can revoke the key at any time
(`accessKey.revoke`), and canceling the subscription empties your queue.

## Install

```bash
npm install -g @apibase11/merchant-renewer
```

Or from the repository: `cd packages/merchant-renewer && npm install && npm run build`.

## Use

```bash
apibase-merchant-renewer init --key-file ./apibase-renewer.key     # prints the address (key_id)
# register the ADDRESS only (merchant key, scope catalog:write):
#   PUT /api/v1/shop/merchants/me/renewer-key  {"key_id": "0x…", "expires_at": "2027-12-31T00:00:00Z"}
apibase-merchant-renewer run --key-file ./apibase-renewer.key --mk mk_live_… --interval 60
```

Options: `--key-env NAME` or `--key-file PATH` (the key), `--mk` (or `APIBASE_MERCHANT_KEY`),
`--api` (default `https://apibase.pro`), `--interval` seconds (default 60, minimum 5), `--rpc URL`,
`--once`. Your merchant key needs `orders:read` and `orders:write`. Fund the key address with a
little of the Tempo fee token: it pays the gas. When the platform fee is on, each period is two
transfers from the payer: `price − fee` to your payout wallet and `fee` to the platform.

`DELETE /api/v1/shop/merchants/me/renewer-key` removes the registration.

## License

MIT
