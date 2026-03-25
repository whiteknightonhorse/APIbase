import type { Request, Response, NextFunction } from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getMppConfig } from '../config/mpp.config';
import { logger } from '../config/logger';
import { AppError, ErrorCode } from '../types/errors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mppxInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let nodeListener: ((req: IncomingMessage, res: ServerResponse) => Promise<any>) | null = null;
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

  // Create a NodeListener that handles the full charge flow correctly
  nodeListener = Mppx.toNodeListener(mppxInstance.charge({ amount: '0.001' }));
}

function getMppxInstance() {
  if (!initPromise) {
    initPromise = ensureMppx().catch((err) => {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'mpp: failed to initialize mppx');
      initPromise = null;
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

  // Use mppx/server Fetch API directly with proper https URL
  const url = `https://${req.get('host')}${req.originalUrl}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
  }

  // Include body if present
  let bodyStr: string | undefined;
  if (req.body && typeof req.body === 'object') {
    bodyStr = JSON.stringify(req.body);
  }

  const fetchReq = new globalThis.Request(url, {
    method: req.method,
    headers,
    body: bodyStr,
  });

  try {
    // Use the Mppx charge handler directly with Fetch Request
    // The charge handler checks the credential HMAC against our secretKey
    const chargeHandler = mppx.charge({ amount: '0.001' });
    const result = await chargeHandler(fetchReq);

    if (result.status === 402) {
      log.warn({ requestId: req.requestId }, 'mpp: credential HMAC verification failed');
      throw new AppError(ErrorCode.BAD_REQUEST, 'MPP payment verification failed');
    }

    // Payment verified
    req.mppPayment = {
      verified: true,
      payer: 'tempo-agent',
      amount: '0',
      txHash: 'mpp-verified',
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
 * Uses https:// URL to match what external clients see.
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
    // Ensure URL uses https (server is behind Nginx)
    const httpsUrl = requestUrl.replace(/^http:/, 'https:');
    const fetchReq = new globalThis.Request(httpsUrl, { method: 'POST' });
    const result = await mppx.charge({ amount: String(priceUsd) })(fetchReq);

    if (result.status === 402) {
      return result.challenge.headers.get('WWW-Authenticate');
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), toolId },
      'mpp: failed to generate challenge header',
    );
  }
  return null;
}
