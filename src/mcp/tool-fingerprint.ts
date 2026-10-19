import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import stringify from 'fast-json-stable-stringify';
import { toolSchemas } from '../schemas/index';
import { zodToJsonSchema } from '../utils/zod-to-json-schema';
import { TOOL_DEFINITIONS } from './tool-definitions';

/**
 * T-0500: tool definition fingerprints. A client can pin what it discovered and see a
 * quietly edited description or input schema. Built once at module load.
 *
 * Price, status, quality and `_meta` are NOT hashed: price has its own contract (the 402
 * quote), so a price change must not look like an edited description.
 */

// REST (tool-registry.service.ts) and MCP both read description / input_schema from these.
export const TOOL_SCHEMAS_JSON: ReadonlyMap<string, Record<string, unknown>> = (() => {
  const map = new Map<string, Record<string, unknown>>();
  for (const [toolId, schema] of Object.entries(toolSchemas)) {
    try {
      map.set(toolId, zodToJsonSchema(schema));
    } catch {
      // Skip tools with unconvertible schemas — they get empty {}
    }
  }
  return map;
})();

export const TOOL_DESCRIPTIONS: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const def of TOOL_DEFINITIONS) {
    map.set(def.toolId, def.description);
  }
  return map;
})();

export const FINGERPRINT_ALGORITHM =
  'definition_sha256 = sha256hex(stable_json({id, description, input_schema})) where id is the tool id and description / input_schema are exactly what GET /api/v1/tools/<id> returns; stable_json = fast-json-stable-stringify (keys sorted recursively, no whitespace); manifest_sha256 = sha256hex(stable_json([[id, definition_sha256], ...])) sorted by id over every tool tools/list serves; price, status, quality and _meta are not hashed';

function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function computeDefinitionSha256(def: {
  id: string;
  description: string;
  input_schema: Record<string, unknown>;
  /** Accepted so callers can pass a whole catalog entry; deliberately never hashed. */
  price_usd?: number;
}): string {
  return sha256Hex(
    stringify({ id: def.id, description: def.description, input_schema: def.input_schema }),
  );
}

export const TOOL_FINGERPRINTS: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const def of TOOL_DEFINITIONS) {
    map.set(
      def.toolId,
      computeDefinitionSha256({
        id: def.toolId,
        description: TOOL_DESCRIPTIONS.get(def.toolId) ?? def.toolId,
        input_schema: TOOL_SCHEMAS_JSON.get(def.toolId) ?? {},
      }),
    );
  }
  return map;
})();

export function getDefinitionSha256(toolId: string): string | undefined {
  return TOOL_FINGERPRINTS.get(toolId);
}

// Same runtime read as src/mcp/server.ts (package.json sits outside tsconfig rootDir).
const { version: PACKAGE_VERSION } = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf8'),
) as { version: string };

export interface ToolManifest {
  algorithm: string;
  manifest_sha256: string;
  total: number;
  package_version: string;
  tools: Array<{ id: string; name: string; definition_sha256: string }>;
}

function buildManifestTools(): ToolManifest['tools'] {
  // Required lazily, synchronously: served-tools pulls the tool-status stage and the shop
  // fingerprint pulls the shop services (config, DB clients). A top-level import would load
  // them into every importer of this module (tool-registry.service, scripts, unit tests).
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { servedToolDefinitions } = require('./served-tools') as typeof import('./served-tools');
  const { getShopToolDefinitions } =
    require('../shop/tool-fingerprint') as typeof import('../shop/tool-fingerprint');
  /* eslint-enable @typescript-eslint/no-require-imports */
  // Both sources read the in-memory active-id cache or static maps: no DB query, timer or async.
  const tools: ToolManifest['tools'] = servedToolDefinitions().map((def) => ({
    id: def.toolId,
    name: def.mcpName || def.toolId,
    definition_sha256: TOOL_FINGERPRINTS.get(def.toolId) as string,
  }));
  for (const d of getShopToolDefinitions().values()) {
    tools.push({ id: d.name, name: d.name, definition_sha256: d.definition_sha256 });
  }
  return tools.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function manifestShaOf(tools: ToolManifest['tools']): string {
  return sha256Hex(stringify(tools.map((t) => [t.id, t.definition_sha256])));
}

export function getManifest(): ToolManifest {
  const tools = buildManifestTools();
  return {
    algorithm: FINGERPRINT_ALGORITHM,
    manifest_sha256: manifestShaOf(tools),
    total: tools.length,
    package_version: PACKAGE_VERSION,
    tools,
  };
}

export function getManifestSha256(): string {
  return manifestShaOf(buildManifestTools());
}
