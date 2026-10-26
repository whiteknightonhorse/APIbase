/**
 * T-0528: cache hints on MCP list results (MCP revision 2026-07-28: `ttlMs` + `cacheScope`) and the
 * protocol versions this server negotiates, read from the SDK so discovery cannot drift from the code.
 *
 * The catalog and the prices quoted in descriptions are public, and the amount charged is fixed at
 * the 402 challenge, never at listing, so a stale cached list cannot change what is paid.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/sdk/types.js';

/** Newest protocol version the SDK negotiates (what mcp.json advertises). */
export const NEGOTIATED_PROTOCOL_VERSION: string = LATEST_PROTOCOL_VERSION;

/** Every protocol version the SDK negotiates, newest first. */
export const NEGOTIATED_PROTOCOL_VERSIONS: readonly string[] = SUPPORTED_PROTOCOL_VERSIONS;

/** Same 300 s as the Cache-Control max-age of the tool manifest. */
export const LIST_TTL_MS = 300_000;
export const LIST_CACHE_SCOPE = 'public';

const LIST_METHODS = ['tools/list', 'prompts/list', 'resources/list'] as const;

type Handler = (request: unknown, extra: unknown) => Promise<Record<string, unknown>>;

/**
 * Wrap the already-registered list handlers so their results carry ttlMs/cacheScope.
 * Call after every tool/prompt registration. Result schemas in the SDK are loose objects,
 * so legacy-era clients accept and ignore the extra fields. Methods with no handler are skipped.
 */
export function withListCacheHints(server: McpServer): McpServer {
  const handlers = (server.server as unknown as { _requestHandlers: Map<string, Handler> })
    ._requestHandlers;
  for (const method of LIST_METHODS) {
    const inner = handlers.get(method);
    if (!inner) continue;
    handlers.set(method, async (request, extra) => ({
      ...(await inner(request, extra)),
      ttlMs: LIST_TTL_MS,
      cacheScope: LIST_CACHE_SCOPE,
    }));
  }
  return server;
}
