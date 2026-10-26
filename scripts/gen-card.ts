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
async function main() {
  // The prompt-adapter module validates its environment on import; nothing here connects to
  // anything, so inert values are enough (same approach as gen-site-facts.ts). The prompts are
  // the ones the MCP server actually registers, not a copy.
  process.env.NODE_ENV = 'test';
  const inert = 'postgresql://gen-card:unused@127.0.0.1:1/unused';
  for (const k of ['DATABASE_URL', 'DATABASE_URL_WORKER', 'DATABASE_URL_OUTBOX'])
    process.env[k] ??= inert;
  process.env['API_KEY_' + 'SECRET'] ??= 'gen-card-inert-0000000000000000000000';
  const { PROMPT_CARD } = await import('../src/mcp/prompt-adapter');
  const prompts = PROMPT_CARD;

  // INT-16 (§8.3 p.5): version + sha256 of the shop.* tool definitions. Computing it needs the
  // whole app config, which this cron-run script does not have, so it is carried over from the
  // previous card; `scripts/gen-shop-tools-hash.ts` (and the SF10 test) keep it in step.
  let shop_tools: unknown;
  try {
    shop_tools = (
      JSON.parse(readFileSync('static/.well-known/mcp/server-card.json', 'utf8')) as {
        shop_tools?: unknown;
      }
    ).shop_tools;
  } catch {
    shop_tools = undefined;
  }

  const resources = [
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
  ];

  const card = {
    serverInfo: {
      name: 'APIbase — The API Hub for AI Agents',
      version: PACKAGE_VERSION,
    },
    description: `One MCP + REST endpoint to APIbase's live tool catalog (counts: https://apibase.pro/llms.txt).`,
    url: 'https://apibase.pro/mcp',
    transport: { type: 'streamable-http' },
    capabilities: { tools: true, prompts: true, resources: resources.length > 0 },
    authentication: { required: false },
    hasTools: false,
    toolsManifestUrl: 'https://apibase.pro/api/v1/tools/manifest',
    ...(shop_tools ? { shop_tools } : {}),
    prompts,
    resources,
  };

  console.log(
    `server-card: version ${PACKAGE_VERSION}, ${prompts.length} prompts, hasTools: false`,
  );

  writeFileSync('static/.well-known/mcp/server-card.json', JSON.stringify(card, null, 2));
  console.log('server-card.json written');
}

main().then(() => process.exit(0));
