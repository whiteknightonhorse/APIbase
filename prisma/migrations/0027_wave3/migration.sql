-- T-INT-40 (A3-0): the ONE wave-3 migration. Streaming sessions (UC-7 / F-9), subscriptions,
-- idempotency identifiers and the shared columns the next wave-3 cards need; no other migration
-- is planned for the wave. Money = DECIMAL(18,6), time = TIMESTAMPTZ. Raw SQL: Prisma cannot say
-- partial indexes / CHECKs (shop_* tables are not modelled in schema.prisma).

-- ---------------------------------------------------------------------------
-- shop_merchants: provek (wave-3 key material), stream_settler (who may settle a payee channel)
-- ---------------------------------------------------------------------------
ALTER TABLE "shop_merchants" ADD COLUMN "provek" JSONB;
ALTER TABLE "shop_merchants" ADD COLUMN "stream_settler" TEXT;
ALTER TABLE "shop_merchants" ADD CONSTRAINT "shop_merchants_stream_settler_check"
    CHECK ("stream_settler" IS NULL OR "stream_settler" IN ('apibase_pilot', 'merchant'));

-- ---------------------------------------------------------------------------
-- shop_acceptances.method += contract_wallet_signature (the table is append-only: a CHECK swap
-- is DDL, not an UPDATE, so the trigger does not fire)
-- ---------------------------------------------------------------------------
ALTER TABLE "shop_acceptances" DROP CONSTRAINT "shop_acceptances_method_check";
ALTER TABLE "shop_acceptances" ADD CONSTRAINT "shop_acceptances_method_check"
    CHECK ("method" IN ('wallet_signature', 'checkbox+wallet_signature', 'contract_wallet_signature'));

-- ---------------------------------------------------------------------------
-- shop_products: stream / subscription terms, and the two new fulfillment modes
-- ---------------------------------------------------------------------------
ALTER TABLE "shop_products" ADD COLUMN "stream" JSONB;
ALTER TABLE "shop_products" ADD COLUMN "subscription" JSONB;
ALTER TABLE "shop_products" DROP CONSTRAINT "shop_products_fulfillment_mode_check";
ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_fulfillment_mode_check"
    CHECK ("fulfillment_mode" IN ('instant', 'merchant', 'physical', 'stream', 'subscription'));

-- ---------------------------------------------------------------------------
-- shop_fee_ledger: stream / subscription fees have no order. `source_ref` names the row they
-- belong to (a stream session id).
-- ---------------------------------------------------------------------------
ALTER TABLE "shop_fee_ledger" ALTER COLUMN "order_id" DROP NOT NULL;
ALTER TABLE "shop_fee_ledger" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'order';
ALTER TABLE "shop_fee_ledger" ADD COLUMN "source_ref" TEXT;
ALTER TABLE "shop_fee_ledger" ADD CONSTRAINT "shop_fee_ledger_source_check"
    CHECK ("source" IN ('order', 'stream', 'subscription'));
ALTER TABLE "shop_fee_ledger" ADD CONSTRAINT "shop_fee_ledger_order_source_check"
    CHECK ("source" <> 'order' OR "order_id" IS NOT NULL);
