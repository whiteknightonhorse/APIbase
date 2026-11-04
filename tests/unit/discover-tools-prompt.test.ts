/**
 * ZZ-03-05: `discover_tools` (MCP prompt) is now a thin text wrapper over discovery.service.ts's
 * discover() — same ranking/data as apibase.discover and GET /api/v1/discover, rendered as text
 * instead of JSON (zz-03 Q1 ruling-1, "discover_tools stays as a wrapper over the same function").
 * This pins that it actually calls discover() (rather than re-scoring on its own) and renders
 * from its result, without depending on the real DB/Redis.
 */
const discoverMock = jest.fn();
jest.mock('../../src/config/index', () => ({ config: { X402_NETWORK: 'base' } }));
jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../src/services/redis.service', () => ({ ensureRedisConnected: jest.fn() }));
jest.mock('../../src/config/mpp.config', () => ({ getMppConfig: () => ({ enabled: false }) }));

const cacheEntriesMock = jest.fn();
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({
  getToolCacheEntries: cacheEntriesMock,
}));
jest.mock('../../src/services/discovery.service', () => ({
  ...jest.requireActual('../../src/services/discovery.service'),
  discover: discoverMock,
}));

import { registerPrompts } from '../../src/mcp/prompt-adapter';
import { TOOL_DEFINITIONS } from '../../src/mcp/tool-definitions';
import { activeCandidateDefs } from '../../src/services/discovery.service';

type PromptHandler = (args: Record<string, unknown>) => Promise<{
  messages: { role: string; content: { type: string; text: string } }[];
}>;

function captureDiscoverToolsHandler(): PromptHandler {
  const handlers = new Map<string, PromptHandler>();
  const fakeServer = {
    prompt: (name: string, _desc: string, _schema: unknown, handler: PromptHandler) => {
      handlers.set(name, handler);
    },
  };
  registerPrompts(fakeServer as never);
  const handler = handlers.get('discover_tools');
  if (!handler) throw new Error('discover_tools prompt not registered');
  return handler;
}

function entry(toolId: string, status: string): Record<string, unknown> {
  return { tool_id: toolId, status, price_usd: 0.01, provider: toolId.split('.')[0] };
}

/** Fixture: one definition in each of 3 categories; the third category's only tool is unavailable;
 *  a fourth definition has no cache entry at all. */
function setFixture(): { live: string[]; dead: string; orphan: string; cats: string[] } {
  const byCat = new Map<string, string[]>();
  for (const d of TOOL_DEFINITIONS) {
    const c = d.category ?? 'other';
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c)!.push(d.toolId);
  }
  const cats = [...byCat.keys()].sort().slice(0, 4);
  const [c1, c2, c3, c4] = cats;
  const live = [byCat.get(c1)![0], byCat.get(c2)![0]];
  const dead = byCat.get(c3)![0];
  const orphan = byCat.get(c4)![0];
  // only the chosen tools get entries; every other definition has no cache entry (not counted)
  cacheEntriesMock.mockResolvedValue([
    entry(live[0], 'healthy'),
    entry(live[1], 'healthy'),
    entry(dead, 'unavailable'),
    entry('ghost.nodef', 'healthy'),
  ]);
  return { live, dead, orphan, cats };
}

beforeEach(() => {
  discoverMock.mockReset();
  cacheEntriesMock.mockReset();
  cacheEntriesMock.mockResolvedValue([]);
});

describe('discover_tools prompt wraps discovery.service.ts discover()', () => {
  it('calling with a task delegates to discover() with that intent, and renders its results', async () => {
    const def = TOOL_DEFINITIONS[0];
    discoverMock.mockResolvedValueOnce({
      query: { intent: 'find flights', category: null, max_price_usd: null, limit: 18 },
      taxonomy_version: '2026-09-15',
      capability: null,
      results: [
        {
          kind: 'tool',
          tool_id: def.toolId,
          mcp_name: def.mcpName ?? def.toolId,
          title: def.title ?? def.toolId,
          category: def.category,
          namespace: def.toolId.split('.')[0],
          provider: def.toolId.split('.')[0],
          match: { score: 3, matched_on: ['title'] },
          price: { price_usd: 0.01, cache_hit_price_usd: 0.001, tier: 'micro', currency: 'USD' },
          payment: {
            rails: ['x402'],
            min_balance_usd: 0.01,
            x402: { network: 'base', asset: 'USDC' },
          },
          availability: {
            tool_status: 'healthy',
            provider_state: null,
            state_since: null,
            last_ok_at: null,
          },
          quality: { status: 'no_data', window_h: 24, provider_reliability_score: null },
          input_required: [],
          related: [],
        },
      ],
      total_matches: 1,
      truncated: false,
      generated_at: '2026-09-15T00:00:00.000Z',
    });

    const handler = captureDiscoverToolsHandler();
    const result = await handler({ task: 'find flights' });

    expect(discoverMock).toHaveBeenCalledWith({
      intent: 'find flights',
      category: undefined,
      limit: 18,
    });
    const text = result.messages[0].content.text;
    expect(text).toContain(def.mcpName ?? def.toolId);
  });

  it('no args at all never calls discover() (pure category-index browsing)', async () => {
    setFixture();
    const handler = captureDiscoverToolsHandler();
    await handler({});

    expect(discoverMock).not.toHaveBeenCalled();
  });

  it('an unrecognized category short-circuits before calling discover()', async () => {
    setFixture();
    const handler = captureDiscoverToolsHandler();
    const result = await handler({ category: 'not-a-real-category-xyz' });

    expect(discoverMock).not.toHaveBeenCalled();
    expect(result.messages[0].content.text).toContain('No tools found for category');
  });

  describe('category index follows live availability', () => {
    it('(a) no-args lists only categories with an available tool; header excludes the unavailable tool', async () => {
      const f = setFixture();
      const text = (await captureDiscoverToolsHandler()({})).messages[0].content.text;
      expect(text).toContain('APIbase Tool Catalog — 2 tools across 2 categories:');
      expect(text).toContain(`- ${f.cats[0]}: 1 tools`);
      expect(text).toContain(`- ${f.cats[1]}: 1 tools`);
      expect(text).not.toContain(`- ${f.cats[2]}:`);
      expect(text).not.toContain(`- ${f.cats[3]}:`);
    });

    it('(b) an empty category is unknown: no discover() call, omitted from the Available list', async () => {
      const f = setFixture();
      const text = (await captureDiscoverToolsHandler()({ category: f.cats[2] })).messages[0]
        .content.text;
      expect(discoverMock).not.toHaveBeenCalled();
      expect(text).toContain('No tools found for category');
      const line = text.split('\n').find((l) => l.startsWith('Available categories:')) ?? '';
      expect(line).toBe(`Available categories: ${f.cats[0]}, ${f.cats[1]}`);
    });

    it('(c) a definition without a cache entry is not counted', async () => {
      const f = setFixture();
      const text = (await captureDiscoverToolsHandler()({ category: f.cats[3] })).messages[0]
        .content.text;
      expect(text).toContain('No tools found for category');
      expect(text).not.toContain(`Available categories: ${f.cats.join(', ')}`);
      expect(text).toContain(f.cats[0]);
    });

    it('(d) header count equals the candidate set discover() ranks over', async () => {
      setFixture();
      const n = (await activeCandidateDefs()).length;
      const text = (await captureDiscoverToolsHandler()({})).messages[0].content.text;
      expect(text).toContain(`— ${n} tools across`);
      expect(n).toBe(2);
    });
  });
});
