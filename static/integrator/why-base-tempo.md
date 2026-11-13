# Why Base and Tempo

Base: USDC is native; x402 is an open protocol for paying HTTP requests in USDC, governed by the x402 Foundation (Linux Foundation) since 2026-07-14; our facilitator settles. Tempo: settlement and network fees in a stablecoin; native splits and sessions (MPP). OUSD also exists on Tempo; APIbase accepts USDC.e today.

## Fee on each rail

On Tempo the fee, when it is on, travels inside the buyer's transaction as a split. On Base ({{INTEGRATOR_BASE_FEE_MODE}}): when the buyer's client supports fee-split it signs two authorizations and the fee travels in the same transaction; otherwise the fee stays out of the transaction, and APIbase records it as a receivable and bills the seller by invoice. While the fee is off, APIbase records nothing on either rail. Current fee: {{INTEGRATOR_FEE_PCT}}.

Back to /integrator.
