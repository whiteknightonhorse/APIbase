/**
 * MCP tool definition types (§12.42, §6.14).
 */

import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

export interface McpToolDefinition {
  toolId: string;
  mcpName?: string;
  description: string;
  title?: string;
  category?: string;
  annotations?: ToolAnnotations;
  /** Related tools agents should consider calling together. Shown in discover_tools output. */
  relatedTools?: { toolId: string; reason: string }[];
}
