/**
 * T-0603 (zod 3 -> 4), review R2: validation errors keep the zod 3 wording and issue codes.
 *
 * Every client-visible validation error built from zod issues (the 400 `issues[]` of the tool
 * pipeline, the MCP `Input validation error: ...` text the SDK builds from issue messages, the
 * REST routers' field errors) carried zod 3 messages and codes before the upgrade. zod 4 rewords
 * them (`Required` -> `Invalid input: expected string, received undefined`) and renames codes
 * (`invalid_enum_value` / `invalid_literal` -> `invalid_value`, `invalid_string` ->
 * `invalid_format`). This module installs a global zod 4 error map that rebuilds the zod 3 issue
 * for each default-message issue, sets the zod 3 code on it and takes the message from zod 3's own
 * English error map (`zod/v3`), so the text is zod 3's, not a copy of it.
 *
 * A message given in the schema (`.min(1, 'msg')`) outranks any error map in zod 4 as it did in
 * zod 3, so those issues keep their message; `zod3IssueCode` maps their code.
 *
 * Installed on import (`installZod3ErrorMap` is idempotent). Imported by the API and worker
 * entrypoints and by every module that turns zod issues into a response.
 * tests/unit/zod3-errors.test.ts compares the result with zod 3 over the whole tool catalog.
 */
import { z } from 'zod';
import { defaultErrorMap, getParsedType, type ZodIssueOptionalMessage } from 'zod/v3';
import { enumValues } from './zod-to-json-schema';

/** Raw zod 4 issue as error maps receive it (`input` and `inst` are still attached). */
type RawIssue = z.core.$ZodRawIssue & {
  input?: unknown;
  inst?: { _zod?: { def?: { type?: string } } };
  [k: string]: unknown;
};

/** zod 4 `expected` names that zod 3 spelled differently. */
const EXPECTED: Record<string, string> = { record: 'object', tuple: 'array' };

/** zod 4 `.int()` bounds (origin "int") read as number bounds. */
const originType = (origin: unknown) => (origin === 'int' ? 'number' : origin);

/** zod 4 string formats whose zod 3 `validation` name differs. */
const FORMAT: Record<string, string> = { guid: 'uuid', ipv4: 'ip', ipv6: 'ip' };

function stringValidation(iss: RawIssue): unknown {
  const format = String(iss.format);
  if (format === 'starts_with') return { startsWith: iss.prefix };
  if (format === 'ends_with') return { endsWith: iss.suffix };
  if (format === 'includes')
    return typeof iss.position === 'number'
      ? { includes: iss.includes, position: iss.position }
      : { includes: iss.includes };
  return FORMAT[format] ?? format;
}

/**
 * The zod 3 issue zod 3 would have raised for this zod 4 issue (without path/message), or
 * undefined where zod 4 raises something zod 3 had no counterpart for (the zod 4 text stays).
 */
function zod3Issue(iss: RawIssue): ZodIssueOptionalMessage | undefined {
  const t = (code: string, fields: Record<string, unknown> = {}) =>
    ({ code, path: [], ...fields }) as unknown as ZodIssueOptionalMessage;
  switch (iss.code) {
    case 'invalid_type': {
      const received = getParsedType(iss.input);
      if (iss.expected === 'int')
        // zod 3 `.int()` raised invalid_type integer/float; a non-number fails the type first.
        return typeof iss.input === 'number'
          ? t('invalid_type', { expected: 'integer', received: 'float' })
          : t('invalid_type', { expected: 'number', received });
      const expected = String(iss.expected);
      return t('invalid_type', { expected: EXPECTED[expected] ?? expected, received });
    }
    case 'invalid_value': {
      const type = iss.inst?._zod?.def?.type;
      // zod 4 lists integer-like enum keys first; zod 3 kept declaration order (orderedEnum).
      const values =
        type === 'enum'
          ? enumValues(iss.inst as unknown as z.core.$ZodType)
          : ((iss.values ?? []) as unknown[]);
      if (type === 'literal' && values.length === 1)
        return t('invalid_literal', { expected: values[0], received: iss.input });
      // zod 3 enums type-checked first: a value of a type no option has is invalid_type.
      const types = new Set(values.map((v) => typeof v));
      if (!types.has(typeof iss.input as 'string'))
        return t('invalid_type', {
          expected: values.map((v) => (typeof v === 'string' ? `'${v}'` : String(v))).join(' | '),
          received: getParsedType(iss.input),
        });
      return t('invalid_enum_value', { options: values, received: iss.input });
    }
    case 'invalid_format':
      return t('invalid_string', { validation: stringValidation(iss) });
    case 'too_small':
      return t('too_small', {
        minimum: iss.minimum,
        type: originType(iss.origin),
        inclusive: iss.inclusive,
        exact: iss.exact === true,
      });
    case 'too_big':
      return t('too_big', {
        maximum: iss.maximum,
        type: originType(iss.origin),
        inclusive: iss.inclusive,
        exact: iss.exact === true,
      });
    case 'not_multiple_of':
      return t('not_multiple_of', { multipleOf: iss.divisor });
    case 'unrecognized_keys':
      return t('unrecognized_keys', { keys: iss.keys });
    case 'invalid_union':
      if (iss.discriminator !== undefined)
        return t('invalid_union_discriminator', { options: iss.options });
      return t('invalid_union', { unionErrors: [] });
    case 'custom':
      return t('custom');
    default:
      return undefined;
  }
}

