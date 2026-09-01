import { type Stage, type PipelineContext, type PipelineError, ok, err } from '../types';
import { createHash } from 'node:crypto';
import { hashApiKey, isValidApiKeyFormat } from '../../services/api-key.service';
import { getPrisma } from '../../services/prisma.service';
import { ensureRedisConnected } from '../../services/redis.service';
import { logger } from '../../config/logger';
import { X_API_KEY } from '../../config/http-headers';
import { decodePaymentSignatureHeader } from '@x402/core/http';
import { parsePaymentPayload } from '@x402/core/schemas';
import { getX402Config } from '../../config/x402.config';
import { getSharedResourceServer } from '../../services/x402-server.service';

/**
 * AUTH stage (§12.43 stage 1, §12.60).
 * Extract + validate API key, populate agent context.
 *
 * Redis cache: agent:{keyHash} → { agent_id, tier, status }, TTL 60s.
 * Redis failure → PG fallback (never blocks auth, never grants access).
 * Agent data is immutable in Phase 1 — 60s staleness is acceptable.
 */

const AUTH_CACHE_TTL_SECONDS = 60;

interface CachedAgent {
  agent_id: string;
  tier: string;
  status: string;
}

/**
 * Lookup agent by key hash with Redis cache → PG fallback.
 */
async function lookupAgentWithCache(keyHash: string): Promise<CachedAgent | null> {
  const cacheKey = `agent:${keyHash}`;

  // 1. Try Redis cache
  try {
    const r = await ensureRedisConnected();
    const raw = await r.get(cacheKey);
    if (raw) {
      return JSON.parse(raw) as CachedAgent;
    }
  } catch (redisErr) {
    logger.warn({ err: redisErr }, 'Auth cache Redis error — falling through to PG');
  }

  // 2. PG lookup
  const agent = await getPrisma().agent.findUnique({
    where: { api_key_hash: keyHash },
    select: { agent_id: true, tier: true, status: true },
  });

  if (!agent) {
    return null;
  }

  // 3. Fire-and-forget cache write
  const cached: CachedAgent = { agent_id: agent.agent_id, tier: agent.tier, status: agent.status };
  ensureRedisConnected()
    .then((r) => r.set(cacheKey, JSON.stringify(cached), 'EX', AUTH_CACHE_TTL_SECONDS))
    .catch((cacheErr) => {
      logger.warn({ err: cacheErr }, 'Auth cache write failed — non-blocking');
    });

  return cached;
}

/**
 * Ensure an agent record exists for an MPP payer (Tempo wallet address).
 * Uses deterministic api_key_hash derived from wallet address for upsert.
 * Creates agent on first payment, reuses on subsequent payments.
 */
async function ensureMppAgent(walletAddress: string): Promise<CachedAgent> {
  // Deterministic hash from wallet address — acts as unique key
  const mppKeyHash = createHash('sha256').update(`mpp:${walletAddress}`).digest('hex');
  const cacheKey = `agent:${mppKeyHash}`;

  // Check Redis cache first
  try {
    const r = await ensureRedisConnected();
    const raw = await r.get(cacheKey);
    if (raw) return JSON.parse(raw) as CachedAgent;
  } catch {
    /* fall through to PG */
  }

  const db = getPrisma();

  // Check PG
  const existing = await db.agent.findUnique({
    where: { api_key_hash: mppKeyHash },
    select: { agent_id: true, tier: true, status: true },
  });

  if (existing) {
    const cached: CachedAgent = {
      agent_id: existing.agent_id,
      tier: existing.tier,
      status: existing.status,
    };
    ensureRedisConnected()
      .then((r) => r.set(cacheKey, JSON.stringify(cached), 'EX', AUTH_CACHE_TTL_SECONDS))
      .catch(() => {});
    return cached;
  }

  // Create new MPP agent
  const newAgent = await db.agent.create({
    data: {
      api_key_hash: mppKeyHash,
      tier: 'paid',
      status: 'active',
    },
    select: { agent_id: true, tier: true, status: true },
  });

  logger.info(
    { agent_id: newAgent.agent_id, wallet: walletAddress },
    'Auto-registered MPP agent by Tempo wallet',
  );

  const cached: CachedAgent = {
    agent_id: newAgent.agent_id,
    tier: newAgent.tier,
    status: newAgent.status,
  };
  ensureRedisConnected()
    .then((r) => r.set(cacheKey, JSON.stringify(cached), 'EX', AUTH_CACHE_TTL_SECONDS))
    .catch(() => {});

  return cached;
}

/**
 * Decode an x402 X-Payment header just far enough to read the signed
 * authorization's claimed `value` (amount) -- mirrors escrow.stage.ts's own
 * independent re-decode (this file does not import that one's private
 * helpers, same reasoning: no cross-stage coupling on internal parsing).
 */
