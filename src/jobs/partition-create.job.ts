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
}
