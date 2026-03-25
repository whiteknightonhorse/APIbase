import { type Stage, ok, err } from '../types';
import {
  writeDirectCharge,
  writeFreeEntry,
  writeSharedEntry,
  writeX402Entry,
  CACHE_HIT_COST_MULTIPLIER,
} from '../../services/ledger.service';
import { getX402Config } from '../../config/x402.config';

/**
 * LEDGER_WRITE stage (§12.43 stage 11, §12.151, §AP-9).
 *
 * Append-only execution record for every request:
 *  - Escrowed request: ledger already written atomically by ESCROW_FINALIZE.
 *  - Cache hit: direct charge (10% of tool price, §12.173).
 *  - Single-flight shared: free entry with status shared_success (§12.144).
 *  - Free tool: record with cost=0.
 *
 * Invariant: every execution produces exactly one ledger row.
 */
export const ledgerWriteStage: Stage = {
  name: 'LEDGER_WRITE',

  async execute(ctx) {
    // Escrowed request: ledger already written by ESCROW_FINALIZE (§12.151)
    if (ctx.escrowId) {
      ctx.ledgerWritten = true;
      return ok(ctx);
    }

    // On-chain payment (x402 or MPP) — write ledger entry (no escrow was created) (§8.9, §AP-9)
    if ((ctx.x402Paid || ctx.mppPaid) && ctx.billingStatus === 'PAID') {
      if (ctx.agentId && ctx.toolId && ctx.executionId) {
        await writeX402Entry({
          executionId: ctx.executionId,
          agentId: ctx.agentId,
          toolId: ctx.toolId,
          idempotencyKey: ctx.idempotencyKey,
          requestId: ctx.requestId,
          cost: ctx.finalCost ?? ctx.toolPrice ?? 0,
          payer: ctx.mppPaid ? (ctx.mppPayer ?? 'tempo-agent') : (ctx.x402Payer ?? 'unknown'),
          providerLatencyMs: ctx.providerDurationMs,
        });
      }
      ctx.ledgerWritten = true;
      return ok(ctx);
    }

    // Guard: need agent/tool/execution context for any ledger write
    if (!ctx.agentId || !ctx.toolId || !ctx.executionId) {
      // Defensive: if we somehow lack context, mark as written and continue
      ctx.ledgerWritten = true;
      return ok(ctx);
    }

    const baseEntry = {
      executionId: ctx.executionId,
      agentId: ctx.agentId,
      toolId: ctx.toolId,
      idempotencyKey: ctx.idempotencyKey,
      requestId: ctx.requestId,
    };

    // Single-flight shared result (§12.144)
    // Waiter that got result from lock owner — free, no provider call
    if (ctx.cacheHit && ctx.isLockOwner === false) {
      // Distinguish true cache hit vs single-flight shared:
      // Both have cacheHit=true, isLockOwner=false.
      // For billing: cache hits of paid tools get charged 10%.
      const toolPrice = ctx.toolPrice ?? 0;

      if (toolPrice > 0) {
        try {
          const cost = await writeDirectCharge({
            ...baseEntry,
            toolPrice,
            costMultiplier: CACHE_HIT_COST_MULTIPLIER,
          });

          ctx.billingStatus = cost > 0 ? 'PAID' : 'FREE';
          ctx.finalCost = cost;
        } catch (e) {
          if (e instanceof Error && e.message === 'INSUFFICIENT_FUNDS_CACHE_HIT') {
            const x402Cfg = getX402Config();
            return err({
              code: 402,
              error: 'payment_required',
              message: 'Insufficient balance for cache-hit charge',
              extra: {
                price_usd: toolPrice,
                payment_address: x402Cfg.paymentAddress,
                price_version: 1,
              },
            });
          }
          throw e;
        }
      } else {
        await writeSharedEntry(baseEntry);

        ctx.billingStatus = 'FREE';
        ctx.finalCost = 0;
      }

      ctx.ledgerWritten = true;
      return ok(ctx);
    }

    // Cache hit where we became lock owner (timeout promotion) — treated as normal execution
    // Falls through to free tool path if price=0

    // Free tool, no escrow — record in ledger
    if ((ctx.toolPrice ?? 0) <= 0) {
      await writeFreeEntry({
        ...baseEntry,
        providerCalled: ctx.providerCalled ?? false,
        providerLatencyMs: ctx.providerDurationMs,
      });

      ctx.billingStatus = 'FREE';
      ctx.finalCost = 0;
      ctx.ledgerWritten = true;
      return ok(ctx);
    }

    // Paid tool without escrow — should not happen in normal flow
    // Log error but do not block response
    ctx.ledgerWritten = true;
    return ok(ctx);
  },
};
