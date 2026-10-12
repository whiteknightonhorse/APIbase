-- T-0312: a product row inserted without an explicit moderation status is invisible until reviewed.
-- `upsertCatalog` still sets the status explicitly on every write.
ALTER TABLE "shop_products" ALTER COLUMN "moderation_status" SET DEFAULT 'flagged';
