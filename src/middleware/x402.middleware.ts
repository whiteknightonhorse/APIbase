import type { Request, Response, NextFunction } from 'express';
import { decodePaymentSignatureHeader } from '@x402/core/http';
import { parsePaymentPayload } from '@x402/core/schemas';
import { getX402Config, toMicroUsdc } from '../config/x402.config';
import { logger } from '../config/logger';
import { AppError, ErrorCode } from '../types/errors';
import { resolveX402PaymentHeader } from '../config/http-headers';

export function x402Middleware(req: Request, _res: Response, next: NextFunction): void {
  const paymentHeader = resolveX402PaymentHeader(req.headers);

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

/**
 * The one place `/api/v1/tools/${toolId}/call` is templated (T-0187B3): every
 * real 402's resource.url must name the absolute URL that, called again,
 * produces the identical challenge — not a relative/non-callable stand-in.
 */
export function toolCallResourceUrl(host: string, toolId: string): string {
  return `https://${host}/api/v1/tools/${toolId}/call`;
}

export function buildPaymentRequiredResponse(
  toolId: string,
  priceUsd: number,
  priceVersion: number,
  requestId: string,
  host: string,
): Record<string, unknown> {
  const cfg = getX402Config();
  return {
    x402Version: 2,
    error: 'payment_required',
    resource: {
      url: toolCallResourceUrl(host, toolId),
      mimeType: 'application/json',
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
