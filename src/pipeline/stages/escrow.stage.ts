import {
  type Stage,
  type PipelineError,
  type PipelineContext,
  type Result,
  ok,
  err,
} from '../types';
import { reserve, InsufficientFundsError } from '../../services/escrow.service';
import { logger } from '../../config/logger';
import { getX402Config, buildServerX402Requirements } from '../../config/x402.config';
import { getSharedResourceServer } from '../../services/x402-server.service';
import { decodePaymentSignatureHeader } from '@x402/core/http';
import { parsePaymentPayload } from '@x402/core/schemas';

/**
 * Authoritative x402 payment binding (issue #103).
 *
 * The middleware only structurally validates the X-Payment header. Here — the
 * first stage where the tool's real price is known (set by TOOL_STATUS) and
 * which runs for BOTH REST and MCP, on cache hits and misses — we verify the
 * signed authorization against SERVER-trusted requirements (payTo, asset,
 * network, exact amount). The facilitator's exact scheme rejects any mismatch
 * (recipient_mismatch / value_mismatch / network_mismatch), so a client cannot
 * underpay or redirect funds and still receive paid data.
 */
async function verifyX402Binding(
  ctx: PipelineContext,
  priceUsd: number,
): Promise<Result<PipelineContext, PipelineError>> {
  const x402Cfg = getX402Config();
  const reject = (reason: string): Result<PipelineContext, PipelineError> => {
    logger.warn(
      { toolId: ctx.toolId, requestId: ctx.requestId, reason },
      'x402 binding: payment not bound to server requirements — rejecting',
    );
    return err<PipelineError>({
      code: 402,
      error: 'payment_required',
      message: `This tool costs $${priceUsd}. Provide a valid x402 (X-Payment header) payment for the exact amount.`,
      extra: {
        price_usd: priceUsd,
        payment_address: x402Cfg.paymentAddress,
        price_version: 1,
      },
    });
  };

  if (!ctx.x402PaymentHeader) {
    return reject('missing_header');
  }

  let payload: unknown;
  try {
    const decoded = decodePaymentSignatureHeader(ctx.x402PaymentHeader);
    const parsed = parsePaymentPayload(decoded);
    if (!parsed.success) return reject('parse_failed');
    payload = parsed.data;
  } catch {
    return reject('decode_failed');
  }

  const requirements = buildServerX402Requirements(priceUsd);
  let result;
  try {
    result = await getSharedResourceServer().verifyPayment(payload as never, requirements as never);
  } catch (verifyErr) {
    // Facilitator unavailable — fail closed (never grant access on infra error).
    logger.error(
      {
        toolId: ctx.toolId,
        requestId: ctx.requestId,
        err: verifyErr instanceof Error ? verifyErr.message : String(verifyErr),
      },
      'x402 binding: verify threw — failing closed',
    );
    return err<PipelineError>({
      code: 502,
      error: 'bad_gateway',
      message: 'Payment facilitator unavailable',
    });
  }

  if (!result.isValid) {
    return reject(result.invalidReason ?? 'invalid');
  }

  // Authoritative payer for the ledger audit trail (§AP-9).
  ctx.x402Payer = result.payer ?? ctx.x402Payer ?? 'unknown';
  return ok(ctx);
}

/**
 * ESCROW stage (§12.43 stage 8, §12.154).
 * Reserve funds before provider call.
 * Skip on cache hit (§12.173: cache hits use direct charge, no escrow).
 */
export const escrowStage: Stage = {
  name: 'ESCROW',

  async execute(ctx) {
    // x402 on-chain payment — bind the signed authorization to SERVER-trusted
    // requirements (payTo/asset/network + the tool's real price) before granting
    // access (§8.6, issue #103). Free tools (price 0) need no payment.
    // On success: skip balance deduction (payment settles on-chain).
    if (ctx.x402Paid) {
      const price = ctx.toolPrice ?? 0;
      if (price > 0) {
        const bound = await verifyX402Binding(ctx, price);
        if (!bound.ok) return bound;
      }
      return ok(ctx);
    }

    // MPP payment verified by middleware (HMAC binds the exact amount) — skip
    // balance deduction (§8.6).
    if (ctx.mppPaid) {
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

    // Paid tool with no verified payment — require x402 or MPP signature (§8.6)
    // This enforces per-call payment on ALL channels (REST + MCP).
    // Without this, agents could bypass payment by using MCP with pre-funded balance.
    const x402Cfg = getX402Config();
    if (!ctx.x402Paid && !ctx.mppPaid) {
      logger.info(
        {
          agentId: ctx.agentId,
          toolId: ctx.toolId,
          cost,
          path: ctx.path,
          requestId: ctx.requestId,
        },
        'Payment required — no x402 or MPP payment verified',
      );
      return err<PipelineError>({
        code: 402,
        error: 'payment_required',
        message: `This tool costs $${cost}. Provide x402 (X-Payment header) or MPP (Authorization: Payment) payment.`,
        extra: {
          price_usd: cost,
          payment_address: x402Cfg.paymentAddress,
          price_version: 1,
        },
      });
    }

    // On-chain payment verified — record escrow for ledger tracking
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
