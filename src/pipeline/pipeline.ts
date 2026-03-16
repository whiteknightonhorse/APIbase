import { logger } from '../config/logger';
import { releaseLock } from '../services/cache.service';
import {
  type Stage,
  type PipelineContext,
  type PipelineError,
  type Result,
  type StageName,
  STAGE_NAMES,
  err,
} from './types';

// Import stages
import { authStage } from './stages/auth.stage';
import { idempotencyStage } from './stages/idempotency.stage';
import { contentNegotiationStage } from './stages/content-negotiation.stage';
import { schemaValidationStage } from './stages/schema-validation.stage';
import { toolStatusStage } from './stages/tool-status.stage';
import { cacheStage } from './stages/cache.stage';
import { rateLimitStage } from './stages/rate-limit.stage';
import { escrowStage } from './stages/escrow.stage';
import { providerCallStage } from './stages/provider-call.stage';
import { escrowFinalizeStage } from './stages/escrow-finalize.stage';
import { ledgerWriteStage } from './stages/ledger-write.stage';
import { cacheSetStage } from './stages/cache-set.stage';
import { responseStage } from './stages/response.stage';

/**
 * 13-stage pipeline (§12.43, §12.157).
 *
 * Order is NEVER changed. Programmatically enforced at module load.
 * Each stage has typed I/O (Result<T,E> pattern).
 * Pipeline stops on first error.
 */
export const PIPELINE_STAGES: Stage[] = [
  authStage,
  idempotencyStage,
  contentNegotiationStage,
  schemaValidationStage,
  toolStatusStage,
  cacheStage,
  rateLimitStage,
  escrowStage,
  providerCallStage,
  escrowFinalizeStage,
  ledgerWriteStage,
  cacheSetStage,
  responseStage,
];

// ---------------------------------------------------------------------------
// Compile-time order verification (§12.157)
// ---------------------------------------------------------------------------

function verifyStageOrder(): void {
  if (PIPELINE_STAGES.length !== STAGE_NAMES.length) {
    throw new Error(
      `Pipeline stage count mismatch: got ${PIPELINE_STAGES.length}, expected ${STAGE_NAMES.length}`,
    );
  }

  for (let i = 0; i < STAGE_NAMES.length; i++) {
    const expected: StageName = STAGE_NAMES[i];
    const actual = PIPELINE_STAGES[i].name;
    if (actual !== expected) {
      throw new Error(
        `Pipeline stage order violation at index ${i}: got "${actual}", expected "${expected}"`,
      );
    }
  }
}

// Verify on module load — fail-fast if stages are reordered
verifyStageOrder();

// ---------------------------------------------------------------------------
// Pipeline executor
// ---------------------------------------------------------------------------

/**
 * Run all 13 pipeline stages sequentially (§12.170).
 * Stops on first error. Returns Result with final context or error.
 */
export async function runPipeline(
  input: PipelineContext,
): Promise<Result<PipelineContext, PipelineError>> {
  let ctx = input;

  for (const stage of PIPELINE_STAGES) {
    ctx.currentStage = stage.name;
    const startMs = Date.now();

    try {
      const result = await stage.execute(ctx);

      const durationMs = Date.now() - startMs;
      if (ctx.stageTimings) {
        ctx.stageTimings[stage.name] = durationMs;
      }

      if (!result.ok) {
        logger.warn(
          {
            request_id: ctx.requestId,
            stage: stage.name,
            duration_ms: durationMs,
            error_code: result.error.code,
          },
          `Pipeline stopped at ${stage.name}: ${result.error.message}`,
        );
        // Release single-flight lock if owned (prevents 30s hang on stages 7-12 errors)
        if (ctx.isLockOwner && ctx.cacheKey) {
          await releaseLock(ctx.cacheKey).catch(() => {});
        }
        return result;
      }

      ctx = result.value;
    } catch (e) {
      const durationMs = Date.now() - startMs;
      logger.error(
        {
          request_id: ctx.requestId,
          stage: stage.name,
          duration_ms: durationMs,
          err: e,
        },
        `Pipeline error at ${stage.name}`,
      );

      // Release single-flight lock if owned (prevents 30s hang on uncaught errors)
      if (ctx.isLockOwner && ctx.cacheKey) {
        await releaseLock(ctx.cacheKey).catch(() => {});
      }

      return err({
        code: 500,
        error: 'internal_error',
        message: `Unexpected error in ${stage.name}`,
      });
    }
  }

  return { ok: true, value: ctx };
}
