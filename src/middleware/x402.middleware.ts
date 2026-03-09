import type { Request, Response, NextFunction } from 'express';
import { decodePaymentSignatureHeader } from '@x402/core/http';
import { parsePaymentPayload, isPaymentPayloadV1 } from '@x402/core/schemas';
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { registerExactEvmScheme } from '@x402/evm/exact/server';
import { getX402Config } from '../config/x402.config';
import { logger } from '../config/logger';

let resourceServer: x402ResourceServer | null = null;

function getResourceServer(): x402ResourceServer {
  if (!resourceServer) {
    const cfg = getX402Config();
    const facilitator = new HTTPFacilitatorClient({ url: cfg.facilitatorUrl });
    resourceServer = new x402ResourceServer(facilitator);
    registerExactEvmScheme(resourceServer);
  }
  return resourceServer;
}

export function x402Middleware(req: Request, _res: Response, next: NextFunction): void {
  const paymentHeader =
    (req.headers['x-payment'] as string | undefined) ??
    (req.headers['payment-signature'] as string | undefined);

  if (!paymentHeader) {
    next();
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
    const err = Object.assign(new Error('Invalid x402 payment header'), {
      status: 400,
      code: 'bad_request',
    });
    throw err;
  }

  const parsed = parsePaymentPayload(decoded);
  if (!parsed.success) {
    log.warn(
      { requestId: req.requestId, errors: parsed.error.issues },
      'x402: payment payload validation failed',
    );
    const err = Object.assign(new Error('Invalid x402 payment payload'), {
      status: 400,
      code: 'bad_request',
    });
    throw err;
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
      amount: '0',
      payTo: cfg.paymentAddress,
      maxTimeoutSeconds: cfg.maxTimeoutSeconds,
      extra: {},
    };
  } else {
    requirements = {
      ...payload.accepted,
      extra: payload.accepted.extra ?? {},
    };
  }

  const server = getResourceServer();
  const result = await server.verifyPayment(payload as never, requirements as never);

  if (!result.isValid) {
    log.warn(
      { requestId: req.requestId, reason: result.invalidReason },
      'x402: payment verification failed',
    );
    const err = Object.assign(
      new Error(result.invalidMessage ?? result.invalidReason ?? 'Payment verification failed'),
      { status: 400, code: 'invalid_payment' },
    );
    throw err;
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
        amount: String(priceUsd),
        asset: cfg.usdcAddress,
        payTo: cfg.paymentAddress,
        maxTimeoutSeconds: cfg.maxTimeoutSeconds,
        extra: {},
      },
    ],
    request_id: requestId,
    price_usd: String(priceUsd),
    payment_address: cfg.paymentAddress,
    price_version: priceVersion,
  };
}
