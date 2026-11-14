/**
 * T-0844: discover kind=merchant and /shops (listShops) read ONE live-merchant condition.
 * Before the fix discover only checked status='active' and listed shops that /shops hides
 * (domain_verified = false), so agents were pointed at a shop with no public page.
 */
jest.mock('../../src/config/index', () => ({ config: { X402_NETWORK: 'base' } }));
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    tool: { findMany: jest.fn(async () => []) },
    providerStatus: { findMany: jest.fn(async () => []) },
  })),
}));
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: jest.fn(async () => ({
    mget: jest.fn(async (...keys: string[]) => keys.map(() => null)),
    keys: jest.fn(),
  })),
}));
jest.mock('../../src/config/mpp.config', () => ({ getMppConfig: () => ({ enabled: false }) }));

import { discover } from '../../src/services/discovery.service';
import { listShops, liveMerchantSql } from '../../src/shop/storefront/storefront.service';

const sqlOf = (m: jest.Mock): string[] => m.mock.calls.map((c) => String(c[0]));

describe('live merchant predicate (T-0844)', () => {
  it('liveMerchantSql requires active AND domain_verified, with optional alias', () => {
    expect(liveMerchantSql()).toBe("status = 'active' AND domain_verified");
    expect(liveMerchantSql('m')).toBe("m.status = 'active' AND m.domain_verified");
  });

  it('discover kind=merchant filters shop_merchants with the shared predicate', async () => {
    const raw = jest.fn().mockResolvedValue([]);
    await discover(
      { intent: 'shop', kind: 'merchant' },
      { shopDb: { $queryRawUnsafe: raw } as never },
    );
    expect(sqlOf(raw)[0]).toContain(liveMerchantSql('m'));
  });

  it('listShops (/shops) uses the same predicate', async () => {
    const raw = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ n: 0 }]);
    await listShops({ $queryRawUnsafe: raw } as never, 1);
    for (const s of sqlOf(raw)) expect(s).toContain(liveMerchantSql());
  });
});
