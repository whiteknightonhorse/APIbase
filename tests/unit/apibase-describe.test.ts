/**
 * T-0837: apibase.describe returns the body of GET /api/v1/tools/<id> (one function,
 * singleToolBody), accepts a toolId or an mcpName, and answers an unknown id with a tool error
 * that points to apibase.discover.
 */
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

jest.mock('../../src/services/tool-registry.service', () => ({
  getPublicCatalog: jest.fn(),
  getToolsPaginated: jest.fn(),
  getPublicCatalogPage: jest.fn(),
  getToolById: jest.fn(),
  DEFAULT_TOOLS_LIMIT: 2000,
  MAX_TOOLS_LIMIT: 2000,
}));
jest.mock('../../src/services/discovery.service', () => ({
  discover: jest.fn(),
  categorySummary: jest.fn(),
}));
jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({
  getActiveToolIds: () => new Set<string>(),
}));

import { toolsRouter } from '../../src/routes/tools.router';
import { getToolById } from '../../src/services/tool-registry.service';
import { ApibaseAdapter } from '../../src/adapters/apibase';
import { TOOL_DEFINITIONS } from '../../src/mcp/tool-definitions';
import { toolSchemas } from '../../src/schemas/index';
import { getShopToolDefinitions } from '../../src/shop/tool-fingerprint';
import type { ProviderRequest } from '../../src/types/provider';

const DEF = TOOL_DEFINITIONS.find((d) => d.toolId === 'apibase.discover')!;
const ENTRY = {
  id: 'apibase.discover',
  name: 'Discover Tools',
  description: DEF.description,
  input_schema: { type: 'object', properties: { intent: { type: 'string' } } },
  pricing: { price_usd: 0, cache_hit_price_usd: 0 },
  definition_sha256: 'a'.repeat(64),
  status: 'available',
  quality: { method: 'apibase-rs/1', provider: { score: null }, tool: null },
  alternatives: [],
};

let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use(toolsRouter);
  await new Promise<void>((r) => {
    server = app.listen(0, '127.0.0.1', () => r());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});
beforeEach(() => {
  (getToolById as jest.Mock).mockReset();
  (getToolById as jest.Mock).mockImplementation(async (id: string) =>
    id === 'apibase.discover' ? ENTRY : null,
  );
});

const adapter = new ApibaseAdapter();
const describe_ = (tool_id: unknown) =>
  adapter.call({ toolId: 'apibase.describe', params: { tool_id } } as unknown as ProviderRequest);
const rest = async (id: string) => (await fetch(`${base}/api/v1/tools/${id}`)).json();

describe('apibase.describe (T-0837)', () => {
  it('is defined with one tool_id argument', () => {
    const def = TOOL_DEFINITIONS.find((d) => d.toolId === 'apibase.describe')!;
    expect(def.mcpName).toBe('apibase.discovery.describe');
    expect(def.annotations).toEqual(
      TOOL_DEFINITIONS.find((d) => d.toolId === 'apibase.discover')!.annotations,
    );
    expect(toolSchemas['apibase.describe'].safeParse({ tool_id: 'x' }).success).toBe(true);
    expect(toolSchemas['apibase.describe'].safeParse({}).success).toBe(false);
  });

  it('equals the REST single-tool body for a toolId', async () => {
    const viaTool = await describe_('apibase.discover');
    expect(viaTool.status).toBe(200);
    expect(JSON.parse(JSON.stringify(viaTool.body))).toEqual(await rest('apibase.discover'));
  });

  it('accepts the mcpName and answers the same body', async () => {
    const a = await describe_('apibase.discovery.search');
    const b = await describe_('apibase.discover');
    expect(a.body).toEqual(b.body);
    expect(getToolById).toHaveBeenLastCalledWith('apibase.discover');
  });

  it('equals the REST body for a shop.* tool', async () => {
    const [id] = getShopToolDefinitions().keys();
    const viaTool = await describe_(id);
    expect(JSON.parse(JSON.stringify(viaTool.body))).toEqual(await rest(id));
    expect(getToolById).not.toHaveBeenCalled();
  });

  it('an unknown id is a tool error (422 input rejected) that says to call apibase.discover', async () => {
    await expect(describe_('no.such.tool')).rejects.toMatchObject({
      code: 'provider_input_rejected',
      httpStatus: 422,
      message: expect.stringContaining('apibase.discover'),
    });
    expect((await fetch(`${base}/api/v1/tools/no.such.tool`)).status).not.toBe(200);
  });

  it('a non-string id is rejected the same way, without a lookup', async () => {
    await expect(describe_(['apibase.discover'])).rejects.toMatchObject({
      code: 'provider_input_rejected',
    });
    expect(getToolById).not.toHaveBeenCalled();
  });
});
