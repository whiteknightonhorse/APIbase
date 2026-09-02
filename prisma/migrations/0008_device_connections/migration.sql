-- Ф5 (2026-09-02): physical-device MCP layer -- per-agent vendor OAuth
-- account links (Tuya first). Never a vendor password; access/refresh
-- tokens are AES-256-GCM ciphertext (secret-crypto.service.ts), never
-- plaintext in this table. Low volume, not partitioned, same class as
-- moderation_appeals.

CREATE TABLE IF NOT EXISTS "device_connections" (
    "connection_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent_id" UUID NOT NULL,
    "vendor" TEXT NOT NULL,
    "vendor_user_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scope" TEXT,
    "access_token_enc" TEXT,
    "refresh_token_enc" TEXT,
    "token_expires_at" TIMESTAMPTZ,
    "oauth_state" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "device_connections_pkey" PRIMARY KEY ("connection_id"),
    CONSTRAINT "device_connections_agent_id_fkey" FOREIGN KEY ("agent_id")
        REFERENCES "agents" ("agent_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "device_connections_oauth_state_key"
    ON "device_connections" ("oauth_state");

CREATE INDEX IF NOT EXISTS "device_connections_agent_id_status_idx"
    ON "device_connections" ("agent_id", "status");
