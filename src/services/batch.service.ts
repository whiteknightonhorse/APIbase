import { createPipelineContext } from '../pipeline/types';
import { runPipeline } from '../pipeline/pipeline';
import { logger } from '../config/logger';
import type { BatchCallInput, BatchCallResult, BatchResponse } from '../adapters/platform/types';

/**
 * Batch execution service (F1: Batch API).
 *
 * Fans out multiple tool calls, each running the full 13-stage pipeline
 * independently (own auth, escrow, ledger row). Capped concurrency
 * via chunked Promise.allSettled.
 *
 * Two calling modes:
 *  - MCP path: agentId pre-set from parent pipeline (already authenticated)
 *  - REST path: authHeader forwarded so each sub-call authenticates via AUTH stage
 *
 * Billing: each sub-call pays through its own pipeline escrow.
 * The batch wrapper itself is $0.
 */

export interface BatchOptions {
  agentId?: string;
  authHeader?: string;
  parentRequestId: string;
  calls: BatchCallInput[];
  maxParallel: number;
}

export async function runBatch(opts: BatchOptions): Promise<BatchResponse> {
  const { parentRequestId, calls, maxParallel, agentId, authHeader } = opts;
  const batchStart = performance.now();
  const results: BatchCallResult[] = [];

  // Process in chunks of maxParallel
  for (let i = 0; i < calls.length; i += maxParallel) {
    const chunk = calls.slice(i, i + maxParallel);

    const settled = await Promise.allSettled(
      chunk.map((call, idx) =>
        executeSingleCall(agentId, authHeader, parentRequestId, call, i + idx),
      ),
    );

    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value);
      } else {
        results.push({
          tool_id: 'unknown',
          status: 'error',
          error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
          cost_usd: 0,
          duration_ms: 0,
        });
      }
    }
  }

  const totalCost = results.reduce((sum, r) => sum + r.cost_usd, 0);
  const totalDuration = Math.round(performance.now() - batchStart);

  logger.info({
    parent_request_id: parentRequestId,
    agent_id: agentId ?? 'from-auth-header',
    total_calls: calls.length,
    successful: results.filter((r) => r.status === 'success').length,
    total_cost_usd: totalCost,
    total_duration_ms: totalDuration,
  }, 'Batch execution completed');

  return {
    results,
    total_cost_usd: Math.round(totalCost * 100000000) / 100000000,
    total_duration_ms: totalDuration,
  };
}

async function executeSingleCall(
  agentId: string | undefined,
  authHeader: string | undefined,
  parentRequestId: string,
  call: BatchCallInput,
  index: number,
): Promise<BatchCallResult> {
  const requestId = `${parentRequestId}-batch-${index}`;
  const start = performance.now();

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-request-id': requestId,
  };

  // Forward auth — either Bearer token or API key
  if (authHeader) {
    headers['authorization'] = authHeader;
  }

  if (call.idempotency_key) {
    headers['x-idempotency-key'] = call.idempotency_key;
  }

  const ctx = createPipelineContext(
    requestId,
    'POST',
    `/api/v1/tools/${call.tool_id}/call`,
    call.params,
    headers,
  );
  ctx.toolId = call.tool_id;

  // If agentId is known (MCP path), pre-set so AUTH stage skips re-validation
  if (agentId) {
    ctx.agentId = agentId;
  }

  const result = await runPipeline(ctx);
  const durationMs = Math.round(performance.now() - start);

  if (result.ok) {
    return {
      tool_id: call.tool_id,
      status: 'success',
      data: result.value.responseBody,
      cost_usd: result.value.finalCost ?? 0,
      duration_ms: durationMs,
    };
  }

  return {
    tool_id: call.tool_id,
    status: 'error',
    error: result.error.message,
    cost_usd: 0,
    duration_ms: durationMs,
  };
}
