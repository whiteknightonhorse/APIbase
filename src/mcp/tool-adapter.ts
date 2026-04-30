/**
 * MCP tool adapter (§12.42, §6.14).
 *
 * Maps all platform tools to MCP server tool registrations.
 * Each tool call routes through the full 13-stage pipeline.
 *
 * mcpName = 3-level dot-notation for MCP clients (Smithery quality score).
 * toolId  = 2-level internal pipeline ID (DB, adapters, schemas).
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toolSchemas } from '../schemas/index';
import { createPipelineContext } from '../pipeline/types';
import { runPipeline } from '../pipeline/pipeline';
import { logger } from '../config/logger';
import { TOOL_DEFINITIONS } from './tool-definitions';
import { getActiveToolIds } from '../pipeline/stages/tool-status.stage';

// Re-export for backward compatibility
export { TOOL_DEFINITIONS } from './tool-definitions';

/**
 * Default outputSchema applied to every tool that doesn't declare its own.
 * Smithery's "Capability Quality > Output schemas" check requires every tool to
 * declare an outputSchema so callers can type-check responses.
 *
 * The platform's response shape varies per tool, but the wrapper structure is
 * consistent: a JSON-serializable result. We expose `result` (the parsed
 * provider response) and an optional `error` so agents know the basic envelope.
 */
const DEFAULT_OUTPUT_SHAPE: Record<string, z.ZodTypeAny> = {
  result: z
    .unknown()
    .describe(
      'Tool response payload. Shape varies per tool — consult the tool description and inputSchema. May be an object, array, string, or number depending on the upstream provider response.',
    ),
  error: z
    .unknown()
    .optional()
    .describe(
      'Present only when the call failed. Includes error code, message, request_id, and any provider-specific extras.',
    ),
};

/**
 * Payment context — mutable ref updated per HTTP request by server.ts.
 * Tool callbacks read this to set x402Paid/mppPaid on the pipeline context.
 */
export interface PaymentContext {
  x402Paid: boolean;
  x402Payer: string | null;
  x402PaymentHeader: string | null;
  mppPaid: boolean;
  mppPayer: string | null;
  mppMethod: string | null;
}

/**
 * Register all platform tools on an McpServer instance.
 *
 * Each tool callback creates a PipelineContext and runs the 13-stage pipeline.
 * The API key is injected into synthetic headers so the AUTH stage validates it.
 *
 * MCP clients see mcpName (3-level), pipeline uses toolId (2-level).
 */
export function registerTools(
  server: McpServer,
  apiKey: string,
  requestId: string,
  paymentCtx?: PaymentContext,
): void {
  const activeIds = getActiveToolIds();

  for (const def of TOOL_DEFINITIONS) {
    // Skip tools marked unavailable in DB (e.g. foursquare without API key)
    if (activeIds.size > 0 && !activeIds.has(def.toolId)) {
      continue;
    }
    const schema = toolSchemas[def.toolId];
    if (!schema) {
      logger.warn({ tool_id: def.toolId }, 'No schema found for tool, skipping MCP registration');
      continue;
    }

    // Extract raw shape from ZodObject for MCP SDK registerTool
    const shape =
      schema instanceof z.ZodObject ? (schema.shape as Record<string, z.ZodTypeAny>) : undefined;

    if (!shape) {
      logger.warn({ tool_id: def.toolId }, 'Schema is not a ZodObject, skipping MCP registration');
      continue;
    }

    const mcpName = def.mcpName || def.toolId;
    const toolId = def.toolId;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK generics cause deep type recursion with complex Zod shapes
    (server.registerTool as any)(
      mcpName,
      {
        title: def.title,
        description: def.description,
        inputSchema: shape,
        outputSchema: DEFAULT_OUTPUT_SHAPE,
        annotations: def.annotations,
      },
      async (args: Record<string, unknown>) => {
        const headers: Record<string, string> = {
          authorization: `Bearer ${apiKey}`,
        };
        // Forward payment headers so pipeline recognizes them
        if (paymentCtx?.x402PaymentHeader) {
          headers['x-payment'] = paymentCtx.x402PaymentHeader;
        }
        const ctx = createPipelineContext(requestId, 'POST', '/mcp', args, headers);
        ctx.toolId = toolId;

        // Set payment flags from the current HTTP request's payment context
        if (paymentCtx) {
          if (paymentCtx.x402Paid) {
            ctx.x402Paid = true;
            ctx.x402Payer = paymentCtx.x402Payer ?? undefined;
            ctx.x402PaymentHeader = paymentCtx.x402PaymentHeader ?? '';
          }
          if (paymentCtx.mppPaid) {
            ctx.mppPaid = true;
            ctx.mppPayer = paymentCtx.mppPayer ?? undefined;
            ctx.mppMethod = paymentCtx.mppMethod ?? undefined;
          }
        }

        const result = await runPipeline(ctx);

        if (result.ok) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result.value.responseBody),
              },
            ],
          };
        }

        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: result.error.error,
                message: result.error.message,
                request_id: requestId,
                ...(result.error.extra ?? {}),
              }),
            },
          ],
        };
      },
    );
  }
}
