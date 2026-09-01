import { type Stage, ok } from '../types';
import { finalize, refund } from '../../services/escrow.service';
import { logger } from '../../config/logger';
import { settleX402 } from './x402-settle';
import { getPrisma } from '../../services/prisma.service';

/**
 * F1/C-5 (2026-09-01): MPP is charged by mppMiddleware BEFORE this pipeline
 * even starts (tempo.charge() settles on-chain at verification time, no
 * facilitator, no internal escrowId — see mpp.middleware.ts). Before this
 * fix, a failed provider call on an MPP-paid request fell through every
 * branch below to the \"no escrow reserved\" early-return (MPP requests never
 * have ctx.escrowId) and left with billingStatus/finalCost simply unset —
 * the client's money was gone and nothing recorded it, let alone refunded
 * it. This does NOT execute an on-chain refund transfer — this operator's
 * standing rule (and mine) is that sending cryptocurrency is never done by
 * unsupervised code; it durably records exactly what is owed, to whom, and
 * why, and scripts/mpp-refund-owed-alerts.py pages the operator immediately
 * so a human executes the actual transfer.
 */
export async function recordMppRefundOwed(
  ctx: import('../types').PipelineContext,
  reason: string,
): Promise<void> {
  try {
    await getPrisma().outbox.create({
      data: {
        event_type: 'mpp_refund_owed',
        payload: {
          request_id: ctx.requestId,
          tool_id: ctx.toolId,
          payer: ctx.mppPayer,
          amount_usd: ctx.toolPrice,
          reason,
        },
      },
    });
  } catch (e) {
    logger.error(
      { requestId: ctx.requestId, err: e },
      'MPP refund-owed record FAILED to write — this refund will be missed unless caught manually',
    );
  }
}

/**
 * ESCROW_FINALIZE stage (§12.43 stage 10, §12.151).
 * Finalize escrow: charge on success, refund on failure.
 * Combined with LEDGER_WRITE in one PG transaction (§12.151).
 * Skip on cache hit (no escrow to finalize).
 */
export const escrowFinalizeStage: Stage = {
  name: 'ESCROW_FINALIZE',

  async execute(ctx) {
    // Something to serve: a successful provider call OR a cache hit being replayed.
    // Both are "agent got their data" — payment should settle in either case.
    const hasResponseToServe = (ctx.providerCalled && ctx.providerResponse) || ctx.cacheHit;

    // x402 on-chain payment — settle with facilitator (§8.9).
    // Cache-hit path added 2026-04-22: anonymous x402 agents with balance=0 need
    // their signed payment to cover cache-hit billing (instead of dead balance debit).
    if (ctx.x402Paid && ctx.x402PaymentHeader && hasResponseToServe) {
      await settleX402(ctx);
      ctx.billingStatus = 'PAID';
      ctx.finalCost = ctx.toolPrice ?? 0;
      return ok(ctx);
    }

    // MPP on-chain payment — already settled at Tempo verification time (no facilitator).
    // Cache-hit covered by hasResponseToServe same as x402.
    if (ctx.mppPaid && hasResponseToServe) {
      ctx.billingStatus = 'PAID';
      ctx.finalCost = ctx.toolPrice ?? 0;
      return ok(ctx);
    }

    // F1/C-5: MPP paid but the provider call failed (or never ran) — the money
    // is gone (charged at verification time) and MPP has no escrowId for the
    // generic refund() path below to find. billing_status stays 'PAID' — that
    // honestly describes what happened to OUR ledger; the outbox record is
    // the operational trail for the still-owed refund (see the module doc).
    if (ctx.mppPaid && !hasResponseToServe) {
      ctx.billingStatus = 'PAID';
      ctx.finalCost = ctx.toolPrice ?? 0;
      await recordMppRefundOwed(ctx, 'provider_call_failed_or_not_made');
      return ok(ctx);
    }

    // Cache hit without payment rail — fall through to LEDGER_WRITE (balance debit, §12.173)
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
