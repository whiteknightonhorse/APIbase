# Why Base and Tempo

Base: USDC is native; x402 is an open Coinbase protocol for paying HTTP requests in USDC; our facilitator settles. Tempo: settlement and network fees in a stablecoin; native splits and sessions (MPP).

## Fee on each rail

On Tempo the fee, when it is on, is taken inside the buyer's transaction as a split. On Base ({{INTEGRATOR_BASE_FEE_MODE}}): when the buyer's client supports fee-split it signs two authorizations and the fee travels in the same transaction; otherwise the fee is not in the transaction and is recorded as a receivable and billed to the seller by invoice. While the fee is off, nothing is recorded on either rail. Current fee: {{INTEGRATOR_FEE_PCT}}.

Back to /integrator.
