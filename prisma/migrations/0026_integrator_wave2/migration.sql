-- T-INT-21: the ONE wave-2 migration (plan section 8 item 6). Three tables, no other DDL:
--   shop_pii_envelopes  (INT-21, spec 5.2/10): end-to-end encrypted buyer data, ciphertext only
--   shop_disputes       (INT-23 writes it; the table lives here)
--   shop_fee_invoices   (INT-25 writes it; the table lives here)

CREATE TABLE "shop_pii_envelopes" (
    "envelope_id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
    "order_id"                UUID        NOT NULL,
    "kind"                    TEXT        NOT NULL,
    "kid"                     TEXT        NOT NULL,
    "alg"                     TEXT        NOT NULL,
    "ciphertext"              BYTEA       NOT NULL,
    "sha256"                  CHAR(64)    NOT NULL,
    "created_at"              TIMESTAMPTZ NOT NULL DEFAULT now(),
    "purge_after"             TIMESTAMPTZ,
    "delivered_to_merchant_at" TIMESTAMPTZ,

    CONSTRAINT "shop_pii_envelopes_pkey" PRIMARY KEY ("envelope_id"),
    CONSTRAINT "shop_pii_envelopes_order_fkey" FOREIGN KEY ("order_id")
        REFERENCES "shop_orders" ("order_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shop_pii_envelopes_kind_check" CHECK ("kind" IN
        ('shipping_address', 'passport', 'phone', 'company')),
    CONSTRAINT "shop_pii_envelopes_alg_check" CHECK ("alg" IN
        ('hpke-x25519-sha256-chacha20', 'sealed-box-x25519')),
    CONSTRAINT "shop_pii_envelopes_size_check" CHECK (octet_length("ciphertext") <= 16384)
);
CREATE UNIQUE INDEX "shop_pii_envelopes_order_kind_key" ON "shop_pii_envelopes" ("order_id", "kind");
CREATE INDEX "shop_pii_envelopes_purge_after_idx" ON "shop_pii_envelopes" ("purge_after");

CREATE TABLE "shop_disputes" (
    "dispute_id"        UUID        NOT NULL DEFAULT gen_random_uuid(),
    "order_id"          UUID        NOT NULL,
    "opened_by"         TEXT        NOT NULL,
    "reason_code"       TEXT        NOT NULL,
    "buyer_note"        TEXT,
    "merchant_response" TEXT,
    "due_at"            TIMESTAMPTZ,
    "status"            TEXT        NOT NULL DEFAULT 'open',
    "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "shop_disputes_pkey" PRIMARY KEY ("dispute_id"),
    CONSTRAINT "shop_disputes_order_fkey" FOREIGN KEY ("order_id")
        REFERENCES "shop_orders" ("order_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shop_disputes_buyer_note_check" CHECK ("buyer_note" IS NULL OR char_length("buyer_note") <= 1000),
    CONSTRAINT "shop_disputes_reason_check" CHECK ("reason_code" IN
        ('not_received', 'not_as_described', 'duplicate', 'canceled_recurring', 'agent_error', 'other')),
    CONSTRAINT "shop_disputes_status_check" CHECK ("status" IN
        ('open', 'merchant_responded', 'resolved_refund', 'resolved_rejected', 'expired'))
);
CREATE INDEX "shop_disputes_order_idx" ON "shop_disputes" ("order_id");
CREATE INDEX "shop_disputes_status_due_idx" ON "shop_disputes" ("status", "due_at");

CREATE TABLE "shop_fee_invoices" (
    "invoice_id"   UUID           NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id"  UUID           NOT NULL,
    "period"       TEXT           NOT NULL,
    "amount_usd"   DECIMAL(18,6)  NOT NULL,
    "due_at"       TIMESTAMPTZ    NOT NULL,
    "paid_tx_hash" TEXT,
    "status"       TEXT           NOT NULL DEFAULT 'open',
    "created_at"   TIMESTAMPTZ    NOT NULL DEFAULT now(),

    CONSTRAINT "shop_fee_invoices_pkey" PRIMARY KEY ("invoice_id"),
    CONSTRAINT "shop_fee_invoices_merchant_fkey" FOREIGN KEY ("merchant_id")
        REFERENCES "shop_merchants" ("merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "shop_fee_invoices_status_check" CHECK ("status" IN ('open', 'paid', 'overdue', 'written_off'))
);
CREATE INDEX "shop_fee_invoices_merchant_idx" ON "shop_fee_invoices" ("merchant_id");
CREATE UNIQUE INDEX "shop_fee_invoices_merchant_period_key" ON "shop_fee_invoices" ("merchant_id", "period");
