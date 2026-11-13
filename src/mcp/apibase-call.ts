/**
 * T-0838 (APIBASE-R4-REQ-1113 ruling-1): `apibase.call` (MCP name `apibase.tools.call`), the one
 * listed tool that calls any served tool by id, for clients that only call listed tools
 * (`/mcp?tools=lean`).
 *
 * It is a rewrite of the request, not a second executor. A tools/call of apibase.call (either name
 * form) whose target resolves is turned, in the raw JSON-RPC body, into the tools/call of the
 * target: `params.name` = the target's registered name, `params.arguments` = the given arguments,
 * `params._meta` untouched. The rewrite runs as app middleware right after body parsing
 * (src/api/app.ts), ahead of everything that reads the body to find a tool or a price:
 * x402Middleware (`_meta` payment), mppMiddleware, the session funnel (noteRequest) and
 * resolveMcpToolAlias in src/mcp/server.ts, and the SDK dispatch that picks the handler. From
 * there on the request IS the direct call: same handler, same pipeline tool id, same 402 body,
 * same ledger row, same counters.
 *
 * When the target does not resolve (unknown id, apibase.call or platform.call_batch, a shop.*
 * tool, arguments not an object) the body is left as it is and the registered handler of
 * apibase.call answers with a tool error carrying error_code and a next step. That handler runs
 * no pipeline, so nothing is charged and no ledger row is written.
 */
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger';
import { TOOL_DEFINITIONS } from './tool-definitions';
import { TOOL_NAME_ALIASES } from './tool-alias-resolver';
import { isServedTool } from './served-tools';
import type { McpToolDefinition } from './types';

export const APIBASE_CALL_TOOL_ID = 'apibase.call';
const BATCH_TOOL_ID = 'platform.call_batch';

/** Registered (MCP) name of a definition: its mcpName, or its toolId. */
const registeredName = (def: McpToolDefinition): string => def.mcpName || def.toolId;

const DEF_BY_NAME: ReadonlyMap<string, McpToolDefinition> = new Map(
  TOOL_DEFINITIONS.map((def) => [registeredName(def), def]),
);

/** Both name forms (toolId and mcpName) of a definition. */
function namesOf(toolId: string): string[] {
  const def = TOOL_DEFINITIONS.find((d) => d.toolId === toolId);
  return def ? [...new Set([def.toolId, registeredName(def)])] : [toolId];
}

/** Both name forms of apibase.call: a tools/call with one of these names is a rewrite candidate. */
export const APIBASE_CALL_NAMES: ReadonlySet<string> = new Set(namesOf(APIBASE_CALL_TOOL_ID));

/** Targets apibase.call refuses because they are wrappers themselves. */
const WRAPPER_NAMES: ReadonlySet<string> = new Set([
  ...namesOf(APIBASE_CALL_TOOL_ID),
  ...namesOf(BATCH_TOOL_ID),
]);

export type ApibaseCallErrorCode =
  | 'UNKNOWN_TOOL_ID'
  | 'TARGET_NOT_ALLOWED'
  | 'SHOP_TOOL_BY_NAME'
  | 'ARGUMENTS_NOT_OBJECT'
  | 'CALL_NOT_REWRITTEN';

export interface ApibaseCallRefusal {
  error_code: ApibaseCallErrorCode;
  message: string;
  next_step: string;
}

export type ApibaseCallPlan =
  | { ok: true; name: string; args: Record<string, unknown> }
  | { ok: false; refusal: ApibaseCallRefusal };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function refuse(error_code: ApibaseCallErrorCode, message: string, next_step: string) {
  return { ok: false as const, refusal: { error_code, message, next_step } };
}

/**
 * What a tools/call of apibase.call with these arguments becomes: the registered name of the
 * target and its arguments, or the refusal. `input` is the request-derived `params.arguments` of
 * apibase.call, so every field is type-checked before use.
 */
