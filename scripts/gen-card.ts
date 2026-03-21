import { TOOL_DEFINITIONS } from '../src/mcp/tool-definitions';
import { toolSchemas } from '../src/schemas/index';
import { zodToJsonSchema } from '../src/utils/zod-to-json-schema';
import { writeFileSync } from 'fs';

const tools = TOOL_DEFINITIONS.map(d => {
  const schema = toolSchemas[d.toolId];
  const jsonSchema = schema ? zodToJsonSchema(schema) : { type: 'object', properties: {} };
  return {
    name: d.mcpName,
    description: d.description,
    inputSchema: jsonSchema,
    annotations: d.annotations
  };
});

const prompts = [
  {
    name: 'discover-tools',
    description: 'Find the right APIbase tools for a task. Describes available categories, search strategies, and tool selection criteria.',
    arguments: [{ name: 'task', description: 'What you want to accomplish (e.g. "find flights from NYC to London")', required: true }]
  },
  {
    name: 'api-workflow',
    description: 'Design a multi-step API workflow combining multiple APIbase tools. Returns execution plan with tool sequence, data flow, and error handling.',
    arguments: [
      { name: 'goal', description: 'End-to-end goal (e.g. "plan a trip to Tokyo with flights, weather, and local events")', required: true },
      { name: 'budget', description: 'Optional USDC budget constraint for the workflow', required: false }
    ]
  },
  {
    name: 'x402-payment-guide',
    description: 'Explains x402 USDC micropayment flow for APIbase. Covers wallet setup on Base, payment headers, escrow mechanics, and refund policy.',
    arguments: [{ name: 'topic', description: 'Specific payment topic (e.g. "setup", "escrow", "refunds", "pricing")', required: false }]
  }
];

const toolCount = tools.length;
const card = {
  name: 'APIbase — The API Hub for AI Agents',
  description: `Production MCP server providing ${toolCount} real-world API tools across 30+ categories. One endpoint, pay-per-call via x402 USDC micropayments on Base.`,
  version: '2.1.0',
  tools,
  prompts,
  resources: [
    { name: 'tool-catalog', description: 'Full tool catalog with schemas, pricing, and provider info', uri: 'https://apibase.pro/api/v1/tools' },
    { name: 'health-status', description: 'System health check', uri: 'https://apibase.pro/health/ready' }
  ]
};

const totalParams = tools.reduce((s,t) => s + Object.keys((t.inputSchema as any).properties || {}).length, 0);
const descParams = tools.reduce((s,t) => s + Object.values((t.inputSchema as any).properties || {}).filter((v:any) => v.description).length, 0);
console.log(`Tools: ${toolCount}, Prompts: ${prompts.length}, Params: ${descParams}/${totalParams}`);

writeFileSync('static/.well-known/mcp/server-card.json', JSON.stringify(card, null, 2));
console.log('server-card.json written');
