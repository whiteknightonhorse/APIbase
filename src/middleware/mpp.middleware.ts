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

/** What `mppx.charge()` is called with (T-INT-10: an order quote adds recipient/memo/splits). */
interface ChargeParams {
  amount: string;
  recipient?: string;
  memo?: string;
  splits?: Array<{ recipient: string; amount: string }>;
}

/** POST|GET /api/v1/shop/quotes/:id/pay — the only MPP route of an order (§6.3). */
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const QUOTE_PAY_URL = new RegExp(`^/api/v1/shop/quotes/(${UUID})/pay/?$`, 'i');

/**
 * Resolve what the MPP HMAC was signed over. Agents sign over the tool
 * price — server must reconstruct the same value. A quote pay URL takes
 * amount/recipient/splits/memo from the quote row in PG (server data only, F-5).
 * Returns undefined when the URL has no MPP price (not a tool-call/quote-pay
 * URL, or unknown toolId): mppx settles on-chain inside charge() and cannot
 * undo it, so we must never call charge() without a known price (T-0256).
 */
async function resolveAmountForUrl(originalUrl: string): Promise<ChargeParams | undefined> {
  const quoteId = QUOTE_PAY_URL.exec(originalUrl.split('?')[0])?.[1];
  if (quoteId) return quoteChargeParams(await loadQuoteRow(quoteId));
  const toolId = toolIdFromUrl(originalUrl);
  if (!toolId) return undefined;
  const price = getToolPriceUsd(toolId);
  return price === undefined ? undefined : { amount: String(price) };
}

interface QuoteRow {
  quote_id: string;
  status: string;
  expires_at: Date;
  total_usd: number;
  fee_usd: number;
  rails_offered: string[];
  payout_wallet_base: string;
  payout_wallet_tempo: string;
  payout_pending: { rail: 'base' | 'tempo'; wallet: string; effective_at: string } | null;
  mpp_challenge_id: string | null;
  mpp_challenge_expires_at: Date | null;
  mpp_challenge_header: string | null;
}

async function loadQuoteRow(quoteId: string): Promise<QuoteRow> {
  let rows: QuoteRow[];
  try {
    const { getPrisma } = await import('../services/prisma.service');
    rows = (await getPrisma().$queryRawUnsafe(
      `SELECT q.quote_id, q.status, q.expires_at, q.total_usd::float8 AS total_usd,
              q.fee_usd::float8 AS fee_usd, q.rails_offered, q.mpp_challenge_id,
              q.mpp_challenge_expires_at, q.mpp_challenge_header,
              m.payout_wallet_base, m.payout_wallet_tempo, m.payout_pending
         FROM shop_quotes q JOIN shop_merchants m ON m.merchant_id = q.merchant_id
        WHERE q.quote_id = $1::uuid`,
      quoteId,
    )) as QuoteRow[];
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, 'mpp: quote lookup');
    throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'Quote lookup unavailable', 2);
  }
  if (!rows[0]) throw new AppError(ErrorCode.NOT_FOUND, 'quote not found');
  return rows[0];
}

/** Tempo memo is bytes32: 16 zero bytes + the 16 bytes of the quote UUID (reversible). */
export function quoteMemo(quoteId: string): `0x${string}` {
  return `0x${'0'.repeat(32)}${quoteId.replace(/-/g, '').toLowerCase()}`;
}

/** F-5: recipient = payout_wallet_tempo, amount = total, splits only with the integrator fee on. */
async function quoteChargeParams(q: QuoteRow): Promise<ChargeParams> {
  if (!q.rails_offered.includes('tempo')) {
    throw new AppError(ErrorCode.BAD_REQUEST, 'This quote is not payable with MPP (Tempo).');
  }
  const { currentPayout } = await import('../shop/auth/identity.service');
  const { integratorConfig } = await import('../shop/quote.service');
  const feeWallet = process.env['INTEGRATOR_FEE_WALLET'];
  const withFee = q.fee_usd > 0 && integratorConfig().fee_enabled;
  return {
    amount: String(q.total_usd),
    recipient: currentPayout(q, 'tempo'),
    memo: quoteMemo(q.quote_id),
    ...(withFee && feeWallet
      ? { splits: [{ recipient: feeWallet, amount: String(q.fee_usd) }] }
      : {}),
  };
}

/**
 * §8.1 item 7(b): one MPP settlement per quote at a time — Redis SET NX, 60 s. Returns the
 * release function, or null when somebody else holds it. Redis down -> 503 (fail closed).
 */
const QUOTE_LOCK_TTL_SECONDS = 60;
async function acquireQuoteLock(quoteId: string): Promise<(() => void) | null> {
  const key = `quote:${quoteId}:paying`;
  try {
    const { ensureRedisConnected } = await import('../services/redis.service');
    const redis = await ensureRedisConnected();
    if ((await redis.set(key, '1', 'EX', QUOTE_LOCK_TTL_SECONDS, 'NX')) !== 'OK') return null;
    return () => void redis.del(key).catch(() => undefined);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      'mpp: quote lock store unavailable — failing closed',
    );
    throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'Payment lock unavailable', 2);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mppxInstance: any = null;
let initPromise: Promise<void> | null = null;
let initFailed = false;

