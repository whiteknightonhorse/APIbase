-- T-0177 (SG-11 ruling-1, 2026-09-23): distinguish "billing_status=PAID" from
-- "actually settled on-chain" for x402 rows. Discovered the self-hosted
-- local facilitator has settled ~0 on-chain since 2026-06-16 (operator gas
-- wallet empty) while the ledger kept recording PAID -- this column lets a
-- report tell the two apart going forward without touching the append-only
-- write path's PAID semantics (§8.9, unchanged). NULL for existing rows and
-- for MPP/free/cache rows (no facilitator settle step to report on).
ALTER TABLE "execution_ledger" ADD COLUMN IF NOT EXISTS "x402_onchain_settled" BOOLEAN;
