-- T-0339 (finding 026): execution_ledger is append-only in intent, but the app role is a superuser,
-- so GRANT/REVOKE cannot bind it. A trigger is the only enforcement that applies to a superuser.
--
-- DELETE is always rejected.
-- UPDATE is rejected unless every changed column is in the allowlist below. The allowlist is derived
-- from the only four UPDATE statements in the code base:
--   src/jobs/reconciliation.job.ts:36  SET status, billing_status, updated_at
--   src/jobs/reconciliation.job.ts:65  SET status, billing_status, updated_at
--   src/services/escrow.service.ts:152 SET status, billing_status, provider_called, provider_latency_ms,
--                                          payload_status, moderation_rule_id, moderation_category,
--                                          moderation_appeal_id, upstream_cost_usd, updated_at
--   src/services/escrow.service.ts:214 SET status, billing_status, provider_called, payload_status, updated_at
-- Allowed to change: status, billing_status, provider_called, provider_latency_ms, payload_status,
--   moderation_rule_id, moderation_category, moderation_appeal_id, upstream_cost_usd, updated_at.
-- Always frozen: execution_id, agent_id, tool_id, cost_usd, payer, created_at (named in the task) and
--   latency_ms, cache_status, idempotency_key, payload_url, x402_onchain_settled (never updated by the code).
-- A new legitimate UPDATE of another column needs a new migration that widens this function.
--
-- Escape hatch (superuser, leave a ledger note): see docs/runbook.md "execution_ledger immutability".
-- BEFORE row triggers on a partitioned table are cloned to every existing and future partition (PG 13+).

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
     OR NEW.x402_onchain_settled IS DISTINCT FROM OLD.x402_onchain_settled
  THEN
    RAISE EXCEPTION 'execution_ledger is append-only: UPDATE of an immutable column is not allowed (execution_id=%)', OLD.execution_id
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS execution_ledger_immutable ON "execution_ledger";
CREATE TRIGGER execution_ledger_immutable
  BEFORE UPDATE OR DELETE ON "execution_ledger"
  FOR EACH ROW EXECUTE FUNCTION execution_ledger_guard();