export function planApibaseCall(input: unknown): ApibaseCallPlan {
  const toolId: unknown = isPlainObject(input) ? input.tool_id : undefined;
  if (typeof toolId !== 'string' || toolId === '') {
    return refuse(
      'UNKNOWN_TOOL_ID',
      'tool_id must be the id or MCP name of a tool.',
      'Call apibase.discover to find a tool id.',
    );
  }
  const name = TOOL_NAME_ALIASES.get(toolId) ?? toolId;
  if (WRAPPER_NAMES.has(toolId) || WRAPPER_NAMES.has(name)) {
    return refuse(
      'TARGET_NOT_ALLOWED',
      `apibase.call cannot call ${toolId}: it calls one tool, not a wrapper.`,
      `Call ${name} by name with tools/call, or call each tool through apibase.call.`,
    );
  }
  if (toolId.startsWith('shop.') || name.startsWith('shop.')) {
    return refuse(
      'SHOP_TOOL_BY_NAME',
      `apibase.call does not call shop tools (${toolId}).`,
      `Call ${toolId} by name with tools/call; connect to https://apibase.pro/mcp?tools=shop to list the shop tools.`,
    );
  }
  const def = DEF_BY_NAME.get(name);
  if (!def || !isServedTool(def)) {
    return refuse(
      'UNKNOWN_TOOL_ID',
      `Unknown tool_id: ${toolId}.`,
      'Call apibase.discover to find a tool id.',
    );
  }
  const args: unknown = isPlainObject(input) ? input.arguments : undefined;
  if (!isPlainObject(args)) {
    return refuse(
      'ARGUMENTS_NOT_OBJECT',
      'arguments must be a JSON object with the input of the target tool.',
      `Send arguments as an object ({} when the tool takes none); apibase.describe with tool_id ${toolId} returns its input schema.`,
    );
  }
  return { ok: true, name, args };
}

/**
 * Rewrite, in place, every tools/call of apibase.call in a JSON-RPC body (single or batch) whose
 * target resolves into the tools/call of that target. `_meta` and every other field stay as they
 * are. A refused entry is left untouched, so the apibase.call handler answers it.
 */
export function rewriteApibaseCalls(body: unknown, requestId: string): void {
  const messages: unknown[] = Array.isArray(body) ? body : [body];
  for (const message of messages) {
    if (!isPlainObject(message) || message.method !== 'tools/call') continue;
    const params = message.params;
    if (!isPlainObject(params)) continue;
    const name = params.name;
    if (typeof name !== 'string' || !APIBASE_CALL_NAMES.has(name)) continue;
    const plan = planApibaseCall(params.arguments);
    if (!plan.ok) continue;
    params.name = plan.name;
    params.arguments = plan.args;
    logger.info(
      { request_id: requestId, requested_name: name, resolved_name: plan.name },
      'MCP tools/call: apibase.call rewritten into the direct call of its target',
    );
  }
}

/**
 * Express middleware: the rewrite for the two JSON-RPC routes of the full server (POST /mcp and
 * POST /messages). Mounted right after body parsing and before x402Middleware (src/api/app.ts).
 * Storefront servers (/mcp/m/:slug) do not register apibase.call and are not touched.
 */
export function apibaseCallRewriteMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.method === 'POST' && (req.path === '/mcp' || req.path === '/messages')) {
    const rid: unknown = req.requestId;
    rewriteApibaseCalls(req.body, typeof rid === 'string' ? rid : '');
  }
  next();
}

/**
 * The tool result of apibase.call's own handler. It is reached only when the body was not
 * rewritten, so it always refuses; it runs no pipeline and charges nothing.
 */
export function apibaseCallRefusalResult(
  input: unknown,
  requestId: string,
): { isError: true; content: Array<{ type: 'text'; text: string }> } {
  const plan = planApibaseCall(input);
  const refusal: ApibaseCallRefusal = plan.ok
    ? {
        error_code: 'CALL_NOT_REWRITTEN',
        message: `apibase.call was not turned into the call of ${plan.name} on this route.`,
        next_step: `Call ${plan.name} by name with tools/call on https://apibase.pro/mcp.`,
      }
    : plan.refusal;
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          error: 'apibase_call_refused',
          ...refusal,
          charged: false,
          request_id: requestId,
        }),
      },
    ],
  };
}
