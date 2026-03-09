import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger';

/**
 * Escrow Reconciliation Job (§12.244 job #3, §12.155, §12.154).
 *
 * Schedule: every 60s (registered in Worker cron).
 *
 * Two operations in a single PG transaction:
 *   1. Timeout stalled escrows → refund:
 *      - pending > 60s → timeout + REFUNDED
 *      - running > 120s → timeout + REFUNDED
 *   2. Re-finalize provider_success > 30s → success + PAID (idempotent)
 *
 * Invariant: ledger update + balance refund = one PG transaction.
 * If transaction fails, neither update persists.
 */

let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

export async function run(): Promise<void> {
  const db = getPrisma();

  try {
    const result = await db.$transaction(async (tx) => {
      // 1. Timeout stalled pending/running escrows → refund
      const timedOut: Array<{ agent_id: string; cost_usd: number }> = await tx.$queryRawUnsafe(`
        WITH stalled AS (
          UPDATE execution_ledger
            SET status = 'timeout',
                billing_status = 'REFUNDED',
                updated_at = NOW()
            WHERE (status = 'pending' AND created_at < NOW() - INTERVAL '60 seconds'
                   AND billing_status = 'RESERVED')
               OR (status = 'running' AND updated_at < NOW() - INTERVAL '120 seconds'
                   AND billing_status = 'RESERVED')
            RETURNING agent_id, cost_usd::numeric AS cost_usd
        )
        SELECT agent_id, SUM(cost_usd)::double precision AS cost_usd
        FROM stalled
        GROUP BY agent_id
      `);

      // Refund each agent's total stalled amount
      for (const row of timedOut) {
        if (row.cost_usd > 0) {
          await tx.$executeRawUnsafe(
            `UPDATE accounts SET balance_usd = balance_usd + $1, updated_at = NOW()
             WHERE agent_id = $2::uuid`,
            row.cost_usd,
            row.agent_id,
          );
        }
      }

      // 2. Re-finalize provider_success entries (idempotent)
      const refinalized = await tx.$executeRawUnsafe(`
        UPDATE execution_ledger
          SET status = 'success',
              billing_status = 'PAID',
              updated_at = NOW()
          WHERE status = 'provider_success'
            AND updated_at < NOW() - INTERVAL '30 seconds'
            AND billing_status != 'PAID'
      `);

      return { timedOutAgents: timedOut.length, refinalized };
    });

    if (result.timedOutAgents > 0 || result.refinalized > 0) {
      logger.info(
        {
          job: 'reconciliation',
          timedOutAgents: result.timedOutAgents,
          refinalized: result.refinalized,
        },
        'Reconciliation completed',
      );
    }
  } catch (error) {
    logger.error({ err: error, job: 'reconciliation' }, 'Reconciliation failed');
    throw error;
  }
}
