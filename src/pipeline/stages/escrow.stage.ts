import { type Stage, type PipelineError, ok, err } from '../types';
import { reserve, InsufficientFundsError } from '../../services/escrow.service';
import { logger } from '../../config/logger';
import { getX402Config } from '../../config/x402.config';

/**
 * ESCROW stage (§12.43 stage 8, §12.154).
 * Reserve funds before provider call.
 * Skip on cache hit (§12.173: cache hits use direct charge, no escrow).
 */
export const escrowStage: Stage = {
  name: 'ESCROW',

  async execute(ctx) {
    // On-chain payment verified by middleware — skip balance deduction (§8.6)
    // Supports both x402 (Base/USDC) and MPP (Tempo/USDC)
    if (ctx.x402Paid || ctx.mppPaid) {
      return ok(ctx);
    }

    // Cache hits skip escrow — direct charge in LEDGER_WRITE (§12.173)
    if (ctx.cacheHit) {
      return ok(ctx);
    }

    if (!ctx.agentId || !ctx.toolId || !ctx.executionId) {
      return err<PipelineError>({
        code: 500,
        error: 'internal_error',
        message: 'Missing agentId, toolId, or executionId for escrow',
      });
    }

    const cost = ctx.toolPrice ?? 0;
    if (cost <= 0) {
      // Free tool — no escrow needed
      return ok(ctx);
    }

    try {
      const result = await reserve(
        ctx.agentId,
        ctx.toolId,
        cost,
        ctx.executionId,
        ctx.idempotencyKey,
      );

      ctx.escrowId = result.executionId;
      ctx.escrowAmount = result.amount;
      ctx.escrowCreatedAt = result.createdAt;

      return ok(ctx);
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        logger.warn(
          { agentId: ctx.agentId, toolId: ctx.toolId, cost, requestId: ctx.requestId },
          'Insufficient funds for escrow',
        );
        const x402Cfg = getX402Config();
        return err<PipelineError>({
          code: 402,
          error: 'payment_required',
          message: 'Insufficient balance for this tool',
          extra: {
            price_usd: cost,
            payment_address: x402Cfg.paymentAddress,
            price_version: 1,
          },
        });
      }
      throw error;
    }
  },
};
