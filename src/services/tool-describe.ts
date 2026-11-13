import { getToolById } from './tool-registry.service';
import { TOOL_DEFINITIONS } from '../mcp/tool-definitions';

/**
 * T-0837: the body of GET /api/v1/tools/<id>, shared by that route and the MCP tool
 * apibase.describe, so the two cannot differ. A shop.* id answers from the in-memory shop
 * definitions; any other id from the tool registry (definition, input schema, price, quality,
 * definition_sha256, alternatives). null = no such tool.
 */
export async function singleToolBody(toolId: string): Promise<object | null> {
  if (toolId.startsWith('shop.')) {
    // Lazy: the shop fingerprint module pulls the shop services (config, DB clients).
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { getShopToolDefinitions } =
      require('../shop/tool-fingerprint') as typeof import('../shop/tool-fingerprint');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const shop = getShopToolDefinitions().get(toolId);
    if (shop) {
      return {
        id: shop.id,
        name: shop.name,
        description: shop.description,
        input_schema: shop.input_schema,
        definition_sha256: shop.definition_sha256,
      };
    }
  }
  return getToolById(toolId);
}

/** mcpName -> toolId for every definition whose MCP name differs from its id. */
const TOOL_ID_BY_MCP_NAME: ReadonlyMap<string, string> = new Map(
  TOOL_DEFINITIONS.filter((d) => d.mcpName && d.mcpName !== d.toolId).map((d) => [
    d.mcpName as string,
    d.toolId,
  ]),
);

/** The tool id named by a toolId or an mcpName (apibase.describe accepts both). */
export function toolIdOf(idOrMcpName: string): string {
  return TOOL_ID_BY_MCP_NAME.get(idOrMcpName) ?? idOrMcpName;
}
