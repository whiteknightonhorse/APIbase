import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger';

/**
 * Partition Create Job (§12.244 job #1, §12.181).
 *
 * Schedule: daily 23:00 UTC (registered in API server cron).
 * Creates tomorrow's partitions for all 3 partitioned tables:
 *   - execution_ledger_YYYY_MM_DD
 *   - outbox_YYYY_MM_DD
 *   - request_metrics_YYYY_MM_DD
 *
 * Idempotent: CREATE TABLE IF NOT EXISTS.
 */

const PARTITIONED_TABLES = ['execution_ledger', 'outbox', 'request_metrics'] as const;

let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}_${m}_${d}`;
}

function formatIso(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * T-INT-01: shop_order_events is partitioned by MONTH (spec section 14), unlike the daily
 * tables below. Idempotent; migration 0025 pre-creates 24 months, this keeps the horizon moving.
 */
export async function createShopMonthlyPartitions(monthsAhead = 3): Promise<void> {
  const db = getPrisma();
  const now = new Date();
  for (let i = 0; i <= monthsAhead; i++) {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i + 1, 1));
    const name = `shop_order_events_${from.getUTCFullYear()}_${String(from.getUTCMonth() + 1).padStart(2, '0')}`;
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${name}" PARTITION OF "shop_order_events"
       FOR VALUES FROM ('${formatIso(from)}') TO ('${formatIso(to)}')`,
    );
  }
}

export async function run(): Promise<void> {
  const db = getPrisma();
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);

  const dayAfter = new Date(tomorrow);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);

  const dateSuffix = formatDate(tomorrow);
  const rangeFrom = formatIso(tomorrow);
  const rangeTo = formatIso(dayAfter);

  for (const table of PARTITIONED_TABLES) {
    const partitionName = `${table}_${dateSuffix}`;
    try {
      await db.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "${partitionName}" PARTITION OF "${table}"
         FOR VALUES FROM ('${rangeFrom}') TO ('${rangeTo}')`,
      );
      logger.info({ job: 'partition-create', partition: partitionName }, 'Partition created');
    } catch (error) {
      logger.error(
        { err: error, job: 'partition-create', partition: partitionName },
        'Failed to create partition',
      );
      throw error;
    }
  }
  await createShopMonthlyPartitions();
}
