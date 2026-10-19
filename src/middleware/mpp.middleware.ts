import type { Request, Response, NextFunction } from 'express';
import { getMppConfig } from '../config/mpp.config';
import { resolveToolPriceUsd, schemaFailureStatus } from '../pricing/audio-minute';
import { getToolPriceUsd } from '../pipeline/stages/tool-status.stage';
import { logger } from '../config/logger';
import { AppError, ErrorCode } from '../types/errors';
import { bodySchemaFailure } from '../pipeline/precheck';

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
}): Promise<{ payer: string; txHash: string; asset: string }> {
  const cfgAsset = getMppConfig().usdcAddress;
  const FALLBACK = { payer: 'unknown-mpp-payer', txHash: 'unknown', asset: cfgAsset };
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
    // T-0426: the token the transfer actually moved (a Tempo tx carries its TIP-20 call in `calls`).
    const target =
      (tx as { to?: unknown; calls?: Array<{ to?: unknown }> }).to ??
      (tx as { calls?: Array<{ to?: unknown }> }).calls?.[0]?.to;
    const asset =
      typeof target === 'string' && /^0x[0-9a-fA-F]{40}$/.test(target) ? target : cfgAsset;
    return { payer: tx.from, txHash, asset };
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

/** What `mppx.charge()` is called with (T-INT-10: an order quote adds recipient/splits). */
interface ChargeParams {
  amount: string;
  chainId?: number;
  recipient?: string;
  splits?: Array<{ recipient: string; amount: string }>;
}

const TEMPO_TESTNET_CHAIN_ID = 42431;

/**
 * T-SHOP-B: the chainId every challenge is built with. mppx defaults to Tempo mainnet (4217)
 * when none is passed, so it is always passed explicitly. Fail closed: a testnet config whose
 * chainId is not the Tempo testnet must never issue a challenge (503, not a mainnet challenge).
 */
export function assertChallengeChainId(cfg: {
  testnet?: boolean;
  chainId?: number;
}): number | undefined {
  if (cfg.testnet === true && cfg.chainId !== TEMPO_TESTNET_CHAIN_ID) {
    logger.error(
      { chainId: cfg.chainId, expected: TEMPO_TESTNET_CHAIN_ID },
      'mpp: MPP_TESTNET=true but the challenge chainId is not the Tempo testnet — refusing to issue a challenge',
    );
    throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'MPP chain configuration invalid', 2);
  }
  return cfg.chainId;
}

/** POST|GET /api/v1/shop/quotes/:id/pay — the only MPP route of an order (§6.3). */
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const QUOTE_PAY_URL = new RegExp(`^/api/v1/shop/quotes/(${UUID})/pay/?$`, 'i');

/**
 * Resolve what the MPP HMAC was signed over. Agents sign over the tool
 * price — server must reconstruct the same value. A quote pay URL takes
 * amount/recipient/splits from the quote row in PG (server data only, F-5).
 * Returns undefined when the URL has no MPP price (not a tool-call/quote-pay
 * URL, or unknown toolId): mppx settles on-chain inside charge() and cannot
 * undo it, so we must never call charge() without a known price (T-0256).
 */
async function resolveAmountForUrl(
  originalUrl: string,
  body?: unknown,
): Promise<ChargeParams | undefined> {
  const quoteId = QUOTE_PAY_URL.exec(originalUrl.split('?')[0])?.[1];
  if (quoteId) return quoteChargeParams(await loadQuoteRow(quoteId));
  const toolId = toolIdFromUrl(originalUrl);
  if (!toolId) return undefined;
  const price = getToolPriceUsd(toolId);
  return price === undefined
    ? undefined
    : {
        amount: String(resolveToolPriceUsd(toolId, price, body)),
        chainId: assertChallengeChainId(getMppConfig()),
      };
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
    chainId: assertChallengeChainId(getMppConfig()),
    recipient: currentPayout(q, 'tempo'),
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
// T-0429: same secret/realm/store, but its challenges say header="Payment-Authorization" (mppx
// `requiresAuth`), so an agent keeps `Authorization: Bearer <api key>` and sends the credential
// separately. Used ONLY for /mcp challenges; credentials are verified by mppxInstance (the
// challenge id HMAC does not depend on the credential header).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mppxMcpInstance: any = null;
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
    chainId: assertChallengeChainId(cfg),
    // T-0426: the challenge advertises exactly ONE currency (never OUSD or another Tempo token).
    currencies: [cfg.usdcAddress],
    recipient: cfg.walletAddress as `0x${string}`,
    // T-0257: replay store shared across processes and surviving restarts
    // (default is Store.memory()). Failure mode: if Redis is unavailable,
    // mppx's store get/put throws -> caught in verifyMppPayment -> 400
    // (fail-closed; consistent with the 503 on ESCROW when Redis is down).
    // T-0268: replay guard needs store.update(); ioredis has none -> CAS adapter.
    store,
  };

  mppxInstance = Mppx.create({
    methods: [tempo.charge(params)],
    secretKey: cfg.secretKey,
    realm: cfg.realm,
  });
  mppxMcpInstance = Mppx.create({
    methods: [tempo.charge(params)],
    secretKey: cfg.secretKey,
    realm: cfg.realm,
    requiresAuth: true,
  });
}