async function ensureMppx(): Promise<void> {
  if (mppxInstance) return;
  const cfg = getMppConfig();
  if (!cfg.enabled) return;

  const { Mppx, tempo, Store } = await import('mppx/server');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { getSharedRedis } = await import('../services/redis.service');
  const { atomicRedisAdapter } = await import('../services/mppx-redis-store');
  const account = privateKeyToAccount(cfg.privateKey as `0x${string}`);
  const store = Store.redis(atomicRedisAdapter(getSharedRedis()));
  if (typeof store.update !== 'function') {
    throw new Error('mppx store has no atomic update — refusing to start MPP');
  }
  const params = {
    account,
    currency: cfg.usdcAddress,
    recipient: cfg.walletAddress as `0x${string}`,
    // T-0257: replay store shared across processes and surviving restarts
    // (default is Store.memory()). Failure mode: if Redis is unavailable,
    // mppx's store get/put throws -> caught in verifyMppPayment -> 400
    // (fail-closed; consistent with the 503 on ESCROW when Redis is down).
    // T-0268: replay guard needs store.update(); ioredis has none -> CAS adapter.
    store,
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
export function mppMiddleware(req: Request, res: Response, next: NextFunction): void {
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

  verifyMppPayment(req, res)
    .then((proceed) => {
      if (proceed) next();
    })
    .catch(next);
}

/** Resolves false when the response was already sent (409 quote_already_paying). */
async function verifyMppPayment(req: Request, res: Response): Promise<boolean> {
  const params = await resolveAmountForUrl(req.originalUrl);
  if (params === undefined) {
    throw new AppError(
      ErrorCode.BAD_REQUEST,
      'MPP credentials are accepted only on POST /api/v1/tools/{tool_id}/call — the route that issued the challenge. This route has no MPP price; use x402 (X-Payment) or an API key here.',
    );
  }

  const quoteId = QUOTE_PAY_URL.exec(req.originalUrl.split('?')[0])?.[1];
  if (!quoteId) {
    await chargeAndRecord(req, params);
    return true;
  }
  // GET /quotes/:id/pay only ever returns the challenge (§6.3): a credential is not settled here.
  if (req.method === 'GET') return true;

  const release = await acquireQuoteLock(quoteId);
  const conflict = () => {
    res.status(409).json({
      error: 'conflict',
      error_code: 'quote_already_paying',
      message: 'A payment for this quote is already in progress, or the quote is no longer open.',
      request_id: req.requestId,
      suggested_action: 'retry_after_delay',
    });
    return false;
  };
  if (!release) return conflict();
  try {
    // Re-read AFTER the lock: the previous holder may have just finished (quote 'paid').
    if ((await loadQuoteRow(quoteId)).status !== 'open') {
      release();
      return conflict();
    }
    await chargeAndRecord(req, params);
  } catch (err) {
    release();
    throw err;
  }
  // The lock covers the rest of the request (pipeline, settle): released when it closes.
  res.once('close', release);
  return true;
}

async function chargeAndRecord(req: Request, params: ChargeParams): Promise<void> {
  const log = req.log ?? logger;
  const authHeader = req.headers['authorization'] as string;
  const { amount } = params;
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
    const chargeHandler = mppx.charge(params);
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
      ...(params.recipient ? { recipient: params.recipient, splits: params.splits ?? [] } : {}),
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
  quoteParams?: Omit<ChargeParams, 'amount'>,
): Promise<string | null> {
  const cfg = getMppConfig();
  if (!cfg.enabled) return null;

  const mppx = await getMppxInstance();
  if (!mppx) return null;

  try {
    // Ensure URL uses https (server is behind Nginx)
    const httpsUrl = requestUrl.replace(/^http:/, 'https:');
    const fetchReq = new globalThis.Request(httpsUrl, { method: 'POST' });
    const result = await mppx.charge({ amount: String(priceUsd), ...quoteParams })(fetchReq);

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

const CHALLENGE_TTL_MS = 5 * 60_000; // mppx default challenge lifetime

/**
 * §8.1 item 7(a): ONE challenge per quote. While the stored one is unexpired it is returned
 * byte for byte (a repeated 402 / GET must not mint a second payable challenge); afterwards a
 * new one is built with the same memo. Returns null when MPP is off / the quote is not payable.
 */
export async function quoteMppChallengeHeader(
  quoteId: string,
  requestUrl: string,
  now: number = Date.now(),
): Promise<string | null> {
  const q = await loadQuoteRow(quoteId);
  if (
    q.mpp_challenge_header &&
    q.mpp_challenge_expires_at &&
    new Date(q.mpp_challenge_expires_at).getTime() > now
  ) {
    return q.mpp_challenge_header;
  }
  const { amount, ...rest } = await quoteChargeParams(q);
  const header = await buildMppChallengeHeader('shop.order.pay', Number(amount), requestUrl, rest);
  if (!header) return null;
  const id = /\bid="([^"]+)"/.exec(header)?.[1] ?? null;
  const exp = /\bexpires="([^"]+)"/.exec(header)?.[1];
  const expiresAt = new Date(
    exp && Number.isFinite(Date.parse(exp)) ? Date.parse(exp) : now + CHALLENGE_TTL_MS,
  );
  const { getPrisma } = await import('../services/prisma.service');
  // Concurrent first requests: only the one that still sees the old id wins; the loser re-reads.
  const won = await getPrisma().$executeRawUnsafe(
    `UPDATE shop_quotes SET mpp_challenge_id = $2, mpp_challenge_expires_at = $3,
            mpp_challenge_header = $4
      WHERE quote_id = $1::uuid AND mpp_challenge_id IS NOT DISTINCT FROM $5`,
    quoteId,
    id,
    expiresAt,
    header,
    q.mpp_challenge_id,
  );
  if (won === 0) return (await loadQuoteRow(quoteId)).mpp_challenge_header ?? header;
  return header;
}
