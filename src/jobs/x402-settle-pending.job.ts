import { logger } from '../config/logger';
import { getX402Config, toMicroUsdc } from '../config/x402.config';
import { getPrisma } from '../services/prisma.service';
import { viemChain, type ChainReader } from './shop-payment-reconcile.job';

/**
 * T-0428 x402-settle-pending (worker, every 60 s). Owns outbox type `x402_settle_pending` ONLY
 * (the outbox processor's HANDLED_EVENT_TYPES does not list it). A pending settle is UNKNOWN and
 * is resolved only by reading the chain; this job NEVER calls settle.
 *
 *  receipt of tx_hash ok            -> ledger settled, processed
 *  authorization used + transfer    -> ledger settled, processed
 *  authorization unused, expired    -> `x402_settle_failed` (pending_expired_unsettled), processed
 *  anything else / RPC failure      -> row untouched, retried next tick
 */

interface PendingEvent {
  id: bigint;
  created_at: Date;
  payload: {
    execution_id?: string;
    payer?: string;
    amount_usd?: number;
    tx_hash?: string;
    nonce?: string;
    valid_before?: string;
    request_id?: string;
    tool_id?: string;
  };
}

const rpcWarned = new Set<string>();

export async function run(opts?: { chain?: ChainReader; nowMs?: number }): Promise<void> {
  const db = getPrisma();
  const rows = await db.$queryRawUnsafe<PendingEvent[]>(
    `SELECT id, created_at, payload FROM outbox
      WHERE processed = false AND event_type = 'x402_settle_pending'
      ORDER BY created_at LIMIT 200`,
  );
  if (rows.length === 0) return;
  const nowMs = opts?.nowMs ?? Date.now();
  let chain = opts?.chain;
  for (const r of rows) {
    const p = r.payload;
    try {
      chain ??= await viemChain();
      let tx: string | undefined;
      if (p.tx_hash && (await chain.receiptOk(p.tx_hash))) tx = p.tx_hash;
      if (!tx && p.payer && p.nonce && (await chain.authorizationUsed(p.payer, p.nonce))) {
        tx = await chain.findTransfer({
          payer: p.payer,
          to: getX402Config().paymentAddress,
          valueMicro: toMicroUsdc(Number(p.amount_usd ?? 0)),
          sinceMs: new Date(r.created_at).getTime() - 3600_000,
        });
        if (!tx) continue; // used but transfer not found yet: retry next tick
      }
      if (tx) {
        await markSettled(r, tx);
        logger.info({ job: 'x402-settle-pending', requestId: p.request_id, tx }, 'settle resolved');
        continue;
      }
      // Reaching here with payer+nonce means authorizationUsed was read and is false.
      const authUnused = Boolean(p.payer && p.nonce);
      const validBeforeMs = Number(p.valid_before) * 1000;
      if (authUnused && Number.isFinite(validBeforeMs) && validBeforeMs <= nowMs) {
        await markExpired(r);
        logger.error(
          { job: 'x402-settle-pending', requestId: p.request_id },
          'pending settle expired unsettled — revenue leak',
        );
      }
    } catch (e) {
      const key = String(r.id);
      if (!rpcWarned.has(key)) {
        rpcWarned.add(key);
        logger.warn(
          { job: 'x402-settle-pending', requestId: p.request_id, err: (e as Error).message },
          'chain unavailable — pending settle left untouched',
        );
      }
    }
  }
}

async function markSettled(r: PendingEvent, tx: string): Promise<void> {
  const db = getPrisma();
  if (r.payload.execution_id) {
    await db.$executeRawUnsafe(
      `UPDATE execution_ledger SET x402_settle_state = 'settled', settle_tx_hash = $2,
              x402_onchain_settled = true, updated_at = now()
        WHERE execution_id = $1::uuid AND x402_settle_state = 'pending'`,
      r.payload.execution_id,
      tx,
    );
  }
  await markProcessed(r);
}

async function markExpired(r: PendingEvent): Promise<void> {
  const db = getPrisma();
  const p = r.payload;
  await db.outbox.create({
    data: {
      event_type: 'x402_settle_failed',
      payload: {
        request_id: p.request_id,
        tool_id: p.tool_id,
        payer: p.payer,
        amount_usd: p.amount_usd,
        reason: 'pending_expired_unsettled',
      },
    },
  });
  if (p.execution_id) {
    await db.$executeRawUnsafe(
      `UPDATE execution_ledger SET x402_settle_state = NULL, x402_onchain_settled = false, updated_at = now()
        WHERE execution_id = $1::uuid AND x402_settle_state = 'pending'`,
      p.execution_id,
    );
  }
  await markProcessed(r);
}

async function markProcessed(r: PendingEvent): Promise<void> {
  await getPrisma().$executeRawUnsafe(
    `UPDATE outbox SET processed = true WHERE id = $1 AND created_at = $2 AND event_type = 'x402_settle_pending'`,
    r.id,
    r.created_at,
  );
}
