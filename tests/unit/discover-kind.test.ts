/**
 * T-0320: discover() `kind` parameter. Mocks follow tests/unit/discovery-service.test.ts.
 */
jest.mock('../../src/config/index', () => ({ config: { X402_NETWORK: 'base' } }));

const toolFindManyMock = jest.fn();
const providerStatusFindManyMock = jest.fn();
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    tool: { findMany: toolFindManyMock },
    providerStatus: { findMany: providerStatusFindManyMock },
  })),
}));

jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: jest.fn(async () => ({
    mget: jest.fn(async (...keys: string[]) => keys.map(() => null)),
    keys: jest.fn(),
  })),
}));

jest.mock('../../src/config/mpp.config', () => ({
  getMppConfig: () => ({ enabled: false }),
}));

import { discover, __resetProviderStateCacheForTest } from '../../src/services/discovery.service';
import {
  __setToolCacheEntryForTest,
  __clearToolCacheForTest,
} from '../../src/pipeline/stages/tool-status.stage';
import { TOOL_DEFINITIONS } from '../../src/mcp/tool-definitions';
import { AppError } from '../../src/types/errors';

/** Minimal ShopTx: first raw query = one matching shop, second = its product sample. */
function fakeShopDb() {
  const rawQuery = jest
    .fn()
    .mockResolvedValueOnce([
      {
        merchant_id: 'm1',
        slug: 'guide-shop',
        name: 'Guide Shop',
        category: 'travel',
        reputation: null,
        provek: null,
      },
    ])
    .mockResolvedValueOnce([{ merchant_id: 'm1', sku: 'S1', title: 'Guide', price_usd: '1.00' }]);
  return { $queryRawUnsafe: rawQuery } as never;
}

beforeEach(() => {
  __clearToolCacheForTest();
  __resetProviderStateCacheForTest();
  providerStatusFindManyMock.mockReset().mockResolvedValue([]);
  for (const def of TOOL_DEFINITIONS.slice(0, 5)) {
    __setToolCacheEntryForTest({
      tool_id: def.toolId,
      status: 'healthy',
      price_usd: 0.01,
      cache_ttl: 0,
      upstream_cost_usd: null,
      price_floor_usd: null,
      provider: def.toolId.split('.')[0],
    });
  }
});

describe('T-0320: discover kind', () => {
  it('K1: intent + kind=merchant returns only merchant results', async () => {
    const r = await discover({ intent: 'guide', kind: 'merchant' }, { shopDb: fakeShopDb() });
    expect(r.results.length).toBe(1);
    expect(r.results.every((x) => x.kind === 'merchant')).toBe(true);
    expect(r.total_matches).toBe(1);
  });

  it('K2: kind=merchant without intent is 400 intent_required', async () => {
    const err = await discover({ kind: 'merchant' }).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.httpStatus).toBe(400);
    expect(err.message).toContain('intent_required');
  });

  it('K3: kind=tool behaves like no kind', async () => {
    const a = await discover({});
    const b = await discover({ kind: 'tool' });
    expect(a.results.length).toBeGreaterThan(0);
    expect(b.results).toEqual(a.results);
    expect(b.total_matches).toBe(a.total_matches);
  });

  it('K4: unknown or non-string kind is 400', async () => {
    for (const kind of ['foo', ['merchant'], { a: 1 }, 5]) {
      const err = await discover({ kind }).catch((e) => e);
      expect(err).toBeInstanceOf(AppError);
      expect(err.httpStatus).toBe(400);
    }
  });
});
