/**
 * OpenAPI 3.1 spec generator for APIbase.
 *
 * Reads TOOL_DEFINITIONS + Zod schemas → static/.well-known/openapi.json
 * Run: npx tsx scripts/generate-openapi.ts
 *
 * No new dependencies — inline Zod→JSON Schema converter.
 */

import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { TOOL_DEFINITIONS } from '../src/mcp/tool-definitions';
import { toolSchemas } from '../src/schemas/index';
import { zodToJsonSchema } from '../src/utils/zod-to-json-schema';
import { parse } from 'yaml';

// Load tool prices from config
const yamlContent = readFileSync(
  resolve(__dirname, '..', 'config', 'tool_provider_config.yaml'),
  'utf-8',
);
const toolConfigs: Array<{ tool_id: string; price_usd: string }> = parse(yamlContent)?.tools ?? [];
const priceMap = new Map<string, number>();
for (const tc of toolConfigs) {
  priceMap.set(tc.tool_id, parseFloat(tc.price_usd) || 0);
}

const { version: PACKAGE_VERSION } = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'),
) as { version: string };

// ZZ-03-06 (zz-03 Q7 ruling-1, item 1 of the "Обязательный контроль"): TOOL_DEFINITIONS alone
// has ~50 more entries than are actually seeded/active (never-seeded or since-demoted tools) —
// that gap was the exact cause of a confirmed 52-path surplus in this file (1436 paths vs 1384
// live tools). Filter to the same TOOL_DEFINITIONS ∩ active-DB-snapshot intersection
// gen-card.ts/gen-discovery.ts already use, via the same SYNC_COUNTS_SNAPSHOT convention (T-05,
// 2026-09-04, ruling-1) so every generator in one sync-counts.sh self-heal run agrees exactly.
const prisma = new PrismaClient();

async function loadActiveToolIds(): Promise<Set<string>> {
  const snapshotPath = process.env.SYNC_COUNTS_SNAPSHOT;
  if (snapshotPath) {
    const lines = readFileSync(snapshotPath, 'utf8').split('\n').filter(Boolean);
    return new Set(lines.map((l) => l.split('\t')[0]));
  }
  const rows = await prisma.tool.findMany({
    where: { status: { not: 'unavailable' } },
    select: { tool_id: true },
  });
  return new Set(rows.map((r) => r.tool_id));
}

// ---------------------------------------------------------------------------
// Generate OpenAPI 3.1 document
// ---------------------------------------------------------------------------

interface OpenApiPath {
  post: {
    operationId: string;
    summary: string;
    description: string;
    parameters: Array<{
      name: string;
      in: string;
      required: boolean;
      schema: Record<string, unknown>;
    }>;
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

async function generate(): Promise<void> {
  const activeIds = await loadActiveToolIds();
  const activeDefs = TOOL_DEFINITIONS.filter((d) => activeIds.has(d.toolId));

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

  // ZZ-03-05: ranked discovery contract — thin REST wrapper over the same discover() that
  // backs the apibase.discover MCP tool and the discover_tools prompt. No auth, no charge.
  paths['/api/v1/discover'] = {
    get: {
      operationId: 'discoverTools',
      summary: 'Discover tools by intent, category, or max price',
      description:
        'Ranked discovery contract (ZZ-03-05) — the same implementation as the apibase.discover MCP tool. Free, no auth. Ranks by keyword match, then measured quality, then price; excludes unavailable tools unless include_unavailable=true.',
      parameters: [
        {
          name: 'intent',
          in: 'query',
          required: false,
          schema: {
            type: 'string',
            description:
              'Free-text description of the task, e.g. "find current hotel prices in Tokyo"',
          },
        },
        {
          name: 'category',
          in: 'query',
          required: false,
          schema: {
            type: 'string',
            description: 'Filter by category (TOOL_DEFINITIONS[].category)',
          },
        },
        {
          name: 'max_price_usd',
          in: 'query',
          required: false,
          schema: {
            type: 'number',
            minimum: 0,
            description: 'Only return tools priced at or below this amount (USD)',
          },
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        },
        {
          name: 'include_unavailable',
          in: 'query',
          required: false,
          schema: { type: 'boolean', default: false },
        },
      ],
      responses: {
        '200': { description: 'Ranked discovery results' },
      },
    },
  };

  // Agent registration
  paths['/api/v1/agents/register'] = {
    post: {
      operationId: 'registerAgent',
      summary: 'Register an AI agent',
      description: 'Register a new agent and receive API credentials (api_key and agent_id).',
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

  // Per-tool execution paths — only for tools in the active intersection (see loadActiveToolIds).
  for (const def of activeDefs) {
    const schema = toolSchemas[def.toolId];
    const operationId = def.toolId.replace(/\./g, '_');
    const inputSchema = schema ? zodToJsonSchema(schema) : { type: 'object' };

    const price = priceMap.get(def.toolId) ?? 0;
    const priceStr = price.toFixed(6);

    // x-payment-info for MPPScan/AgentCash discovery
    const xPaymentInfo: Record<string, unknown> =
      price > 0
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
      version: PACKAGE_VERSION,
      description:
        'APIbase aggregates, normalizes, and provides APIs from hundreds of businesses in a unified format optimized for AI agent consumption. Search flights, trade prediction markets, check weather, and more — all via a single REST API or MCP endpoint. Supports dual-rail payments: x402 (USDC on Base) and MPP (USDC on Tempo).',
      'x-guidance':
        'Use POST /api/v1/tools/{tool_id}/call to invoke any tool. Send Authorization: Bearer <api_key> header. Tool catalog at GET /api/v1/tools. MCP endpoint at /mcp. Payment: 402 responses include both x402 body and WWW-Authenticate: Payment header (MPP). Agent auto-registers on first request.',
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
  const serialized = JSON.stringify(doc, null, 2) + '\n';
  const toolCount = activeDefs.length;
  const pathCount = Object.keys(paths).length;

  // ZZ-03-06 attempt-3 (Fable REJECT item 6): same byte-for-byte "generated vs committed"
  // comparison as gen-discovery.ts --check, applied to openapi.json — a hand/sed edit anywhere
  // in this doc (paths, prose, version) now shows up as drift instead of only the two fields
  // (path-count, info.version) the old sync-counts.sh point checks happened to name. No date
  // field lives in this doc, so no masking is needed — a plain string comparison is exact.
  if (process.argv.includes('--check')) {
    const existing = existsSync(outPath) ? readFileSync(outPath, 'utf-8') : null;
    if (serialized !== existing) {
      console.error(`generate-openapi --check: DRIFT in ${outPath}`);
      const diff = spawnSync('diff', ['-u', existing !== null ? outPath : '/dev/null', '-'], {
        input: serialized,
        encoding: 'utf-8',
      });
      console.error(diff.stdout || diff.stderr || '(diff produced no output)');
      process.exitCode = 1;
      return;
    }
    console.log(
      `generate-openapi --check: OK, 0 drift (${pathCount} paths, ${toolCount} tools + 3 platform)`,
    );
    return;
  }

  writeFileSync(outPath, serialized, 'utf-8');
  console.log(`OpenAPI spec generated: ${pathCount} paths (${toolCount} tools + 3 platform)`);
  console.log(`Output: ${outPath}`);
}

generate()
  .catch((err) => {
    console.error('generate-openapi failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