function getMppxInstance(variant: 'default' | 'mcp' = 'default') {
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
  return initPromise.then(() => (variant === 'mcp' ? mppxMcpInstance : mppxInstance));
}

/** T-0429: the alternate MPP credential header (mppx >= 0.9 `requiresAuth`). */
export const PAYMENT_AUTHORIZATION = 'payment-authorization';

function paymentSchemeValue(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' && v.startsWith('Payment ') ? v : undefined;
}

/**
 * T-0429: the MPP credential (`Payment <cred>`), read from `Payment-Authorization` first, then
 * `Authorization` (mppx < 0.9 clients keep sending it there). A credential in BOTH is ambiguous
 * and refused with 400 before anything is charged. Undefined when there is no credential.
 */
export function resolveMppCredentialHeader(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const alt = paymentSchemeValue(headers[PAYMENT_AUTHORIZATION]);
  const std = paymentSchemeValue(headers['authorization']);
  if (alt !== undefined && std !== undefined) {
    throw new AppError(
      ErrorCode.BAD_REQUEST,
      'MPP credential sent in both Authorization and Payment-Authorization; send it in exactly one header.',
    );
  }
  return alt ?? std;
}

/**
 * Express middleware that intercepts `Payment-Authorization: Payment ...` or
 * `Authorization: Payment ...` header
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

  let authHeader: string | undefined;
  try {
    authHeader = resolveMppCredentialHeader(req.headers);
  } catch (err) {
    next(err);
    return;
  }
  if (authHeader === undefined) {
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

/** T-0282: true when a 400 was sent because the body fails the tool's zod schema (no charge). */
function rejectInvalidBody(req: Request, res: Response): boolean {
  const toolId = toolIdFromUrl(req.originalUrl);
  const failure = toolId ? bodySchemaFailure(toolId, req.body) : null;
  if (!toolId || !failure) return false;
  res
    .status(
      schemaFailureStatus(
        toolId,
        failure.issues.map((i) => i.path),
      ),
    )
    .json({
      error: 'schema_validation_failed',
      message: `Request body validation failed. Expected params: ${failure.expected_params.join(', ')}`,
      tool_id: toolId,
      issues: failure.issues,
      expected_params: failure.expected_params,
      received_params: failure.received_params,
      hint: `Fetch schema: GET /api/v1/tools/${toolId}`,
      request_id: req.requestId,
      charged: false,
    });
  return true;
}

/** Resolves false when the response was already sent (409 quote_already_paying, 400 schema). */
async function verifyMppPayment(req: Request, res: Response): Promise<boolean> {
  const params = await resolveAmountForUrl(req.originalUrl, req.body);
  if (params === undefined) {
    throw new AppError(
      ErrorCode.BAD_REQUEST,
      'MPP credentials are accepted only on the route that issued the challenge: POST /api/v1/tools/{tool_id}/call for API tools, POST /api/v1/shop/quotes/{id}/pay for shop orders (pay.mpp.url in the quote). This route has no MPP price; use x402 (X-Payment) or an API key here.',
      undefined,
      req.originalUrl.startsWith('/api/v1/shop/') ? '/integrator/docs#orders' : undefined,
    );
  }

  const quoteId = QUOTE_PAY_URL.exec(req.originalUrl.split('?')[0])?.[1];
  if (!quoteId) {
    // T-0282: charge() settles on-chain and cannot be undone, so reject a body our own
    // schema would refuse (400) BEFORE any money moves. Provider-side 422s are out of scope.
    if (rejectInvalidBody(req, res)) return false;
    return chargeAndRecord(req, res, params);
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
    const subscription = isSubscriptionIntent(req.query?.['intent'])
      ? await subscriptionCall(quoteId)
      : undefined;
    if (!(await chargeAndRecord(req, res, params, subscription))) {
      release();
      return false;
    }
  } catch (err) {
    release();
    throw err;
  }
  // The lock covers the rest of the request (pipeline, settle): released when it closes.
  res.once('close', release);
  return true;
}

