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
import { readFileSync } from 'node:fs';
import { TOOL_DEFINITIONS } from '../src/mcp/tool-definitions';
import { toolSchemas } from '../src/schemas/index';
import { zodToJsonSchema } from '../src/utils/zod-to-json-schema';
import { parse } from 'yaml';

// Load tool prices from config
const yamlContent = readFileSync(resolve(__dirname, '..', 'config', 'tool_provider_config.yaml'), 'utf-8');
const toolConfigs: Array<{ tool_id: string; price_usd: string }> = parse(yamlContent)?.tools ?? [];
const priceMap = new Map<string, number>();
for (const tc of toolConfigs) {
  priceMap.set(tc.tool_id, parseFloat(tc.price_usd) || 0);
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

    const price = priceMap.get(def.toolId) ?? 0;
    const priceStr = price.toFixed(6);

    // x-payment-info for MPPScan/AgentCash discovery
    const xPaymentInfo: Record<string, unknown> = price > 0
      ? { pricingMode: 'fixed', price: priceStr, protocols: ['x402', 'mpp'] }
      : { pricingMode: 'fixed', price: '0.000000', protocols: ['x402', 'mpp'] };

    const pathEntry: OpenApiPath = {
      post: {
        operationId,
        summary: def.title || def.description,
        description: def.description,
        ...({ 'x-payment-info': xPaymentInfo } as Record<string, unknown>),
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
          '402': { description: 'Payment Required' },
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
        'APIbase aggregates, normalizes, and provides APIs from hundreds of businesses in a unified format optimized for AI agent consumption. Search flights, trade prediction markets, check weather, and more — all via a single REST API or MCP endpoint. Supports dual-rail payments: x402 (USDC on Base) and MPP (USDC on Tempo).',
      'x-guidance': 'Use POST /api/v1/tools/{tool_id}/call to invoke any tool. Send Authorization: Bearer <api_key> header. Tool catalog at GET /api/v1/tools. MCP endpoint at /mcp. Payment: 402 responses include both x402 body and WWW-Authenticate: Payment header (MPP). Agent auto-registers on first request.',
      contact: {
        name: 'APIbase',
        url: 'https://apibase.pro',
      },
    },
    'x-discovery': {
      ownershipProofs: ['dns:apibase.pro'],
    } as Record<string, unknown>,
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
