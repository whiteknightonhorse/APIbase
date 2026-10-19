import { z, type ZodTypeAny } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { computeDefinitionSha256 } from '../mcp/tool-fingerprint';
import { zodToJsonSchema } from '../utils/zod-to-json-schema';
import { registerCatalogTools } from './tools/catalog.tools';
import { registerMerchantTools } from './tools/merchant.tools';
import { registerOrderTools } from './tools/order.tools';

/**
 * T-0502: definition fingerprints of the `shop.*` platform tools. Functions only and lazy: the
 * shop tool files import shop services, so building the map at module load could close a cycle
 * back into src/mcp/tool-fingerprint.ts and silently yield an empty map.
 *
 * A shop hash is sha256 over {id, description, input_schema} with input_schema =
 * zodToJsonSchema(z.object(inline shape)), the contract of FINGERPRINT_ALGORITHM.
 */

export interface ShopToolDefinition {
  id: string;
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  definition_sha256: string;
}

export function shopDefinitionOf(
  name: string,
  config: { description: string; inputSchema: Record<string, ZodTypeAny> },
): ShopToolDefinition {
  // No catch: a failed conversion must throw, a hash over {} would be a decoy.
  const input_schema = zodToJsonSchema(z.object(config.inputSchema));
  const description = config.description;
  return {
    id: name,
    name,
    description,
    input_schema,
    definition_sha256: computeDefinitionSha256({ id: name, description, input_schema }),
  };
}

let shopMap: ReadonlyMap<string, ShopToolDefinition> | undefined;

export function getShopToolDefinitions(): ReadonlyMap<string, ShopToolDefinition> {
  if (shopMap) return shopMap;
  const found: ShopToolDefinition[] = [];
  const capture = {
    registerTool(
      name: string,
      config: { description: string; inputSchema: Record<string, ZodTypeAny> },
    ) {
      found.push(shopDefinitionOf(name, config));
      return undefined;
    },
  } as unknown as McpServer;
  // Same three calls and arguments as src/shop/tool-definitions.ts.
  registerMerchantTools(capture, '', 'defs');
  registerCatalogTools(capture, '', 'defs');
  registerOrderTools(capture, '', 'defs');
  found.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  shopMap = new Map(found.map((d) => [d.name, d]));
  return shopMap;
}

const hashByName = new Map<string, string>();

/** Proxy (pattern of merchant-mcp-server.ts): only registerTool is intercepted, adds _meta. */
export function withDefinitionSha256(server: McpServer): McpServer {
  return new Proxy(server, {
    get(target, prop) {
      if (prop !== 'registerTool') return Reflect.get(target, prop) as unknown;
      return (
        name: string,
        config: {
          description: string;
          inputSchema: Record<string, ZodTypeAny>;
          _meta?: Record<string, unknown>;
        },
        cb: unknown,
      ) => {
        let sha = hashByName.get(name);
        if (sha === undefined) {
          sha = shopDefinitionOf(name, config).definition_sha256;
          hashByName.set(name, sha);
        }
        return (target.registerTool as (...a: unknown[]) => unknown).call(
          target,
          name,
          { ...config, _meta: { ...(config._meta ?? {}), 'apibase/definition_sha256': sha } },
          cb,
        );
      };
    },
  });
}
