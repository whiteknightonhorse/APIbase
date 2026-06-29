-- T6 (2026-06-29): persist on-chain payer wallet (x402/MPP) for per-wallet client analytics.
-- Additive, nullable; on the partitioned parent it cascades to all execution_ledger_* partitions.
ALTER TABLE "execution_ledger" ADD COLUMN IF NOT EXISTS "payer" VARCHAR(64);
