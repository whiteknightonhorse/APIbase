-- T-INT-32 (F-2 / UC-11): catalog feed imports (CSV, Google Merchant Center RSS/XML, Shopify
-- /products.json) run as a worker job. One row per import; the report is {total, upserted, rejected}.
CREATE TABLE "shop_catalog_imports" (
    "import_job_id"    UUID         NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id"      UUID         NOT NULL,
    "source"           TEXT         NOT NULL,
    "url"              TEXT,
    "body"             TEXT,
    "default_category" TEXT,
    "status"           TEXT         NOT NULL DEFAULT 'queued',
    "total"            INTEGER      NOT NULL DEFAULT 0,
    "upserted"         INTEGER      NOT NULL DEFAULT 0,
    "rejected"         JSONB        NOT NULL DEFAULT '[]',
    "rejected_count"   INTEGER      NOT NULL DEFAULT 0,
    "error"            TEXT,
    "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "started_at"       TIMESTAMPTZ,
    "finished_at"      TIMESTAMPTZ,

    CONSTRAINT "shop_catalog_imports_pkey" PRIMARY KEY ("import_job_id"),
    CONSTRAINT "shop_catalog_imports_merchant_fkey" FOREIGN KEY ("merchant_id")
        REFERENCES "shop_merchants" ("merchant_id") ON DELETE CASCADE,
    CONSTRAINT "shop_catalog_imports_source_check" CHECK ("source" IN ('csv', 'gmc', 'shopify')),
    CONSTRAINT "shop_catalog_imports_status_check" CHECK ("status" IN ('queued', 'running', 'done', 'failed'))
);
CREATE INDEX "shop_catalog_imports_merchant_created_idx" ON "shop_catalog_imports" ("merchant_id", "created_at" DESC);
CREATE INDEX "shop_catalog_imports_open_idx" ON "shop_catalog_imports" ("created_at") WHERE "status" IN ('queued', 'running');
