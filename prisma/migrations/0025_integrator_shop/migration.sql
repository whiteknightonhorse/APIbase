-- 0025 -- Integrator wave 1 (spec 03-SPECIFICATION section 5.1, 5.3, 5.4).
-- 18 shop_* tables + the incidents_kind_check replacement. No other existing
-- table is touched. Money = DECIMAL(18,6), time = TIMESTAMPTZ. Partial unique
-- indexes / triggers / partitioning / tsvector are raw SQL (Prisma cannot say them).

-- ---------------------------------------------------------------------------
-- shop_merchants
-- ---------------------------------------------------------------------------
CREATE TABLE "shop_merchants" (
    "merchant_id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
    "slug"                    TEXT         NOT NULL,
    "name"                    TEXT         NOT NULL,
    "category"                TEXT         NOT NULL,
    "country"                 CHAR(2)      NOT NULL,
    "registration_ip_country" CHAR(2),
    "wallet_address"          TEXT         NOT NULL,
    "payout_wallet_base"      TEXT         NOT NULL,
    "payout_wallet_tempo"     TEXT         NOT NULL,
    "payout_pending"          JSONB,
    "recovery_wallet"         TEXT,
    "encryption_key"          JSONB,
    "contact_email"           TEXT         NOT NULL,
    "site_url"                TEXT         NOT NULL,
    "domain_verified"         BOOLEAN      NOT NULL DEFAULT false,
    "status"                  TEXT         NOT NULL DEFAULT 'pending',
    "status_reason"           TEXT,
    "limits"                  JSONB        NOT NULL DEFAULT '{}',
    "policy"                  JSONB        NOT NULL DEFAULT '{}',
    "reputation"              JSONB        NOT NULL DEFAULT '{}',
    "agent_id"                UUID,
    "created_at"              TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "shop_merchants_pkey" PRIMARY KEY ("merchant_id"),
    CONSTRAINT "shop_merchants_slug_check" CHECK ("slug" ~ '^[a-z0-9-]{3,40}$'),
    CONSTRAINT "shop_merchants_wallet_lower_check" CHECK ("wallet_address" = lower("wallet_address")),
    CONSTRAINT "shop_merchants_status_check" CHECK ("status" IN ('pending', 'active', 'suspended', 'deactivated'))
);
CREATE UNIQUE INDEX "shop_merchants_slug_key" ON "shop_merchants" ("slug");
CREATE UNIQUE INDEX "shop_merchants_wallet_address_key" ON "shop_merchants" ("wallet_address");
CREATE INDEX "shop_merchants_merchant_id_idx" ON "shop_merchants" ("merchant_id");

