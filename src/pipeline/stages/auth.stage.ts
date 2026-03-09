import { type Stage, type PipelineContext, type PipelineError, ok, err } from '../types';
import { hashApiKey, isValidApiKeyFormat } from '../../services/api-key.service';
import { PrismaClient } from '@prisma/client';

/**
 * AUTH stage (§12.43 stage 1, §12.60).
 * Extract + validate API key, populate agent context.
 */

let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
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
    const agent = await getPrisma().agent.findUnique({
      where: { api_key_hash: keyHash },
      select: { agent_id: true, tier: true, status: true },
    });

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
