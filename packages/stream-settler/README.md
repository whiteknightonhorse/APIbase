# APIbase stream settler

Settles and closes the payment-stream channels of **your own APIbase shop** with **your own key**.

When a shop uses `stream_settler = 'merchant'`, APIbase keeps the accounting and verifies the
payer's vouchers, but only the channel payee (your payout wallet) can `settle` or `close` a
channel on-chain. This CLI reads your settle queue from APIbase, sends the on-chain transaction
from your wallet, and then tells APIbase the transaction hash. APIbase checks the result on-chain.

**The CLI never sends your signing key anywhere.** The key is read from your environment variable
or key file, signs transactions locally, and only its address and length are logged. The only
things sent to APIbase are your merchant API key (`mk_live_…`) and a transaction hash.

## Install

```bash
npm install -g @apibase11/stream-settler
```

Or from the repository: `cd packages/stream-settler && npm install && npm run build`.

## Use

```bash
export MERCHANT_TEMPO_KEY=0x…   # the key of your payout_wallet_tempo
apibase-stream-settler --key-env MERCHANT_TEMPO_KEY --api https://apibase.pro --mk mk_live_… --interval 60
```

Options: `--key-env NAME` or `--key-file PATH` (the key), `--mk` (or `APIBASE_MERCHANT_KEY`),
`--api` (default `https://apibase.pro`), `--interval` seconds (default 60, minimum 5), `--rpc URL`,
`--once` (one pass, then exit). Your merchant key needs the `orders:read` and `orders:write`
scopes. The wallet needs a little USDC for transaction fees.

## systemd

```ini
[Unit]
Description=APIbase stream settler
After=network-online.target

[Service]
# MERCHANT_TEMPO_KEY=0x…  (chmod 600, owned by the service user)
EnvironmentFile=/etc/apibase-settler.env
ExecStart=/usr/bin/env apibase-stream-settler --key-env MERCHANT_TEMPO_KEY --mk mk_live_… --interval 60
Restart=always
User=apibase-settler

[Install]
WantedBy=multi-user.target
```

## License

MIT
