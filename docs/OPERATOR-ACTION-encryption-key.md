# Operator action: ENCRYPTION_KEY

`ENCRYPTION_KEY` is the AES-256-GCM key used to encrypt data at rest: merchant
fulfillment payloads, merchant webhook secrets and vendor device OAuth tokens.

With `NODE_ENV=production` the API, worker and outbox-worker refuse to start if
`ENCRYPTION_KEY` is shorter than 32 characters. Other environments (test, CI)
are not checked.

## Generate

    openssl rand -hex 32

This gives a 64-character hex string. Put it in the deployment `.env` as
`ENCRYPTION_KEY=<value>`. Never commit it and never print it in logs.

## Back up

Store a copy in the operator's password manager or secret store, outside the
server. The key must be identical for api, worker and outbox-worker.

## Loss and rotation

- Losing the key makes all encrypted fulfillment payloads and webhook secrets
  unreadable.
- Rotation is not supported in wave 1. Do not change the value on a running
  system that already holds encrypted data.
