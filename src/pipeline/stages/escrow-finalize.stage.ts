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
 * it.
 *
 * ⛔ STANDING OPERATOR DECISION (2026-09-01, confirmed after this was built):
 * MPP refunds are executed MANUALLY by the operator after this alert, never
 * by autonomous code — MPP/mppx has no reverse-payment primitive, so a real
 * refund would be a brand-new outbound on-chain transfer signed with the
 * live operator key. Sending cryptocurrency unsupervised is a line this
 * codebase does not cross, regardless of future autonomy grants, without a
 * new explicit decision. This function's only job is to durably record
 * exactly what is owed, to whom, and why, with everything a human needs to
 * act on it without investigating further (amount, recipient, network, the
 * original tx hash, the call id, the timestamp) — see
 * scripts/mpp-refund-owed-alerts.py (5-min page),
 * scripts/mpp-refund-resolve.py (operator marks it handled), and
 * scripts/mpp-refund-weekly-summary.py (nothing left to silently age out).
 *
 * The row's `processed` column IS the "still owed" flag — it starts false
 * and stays false until mpp-refund-resolve.py flips it, which also protects
 * the row from partition-cleanup.job.ts's 7-day outbox retention (that job
 * already refuses to drop a partition containing any `processed=false` row).
 * A forgotten refund must not be able to silently expire; it can only be
 * closed by a human explicitly saying so.
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
          refund_to: ctx.mppPayer,
          amount_usd: ctx.toolPrice,
          network: 'tempo',
          tx_hash: ctx.mppTxHash ?? 'unknown',
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
    // Something to serve: a successful provider call, a cache hit being
    // replayed, OR a moderation block on an already-paid request
    // (F2/C-3 settle-on-block — the client gets a block response instead of
    // data, but the payment still settles; see moderation.stage.ts and
    // pipeline.ts's MODERATION exception for why this stage runs at all on
    // a request that otherwise stopped at MODERATION).
    const hasResponseToServe =
      (ctx.providerCalled && ctx.providerResponse) || ctx.cacheHit || ctx.moderationBlocked;

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

    // Provider succeeded, OR MODERATION blocked this paid request (settle
    // anyway — F2/C-3) → finalize (charge).
    if ((ctx.providerCalled && ctx.providerResponse) || ctx.moderationBlocked) {
      const updated = await finalize(
        ctx.escrowId,
        ctx.escrowCreatedAt,
        ctx.providerDurationMs,
        ctx.moderationBlocked
          ? {
              ruleId: ctx.moderationRuleId ?? 'unknown',
              category: ctx.moderationCategory ?? 'unknown',
              appealId: ctx.moderationAppealId,
            }
          : undefined,
      );

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
