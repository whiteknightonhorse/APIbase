-- FIX: TWO execution_ledger CHECK constraints have rejected the values
-- escrow-finalize's settle-on-block path (F2/C-3, migration 0005_add_moderation,
-- 2026-09-01) writes for a moderation-blocked PAID request -- 'BLOCKED' for
-- payload_status, 'blocked' for status -- since neither constraint was widened
-- when that feature was built. Every real settle-on-block write has been
-- silently failing in production ever since: caught by pipeline.ts's try/catch
-- around the finalize call and logged as an error, but the client-facing
-- response still says "Payment for this call was still charged" while the
-- ledger row stays at billing_status='RESERVED' until reconciliation.job.ts's
-- 60s stale-reservation sweep times it out and REFUNDS it instead -- silently
-- contradicting the very promise the block response made, and losing the
-- moderation_rule_id/category/appeal_id linkage on the ledger row (the
-- standalone moderation_appeals row is unaffected -- it's written directly by
-- moderation.stage.ts, not through this UPDATE).
--
-- Found live, 2026-09-02, during the ШАГ 3 synthetic balance-probe run: the
-- first fix (payload_status only) surfaced the SECOND constraint immediately
-- on the very next probe run (Postgres error P2010/23514 on
-- execution_ledger_status_check this time). Neither constraint is exercised
-- by any existing test -- every test in this repo mocks Prisma/escrow.service
-- directly, never a real Postgres with real CHECK constraints.
--
-- execution_ledger is a real Postgres declarative-partitioned parent table --
-- altering a constraint here propagates to all 185+ existing daily partitions
-- AND every future one automatically; no per-partition ALTER loop needed.
ALTER TABLE "execution_ledger" DROP CONSTRAINT IF EXISTS "execution_ledger_payload_status_check";
ALTER TABLE "execution_ledger" ADD CONSTRAINT "execution_ledger_payload_status_check"
    CHECK ("payload_status" IN ('OK', 'FAILED', 'TIMEOUT', 'BLOCKED'));

ALTER TABLE "execution_ledger" DROP CONSTRAINT IF EXISTS "execution_ledger_status_check";
ALTER TABLE "execution_ledger" ADD CONSTRAINT "execution_ledger_status_check"
    CHECK ("status" IN (
        'pending', 'running', 'provider_success', 'success',
        'failed', 'timeout', 'shared_success', 'error', 'blocked'
    ));
