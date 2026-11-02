import { logger } from '../config/logger';
import { getPrisma } from '../services/prisma.service';
import { ledgerWriteFailedBookedTotal } from '../services/metrics.service';

/**
 * T-0646 ledger-write-failed (worker, every 60 s). Owns outbox type `ledger.write_failed` ONLY:
 * the ledger write threw after the payer's money moved, the result was delivered, and the stage
 * left this row. The job books the missing execution_ledger row from the payload (status success,
 * billing PAID, cost amount_usd, payer, tx_hash, x402_onchain_settled true for x402) and marks the
 * row processed. Idempotent: an execution_id that already has a ledger row is not inserted again.
 * Rows without a usable agent_id (written before T-0646) are left untouched and logged once.
 */

interface FailedEvent {
  id: bigint;
  created_at: Date;
  payload: {
    request_id?: string;
    execution_id?: string;
    agent_id?: string;
    tool_id?: string;
    rail?: string;
    payer?: string;
    tx_hash?: string;
    amount_usd?: number;
  };
}

const warned = new Set<string>();

export async function run(): Promise<void> {
  const db = getPrisma();
  const rows = await db.$queryRawUnsafe<FailedEvent[]>(
    `SELECT id, created_at, payload FROM outbox
      WHERE processed = false AND event_type = 'ledger.write_failed'
      ORDER BY created_at LIMIT 200`,
  );
  for (const r of rows) {
    const p = r.payload;
    try {
      if (!p.execution_id || !p.agent_id || !p.tool_id) {
        const key = String(r.id);
        if (!warned.has(key)) {
          warned.add(key);
          logger.error(
            { job: 'ledger-write-failed', requestId: p.request_id },
            'ledger.write_failed row lacks execution_id/agent_id/tool_id -- cannot book, operator action',
          );
        }
        continue;
      }
      const rail = p.rail === 'mpp' ? 'mpp' : 'x402';
      const inserted = await db.$executeRawUnsafe(
        `INSERT INTO execution_ledger
           (execution_id, agent_id, tool_id, status, billing_status, cost_usd, payer,
            provider_called, x402_onchain_settled, settle_tx_hash)
         SELECT $1::uuid, $2::uuid, $3, 'success', 'PAID', $4::numeric, $5, true, $6, $7
          WHERE NOT EXISTS (SELECT 1 FROM execution_ledger WHERE execution_id = $1::uuid)`,
        p.execution_id,
        p.agent_id,
        p.tool_id,
        Number(p.amount_usd ?? 0),
        p.payer ?? null,
        rail === 'x402' ? true : null,
        rail === 'x402' ? (p.tx_hash ?? null) : null,
      );
      if (inserted > 0) {
        ledgerWriteFailedBookedTotal.inc({ rail });
        logger.info(
          { job: 'ledger-write-failed', requestId: p.request_id, rail },
          'ledger.write_failed booked into execution_ledger',
        );
      }
      await db.$executeRawUnsafe(
        `UPDATE outbox SET processed = true WHERE id = $1 AND created_at = $2 AND event_type = 'ledger.write_failed'`,
        r.id,
        r.created_at,
      );
    } catch (e) {
      logger.warn(
        { job: 'ledger-write-failed', requestId: p.request_id, err: (e as Error).message },
        'booking failed -- row left for the next tick',
      );
    }
  }
}
