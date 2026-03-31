import { decodePaymentSignatureHeader } from '@x402/core/http';
import { parsePaymentPayload, isPaymentPayloadV1 } from '@x402/core/schemas';
import { getX402Config } from '../../config/x402.config';
import { getSharedResourceServer } from '../../services/x402-server.service';
import { logger } from '../../config/logger';
import type { PipelineContext } from '../types';

/**
 * Settle x402 on-chain payment after successful provider call (§8.9).
 * Best-effort: failure logs a warning but does NOT abort the pipeline.
 * The payment was already verified in middleware, provider was already called,
 * and the agent received their data — settlement failure is a revenue leak,
 * not a user-facing error.
 */
export async function settleX402(ctx: PipelineContext): Promise<void> {
  if (!ctx.x402PaymentHeader) return;

  try {
    const decoded = decodePaymentSignatureHeader(ctx.x402PaymentHeader);
    const parsed = parsePaymentPayload(decoded);

    if (!parsed.success) {
      logger.warn({ requestId: ctx.requestId }, 'x402 settle: failed to re-parse payment payload');
      return;
    }

    const payload = parsed.data;
    const cfg = getX402Config();

    let requirements: {
      scheme: string;
      network: string;
      asset: string;
      amount: string;
      payTo: string;
      maxTimeoutSeconds: number;
      extra: Record<string, unknown>;
    };

    if (isPaymentPayloadV1(payload)) {
      requirements = {
        scheme: payload.scheme,
        network: payload.network,
        asset: cfg.usdcAddress,
        amount: String(Math.round((ctx.toolPrice ?? 0) * 1_000_000)),
        payTo: cfg.paymentAddress,
        maxTimeoutSeconds: cfg.maxTimeoutSeconds,
        extra: { name: 'USD Coin', version: '2' },
      };
    } else {
      requirements = {
        ...payload.accepted,
        extra: payload.accepted.extra ?? {},
      };
    }

    const server = getSharedResourceServer();
    const result = await server.settlePayment(payload as never, requirements as never);

    if (result.success) {
      logger.info(
        { requestId: ctx.requestId, payer: ctx.x402Payer },
        'x402 settle: payment settled successfully',
      );
    } else {
      logger.warn(
        { requestId: ctx.requestId, payer: ctx.x402Payer, error: result.errorMessage },
        'x402 settle: settlement returned failure',
      );
    }
  } catch (error) {
    logger.warn(
      { requestId: ctx.requestId, error: (error as Error).message },
      'x402 settle: settlement call failed (best-effort)',
    );
  }
}
