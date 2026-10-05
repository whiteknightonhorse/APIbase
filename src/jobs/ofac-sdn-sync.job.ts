import { logger } from '../config/logger';
import { getPrisma } from '../services/prisma.service';
import { syncOfacSdn } from '../shop/moderation/sanctions';

/**
 * Daily OFAC SDN -> shop_sanctioned_addresses (cron + startup wiring in worker/server.ts).
 * skipIfFresh: startup run skips the download when the table was synced within 20 hours.
 */
export async function run(opts?: { skipIfFresh?: boolean }): Promise<void> {
  const db = getPrisma();
  if (opts?.skipIfFresh) {
    const rows = await db.$queryRawUnsafe<{ fresh: boolean | null }[]>(
      `SELECT max(synced_at) > now() - interval '20 hours' AS fresh FROM shop_sanctioned_addresses`,
    );
    if (rows[0]?.fresh === true) {
      logger.info({ job: 'ofac-sdn-sync', skipped: 'fresh' });
      return;
    }
  }
  await syncOfacSdn(db);
}
