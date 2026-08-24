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
import { getX402Config, buildServerX402Requirements } from '../../config/x402.config';
import { getSharedResourceServer } from '../../services/x402-server.service';
import { decodePaymentSignatureHeader } from '@x402/core/http';
import { parsePaymentPayload } from '@x402/core/schemas';
import { claimPaymentNonce } from '../../services/payment-nonce.service';

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
 * Authoritative x402 payment binding (issue #103).
 *
 * The middleware only structurally validates the X-Payment header. Here — the
 * first stage where the tool's real price is known (set by TOOL_STATUS) and
 * which runs for BOTH REST and MCP, on cache hits and misses — we verify the
 * signed authorization against SERVER-trusted requirements (payTo, asset,
 * network, exact amount). The facilitator's exact scheme rejects any mismatch
 * (recipient_mismatch / value_mismatch / network_mismatch), so a client cannot
 * underpay or redirect funds and still receive paid data.
 */
async function verifyX402Binding(
  ctx: PipelineContext,
  priceUsd: number,
): Promise<Result<PipelineContext, PipelineError>> {
  const x402Cfg = getX402Config();
  const reject = (reason: string): Result<PipelineContext, PipelineError> => {
    logger.warn(
      { toolId: ctx.toolId, requestId: ctx.requestId, reason },
      'x402 binding: payment not bound to server requirements — rejecting',
    );
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

  const requirements = buildServerX402Requirements(priceUsd);
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
  const ttlSeconds = nonceInfo.validBefore - Math.floor(Date.now() / 1000);
  const claim = await claimOrReject('x402', nonceInfo.nonce, ttlSeconds, priceUsd, {
    toolId: ctx.toolId,
    requestId: ctx.requestId,
  });
  if (!claim.ok) return claim;

  // Authoritative payer for the ledger audit trail (§AP-9).
  ctx.x402Payer = result.payer ?? ctx.x402Payer ?? 'unknown';
  return ok(ctx);
}

/**
 * MPP single-use guard (A-01). mpp.middleware.ts verifies (and settles) the
 * Tempo credential's HMAC before the pipeline runs, but that verification is
 * equally stateless — nothing stops the same credential being replayed in
 * parallel. The credential's HMAC-bound challenge `id` is the unique,
 * server-verifiable identifier for "this exact signed payment"; claim it here
 * before granting access to PROVIDER_CALL.
 */
async function verifyMppReplay(
  ctx: PipelineContext,
  priceUsd: number,
): Promise<Result<PipelineContext, PipelineError>> {
  if (!ctx.mppPaymentHeader) {
    // Should always be set alongside mppPaid — nothing to dedupe on if not.
    return ok(ctx);
  }

  const decoded = decodeMppChallenge(ctx.mppPaymentHeader);
  if (!decoded) {
    // Already passed mppMiddleware's own HMAC verification — nothing more we
    // can bind on, but log it since it means the challenge id is unreadable.
    logger.warn(
      { toolId: ctx.toolId, requestId: ctx.requestId },
      'mpp replay guard: could not decode credential — proceeding without replay check',
    );
    return ok(ctx);
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
    if (ctx.x402Paid) {
      const price = ctx.toolPrice ?? 0;
      if (price > 0) {
        const bound = await verifyX402Binding(ctx, price);
        if (!bound.ok) return bound;
      }
      return ok(ctx);
    }

    // MPP payment verified by middleware (HMAC binds the exact amount) — skip
    // balance deduction (§8.6). Still claim the replay-guard nonce (A-01)
    // before granting access to PROVIDER_CALL.
    if (ctx.mppPaid) {
      const price = ctx.toolPrice ?? 0;
      if (price > 0) {
        const replay = await verifyMppReplay(ctx, price);
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

    // Paid tool with no verified payment — require x402 or MPP signature (§8.6)
    // This enforces per-call payment on ALL channels (REST + MCP).
    // Without this, agents could bypass payment by using MCP with pre-funded balance.
    const x402Cfg = getX402Config();
    if (!ctx.x402Paid && !ctx.mppPaid) {
      logger.info(
        {
          agentId: ctx.agentId,
          toolId: ctx.toolId,
          cost,
          path: ctx.path,
          requestId: ctx.requestId,
        },
        'Payment required — no x402 or MPP payment verified',
      );
      return err<PipelineError>({
        code: 402,
        error: 'payment_required',
        message: `This tool costs $${cost}. Provide x402 (X-Payment header) or MPP (Authorization: Payment) payment.`,
        extra: {
          price_usd: cost,
          payment_address: x402Cfg.paymentAddress,
          price_version: 1,
        },
      });
    }

    // On-chain payment verified — record escrow for ledger tracking
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
