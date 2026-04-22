import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger';

/**
 * Ledger Service (§12.146, §12.151, §AP-9).
 *
 * Append-only execution ledger — every billable action is recorded.
 * Source of truth for financial compliance and EU AI Act audit trail.
 *
 * Write paths:
 *  1. Escrowed request → handled by escrow.service.ts (atomic finalize+ledger)
 *  2. Cache hit → writeDirectCharge (10% of tool price, §12.173)
 *  3. Free tool → writeFreeEntry (cost=0)
 *  4. Single-flight shared → writeSharedEntry (cost=0, shared_success)
 *
 * Invariant: ledger is append-only. Never UPDATE or DELETE rows.
 * Exception: escrow.service transitions RESERVED → PAID/REFUNDED.
 */

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

export interface LedgerEntryBase {
  executionId: string;
  agentId: string;
  toolId: string;
  idempotencyKey?: string;
  requestId: string;
}

export interface DirectChargeEntry extends LedgerEntryBase {
  toolPrice: number;
  costMultiplier: number;
}

export interface FreeEntry extends LedgerEntryBase {
  providerCalled: boolean;
  providerLatencyMs?: number;
}

export interface SharedEntry extends LedgerEntryBase {
  sharedFromExecutionId?: string;
}

export interface X402Entry extends LedgerEntryBase {
  cost: number;
  payer: string;
  providerLatencyMs?: number;
  /**
   * True when the payment rail covered a cache-hit (no provider call happened).
   * Default: false (cache-miss cache-fill — provider called).
   * Added 2026-04-22 to close Q#1 cache-hit 402 loop for anonymous payment-rail agents.
   */
  cacheHit?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cache hit cost multiplier (§12.173): 10% of tool price. */
export const CACHE_HIT_COST_MULTIPLIER = 0.1;

// ---------------------------------------------------------------------------
// writeDirectCharge — Cache hit billing (§12.173)
// ---------------------------------------------------------------------------

/**
 * Write a direct-charge ledger entry for a cache hit.
 * Atomic: debit account + insert ledger in one PG transaction.
 * Cost = toolPrice * costMultiplier (default 10%).
 *
 * @returns The actual cost charged (0 if free tool).
 */
export async function writeDirectCharge(entry: DirectChargeEntry): Promise<number> {
  const db = getPrisma();
  const cost = entry.toolPrice * entry.costMultiplier;

  if (cost > 0) {
    await db.$transaction(async (tx) => {
      const updated = await tx.$executeRawUnsafe(
        `UPDATE accounts SET balance_usd = balance_usd - $1, updated_at = NOW()
         WHERE agent_id = $2::uuid AND balance_usd >= $1`,
        cost,
        entry.agentId,
      );

      if (updated === 0) {
        throw new Error('INSUFFICIENT_FUNDS_CACHE_HIT');
      }

      await tx.executionLedger.create({
        data: {
          execution_id: entry.executionId,
          agent_id: entry.agentId,
          tool_id: entry.toolId,
          status: 'success',
          billing_status: 'PAID',
          cost_usd: cost,
          provider_called: false,
          cache_status: 'HIT',
          idempotency_key: entry.idempotencyKey ?? null,
        },
      });
    });

    logger.info(
      { executionId: entry.executionId, agentId: entry.agentId, cost },
      'Cache-hit direct charge recorded',
    );
  } else {
    await db.executionLedger.create({
      data: {
        execution_id: entry.executionId,
        agent_id: entry.agentId,
        tool_id: entry.toolId,
        status: 'success',
        billing_status: 'FREE',
        cost_usd: 0,
        provider_called: false,
        cache_status: 'HIT',
        idempotency_key: entry.idempotencyKey ?? null,
      },
    });
  }

  return cost;
}

// ---------------------------------------------------------------------------
// writeFreeEntry — Free tool execution (no escrow, cost=0)
// ---------------------------------------------------------------------------

/**
 * Write a ledger entry for a free tool execution.
 * No account debit — just records the execution for audit.
 */
export async function writeFreeEntry(entry: FreeEntry): Promise<void> {
  const db = getPrisma();

  await db.executionLedger.create({
    data: {
      execution_id: entry.executionId,
      agent_id: entry.agentId,
      tool_id: entry.toolId,
      status: entry.providerCalled ? 'success' : 'failed',
      billing_status: 'FREE',
      cost_usd: 0,
      provider_called: entry.providerCalled,
      cache_status: 'MISS',
      provider_latency_ms: entry.providerLatencyMs ?? null,
      idempotency_key: entry.idempotencyKey ?? null,
    },
  });

  logger.info(
    { executionId: entry.executionId, agentId: entry.agentId, toolId: entry.toolId },
    'Free tool ledger entry recorded',
  );
}

// ---------------------------------------------------------------------------
// writeSharedEntry — Single-flight shared result (§12.144)
// ---------------------------------------------------------------------------

/**
 * Write a ledger entry for a single-flight shared result.
 * The waiter gets the result for free (provider was called by the lock owner).
 * Status: shared_success, billing: FREE, cache_status: SHARED.
 */
export async function writeSharedEntry(entry: SharedEntry): Promise<void> {
  const db = getPrisma();

  await db.executionLedger.create({
    data: {
      execution_id: entry.executionId,
      agent_id: entry.agentId,
      tool_id: entry.toolId,
      status: 'shared_success',
      billing_status: 'FREE',
      cost_usd: 0,
      provider_called: false,
      cache_status: 'SHARED',
      idempotency_key: entry.idempotencyKey ?? null,
    },
  });

  logger.info(
    {
      executionId: entry.executionId,
      agentId: entry.agentId,
      toolId: entry.toolId,
      sharedFrom: entry.sharedFromExecutionId,
    },
    'Shared success ledger entry recorded',
  );
}

// ---------------------------------------------------------------------------
// writeX402Entry — x402 on-chain payment (§8.9, §AP-9)
// ---------------------------------------------------------------------------

/**
 * Write a ledger entry for an x402 on-chain payment.
 * No escrow was created — payment was verified and settled via facilitator.
 * Records cost and payer wallet for audit compliance.
 */
export async function writeX402Entry(entry: X402Entry): Promise<void> {
  const db = getPrisma();
  const isCacheHit = entry.cacheHit === true;

  await db.executionLedger.create({
    data: {
      execution_id: entry.executionId,
      agent_id: entry.agentId,
      tool_id: entry.toolId,
      status: 'success',
      billing_status: 'PAID',
      cost_usd: entry.cost,
      // Cache-hit path: provider was NOT called, served from cache.
      // Cache-miss path: provider was called, filled cache for future hits.
      provider_called: !isCacheHit,
      cache_status: isCacheHit ? 'HIT' : 'MISS',
      provider_latency_ms: isCacheHit ? null : (entry.providerLatencyMs ?? null),
      idempotency_key: entry.idempotencyKey ?? null,
    },
  });

  logger.info(
    {
      executionId: entry.executionId,
      agentId: entry.agentId,
      toolId: entry.toolId,
      cost: entry.cost,
      payer: entry.payer,
    },
    'x402 on-chain payment ledger entry recorded',
  );
}
