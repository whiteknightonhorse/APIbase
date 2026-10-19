-- T-0428: settlement_pending / facilitator timeout are UNKNOWN outcomes resolved by chain reconcile.
-- The ledger records settle state 'pending' and the broadcast tx hash; the x402-settle-pending job
-- later flips the state to 'settled'. Altering the partitioned parent propagates to all partitions.
ALTER TABLE "execution_ledger" ADD COLUMN IF NOT EXISTS "x402_settle_state" VARCHAR(16);
ALTER TABLE "execution_ledger" ADD COLUMN IF NOT EXISTS "settle_tx_hash" VARCHAR(80);

-- Widen the 0038 guard for exactly these two columns, plus x402_onchain_settled while the row is
-- still 'pending' (NULL -> true on resolution). Everything else stays frozen.
CREATE OR REPLACE FUNCTION execution_ledger_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'execution_ledger is append-only: DELETE is not allowed (execution_id=%)', OLD.execution_id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.execution_id IS DISTINCT FROM OLD.execution_id
     OR NEW.agent_id IS DISTINCT FROM OLD.agent_id
     OR NEW.tool_id IS DISTINCT FROM OLD.tool_id
     OR NEW.payer IS DISTINCT FROM OLD.payer
     OR NEW.cost_usd IS DISTINCT FROM OLD.cost_usd
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.latency_ms IS DISTINCT FROM OLD.latency_ms
     OR NEW.cache_status IS DISTINCT FROM OLD.cache_status
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.payload_url IS DISTINCT FROM OLD.payload_url
     OR (NEW.x402_onchain_settled IS DISTINCT FROM OLD.x402_onchain_settled
         AND OLD.x402_settle_state IS DISTINCT FROM 'pending')
  THEN
    RAISE EXCEPTION 'execution_ledger is append-only: UPDATE of an immutable column is not allowed (execution_id=%)', OLD.execution_id
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;