CREATE INDEX "shop_fee_ledger_source_ref_idx" ON "shop_fee_ledger" ("source_ref") WHERE "source_ref" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- shop_stream_sessions: one row per payment channel (one channel = one session)
-- ---------------------------------------------------------------------------
CREATE TABLE "shop_stream_sessions" (
    "session_id"        UUID           NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id"       UUID           NOT NULL,
    "sku"               TEXT           NOT NULL,
    "buyer_agent_id"    TEXT,
    "channel_id"        TEXT           NOT NULL,
    "deposit_usd"       DECIMAL(18,6)  NOT NULL,
    "rate_per_s"        DECIMAL(18,6)  NOT NULL,
    "consumed_usd"      DECIMAL(18,6)  NOT NULL DEFAULT 0,
    "consumed_s"        INTEGER        NOT NULL DEFAULT 0,
    "settled_usd"       DECIMAL(18,6)  NOT NULL DEFAULT 0,
    "settler_mode"      TEXT           NOT NULL,
    "escrow_contract"   TEXT,
    "chain_id"          INTEGER,
    "highest_voucher"   JSONB,
    "close_requested_at" TIMESTAMPTZ,
    "last_settle_at"    TIMESTAMPTZ,
    "settle_error_since" TIMESTAMPTZ,
    "min_fee_applied"   BOOLEAN        NOT NULL DEFAULT false,
    "opened_at"         TIMESTAMPTZ    NOT NULL DEFAULT now(),
    "closed_at"         TIMESTAMPTZ,
    "status"            TEXT           NOT NULL DEFAULT 'open',

    CONSTRAINT "shop_stream_sessions_pkey" PRIMARY KEY ("session_id"),
    CONSTRAINT "shop_stream_sessions_merchant_fkey" FOREIGN KEY ("merchant_id")
        REFERENCES "shop_merchants" ("merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shop_stream_sessions_settler_check" CHECK ("settler_mode" IN ('apibase_pilot', 'merchant')),
    CONSTRAINT "shop_stream_sessions_status_check" CHECK ("status" IN ('open', 'closed'))
);
CREATE UNIQUE INDEX "shop_stream_sessions_channel_id_key" ON "shop_stream_sessions" ("channel_id");
CREATE INDEX "shop_stream_sessions_merchant_id_idx" ON "shop_stream_sessions" ("merchant_id");
CREATE INDEX "shop_stream_sessions_open_idx" ON "shop_stream_sessions" ("settler_mode", "last_settle_at") WHERE "status" = 'open';

-- ---------------------------------------------------------------------------
-- shop_stream_settlements: every settle / close transaction of a channel
-- ---------------------------------------------------------------------------
CREATE TABLE "shop_stream_settlements" (
    "settlement_id"     UUID           NOT NULL DEFAULT gen_random_uuid(),
    "session_id"        UUID           NOT NULL,
    "merchant_id"       UUID           NOT NULL,
    "channel_id"        TEXT           NOT NULL,
    "cumulative_amount" DECIMAL(18,6)  NOT NULL,
    "tx_hash"           TEXT,
    "submitted_by"      TEXT           NOT NULL,
    "verified"          BOOLEAN        NOT NULL DEFAULT false,
    "at"                TIMESTAMPTZ    NOT NULL DEFAULT now(),

    CONSTRAINT "shop_stream_settlements_pkey" PRIMARY KEY ("settlement_id"),
    CONSTRAINT "shop_stream_settlements_session_fkey" FOREIGN KEY ("session_id")
        REFERENCES "shop_stream_sessions" ("session_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shop_stream_settlements_submitted_by_check" CHECK ("submitted_by" IN ('apibase', 'merchant'))
);
CREATE INDEX "shop_stream_settlements_session_id_idx" ON "shop_stream_settlements" ("session_id");
CREATE INDEX "shop_stream_settlements_merchant_id_idx" ON "shop_stream_settlements" ("merchant_id");

-- ---------------------------------------------------------------------------
-- shop_subscriptions / periods / authorizations
-- ---------------------------------------------------------------------------
CREATE TABLE "shop_subscriptions" (
    "subscription_id" UUID         NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id"     UUID         NOT NULL,
    "sku"             TEXT         NOT NULL,
    "buyer_agent_id"  TEXT,
    "plan"            JSONB        NOT NULL,
    "access_key_ref"  TEXT,
    "rail_pref"       TEXT,
    "pull_mode"       TEXT         NOT NULL DEFAULT 'none',
    "next_charge_at"  TIMESTAMPTZ,
    "expires_at"      TIMESTAMPTZ,
    "max_periods"     INTEGER,
    "status"          TEXT         NOT NULL DEFAULT 'active',
    "status_reason"   TEXT,
    "canceled_at"     TIMESTAMPTZ,
    "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "shop_subscriptions_pkey" PRIMARY KEY ("subscription_id"),
    CONSTRAINT "shop_subscriptions_merchant_fkey" FOREIGN KEY ("merchant_id")
        REFERENCES "shop_merchants" ("merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shop_subscriptions_pull_mode_check" CHECK ("pull_mode" IN ('none', 'base_preauth', 'tempo_keychain')),
    CONSTRAINT "shop_subscriptions_status_check" CHECK ("status" IN ('active', 'past_due', 'canceled', 'expired'))
);
CREATE INDEX "shop_subscriptions_merchant_id_idx" ON "shop_subscriptions" ("merchant_id");
CREATE INDEX "shop_subscriptions_due_idx" ON "shop_subscriptions" ("next_charge_at") WHERE "status" = 'active';

CREATE TABLE "shop_subscription_periods" (
    "subscription_id" UUID         NOT NULL,
    "period_no"       INTEGER      NOT NULL,
    "period_start"    TIMESTAMPTZ  NOT NULL,
    "period_end"      TIMESTAMPTZ  NOT NULL,
    "order_id"        UUID,
    "status"          TEXT         NOT NULL DEFAULT 'due',

    CONSTRAINT "shop_subscription_periods_pkey" PRIMARY KEY ("subscription_id", "period_no"),
    CONSTRAINT "shop_subscription_periods_subscription_fkey" FOREIGN KEY ("subscription_id")
        REFERENCES "shop_subscriptions" ("subscription_id") ON DELETE CASCADE,
    CONSTRAINT "shop_subscription_periods_order_fkey" FOREIGN KEY ("order_id")
        REFERENCES "shop_orders" ("order_id") ON DELETE SET NULL,
    CONSTRAINT "shop_subscription_periods_status_check" CHECK ("status" IN ('due', 'paid', 'past_due', 'skipped'))
);

CREATE TABLE "shop_subscription_authorizations" (
    "authorization_id" UUID         NOT NULL DEFAULT gen_random_uuid(),
    "subscription_id"  UUID         NOT NULL,
    "period_no"        INTEGER      NOT NULL,
    "leg"              TEXT         NOT NULL,
    "from_address"     TEXT         NOT NULL,
    "to_address"       TEXT         NOT NULL,
    "value_micro"      BIGINT       NOT NULL,
    "valid_after"      TIMESTAMPTZ  NOT NULL,
    "valid_before"     TIMESTAMPTZ  NOT NULL,
    "nonce"            TEXT         NOT NULL,
    "signature_enc"    BYTEA        NOT NULL,
    "status"           TEXT         NOT NULL DEFAULT 'pending',

    CONSTRAINT "shop_subscription_authorizations_pkey" PRIMARY KEY ("authorization_id"),
    CONSTRAINT "shop_subscription_authorizations_subscription_fkey" FOREIGN KEY ("subscription_id")
        REFERENCES "shop_subscriptions" ("subscription_id") ON DELETE CASCADE,
    CONSTRAINT "shop_subscription_authorizations_leg_check" CHECK ("leg" IN ('merchant', 'fee')),
    CONSTRAINT "shop_subscription_authorizations_status_check"
        CHECK ("status" IN ('pending', 'submitted', 'settled', 'failed', 'canceled'))
);
CREATE UNIQUE INDEX "shop_subscription_authorizations_nonce_key" ON "shop_subscription_authorizations" ("nonce");
CREATE INDEX "shop_subscription_authorizations_period_idx" ON "shop_subscription_authorizations" ("subscription_id", "period_no");

-- ---------------------------------------------------------------------------
-- shop_payment_identifiers: idempotency of a payment presentation (one identifier, one answer)
-- ---------------------------------------------------------------------------
CREATE TABLE "shop_payment_identifiers" (
    "identifier"          TEXT         NOT NULL,
    "payer"               TEXT         NOT NULL,
    "request_fingerprint" TEXT         NOT NULL,
    "response"            JSONB,
    "status"              TEXT         NOT NULL DEFAULT 'in_flight',
    "expires_at"          TIMESTAMPTZ  NOT NULL,
    "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "shop_payment_identifiers_pkey" PRIMARY KEY ("identifier"),
    CONSTRAINT "shop_payment_identifiers_status_check" CHECK ("status" IN ('in_flight', 'done'))
);
CREATE INDEX "shop_payment_identifiers_expires_at_idx" ON "shop_payment_identifiers" ("expires_at");

-- ---------------------------------------------------------------------------
-- incidents_kind_check: the 24 kinds of 0025 + two wave-3 kinds (AUTO_NO_MODEL: a mail and an event)
-- ---------------------------------------------------------------------------
ALTER TABLE "incidents" DROP CONSTRAINT "incidents_kind_check";
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_kind_check" CHECK ("kind" IN (
    'AUTH_FAILED', 'CREDENTIAL_EXPIRED', 'PROVIDER_DOWN', 'DEGRADED_QUALITY',
    'RATE_LIMITED', 'QUOTA_LOW', 'QUOTA_EXHAUSTED', 'PAYMENT_REQUIRED',
    'API_CHANGED', 'ENDPOINT_CHANGED', 'EMAIL_NOTICE', 'UNKNOWN',
    'CONNECT_FAILED', 'WEBHOOK_FAILED', 'MERCHANT_UNRESPONSIVE', 'REFUND_OVERDUE',
    'DISPUTE_UNANSWERED', 'CATALOG_REJECTED', 'MODERATION_FLAG', 'PAYOUT_WALLET_SANCTIONED',
    'PAYER_SANCTIONED', 'PAYMENT_MISMATCH', 'FEE_INVOICE_OVERDUE', 'STOREFRONT_DOWN',
    'STREAM_SETTLE_OVERDUE', 'SUBSCRIPTION_PULL_FAILED'
));