/**
 * T-0426: settlement whose outcome mppx could not confirm (broadcast confirmation timeout,
 * PaymentOutcomeUnknownError). The money may have moved: 503 + ONE `mpp_settle_unknown` outbox
 * event for the operator digest (scripts/mpp-refund-owed-alerts.py); the outbox worker ignores it.
 */
function isSettleUnknown(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'PaymentOutcomeUnknownError') return true;
  return /confirmation timeout|timed out waiting for .*receipt|receipt.*timed out/i.test(
    err.message,
  );
}

async function recordSettleUnknown(
  req: Request,
  res: Response,
  params: ChargeParams,
  err: unknown,
): Promise<void> {
  const log = req.log ?? logger;
  const rawHash = (err as { transactionHash?: unknown } | null)?.transactionHash;
  const txHash = typeof rawHash === 'string' && rawHash.startsWith('0x') ? rawHash : undefined;
  log.error(
    { requestId: req.requestId, txHash, err: err instanceof Error ? err.message : String(err) },
    'mpp: settlement outcome unknown',
  );
  try {
    const { getPrisma } = await import('../services/prisma.service');
    await getPrisma().outbox.create({
      data: {
        event_type: 'mpp_settle_unknown',
        payload: {
          request_id: req.requestId,
          url: req.originalUrl,
          amount: params.amount,
          ...(txHash ? { tx_hash: txHash } : {}),
        },
      },
    });
  } catch (e) {
    log.error(
      { requestId: req.requestId, err: e instanceof Error ? e.message : String(e) },
      'mpp_settle_unknown event FAILED to write — check this payment on-chain manually',
    );
  }
  res.status(503).json({
    error: 'service_unavailable',
    error_code: 'mpp_settlement_unknown',
    retry_after: 30,
    ...(txHash ? { tx_hash: txHash } : {}),
    request_id: req.requestId,
    charged: false,
  });
}

