import { TOOL_DEFINITIONS } from '../src/mcp/tool-definitions';
import { toolSchemas } from '../src/schemas/index';
import { zodToJsonSchema } from '../src/utils/zod-to-json-schema';
for (const d of TOOL_DEFINITIONS) {
  const schema = toolSchemas[d.toolId];
  if (!schema) { console.log(`NO SCHEMA: ${d.toolId}`); continue; }
  const js = zodToJsonSchema(schema) as any;
  const props = js.properties || {};
  for (const [k, v] of Object.entries(props)) {
    if (!(v as any).description) console.log(`${d.toolId}.${k}`);
  }
}
