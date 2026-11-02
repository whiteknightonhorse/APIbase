/**
 * T-0603 (zod 3 -> 4): `tools/list` keeps the JSON Schema it had under zod 3.
 *
 * The SDK renders tool schemas with `zod-to-json-schema` for zod 3 and with `z.toJSONSchema` for
 * zod 4. The two differ on every tool: zod 4 drops `additionalProperties: false` from inputSchema,
 * adds `required: ["result"]` to the shared outputSchema (an error-only result would then fail a
 * client-side check), adds safe-integer bounds to `.int()`, `propertyNames` to records and a
 * pattern to uuids. To keep `tools/list` byte-identical, each tool schema is mirrored into a
 * `zod/v3` schema and rendered by the same `zod-to-json-schema` call the SDK made for zod 3
 * (`strictUnions: true`, `pipeStrategy` input/output). The SDK still validates calls with the
 * zod 4 schema; only the listing goes through the mirror.
 *
 * tests/unit/zod3-tool-schema.test.ts pins the output to the zod 3 baseline.
 *
 * The same wrapper keeps the zod 3 text of the SDK's `Input validation error: ...` (review R2):
 * on a failed call it rebuilds the issue list with `zod3Issues` (src/utils/zod3-errors.ts).
 */
import { z } from 'zod';
import { z as z3 } from 'zod/v3';
import { zodToJsonSchema as zod3ToJsonSchema } from 'zod-to-json-schema';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  normalizeObjectSchema,
  safeParseAsync,
  type AnySchema,
} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { zod3Issues } from '../utils/zod3-errors';
import { enumValues } from '../utils/zod-to-json-schema';
import { logger } from '../config/logger';

/** Loose view of a zod 4 schema definition (classic and mini share it). */
interface Def {
  type: string;
  checks?: Array<{ _zod: { def: CheckDef } }>;
  check?: string;
  format?: string;
  innerType?: Schema;
  element?: Schema;
  shape?: Record<string, Schema>;
  catchall?: Schema;
  keyType?: Schema;
  valueType?: Schema;
  options?: Schema[];
  items?: Schema[];
  rest?: Schema | null;
  values?: unknown[];
  in?: Schema;
  out?: Schema;
  defaultValue?: unknown;
  discriminator?: string;
}

interface CheckDef {
  check: string;
  value?: number;
  inclusive?: boolean;
  minimum?: number;
  maximum?: number;
  length?: number;
  format?: string;
  pattern?: RegExp;
  prefix?: string;
  suffix?: string;
  includes?: string;
  offset?: boolean;
  local?: boolean;
  precision?: number | null;
}

type Schema = z.core.$ZodType;
type Z3 = z3.ZodTypeAny;

function defOf(s: Schema): Def {
  return s._zod.def as unknown as Def;
}

function stringChecks(base: z3.ZodString, checks: CheckDef[]): Z3 {
  let s = base;
  for (const c of checks) {
    if (c.check === 'min_length') s = s.min(c.minimum as number);
    else if (c.check === 'max_length') s = s.max(c.maximum as number);
    else if (c.check === 'length_equals') s = s.length(c.length as number);
    else if (c.check === 'string_format') {
      switch (c.format) {
        case 'email':
          s = s.email();
          break;
        case 'url':
          s = s.url();
          break;
        case 'uuid':
        case 'guid':
          s = s.uuid();
          break;
        case 'regex':
          s = s.regex(c.pattern as RegExp);
          break;
        case 'datetime':
          s = s.datetime({ offset: c.offset, local: c.local, precision: c.precision ?? undefined });
          break;
        case 'date':
          s = s.date();
          break;
        case 'starts_with':
          s = s.startsWith(c.prefix as string);
          break;
        case 'ends_with':
          s = s.endsWith(c.suffix as string);
          break;
        case 'includes':
          s = s.includes(c.includes as string);
          break;
        default:
          throw new Error(`zod3 mirror: unsupported string format ${String(c.format)}`);
      }
    } else if (c.check !== 'overwrite' && c.check !== 'custom') {
      // overwrite = trim/toLowerCase, custom = refine: zod-to-json-schema emitted nothing for them.
      throw new Error(`zod3 mirror: unsupported string check ${c.check}`);
    }
  }
  return s;
}

function numberChecks(base: z3.ZodNumber, checks: CheckDef[]): Z3 {
  let n = base;
  for (const c of checks) {
    if (c.check === 'greater_than')
      n = c.inclusive ? n.gte(c.value as number) : n.gt(c.value as number);
    else if (c.check === 'less_than')
      n = c.inclusive ? n.lte(c.value as number) : n.lt(c.value as number);
    else if (c.check === 'multiple_of') n = n.multipleOf(c.value as number);
    else if (c.check === 'number_format' && c.format === 'safeint') n = n.int();
    else if (c.check !== 'custom')
      throw new Error(`zod3 mirror: unsupported number check ${c.check}`);
  }
  return n;
}

