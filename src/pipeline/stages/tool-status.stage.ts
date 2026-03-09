import { type Stage, ok, err, type PipelineError } from '../types';
import { PrismaClient } from '@prisma/client';

/**
 * TOOL_STATUS stage (§12.43 stage 5, §12.114).
 * Check tool exists and is not unavailable.
 */

let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

export const toolStatusStage: Stage = {
  name: 'TOOL_STATUS',

  async execute(ctx) {
    if (!ctx.toolId) {
      return err<PipelineError>({ code: 400, error: 'bad_request', message: 'Missing tool_id' });
    }

    const tool = await getPrisma().tool.findUnique({
      where: { tool_id: ctx.toolId },
      select: { tool_id: true, status: true, price_usd: true, cache_ttl: true },
    });

    if (!tool) {
      return err<PipelineError>({
        code: 404,
        error: 'not_found',
        message: `Tool not found: ${ctx.toolId}`,
      });
    }

    if (tool.status === 'unavailable') {
      return err<PipelineError>({
        code: 503,
        error: 'provider_unavailable',
        message: `Tool ${ctx.toolId} is currently unavailable`,
        retryAfter: 30,
      });
    }

    ctx.toolPrice = Number(tool.price_usd);
    ctx.toolCacheTtl = tool.cache_ttl;

    return ok(ctx);
  },
};