/** Resolves true when the request is paid and may proceed; false when the reply was already sent. */
async function chargeAndRecord(
  req: Request,
  res: Response,
  params: ChargeParams,
  subscription?: SubscriptionCall,
): Promise<boolean> {
  const log = req.log ?? logger;
  // Already validated by mppMiddleware (never throws here: the 400 for both headers came first).
  const authHeader = resolveMppCredentialHeader(req.headers) as string;
  const { amount } = params;
  // T-0431: the subscription intent verifies through its own handler (built per quote).
  const mppx = subscription ? null : await getMppxInstance();

  if (!subscription && !mppx) {
    throw new AppError(ErrorCode.BAD_GATEWAY, 'MPP payment system not available');
  }

  // Use mppx/server Fetch API directly with proper https URL
  const url = `https://${req.get('host')}${req.originalUrl}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
  }
  // The verifier reads Authorization; a credential that arrived in Payment-Authorization (the
  // agent's Authorization carries its API key) is moved there on this INTERNAL request only.
  headers.delete(PAYMENT_AUTHORIZATION);
  headers.set('authorization', authHeader);

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
    const result = subscription
      ? await subscription.handler(fetchReq)
      : await mppx.charge(params)(fetchReq);

    // T-0426: ONLY status 200 is a paid request. Everything else is NOT paid (never the paid path).
    if (result.status === 403) {
      // mppx 0.13.4+: CredentialReplayedError, answered with a final 403 and no new challenge.
      log.warn(
        { requestId: req.requestId, originalUrl: req.originalUrl, amount },
        'mpp: credential replayed (403 from mppx)',
      );
      res.status(403).json({
        error: 'forbidden',
        error_code: 'credential_replayed',
        message:
          'This MPP credential was already settled. Request a new challenge (GET the same URL) and pay again.',
        request_id: req.requestId,
        charged: false,
      });
      return false;
    }
    if (result.status === 402) {
      log.warn(
        { requestId: req.requestId, originalUrl: req.originalUrl, amount },
        'mpp: credential HMAC verification failed',
      );
      throw new AppError(
        ErrorCode.BAD_REQUEST,
        'MPP payment verification failed. If your client library is older than mppx 0.6.16, upgrade it: older credentials fail the HMAC binding.',
      );
    }
    if (result.status !== 200) {
      log.warn(
        { requestId: req.requestId, originalUrl: req.originalUrl, amount, status: result.status },
        'mpp: unexpected non-200 handler status — treated as NOT paid',
      );
      throw new AppError(ErrorCode.BAD_REQUEST, 'MPP payment verification failed');
    }

    // Hand the receipt to the client exactly as mppx produced it (base64url JSON, no re-encoding).
    // The charge already settled on-chain, so a missing receipt must never fail the request.
    try {
      const receipt = result.withReceipt(new globalThis.Response()).headers.get('Payment-Receipt');
      if (receipt) res.setHeader('Payment-Receipt', receipt);
    } catch (err) {
      log.warn(
        { requestId: req.requestId, err: err instanceof Error ? err.message : String(err) },
        'mpp: could not attach Payment-Receipt header',
      );
    }

    // Payment verified — resolve who actually paid (on-chain truth, not a stub).
    const { payer, txHash, asset } = await resolveRealPayer(result);
    req.mppPayment = {
      verified: true,
      payer,
      amount,
      txHash,
      asset,
      method: 'tempo',
      header: authHeader,
      ...(params.recipient
        ? { recipient: params.recipient, splits: subscription ? [] : (params.splits ?? []) }
        : {}),
      ...(subscription ? { intent: 'subscription' as const } : {}),
    };

    log.info({ requestId: req.requestId, method: 'tempo', payer, txHash }, 'mpp: payment verified');
    return true;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (isSettleUnknown(err)) {
      await recordSettleUnknown(req, res, params, err);
      return false;
    }
    if (err instanceof Error && err.name === 'CredentialReplayedError') {
      res.status(403).json({
        error: 'forbidden',
        error_code: 'credential_replayed',
        message:
          'This MPP credential was already settled. Request a new challenge (GET the same URL) and pay again.',
        request_id: req.requestId,
        charged: false,
      });
      return false;
    }
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

/** T-0426: a metrics failure must never cost a challenge. */
async function countChallenge(currency: string): Promise<void> {
  try {
    const { mppChallengesTotal } = await import('../services/metrics.service');
    mppChallengesTotal.inc({ currency });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'mpp: challenge counter unavailable',
    );
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
  opts: { mcp?: boolean } = {},
): Promise<string | null> {
  const cfg = getMppConfig();
  if (!cfg.enabled) return null;
  assertChallengeChainId(cfg);

  // T-0429: only the /mcp challenge names Payment-Authorization (header="..."); tool-call routes keep Authorization.
  const mppx = await getMppxInstance(opts.mcp ? 'mcp' : 'default');
  if (!mppx) return null;

  try {
    // Ensure URL uses https (server is behind Nginx)
    const httpsUrl = requestUrl.replace(/^http:/, 'https:');
    const fetchReq = new globalThis.Request(httpsUrl, { method: 'POST' });
    const result = await mppx.charge({
      amount: String(priceUsd),
      chainId: cfg.chainId,
      ...quoteParams,
    })(fetchReq);

    if (result.status === 402) {
      await countChallenge(cfg.usdcAddress);
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
 * new one is built for the same quote. Returns null when MPP is off / the quote is not payable.
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

// ---------------------------------------------------------------------------
// T-0431: the MPP `subscription` intent (Tempo, day/week plans, pull_mode `mpp_subscription`)
// ---------------------------------------------------------------------------

/** `?intent=subscription` on a quote pay URL selects the subscription challenge / credential. */
export function isSubscriptionIntent(value: unknown): boolean {
  return typeof value === 'string' && value === 'subscription';
}

interface SubscriptionCall {
  handler: (request: globalThis.Request) => Promise<{
    status: number;
    challenge?: globalThis.Response;
    withReceipt(response: globalThis.Response): globalThis.Response;
  }>;
}

export interface MppSubscriptionRuntime {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mppx: any;
  chainId: number | undefined;
  /** mppx renewal (APIbase signs with the server-owned access key and pays the gas). */
  renew(subscriptionId: string): Promise<{ reference: string } | null>;
  /** Sandbox hook only (testnet): move the mppx billing anchor back so the next period is due. */
  rewindAnchor(subscriptionId: string, ms: number): Promise<boolean>;
}

let subRuntime: Promise<MppSubscriptionRuntime | null> | null = null;

/** `store` is injectable for tests (an in-memory atomic store); production uses the shared Redis. */
export async function createMppSubscriptionRuntime(
  testStore?: unknown,
): Promise<MppSubscriptionRuntime | null> {
  const cfg = getMppConfig();
  if (!cfg.enabled) return null;
  const { Mppx, tempo, Store } = await import('mppx/server');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = tempo as any;
  if (typeof t.subscription !== 'function' || typeof t.renewSubscription !== 'function') {
    return null;
  }
  const { privateKeyToAccount } = await import('viem/accounts');
  const account = privateKeyToAccount(cfg.privateKey as `0x${string}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let store: any = testStore;
  if (!store) {
    const { getSharedRedis } = await import('../services/redis.service');
    const { atomicRedisAdapter } = await import('../services/mppx-redis-store');
    store = Store.redis(atomicRedisAdapter(getSharedRedis()));
  }
  if (typeof store.update !== 'function') {
    throw new Error('mppx store has no atomic update — refusing to start MPP subscriptions');
  }
  const chainId = assertChallengeChainId(cfg);
  const mppx = Mppx.create({
    methods: [
      ...t.subscription({
        account,
        // APIbase pays the gas of the activation and of every renewal.
        feePayer: true,
        chainId,
        currencies: [cfg.usdcAddress],
        store,
        // Every request needs a fresh credential bound to its payer; no free request-path reuse.
        requireCredential: true,
        resolve: async ({ input }: { input: globalThis.Request }) => {
          const id = QUOTE_PAY_URL.exec(new URL(input.url).pathname)?.[1];
          return id ? { key: `quote:${id.toLowerCase()}` } : null;
        },
        hooks: {
          activated: async (a: {
            receipt: { reference: string };
            subscription: {
              subscriptionId: string;
              lookupKey: string;
              recipient: string;
              payer?: { address: string };
              accessKey?: { accessKeyAddress: string };
              subscriptionExpires: string;
            };
          }) => {
            try {
              const { recordActivation } = await import('../shop/subscription-mpp.service');
              const { getPrisma } = await import('../services/prisma.service');
              await recordActivation(getPrisma(), a);
            } catch (err) {
              // The money already moved: period 1 is still paid, the platform just cannot renew it.
              logger.error(
                { err: err instanceof Error ? err.message : String(err), tx: a.receipt.reference },
                'mpp subscription: activation could not be recorded — renewals are off for it',
              );
            }
          },
        },
      }),
    ],
    secretKey: cfg.secretKey,
    realm: cfg.realm,
  });
  return {
    mppx,
    chainId,
    async renew(subscriptionId) {
      const out = await t.renewSubscription({
        subscriptionId,
        account,
        feePayer: true,
        chainId,
        store,
        waitForConfirmation: true,
      });
      return out ? { reference: out.receipt.reference } : null;
    },
    async rewindAnchor(subscriptionId, ms) {
      if (cfg.testnet !== true) return false;
      const key = `tempo:subscription:record:${subscriptionId}`;
      const rec = (await store.get(key)) as { billingAnchor?: string } | null;
      if (!rec?.billingAnchor) return false;
      await store.put(key, {
        ...rec,
        billingAnchor: new Date(Date.parse(rec.billingAnchor) - ms).toISOString(),
      });
      return true;
    },
  };
}

