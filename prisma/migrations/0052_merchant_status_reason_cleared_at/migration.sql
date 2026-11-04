-- T-0707: when an operator last lifted status_reason unresponsive|disputes. The two automatic flags
-- count only orders settled after this instant, so a lift holds. No backfill.
ALTER TABLE shop_merchants ADD COLUMN status_reason_cleared_at timestamptz NULL;
