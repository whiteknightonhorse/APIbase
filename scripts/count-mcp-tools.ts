/**
 * count-mcp-tools.ts (T-0332) -- the ONE definition of the MCP tool-count formula.
 *
 *   PUBLISHED = active tools MCP actually registers: TOOL_DEFINITIONS entries whose tool_id is
 *               in the active DB snapshot (status != 'unavailable') AND that have a ZodObject
 *               schema -- the same three gates src/mcp/tool-adapter.ts registerTools() applies.
 *               REST /api/tools, llms.txt, the dashboard and the openapi paths all list this set.
 *   SHOP      = shop.* tools registered by registerMerchantTools/Catalog/Order (no `tools` row).
 *   PLATFORM  = apibase.discover + device.* (DB rows, already inside PUBLISHED) + SHOP.
 *   MCP_LIST  = PUBLISHED + SHOP = what tools/list returns.
 *   OPENAPI_PATHS = PUBLISHED + OPENAPI_NON_TOOL_PATHS (/api/tools, /api/v1/discover,
 *               /api/v1/agents/register).
 *
 * No server, no DB: the active set comes from SYNC_COUNTS_SNAPSHOT or the tracked
 * scripts/discovery-snapshot.tsv. Prints one JSON object.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';

export const OPENAPI_NON_TOOL_PATHS = 3;

export interface McpCounts {
  published: number;
  platform: number;
  shop: number;
  platform_in_published: number;
  mcp_list: number;
  openapi_paths: number;
  /** Active tool ids that MCP does not register (no definition, no schema, or non-object schema). */
  skipped: string[];
}

const isPlatformToolId = (id: string): boolean =>
  id === 'apibase.discover' || id.startsWith('device.');

export function computeMcpCounts(input: {
  defs: ReadonlyArray<{ toolId: string }>;
  schemas: Readonly<Record<string, unknown>>;
  activeIds: ReadonlySet<string>;
  shopCount: number;
}): McpCounts {
  const registered = new Set<string>();
  for (const d of input.defs) {
    if (input.activeIds.size > 0 && !input.activeIds.has(d.toolId)) continue;
    if (!(input.schemas[d.toolId] instanceof z.ZodObject)) continue;
    registered.add(d.toolId);
  }
  const inPublished = [...registered].filter(isPlatformToolId).length;
  return {
    published: registered.size,
    platform: inPublished + input.shopCount,
    shop: input.shopCount,
    platform_in_published: inPublished,
    mcp_list: registered.size + input.shopCount,
    openapi_paths: registered.size + OPENAPI_NON_TOOL_PATHS,
    skipped: [...input.activeIds].filter((id) => !registered.has(id)).sort(),
  };
}

/** The registry modules validate env at import; counting needs no real DB or credential. */
function setOfflineEnv(): void {
  process.env.NODE_ENV = 'test';
  for (const k of ['DATABASE_URL', 'DATABASE_URL_WORKER', 'DATABASE_URL_OUTBOX']) {
    process.env[k] ??= 'postgresql://offline:offline@127.0.0.1:1/offline';
  }
  process.env.API_KEY_SECRET ??= 'offline-count-only-0123456789abcdef';
  process.env.PROVIDER_KEY_OPENWEATHER ??= 'offline';
}

/**
 * Compares the generated surfaces with the formula. Returns the five numbers (one line) and
 * one failure line per surface that lies.
 */
export function checkSurfaces(
  c: McpCounts,
  mcpJson: { tools_count?: unknown; platform_tools_count?: unknown },
  openapiPaths: number,
  baseline?: number,
): { line: string; failures: string[] } {
  const line =
    `mcp.json tools_count=${mcpJson.tools_count} | PUBLISHED=${c.published} | ` +
    `tools/list=${c.mcp_list} (PUBLISHED+${c.shop} shop) | ` +
    `openapi paths=${openapiPaths} (want ${c.openapi_paths}) | PLATFORM=${c.platform}` +
    (baseline === undefined ? '' : ` | REST/llms baseline=${baseline}`);
  const failures: string[] = [];
  if (mcpJson.tools_count !== c.published)
    failures.push(
      `static/.well-known/mcp.json lies: tools_count=${mcpJson.tools_count}, PUBLISHED=${c.published}`,
    );
  if (mcpJson.platform_tools_count !== c.platform)
    failures.push(
      `static/.well-known/mcp.json lies: platform_tools_count=${mcpJson.platform_tools_count}, PLATFORM=${c.platform}`,
    );
  if (openapiPaths !== c.openapi_paths)
    failures.push(
      `static/.well-known/openapi.json lies: ${openapiPaths} paths, want PUBLISHED+${OPENAPI_NON_TOOL_PATHS} non-tool=${c.openapi_paths}`,
    );
  if (baseline !== undefined && baseline !== c.published)
    failures.push(
      `REST/llms baseline (discovery snapshot)=${baseline} but PUBLISHED=${c.published}`,
    );
  if (c.skipped.length) failures.push(`active tools MCP does not register: ${c.skipped.join(',')}`);
  return { line, failures };
}

async function main(): Promise<void> {
  setOfflineEnv();
  const root = resolve(__dirname, '..');
  const { TOOL_DEFINITIONS } = await import('../src/mcp/tool-definitions');
  const { toolSchemas } = await import('../src/schemas/index');
  const { shopToolDefinitions } = await import('../src/shop/tool-definitions');
  const snap = process.env.SYNC_COUNTS_SNAPSHOT || resolve(root, 'scripts/discovery-snapshot.tsv');
  const activeIds = new Set(
    readFileSync(snap, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('\t')[0]),
  );
  const counts = computeMcpCounts({
    defs: TOOL_DEFINITIONS,
    schemas: toolSchemas as Record<string, unknown>,
    activeIds,
    shopCount: (await shopToolDefinitions()).length,
  });
  if (!process.argv.includes('--check')) {
    process.stdout.write(JSON.stringify(counts) + '\n');
    return;
  }
  const mcpJson = JSON.parse(readFileSync(resolve(root, 'static/.well-known/mcp.json'), 'utf8'));
  const openapi = JSON.parse(
    readFileSync(resolve(root, 'static/.well-known/openapi.json'), 'utf8'),
  );
  const { line, failures } = checkSurfaces(
    counts,
    mcpJson,
    Object.keys(openapi.paths).length,
    activeIds.size,
  );
  console.log(`count-mcp-tools: ${line}`);
  for (const f of failures) console.log(`count-mcp-tools: STALE_MCP_COUNT ${f}`);
  process.exitCode = failures.length ? 1 : 0;
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
