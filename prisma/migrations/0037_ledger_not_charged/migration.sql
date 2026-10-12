-- T-0338: an x402 call whose upstream rejected the input (provider_input_rejected) is released, not
-- settled, and recorded as billing_status 'NOT_CHARGED' / status 'provider_input_rejected'.
-- Both execution_ledger CHECK constraints must allow the new values (same trap as 0007: a value the
-- constraint rejects makes the ledger write fail silently behind a try/catch). Altering the
-- partitioned parent propagates to every existing and future daily partition.
ALTER TABLE "execution_ledger" DROP CONSTRAINT IF EXISTS "execution_ledger_billing_status_check";
ALTER TABLE "execution_ledger" ADD CONSTRAINT "execution_ledger_billing_status_check"
    CHECK ("billing_status" IN ('RESERVED', 'PAID', 'REFUNDED', 'FREE', 'NOT_CHARGED'));

ALTER TABLE "execution_ledger" DROP CONSTRAINT IF EXISTS "execution_ledger_status_check";
ALTER TABLE "execution_ledger" ADD CONSTRAINT "execution_ledger_status_check"
    CHECK ("status" IN (
        'pending', 'running', 'provider_success', 'success',
        'failed', 'timeout', 'shared_success', 'error', 'blocked', 'provider_input_rejected'
    ));
