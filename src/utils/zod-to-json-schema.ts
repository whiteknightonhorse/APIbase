/**
 * Zod → JSON Schema converter (shared utility).
 *
 * Handles all Zod types used in APIbase tool schemas.
 * Extracted from scripts/generate-openapi.ts for reuse in
 * the runtime tool catalog (tool-registry.service.ts).
 *
 * T-0603 (zod 3 -> 4): kept hand-written instead of z.toJSONSchema. Its output feeds the tool
 * fingerprints (definition_sha256), the cache/dedup keys, the x402 bazaar inputSchema and the
 * OpenAPI spec, and must stay byte-identical to the zod 3 version; z.toJSONSchema differs
 * (anyOf for unions, propertyNames for records, safe-integer bounds for .int(), $schema,
 * additionalProperties:false). tests/unit/zod3-tool-schema.test.ts pins the output
 * (`converter` entries of tests/fixtures/zod3-tool-schema-baseline.json).
 */

import { z } from 'zod';

/** zod 4 check definition (the `_zod.def` of an entry in a schema's `checks` array). */
interface CheckDef {
  check?: string;
  value?: unknown;
  minimum?: number;
  maximum?: number;
  length?: number;
  format?: string;
}

function checkDefs(schema: z.ZodTypeAny): CheckDef[] {
  const checks = (schema._zod.def as { checks?: Array<{ _zod: { def: CheckDef } }> }).checks;
  return (checks ?? []).map((c) => c._zod.def);
}

const ENUM_ORDER = 'apibaseEnumOrder';

/**
 * z.enum that keeps its declaration order. zod 4 keys enum values by value in a plain object, so
 * integer-like strings ('6', '63680') move to the front; zod 3 kept the array as written.
 */
export function orderedEnum<const T extends readonly [string, ...string[]]>(values: T) {
  const schema = z.enum(values);
  (schema._zod.def as unknown as Record<string, unknown>)[ENUM_ORDER] = [...values];
  return schema;
}

/** Enum values in declaration order (orderedEnum) or zod's own order. */
export function enumValues(schema: z.core.$ZodType): unknown[] {
  const def = schema._zod.def as unknown as Record<string, unknown>;
  const ordered = def[ENUM_ORDER];
  if (Array.isArray(ordered)) return ordered;
  return Object.values(def.entries as Record<string, unknown>);
}

function convertZod(schema: z.ZodTypeAny): Record<string, unknown> {
  // Unwrap ZodOptional (preserve description from wrapper)
  if (schema instanceof z.ZodOptional) {
    const inner = zodToJsonSchema(schema.unwrap() as z.ZodTypeAny);
    if (schema.description && !inner.description) {
      inner.description = schema.description;
    }
    return inner;
  }

  // Unwrap ZodDefault (preserve description from wrapper)
  if (schema instanceof z.ZodDefault) {
    const inner = zodToJsonSchema(schema.removeDefault() as z.ZodTypeAny);
    const def = schema._zod.def.defaultValue;
    if (schema.description && !inner.description) {
      inner.description = schema.description;
    }
    return { ...inner, default: def };
  }

  // ZodString
  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: 'string' };
    if (schema.description) result.description = schema.description;
    for (const check of checkDefs(schema)) {
      if (check.check === 'min_length') result.minLength = check.minimum;
      if (check.check === 'max_length') result.maxLength = check.maximum;
      if (check.check === 'length_equals') {
        result.minLength = check.length;
        result.maxLength = check.length;
      }
    }
    return result;
  }

  // ZodNumber. zod 3 emitted minimum/maximum for gt/gte/lt/lte alike (exclusivity dropped);
  // .int() is a 'number_format' check in zod 4 and carries no explicit bound of its own.
  if (schema instanceof z.ZodNumber) {
    const result: Record<string, unknown> = { type: 'number' };
    if (schema.description) result.description = schema.description;
    let isInt = false;
    for (const check of checkDefs(schema)) {
      if (check.check === 'number_format' && check.format === 'safeint') isInt = true;
      if (check.check === 'greater_than') result.minimum = check.value;
      if (check.check === 'less_than') result.maximum = check.value;
    }
    if (isInt) result.type = 'integer';
    return result;
  }

  // ZodBoolean
  if (schema instanceof z.ZodBoolean) {
    const result: Record<string, unknown> = { type: 'boolean' };
    if (schema.description) result.description = schema.description;
    return result;
  }

  // ZodEnum (z.nativeEnum is z.enum in zod 4)
  if (schema instanceof z.ZodEnum) {
    const result: Record<string, unknown> = {
      type: 'string',
      enum: enumValues(schema),
    };
    if (schema.description) result.description = schema.description;
    return result;
  }

  // ZodArray (zod 3 emitted nothing for .length(n); kept)
  if (schema instanceof z.ZodArray) {
    const result: Record<string, unknown> = {
      type: 'array',
      items: zodToJsonSchema(schema.element as z.ZodTypeAny),
    };
    if (schema.description) result.description = schema.description;
    for (const check of checkDefs(schema)) {
      if (check.check === 'min_length') result.minItems = check.minimum;
      if (check.check === 'max_length') result.maxItems = check.maximum;
    }
    return result;
  }

  // ZodObject
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, val] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(val);
      // Field is required unless it's ZodOptional or ZodDefault
      if (!(val instanceof z.ZodOptional) && !(val instanceof z.ZodDefault)) {
        required.push(key);
      }
    }

    const result: Record<string, unknown> = {
      type: 'object',
      properties,
    };
    if (required.length > 0) result.required = required;
    if (schema.description) result.description = schema.description;
    return result;
  }

  // ZodRecord (e.g. z.record(z.string(), z.unknown()))
  if (schema instanceof z.ZodRecord) {
    const result: Record<string, unknown> = {
      type: 'object',
      additionalProperties: zodToJsonSchema(schema.valueType as z.ZodTypeAny),
    };
    if (schema.description) result.description = schema.description;
    return result;
  }

  // ZodUnion (e.g. z.union([z.string(), z.array(z.string())]))
  if (schema instanceof z.ZodUnion) {
    // Use first variant as representative type, carry description from union
    const options = schema.options as readonly z.ZodTypeAny[];
    const result = options.length > 0 ? zodToJsonSchema(options[0]) : { type: 'string' };
    if (schema.description && !result.description) {
      result.description = schema.description;
    }
    return result;
  }

  // ZodUnknown (e.g. z.unknown() inside z.record(z.string(), z.unknown()))
  if (schema instanceof z.ZodUnknown) {
    return {};
  }

  // Fallback
  return { type: 'object' };
}

/**
 * T-0526: schema extension keyword. A property carrying it does not take part in the cache key
 * or the dedup key. Default: nobody annotates anything.
 */
// eslint-disable-next-line no-restricted-syntax -- JSON-schema keyword, not an HTTP header
export const VOLATILE_KEYWORD = 'x-apibase-volatile';

/**
 * Marks a zod field as volatile; zodToJsonSchema emits `"x-apibase-volatile": true` for it.
 * The hand-written converter drops unknown keywords, so the mark rides on the zod definition.
 */
export function markVolatile<T extends z.ZodTypeAny>(schema: T): T {
  (schema._zod.def as unknown as Record<string, unknown>)[VOLATILE_KEYWORD] = true;
  return schema;
}

export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const out = convertZod(schema);
  if ((schema._zod.def as unknown as Record<string, unknown>)[VOLATILE_KEYWORD] === true) {
    out[VOLATILE_KEYWORD] = true;
  }
  return out;
}