function arrayChecks(base: z3.ZodArray<Z3>, checks: CheckDef[]): Z3 {
  let a = base;
  for (const c of checks) {
    if (c.check === 'min_length') a = a.min(c.minimum as number);
    else if (c.check === 'max_length') a = a.max(c.maximum as number);
    else if (c.check === 'length_equals') a = a.length(c.length as number);
    else if (c.check !== 'custom')
      throw new Error(`zod3 mirror: unsupported array check ${c.check}`);
  }
  return a;
}

/**
 * One mirror per zod 4 instance, shared by every McpServer (one per MCP request): field schemas
 * are module-level, so after the first listing only the per-server object wrapper is new.
 */
const mirrors = new WeakMap<Schema, Z3>();

/**
 * Mirror a zod 4 schema into zod/v3. One mirror per zod 4 instance, so a schema reused in two
 * places stays one instance and zod-to-json-schema emits the same `$ref` it did under zod 3.
 */
export function toZod3(schema: Schema, seen: WeakMap<Schema, Z3> = mirrors): Z3 {
  const hit = seen.get(schema);
  if (hit) return hit;
  const def = defOf(schema);
  const checks = (def.checks ?? []).map((c) => c._zod.def);
  const m = (s: Schema): Z3 => toZod3(s, seen);
  let out: Z3;
  switch (def.type) {
    case 'string':
      out = stringChecks(z3.string(), checks);
      break;
    case 'number':
      // z.int() is itself the number_format check
      out = numberChecks(z3.number(), def.check ? [def as unknown as CheckDef, ...checks] : checks);
      break;
    case 'boolean':
      out = z3.boolean();
      break;
    case 'unknown':
      out = z3.unknown();
      break;
    case 'any':
      out = z3.any();
      break;
    case 'null':
      out = z3.null();
      break;
    case 'enum':
      out = z3.enum(enumValues(schema) as [string, ...string[]]);
      break;
    case 'literal':
      if (def.values?.length !== 1) throw new Error('zod3 mirror: multi-value literal');
      out = z3.literal(def.values[0] as string);
      break;
    case 'array':
      out = arrayChecks(z3.array(m(def.element as Schema)), checks);
      break;
    case 'object': {
      const shape: Record<string, Z3> = {};
      for (const [k, v] of Object.entries(def.shape ?? {})) shape[k] = m(v);
      const obj = z3.object(shape);
      const catchall = def.catchall ? defOf(def.catchall).type : undefined;
      out =
        catchall === undefined
          ? obj
          : catchall === 'never'
            ? obj.strict()
            : catchall === 'unknown'
              ? obj.passthrough()
              : obj.catchall(m(def.catchall as Schema));
      break;
    }
    case 'record':
      out = z3.record(m(def.keyType as Schema) as z3.ZodString, m(def.valueType as Schema));
      break;
    case 'union': {
      if (def.discriminator !== undefined) throw new Error('zod3 mirror: discriminated union');
      const opts = (def.options ?? []).map(m);
      out = z3.union(opts as [Z3, Z3, ...Z3[]]);
      break;
    }
    case 'tuple': {
      const t = z3.tuple((def.items ?? []).map(m) as [Z3, ...Z3[]]);
      out = def.rest ? t.rest(m(def.rest)) : t;
      break;
    }
    case 'optional':
      out = m(def.innerType as Schema).optional();
      break;
    case 'nullable':
      out = m(def.innerType as Schema).nullable();
      break;
    case 'default':
      out = m(def.innerType as Schema).default(def.defaultValue);
      break;
    case 'pipe': {
      // zod 3: .transform() / z.preprocess() were ZodEffects, rendered as their inner schema.
      const inT = defOf(def.in as Schema).type;
      const outT = defOf(def.out as Schema).type;
      if (outT === 'transform') out = m(def.in as Schema).transform((v) => v);
      else if (inT === 'transform') out = z3.preprocess((v) => v, m(def.out as Schema));
      else out = m(def.in as Schema).pipe(m(def.out as Schema));
      break;
    }
    default:
      throw new Error(`zod3 mirror: unsupported zod type ${def.type}`);
  }
  const description = z.globalRegistry.get(schema)?.description;
  if (description !== undefined) out = out.describe(description);
  seen.set(schema, out);
  return out;
}

/** JSON Schema of a tool's input or output schema exactly as the SDK rendered it under zod 3. */
export function zod3ToolJsonSchema(
  schema: Schema,
  pipeStrategy: 'input' | 'output',
): Record<string, unknown> {
  return zod3ToJsonSchema(toZod3(schema), { strictUnions: true, pipeStrategy }) as Record<
    string,
    unknown
  >;
}

