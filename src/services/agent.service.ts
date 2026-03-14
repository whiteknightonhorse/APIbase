import { createHash } from 'node:crypto';
import { generateApiKey, hashApiKey } from './api-key.service';
import { getPrisma } from './prisma.service';
import { ensureRedisConnected } from './redis.service';
import { logger } from '../config/logger';

/**
 * Agent Service (§9.3, §12.60, §12.84).
 *
 * Handles explicit registration (POST /api/v1/agents/register)
 * and implicit auto-registration for anonymous agents.
 *
 * KYA levels (Phase 1):
 *   Anonymous — auto-create, 100 req/day, free read-only
 *   Basic    — explicit register, $10/day, free + testnet x402
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegisterAgentInput {
  agentName: string;
  agentVersion: string;
  publicKey?: string;
}

export interface RegisterAgentResult {
  agent_id: string;
  api_key: string;
  status: string;
  tier: string;
  rate_limits: {
    requests_per_second: number;
    daily_limit: number;
  };
}

export interface AutoRegisterResult {
  agent_id: string;
  api_key: string;
  tier: string;
}

// ---------------------------------------------------------------------------
// Rate limit defaults per tier (§12.172)
// ---------------------------------------------------------------------------

const TIER_RATE_LIMITS: Record<string, { requests_per_second: number; daily_limit: number }> = {
  free: { requests_per_second: 10, daily_limit: 100 },
  paid: { requests_per_second: 50, daily_limit: 10000 },
  enterprise: { requests_per_second: 200, daily_limit: 100000 },
};

// ---------------------------------------------------------------------------
// Fingerprint dedup TTL (§12.84)
// ---------------------------------------------------------------------------

const ANON_FINGERPRINT_TTL_SECONDS = 86400; // 24 hours

// ---------------------------------------------------------------------------
// registerAgent — Explicit registration (§9.3)
// ---------------------------------------------------------------------------

/**
 * Register a new agent explicitly via POST /api/v1/agents/register.
 * Creates agent + account in one PG transaction.
 * Returns the API key in plaintext exactly once (§12.60).
 */
export async function registerAgent(input: RegisterAgentInput): Promise<RegisterAgentResult> {
  const db = getPrisma();
  const apiKey = generateApiKey();
  const keyHash = hashApiKey(apiKey);
  const tier = 'free';

  const agent = await db.$transaction(async (tx) => {
    const created = await tx.agent.create({
      data: {
        api_key_hash: keyHash,
        tier,
        status: 'active',
      },
    });

    await tx.account.create({
      data: {
        agent_id: created.agent_id,
        balance_usd: 0,
      },
    });

    return created;
  });

  logger.info(
    {
      agentId: agent.agent_id,
      agentName: input.agentName,
      agentVersion: input.agentVersion,
      tier,
    },
    'Agent registered (explicit)',
  );

  return {
    agent_id: agent.agent_id,
    api_key: apiKey,
    status: agent.status,
    tier: agent.tier,
    rate_limits: TIER_RATE_LIMITS[tier],
  };
}

// ---------------------------------------------------------------------------
// autoRegisterAnonymous — Implicit registration (§9.3, §12.84)
// ---------------------------------------------------------------------------

/**
 * Auto-register an anonymous agent based on IP + User-Agent fingerprint.
 * Deduplication: same fingerprint within 24h returns the same agent (§12.84).
 * If Redis unavailable, creates a new agent (no dedup — acceptable).
 */
export async function autoRegisterAnonymous(
  ip: string,
  userAgent: string,
): Promise<AutoRegisterResult> {
  const db = getPrisma();
  const fingerprint = createFingerprint(ip, userAgent);
  const redisKey = `anon_agent:${fingerprint}`;

  // Check Redis for existing anonymous agent with same fingerprint
  try {
    const r = await ensureRedisConnected();
    const existingAgentId = await r.get(redisKey);

    if (existingAgentId) {
      logger.info(
        { agentId: existingAgentId, fingerprint },
        'Anonymous agent reused from fingerprint',
      );
      return {
        agent_id: existingAgentId,
        api_key: '',
        tier: 'free',
      };
    }
  } catch {
    logger.warn({ fingerprint }, 'Redis unavailable for anonymous agent dedup');
  }

  // Create new anonymous agent
  const apiKey = generateApiKey();
  const keyHash = hashApiKey(apiKey);

  const agent = await db.$transaction(async (tx) => {
    const created = await tx.agent.create({
      data: {
        api_key_hash: keyHash,
        tier: 'free',
        status: 'active',
      },
    });

    await tx.account.create({
      data: {
        agent_id: created.agent_id,
        balance_usd: 0,
      },
    });

    return created;
  });

  // Store fingerprint → agent_id in Redis with 24h TTL (§12.84)
  try {
    const r = await ensureRedisConnected();
    await r.set(redisKey, agent.agent_id, 'EX', ANON_FINGERPRINT_TTL_SECONDS);
  } catch {
    logger.warn(
      { agentId: agent.agent_id, fingerprint },
      'Failed to cache anonymous agent fingerprint',
    );
  }

  logger.info(
    { agentId: agent.agent_id, fingerprint, userAgent },
    'Anonymous agent registered (auto-create)',
  );

  return {
    agent_id: agent.agent_id,
    api_key: apiKey,
    tier: 'free',
  };
}

// ---------------------------------------------------------------------------
// Shutdown
// ---------------------------------------------------------------------------

/** No-op — shared Redis singleton shutdown handled by redis.service.ts. */
export async function shutdownAgentRedis(): Promise<void> {
  // no-op: shared singleton
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a deduplication fingerprint from IP + User-Agent (§12.84).
 */
function createFingerprint(ip: string, userAgent: string): string {
  return createHash('sha256').update(`${ip}:${userAgent}`).digest('hex');
}
