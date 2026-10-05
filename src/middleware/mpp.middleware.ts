import type { Request, Response, NextFunction } from 'express';
import { getMppConfig } from '../config/mpp.config';
import { getToolPriceUsd } from '../pipeline/stages/tool-status.stage';
import { logger } from '../config/logger';
import { AppError, ErrorCode } from '../types/errors';

/**
 * F1/C-5 (2026-09-01): resolve the REAL on-chain payer address, not a stub.
 * Before this, req.mppPayment.payer/txHash were hardcoded to the literal
 * strings 'tempo-agent' / 'mpp-verified' — no refund-owed alert (see
 * escrow-finalize.stage.ts) could ever say who to pay back. Reads the
 * Payment-Receipt header mppx already returns on a successful charge (the tx
 * hash), then looks up that transaction ON-CHAIN via a read-only RPC call to
 * get its real `from` address — trusting on-chain truth, not anything the
 * client could put in a header itself. Read-only: this never signs or sends
 * anything; it only ever discovers whose money it already took.
 */
export async function resolveRealPayer(chargeResult: {
  status: number;
  withReceipt(response: globalThis.Response): globalThis.Response;
}): Promise<{ payer: string; txHash: string }> {
  const FALLBACK = { payer: 'unknown-mpp-payer', txHash: 'unknown' };
  try {
    const { Receipt } = await import('mppx');
    // The mppx handler result is NOT a Response: the receipt header lives on
    // result.withReceipt(response), same as mppx's own express adapter.
    const receipt = Receipt.fromResponse(chargeResult.withReceipt(new globalThis.Response()));
    const txHash = receipt.reference;
    if (!txHash || !txHash.startsWith('0x')) return FALLBACK;

    const { createPublicClient, http } = await import('viem');
    const cfg = getMppConfig();
    const client = createPublicClient({ transport: http(cfg.rpcUrl) });
    const tx = await client.getTransaction({ hash: txHash as `0x${string}` });
    return { payer: tx.from, txHash };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "mpp: could not resolve real payer address — refund-owed alerts for this charge will show 'unknown-mpp-payer' and need manual on-chain lookup",
    );
    return FALLBACK;
  }
}

/**
 * Match REST tool-call URL: /api/v1/tools/{toolId}/call (with optional
 * trailing slash and ignoring any query string). Captures `toolId`. Returns
 * undefined for non-tool routes (e.g. /mcp, /agents/me, /onboard).
 */
const TOOL_CALL_URL = /^\/api\/v1\/tools\/([^/]+)\/call\/?$/;
function toolIdFromUrl(originalUrl: string): string | undefined {
  const path = originalUrl.split('?')[0];
  const m = TOOL_CALL_URL.exec(path);
  return m?.[1];
}

/**
 * Resolve the amount the MPP HMAC was signed over. Agents sign over the tool
 * price — server must reconstruct the same value. Returns undefined when the
 * URL has no MPP price (not a tool-call URL, or unknown toolId): mppx settles
 * on-chain inside charge() and cannot undo it, so we must never call charge()
 * without a known price (T-0256).
 */
function resolveAmountForUrl(originalUrl: string): string | undefined {
  const toolId = toolIdFromUrl(originalUrl);
  if (!toolId) return undefined;
  const price = getToolPriceUsd(toolId);
  return price === undefined ? undefined : String(price);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mppxInstance: any = null;
let initPromise: Promise<void> | null = null;
let initFailed = false;

async function ensureMppx(): Promise<void> {
  if (mppxInstance) return;
  const cfg = getMppConfig();
  if (!cfg.enabled) return;

  const { Mppx, tempo } = await import('mppx/server');
  const { privateKeyToAccount } = await import('viem/accounts');
  const account = privateKeyToAccount(cfg.privateKey as `0x${string}`);
  const params = {
    account,
    currency: cfg.usdcAddress,
    recipient: cfg.walletAddress as `0x${string}`,
  };

  mppxInstance = Mppx.create({
    methods: [tempo.charge(params), tempo.session(params)],
    secretKey: cfg.secretKey,
    realm: cfg.realm,
  });
}

function getMppxInstance() {
  if (initFailed) return Promise.resolve(null);
  if (!initPromise) {
    initPromise = ensureMppx().catch((err) => {
      initFailed = true;
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'mpp: failed to initialize mppx — MPP disabled until process restart with valid config',
      );
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
  if (!cfg.enabled) {
    next();
    return;
  }

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
  const authHeader = req.headers['authorization'] as string;
  const amount = resolveAmountForUrl(req.originalUrl);
  if (amount === undefined) {
    throw new AppError(
      ErrorCode.BAD_REQUEST,
      'MPP credentials are accepted only on POST /api/v1/tools/{tool_id}/call — the route that issued the challenge. This route has no MPP price; use x402 (X-Payment) or an API key here.',
    );
  }

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
    // Use the Mppx charge handler directly with Fetch Request.
    // The charge handler checks the credential HMAC against our secretKey;
    // crucially, the HMAC message includes `amount`, so we MUST pass the
    // tool's actual price (matching what the agent signed). Routes without a
    // known price were rejected above, before any on-chain settlement.
    const chargeHandler = mppx.charge({ amount });
    const result = await chargeHandler(fetchReq);

    if (result.status === 402) {
      log.warn(
        { requestId: req.requestId, originalUrl: req.originalUrl, amount },
        'mpp: credential HMAC verification failed',
      );
      throw new AppError(ErrorCode.BAD_REQUEST, 'MPP payment verification failed');
    }

    // Payment verified — resolve who actually paid (on-chain truth, not a stub).
    const { payer, txHash } = await resolveRealPayer(result);
    req.mppPayment = {
      verified: true,
      payer,
      amount,
      txHash,
      method: 'tempo',
      header: authHeader,
    };

    log.info({ requestId: req.requestId, method: 'tempo', payer, txHash }, 'mpp: payment verified');
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.error(
      { requestId: req.requestId, err: err instanceof Error ? err.message : String(err) },
      'mpp: payment verification threw exception',
    );
    const errMsg = err instanceof Error ? err.message : String(err);
    const userMessage =
      errMsg.includes('TIP20') || errMsg.includes('balance') || errMsg.includes('insufficient')
        ? 'MPP payment failed: insufficient Tempo USDC balance. Fund your Tempo wallet and retry.'
        : `MPP payment verification failed: ${errMsg.slice(0, 100)}`;
    throw new AppError(ErrorCode.BAD_REQUEST, userMessage);
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
