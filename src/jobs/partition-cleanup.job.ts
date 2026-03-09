import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger';

/**
 * Partition Cleanup Job (§12.244 job #2, §12.237).
 *
 * Schedule: daily 04:00 UTC (registered in API server cron).
 * Drops partitions older than retention period:
 *   - execution_ledger: > 365 days
 *   - outbox: > 7 days (only if no unprocessed events)
 *   - request_metrics: > 90 days (§12.241 registry — canonical)
 *
 * Uses DROP TABLE (instant, metadata-only) instead of DELETE.
 */

interface RetentionConfig {
  table: string;
  retentionDays: number;
  safeCheck?: boolean;
}

const RETENTION: RetentionConfig[] = [
  { table: 'execution_ledger', retentionDays: 365 },
  { table: 'outbox', retentionDays: 7, safeCheck: true },
  { table: 'request_metrics', retentionDays: 90 },
];

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

export async function run(): Promise<void> {
  const db = getPrisma();

  for (const config of RETENTION) {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - config.retentionDays);
    const cutoffSuffix = formatDate(cutoff);
    const prefix = `${config.table}_`;

    try {
      const partitions: Array<{ tablename: string }> = await db.$queryRawUnsafe(
        `SELECT tablename FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename LIKE $1
           AND tablename < $2
         ORDER BY tablename`,
        `${prefix}%`,
        `${prefix}${cutoffSuffix}`,
      );

      for (const { tablename } of partitions) {
        if (config.safeCheck) {
          // Outbox: only drop if no unprocessed events (§12.153)
          const unprocessed: Array<{ count: bigint }> = await db.$queryRawUnsafe(
            `SELECT COUNT(*) as count FROM "${tablename}" WHERE processed = false`,
          );
          if (unprocessed[0] && unprocessed[0].count > 0n) {
            logger.warn(
              { job: 'partition-cleanup', partition: tablename },
              'Skipping partition with unprocessed events',
            );
            continue;
          }
        }

        await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tablename}"`);
        logger.info({ job: 'partition-cleanup', partition: tablename }, 'Partition dropped');
      }
    } catch (error) {
      logger.error(
        { err: error, job: 'partition-cleanup', table: config.table },
        'Failed to cleanup partitions',
      );
      throw error;
    }
  }
}
