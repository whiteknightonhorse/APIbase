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
    const skip = skipReason(def, activeIds);
    if (skip === 'no_schema') {
      logger.warn({ tool_id: def.toolId }, 'No schema found for tool, skipping MCP registration');
    } else if (skip === 'not_object') {
      logger.warn({ tool_id: def.toolId }, 'Schema is not a ZodObject, skipping MCP registration');
    }
    if (skip === null) served.push(def);
  }
  return served;
}

/** T-0838: the same predicate for one definition, without logging (apibase.call target lookup). */
export function isServedTool(def: McpToolDefinition): boolean {
  return skipReason(def, getActiveToolIds()) === null;
}

function skipReason(
  def: McpToolDefinition,
  activeIds: ReadonlySet<string>,
): 'inactive' | 'no_schema' | 'not_object' | null {
  // Skip tools marked unavailable in DB (e.g. foursquare without API key)
  if (activeIds.size > 0 && !activeIds.has(def.toolId)) return 'inactive';
  const schema = toolSchemas[def.toolId];
  if (!schema) return 'no_schema';
  if (!(schema instanceof z.ZodObject)) return 'not_object';
  return null;
}
