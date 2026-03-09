import type { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { hashApiKey, isValidApiKeyFormat } from '../services/api-key.service';
import { AppError, ErrorCode } from '../types/errors';
import type { AgentContext } from '../types/request';

// Import request types for side-effect (global augmentation)
import '../types/request';

/**
 * Auth middleware — API key validation (§9.3, §12.60, §12.43 AUTH stage).
 *
 * Flow:
 *   1. Extract Authorization: Bearer <key> header
 *   2. Validate format (ak_live_ or ak_test_ + 32 hex)
 *   3. SHA-256(key) → lookup agents.api_key_hash
 *   4. Not found → 401 unauthorized
 *   5. Agent status != active → 403 forbidden
 *   6. Set req.agent = { agent_id, tier, status }
 *
 * Never trust client-provided agent_id from request body (§4.4).
 */

let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing Authorization header');
    }

    // Extract Bearer token
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Authorization header must be: Bearer <api_key>');
    }

    const apiKey = parts[1];

    // Validate key format
    if (!isValidApiKeyFormat(apiKey)) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Invalid API key format');
    }

    // Hash and lookup
    const keyHash = hashApiKey(apiKey);
    const agent = await getPrisma().agent.findUnique({
      where: { api_key_hash: keyHash },
      select: {
        agent_id: true,
        tier: true,
        status: true,
      },
    });

    if (!agent) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Invalid API key');
    }

    // Check agent status
    if (agent.status !== 'active') {
      throw new AppError(ErrorCode.FORBIDDEN, `Agent is ${agent.status}`);
    }

    // Populate request context (§9.3)
    req.agent = {
      agent_id: agent.agent_id,
      tier: agent.tier as AgentContext['tier'],
      status: agent.status,
    };

    // Enrich logger with agent context
    req.log = req.log.child({ agent_id: agent.agent_id });

    next();
  } catch (err) {
    next(err);
  }
}

/** Shut down the Prisma client (called during graceful shutdown). */
export async function shutdownAuthPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
