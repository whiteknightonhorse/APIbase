-- T-0426: the TIP-20 token an MPP payment actually moved (on-chain `to` of the transfer, fallback the
-- configured USDC.e). Nullable: x402, free and historical rows stay NULL. Altering the partitioned
-- parent propagates the column to every existing and future daily partition.
ALTER TABLE "execution_ledger" ADD COLUMN IF NOT EXISTS "asset" VARCHAR(64);
