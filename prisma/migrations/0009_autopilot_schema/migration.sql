-- AP-1 (2026-09-03): durable model for the autopilot control plane. See
-- ~/AUTOPILOT-DESIGN-2026-09-03.md section E for the design. This migration is
-- schema-only -- no job/engine code reads or writes these tables yet (AP-2..AP-9).
--
-- Enum-shaped columns are enforced with a CHECK constraint (same convention as
-- tools_status_check in 0001_init), not a Postgres ENUM type -- adding a new value
-- later is one ALTER TABLE ... DROP/ADD CONSTRAINT, not a type migration.

-- ---------------------------------------------------------------------------
-- provider_status -- one row per provider, durable health truth (Redis stays a
-- cache in front of it, see G). pct_remaining/risk default to NOINFO-shaped
-- values, never a silent "healthy" (C0.3).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "provider_status" (
    "provider"             TEXT           NOT NULL,
    "state"                TEXT           NOT NULL,
    "state_since"          TIMESTAMPTZ    NOT NULL,
    "state_reason"         TEXT,
    "last_probe_at"        TIMESTAMPTZ,
    "last_probe_result"    TEXT,
    "last_ok_at"           TIMESTAMPTZ,
    "consecutive_failures" INTEGER        NOT NULL DEFAULT 0,
    "last_latency_ms"      INTEGER,
    "pct_remaining"        INTEGER,
    "burn_per_hour"        DECIMAL(12,2),
    "exhaustion_eta"       TIMESTAMPTZ,
    "risk"                 TEXT           NOT NULL DEFAULT 'NOINFO',
    "reliability_score"    INTEGER,
    "next_probe_at"        TIMESTAMPTZ    NOT NULL,
    "probe_interval_s"     INTEGER        NOT NULL,
    "updated_at"           TIMESTAMPTZ    NOT NULL DEFAULT now(),

    CONSTRAINT "provider_status_pkey" PRIMARY KEY ("provider"),
    CONSTRAINT "provider_status_state_check"
        CHECK ("state" IN ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'DOWN')),
    CONSTRAINT "provider_status_last_probe_result_check"
        CHECK ("last_probe_result" IS NULL OR "last_probe_result" IN (
            'OK', 'FAIL_TRANSIENT', 'FAIL_DETERMINISTIC', 'SKIPPED_BUDGET', 'NOINFO'
        )),
    CONSTRAINT "provider_status_risk_check"
        CHECK ("risk" IN ('NOINFO', 'NORMAL', 'ATTENTION', 'WARNING', 'CRITICAL', 'EXHAUSTED')),
    CONSTRAINT "provider_status_reliability_score_check"
        CHECK ("reliability_score" IS NULL OR "reliability_score" BETWEEN 0 AND 100)
);

-- ---------------------------------------------------------------------------
-- probe_log -- append-only, what and when we measured (and what we SUPPRESSED).
-- Not partitioned: low volume (~3-5k rows/day, E2). Retention wired into
-- partition-cleanup.job separately, out of AP-1's scope.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "probe_log" (
    "id"          BIGSERIAL      NOT NULL,
    "provider"    TEXT           NOT NULL,
    "ts"          TIMESTAMPTZ    NOT NULL DEFAULT now(),
    "kind"        TEXT           NOT NULL,
    "result"      TEXT           NOT NULL,
    "http_status" INTEGER,
    "latency_ms"  INTEGER,
    "detail"      TEXT,

    CONSTRAINT "probe_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "probe_log_kind_check"
        CHECK ("kind" IN ('head', 'get', 'auth', 'usage_api', 'passive', 'suppressed')),
    CONSTRAINT "probe_log_result_check"
        CHECK ("result" IN ('OK', 'FAIL_TRANSIENT', 'FAIL_DETERMINISTIC', 'SKIPPED_BUDGET', 'NOINFO'))
);

CREATE INDEX IF NOT EXISTS "probe_log_provider_ts_idx" ON "probe_log" ("provider", "ts");

