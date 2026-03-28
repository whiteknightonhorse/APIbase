import { type Stage, type PipelineContext, type PipelineError, ok, err } from '../types';
import { createHash } from 'node:crypto';
import { hashApiKey, isValidApiKeyFormat } from '../../services/api-key.service';
import { getPrisma } from '../../services/prisma.service';
import { ensureRedisConnected } from '../../services/redis.service';
import { logger } from '../../config/logger';

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
  } catch { /* fall through to PG */ }

  const db = getPrisma();

  // Check PG
  const existing = await db.agent.findUnique({
    where: { api_key_hash: mppKeyHash },
    select: { agent_id: true, tier: true, status: true },
  });

  if (existing) {
    const cached: CachedAgent = { agent_id: existing.agent_id, tier: existing.tier, status: existing.status };
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

  logger.info({ agent_id: newAgent.agent_id, wallet: walletAddress }, 'Auto-registered MPP agent by Tempo wallet');

  const cached: CachedAgent = { agent_id: newAgent.agent_id, tier: newAgent.tier, status: newAgent.status };
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
      const xApiKey = ctx.headers['x-api-key'];
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

      return err<PipelineError>({
        code: 401,
        error: 'unauthorized',
        message: 'Missing Authorization header. Send Authorization: Bearer <api_key> or X-API-Key: <api_key>',
      });
    }

    const parts = headerValue.split(' ');

    // MPP Payment credential — Authorization: Payment replaces Bearer per MPP spec.
    // Agent identified via X-API-Key header or auto-registered by Tempo wallet address.
    if (parts[0] === 'Payment') {
      // Try X-API-Key header as alternative auth (agent sends both API key + MPP payment)
      const xApiKey = ctx.headers['x-api-key'];
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
