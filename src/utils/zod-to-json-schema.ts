/**
 * Zod → JSON Schema converter (shared utility).
 *
 * Handles all Zod types used in APIbase tool schemas.
 * Extracted from scripts/generate-openapi.ts for reuse in
 * the runtime tool catalog (tool-registry.service.ts).
 */

import { z } from 'zod';

export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  // Unwrap ZodOptional (preserve description from wrapper)
  if (schema instanceof z.ZodOptional) {
    const inner = zodToJsonSchema(schema.unwrap());
    if (schema.description && !inner.description) {
      inner.description = schema.description;
    }
    return inner;
  }

  // Unwrap ZodDefault (preserve description from wrapper)
  if (schema instanceof z.ZodDefault) {
    const inner = zodToJsonSchema(schema.removeDefault());
    const def = schema._def.defaultValue();
    if (schema.description && !inner.description) {
      inner.description = schema.description;
    }
    return { ...inner, default: def };
  }

  // ZodString
  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: 'string' };
    if (schema.description) result.description = schema.description;
    for (const check of schema._def.checks) {
      if (check.kind === 'min') result.minLength = check.value;
      if (check.kind === 'max') result.maxLength = check.value;
      if (check.kind === 'length') {
        result.minLength = check.value;
        result.maxLength = check.value;
      }
    }
    return result;
  }

  // ZodNumber
  if (schema instanceof z.ZodNumber) {
    const result: Record<string, unknown> = { type: 'number' };
    if (schema.description) result.description = schema.description;
    let isInt = false;
    for (const check of schema._def.checks) {
      if (check.kind === 'int') isInt = true;
      if (check.kind === 'min') result.minimum = check.value;
      if (check.kind === 'max') result.maximum = check.value;
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

  // ZodEnum
  if (schema instanceof z.ZodEnum) {
    const result: Record<string, unknown> = {
      type: 'string',
      enum: schema._def.values,
    };
    if (schema.description) result.description = schema.description;
    return result;
  }

  // ZodArray
  if (schema instanceof z.ZodArray) {
    const result: Record<string, unknown> = {
      type: 'array',
      items: zodToJsonSchema(schema.element),
    };
    if (schema.description) result.description = schema.description;
    if (schema._def.minLength !== null) result.minItems = schema._def.minLength.value;
    if (schema._def.maxLength !== null) result.maxItems = schema._def.maxLength.value;
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

  // ZodRecord (e.g. z.record(z.unknown()))
  if (schema instanceof z.ZodRecord) {
    const result: Record<string, unknown> = {
      type: 'object',
      additionalProperties: zodToJsonSchema(schema.element),
    };
    if (schema.description) result.description = schema.description;
    return result;
  }

  // ZodUnknown (e.g. z.unknown() inside z.record(z.unknown()))
  if (schema instanceof z.ZodUnknown) {
    return {};
  }

  // Fallback
  return { type: 'object' };
}