-- ---------------------------------------------------------------------------
-- incidents -- the heart of the system (E3).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "incidents" (
    "incident_id"     UUID           NOT NULL DEFAULT gen_random_uuid(),
    "dedup_key"       TEXT           NOT NULL,
    "provider"        TEXT           NOT NULL,
    "tool_id"         TEXT,
    "kind"            TEXT           NOT NULL,
    "severity"        TEXT           NOT NULL,
    "state"           TEXT           NOT NULL,
    "detected_by"     TEXT           NOT NULL,
    "evidence"        JSONB          NOT NULL,
    "attempts"        JSONB          NOT NULL DEFAULT '[]',
    "fleet_task_id"   TEXT,
    "operator_file"   TEXT,
    "next_recheck_at" TIMESTAMPTZ,
    "created_at"      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    "updated_at"      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    "resolved_at"     TIMESTAMPTZ,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("incident_id"),
    CONSTRAINT "incidents_kind_check" CHECK ("kind" IN (
        'AUTH_FAILED', 'CREDENTIAL_EXPIRED', 'PROVIDER_DOWN', 'DEGRADED_QUALITY',
        'RATE_LIMITED', 'QUOTA_LOW', 'QUOTA_EXHAUSTED', 'PAYMENT_REQUIRED',
        'API_CHANGED', 'ENDPOINT_CHANGED', 'EMAIL_NOTICE', 'UNKNOWN'
    )),
    CONSTRAINT "incidents_severity_check" CHECK ("severity" IN ('SEV1', 'SEV2', 'SEV3')),
    CONSTRAINT "incidents_state_check" CHECK ("state" IN (
        'OPEN', 'REMEDIATION_QUEUED', 'WAITING_HUMAN', 'VERIFYING', 'RESOLVED', 'STUCK'
    )),
    CONSTRAINT "incidents_detected_by_check" CHECK ("detected_by" IN (
        'probe', 'passive', 'limits', 'email', 'tester', 'manual'
    ))
);

CREATE INDEX IF NOT EXISTS "incidents_state_severity_idx" ON "incidents" ("state", "severity");

-- The lock against two fixers working the same fault at once (§11, I3): a partial
-- unique index, not an app-level check -- opening a second incident with the same
-- dedup_key while an earlier one is still open is impossible at the DB level.
-- Prisma's schema language cannot express a filtered unique index, hence raw SQL.
CREATE UNIQUE INDEX IF NOT EXISTS "incidents_open_dedup"
    ON "incidents" ("dedup_key")
    WHERE "state" NOT IN ('RESOLVED');

-- ---------------------------------------------------------------------------
-- email_events -- idempotent record of every parsed inbound email (E4, H3/H4).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "email_events" (
    "msg_id"          TEXT           NOT NULL,
    "received_at"     TIMESTAMPTZ    NOT NULL,
    "from_domain"     TEXT           NOT NULL,
    "provider_match"  TEXT,
    "class"           TEXT           NOT NULL,
    "action_required" BOOLEAN        NOT NULL,
    "incident_id"     UUID,
    "processed_at"    TIMESTAMPTZ    NOT NULL DEFAULT now(),
    "summary"         TEXT,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("msg_id"),
    CONSTRAINT "email_events_class_check" CHECK ("class" IN (
        'KEY_EXPIRES', 'KEY_REVOKED', 'DEPRECATION', 'SUNSET', 'ENDPOINT_CHANGE',
        'PRICING_CHANGE', 'PAYMENT_FAILED', 'QUOTA', 'MAINTENANCE', 'SECURITY_CHANGE',
        'ACCOUNT_ACTION', 'MARKETING', 'UNMATCHED', 'DEFERRED_BUDGET'
    ))
);

-- ---------------------------------------------------------------------------
-- tools -- E5: autodemotion/promotion becomes auditable and reversible.
-- ---------------------------------------------------------------------------
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "status_source" TEXT;
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "status_changed_at" TIMESTAMPTZ;
ALTER TABLE "tools" ADD COLUMN IF NOT EXISTS "status_reason" TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tools_status_source_check'
    ) THEN
        ALTER TABLE "tools" ADD CONSTRAINT "tools_status_source_check"
            CHECK ("status_source" IS NULL OR "status_source" IN ('manual', 'autopilot', 'seed'));
    END IF;
END $$;
