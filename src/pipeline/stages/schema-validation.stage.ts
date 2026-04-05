import { type Stage, type PipelineContext, type PipelineError, ok, err } from '../types';
import { toolSchemas } from '../../schemas';

/**
 * SCHEMA_VALIDATION stage (§12.43 stage 4).
 * Validates request body against tool-specific zod schema.
 * Uses .strip() to remove unknown keys (MCP agents may send extra fields).
 */
export const schemaValidationStage: Stage = {
  name: 'SCHEMA_VALIDATION',

  async execute(ctx: PipelineContext) {
    if (!ctx.toolId) {
      return ok(ctx);
    }

    const schema = toolSchemas[ctx.toolId];
    if (!schema) {
      return ok(ctx);
    }

    const result = schema.safeParse(ctx.body);

    if (!result.success) {
      const issues = result.error.issues.slice(0, 10).map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }));

      // Extract expected params from schema for agent hints
      const shape = (schema as { shape?: Record<string, unknown> }).shape ?? {};
      const expected_params = Object.keys(shape);

      return err<PipelineError>({
        code: 400,
        error: 'schema_validation_failed',
        message: `Request body validation failed. Expected params: ${expected_params.join(', ')}`,
        extra: {
          tool_id: ctx.toolId,
          issues,
          expected_params,
          received_params: Object.keys((ctx.body ?? {}) as Record<string, unknown>),
          hint: `Fetch schema: GET /api/v1/tools/${ctx.toolId}`,
        },
      });
    }

    return ok({ ...ctx, body: result.data });
  },
};
