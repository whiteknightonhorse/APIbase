import type { Request, Response, NextFunction } from 'express';
import { decodePaymentSignatureHeader } from '@x402/core/http';
import { parsePaymentPayload, isPaymentPayloadV1 } from '@x402/core/schemas';
import { getX402Config } from '../config/x402.config';
import { getSharedResourceServer } from '../services/x402-server.service';
import { logger } from '../config/logger';
import { AppError, ErrorCode } from '../types/errors';

export function x402Middleware(req: Request, _res: Response, next: NextFunction): void {
  const paymentHeader =
    (req.headers['x-payment'] as string | undefined) ??
    (req.headers['payment-signature'] as string | undefined);

  if (paymentHeader === undefined) {
    next();
    return;
  }
  if (paymentHeader.trim() === '') {
    next(new AppError(ErrorCode.BAD_REQUEST, 'X-Payment header must not be empty'));
    return;
  }

  verifyPayment(req, paymentHeader)
    .then(() => next())
    .catch(next);
}

async function verifyPayment(req: Request, paymentHeader: string): Promise<void> {
  const log = req.log ?? logger;

  let decoded: unknown;
  try {
    decoded = decodePaymentSignatureHeader(paymentHeader);
  } catch {
    log.warn({ requestId: req.requestId }, 'x402: failed to decode payment header');
    throw new AppError(ErrorCode.BAD_REQUEST, 'Invalid x402 payment header');
  }

  const parsed = parsePaymentPayload(decoded);
  if (!parsed.success) {
    log.warn(
      { requestId: req.requestId, errors: parsed.error.issues },
      'x402: payment payload validation failed',
    );
    throw new AppError(ErrorCode.BAD_REQUEST, 'Invalid x402 payment payload');
  }

  const payload = parsed.data;

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
    const cfg = getX402Config();
    requirements = {
      scheme: payload.scheme,
      network: payload.network,
      asset: cfg.usdcAddress,
      amount: '1',
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
  let result;
  try {
    result = await server.verifyPayment(payload as never, requirements as never);
  } catch (verifyErr) {
    log.error(
      {
        requestId: req.requestId,
        err: verifyErr instanceof Error ? verifyErr.message : String(verifyErr),
      },
      'x402: payment verification threw exception',
    );
    throw new AppError(ErrorCode.BAD_GATEWAY, 'Payment facilitator unavailable');
  }

  if (!result.isValid) {
    log.warn(
      { requestId: req.requestId, reason: result.invalidReason },
      'x402: payment verification failed',
    );
    throw new AppError(
      ErrorCode.BAD_REQUEST,
      result.invalidMessage ?? result.invalidReason ?? 'Payment verification failed',
    );
  }

  req.x402Payment = {
    verified: true,
    payer: result.payer ?? 'unknown',
    amount: 'amount' in requirements ? requirements.amount : '0',
    network: 'network' in requirements ? requirements.network : getX402Config().network,
    scheme: 'scheme' in requirements ? requirements.scheme : 'exact',
  };

  log.info(
    { requestId: req.requestId, payer: req.x402Payment.payer, scheme: req.x402Payment.scheme },
    'x402: payment verified',
  );
}

export function buildPaymentRequiredResponse(
  toolId: string,
  priceUsd: number,
  priceVersion: number,
  requestId: string,
): Record<string, unknown> {
  const cfg = getX402Config();
  return {
    x402Version: 2,
    error: 'payment_required',
    resource: {
      url: `/api/v1/tools/${toolId}`,
      description: `Tool invocation: ${toolId}`,
    },
    accepts: [
      {
        scheme: 'exact',
        network: cfg.network,
        amount: String(Math.round(priceUsd * 1_000_000)),
        asset: cfg.usdcAddress,
        payTo: cfg.paymentAddress,
        maxTimeoutSeconds: cfg.maxTimeoutSeconds,
        extra: { name: 'USD Coin', version: '2' },
      },
    ],
    request_id: requestId,
    error_code: 'PAYMENT_REQUIRED',
    suggested_action: 'add_payment',
    documentation_url: 'https://apibase.pro/frameworks#rest',
    price_usd: String(priceUsd),
    payment_address: cfg.paymentAddress,
    price_version: priceVersion,
  };
}
