/**
 * Registry coverage (B-04, §12.43).
 *
 * Two production incidents shipped a `tool_id` prefix with no matching `case`
 * in resolveAdapter()'s switch: iban (2026-04-05) and irctc (2026-06-06). Both
 * gave live agents a 503 "No adapter registered" for a tool the catalog
 * advertised as available. Neither was caught by anything except the nightly
 * smoke test against production. This suite catches the class in CI: every
 * unique `tool_id` prefix in the seed config MUST resolve to a real adapter,
 * and every schema actually wired for MCP registration MUST describe at
 * least one parameter (Smithery param-description rule, 2026-03-30).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as YAML from 'yaml';
import { z } from 'zod';

// resolveAdapter() gates most cases on a provider credential being present in
// config (`cfgKey()` / direct `config.X` checks). A Proxy that answers every
// property access with a truthy, non-'MANUAL_REQUIRED' string means the test
// exercises "does a case exist for this prefix", not "is .env populated" —
// which is the actual thing this test is meant to guarantee.
jest.mock('../../../src/config/index', () => ({
  config: new Proxy(
    {},
    {
      get: () => 'registry-coverage-test-value',
    },
  ),
}));

// @polymarket/clob-client and jose ship ESM-only (`export * from ...`) and jest's
// default transform can't parse them. Nothing under test touches Polymarket order
// placement or platform batch execution — stub these adapter module boundaries so
// their dependency chains (which pull in the payment pipeline / jose) never load.
jest.mock('../../../src/adapters/polymarket', () => ({
  PolymarketAdapter: class {},
}));
jest.mock('../../../src/adapters/platform', () => ({
  PlatformAdapter: class {},
}));

import { resolveAdapter } from '../../../src/adapters/registry';
import { toolSchemas } from '../../../src/schemas/index';

interface YamlToolEntry {
  tool_id: string;
}

const yamlPath = path.join(__dirname, '../../../config/tool_provider_config.yaml');
const yamlDoc = YAML.parse(fs.readFileSync(yamlPath, 'utf-8')) as { tools: YamlToolEntry[] };

const toolIdsByPrefix = new Map<string, string[]>();
for (const { tool_id } of yamlDoc.tools) {
  const prefix = tool_id.split('.')[0];
  const list = toolIdsByPrefix.get(prefix) ?? [];
  list.push(tool_id);
  toolIdsByPrefix.set(prefix, list);
}
const uniquePrefixes = [...toolIdsByPrefix.keys()].sort();

describe('adapter registry coverage (§12.43)', () => {
  test('found unique tool_id prefixes to check', () => {
    // Sanity guard: if this ever collapses to 0, the YAML parse silently broke
    // and every test.each below would trivially "pass" over an empty array.
    expect(uniquePrefixes.length).toBeGreaterThan(100);
  });

  test.each(uniquePrefixes)(
    'tool_id prefix "%s" resolves via resolveAdapter() to a registered adapter',
    (prefix) => {
      const adapter = resolveAdapter(`${prefix}.__registry_coverage_probe__`);
      expect(adapter).toBeDefined();

      // Same prefix, second axis: every schema already wired for this prefix
      // must describe at least one parameter (flywheel rule, 2026-03-30) —
      // z.object({}) with 0 described params silently tanks Smithery's score.
      for (const toolId of toolIdsByPrefix.get(prefix) ?? []) {
        const schema = toolSchemas[toolId];
        if (!schema) continue; // not yet wired into MCP registration — out of scope here

        expect(schema instanceof z.ZodObject).toBe(true);
        if (!(schema instanceof z.ZodObject)) continue;

        const shape = schema.shape as Record<string, z.ZodTypeAny>;
        const describedParams = Object.keys(shape).filter((key) => !!shape[key].description);
        expect(describedParams.length).toBeGreaterThanOrEqual(1);
      }
    },
  );
});
