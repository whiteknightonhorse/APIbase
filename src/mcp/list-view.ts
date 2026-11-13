/**
 * T-0837 (APIBASE-R4-REQ-1113 ruling-1): the tools/list view of a session on /mcp, fixed at
 * initialize by the URL (`/mcp?tools=lean|shop|all`, same parameter on GET /sse).
 *
 *   lean  - the discovery tools of LEAN_TOOL_IDS that are registered on this server
 *   shop  - lean plus every shop.* tool registered on this server
 *   all   - every registered tool, exactly as before (the handler is not wrapped)
 *
 * A view only filters what tools/list returns. Every tool stays registered, so tools/call of any
 * tool by name reaches the same handler in every view. Storefront servers (/mcp/m/:slug) never
 * get a view.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOL_DEFINITIONS } from './tool-definitions';

export const LIST_VIEWS = ['lean', 'shop', 'all'] as const;
export type ListView = (typeof LIST_VIEWS)[number];

/** The view of a session whose URL has no `tools` parameter. */
export const DEFAULT_LIST_VIEW: ListView = 'all';

/**
 * Tool ids of the lean view. An id that is not registered on the server (apibase.call until
 * T-0838 registers it) is simply absent from the list.
 */
export const LEAN_TOOL_IDS: readonly string[] = [
  'apibase.discover',
  'apibase.categories',
  'apibase.describe',
  'apibase.call',
];

/** Registered (MCP) names of the lean set: each id's mcpName, or the id itself. */
export const LEAN_TOOL_NAMES: ReadonlySet<string> = new Set(
  LEAN_TOOL_IDS.map((id) => TOOL_DEFINITIONS.find((d) => d.toolId === id)?.mcpName || id),
);

export const INVALID_LIST_VIEW_MESSAGE = `Invalid tools parameter: use one of ${LIST_VIEWS.join(', ')} (for example /mcp?tools=lean)`;

/**
 * The view named by a request-derived `tools` value: absent -> DEFAULT_LIST_VIEW; a known string
 * -> that view; anything else (unknown string, array, object) -> null.
 */
export function parseListView(raw: unknown): ListView | null {
  if (raw === undefined) return DEFAULT_LIST_VIEW;
  if (typeof raw !== 'string') return null;
  return (LIST_VIEWS as readonly string[]).includes(raw) ? (raw as ListView) : null;
}

/** Whether a registered tool name is listed in the view. */
export function inListView(view: ListView, name: string): boolean {
  if (view === 'all') return true;
  if (LEAN_TOOL_NAMES.has(name)) return true;
  return view === 'shop' && name.startsWith('shop.');
}

type Handler = (request: unknown, extra: unknown) => Promise<Record<string, unknown>>;

/**
 * Wrap the SDK's tools/list handler so it only renders the tools of the view. Call right after
 * the last tool registration and before withZod3ToolSchemas / withListCacheHints, so neither the
 * SDK's schema rendering nor the zod 3 mirror runs for a dropped tool.
 *
 * The SDK handler reads `_registeredTools` synchronously when it is invoked, so the map is
 * swapped for the filtered one only for the duration of that synchronous call. tools/call reads
 * the full map, so a tool missing from the list is still callable by name.
 */
export function withListView(server: McpServer, view: ListView): McpServer {
  if (view === 'all') return server;
  const handlers = (server.server as unknown as { _requestHandlers: Map<string, Handler> })
    ._requestHandlers;
  const holder = server as unknown as { _registeredTools: Record<string, unknown> };
  const inner = handlers.get('tools/list');
  if (!inner) return server;
  handlers.set('tools/list', (request, extra) => {
    const full = holder._registeredTools;
    const listed: Record<string, unknown> = {};
    for (const [name, tool] of Object.entries(full)) {
      if (inListView(view, name)) listed[name] = tool;
    }
    holder._registeredTools = listed;
    try {
      return inner(request, extra);
    } finally {
      holder._registeredTools = full;
    }
  });
  return server;
}
