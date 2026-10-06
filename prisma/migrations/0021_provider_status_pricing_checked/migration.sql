-- T-0160 (FT-7 of T-0155's Fleet task list; "Fleet task list" §5):
-- provider_status.pricing_checked_at / pricing_source.
--
-- T-0155's own measurement: 410 of 410 providers with zero pricing check
-- recorded in the last 30 days -- not because nobody looked, but because no
-- column anywhere (tools, provider_status, provider-limits.json) records WHEN
-- a provider's pricing/limits were last verified against its live source, or
-- WHICH source that was. scripts/pricing-recheck.py (monthly cron, 0 5 1 * *)
-- is the writer: a deterministic diff-check (hash of the fetched docs/pricing
-- page, compared against the PRIOR run's stored hash -- kept in the script's
-- own state file, not a DB column, this project's "do not invent a new till"
-- convention), never a model call (task's own rule: "code, not a model").
--
-- pricing_checked_at is set on EVERY run for EVERY provider (baseline fill --
-- "checked, nothing to diff yet" vs "never checked", the same distinction
-- reliability_calculated_at, migration 0018, already draws for
-- reliability_score) whether or not a real source URL was configured.
-- pricing_source records what was actually fetched (a URL) or why nothing was
-- -- never silently NULL after a real run.
ALTER TABLE "provider_status" ADD COLUMN IF NOT EXISTS "pricing_checked_at" TIMESTAMPTZ;
ALTER TABLE "provider_status" ADD COLUMN IF NOT EXISTS "pricing_source" TEXT;

-- price_history: required by 01-law-never-sell-below-cost ruling-1 point F
-- BEFORE any automatic price write is ever allowed to land ("an automaton may not
-- write its trail as prose" -- an automated re-price needs a structured row here
-- instead of a human commit message). Deliberately EMPTY as of this
-- migration: ruling-1 point D defers the actual writer (an automatic
-- re-price) until this table exists AND at least one case runs on a MEASURED
-- (not fallback) cost -- neither the writer nor a reader is built by this
-- task. Columns mirror ruling-1's own `price_note` field list: was (old),
-- now (new), date (changed_at), basis with calculation (basis), directive
-- (directive), task (fleet_task_id), when to revisit (revisit_at).
CREATE TABLE IF NOT EXISTS "price_history" (
  "id"              BIGSERIAL PRIMARY KEY,
  "tool_id"         TEXT NOT NULL,
  "price_old_usd"   NUMERIC(18,8),
  "price_new_usd"   NUMERIC(18,8) NOT NULL,
  "changed_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "basis"           TEXT NOT NULL,
  "directive"       TEXT NOT NULL,
  "fleet_task_id"   TEXT,
  "revisit_at"      TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now()
);
