import { PrismaClient } from '@prisma/client';
import { TOOL_DEFINITIONS } from '../src/mcp/tool-definitions';
import { toolSchemas } from '../src/schemas/index';
import { zodToJsonSchema } from '../src/utils/zod-to-json-schema';
import { writeFileSync, readFileSync } from 'fs';

const prisma = new PrismaClient();

// T-05 (2026-09-04, ruling-1): when sync-counts.sh's self-heal runs this, it sets
// SYNC_COUNTS_SNAPSHOT to a `tool_id<TAB>provider` file it dumped from ONE atomic query, so this
// script and gen-catalog-page.ts both build off the exact same frozen set instead of each running
// their own separate live query seconds apart (AP-8 writes `tools` continuously — three separate
// queries in one run were confirmed to see three different counts). Manual/ad-hoc invocations
// with the variable unset fall back to a live query, unchanged.
function readActiveToolIds(): Set<string> | null {
  const snapshotPath = process.env.SYNC_COUNTS_SNAPSHOT;
  if (!snapshotPath) return null;
  const lines = readFileSync(snapshotPath, 'utf8').split('\n').filter(Boolean);
  return new Set(lines.map((l) => l.split('\t')[0]));
}

const DEFAULT_OUTPUT = {
  type: 'object',
  properties: {
    result: {
      description:
        'Tool response payload. Shape varies per tool — consult the tool description and inputSchema. May be an object, array, string, or number depending on the upstream provider response.',
    },
    error: {
      description:
        'Present only when the call failed. Includes error code, message, request_id, and any provider-specific extras.',
    },
  },
  required: ['result'],
};

async function main() {
  // Same filter as the live catalog route (src/services/tool-registry.service.ts):
  // status !== 'unavailable'. Publishing anything wider would drift server-card.json
  // ahead of what /api/v1/tools and MCP tools/list actually serve.
  const snapshotIds = readActiveToolIds();
  const activeIds =
    snapshotIds ??
    new Set(
      (
        await prisma.tool.findMany({
          where: { status: { not: 'unavailable' } },
          select: { tool_id: true },
        })
      ).map((r) => r.tool_id),
    );

  const orphaned = TOOL_DEFINITIONS.filter((d) => !activeIds.has(d.toolId));
  if (orphaned.length > 0) {
    console.warn(
      `gen-card: skipping ${orphaned.length} tool(s) in TOOL_DEFINITIONS with no active DB row (never seeded or unavailable): ${orphaned.map((d) => d.toolId).join(', ')}`,
    );
  }

  const tools = TOOL_DEFINITIONS.filter((d) => activeIds.has(d.toolId)).map((d) => {
    const schema = toolSchemas[d.toolId];
    const jsonSchema = schema ? zodToJsonSchema(schema) : { type: 'object', properties: {} };
    return {
      name: d.mcpName,
      description: d.description,
      inputSchema: jsonSchema,
      outputSchema: DEFAULT_OUTPUT,
      annotations: d.annotations,
    };
  });

  const prompts = [
    {
      name: 'discover-tools',
      description:
        'Find the right APIbase tools for a task. Describes available categories, search strategies, and tool selection criteria.',
      arguments: [
        {
          name: 'task',
          description: 'What you want to accomplish (e.g. "find flights from NYC to London")',
          required: true,
        },
      ],
    },
    {
      name: 'api-workflow',
      description:
        'Design a multi-step API workflow combining multiple APIbase tools. Returns execution plan with tool sequence, data flow, and error handling.',
      arguments: [
        {
          name: 'goal',
          description:
            'End-to-end goal (e.g. "plan a trip to Tokyo with flights, weather, and local events")',
          required: true,
        },
        {
          name: 'budget',
          description: 'Optional USDC budget constraint for the workflow',
          required: false,
        },
      ],
    },
    {
      name: 'x402-payment-guide',
      description:
        'Explains x402 USDC micropayment flow for APIbase. Covers wallet setup on Base, payment headers, escrow mechanics, and refund policy.',
      arguments: [
        {
          name: 'topic',
          description: 'Specific payment topic (e.g. "setup", "escrow", "refunds", "pricing")',
          required: false,
        },
      ],
    },
  ];

  const toolCount = tools.length;
  const card = {
    name: 'APIbase — The API Hub for AI Agents',
    description: `Production MCP server providing ${toolCount} real-world API tools across 30+ categories. One endpoint, pay-per-call via x402 USDC micropayments on Base.`,
    version: '2.1.0',
    tools,
    prompts,
    resources: [
      {
        name: 'tool-catalog',
        description: 'Full tool catalog with schemas, pricing, and provider info',
        uri: 'https://apibase.pro/api/v1/tools',
      },
      {
        name: 'health-status',
        description: 'System health check',
        uri: 'https://apibase.pro/health/ready',
      },
    ],
  };

  const totalParams = tools.reduce(
    (s, t) => s + Object.keys((t.inputSchema as any).properties || {}).length,
    0,
  );
  const descParams = tools.reduce(
    (s, t) =>
      s +
      Object.values((t.inputSchema as any).properties || {}).filter((v: any) => v.description)
        .length,
    0,
  );
  console.log(
    `Tools: ${toolCount}, Prompts: ${prompts.length}, Params: ${descParams}/${totalParams}`,
  );

  writeFileSync('static/.well-known/mcp/server-card.json', JSON.stringify(card, null, 2));
  console.log('server-card.json written');
}

main()
  .catch((err) => {
    console.error('gen-card failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
