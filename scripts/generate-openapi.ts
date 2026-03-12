/**
 * OpenAPI 3.1 spec generator for APIbase.
 *
 * Reads TOOL_DEFINITIONS + Zod schemas → static/.well-known/openapi.json
 * Run: npx tsx scripts/generate-openapi.ts
 *
 * No new dependencies — inline Zod→JSON Schema converter.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { TOOL_DEFINITIONS } from '../src/mcp/tool-definitions';
import { toolSchemas } from '../src/schemas/index';

// ---------------------------------------------------------------------------
// Zod → JSON Schema converter (handles all types used in APIbase schemas)
// ---------------------------------------------------------------------------

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
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

  // ZodRecord
  if (schema instanceof z.ZodRecord) {
    const result: Record<string, unknown> = {
      type: 'object',
      additionalProperties: zodToJsonSchema(schema.element),
    };
    if (schema.description) result.description = schema.description;
    return result;
  }

  // Fallback
  return { type: 'object' };
}

// ---------------------------------------------------------------------------
// Generate OpenAPI 3.1 document
// ---------------------------------------------------------------------------

interface OpenApiPath {
  post: {
    operationId: string;
    summary: string;
    description: string;
    parameters: Array<{ name: string; in: string; required: boolean; schema: Record<string, unknown> }>;
    requestBody?: {
      required: boolean;
      content: {
        'application/json': {
          schema: Record<string, unknown>;
        };
      };
    };
    responses: Record<string, { description: string }>;
    security: Array<Record<string, string[]>>;
  };
}

function generate(): void {
  const paths: Record<string, OpenApiPath | Record<string, unknown>> = {};

  // Tool catalog
  paths['/api/tools'] = {
    get: {
      operationId: 'listTools',
      summary: 'List all available tools',
      description:
        'Returns the full catalog of tools available on the platform with pricing and metadata.',
      responses: {
        '200': { description: 'Tool catalog' },
      },
    },
  };

  // Agent registration
  paths['/api/v1/agents/register'] = {
    post: {
      operationId: 'registerAgent',
      summary: 'Register an AI agent',
      description:
        'Register a new agent and receive API credentials (api_key and agent_id).',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                agent_name: {
                  type: 'string',
                  description: 'Name of the AI agent',
                },
                agent_version: {
                  type: 'string',
                  description: 'Version string (e.g. 1.0.0)',
                },
              },
              required: ['agent_name'],
            },
          },
        },
      },
      responses: {
        '201': { description: 'Agent registered successfully' },
        '400': { description: 'Invalid request' },
      },
    },
  };

  // Per-tool execution paths
  for (const def of TOOL_DEFINITIONS) {
    const schema = toolSchemas[def.toolId];
    const operationId = def.toolId.replace(/\./g, '_');
    const inputSchema = schema ? zodToJsonSchema(schema) : { type: 'object' };

    const pathEntry: OpenApiPath = {
      post: {
        operationId,
        summary: def.title || def.description,
        description: def.description,
        parameters: [
          {
            name: 'toolId',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: [def.toolId] },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: inputSchema,
            },
          },
        },
        responses: {
          '200': { description: 'Tool execution result' },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized — missing or invalid API key' },
          '402': { description: 'Payment required (x402)' },
          '404': { description: 'Tool not found' },
          '429': { description: 'Rate limit exceeded' },
          '500': { description: 'Internal server error' },
          '502': { description: 'Provider unavailable' },
        },
        security: [{ BearerAuth: [] }],
      },
    };

    paths[`/api/v1/tools/${def.toolId}/call`] = pathEntry;
  }

  const doc = {
    openapi: '3.1.0',
    info: {
      title: 'APIbase — Universal API Hub for AI Agents',
      version: '1.0.0',
      description:
        'APIbase aggregates, normalizes, and provides APIs from hundreds of businesses in a unified format optimized for AI agent consumption. Search flights, trade prediction markets, check weather, and more — all via a single REST API or MCP endpoint.',
      contact: {
        name: 'APIbase',
        url: 'https://apibase.pro',
      },
    },
    servers: [
      {
        url: 'https://apibase.pro',
        description: 'Production',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'API key (ak_live_...) obtained from /api/v1/agents/register',
        },
      },
    },
    paths,
    externalDocs: {
      description: 'MCP Server Manifest',
      url: 'https://apibase.pro/.well-known/mcp.json',
    },
  };

  const outPath = resolve(__dirname, '..', 'static', '.well-known', 'openapi.json');
  writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n', 'utf-8');

  const toolCount = TOOL_DEFINITIONS.length;
  const pathCount = Object.keys(paths).length;
  console.log(`OpenAPI spec generated: ${pathCount} paths (${toolCount} tools + 2 platform)`);
  console.log(`Output: ${outPath}`);
}

generate();
