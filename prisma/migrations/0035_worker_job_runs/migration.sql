-- T-0321: the audit could not show that any in-process worker job (SLA sweeper, PII purge, fee
-- invoices, ...) had ever run, because a run left no trace except an error log line; one row per
-- job in Postgres is the evidence that survives a container restart and crosses the host boundary.
CREATE TABLE IF NOT EXISTS "worker_job_runs" (
    "job"              TEXT        NOT NULL,
    "expect_every_s"   INTEGER     NOT NULL,
    "last_started_at"  TIMESTAMPTZ,
    "last_finished_at" TIMESTAMPTZ,
    "last_ok"          BOOLEAN,
    "last_result"      JSONB,
    "last_error"       TEXT,
    "runs_total"       BIGINT      NOT NULL DEFAULT 0,

    CONSTRAINT "worker_job_runs_pkey" PRIMARY KEY ("job")
);