export function getMppSubscriptionRuntime(): Promise<MppSubscriptionRuntime | null> {
  if (!subRuntime) {
    subRuntime = createMppSubscriptionRuntime().catch((err) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'mpp: failed to initialize the subscription intent — disabled until restart',
      );
      return null;
    });
  }
  return subRuntime;
}

/** The mppx subscription handler of ONE quote, built from server data only (never the request). */
async function subscriptionCall(quoteId: string): Promise<SubscriptionCall> {
  const rt = await getMppSubscriptionRuntime();
  const { mppSubscriptionTerms } = await import('../shop/subscription-mpp.service');
  const terms = await mppSubscriptionTerms(quoteId);
  if (!rt || !terms.ok) {
    throw new AppError(
      ErrorCode.BAD_REQUEST,
      `The MPP subscription intent is not available for this quote: ${terms.ok ? 'MPP is not available' : terms.reason}.`,
      undefined,
      '/integrator/docs#mpp-subscriptions',
    );
  }
  const t = terms.terms;
  return {
    handler: rt.mppx.subscription({
      amount: String(t.amount_usd),
      chainId: rt.chainId,
      periodCount: String(t.plan.period_count),
      periodUnit: t.plan.period_unit,
      recipient: t.recipient,
      subscriptionExpires: t.key_expires_at.toISOString(),
      externalId: quoteId,
    }),
  };
}

/** The subscription-intent challenge of a quote (null when the quote does not qualify). */
export async function quoteMppSubscriptionChallengeHeader(
  quoteId: string,
  requestUrl: string,
): Promise<string | null> {
  try {
    const call = await subscriptionCall(quoteId);
    const result = await call.handler(
      new globalThis.Request(requestUrl.replace(/^http:/, 'https:'), { method: 'POST' }),
    );
    if (result.status === 402 && result.challenge) {
      await countChallenge(getMppConfig().usdcAddress);
      return result.challenge.headers.get('WWW-Authenticate');
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), quoteId },
      'mpp: subscription challenge could not be built',
    );
  }
  return null;
}
