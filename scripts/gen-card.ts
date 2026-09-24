import { writeFileSync, readFileSync } from 'fs';

// ZZ-03-06 (zz-03 Q7 ruling-1, item 3): one version, package.json, read into every generated
// JSON surface -- this file used to hardcode '2.1.0' as its own literal, a 6th independent
// place that would silently disagree the next time the version bumped and this file wasn't
// remembered.
const { version: PACKAGE_VERSION } = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string;
};

// T-0185a (disputes/0185-agent-readiness-isitagentready-73.ruling-1.md, task A): isitagentready's
// mcpServerCard check failed against the old full card (every active tool + its JSON schema
// inlined, megabytes of JSON). Its scanner code is closed so the exact cause (size vs. timeout in
// its Cloudflare Workers runtime) can't be proven, but SEP-2127 (Final) independently forbids
// listing tools in the server-card at all and recommends this exact shape -- so the card drops
// the tools array regardless of which theory is right. Smithery still reads prompts/resources
// from this same file for its own capability scoring (2026-03-16 incident, see /smithery skill),
// so those stay; the full tool list lives at /api/v1/tools and openapi.json, linked from here
// instead of duplicated into it.
function main() {
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

  const card = {
    serverInfo: {
      name: 'APIbase — The API Hub for AI Agents',
      version: PACKAGE_VERSION,
    },
    description: `One MCP + REST endpoint to APIbase's live tool catalog (counts: https://apibase.pro/llms.txt).`,
    url: 'https://apibase.pro/mcp',
    transport: { type: 'streamable-http' },
    capabilities: { tools: true, prompts: true, resources: false },
    authentication: { required: false },
    hasTools: false,
    prompts,
    resources: [
      {
        name: 'tool-catalog',
        description: 'Full tool catalog with schemas, pricing, and provider info',
        uri: 'https://apibase.pro/api/v1/tools',
      },
      {
        name: 'openapi',
        description: 'OpenAPI 3.1 spec for every active tool',
        uri: 'https://apibase.pro/.well-known/openapi.json',
      },
    ],
  };

  console.log(
    `server-card: version ${PACKAGE_VERSION}, ${prompts.length} prompts, hasTools: false`,
  );

  writeFileSync('static/.well-known/mcp/server-card.json', JSON.stringify(card, null, 2));
  console.log('server-card.json written');
}

main();
