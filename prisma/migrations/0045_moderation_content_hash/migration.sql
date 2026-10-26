-- T-0568: reject memory by normalised content hash.
--
-- content_hash = sha256(normalizeForScan(title + '\n' + description + '\n' + instant payload)),
-- computed in application code (src/shop/moderation/product-rules.ts contentHash). SQL cannot
-- reproduce the normalisation or read the encrypted payload, so existing rows are backfilled by
-- the catalog-remoderate job (backfillContentHashes), not here.
--
-- LAW: shop_moderation_reviews.product_id stays nullable and is NOT a foreign key and is NOT
-- cascaded on delete. Review history survives the product: a layer-3/human reject is remembered
-- per (merchant_id, content_hash), so deleting and recreating a product, or renaming its SKU,
-- does not shed it.
ALTER TABLE "shop_products" ADD COLUMN "content_hash" TEXT;
ALTER TABLE "shop_moderation_reviews" ADD COLUMN "content_hash" TEXT;
CREATE INDEX "shop_moderation_reviews_merchant_content_idx"
    ON "shop_moderation_reviews" ("merchant_id", "content_hash", "at");
