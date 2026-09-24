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
import { toMicroUsdc } from '../src/config/x402.config';
import { getMppConfig } from '../src/config/mpp.config';
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
  const mppUsdcAddress = getMppConfig().usdcAddress;

  const paths: Record<string, OpenApiPath | Record<string, unknown>> = {};
  // Compact per-tool paths for the root discovery document (task C,
  // disputes/0187-scanner-commerce-x402-mpp-not-detected.ruling-1.md §2/§3) --
  // built in the SAME loop as `paths` so both documents come from one pass over
  // activeDefs and can never disagree on which tools/prices/categories exist.
  const discoveryPaths: Record<string, unknown> = {};
  const categories = new Set<string>();

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
    if (def.category) categories.add(def.category);

    // x-payment-info for MPPScan/AgentCash/mpp.dev discovery (task C ruling-2,
    // 0187C q-1): flat single-offer shape, not `offers[]`. mpp.dev/advanced/discovery
    // keeps the flat form valid as shorthand for a single offer; mppx 0.5.5 (the
    // pre-0.7.0 shape) and 0.11.0 both accept it, and it's the shape every consumer
    // that predates `offers[]` (t2000, readiness checkers of that era) actually reads.
    // We have exactly one offer per tool, so the shorthand is semantically exact, not
    // a hack. `amount` uses the SAME rounding as the x402 challenge (toMicroUsdc) so
    // both rails quote byte-identical numbers for the same tool. `protocols`/
    // `pricingMode`/`price` are additional fields unknown to any offers/flat
    // validator — safe alongside the flat fields, but NOT alongside `offers`, which
    // is why this shape has no `offers` key at all (mixing flat spec fields with
    // `offers` is what's disallowed, not unknown extra fields).
    const xPaymentInfo: Record<string, unknown> = {
      amount: toMicroUsdc(price),
      currency: mppUsdcAddress,
      intent: 'charge',
      method: 'tempo',
      description: `$${priceStr} USD per call`,
      protocols: ['x402', 'mpp'],
      pricingMode: 'fixed',
      price: priceStr,
    };

    discoveryPaths[`/api/v1/tools/${def.toolId}/call`] = {
      post: {
        operationId: def.toolId.replace(/\./g, '_'),
        summary: def.title || def.description,
        'x-payment-info': xPaymentInfo,
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ToolRequest' } },
          },
        },
        responses: {
          '200': { description: 'Tool execution result' },
          '402': { description: 'Payment Required' },
        },
      },
    };

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

  // Compact discovery document served at the ROOT /openapi.json (task C ruling §2):
  // the full 1.3+ MB static/.well-known/openapi.json above is what every published
  // link (llms.txt, server-card, mcp.json, ...) points to and stays untouched --
  // this second, much smaller document exists ONLY because MPPScan/AgentCash-class
  // scanners read the root path and truncate/reject anything past a few hundred KB
  // (confirmed: the 4 MB root alias returned in 102ms, i.e. unread). Same
  // TOOL_DEFINITIONS ∩ active-DB-snapshot intersection, same prices, same
  // toMicroUsdc rounding as the full doc and the real x402 402 -- one source, two
  // audiences, never two different truths for the same tool.
  const discoveryDoc = {
    openapi: '3.1.0',
    info: doc.info,
    'x-service-info': {
      categories: [...categories].sort(),
      docs: {
        homepage: 'https://apibase.pro',
        apiReference: 'https://apibase.pro/.well-known/openapi.json',
        llms: 'https://apibase.pro/llms.txt',
      },
    },
    servers: doc.servers,
    components: {
      schemas: {
        ToolRequest: { type: 'object', additionalProperties: true },
      },
    },
    paths: discoveryPaths,
    externalDocs: {
      description: 'Full OpenAPI 3.1 spec — all parameters, response codes, per-tool schemas',
      url: 'https://apibase.pro/.well-known/openapi.json',
    },
  };

  const outPath = resolve(__dirname, '..', 'static', '.well-known', 'openapi.json');
  const serialized = JSON.stringify(doc, null, 2) + '\n';
  const toolCount = activeDefs.length;
  const pathCount = Object.keys(paths).length;

  // No indentation on purpose ("без отступов", ruling §2/§3) -- this is what keeps
  // the root document small enough for scanners to actually read past their size
  // cutoff; the full pretty-printed doc stays at .well-known/openapi.json for humans.
  const discoveryOutPath = resolve(
    __dirname,
    '..',
    'static',
    '.well-known',
    'openapi-discovery.json',
  );
  const discoverySerialized = JSON.stringify(discoveryDoc) + '\n';
  const discoveryPathCount = Object.keys(discoveryPaths).length;

  // ZZ-03-06 attempt-3 (Fable REJECT item 6): same byte-for-byte "generated vs committed"
  // comparison as gen-discovery.ts --check, applied to openapi.json — a hand/sed edit anywhere
  // in this doc (paths, prose, version) now shows up as drift instead of only the two fields
  // (path-count, info.version) the old sync-counts.sh point checks happened to name. No date
  // field lives in this doc, so no masking is needed — a plain string comparison is exact.
  if (process.argv.includes('--check')) {
    let drift = false;
    for (const [path, content] of [
      [outPath, serialized],
      [discoveryOutPath, discoverySerialized],
    ] as const) {
      const existing = existsSync(path) ? readFileSync(path, 'utf-8') : null;
      if (content !== existing) {
        console.error(`generate-openapi --check: DRIFT in ${path}`);
        const diff = spawnSync('diff', ['-u', existing !== null ? path : '/dev/null', '-'], {
          input: content,
          encoding: 'utf-8',
        });
        console.error(diff.stdout || diff.stderr || '(diff produced no output)');
        drift = true;
      }
    }
    if (drift) {
      process.exitCode = 1;
      return;
    }
    console.log(
      `generate-openapi --check: OK, 0 drift (${pathCount} paths, ${toolCount} tools + 3 platform; discovery doc ${discoveryPathCount} tool paths)`,
    );
    return;
  }

  writeFileSync(outPath, serialized, 'utf-8');
  writeFileSync(discoveryOutPath, discoverySerialized, 'utf-8');
  console.log(`OpenAPI spec generated: ${pathCount} paths (${toolCount} tools + 3 platform)`);
  console.log(`Output: ${outPath}`);
  console.log(
    `Discovery doc generated: ${discoveryPathCount} tool paths, ${discoverySerialized.length} bytes`,
  );
  console.log(`Output: ${discoveryOutPath}`);
}

generate()
  .catch((err) => {
    console.error('generate-openapi failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
