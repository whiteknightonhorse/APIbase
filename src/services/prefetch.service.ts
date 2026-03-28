import { randomUUID } from 'node:crypto';
import { createPipelineContext, type PipelineContext } from '../pipeline/types';
import { runPipeline } from '../pipeline/pipeline';
import { logger } from '../config/logger';
import { PREFETCH_RULES } from '../config/prefetch-rules';
import { config } from '../config';

/**
 * Predictive Pre-fetching Service (F8).
 *
 * Fire-and-forget: enqueues pre-fetch calls after successful cache-set.
 * Uses setImmediate to avoid blocking the response pipeline.
 * Results land in Redis cache with normal TTLs for future cache hits.
 *
 * Pre-fetch calls use a platform service account (no agent billing).
 * Controlled by PREFETCH_ENABLED env var (default: false).
 */

const PLATFORM_AGENT_ID = '00000000-0000-0000-0000-000000000001';

export function isEnabled(): boolean {
  return (config as Record<string, unknown>).PREFETCH_ENABLED === 'true';
}

export function enqueuePrefetch(ctx: PipelineContext): void {
  if (!isEnabled()) return;
  if (!ctx.toolId || !ctx.body) return;

  const rules = PREFETCH_RULES[ctx.toolId];
  if (!rules || rules.length === 0) return;

  const body = ctx.body as Record<string, unknown>;

  for (const rule of rules) {
    const params = rule.deriveParams(body);
    if (!params) continue;

    // Fire-and-forget via setImmediate to not block response
    setImmediate(() => {
      executePrefetch(rule.toolId, params, ctx.requestId).catch((err) => {
        logger.warn(
          { err, prefetch_tool: rule.toolId, source_tool: ctx.toolId },
          'Prefetch call failed (non-fatal)',
        );
      });
    });
  }
}

async function executePrefetch(
  toolId: string,
  params: Record<string, unknown>,
  parentRequestId: string,
): Promise<void> {
  const requestId = `prefetch-${parentRequestId}-${randomUUID().slice(0, 8)}`;

  const ctx = createPipelineContext(
    requestId,
    'POST',
    `/api/v1/tools/${toolId}/call`,
    params,
    {
      'content-type': 'application/json',
      'x-request-id': requestId,
    },
  );
  ctx.toolId = toolId;
  ctx.agentId = PLATFORM_AGENT_ID;

  const result = await runPipeline(ctx);

  if (result.ok) {
    logger.info(
      { prefetch_tool: toolId, parent_request_id: parentRequestId, cache_set: result.value.cacheSet },
      'Prefetch completed',
    );
  } else {
    logger.warn(
      { prefetch_tool: toolId, parent_request_id: parentRequestId, error: result.error.message },
      'Prefetch pipeline failed',
    );
  }
}
