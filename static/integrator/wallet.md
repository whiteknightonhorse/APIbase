# Wallet help: getting a wallet with USDC

APIbase does not issue wallets and does not hold anyone's keys. You bring your own, for the seller's payout address and for a buyer's payments.

## Options

- Base: any wallet that holds USDC on Base, for example Coinbase Wallet. Payments use x402.
- Tempo: a Tempo wallet with USDC.e on Tempo. Payments use MPP.

## Seller

You need a payout address on Base, on Tempo, or both. It receives the buyer's payment directly. Keep the key yourself: nobody at APIbase can recover it. Registration is signed with this wallet, so use one you control.

## Buyer or buyer's agent

Fund the wallet with USDC, then set a per-payment and a per-session limit in the wallet or the agent's client before the first purchase. See /integrator/buyers.

## Never share keys

Integrator never asks for a private key or a seed phrase. Sign messages in the wallet; do not paste keys into any form.

## Next

Sellers: /integrator/connect or /integrator/agent-guide. Why two rails: /integrator/why-base-tempo.
