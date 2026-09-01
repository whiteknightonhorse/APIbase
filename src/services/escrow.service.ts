import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger';

/**
 * Escrow Service (§12.154, §12.151).
 *
 * Three operations — reserve, finalize, refund — all using PG transactions
 * for atomicity. No separate escrow model: the execution_ledger row with
 * billing_status serves as the escrow record.
 *
 * Financial invariants enforced:
 *  - Row-level lock prevents negative balance (UPDATE ... WHERE balance >= cost)
 *  - ESCROW_FINALIZE + LEDGER_WRITE = one PG transaction (§12.151)
 *  - Guard clauses prevent double-charge and double-refund (idempotent)
 */

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class InsufficientFundsError extends Error {
  constructor(agentId: string, required: number, available?: number) {
    super(
      `Insufficient funds for agent ${agentId}: required ${required}` +
        (available !== undefined ? `, available ${available}` : ''),
    );
    this.name = 'InsufficientFundsError';
  }
}

// ---------------------------------------------------------------------------
// Lazy PrismaClient singleton
// ---------------------------------------------------------------------------

let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReserveResult {
  executionId: string;
  amount: number;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// reserve — ESCROW stage (§12.154)
// ---------------------------------------------------------------------------

/**
 * Reserve funds before provider call.
 * Atomic: debit account + insert ledger row with billing_status=RESERVED.
 * Row-level lock via UPDATE ... WHERE balance_usd >= $cost prevents overdraw.
 */
export async function reserve(
  agentId: string,
  toolId: string,
  cost: number,
  executionId: string,
  idempotencyKey?: string,
): Promise<ReserveResult> {
  const db = getPrisma();

  return db.$transaction(async (tx) => {
    // Row-level lock: debit only if sufficient balance
    const updated = await tx.$executeRawUnsafe(
      `UPDATE accounts SET balance_usd = balance_usd - $1, updated_at = NOW()
       WHERE agent_id = $2::uuid AND balance_usd >= $1`,
      cost,
      agentId,
    );

    if (updated === 0) {
      throw new InsufficientFundsError(agentId, cost);
    }

    // Insert ledger row as escrow record (billing_status=RESERVED)
    const now = new Date();
    await tx.executionLedger.create({
      data: {
        execution_id: executionId,
        agent_id: agentId,
        tool_id: toolId,
        status: 'pending',
        billing_status: 'RESERVED',
        cost_usd: cost,
        provider_called: false,
        cache_status: 'MISS',
        idempotency_key: idempotencyKey ?? null,
        created_at: now,
      },
    });

    logger.info({ executionId, agentId, toolId, cost }, 'Escrow reserved');

    return { executionId, amount: cost, createdAt: now };
  });
}

// ---------------------------------------------------------------------------
// finalize — ESCROW_FINALIZE + LEDGER_WRITE atomic (§12.151)
// ---------------------------------------------------------------------------

/**
 * Finalize escrow: mark as PAID on provider success.
 * Combined ESCROW_FINALIZE + LEDGER_WRITE in one PG transaction.
 * Guard billing_status != 'PAID' prevents double-charge (idempotent).
 */
export interface ModerationBlockInfo {
  ruleId: string;
  category: string;
  appealId?: string;
}

export async function finalize(
  executionId: string,
  createdAt: Date,
  providerLatencyMs?: number,
  moderation?: ModerationBlockInfo,
): Promise<number> {
  const db = getPrisma();

  // F2/C-3: a moderation-blocked PAID request still charges (settle-on-
  // block), but status/payload_status must say what actually happened —
  // 'blocked'/'BLOCKED', not 'success'/'OK' — and the ledger row carries
  // the rule_id/category/appeal_id a human (or the appeal endpoint) needs.
  const status = moderation ? 'blocked' : 'success';
  const payloadStatus = moderation ? 'BLOCKED' : 'OK';

  const updatedCount = await db.$executeRawUnsafe(
    `UPDATE execution_ledger
     SET status = $4,
         billing_status = 'PAID',
         provider_called = true,
         provider_latency_ms = $3,
         payload_status = $5,
         moderation_rule_id = $6,
         moderation_category = $7,
         moderation_appeal_id = $8::uuid,
         updated_at = NOW()
     WHERE execution_id = $1::uuid
       AND created_at = $2
       AND billing_status != 'PAID'`,
    executionId,
    createdAt,
    providerLatencyMs ?? null,
    status,
    payloadStatus,
    moderation?.ruleId ?? null,
    moderation?.category ?? null,
    moderation?.appealId ?? null,
  );

  if (updatedCount > 0) {
    if (moderation) {
      logger.warn(
        { executionId, ...moderation },
        'Escrow finalized (PAID, settle-on-block — content moderation)',
      );
    } else {
      logger.info({ executionId, providerLatencyMs }, 'Escrow finalized (PAID)');
    }
  }

  return updatedCount;
}

// ---------------------------------------------------------------------------
// refund — Escrow refund on provider failure (§12.154)
// ---------------------------------------------------------------------------

/**
 * Refund escrowed funds on provider failure.
 * Atomic: update ledger to REFUNDED + credit account balance.
 * Guard billing_status='RESERVED' prevents double-refund (idempotent).
 */
export async function refund(
  executionId: string,
  createdAt: Date,
  agentId: string,
  amount: number,
): Promise<number> {
  const db = getPrisma();

  return db.$transaction(async (tx) => {
    // Update ledger: RESERVED → REFUNDED
    const updatedCount = await tx.$executeRawUnsafe(
      `UPDATE execution_ledger
       SET status = 'failed',
           billing_status = 'REFUNDED',
           provider_called = true,
           payload_status = 'FAILED',
           updated_at = NOW()
       WHERE execution_id = $1::uuid
         AND created_at = $2
         AND billing_status = 'RESERVED'`,
      executionId,
      createdAt,
    );

    if (updatedCount > 0) {
      // Credit back the reserved amount
      await tx.$executeRawUnsafe(
        `UPDATE accounts SET balance_usd = balance_usd + $1, updated_at = NOW()
         WHERE agent_id = $2::uuid`,
        amount,
        agentId,
      );

      logger.info({ executionId, agentId, amount }, 'Escrow refunded');
    }

    return updatedCount;
  });
}
