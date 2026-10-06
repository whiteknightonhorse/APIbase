-- T-INT-22: a delivery slot is held like stock, by a row of shop_inventory_reservations
-- (kind = 'slot', variant_id NULL, slot_id = the slot's id). One live row per (product, slot):
-- the unique index is the atomic "slot taken" check. No other DDL.
ALTER TABLE "shop_inventory_reservations"
    ADD COLUMN "kind"    TEXT NOT NULL DEFAULT 'stock',
    ADD COLUMN "slot_id" TEXT;
ALTER TABLE "shop_inventory_reservations"
    ADD CONSTRAINT "shop_inventory_reservations_kind_check"
        CHECK ("kind" IN ('stock', 'slot') AND (("kind" = 'slot') = ("slot_id" IS NOT NULL)));
CREATE UNIQUE INDEX "shop_inventory_reservations_slot_key"
    ON "shop_inventory_reservations" ("product_id", "slot_id") WHERE "kind" = 'slot';