/** zod 4 error map: zod 3 message, and the zod 3 code written onto the issue being finalized. */
export function zod3ErrorMap(iss: RawIssue): string | undefined {
  const v3 = zod3Issue(iss);
  if (!v3) return undefined;
  (iss as { code: string }).code = v3.code;
  return defaultErrorMap(v3, { defaultError: 'Invalid input', data: iss.input }).message;
}

/**
 * zod 3 code of a finalized issue. Default-message issues already carry it (set by the map);
 * this maps the zod 4 codes left on issues whose message came from the schema.
 */
export function zod3IssueCode(issue: Issue): string {
  if (issue.code === 'invalid_format') return 'invalid_string';
  if (issue.code === 'invalid_value')
    return issue.values?.length === 1 ? 'invalid_literal' : 'invalid_enum_value';
  return issue.code;
}

type Issue = { code: string; path: PropertyKey[]; message: string; values?: unknown[] } & Record<
  string,
  unknown
>;

const samePath = (a: PropertyKey[], b: PropertyKey[]) =>
  a.length === b.length && a.every((k, i) => k === b[i]);
const under = (child: PropertyKey[], parent: PropertyKey[]) =>
  child.length > parent.length && parent.every((k, i) => k === child[i]);

type Schema = z.core.$ZodType;
type Def = {
  type: string;
  innerType?: Schema;
  in?: Schema;
  out?: Schema;
  shape?: Record<string, Schema>;
  element?: Schema;
  valueType?: Schema;
  items?: Schema[];
  options?: Schema[];
  checks?: Array<{ _zod: { def: Record<string, unknown> } }>;
};
const defOf = (s: Schema) => s._zod.def as unknown as Def;

/** zod 4 `.int()` failure: zod 3 raised it as a check and went on with the other checks. */
const isIntCheck = (i: Issue) => i.code === 'invalid_type' && i.expected === 'int';

/** The schema that validates the value at `path` below `schema` (undefined if not determinable). */
function schemaAt(schema: Schema | undefined, path: readonly PropertyKey[]): Schema | undefined {
  let s = schema;
  for (let i = 0; s;) {
    const d = defOf(s);
    if (d.type === 'optional' || d.type === 'nullable' || d.type === 'default') s = d.innerType;
    else if (d.type === 'pipe') s = d.in && defOf(d.in).type === 'transform' ? d.out : d.in;
    else if (i === path.length) return s;
    else if (d.type === 'object') s = d.shape?.[String(path[i++])];
    else if (d.type === 'array' || d.type === 'record') {
      s = d.type === 'array' ? d.element : d.valueType;
      i++;
    } else if (d.type === 'tuple') s = d.items?.[Number(path[i++])];
    else return undefined;
  }
  return undefined;
}

/** True when the value at `path` is validated through a union (zod 3 async: a later microtask). */
function crossesUnion(schema: Schema | undefined, path: readonly PropertyKey[]): boolean {
  for (let i = 0; i <= path.length; i++) {
    const s = schemaAt(schema, path.slice(0, i));
    if (s && defOf(s).type === 'union') return true;
  }
  return false;
}

function valueAt(input: unknown, path: readonly PropertyKey[]): unknown {
  let v = input;
  for (const k of path) v = v !== null && typeof v === 'object' ? (v as never)[k] : undefined;
  return v;
}

/** zod 3 issues of the number checks declared after `.int()`, which zod 4 skips once it fails. */
function checksAfterInt(schema: Schema | undefined, value: unknown, path: PropertyKey[]): Issue[] {
  if (!schema || typeof value !== 'number') return [];
  const checks = (defOf(schema).checks ?? []).map((c) => c._zod.def);
  const at = checks.findIndex((c) => c.check === 'number_format');
  const out: Issue[] = [];
  const add = (v3: Record<string, unknown>) => {
    const iss = { path: [], ...v3 } as unknown as ZodIssueOptionalMessage;
    const message = defaultErrorMap(iss, { defaultError: 'Invalid input', data: value }).message;
    out.push({ code: String(v3.code), path, message });
  };
  for (const c of checks.slice(at + 1)) {
    const n = c.value as number;
    if (c.check === 'greater_than' && (c.inclusive ? value < n : value <= n))
      add({ code: 'too_small', minimum: n, type: 'number', inclusive: c.inclusive, exact: false });
    else if (c.check === 'less_than' && (c.inclusive ? value > n : value >= n))
      add({ code: 'too_big', maximum: n, type: 'number', inclusive: c.inclusive, exact: false });
    else if (c.check === 'multiple_of' && !Number.isInteger(value / n))
      add({ code: 'not_multiple_of', multipleOf: n });
  }
  return out;
}

