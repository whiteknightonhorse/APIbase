-- T-SITE-C: contact form messages. Written by POST /api/v1/contact together with an outbox
-- 'contact_message' event; the consumer (host script) reads name/email/message from this table by id.
CREATE TABLE "contact_messages" (
    "message_id"  TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "email"       TEXT NOT NULL,
    "message"     TEXT NOT NULL,
    "ip_address"  TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'new',
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("message_id"),
    CONSTRAINT "contact_messages_status_check" CHECK ("status" IN ('new', 'replied', 'spam'))
);

CREATE INDEX "contact_messages_status_created_at_idx" ON "contact_messages" ("status", "created_at");
