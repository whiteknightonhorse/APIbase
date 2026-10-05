import {
  type Stage,
  type PipelineError,
  type PipelineContext,
  type Result,
  ok,
  err,
} from '../types';
import { reserve, InsufficientFundsError } from '../../services/escrow.service';
import { logger } from '../../config/logger';
import { createHash } from 'node:crypto';
import { getX402Config, buildServerX402Requirements, toMicroUsdc } from '../../config/x402.config';
import { buildPaymentRequiredResponse as buildToolPaymentRequired } from '../../middleware/x402.middleware';
import type { ShopDeps } from '../../shop/merchant-lifecycle.service';
import type { ShopTx } from '../../shop/db';
import { getSharedResourceServer } from '../../services/x402-server.service';
import { decodePaymentSignatureHeader } from '@x402/core/http';
import { parsePaymentPayload } from '@x402/core/schemas';
import { claimPaymentNonce } from '../../services/payment-nonce.service';
import { recordMppRefundOwed } from './escrow-finalize.stage';

/** Fallback replay-guard TTL (seconds) when a signed payment carries no
 *  discoverable expiry — bounds Redis memory without depending on the rail. */
const NONCE_FALLBACK_TTL_SECONDS = 120;

function replayRejected(priceUsd: number): PipelineError {
  return {
    code: 402,
    error: 'payment_required',
    message: 'This payment has already been consumed. Sign a new authorization for each tool call.',
    extra: {
      price_usd: priceUsd,
      payment_address: getX402Config().paymentAddress,
      price_version: 1,
    },
  };
}

const nonceStoreUnavailable: PipelineError = {
  code: 503,
  error: 'service_unavailable',
  message: 'Payment verification service unavailable',
  retryAfter: 2,
};

/**
 * Claim a nonce so the exact same signed payment cannot be consumed twice
 * (A-01). Returns an error result if this payment was already claimed by a
 * concurrent or earlier request, or if the nonce store is unreachable
 * (fail closed, §12.186).
 */
async function claimOrReject(
  rail: string,
  nonce: string,
  ttlSeconds: number,
  priceUsd: number,
  logCtx: Record<string, unknown>,
): Promise<Result<true, PipelineError>> {
  let claimed: boolean;
  try {
    claimed = await claimPaymentNonce(rail, nonce, ttlSeconds);
  } catch (nonceErr) {
    logger.error(
      { ...logCtx, err: nonceErr instanceof Error ? nonceErr.message : String(nonceErr) },
      `${rail} replay guard: nonce store unavailable — failing closed`,
    );
    return err(nonceStoreUnavailable);
  }
  if (!claimed) {
    logger.warn(logCtx, `${rail} replay guard: payment nonce already consumed — rejecting`);
    return err(replayRejected(priceUsd));
  }
  return ok(true);
}

/**
 * Extract the EIP-3009/Permit2 nonce + expiry from a decoded x402 payload.
 * Both exact-scheme variants carry a `nonce` alongside `validBefore` (EIP-3009)
 * or `deadline` (Permit2) inside their respective authorization sub-object.
 */
function extractX402Nonce(payload: unknown): { nonce: string; validBefore: number } | null {
  const raw = (payload as { payload?: Record<string, unknown> } | undefined)?.payload;
  if (!raw || typeof raw !== 'object') return null;
  const auth = (raw.authorization ?? raw.permit2Authorization) as
    | Record<string, unknown>
    | undefined;
  if (!auth || typeof auth !== 'object') return null;
  const nonce = auth.nonce;
  const validBeforeRaw = auth.validBefore ?? auth.deadline;
  if (typeof nonce !== 'string' && typeof nonce !== 'number') return null;
  if (validBeforeRaw === undefined) return null;
  const validBefore = Number(validBeforeRaw);
  if (!Number.isFinite(validBefore)) return null;
  return { nonce: String(nonce), validBefore };
}

/**
 * Decode the `id` + `expires` fields out of an mppx `Payment <base64-json>`
 * credential — just enough to derive the replay-guard key, without a static
 * `import` of the `mppx` package (root `mppx` ships ESM-only with no CJS
 * build; a static import would throw `ERR_REQUIRE_ESM` once tsc compiles this
 * file to CommonJS). The credential's HMAC was already verified by
 * mpp.middleware.ts before ESCROW runs — this only re-reads two plain fields
 * from that already-trusted JSON blob (mirrors mppx's own `Credential.deserialize`).
 */
function decodeMppChallenge(header: string): { challengeId: string; expires?: string } | null {
  const match = /^Payment\s+(.+)$/i.exec(header);
  if (!match) return null;
  try {
    const json = Buffer.from(match[1], 'base64').toString('utf8');
    const parsed = JSON.parse(json) as { challenge?: { id?: unknown; expires?: unknown } };
    const id = parsed.challenge?.id;
    if (typeof id !== 'string') return null;
    const expires =
      typeof parsed.challenge?.expires === 'string' ? parsed.challenge.expires : undefined;
    return { challengeId: id, expires };
  } catch {
    return null;
  }
}

