import { type Stage, type PipelineContext, type PipelineError, ok, err } from '../types';
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

export const authStage: Stage = {
  name: 'AUTH',

  async execute(ctx: PipelineContext) {
    const authHeader = ctx.headers['authorization'];
    const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;

    if (!headerValue) {
      return err<PipelineError>({
        code: 401,
        error: 'unauthorized',
        message: 'Missing Authorization header',
      });
    }

    const parts = headerValue.split(' ');
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