/** zod 3 status of a union option: "dirty" (check failures only) beat a type failure. */
const DIRTY = new Set([
  'too_small',
  'too_big',
  'invalid_format',
  'invalid_string',
  'not_multiple_of',
]);
const isDirty = (errs: Issue[]) =>
  errs.length > 0 && errs.every((i) => DIRTY.has(i.code) || isIntCheck(i));

/**
 * The issue list zod 3 produced for the same failure, from zod 4's finalized issues (`schema`
 * and `input` are the ones parsed; without them the last two steps are skipped):
 * - zod 4 still runs length checks on a value whose type check failed (`"x"` against
 *   `z.array(...).min(2)` adds "String must contain at least 2 character(s)"); zod 3 stopped at
 *   the type error. Issues at the path of an invalid_type issue are dropped.
 * - zod 3 checked an array's length before its elements; zod 4 after. A length issue of an array
 *   moves in front of the element issues under it.
 * - codes of schema-message issues mapped by `zod3IssueCode`.
 * - zod 3 `.int()` was a check: a float still got the range checks declared after it.
 * - zod 4's safe-integer bound of `.int()` is dropped where a declared bound at the same path
 *   failed too (zod 3 had no such bound; alone, it stays, worded as a number bound).
 * - `async`: zod 3's safeParseAsync (the SDK's call) reported union and refinement issues after
 *   all synchronous ones, because they resolve in a later microtask.
 * - zod 3 unions returned the first option that failed only on checks (`.int()`, `.min()`)
 *   instead of "Invalid input".
 */
export function zod3Issues(
  zodIssues: readonly z.core.$ZodIssue[] | readonly Issue[],
  schema?: Schema,
  input?: unknown,
  opts: { async?: boolean } = {},
): Issue[] {
  const issues = zodIssues as readonly Issue[];
  const deferred: Issue[] = [];
  const typed = issues
    .filter((i) => i.code === 'invalid_type' && !isIntCheck(i))
    .map((i) => i.path);
  const out: Issue[] = [];
  for (const issue of issues) {
    if (issue.code !== 'invalid_type' && typed.some((p) => samePath(p, issue.path))) continue;
    // zod 4 `.int()` also bounds to the safe-integer range; zod 3 did not. Where a declared
    // bound fails too, zod 3 reported only that one.
    if (
      issue.origin === 'int' &&
      issues.some((o) => o !== issue && o.origin !== 'int' && samePath(o.path, issue.path))
    )
      continue;
    if (issue.code === 'invalid_union' && Array.isArray(issue.errors) && schema) {
      const errors = issue.errors as Issue[][];
      const k = errors.findIndex(isDirty);
      const option = defOf(schemaAt(schema, issue.path) ?? schema).options?.[k];
      if (k >= 0 && option) {
        const sub = zod3Issues(errors[k], option, valueAt(input, issue.path));
        (opts.async ? deferred : out).push(
          ...sub.map((e) => ({ ...e, path: [...issue.path, ...e.path] })),
        );
        continue;
      }
    }
    if (
      opts.async &&
      (issue.code === 'invalid_union' ||
        issue.code === 'custom' ||
        crossesUnion(schema, issue.path))
    ) {
      deferred.push({ ...issue, code: zod3IssueCode(issue) });
      continue;
    }
    const mapped = { ...issue, code: zod3IssueCode(issue) };
    if ((issue.code === 'too_small' || issue.code === 'too_big') && issue.origin === 'array') {
      let j = out.length;
      while (j > 0 && under(out[j - 1].path, issue.path)) j--;
      out.splice(j, 0, mapped);
    } else out.push(mapped);
    if (isIntCheck(issue) && schema)
      out.push(
        ...checksAfterInt(schemaAt(schema, issue.path), valueAt(input, issue.path), issue.path),
      );
  }
  return [...out, ...deferred];
}

let installed = false;

/** Install the zod 3 wording as zod 4's global error map (process-wide, idempotent). */
export function installZod3ErrorMap(): void {
  if (installed) return;
  z.config({ customError: zod3ErrorMap as z.core.$ZodErrorMap });
  installed = true;
}

installZod3ErrorMap();