-- ---------------------------------------------------------------------------
-- shop_merchant_keys
-- ---------------------------------------------------------------------------
CREATE TABLE "shop_merchant_keys" (
    "key_hash"    CHAR(64)     NOT NULL,
    "merchant_id" UUID         NOT NULL,
    "scopes"      TEXT[]       NOT NULL DEFAULT '{}',
    "label"       TEXT,
    "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "revoked_at"  TIMESTAMPTZ,

    CONSTRAINT "shop_merchant_keys_pkey" PRIMARY KEY ("key_hash"),
    CONSTRAINT "shop_merchant_keys_merchant_fkey" FOREIGN KEY ("merchant_id")
        REFERENCES "shop_merchants" ("merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "shop_merchant_keys_merchant_id_idx" ON "shop_merchant_keys" ("merchant_id");

-- ---------------------------------------------------------------------------
-- shop_legal_docs -- version registry (source of /legal/index.json)
-- ---------------------------------------------------------------------------
CREATE TABLE "shop_legal_docs" (
    "doc_id"         TEXT         NOT NULL,
    "version"        TEXT         NOT NULL,
    "sha256"         CHAR(64)     NOT NULL,
    "url"            TEXT         NOT NULL,
    "effective_from" TIMESTAMPTZ  NOT NULL,
    "body_md"        TEXT         NOT NULL,

    CONSTRAINT "shop_legal_docs_pkey" PRIMARY KEY ("doc_id", "version"),
    CONSTRAINT "shop_legal_docs_doc_id_check" CHECK ("doc_id" IN
        ('merchant-agreement', 'aup', 'dpa', 'refund-framework', 'terms', 'privacy'))
);

-- ---------------------------------------------------------------------------
-- shop_acceptances -- append-only (trigger below)
-- ---------------------------------------------------------------------------
CREATE TABLE "shop_acceptances" (
    "acceptance_id" UUID         NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id"   UUID         NOT NULL,
    "doc_id"        TEXT         NOT NULL,
    "version"       TEXT         NOT NULL,
    "sha256"        CHAR(64)     NOT NULL,
    "method"        TEXT         NOT NULL,
    "signer"        TEXT         NOT NULL,
    "signature"     TEXT         NOT NULL,
    "message"       TEXT         NOT NULL,
    "ip_hash"       TEXT,
    "user_agent"    TEXT,
    "accepted_at"   TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "shop_acceptances_pkey" PRIMARY KEY ("acceptance_id"),
    CONSTRAINT "shop_acceptances_merchant_fkey" FOREIGN KEY ("merchant_id")
        REFERENCES "shop_merchants" ("merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shop_acceptances_method_check" CHECK ("method" IN ('wallet_signature', 'checkbox+wallet_signature'))
);
CREATE INDEX "shop_acceptances_merchant_id_idx" ON "shop_acceptances" ("merchant_id");

CREATE OR REPLACE FUNCTION shop_acceptances_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'shop_acceptances is append-only: % is not allowed', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "shop_acceptances_no_update_delete"
    BEFORE UPDATE OR DELETE ON "shop_acceptances"
    FOR EACH ROW EXECUTE FUNCTION shop_acceptances_append_only();

-- ---------------------------------------------------------------------------
-- shop_products / shop_product_variants (spec section 4 F-2)
-- "available" = tracked stock (NULL = not tracked); "reserved" = held by open quotes (UC-16).
-- ---------------------------------------------------------------------------
CREATE TABLE "shop_products" (
    "product_id"                   UUID           NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id"                  UUID           NOT NULL,
    "sku"                          TEXT           NOT NULL,
    "title"                        TEXT           NOT NULL,
    "description"                  TEXT           NOT NULL DEFAULT '',
    "price_usd"                    DECIMAL(18,6)  NOT NULL,
    "is_test"                      BOOLEAN        NOT NULL DEFAULT false,
    "currency_display"             TEXT,
    "available"                    INTEGER,
    "reserved"                     INTEGER        NOT NULL DEFAULT 0,
    "fulfillment_mode"             TEXT           NOT NULL DEFAULT 'merchant',
    "fulfillment_payload_encrypted" TEXT,
    "tax_included"                 BOOLEAN        NOT NULL DEFAULT false,
    "tax_note"                     TEXT,
    "shipping_options"             JSONB          NOT NULL DEFAULT '[]',
    "delivery_slots"               JSONB          NOT NULL DEFAULT '[]',
    "requires_pii"                 TEXT[]         NOT NULL DEFAULT '{}',
    "refund_window_days"           INTEGER,
    "returns_accepted"             BOOLEAN        NOT NULL DEFAULT false,
    "category"                     TEXT,
    "shop_category"                TEXT,
    "images"                       TEXT[]         NOT NULL DEFAULT '{}',
    "moderation_status"            TEXT           NOT NULL DEFAULT 'ok',
    "search"                       TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("description", ''))
    ) STORED,
    "created_at"                   TIMESTAMPTZ    NOT NULL DEFAULT now(),
    "updated_at"                   TIMESTAMPTZ    NOT NULL DEFAULT now(),

    CONSTRAINT "shop_products_pkey" PRIMARY KEY ("product_id"),
    CONSTRAINT "shop_products_merchant_fkey" FOREIGN KEY ("merchant_id")
        REFERENCES "shop_merchants" ("merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shop_products_description_len_check" CHECK (char_length("description") <= 2000),
    CONSTRAINT "shop_products_fulfillment_mode_check" CHECK ("fulfillment_mode" IN ('instant', 'merchant', 'physical')),
    CONSTRAINT "shop_products_moderation_status_check" CHECK ("moderation_status" IN ('ok', 'flagged', 'rejected')),
    CONSTRAINT "shop_products_stock_check" CHECK ("reserved" >= 0 AND ("available" IS NULL OR "available" >= 0))
);
CREATE INDEX "shop_products_merchant_id_idx" ON "shop_products" ("merchant_id");
CREATE UNIQUE INDEX "shop_products_merchant_id_sku_key" ON "shop_products" ("merchant_id", "sku");
CREATE UNIQUE INDEX "shop_products_one_test_per_merchant" ON "shop_products" ("merchant_id") WHERE "is_test";
CREATE INDEX "shop_products_search_idx" ON "shop_products" USING GIN ("search");

CREATE TABLE "shop_product_variants" (
    "variant_id"  UUID           NOT NULL DEFAULT gen_random_uuid(),
    "product_id"  UUID           NOT NULL,
    "merchant_id" UUID           NOT NULL,
    "sku"         TEXT           NOT NULL,
    "title"       TEXT           NOT NULL,
    "price_usd"   DECIMAL(18,6),
    "available"   INTEGER,
    "reserved"    INTEGER        NOT NULL DEFAULT 0,
    "attributes"  JSONB          NOT NULL DEFAULT '{}',
    "is_test"     BOOLEAN        NOT NULL DEFAULT false,
    "created_at"  TIMESTAMPTZ    NOT NULL DEFAULT now(),

    CONSTRAINT "shop_product_variants_pkey" PRIMARY KEY ("variant_id"),
    CONSTRAINT "shop_product_variants_product_fkey" FOREIGN KEY ("product_id")
        REFERENCES "shop_products" ("product_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shop_product_variants_merchant_fkey" FOREIGN KEY ("merchant_id")
        REFERENCES "shop_merchants" ("merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shop_product_variants_stock_check" CHECK ("reserved" >= 0 AND ("available" IS NULL OR "available" >= 0))
);
CREATE INDEX "shop_product_variants_merchant_id_idx" ON "shop_product_variants" ("merchant_id");
CREATE UNIQUE INDEX "shop_product_variants_product_id_sku_key" ON "shop_product_variants" ("product_id", "sku");

-- ---------------------------------------------------------------------------
-- shop_quotes
-- ---------------------------------------------------------------------------
CREATE TABLE "shop_quotes" (
    "quote_id"                    UUID           NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id"                 UUID           NOT NULL,
    "buyer_identity"              TEXT,
    "items"                       JSONB          NOT NULL,
    "shipping_option"             TEXT,
    "delivery_slot"               TEXT,
    "subtotal"                    DECIMAL(18,6)  NOT NULL,
    "shipping"                    DECIMAL(18,6)  NOT NULL DEFAULT 0,
    "total_usd"                   DECIMAL(18,6)  NOT NULL,
    "fee_usd"                     DECIMAL(18,6)  NOT NULL DEFAULT 0,
    "rails_offered"               TEXT[]         NOT NULL DEFAULT '{}',
    "requires_pii"                TEXT[]         NOT NULL DEFAULT '{}',
    "waive_withdrawal"            BOOLEAN        NOT NULL DEFAULT false,
    "requires_human_confirmation" BOOLEAN        NOT NULL DEFAULT false,
    "is_test"                     BOOLEAN        NOT NULL DEFAULT false,
    "mpp_challenge_id"            TEXT,
    "mpp_challenge_expires_at"    TIMESTAMPTZ,
    "expires_at"                  TIMESTAMPTZ    NOT NULL,
    "status"                      TEXT           NOT NULL DEFAULT 'open',
    "created_at"                  TIMESTAMPTZ    NOT NULL DEFAULT now(),

    CONSTRAINT "shop_quotes_pkey" PRIMARY KEY ("quote_id"),
    CONSTRAINT "shop_quotes_merchant_fkey" FOREIGN KEY ("merchant_id")
        REFERENCES "shop_merchants" ("merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shop_quotes_status_check" CHECK ("status" IN ('open', 'paid', 'expired', 'cancelled'))
);
CREATE INDEX "shop_quotes_merchant_id_idx" ON "shop_quotes" ("merchant_id");
CREATE INDEX "shop_quotes_status_expires_at_idx" ON "shop_quotes" ("status", "expires_at");

-- ---------------------------------------------------------------------------
-- shop_inventory_reservations
-- ---------------------------------------------------------------------------
CREATE TABLE "shop_inventory_reservations" (
    "reservation_id" UUID         NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id"    UUID         NOT NULL,
    "product_id"     UUID         NOT NULL,
    "variant_id"     UUID,
    "qty"            INTEGER      NOT NULL,
    "quote_id"       UUID         NOT NULL,
    "expires_at"     TIMESTAMPTZ  NOT NULL,
    "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "shop_inventory_reservations_pkey" PRIMARY KEY ("reservation_id"),
    CONSTRAINT "shop_inventory_reservations_merchant_fkey" FOREIGN KEY ("merchant_id")
        REFERENCES "shop_merchants" ("merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shop_inventory_reservations_product_fkey" FOREIGN KEY ("product_id")
        REFERENCES "shop_products" ("product_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shop_inventory_reservations_qty_check" CHECK ("qty" > 0)
);
CREATE INDEX "shop_inventory_reservations_merchant_id_idx" ON "shop_inventory_reservations" ("merchant_id");
CREATE INDEX "shop_inventory_reservations_quote_id_idx" ON "shop_inventory_reservations" ("quote_id");
CREATE INDEX "shop_inventory_reservations_expires_at_idx" ON "shop_inventory_reservations" ("expires_at");

-- ---------------------------------------------------------------------------
-- shop_orders (state machine: section 5.3, src/shop/order-state.ts)
-- ---------------------------------------------------------------------------
CREATE TABLE "shop_orders" (
    "order_id"                UUID           NOT NULL DEFAULT gen_random_uuid(),
    "quote_id"                UUID           NOT NULL,
    "merchant_id"             UUID           NOT NULL,
    "buyer_agent_id"          UUID,
    "payer_wallet"            TEXT,
    "rail"                    TEXT,
    "state"                   TEXT           NOT NULL DEFAULT 'QUOTED',
    "total_usd"               DECIMAL(18,6)  NOT NULL,
    "fee_usd"                 DECIMAL(18,6)  NOT NULL DEFAULT 0,
    "fee_settlement"          TEXT           NOT NULL DEFAULT 'none',
    "tx_hash"                 TEXT,
    "settled_at"              TIMESTAMPTZ,
    "confirm_due_at"          TIMESTAMPTZ,
    "ship_due_at"             TIMESTAMPTZ,
    "delivery_eta"            TIMESTAMPTZ,
    "close_after"             TIMESTAMPTZ,
    "fulfillment_status"      TEXT           NOT NULL DEFAULT 'pending',
    "fulfillment_payload_enc" TEXT,
    "created_at"              TIMESTAMPTZ    NOT NULL DEFAULT now(),
    "updated_at"              TIMESTAMPTZ    NOT NULL DEFAULT now(),

    CONSTRAINT "shop_orders_pkey" PRIMARY KEY ("order_id"),
    CONSTRAINT "shop_orders_quote_fkey" FOREIGN KEY ("quote_id")
        REFERENCES "shop_quotes" ("quote_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shop_orders_merchant_fkey" FOREIGN KEY ("merchant_id")
        REFERENCES "shop_merchants" ("merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shop_orders_state_check" CHECK ("state" IN (
        'QUOTED', 'EXPIRED', 'CANCELLED', 'PAYING', 'PAYMENT_FAILED', 'PAID', 'CONFIRMED',
        'FULFILLED', 'SHIPPED', 'DELIVERED', 'CLOSED', 'REFUND_PENDING', 'REFUNDED',
        'PARTIALLY_REFUNDED', 'DISPUTED'
    )),
    CONSTRAINT "shop_orders_fee_settlement_check" CHECK ("fee_settlement" IN ('in_tx', 'receivable', 'none'))
);
CREATE INDEX "shop_orders_merchant_id_idx" ON "shop_orders" ("merchant_id");
CREATE INDEX "shop_orders_state_idx" ON "shop_orders" ("state");
-- One live order per quote: a failed/cancelled/expired row frees the quote, a retry
-- after PAYMENT_FAILED reuses the same row (PAYMENT_FAILED -> PAYING).
CREATE UNIQUE INDEX "shop_orders_quote_id_live_key" ON "shop_orders" ("quote_id")
    WHERE "state" NOT IN ('PAYMENT_FAILED', 'CANCELLED', 'EXPIRED');

-- ---------------------------------------------------------------------------
-- shop_order_events -- append-only, partitioned monthly by "at" (execution_ledger is daily)
-- ---------------------------------------------------------------------------
CREATE TABLE "shop_order_events" (
    "order_id"   UUID         NOT NULL,
    "seq"        INTEGER      NOT NULL,
    "from_state" TEXT,
    "to_state"   TEXT         NOT NULL,
    "actor"      TEXT         NOT NULL,
    "reason"     TEXT,
    "payload"    JSONB        NOT NULL DEFAULT '{}',
    "at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "shop_order_events_pkey" PRIMARY KEY ("order_id", "seq", "at"),
    CONSTRAINT "shop_order_events_order_fkey" FOREIGN KEY ("order_id")
        REFERENCES "shop_orders" ("order_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shop_order_events_actor_check" CHECK ("actor" IN ('buyer', 'merchant', 'system', 'autopilot'))
) PARTITION BY RANGE ("at");
CREATE INDEX "shop_order_events_order_id_seq_idx" ON "shop_order_events" ("order_id", "seq");

-- Previous month + the next 24 months pre-created here; partition-create.job.ts keeps
-- adding upcoming months (no DEFAULT partition: it would block creating a month later).
DO $$
DECLARE
    m date := (date_trunc('month', now()) - interval '1 month')::date;
    i int;
BEGIN
    FOR i IN 0..25 LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF "shop_order_events" FOR VALUES FROM (%L) TO (%L)',
            'shop_order_events_' || to_char(m, 'YYYY_MM'),
            m,
            (m + interval '1 month')::date
        );
        m := (m + interval '1 month')::date;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- shop_payments
-- ---------------------------------------------------------------------------
CREATE TABLE "shop_payments" (
    "payment_id"             UUID           NOT NULL DEFAULT gen_random_uuid(),
    "order_id"               UUID           NOT NULL,
    "rail"                   TEXT           NOT NULL,
    "nonce_or_challenge_id"  TEXT           NOT NULL,
    "payer"                  TEXT           NOT NULL,
    "eip3009_nonce"          TEXT,
    "pay_to"                 TEXT           NOT NULL,
    "amount_usd"             DECIMAL(18,6)  NOT NULL,
    "splits"                 JSONB          NOT NULL DEFAULT '[]',
    "tx_hash"                TEXT,
    "chain_status"           TEXT           NOT NULL DEFAULT 'pending',
    "confirmed_at"           TIMESTAMPTZ,
    "reconcile_until"        TIMESTAMPTZ    NOT NULL DEFAULT (now() + interval '24 hours'),
    "created_at"             TIMESTAMPTZ    NOT NULL DEFAULT now(),

    CONSTRAINT "shop_payments_pkey" PRIMARY KEY ("payment_id"),
    CONSTRAINT "shop_payments_order_fkey" FOREIGN KEY ("order_id")
        REFERENCES "shop_orders" ("order_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shop_payments_chain_status_check" CHECK ("chain_status" IN ('pending', 'confirmed', 'failed'))
);
CREATE UNIQUE INDEX "shop_payments_nonce_or_challenge_id_key" ON "shop_payments" ("nonce_or_challenge_id");
CREATE INDEX "shop_payments_order_id_idx" ON "shop_payments" ("order_id");
CREATE INDEX "shop_payments_pending_reconcile_idx" ON "shop_payments" ("reconcile_until") WHERE "chain_status" <> 'confirmed';

-- ---------------------------------------------------------------------------
-- shop_fee_ledger
-- ---------------------------------------------------------------------------
CREATE TABLE "shop_fee_ledger" (
    "entry_id"     UUID           NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id"  UUID           NOT NULL,
    "order_id"     UUID           NOT NULL,
    "fee_usd"      DECIMAL(18,6)  NOT NULL,
    "mode"         TEXT           NOT NULL,
    "invoice_id"   TEXT,
    "paid_tx_hash" TEXT,
    "status"       TEXT           NOT NULL,
    "created_at"   TIMESTAMPTZ    NOT NULL DEFAULT now(),

    CONSTRAINT "shop_fee_ledger_pkey" PRIMARY KEY ("entry_id"),
    CONSTRAINT "shop_fee_ledger_merchant_fkey" FOREIGN KEY ("merchant_id")
        REFERENCES "shop_merchants" ("merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shop_fee_ledger_order_fkey" FOREIGN KEY ("order_id")
        REFERENCES "shop_orders" ("order_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shop_fee_ledger_mode_check" CHECK ("mode" IN ('in_tx', 'receivable')),
    CONSTRAINT "shop_fee_ledger_status_check" CHECK ("status" IN ('collected', 'owed', 'invoiced', 'paid', 'written_off'))
);
CREATE INDEX "shop_fee_ledger_merchant_id_idx" ON "shop_fee_ledger" ("merchant_id");
CREATE INDEX "shop_fee_ledger_order_id_idx" ON "shop_fee_ledger" ("order_id");

-- ---------------------------------------------------------------------------
-- shop_refunds (wave 1 for reason=duplicate)
-- ---------------------------------------------------------------------------
CREATE TABLE "shop_refunds" (
    "refund_id"       UUID           NOT NULL DEFAULT gen_random_uuid(),
    "order_id"        UUID           NOT NULL,
    "amount_usd"      DECIMAL(18,6)  NOT NULL,
    "reason"          TEXT           NOT NULL,
    "requested_by"    TEXT           NOT NULL,
    "tx_hash"         TEXT,
    "verified"        BOOLEAN        NOT NULL DEFAULT false,
    "verified_amount" DECIMAL(18,6),
    "status"          TEXT           NOT NULL DEFAULT 'requested',
    "due_at"          TIMESTAMPTZ,
    "created_at"      TIMESTAMPTZ    NOT NULL DEFAULT now(),

    CONSTRAINT "shop_refunds_pkey" PRIMARY KEY ("refund_id"),
    CONSTRAINT "shop_refunds_order_fkey" FOREIGN KEY ("order_id")
        REFERENCES "shop_orders" ("order_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shop_refunds_requested_by_check" CHECK ("requested_by" IN ('buyer', 'merchant', 'system')),
    CONSTRAINT "shop_refunds_status_check" CHECK ("status" IN
        ('requested', 'awaiting_merchant_tx', 'verified', 'rejected', 'overdue'))
);
CREATE INDEX "shop_refunds_order_id_idx" ON "shop_refunds" ("order_id");

-- ---------------------------------------------------------------------------
-- shop_webhook_endpoints / shop_webhook_deliveries
-- ---------------------------------------------------------------------------
CREATE TABLE "shop_webhook_endpoints" (
    "endpoint_id"      UUID         NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id"      UUID         NOT NULL,
    "url"              TEXT         NOT NULL,
    "secret_hash"      TEXT         NOT NULL,
    "events"           TEXT[]       NOT NULL DEFAULT '{}',
    "status"           TEXT         NOT NULL DEFAULT 'active',
    "failures_in_row"  INTEGER      NOT NULL DEFAULT 0,
    "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "shop_webhook_endpoints_pkey" PRIMARY KEY ("endpoint_id"),
    CONSTRAINT "shop_webhook_endpoints_merchant_fkey" FOREIGN KEY ("merchant_id")
        REFERENCES "shop_merchants" ("merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shop_webhook_endpoints_https_check" CHECK ("url" LIKE 'https://%')
);
CREATE INDEX "shop_webhook_endpoints_merchant_id_idx" ON "shop_webhook_endpoints" ("merchant_id");

CREATE TABLE "shop_webhook_deliveries" (
    "delivery_id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
    "endpoint_id"           UUID         NOT NULL,
    "merchant_id"           UUID         NOT NULL,
    "event_type"            TEXT         NOT NULL,
    "outbox_id"             BIGINT,
    "attempt"               INTEGER      NOT NULL DEFAULT 1,
    "status_code"           INTEGER,
    "response_excerpt"      TEXT,
    "fulfillment_accepted"  BOOLEAN      NOT NULL DEFAULT false,
    "next_attempt_at"       TIMESTAMPTZ,
    "delivered_at"          TIMESTAMPTZ,
    "created_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "shop_webhook_deliveries_pkey" PRIMARY KEY ("delivery_id"),
    CONSTRAINT "shop_webhook_deliveries_endpoint_fkey" FOREIGN KEY ("endpoint_id")
        REFERENCES "shop_webhook_endpoints" ("endpoint_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shop_webhook_deliveries_merchant_fkey" FOREIGN KEY ("merchant_id")
        REFERENCES "shop_merchants" ("merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "shop_webhook_deliveries_merchant_id_idx" ON "shop_webhook_deliveries" ("merchant_id");
CREATE INDEX "shop_webhook_deliveries_endpoint_id_idx" ON "shop_webhook_deliveries" ("endpoint_id");
CREATE INDEX "shop_webhook_deliveries_next_attempt_idx" ON "shop_webhook_deliveries" ("next_attempt_at")
    WHERE "delivered_at" IS NULL;

-- ---------------------------------------------------------------------------
-- shop_moderation_reviews
-- ---------------------------------------------------------------------------
CREATE TABLE "shop_moderation_reviews" (
    "review_id"     UUID         NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id"   UUID         NOT NULL,
    "scope"         TEXT         NOT NULL,
    "product_id"    UUID,
    "layer"         TEXT         NOT NULL,
    "verdict"       TEXT         NOT NULL,
    "category"      TEXT,
    "evidence_hash" TEXT,
    "at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "shop_moderation_reviews_pkey" PRIMARY KEY ("review_id"),
    CONSTRAINT "shop_moderation_reviews_merchant_fkey" FOREIGN KEY ("merchant_id")
        REFERENCES "shop_merchants" ("merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shop_moderation_reviews_scope_check" CHECK ("scope" IN ('merchant', 'product')),
    CONSTRAINT "shop_moderation_reviews_layer_check" CHECK ("layer" IN ('rules', 'llm', 'human'))
);
CREATE INDEX "shop_moderation_reviews_merchant_id_idx" ON "shop_moderation_reviews" ("merchant_id");

-- ---------------------------------------------------------------------------
-- shop_sanctioned_addresses / shop_connect_events (global, no seller data)
-- ---------------------------------------------------------------------------
CREATE TABLE "shop_sanctioned_addresses" (
    "address"      TEXT         NOT NULL,
    "source"       TEXT         NOT NULL DEFAULT 'ofac_sdn',
    "list_version" TEXT         NOT NULL,
    "synced_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "shop_sanctioned_addresses_pkey" PRIMARY KEY ("address"),
    CONSTRAINT "shop_sanctioned_addresses_source_check" CHECK ("source" IN ('ofac_sdn'))
);

CREATE TABLE "shop_connect_events" (
    "event_id"       UUID         NOT NULL DEFAULT gen_random_uuid(),
    "identity_hash"  TEXT,
    "client_name"    TEXT,
    "client_version" TEXT,
    "user_agent"     TEXT,
    "ip_prefix"      TEXT,
    "error_code"     TEXT,
    "path"           TEXT,
    "at"             TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "shop_connect_events_pkey" PRIMARY KEY ("event_id")
);
CREATE INDEX "shop_connect_events_at_idx" ON "shop_connect_events" ("at");

-- ---------------------------------------------------------------------------
-- incidents_kind_check: 12 existing kinds (0009) + 12 new (spec section 12.2)
-- ---------------------------------------------------------------------------
ALTER TABLE "incidents" DROP CONSTRAINT "incidents_kind_check";
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_kind_check" CHECK ("kind" IN (
    'AUTH_FAILED', 'CREDENTIAL_EXPIRED', 'PROVIDER_DOWN', 'DEGRADED_QUALITY',
    'RATE_LIMITED', 'QUOTA_LOW', 'QUOTA_EXHAUSTED', 'PAYMENT_REQUIRED',
    'API_CHANGED', 'ENDPOINT_CHANGED', 'EMAIL_NOTICE', 'UNKNOWN',
    'CONNECT_FAILED', 'WEBHOOK_FAILED', 'MERCHANT_UNRESPONSIVE', 'REFUND_OVERDUE',
    'DISPUTE_UNANSWERED', 'CATALOG_REJECTED', 'MODERATION_FLAG', 'PAYOUT_WALLET_SANCTIONED',
    'PAYER_SANCTIONED', 'PAYMENT_MISMATCH', 'FEE_INVOICE_OVERDUE', 'STOREFRONT_DOWN'
));
