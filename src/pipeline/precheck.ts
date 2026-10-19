import type { PipelineError } from './types';
import { toolSchemas } from '../schemas';
import { schemaFailureStatus } from '../pricing/audio-minute';
import { checkToolAvailability } from './stages/tool-status.stage';

/**
 * Pre-payment checks (T-0338), shared by AUTH's 402 branch and the MPP middleware:
 * never offer a payment challenge for a call that cannot be served.
 */

export interface BodySchemaFailure {
  issues: Array<{ path: string; message: string; code: string }>;
  expected_params: string[];
  received_params: string[];
}

/**
 * T-0282 (moved here by T-0338): null when the body satisfies the tool's zod schema (or the tool
 * has none), otherwise the issues / expected_params / received_params of the 400.
 */
export function bodySchemaFailure(toolId: string, body: unknown): BodySchemaFailure | null {
  const schema = toolSchemas[toolId];
  if (!schema) return null;
  const result = schema.safeParse(body);
  if (result.success) return null;
  return {
    issues: result.error.issues.slice(0, 10).map((i) => ({
      path: i.path.join('.'),
      message: i.message,
      code: i.code,
    })),
    expected_params: Object.keys((schema as { shape?: Record<string, unknown> }).shape ?? {}),
    received_params: Object.keys((body ?? {}) as Record<string, unknown>),
  };
}

/**
 * Tool-status + zod pre-check: unknown tool -> 404, `unavailable` -> 503 provider_unavailable
 * (same body as TOOL_STATUS, alternatives included), invalid body -> 400
 * schema_validation_failed (same body as SCHEMA_VALIDATION). null = safe to challenge for payment.
 */
export async function precheckToolCall(
  toolId: string,
  body: unknown,
): Promise<PipelineError | null> {
  const statusError = await checkToolAvailability(toolId);
  if (statusError) return statusError;

  const failure = bodySchemaFailure(toolId, body);
  if (!failure) return null;
  return {
    code: schemaFailureStatus(
      toolId,
      failure.issues.map((i) => i.path),
    ),
    error: 'schema_validation_failed',
    message: `Request body validation failed. Expected params: ${failure.expected_params.join(', ')}`,
    extra: {
      tool_id: toolId,
      issues: failure.issues,
      expected_params: failure.expected_params,
      received_params: failure.received_params,
      hint: `Fetch schema: GET /api/v1/tools/${toolId}`,
    },
  };
}
