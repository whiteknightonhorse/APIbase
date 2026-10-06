import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCatalogTools } from './tools/catalog.tools';
import { registerMerchantTools } from './tools/merchant.tools';
import { registerOrderTools } from './tools/order.tools';

/**
 * §8.3 (5): the `shop.*` tool definitions are versioned and hashed in the server-card. Bump the
 * version when a definition changes on purpose; the hash moves on any change at all (name,
 * description, schema, annotations), so a silent edit cannot go unnoticed.
 */
export const SHOP_TOOLS_VERSION = '2';

const canon = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canon)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, x]) => [k, canon(x)]),
        )
      : v;

/** Every `shop.*` tool as /mcp lists it, sorted by name. */
export async function shopToolDefinitions(): Promise<Array<Record<string, unknown>>> {
  const server = new McpServer({ name: 'shop-defs', version: '0' });
  registerMerchantTools(server, '', 'defs');
  registerCatalogTools(server, '', 'defs');
  registerOrderTools(server, '', 'defs');
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'shop-defs', version: '0' });
  try {
    await Promise.all([server.connect(a), client.connect(b)]);
    const { tools } = await client.listTools();
    return tools
      .filter((t) => t.name.startsWith('shop.'))
      .sort((x, y) => (x.name < y.name ? -1 : 1)) as unknown as Array<Record<string, unknown>>;
  } finally {
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

/** sha256 of the canonical JSON of the definitions (keys sorted, no whitespace). */
export function hashDefinitions(defs: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canon(defs)))
    .digest('hex');
}

export async function shopToolsDigest(): Promise<{
  version: string;
  count: number;
  sha256: string;
}> {
  const defs = await shopToolDefinitions();
  return { version: SHOP_TOOLS_VERSION, count: defs.length, sha256: hashDefinitions(defs) };
}
