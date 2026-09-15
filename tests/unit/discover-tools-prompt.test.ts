/**
 * ZZ-03-05: `discover_tools` (MCP prompt) is now a thin text wrapper over discovery.service.ts's
 * discover() — same ranking/data as apibase.discover and GET /api/v1/discover, rendered as text
 * instead of JSON (zz-03 Q1 ruling-1, "discover_tools остаётся как обёртка над той же функцией").
 * This pins that it actually calls discover() (rather than re-scoring on its own) and renders
 * from its result, without depending on the real DB/Redis.
 */
const discoverMock = jest.fn();
jest.mock('../../src/services/discovery.service', () => ({
  discover: discoverMock,
}));

import { registerPrompts } from '../../src/mcp/prompt-adapter';
import { TOOL_DEFINITIONS } from '../../src/mcp/tool-definitions';

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

beforeEach(() => {
  discoverMock.mockReset();
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
    const handler = captureDiscoverToolsHandler();
    await handler({});

    expect(discoverMock).not.toHaveBeenCalled();
  });

  it('an unrecognized category short-circuits before calling discover()', async () => {
    const handler = captureDiscoverToolsHandler();
    const result = await handler({ category: 'not-a-real-category-xyz' });

    expect(discoverMock).not.toHaveBeenCalled();
    expect(result.messages[0].content.text).toContain('No tools found for category');
  });
});
