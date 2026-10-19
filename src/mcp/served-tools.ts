import { z } from 'zod';
import { toolSchemas } from '../schemas/index';
import { logger } from '../config/logger';
import { getActiveToolIds } from '../pipeline/stages/tool-status.stage';
import { TOOL_DEFINITIONS } from './tool-definitions';
import type { McpToolDefinition } from './types';

/**
 * T-0502: the TOOL_DEFINITIONS entries tools/list serves right now. The single predicate shared
 * by registerTools (registration) and getManifest (fingerprint manifest), so the two cannot
 * drift. getActiveToolIds() reads an in-memory cache: no DB call, no timer, no async here.
 */
export function servedToolDefinitions(): McpToolDefinition[] {
  const activeIds = getActiveToolIds();
  const served: McpToolDefinition[] = [];

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
    if (!(schema instanceof z.ZodObject)) {
      logger.warn({ tool_id: def.toolId }, 'Schema is not a ZodObject, skipping MCP registration');
      continue;
    }
    served.push(def);
  }
  return served;
}
