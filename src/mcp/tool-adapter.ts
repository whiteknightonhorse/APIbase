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
 * Register all platform tools on an McpServer instance.
 *
 * Each tool callback creates a PipelineContext and runs the 13-stage pipeline.
 * The API key is injected into synthetic headers so the AUTH stage validates it.
 *
 * MCP clients see mcpName (3-level), pipeline uses toolId (2-level).
 */
export function registerTools(server: McpServer, apiKey: string, requestId: string): void {
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
        annotations: def.annotations,
      },
      async (args: Record<string, unknown>) => {
        const ctx = createPipelineContext(requestId, 'POST', '/mcp', args, {
          authorization: `Bearer ${apiKey}`,
        });
        ctx.toolId = toolId;

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