/**
 * What a payment must look like, built ONLY from server data (T-INT-08, spec §2 item 4 / §8.2).
 *
 * One shape, two sources: an ordinary tool (`tool:<id>`) is priced from `ctx.toolPrice` and paid
 * to the platform wallet exactly as before; `shop.order.pay` (`quote:<id>`) is priced from the
 * quote row and paid to the merchant's CURRENT payout wallet. Nothing here is read from the
 * client's `payload.accepted`, header amounts or body — `quote_id` in the body only finds the row.
 */
export interface PaymentBinding {
  amount_usd: number;
  pay_to: string;
  rail: 'base' | 'tempo';
  resource: `tool:${string}` | `quote:${string}`;
  /** Platform fee leg, informational for Base (receivable, never part of `accepts`). */
  splits?: Array<{ wallet: string; amount_usd: number }>;
}

const isQuoteBinding = (b: PaymentBinding): boolean => b.resource.startsWith('quote:');
const SHOP_PAY_TOOL = 'shop.order.pay';

/** The locked quote row a `quote:*` binding was derived from. */
interface LockedQuote {
  quote_id: string;
  order_id: string;
  merchant_id: string;
  buyer_identity: string | null;
  is_test: boolean;
}

interface QuoteRow {
  quote_id: string;
  merchant_id: string;
  buyer_identity: string | null;
  total_usd: number;
  fee_usd: number;
  status: string;
  expires_at: Date;
  is_test: boolean;
  rails_offered: string[];
  payout_wallet_base: string;
  payout_wallet_tempo: string;
  payout_pending: { rail: 'base' | 'tempo'; wallet: string; effective_at: string } | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const quoteErr = (
  code: number,
  error: string,
  message: string,
  extra?: Record<string, unknown>,
): Result<never, PipelineError> => err<PipelineError>({ code, error, message, extra });

/**
 * Build the binding for this call. Tools: synchronous values, nothing touched. `shop.order.pay`:
 * `SELECT … FOR UPDATE` of the quote inside the caller's ESCROW transaction (`tx`), so two
 * parallel payments for one quote serialize here (§8.1 item 4).
 */
export async function buildPaymentBinding(
  ctx: PipelineContext,
  tx?: ShopTx,
  at: number = Date.now(),
): Promise<Result<{ binding: PaymentBinding; quote?: LockedQuote }, PipelineError>> {
  if (ctx.toolId !== SHOP_PAY_TOOL) {
    return ok({
      binding: {
        amount_usd: ctx.toolPrice ?? 0,
        pay_to: getX402Config().paymentAddress,
        rail: ctx.mppPaid ? 'tempo' : 'base',
        resource: `tool:${ctx.toolId}`,
      },
    });
  }
  if (!tx) throw new Error('buildPaymentBinding(shop.order.pay) needs the ESCROW transaction');

  const quoteId = String((ctx.body as { quote_id?: unknown } | undefined)?.quote_id ?? '');
  if (!UUID_RE.test(quoteId)) return quoteErr(404, 'not_found', 'quote not found');
  const rows = await tx.$queryRawUnsafe<QuoteRow[]>(
    `SELECT q.quote_id, q.merchant_id, q.buyer_identity, q.total_usd::float8 AS total_usd,
            q.fee_usd::float8 AS fee_usd, q.status, q.expires_at, q.is_test, q.rails_offered,
            m.payout_wallet_base, m.payout_wallet_tempo, m.payout_pending
       FROM shop_quotes q
       JOIN shop_merchants m ON m.merchant_id = q.merchant_id
      WHERE q.quote_id = $1::uuid
        FOR UPDATE OF q`,
    quoteId,
  );
  const q = rows[0];
  if (!q) return quoteErr(404, 'not_found', 'quote not found');
  if (q.status === 'paid' || q.status === 'cancelled') {
    return quoteErr(402, 'payment_required', `This quote is ${q.status}; request a new quote.`);
  }
  if (q.status === 'expired' || new Date(q.expires_at).getTime() < at) {
    return quoteErr(410, 'quote_expired', 'quote expired', { quote_id: quoteId });
  }
  // A separate statement AFTER the quote lock: its snapshot sees the winner's committed PAYING.
  const orders = await tx.$queryRawUnsafe<Array<{ order_id: string; state: string }>>(
    `SELECT order_id, state FROM shop_orders WHERE quote_id = $1::uuid FOR UPDATE`,
    quoteId,
  );
  const order = orders[0];
  if (!order || (order.state !== 'QUOTED' && order.state !== 'PAYMENT_FAILED')) {
    return quoteErr(402, 'payment_required', 'A payment for this order is already in progress.');
  }
  const rail = ctx.mppPaid ? 'tempo' : 'base';
  if (!q.rails_offered.includes(rail)) {
    return quoteErr(
      409,
      'rail_not_offered',
      `This quote is not payable with ${rail === 'tempo' ? 'MPP (Tempo)' : 'x402 (Base)'}.`,
    );
  }

  const { currentPayout } = await import('../../shop/auth/identity.service');
  const { integratorConfig } = await import('../../shop/quote.service');
  const feeWallet = process.env['INTEGRATOR_FEE_WALLET'];
  const binding: PaymentBinding = {
    amount_usd: q.total_usd,
    pay_to: currentPayout(q, rail, at),
    rail,
    resource: `quote:${q.quote_id}`,
    splits:
      q.fee_usd > 0 && integratorConfig().fee_enabled && feeWallet
        ? [{ wallet: feeWallet, amount_usd: q.fee_usd }]
        : undefined,
  };
  return ok({
    binding,
    quote: {
      quote_id: q.quote_id,
      order_id: order.order_id,
      merchant_id: q.merchant_id,
      buyer_identity: q.buyer_identity,
      is_test: q.is_test,
    },
  });
}

/**
 * 402 body built from a binding. `tool:*` is the existing builder, untouched (byte-for-byte);
 * `quote:*` carries `extra.quote_id` and the quote's own `resource`. The MPP url lives in the
 * tool body (`pay.mpp.url`), never in `accepts`.
 */
export function buildPaymentRequiredResponse(
  binding: PaymentBinding,
  meta: { requestId: string; host: string; priceVersion?: number },
): Record<string, unknown> {
  if (!isQuoteBinding(binding)) {
    return buildToolPaymentRequired(
      binding.resource.slice('tool:'.length),
      binding.amount_usd,
      meta.priceVersion ?? 1,
      meta.requestId,
      meta.host,
    );
  }
  const cfg = getX402Config();
  const quoteId = binding.resource.slice('quote:'.length);
  const micro = toMicroUsdc(binding.amount_usd);
  return {
    x402Version: 2,
    error: 'payment_required',
    resource: {
      url: `https://${meta.host}/api/v1/shop/quotes/${quoteId}/pay`,
      mimeType: 'application/json',
      description: `Order payment: ${binding.resource}`,
    },
    resource_id: binding.resource,
    accepts: [
      {
        scheme: 'exact',
        network: cfg.network,
        amount: micro,
        maxAmountRequired: micro,
        asset: cfg.usdcAddress,
        payTo: binding.pay_to,
        maxTimeoutSeconds: cfg.maxTimeoutSeconds,
        extra: { name: 'USD Coin', version: '2', quote_id: quoteId },
      },
    ],
    request_id: meta.requestId,
    error_code: 'payment_required',
    suggested_action: 'add_payment',
    documentation_url: 'https://apibase.pro/docs/integrator#quotes',
    price_usd: String(binding.amount_usd),
    min_balance_usd: String(binding.amount_usd),
    payment_address: binding.pay_to,
    price_version: meta.priceVersion ?? 1,
  };
}

interface VerifiedX402 {
  payer: string;
  nonce: string;
}

/**
 * Authoritative x402 payment binding (issue #103).
 *
 * The middleware only structurally validates the X-Payment header. Here — the
 * first stage where the real price is known — we verify the signed authorization
 * against the SERVER-built `binding` (payTo, asset, network, exact amount). The
 * facilitator's exact scheme rejects any mismatch (recipient_mismatch /
 * value_mismatch / network_mismatch), so a client cannot underpay or redirect
 * funds. For `quote:*` the same three fields are ALSO compared here, strictly
 * (overpayment is a refusal), before the facilitator is called.
 *
 * `afterVerify` (quote orders: the payer OFAC screen, §8.4) runs after a valid
 * verify and BEFORE the nonce claim, so a refused payer never burns a nonce.
 */
async function verifyX402Binding(
  ctx: PipelineContext,
  binding: PaymentBinding,
  afterVerify?: (v: VerifiedX402) => Promise<Result<true, PipelineError>>,
): Promise<Result<VerifiedX402, PipelineError>> {
  const x402Cfg = getX402Config();
  const priceUsd = binding.amount_usd;
  const quote = isQuoteBinding(binding);
  const reject = (
    reason: string,
    code = 'payment_required',
    message?: string,
  ): Result<never, PipelineError> => {
    logger.warn(
      { toolId: ctx.toolId, requestId: ctx.requestId, reason },
      'x402 binding: payment not bound to server requirements — rejecting',
    );
    if (quote) {
      return err<PipelineError>({
        code: 402,
        error: code,
        message:
          message ??
          'Payment required: sign an exact x402 authorization for the quoted amount and payee.',
        extra: { binding, quote_id: binding.resource.slice('quote:'.length) },
      });
    }
    return err<PipelineError>({
      code: 402,
      error: 'payment_required',
      message: `This tool costs $${priceUsd}. Provide a valid x402 (X-Payment header) payment for the exact amount.`,
      extra: {
        price_usd: priceUsd,
        payment_address: x402Cfg.paymentAddress,
        price_version: 1,
      },
    });
  };

  if (!ctx.x402PaymentHeader) {
    return reject('missing_header');
  }

  let payload: unknown;
  try {
    const decoded = decodePaymentSignatureHeader(ctx.x402PaymentHeader);
    const parsed = parsePaymentPayload(decoded);
    if (!parsed.success) return reject('parse_failed');
    payload = parsed.data;
  } catch {
    return reject('decode_failed');
  }

  if (quote) {
    // The client's numbers are only COMPARED with the server binding, never trusted.
    const p = payload as {
      accepted?: { network?: unknown };
      payload?: { authorization?: { to?: unknown; value?: unknown } };
    };
    const auth = p.payload?.authorization;
    if (!auth || typeof auth.to !== 'string' || auth.value === undefined) {
      return reject('quote_requires_eip3009_authorization');
    }
    if (String(auth.value) !== toMicroUsdc(binding.amount_usd)) {
      return reject(
        'amount_mismatch',
        'payment_amount_mismatch',
        `The authorization must be for exactly ${toMicroUsdc(binding.amount_usd)} micro-USDC (the quoted total).`,
      );
    }
    if (auth.to.toLowerCase() !== binding.pay_to.toLowerCase()) {
      return reject('pay_to_mismatch');
    }
    if (p.accepted?.network !== undefined && p.accepted.network !== x402Cfg.network) {
      return reject('network_mismatch');
    }
  }

  const requirements = quote
    ? { ...buildServerX402Requirements(binding.amount_usd), payTo: binding.pay_to }
    : buildServerX402Requirements(priceUsd);
  let result;
  try {
    result = await getSharedResourceServer().verifyPayment(payload as never, requirements as never);
  } catch (verifyErr) {
    // Facilitator unavailable — fail closed (never grant access on infra error).
    logger.error(
      {
        toolId: ctx.toolId,
        requestId: ctx.requestId,
        err: verifyErr instanceof Error ? verifyErr.message : String(verifyErr),
      },
      'x402 binding: verify threw — failing closed',
    );
    return err<PipelineError>({
      code: 502,
      error: 'bad_gateway',
      message: 'Payment facilitator unavailable',
    });
  }

  if (!result.isValid) {
    return reject(result.invalidReason ?? 'invalid');
  }

  // Single-use guard (A-01): the facilitator verify above is stateless — the
  // same signed authorization presented N times in parallel passes N times.
  // Claim its on-chain nonce here, before granting access, so only the first
  // claimant proceeds to PROVIDER_CALL.
  const nonceInfo = extractX402Nonce(payload);
  if (!nonceInfo) {
    return reject('missing_nonce');
  }
  const authFrom = (payload as { payload?: { authorization?: { from?: unknown } } }).payload
    ?.authorization?.from;
  const payer = result.payer ?? (typeof authFrom === 'string' ? authFrom : undefined);
  if (afterVerify) {
    const screened = await afterVerify({ payer: payer ?? 'unknown', nonce: nonceInfo.nonce });
    if (!screened.ok) return screened;
  }
  const ttlSeconds = nonceInfo.validBefore - Math.floor(Date.now() / 1000);
  const claim = await claimOrReject('x402', nonceInfo.nonce, ttlSeconds, priceUsd, {
    toolId: ctx.toolId,
    requestId: ctx.requestId,
  });
  if (!claim.ok) {
    if (quote && claim.error.code === 402) {
      return reject('nonce_already_consumed', 'payment_required', 'This payment was already used.');
    }
    return claim;
  }

  // Authoritative payer for the ledger audit trail (§AP-9).
  ctx.x402Payer = result.payer ?? ctx.x402Payer ?? 'unknown';
  return ok({ payer: ctx.x402Payer, nonce: nonceInfo.nonce });
}

/**
 * MPP twin of verifyX402Binding for an order quote (T-INT-10). mppx already settled on Tempo
 * inside charge() and its HMAC covers amount/recipient/splits/memo; this compares them once more
 * with the quote as locked NOW (a payout change or fee flip between the middleware read and this
 * lock must not slip through), screens the payer and claims the challenge id (single use).
 * Every refusal here is money already taken -> refund-owed outbox row.
 */
async function verifyMppQuoteBinding(
  ctx: PipelineContext,
  binding: PaymentBinding,
  screen: (payer: string) => Promise<Result<true, PipelineError>>,
): Promise<Result<{ payer: string; challengeId: string }, PipelineError>> {
  const refuse = async (reason: string): Promise<Result<never, PipelineError>> => {
    logger.warn(
      { requestId: ctx.requestId, reason },
      'mpp quote binding: rejecting payment already settled',
    );
    await recordMppRefundOwed(ctx, `escrow_rejected:${reason}`);
    return quoteErr(402, 'payment_required', 'This payment cannot be accepted for this quote.', {
      binding,
      quote_id: binding.resource.slice('quote:'.length),
    });
  };
  const paid = mppAmountToMicro(ctx.mppAmount);
  if (paid === null || paid !== mppAmountToMicro(String(binding.amount_usd))) {
    return refuse('mpp_amount_mismatch');
  }
  if (ctx.mppRecipient?.toLowerCase() !== binding.pay_to.toLowerCase()) {
    return refuse('mpp_recipient_mismatch');
  }
  const want = (binding.splits ?? []).map(
    (x) => `${x.wallet.toLowerCase()}:${mppAmountToMicro(String(x.amount_usd))}`,
  );
  const got = (ctx.mppSplits ?? []).map(
    (x) => `${x.recipient.toLowerCase()}:${mppAmountToMicro(x.amount)}`,
  );
  if (want.join('|') !== got.join('|')) return refuse('mpp_splits_mismatch');

  const decoded = ctx.mppPaymentHeader ? decodeMppChallenge(ctx.mppPaymentHeader) : null;
  if (!decoded) return refuse('mpp_credential_undecodable');
  const payer = ctx.mppPayer ?? 'unknown-mpp-payer';
  const screened = await screen(payer);
  if (!screened.ok) {
    await recordMppRefundOwed(ctx, 'escrow_rejected:payer_sanctioned');
    return screened;
  }
  const claim = await claimOrReject('mpp', decoded.challengeId, 300, binding.amount_usd, {
    toolId: ctx.toolId,
    requestId: ctx.requestId,
  });
  if (!claim.ok) {
    await recordMppRefundOwed(ctx, 'escrow_rejected:mpp_replay');
    return claim;
  }
  return ok({ payer, challengeId: decoded.challengeId });
}

export type QuotePayResult = Result<
  { order_id: string; state: string; tx_hash?: string | null; fulfillment?: string },
  PipelineError
>;

/** The committed PAYING step: what settle needs. */
interface PayingStep {
  order_id: string;
  payment_id: string;
  payer: string;
  binding: PaymentBinding;
}

const isLiveOrderConflict = (e: unknown): boolean =>
  /shop_orders_quote_id_live_key|unique constraint|\b23505\b/i.test(
    `${(e as { code?: string })?.code ?? ''} ${(e as { message?: string })?.message ?? ''}`,
  );

/**
 * ESCROW for `shop.order.pay` (x402/Base): everything inside ONE transaction that holds the
 * quote's row lock. Order: lock+binding → test-SKU cap (before verify: wallet not charged) →
 * verify against the binding → payer OFAC → nonce claim → shop_payments(pending) → PAYING.
 * Then, AFTER that commit, settle with the receipt awaited (INT-09, §7.2) and only then PAID +
 * delivery (`shop-settle.ts`). A pending receipt leaves the order PAYING (202 for the caller).
 */
export async function escrowQuotePayment(
  deps: ShopDeps,
  ctx: PipelineContext,
): Promise<QuotePayResult> {
  const { countPaidTestOrders24h, integratorConfig, getQuote } =
    await import('../../shop/quote.service');
  const { isSanctioned } = await import('../../shop/moderation/sanctions');
  const { transition } = await import('../../shop/order-state');
  const at = (deps.now ?? Date.now)();

  let res: Result<PayingStep, PipelineError>;
  try {
    res = await deps.transaction(async (tx): Promise<Result<PayingStep, PipelineError>> => {
      const built = await buildPaymentBinding(ctx, tx, at);
      if (!built.ok) return built;
      const { binding, quote } = built.value;
      if (!quote) throw new Error('quote binding without a quote');
      const quoteId = quote.quote_id;

      // §7.3: the test-SKU cap is checked BEFORE verify.
      if (quote.is_test) {
        const cap = integratorConfig().test_sku_daily_cap;
        if ((await countPaidTestOrders24h(tx, quote.merchant_id, at)) >= cap) {
          return quoteErr(
            429,
            'test_sku_daily_cap',
            `test SKU: ${cap} paid orders per 24 hours reached`,
          );
        }
      }

      // Buyer preferences are written only by the quote's own buyer; the payment itself is
      // authorised by the signature alone (§8.2), so this never gates it.
      const body = (ctx.body ?? {}) as { waive_withdrawal?: unknown; buyer_company?: unknown };
      const ownsQuote = !quote.buyer_identity || quote.buyer_identity === ctx.agentId;
      if (ownsQuote && typeof body.waive_withdrawal === 'boolean') {
        await tx.$executeRawUnsafe(
          `UPDATE shop_quotes SET waive_withdrawal = $2 WHERE quote_id = $1::uuid`,
          quoteId,
          body.waive_withdrawal,
        );
      }
      if (ownsQuote && typeof body.buyer_company === 'string' && body.buyer_company.trim() !== '') {
        await tx.$executeRawUnsafe(
          `UPDATE shop_quotes SET buyer_company = $2 WHERE quote_id = $1::uuid`,
          quoteId,
          body.buyer_company.trim().slice(0, 200),
        );
      }

      const screen = async (payer: string): Promise<Result<true, PipelineError>> => {
        if (!(await isSanctioned(tx, payer))) return ok(true);
        // Written and COMMITTED (the tx returns, it does not throw): source of PAYER_SANCTIONED (INT-13).
        await tx.$executeRawUnsafe(
          `INSERT INTO shop_moderation_reviews (merchant_id, scope, layer, verdict, category, evidence_hash)
         VALUES ($1::uuid, 'merchant', 'rules', 'reject', 'ofac', $2)`,
          quote.merchant_id,
          createHash('sha256').update(payer.toLowerCase()).digest('hex'),
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO shop_connect_events (error_code, path) VALUES ('payer_sanctioned', $1)`,
          `quote:${quoteId}`,
        );
        logger.warn(
          { requestId: ctx.requestId, quoteId },
          'x402 escrow: payer sanctioned — blocked',
        );
        return quoteErr(402, 'payment_required', 'This payment cannot be accepted.', {
          binding,
          quote_id: quoteId,
        });
      };
      const mpp = Boolean(ctx.mppPaid);
      const verified = mpp
        ? await verifyMppQuoteBinding(ctx, binding, screen)
        : await verifyX402Binding(ctx, binding, ({ payer }) => screen(payer));
      if (!verified.ok) return verified;
      const { payer } = verified.value;
      const nonce = 'nonce' in verified.value ? verified.value.nonce : verified.value.challengeId;

      // x402: pending until settle returns the receipt. MPP: charge() already settled on Tempo and
      // its receipt carries the tx hash, so the row is confirmed at once (§7.2).
      const pay = await tx.$queryRawUnsafe<Array<{ payment_id: string }>>(
        `INSERT INTO shop_payments (order_id, rail, nonce_or_challenge_id, payer, eip3009_nonce, pay_to,
                                  amount_usd, splits, tx_hash, chain_status, confirmed_at, reconcile_until)
       VALUES ($1::uuid, $7, $2, $3, $8, $4, $5::numeric, $6::jsonb, $9, $10,
               CASE WHEN $10 = 'confirmed' THEN now() END, now() + interval '24 hours')
       RETURNING payment_id`,
        quote.order_id,
        nonce,
        payer,
        binding.pay_to,
        binding.amount_usd,
        JSON.stringify(binding.splits ?? []),
        binding.rail,
        mpp ? null : nonce,
        mpp ? (ctx.mppTxHash ?? null) : null,
        mpp ? 'confirmed' : 'pending',
      );
      await transition(tx, quote.order_id, 'PAYING', {
        actor: 'buyer',
        reason: mpp ? 'mpp_payment_presented' : 'x402_payment_presented',
        payload: { payer_wallet: payer, rail: binding.rail },
      });
      await tx.$executeRawUnsafe(
        `UPDATE shop_orders SET payer_wallet = $2, rail = $3 WHERE order_id = $1::uuid`,
        quote.order_id,
        payer,
        binding.rail,
      );
      return ok({ order_id: quote.order_id, payment_id: pay[0].payment_id, payer, binding });
    });
  } catch (e) {
    // §9.1 "Две оплаты котировки": a second live order row for the quote hits the INT-01 index.
    if (ctx.mppPaid) await recordMppRefundOwed(ctx, 'escrow_failed:order_tx');
    if (!isLiveOrderConflict(e)) throw e;
    logger.warn({ requestId: ctx.requestId }, 'x402 escrow: live order already exists for quote');
    return quoteErr(402, 'payment_required', 'A payment for this order is already in progress.');
  }

  if (!res.ok && res.error.error === 'quote_expired') {
    // The lock is released: now issue the replacement quote (UC-15) — getQuote opens its own tx.
    try {
      await getQuote(deps, String(res.error.extra?.quote_id));
    } catch (e) {
      const x = e as { error_code?: string; extra?: Record<string, unknown> };
      if (x.error_code === 'quote_expired') {
        return err<PipelineError>({ ...res.error, extra: { ...res.error.extra, ...x.extra } });
      }
    }
  }
  if (!res.ok) {
    // MPP: charge() already took the money; any refusal at this point is a refund owed.
    if (ctx.mppPaid) await recordMppRefundOwed(ctx, `escrow_rejected:${res.error.error}`);
    return res;
  }

  const { settleAndFinalize, finalizeConfirmed } = await import('./shop-settle');
  const step = res.value;
  const agent = (ctx as { buyerAgent?: Record<string, string> }).buyerAgent;
  if (ctx.mppPaid) {
    // Already settled by charge(): PAYING -> PAID (+ delivery) right away, no second settle.
    const order = await finalizeConfirmed(deps, {
      order_id: step.order_id,
      payment_id: step.payment_id,
      tx_hash: ctx.mppTxHash ?? 'unknown',
      payer: step.payer,
      rail: 'tempo',
      request_id: ctx.requestId,
      buyer_agent: agent,
    });
    return ok(order ?? { order_id: step.order_id, state: 'PAID', tx_hash: ctx.mppTxHash });
  }
  const out = await settleAndFinalize(deps, {
    order_id: step.order_id,
    payment_id: step.payment_id,
    payer: step.payer,
    amount_usd: step.binding.amount_usd,
    pay_to: step.binding.pay_to,
    header: ctx.x402PaymentHeader,
    request_id: ctx.requestId,
    buyer_agent: agent,
  });
  if (out.kind === 'paid') return ok({ ...out.order });
  if (out.kind === 'pending') return ok({ order_id: out.order_id, state: 'PAYING' });
  // success:false: the quote stays open until its TTL, so the 402 challenge is offered again.
  return quoteErr(
    402,
    'payment_required',
    'The payment could not be settled; nothing was delivered. Sign a new authorization.',
    { binding: step.binding, quote_id: step.binding.resource.slice('quote:'.length) },
  );
}

/**
 * USD decimal string -> integer micro-dollars; null if unparseable. Exact
 * string arithmetic (no float rounding): sub-micro precision such as
 * "0.10000001" yields a -1 sentinel that never equals a price, so it is never
 * silently rounded onto the tool price.
 */
function mppAmountToMicro(amount: string | undefined): number | null {
  if (amount === undefined) return null;
  const m = /^(\d+)(?:\.(\d+))?$/.exec(amount.trim());
  if (!m) return null;
  const frac = m[2] ?? '';
  if (/[1-9]/.test(frac.slice(6))) return -1;
  return Number(m[1]) * 1_000_000 + Number(frac.slice(0, 6).padEnd(6, '0'));
}

function mppRejected(priceUsd: number, message: string): PipelineError {
  return {
    code: 402,
    error: 'payment_required',
    message,
    extra: {
      price_usd: priceUsd,
      payment_address: getX402Config().paymentAddress,
      price_version: 1,
    },
  };
}

/**
 * Reject after mppx already settled on-chain: money taken, service not
 * rendered — record the refund owed (T-0256), then return 402.
 */
async function mppBindingRejected(
  ctx: PipelineContext,
  priceUsd: number,
  reason: string,
  message: string,
): Promise<Result<PipelineContext, PipelineError>> {
  logger.warn(
    { toolId: ctx.toolId, requestId: ctx.requestId, reason, mppAmount: ctx.mppAmount },
    `mpp binding: rejecting payment (${reason})`,
  );
  await recordMppRefundOwed(ctx, `escrow_rejected:${reason}`);
  return err(mppRejected(priceUsd, message));
}

/**
 * MPP payment binding + single-use guard (T-0256, A-01).
 *
 * mppx's HMAC binds the paid amount to the CHALLENGE; this binds it to the
 * TOOL. The server-side amount (ctx.mppAmount, HMAC-verified by the
 * middleware) must equal the tool price exactly, in integer micro-dollars
 * (overpayment is also rejected, like x402 `exact`). Fails closed when the
 * header/amount are missing or the credential cannot be decoded. Only then is
 * the challenge id claimed so the same credential cannot be consumed twice.
 */
async function verifyMppBinding(
  ctx: PipelineContext,
  priceUsd: number,
): Promise<Result<PipelineContext, PipelineError>> {
  if (!ctx.mppPaymentHeader) {
    logger.warn(
      { toolId: ctx.toolId, requestId: ctx.requestId, reason: 'mpp_missing_header' },
      'mpp binding: no credential header alongside mppPaid — failing closed',
    );
    return err(mppRejected(priceUsd, 'MPP credential missing for this paid call.'));
  }

  const paidMicro = mppAmountToMicro(ctx.mppAmount);
  if (paidMicro === null) {
    return mppBindingRejected(
      ctx,
      priceUsd,
      'mpp_missing_amount',
      'MPP credential carries no verifiable amount; obtain a challenge for this exact tool.',
    );
  }

  const priceMicro = Math.round(priceUsd * 1_000_000);
  if (paidMicro !== priceMicro) {
    return mppBindingRejected(
      ctx,
      priceUsd,
      'mpp_amount_mismatch',
      `This tool costs $${priceUsd}. The MPP credential was issued for $${ctx.mppAmount}; obtain a challenge for this exact tool.`,
    );
  }

  const decoded = decodeMppChallenge(ctx.mppPaymentHeader);
  if (!decoded) {
    return mppBindingRejected(
      ctx,
      priceUsd,
      'mpp_credential_undecodable',
      'MPP credential could not be decoded; obtain a new challenge for this tool.',
    );
  }

  const expiresMs = decoded.expires ? Date.parse(decoded.expires) : NaN;
  const ttlSeconds = Number.isFinite(expiresMs)
    ? Math.ceil((expiresMs - Date.now()) / 1000)
    : NONCE_FALLBACK_TTL_SECONDS;

  const claim = await claimOrReject('mpp', decoded.challengeId, ttlSeconds, priceUsd, {
    toolId: ctx.toolId,
    requestId: ctx.requestId,
  });
  if (!claim.ok) return claim;

  return ok(ctx);
}

/**
 * ESCROW stage (§12.43 stage 8, §12.154).
 * Reserve funds before provider call.
 * Skip on cache hit (§12.173: cache hits use direct charge, no escrow).
 */
export const escrowStage: Stage = {
  name: 'ESCROW',

  async execute(ctx) {
    // x402 on-chain payment — bind the signed authorization to SERVER-trusted
    // requirements (payTo/asset/network + the tool's real price) before granting
    // access (§8.6, issue #103). Free tools (price 0) need no payment.
    // On success: skip balance deduction (payment settles on-chain).
    if (ctx.toolId === SHOP_PAY_TOOL) {
      // Order payment: x402 only here (MPP is POST /quotes/:id/pay, INT-10).
      if (ctx.mppPaid) {
        return err<PipelineError>({
          code: 400,
          error: 'bad_request',
          message: 'MPP is accepted only on POST /api/v1/shop/quotes/{id}/pay.',
        });
      }
      const { defaultShopDeps } = await import('../../shop/merchant-lifecycle.service');
      const paid = await escrowQuotePayment(defaultShopDeps(), ctx);
      if (!paid.ok) return paid;
      const { payResponseBody } = await import('../../shop/order-payment.service');
      const shaped = payResponseBody(paid.value);
      ctx.responseStatus = shaped.status;
      ctx.responseBody = shaped.body;
      return ok(ctx);
    }

    if (ctx.x402Paid) {
      const price = ctx.toolPrice ?? 0;
      if (price > 0) {
        const built = await buildPaymentBinding(ctx);
        if (!built.ok) return built;
        const bound = await verifyX402Binding(ctx, built.value.binding);
        if (!bound.ok) return bound;
      }
      return ok(ctx);
    }

    // MPP payment verified by middleware. HMAC binds the amount to the
    // challenge; verifyMppBinding binds it to THIS tool's price (T-0256) and
    // claims the replay-guard nonce (A-01) before PROVIDER_CALL. Skip balance
    // deduction (§8.6).
    if (ctx.mppPaid) {
      const price = ctx.toolPrice ?? 0;
      if (price > 0) {
        const replay = await verifyMppBinding(ctx, price);
        if (!replay.ok) return replay;
      }
      return ok(ctx);
    }

    // Cache hits skip escrow — direct charge in LEDGER_WRITE (§12.173)
    if (ctx.cacheHit) {
      return ok(ctx);
    }

    if (!ctx.agentId || !ctx.toolId || !ctx.executionId) {
      return err<PipelineError>({
        code: 500,
        error: 'internal_error',
        message: 'Missing agentId, toolId, or executionId for escrow',
      });
    }

    const cost = ctx.toolPrice ?? 0;
    if (cost <= 0) {
      // Free tool — no escrow needed
      return ok(ctx);
    }

    // No on-chain payment (x402/MPP) was presented for this call — fund it
    // from the authenticated agent's prepaid balance instead (§12.154's
    // reserve rail, Fable verdict 2026-09-02). This is now the ONLY entry
    // point into the balance branch: reserve() below performs the atomic
    // `UPDATE accounts SET balance_usd = balance_usd - $1 WHERE balance_usd
    // >= $1` row-lock debit (escrow.service.ts, untouched) and a 402 is
    // returned ONLY when that reserve itself fails — no account for this
    // agent, or insufficient balance. Before this fix, this branch was an
    // unconditional 402 dead end for every entry point (REST/MCP/batch
    // alike, not just batch) — the reserve() call below was structurally
    // unreachable, since either x402Paid or mppPaid had to be true to fall
    // through the old guard, but both already return earlier in this
    // function when true. This tautological guard is now the entry point
    // into the balance branch instead of a rejection.
    const x402Cfg = getX402Config();
    try {
      const result = await reserve(
        ctx.agentId,
        ctx.toolId,
        cost,
        ctx.executionId,
        ctx.idempotencyKey,
      );

      ctx.escrowId = result.executionId;
      ctx.escrowAmount = result.amount;
      ctx.escrowCreatedAt = result.createdAt;

      return ok(ctx);
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        logger.warn(
          { agentId: ctx.agentId, toolId: ctx.toolId, cost, requestId: ctx.requestId },
          'Insufficient funds for escrow',
        );
        return err<PipelineError>({
          code: 402,
          error: 'payment_required',
          message: 'Insufficient balance for this tool',
          extra: {
            price_usd: cost,
            payment_address: x402Cfg.paymentAddress,
            price_version: 1,
          },
        });
      }
      throw error;
    }
  },
};
