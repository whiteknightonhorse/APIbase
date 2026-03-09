-- APIbase.pro — Daily Partition Management (§12.181, §12.237, §12.244)
--
-- Cron schedule (§12.244):
--   Job 1: Create next day's partitions — daily 23:00 UTC
--   Job 2: Drop expired partitions     — daily 04:00 UTC
--
-- Retention (§12.241):
--   execution_ledger  — 365 days
--   outbox            — 7 days
--   request_metrics   — 90 days

-- ---------------------------------------------------------------------------
-- 1. Create tomorrow's partitions (run daily at 23:00 UTC)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    target_date DATE := CURRENT_DATE + 1;
    next_date   DATE := CURRENT_DATE + 2;
    suffix      TEXT := to_char(target_date, 'YYYY_MM_DD');
    tables      TEXT[] := ARRAY['execution_ledger', 'outbox', 'request_metrics'];
    tbl         TEXT;
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        -- Skip if partition already exists (idempotent)
        IF NOT EXISTS (
            SELECT 1 FROM pg_class
            WHERE relname = tbl || '_' || suffix
              AND relkind = 'r'
        ) THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
                tbl || '_' || suffix, tbl, target_date, next_date
            );
            RAISE NOTICE 'Created partition: %_%', tbl, suffix;
        ELSE
            RAISE NOTICE 'Partition already exists: %_%', tbl, suffix;
        END IF;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Drop expired partitions (run daily at 04:00 UTC)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    rec RECORD;
BEGIN
    -- execution_ledger: drop partitions older than 365 days
    FOR rec IN
        SELECT inhrelid::regclass::text AS part_name
        FROM pg_inherits
        JOIN pg_class c ON c.oid = inhrelid
        WHERE inhparent = 'execution_ledger'::regclass
          AND c.relname < 'execution_ledger_' || to_char(CURRENT_DATE - 365, 'YYYY_MM_DD')
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I', rec.part_name);
        RAISE NOTICE 'Dropped partition: %', rec.part_name;
    END LOOP;

    -- outbox: drop partitions older than 7 days
    FOR rec IN
        SELECT inhrelid::regclass::text AS part_name
        FROM pg_inherits
        JOIN pg_class c ON c.oid = inhrelid
        WHERE inhparent = 'outbox'::regclass
          AND c.relname < 'outbox_' || to_char(CURRENT_DATE - 7, 'YYYY_MM_DD')
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I', rec.part_name);
        RAISE NOTICE 'Dropped partition: %', rec.part_name;
    END LOOP;

    -- request_metrics: drop partitions older than 90 days
    FOR rec IN
        SELECT inhrelid::regclass::text AS part_name
        FROM pg_inherits
        JOIN pg_class c ON c.oid = inhrelid
        WHERE inhparent = 'request_metrics'::regclass
          AND c.relname < 'request_metrics_' || to_char(CURRENT_DATE - 90, 'YYYY_MM_DD')
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I', rec.part_name);
        RAISE NOTICE 'Dropped partition: %', rec.part_name;
    END LOOP;
END $$;
