/**
 * MCP tools/call alias resolver (T-0182, task 1 of
 * disputes/0180-smithery-naming-score-98-to-100.ruling-1.md).
 *
 * Split out of tool-adapter.ts on purpose: this module only depends on
 * TOOL_DEFINITIONS (pure data) and the logger, not on the pipeline/adapter
 * stack — so it can be imported (by server.ts, or by a test) without pulling
 * in the whole 13-stage pipeline.
 */

import { logger } from '../config/logger';
import { TOOL_DEFINITIONS } from './tool-definitions';

/**
 * legacy name → current mcpName.
 *
 * Populated today with each tool's 2-level toolId → its 3-level mcpName: the
 * toolId is already the stable internal/REST id, but until now it was not
 * callable over MCP (only mcpName is registered on the McpServer). This map is
 * also where a future mcpName retaxonomy (task 4 of the same ruling, NOT done
 * here) would add old-mcpName → new-mcpName entries, so callers pinned to
 * today's names keep working after that rename ships.
 */
export const TOOL_NAME_ALIASES: ReadonlyMap<string, string> = new Map(
  TOOL_DEFINITIONS.filter((def) => def.mcpName && def.mcpName !== def.toolId).map((def) => [
    def.toolId,
    def.mcpName as string,
  ]),
);

/**
 * Rewrites a `tools/call` JSON-RPC body's tool name in place when it matches a
 * known alias, and logs the substitution. Runs on the raw request body before
 * it reaches the MCP SDK transport (server.ts), so it works the same way for
 * Streamable HTTP and SSE without needing to hook SDK-internal dispatch.
 *
 * `tools/list` is untouched by design: the catalog Smithery (and every other
 * MCP client) sees is still exactly the set of registered mcpNames — only
 * dispatch accepts the extra name.
 */
export function resolveMcpToolAlias(body: unknown, requestId: string): void {
  const messages = Array.isArray(body) ? body : [body];
  for (const message of messages) {
    if (!message || typeof message !== 'object') {
      continue;
    }
    const record = message as Record<string, unknown>;
    if (record.method !== 'tools/call') {
      continue;
    }
    const params = record.params as Record<string, unknown> | undefined;
    const requestedName = params?.name;
    if (!params || typeof requestedName !== 'string') {
      continue;
    }
    const resolvedName = TOOL_NAME_ALIASES.get(requestedName);
    if (resolvedName) {
      logger.info(
        { request_id: requestId, requested_name: requestedName, resolved_name: resolvedName },
        'MCP tools/call: legacy tool name aliased to current mcpName',
      );
      params.name = resolvedName;
    }
  }
}
