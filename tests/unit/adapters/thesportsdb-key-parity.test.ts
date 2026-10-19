jest.mock('../../../src/services/redis.service', () => ({ getSharedRedis: jest.fn() }));
import { THESPORTSDB_PUBLIC_KEY } from '../../../src/adapters/thesportsdb';
import limits from '../../../src/config/provider-limits.json';

// The key lives in the adapter and in the health_url; a swap must update both.
describe('thesportsdb public key parity', () => {
  it('health_url uses the adapter key', () => {
    const url: string = (limits as Record<string, { health_url: string }>).thesportsdb.health_url;
    expect(url).toContain(`/api/v1/json/${THESPORTSDB_PUBLIC_KEY}/`);
    expect(url).not.toContain('/json/3/');
  });
});
