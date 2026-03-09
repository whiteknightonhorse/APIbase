-- APIbase.pro — Initial Migration (§12.241)
-- 6 core tables. 3 with daily partitioning (execution_ledger, outbox, request_metrics).

-- ---------------------------------------------------------------------------
-- agents
-- ---------------------------------------------------------------------------
CREATE TABLE "agents" (
    "agent_id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
    "api_key_hash"        CHAR(64)     NOT NULL,
    "tier"                TEXT         NOT NULL DEFAULT 'free',
    "status"              TEXT         NOT NULL DEFAULT 'active',
    "rate_limit_override" JSONB,
    "deleted_at"          TIMESTAMPTZ,
    "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT "agents_pkey" PRIMARY KEY ("agent_id"),
    CONSTRAINT "agents_tier_check" CHECK ("tier" IN ('free', 'paid', 'enterprise')),
    CONSTRAINT "agents_status_check" CHECK ("status" IN ('active', 'suspended', 'deleted'))
);

CREATE UNIQUE INDEX "agents_api_key_hash_key" ON "agents" ("api_key_hash");

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
CREATE TABLE "accounts" (
    "agent_id"        UUID           NOT NULL,
    "balance_usd"     DECIMAL(18,8)  NOT NULL DEFAULT 0,
    "is_test_account" BOOLEAN        NOT NULL DEFAULT false,
    "created_at"      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    "updated_at"      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("agent_id"),
    CONSTRAINT "accounts_agent_id_fkey" FOREIGN KEY ("agent_id")
        REFERENCES "agents" ("agent_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ---------------------------------------------------------------------------
-- tools
-- ---------------------------------------------------------------------------
CREATE TABLE "tools" (
    "tool_id"   TEXT           NOT NULL,
    "name"      TEXT           NOT NULL,
    "provider"  TEXT           NOT NULL,
    "status"    TEXT           NOT NULL DEFAULT 'healthy',
    "price_usd" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "cache_ttl" INTEGER        NOT NULL DEFAULT 300,

    CONSTRAINT "tools_pkey" PRIMARY KEY ("tool_id"),
    CONSTRAINT "tools_status_check" CHECK ("status" IN ('healthy', 'degraded', 'unavailable'))
);

-- ---------------------------------------------------------------------------
-- execution_ledger (partitioned daily by created_at, 365d retention)
-- ---------------------------------------------------------------------------
CREATE TABLE "execution_ledger" (
    "execution_id"       UUID           NOT NULL DEFAULT gen_random_uuid(),
    "agent_id"           UUID           NOT NULL,
    "tool_id"            TEXT           NOT NULL,
    "status"             TEXT           NOT NULL,
    "billing_status"     TEXT           NOT NULL,
    "cost_usd"           DECIMAL(18,8)  NOT NULL DEFAULT 0,
    "latency_ms"         INTEGER,
    "provider_called"    BOOLEAN        NOT NULL DEFAULT false,
    "cache_status"       TEXT,
    "provider_latency_ms" INTEGER,
    "idempotency_key"    TEXT,
    "payload_url"        TEXT,
    "payload_status"     TEXT,
    "created_at"         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    "updated_at"         TIMESTAMPTZ,

    CONSTRAINT "execution_ledger_pkey" PRIMARY KEY ("execution_id", "created_at"),
    CONSTRAINT "execution_ledger_agent_id_fkey" FOREIGN KEY ("agent_id")
        REFERENCES "agents" ("agent_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "execution_ledger_tool_id_fkey" FOREIGN KEY ("tool_id")
        REFERENCES "tools" ("tool_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "execution_ledger_status_check" CHECK (
        "status" IN ('pending', 'running', 'provider_success', 'success', 'failed', 'timeout', 'shared_success', 'error')
    ),
    CONSTRAINT "execution_ledger_billing_status_check" CHECK (
        "billing_status" IN ('RESERVED', 'PAID', 'REFUNDED', 'FREE')
    ),
    CONSTRAINT "execution_ledger_cache_status_check" CHECK (
        "cache_status" IN ('HIT', 'MISS', 'SHARED')
    ),
    CONSTRAINT "execution_ledger_payload_status_check" CHECK (
        "payload_status" IN ('OK', 'FAILED', 'TIMEOUT')
    )
) PARTITION BY RANGE ("created_at");

CREATE INDEX "execution_ledger_agent_id_created_at_idx"
    ON "execution_ledger" ("agent_id", "created_at");
CREATE INDEX "execution_ledger_status_created_at_idx"
    ON "execution_ledger" ("status", "created_at");
CREATE INDEX "execution_ledger_idempotency_key_created_at_idx"
    ON "execution_ledger" ("idempotency_key", "created_at")
    WHERE "idempotency_key" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- outbox (partitioned daily by created_at, 7d retention)
-- ---------------------------------------------------------------------------
CREATE TABLE "outbox" (
    "id"         BIGSERIAL,
    "event_type" TEXT         NOT NULL,
    "payload"    JSONB        NOT NULL,
    "processed"  BOOLEAN      NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id", "created_at")
) PARTITION BY RANGE ("created_at");

CREATE INDEX "outbox_processed_created_at_idx"
    ON "outbox" ("processed", "created_at");

-- ---------------------------------------------------------------------------
-- request_metrics (partitioned daily by created_at, 90d retention)
-- ---------------------------------------------------------------------------
CREATE TABLE "request_metrics" (
    "id"          BIGSERIAL,
    "agent_id"    UUID        NOT NULL,
    "tool_id"     TEXT        NOT NULL,
    "status_code" SMALLINT    NOT NULL,
    "duration_ms" INTEGER     NOT NULL,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "request_metrics_pkey" PRIMARY KEY ("id", "created_at")
) PARTITION BY RANGE ("created_at");

CREATE INDEX "request_metrics_agent_id_created_at_idx"
    ON "request_metrics" ("agent_id", "created_at");

-- ---------------------------------------------------------------------------
-- Append-only enforcement for execution_ledger (§6.989)
-- The reconciliation worker uses a separate privileged role.
-- ---------------------------------------------------------------------------
-- REVOKE UPDATE, DELETE ON "execution_ledger" FROM apibase_app;
-- GRANT INSERT, SELECT ON "execution_ledger" TO apibase_app;
-- NOTE: Uncomment after creating the apibase_app role in production bootstrap.

-- ---------------------------------------------------------------------------
-- Create initial partitions for today and tomorrow
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    today DATE := CURRENT_DATE;
    tomorrow DATE := CURRENT_DATE + 1;
    day_after DATE := CURRENT_DATE + 2;
BEGIN
    -- execution_ledger
    EXECUTE format(
        'CREATE TABLE execution_ledger_%s PARTITION OF execution_ledger FOR VALUES FROM (%L) TO (%L)',
        to_char(today, 'YYYY_MM_DD'), today, tomorrow
    );
    EXECUTE format(
        'CREATE TABLE execution_ledger_%s PARTITION OF execution_ledger FOR VALUES FROM (%L) TO (%L)',
        to_char(tomorrow, 'YYYY_MM_DD'), tomorrow, day_after
    );

    -- outbox
    EXECUTE format(
        'CREATE TABLE outbox_%s PARTITION OF outbox FOR VALUES FROM (%L) TO (%L)',
        to_char(today, 'YYYY_MM_DD'), today, tomorrow
    );
    EXECUTE format(
        'CREATE TABLE outbox_%s PARTITION OF outbox FOR VALUES FROM (%L) TO (%L)',
        to_char(tomorrow, 'YYYY_MM_DD'), tomorrow, day_after
    );

    -- request_metrics
    EXECUTE format(
        'CREATE TABLE request_metrics_%s PARTITION OF request_metrics FOR VALUES FROM (%L) TO (%L)',
        to_char(today, 'YYYY_MM_DD'), today, tomorrow
    );
    EXECUTE format(
        'CREATE TABLE request_metrics_%s PARTITION OF request_metrics FOR VALUES FROM (%L) TO (%L)',
        to_char(tomorrow, 'YYYY_MM_DD'), tomorrow, day_after
    );
END $$;