function extractX402PayloadAndAmount(
  paymentHeader: string,
): { payload: unknown; amount: string } | null {
  try {
    const decoded = decodePaymentSignatureHeader(paymentHeader);
    const parsed = parsePaymentPayload(decoded);
    if (!parsed.success) return null;
    const payload = parsed.data;
    const raw = (payload as { payload?: Record<string, unknown> } | undefined)?.payload;
    if (!raw || typeof raw !== 'object') return null;
    const auth = (raw.authorization ?? raw.permit2Authorization) as
      | Record<string, unknown>
      | undefined;
    const value = auth?.value;
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    return { payload, amount: String(value) };
  } catch {
    return null;
  }
}

/**
 * ШАГ 5 (2026-09-02, x402 wallet auto-registration parity): verify a bare
 * X-Payment credential (no API key) well enough to trust the signer as an
 * identity -- mirrors ensureMppAgent's role for MPP, adapted to x402's real
 * constraint: FULL binding (payTo/asset/network/AMOUNT against the tool's
 * real price) needs the price, which AUTH doesn't know yet for an MCP call
 * (the toolId lives in the JSON-RPC body -- see escrow.stage.ts's own
 * comment on why binding is deferred to ESCROW). This verifies the part
 * that does NOT need the price: a real cryptographic signature bound to
 * OUR payTo/network/asset, for whatever amount the client's own signed
 * payload claims. That is enough to prove "a real wallet signed a real
 * x402 authorization to pay us" without yet judging whether it is enough
 * for any specific tool -- ESCROW re-verifies fully (real price, real
 * binding) before any provider call, and A-01's nonce-claim replay guard
 * there is completely unchanged by this.
 *
 * ⛔ Order is load-bearing: this MUST run and return a payer before
 * ensureX402Agent() ever touches the DB. A garbage/forged X-Payment fails
 * verifyPayment() (bad signature, wrong payTo/network) and this returns
 * null -- zero agent rows created, same 401 as before this fix existed.
 */
async function verifyX402ForAuth(paymentHeader: string): Promise<string | null> {
  const extracted = extractX402PayloadAndAmount(paymentHeader);
  if (!extracted) return null;

  const x402Cfg = getX402Config();
  const requirements = {
    scheme: 'exact',
    network: x402Cfg.network,
    asset: x402Cfg.usdcAddress,
    // The client's OWN claimed amount, not a real tool's price (unknown at
    // AUTH time) -- this checks the signature is real, not that it covers
    // any particular call. See the function doc above.
    amount: extracted.amount,
    payTo: x402Cfg.paymentAddress,
    maxTimeoutSeconds: x402Cfg.maxTimeoutSeconds,
    extra: { name: 'USD Coin', version: '2' },
  };

  try {
    const result = await getSharedResourceServer().verifyPayment(
      extracted.payload as never,
      requirements as never,
    );
    if (!result.isValid || !result.payer) return null;
    return result.payer;
  } catch (verifyErr) {
    logger.warn(
      { err: verifyErr instanceof Error ? verifyErr.message : String(verifyErr) },
      'x402 auto-registration: verify threw -- failing closed, no agent created',
    );
    return null;
  }
}

/**
 * Ensure an agent record exists for an x402 payer (EVM wallet address).
 * Same shape as ensureMppAgent -- deterministic api_key_hash derived from
 * the (lowercased, so case differences in the same address don't fork
 * identity) wallet address, so the SAME wallet paying twice always
 * resolves to the SAME agent, with no key issuance step required.
 */
async function ensureX402Agent(walletAddress: string): Promise<CachedAgent> {
  const x402KeyHash = createHash('sha256')
    .update(`x402:${walletAddress.toLowerCase()}`)
    .digest('hex');
  const cacheKey = `agent:${x402KeyHash}`;

  try {
    const r = await ensureRedisConnected();
    const raw = await r.get(cacheKey);
    if (raw) return JSON.parse(raw) as CachedAgent;
  } catch {
    /* fall through to PG */
  }

  const db = getPrisma();

  const existing = await db.agent.findUnique({
    where: { api_key_hash: x402KeyHash },
    select: { agent_id: true, tier: true, status: true },
  });

  if (existing) {
    const cached: CachedAgent = {
      agent_id: existing.agent_id,
      tier: existing.tier,
      status: existing.status,
    };
    ensureRedisConnected()
      .then((r) => r.set(cacheKey, JSON.stringify(cached), 'EX', AUTH_CACHE_TTL_SECONDS))
      .catch(() => {});
    return cached;
  }

  const newAgent = await db.agent.create({
    data: {
      api_key_hash: x402KeyHash,
      tier: 'paid',
      status: 'active',
    },
    select: { agent_id: true, tier: true, status: true },
  });

  logger.info(
    { agent_id: newAgent.agent_id, wallet: walletAddress },
    'Auto-registered x402 agent by EVM wallet',
  );

  const cached: CachedAgent = {
    agent_id: newAgent.agent_id,
    tier: newAgent.tier,
    status: newAgent.status,
  };
  ensureRedisConnected()
    .then((r) => r.set(cacheKey, JSON.stringify(cached), 'EX', AUTH_CACHE_TTL_SECONDS))
    .catch(() => {});

  return cached;
}

