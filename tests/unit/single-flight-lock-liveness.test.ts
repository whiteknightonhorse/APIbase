/**
 * Single-flight lock liveness (2026-09-01, fix 2).
 *
 * waitForResult() used to poll only the cache VALUE, which a failed lock
 * owner never writes — "owner still working" and "owner already failed"
 * were indistinguishable, so a legitimate concurrent duplicate (e.g. a
 * client's own retry) hitting a failing tool stalled for the FULL 25s
 * timeout before it could try again. The owner already releases lock:{key}
 * on every completion path, success or failure — this proves the waiter now
 * notices that and returns in well under the timeout.
 */

function createFakeRedis() {
  const values = new Map<string, string>();
  const locks = new Set<string>();
  return {
    async get(key: string): Promise<string | null> {
      return values.has(key) ? values.get(key)! : null;
    },
    async set(key: string, value: string, ...args: unknown[]): Promise<'OK' | null> {
      const nx = args.includes('NX');
      if (key.startsWith('lock:')) {
        if (nx && locks.has(key)) return null;
        locks.add(key);
        return 'OK';
      }
      values.set(key, value);
      return 'OK';
    },
    async del(key: string): Promise<number> {
      const had = locks.delete(key);
      return had ? 1 : 0;
    },
    async exists(key: string): Promise<number> {
      return locks.has(key) ? 1 : 0;
    },
  };
}

const fakeRedis = createFakeRedis();
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: async () => fakeRedis,
  getSharedRedis: () => fakeRedis,
}));

import { acquireLock, releaseLock, waitForResult } from '../../src/services/cache.service';

describe('single-flight waiter stops when the lock owner fails', () => {
  it('returns quickly (well under the 25s timeout) when the owner releases the lock without ever setting a value', async () => {
    const key = 'cache:test-tool:fail-fast';

    const acquired = await acquireLock(key);
    expect(acquired).toBe(true);

    // Owner "fails" shortly after starting: releases the lock, never writes
    // a cache value (mirrors provider-call failure + cache-set.stage.ts /
    // pipeline.ts's error-path releaseLock()).
    setTimeout(() => {
      releaseLock(key).catch(() => {});
    }, 100);

    const start = Date.now();
    const result = await waitForResult(key, 25_000, 50);
    const elapsedMs = Date.now() - start;

    expect(result).toBeNull();
    // Must resolve shortly after the ~100ms release, nowhere near the 25s cap.
    expect(elapsedMs).toBeLessThan(2_000);
  });

  it('still returns the value once the owner succeeds (unaffected by the liveness check)', async () => {
    const key = 'cache:test-tool:succeeds';

    await acquireLock(key);

    setTimeout(async () => {
      // Owner succeeds: writes the value, THEN releases the lock (mirrors
      // cache-set.stage.ts's success path).
      const r = fakeRedis;
      await r.set(key, JSON.stringify({ ok: true }), 'EX', 60);
      await releaseLock(key);
    }, 100);

    const result = await waitForResult(key, 25_000, 50);
    expect(result).not.toBeNull();
    expect(JSON.parse(result as string)).toEqual({ ok: true });
  });

  it('still times out (returns null) if the owner never releases the lock at all', async () => {
    const key = 'cache:test-tool:stuck-owner';
    await acquireLock(key);
    // No release, no value — simulate a wedged owner within a short timeout.
    const result = await waitForResult(key, 300, 50);
    expect(result).toBeNull();
  });
});
