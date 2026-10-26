/**
 * T-0528: ttlMs/cacheScope on list results (legacy initialize flow unchanged) and the protocol
 * versions in mcp.json read from the SDK constant. MCP 2026-07-28 itself is not served: the newest
 * released SDK (1.32.2) does not list it (see the knowledge note).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from '../../src/mcp/server';
import {
  createMerchantMcpServer,
  type StorefrontMerchant,
} from '../../src/shop/merchant-mcp-server';
import { NEGOTIATED_PROTOCOL_VERSIONS } from '../../src/mcp/list-cache';

jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/pipeline/pipeline', () => ({ runPipeline: jest.fn() }));
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({
  getActiveToolIds: () => new Set<string>(),
}));

const shop = (slug: string): StorefrontMerchant =>
  ({
    merchant_id: 'm1',
    slug,
    name: 'Skate Hut',
    status: 'active',
  }) as unknown as StorefrontMerchant;

async function connect(server: ReturnType<typeof createMcpServer>): Promise<Client> {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const c = new Client({ name: 't', version: '1' });
  await Promise.all([server.connect(a), c.connect(b)]); // legacy initialize handshake
  return c;
}

describe('list cache hints (T-0528)', () => {
  it('tools/list carries ttlMs 300000 (number) and cacheScope public; tools still listed', async () => {
    const c = await connect(createMcpServer('', 'req', {} as never));
    const r = (await c.listTools()) as Record<string, unknown> & { tools: unknown[] };
    expect(r.tools.length).toBeGreaterThan(0);
    expect(typeof r.ttlMs).toBe('number');
    expect(r.ttlMs).toBe(300000);
    expect(r.cacheScope).toBe('public');
  });

  it('prompts/list carries the same hints', async () => {
    const c = await connect(createMcpServer('', 'req', {} as never));
    const r = (await c.listPrompts()) as Record<string, unknown>;
    expect(r.ttlMs).toBe(300000);
    expect(r.cacheScope).toBe('public');
  });

  it('storefront tools/list carries the hints', async () => {
    const c = await connect(createMerchantMcpServer(shop('skate-hut')));
    const r = (await c.listTools()) as Record<string, unknown>;
    expect(r.ttlMs).toBe(300000);
    expect(r.cacheScope).toBe('public');
  });

  it('mcp.json states the SDK-negotiated versions, newest first', () => {
    const j = JSON.parse(
      readFileSync(join(__dirname, '../../static/.well-known/mcp.json'), 'utf8'),
    ) as { protocolVersion: string; protocolVersions: string[] };
    expect(j.protocolVersions).toEqual([...SUPPORTED_PROTOCOL_VERSIONS]);
    expect(j.protocolVersions).toEqual([...NEGOTIATED_PROTOCOL_VERSIONS]);
    expect(j.protocolVersion).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
  });
});