/** An empty raw shape went to the SDK's zod 4 path even under zod 3; its rendering stays. */
function isEmptyShape(schema: Schema): boolean {
  const def = defOf(schema);
  return def.type === 'object' && Object.keys(def.shape ?? {}).length === 0;
}

type Handler = (request: unknown, extra: unknown) => Promise<Record<string, unknown>>;
interface RegisteredTool {
  inputSchema?: Schema;
  outputSchema?: Schema;
}

/**
 * Wrap the registered `tools/list` handler so each tool's inputSchema/outputSchema comes from
 * the zod 3 rendering. Call after every tool registration. A schema the mirror cannot handle
 * keeps the SDK's rendering (logged); the unit test fails on any such tool in the catalog.
 */
export function withZod3ToolSchemas(server: McpServer): McpServer {
  const handlers = (server.server as unknown as { _requestHandlers: Map<string, Handler> })
    ._requestHandlers;
  const registered = (server as unknown as { _registeredTools: Record<string, RegisteredTool> })
    ._registeredTools;
  withZod3InputErrors(server);
  const inner = handlers.get('tools/list');
  if (!inner) return server;
  handlers.set('tools/list', async (request, extra) => {
    const res = await inner(request, extra);
    const tools = res.tools as Array<Record<string, unknown>>;
    for (const tool of tools) {
      const reg = registered[tool.name as string];
      if (!reg) continue;
      try {
        if (reg.inputSchema && tool.inputSchema && !isEmptyShape(reg.inputSchema))
          tool.inputSchema = zod3ToolJsonSchema(reg.inputSchema, 'input');
        if (reg.outputSchema && tool.outputSchema && !isEmptyShape(reg.outputSchema))
          tool.outputSchema = zod3ToolJsonSchema(reg.outputSchema, 'output');
      } catch (err) {
        logger.warn(
          { tool: tool.name, err: (err as Error).message },
          'zod3 tool schema mirror failed; SDK rendering kept',
        );
      }
    }
    return res;
  });
  return server;
}

/** The SDK's dotted issue path (`a.b[0]`; root = "object root"). */
function dotPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return 'object root';
  return path.reduce<string>(
    (acc, seg, i) =>
      i === 0 ? String(seg) : typeof seg === 'number' ? `${acc}[${seg}]` : `${acc}.${String(seg)}`,
    '',
  );
}

/** The SDK's getParseErrorMessage: one line per issue, `<message> at <path>`. */
function issueText(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string {
  return issues
    .map((i) => (i.path.length ? `${i.message} at ${dotPath(i.path)}` : i.message))
    .join('\n');
}

type ValidateToolInput = (
  tool: RegisteredTool,
  args: unknown,
  toolName: string,
) => Promise<unknown>;

/**
 * Keep the zod 3 issue list in the SDK's `Input validation error: Invalid arguments for tool X: ...`
 * text: the SDK joins zod 4's raw issues, which include checks zod 3 never ran (a length check on
 * a value of the wrong type) and miss ones it did (range checks after a failed `.int()`).
 */
function withZod3InputErrors(server: McpServer): void {
  const target = server as unknown as { validateToolInput: ValidateToolInput };
  const original = target.validateToolInput.bind(server);
  target.validateToolInput = async (tool, args, toolName) => {
    try {
      return await original(tool, args, toolName);
    } catch (err) {
      if (
        !(err instanceof McpError) ||
        err.code !== ErrorCode.InvalidParams ||
        !err.message.includes('Input validation error:') ||
        !tool.inputSchema
      )
        throw err;
      const schema = (normalizeObjectSchema(tool.inputSchema as AnySchema) ??
        tool.inputSchema) as Schema;
      const input = args ?? {};
      if (isEmptyShape(schema)) {
        // An empty raw shape went to the SDK's zod 4 path even under zod 3: keep zod 4's text.
        const own = await (schema as z.ZodType).safeParseAsync(input, {
          error: z.locales.en().localeError,
        });
        if (own.success) throw err;
        throw new McpError(
          ErrorCode.InvalidParams,
          `Input validation error: Invalid arguments for tool ${toolName}: ${issueText(own.error.issues)}`,
        );
      }
      const parsed = await safeParseAsync(schema as AnySchema, input);
      if (parsed.success) throw err;
      const issues = zod3Issues((parsed.error as z.ZodError).issues, schema, input, {
        async: true,
      });
      throw new McpError(
        ErrorCode.InvalidParams,
        `Input validation error: Invalid arguments for tool ${toolName}: ${issueText(issues)}`,
      );
    }
  };
}
