import { type Stage, ok } from '../types';
import { finalize, refund } from '../../services/escrow.service';
import { logger } from '../../config/logger';

/**
 * ESCROW_FINALIZE stage (§12.43 stage 10, §12.151).
 * Finalize escrow: charge on success, refund on failure.
 * Combined with LEDGER_WRITE in one PG transaction (§12.151).
 * Skip on cache hit (no escrow to finalize).
 */
export const escrowFinalizeStage: Stage = {
  name: 'ESCROW_FINALIZE',

  async execute(ctx) {
    // Cache hits had no escrow — handled by LEDGER_WRITE (§12.173)
    if (ctx.cacheHit) {
      return ok(ctx);
    }

    // No escrow reserved (free tool or error before escrow)
    if (!ctx.escrowId || !ctx.escrowCreatedAt) {
      return ok(ctx);
    }

    // Provider succeeded → finalize (charge)
    if (ctx.providerCalled && ctx.providerResponse) {
      const updated = await finalize(ctx.escrowId, ctx.escrowCreatedAt, ctx.providerDurationMs);

      ctx.billingStatus = 'PAID';
      ctx.finalCost = ctx.escrowAmount ?? 0;

      if (updated === 0) {
        logger.warn(
          { executionId: ctx.escrowId, requestId: ctx.requestId },
          'Escrow already finalized (idempotent)',
        );
      }

      return ok(ctx);
    }

    // Provider failed or not called → refund
    if (ctx.agentId && ctx.escrowAmount) {
      await refund(ctx.escrowId, ctx.escrowCreatedAt, ctx.agentId, ctx.escrowAmount);
    }

    ctx.billingStatus = 'REFUNDED';
    ctx.finalCost = 0;

    return ok(ctx);
  },
};
