import type { Request, Response, NextFunction } from 'express';
import { decodePaymentSignatureHeader } from '@x402/core/http';
import { parsePaymentPayload } from '@x402/core/schemas';
import { getX402Config, toMicroUsdc } from '../config/x402.config';
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

  // STRUCTURAL VALIDATION ONLY. The authoritative payment binding — verifying
  // the signed authorization against SERVER-trusted requirements (payTo, asset,
  // network, and the tool's REAL price) — happens in the ESCROW pipeline stage,
  // the only place the per-tool price is known (the /mcp toolId lives in the
  // JSON-RPC body, not the URL). Verifying here against the client-supplied
  // `payload.accepted` is exactly the bypass reported in issue #103, so we do
  // NOT do it. `verified` below means "payment intent present & well-formed",
  // NOT "cryptographically bound" — ESCROW makes the money decision and sets
  // the real payer.
  req.x402Payment = {
    verified: true,
    payer: 'pending',
    amount: '0',
    network: '',
    scheme: 'exact',
  };

  log.info(
    { requestId: req.requestId },
    'x402: payment header accepted (binding enforced in ESCROW)',
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
        amount: toMicroUsdc(priceUsd),
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
    /**
     * Minimum on-chain USDC balance an agent should hold to call this tool
     * successfully. Equals price_usd today (cache-hit pays full sticker via
     * payment rail; cache discount applies only to balance-tier agents).
     * Agents can short-circuit signing if their wallet balance < this value.
     */
    min_balance_usd: String(priceUsd),
    payment_address: cfg.paymentAddress,
    price_version: priceVersion,
  };
}
