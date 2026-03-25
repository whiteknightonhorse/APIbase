import type { Request, Response, NextFunction } from 'express';
import { getMppConfig } from '../config/mpp.config';
import { logger } from '../config/logger';
import { AppError, ErrorCode } from '../types/errors';

// Lazy-initialized mppx server instance (ESM dynamic import)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mppxInstance: any = null;
let initPromise: Promise<void> | null = null;

async function ensureMppx(): Promise<void> {
  if (mppxInstance) return;
  const cfg = getMppConfig();
  if (!cfg.enabled) return;

  const { Mppx, tempo } = await import('mppx/server');
  mppxInstance = Mppx.create({
    methods: [
      tempo({
        currency: cfg.usdcAddress,
        recipient: cfg.walletAddress,
      }),
    ],
    secretKey: cfg.secretKey,
    realm: cfg.realm,
  });
}

function getMppxInstance() {
  if (!initPromise) {
    initPromise = ensureMppx().catch((err) => {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'mpp: failed to initialize mppx');
      initPromise = null; // allow retry
    });
  }
  return initPromise.then(() => mppxInstance);
}

/**
 * Express middleware that intercepts `Authorization: Payment ...` header
 * and verifies MPP (Tempo) payment credentials.
 *
 * Runs ALONGSIDE x402 middleware — they check different headers.
 */
export function mppMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const cfg = getMppConfig();
  if (!cfg.enabled) { next(); return; }

  const authHeader = req.headers['authorization'] as string | undefined;
  if (!authHeader || !authHeader.startsWith('Payment ')) {
    next();
    return;
  }

  // Validate credential is not empty
  const credential = authHeader.substring('Payment '.length).trim();
  if (!credential) {
    next(new AppError(ErrorCode.BAD_REQUEST, 'MPP payment credential must not be empty'));
    return;
  }

  verifyMppPayment(req)
    .then(() => next())
    .catch(next);
}

async function verifyMppPayment(req: Request): Promise<void> {
  const log = req.log ?? logger;
  const mppx = await getMppxInstance();

  if (!mppx) {
    throw new AppError(ErrorCode.BAD_GATEWAY, 'MPP payment system not available');
  }

  // Convert Express request to Fetch API Request for mppx
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
  }

  const fetchReq = new globalThis.Request(url, {
    method: req.method,
    headers,
  });

  try {
    // mppx.charge returns a handler that takes a Request.
    // If Authorization: Payment is present and valid, status=200.
    // If missing/invalid, status=402.
    // We use a minimal charge to just trigger verification.
    const result = await mppx.charge({ amount: '0.001' })(fetchReq);

    if (result.status === 402) {
      // Payment credential was present but invalid
      log.warn({ requestId: req.requestId }, 'mpp: payment credential invalid or insufficient');
      throw new AppError(ErrorCode.BAD_REQUEST, 'MPP payment verification failed');
    }

    // Payment verified — extract payer info from receipt
    const receipt = result.challenge?.headers?.get('Payment-Receipt') ?? '';

    req.mppPayment = {
      verified: true,
      payer: 'tempo-agent', // mppx doesn't expose payer address directly in this flow
      amount: '0',
      txHash: receipt ? 'mpp-verified' : '',
      method: 'tempo',
    };

    log.info(
      { requestId: req.requestId, method: 'tempo' },
      'mpp: payment verified',
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.error(
      { requestId: req.requestId, err: err instanceof Error ? err.message : String(err) },
      'mpp: payment verification threw exception',
    );
    throw new AppError(ErrorCode.BAD_GATEWAY, 'MPP payment verification failed');
  }
}

/**
 * Build MPP `WWW-Authenticate: Payment` header for 402 responses.
 * Returns null if MPP is disabled.
 */
export async function buildMppChallengeHeader(
  toolId: string,
  priceUsd: number,
  requestUrl: string,
): Promise<string | null> {
  const cfg = getMppConfig();
  if (!cfg.enabled) return null;

  const mppx = await getMppxInstance();
  if (!mppx) return null;

  try {
    // Create a fake request to generate the 402 challenge
    const fetchReq = new globalThis.Request(requestUrl, { method: 'POST' });
    const result = await mppx.charge({ amount: String(priceUsd) })(fetchReq);

    if (result.status === 402) {
      const wwwAuth = result.challenge.headers.get('WWW-Authenticate');
      return wwwAuth;
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), toolId },
      'mpp: failed to generate challenge header',
    );
  }
  return null;
}