export const authStage: Stage = {
  name: 'AUTH',

  async execute(ctx: PipelineContext) {
    // Skip auth for pre-authenticated contexts (batch sub-calls, prefetch).
    // Only internal code can set agentId before pipeline — external requests
    // create fresh contexts via createPipelineContext() which never sets it.
    if (ctx.agentId) {
      return ok(ctx);
    }

    const authHeader = ctx.headers['authorization'];
    const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;

    // Fallback: if no Authorization header, check X-API-Key (MPP agents use this)
    if (!headerValue) {
      const xApiKey = ctx.headers[X_API_KEY];
      const apiKeyFallback = Array.isArray(xApiKey) ? xApiKey[0] : xApiKey;

      if (apiKeyFallback && isValidApiKeyFormat(apiKeyFallback)) {
        const keyHash = hashApiKey(apiKeyFallback);
        const agent = await lookupAgentWithCache(keyHash);
        if (agent && agent.status === 'active') {
          return ok({
            ...ctx,
            agentId: agent.agent_id,
            tier: agent.tier as PipelineContext['tier'],
          });
        }
      }

      // ШАГ 5 (2026-09-02): x402 wallet auto-registration parity with MPP.
      // A valid X-Payment with no API key and no Authorization header must
      // not dead-end at the 401 below -- verify FIRST (real signature check
      // against our own payTo/network/asset), only THEN auto-register.
      if (ctx.x402Paid && ctx.x402PaymentHeader) {
        const payer = await verifyX402ForAuth(ctx.x402PaymentHeader);
        if (payer) {
          const x402Agent = await ensureX402Agent(payer);
          return ok({
            ...ctx,
            agentId: x402Agent.agent_id,
            tier: x402Agent.tier as PipelineContext['tier'],
          });
        }
      }

      return err<PipelineError>({
        code: 401,
        error: 'unauthorized',
        message:
          'Missing Authorization header. Send Authorization: Bearer <api_key> or X-API-Key: <api_key>',
      });
    }

    const parts = headerValue.split(' ');

    // MPP Payment credential — Authorization: Payment replaces Bearer per MPP spec.
    // Agent identified via X-API-Key header or auto-registered by Tempo wallet address.
    if (parts[0] === 'Payment') {
      // Try X-API-Key header as alternative auth (agent sends both API key + MPP payment)
      const xApiKey = ctx.headers[X_API_KEY];
      const apiKeyAlt = Array.isArray(xApiKey) ? xApiKey[0] : xApiKey;

      if (apiKeyAlt && isValidApiKeyFormat(apiKeyAlt)) {
        const keyHash = hashApiKey(apiKeyAlt);
        const agent = await lookupAgentWithCache(keyHash);
        if (agent && agent.status === 'active') {
          return ok({
            ...ctx,
            agentId: agent.agent_id,
            tier: agent.tier as PipelineContext['tier'],
          });
        }
      }

      // MPP payment without API key — payment IS authentication (per MPP spec)
      // Auto-register agent by Tempo wallet address (upsert into agents table)
      if (ctx.mppPaid) {
        const walletAddr = ctx.mppPayer || 'mpp-anonymous';
        const mppAgent = await ensureMppAgent(walletAddr);
        return ok({
          ...ctx,
          agentId: mppAgent.agent_id,
          tier: mppAgent.tier as PipelineContext['tier'],
        });
      }

      // Authorization: Payment present but not verified — reject
      return err<PipelineError>({
        code: 401,
        error: 'unauthorized',
        message: 'Invalid MPP payment credential',
      });
    }

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return err<PipelineError>({
        code: 401,
        error: 'unauthorized',
        message: 'Authorization header must be: Bearer <api_key>',
      });
    }

    const apiKey = parts[1];
    if (!isValidApiKeyFormat(apiKey)) {
      return err<PipelineError>({
        code: 401,
        error: 'unauthorized',
        message: 'Invalid API key format',
      });
    }

    const keyHash = hashApiKey(apiKey);
    const agent = await lookupAgentWithCache(keyHash);

    if (!agent) {
      return err<PipelineError>({ code: 401, error: 'unauthorized', message: 'Invalid API key' });
    }

    if (agent.status !== 'active') {
      return err<PipelineError>({
        code: 403,
        error: 'forbidden',
        message: `Agent is ${agent.status}`,
      });
    }

    return ok({
      ...ctx,
      agentId: agent.agent_id,
      tier: agent.tier as PipelineContext['tier'],
    });
  },
};
