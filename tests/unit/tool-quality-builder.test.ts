/**
 * T-2/Q-1 (ZZ-03-02): `buildToolQuality()` is the single place that turns
 * raw `tool:quality:{toolId}` Redis entries into per-tool quality data.
 * Before this task, `platform.tool_quality`/`getToolRankings` fabricated
 * `uptime_pct: 0, error_rate: 0` for a tool with no Redis key — "never
 * called" was indistinguishable from "100% failure" (Q-3 ruling-1: 966/1384
 * tools affected in a live slice). This file locks the fix: no key -> the
 * whole entry is `null`; a key with too few calls -> `calls` stays real but
 * the rate/percentiles are `null`. It also locks the MGET-not-KEYS
 * requirement (T-2: `redis.keys()` is forbidden on the shared prod Redis).
 *
 * Mutation check: reverting buildToolQuality's "no key" branch back to a
 * fabricated-zero object (`{ uptime_pct: 0, ... }` instead of `null`) must
 * fail the "empty key -> null" test below.
 */
import {
  buildToolQuality,
  QUALITY_MIN_CALLS,
  QUALITY_KEY_PREFIX,
} from '../../src/services/tool-quality.service';

function createFakeRedis(store: Record<string, string>) {
  return {
    mget: jest.fn(async (...keys: string[]) => keys.map((k) => store[k] ?? null)),
  };
}

function storedQuality(overrides: Partial<Record<string, unknown>> = {}) {
  return JSON.stringify({
    tool_id: 'weather.get_current',
    uptime_pct: 98.5,
    p50_ms: 120,
    p95_ms: 340,
    error_rate: 1.5,
    total_calls: 50,
    success_calls: 49,
    last_updated: '2026-09-15T00:00:00.000Z',
    ...overrides,
  });
}

describe('buildToolQuality', () => {
  it('returns an empty object for an empty tool_id list without touching Redis', async () => {
    const redis = createFakeRedis({});

    const result = await buildToolQuality(redis as never, []);

    expect(result).toEqual({});
    expect(redis.mget).not.toHaveBeenCalled();
  });

  it('maps a missing key to null, never a fabricated zero', async () => {
    const redis = createFakeRedis({});

    const result = await buildToolQuality(redis as never, ['weather.get_current']);

    expect(result['weather.get_current']).toBeNull();
  });

  it('nulls success_rate/p50_ms/p95_ms but keeps calls when total_calls is below QUALITY_MIN_CALLS', async () => {
    const redis = createFakeRedis({
      [`${QUALITY_KEY_PREFIX}weather.get_current`]: storedQuality({
        total_calls: QUALITY_MIN_CALLS - 1,
        uptime_pct: 100,
        p50_ms: 90,
        p95_ms: 95,
      }),
    });

    const result = await buildToolQuality(redis as never, ['weather.get_current']);

    expect(result['weather.get_current']).toEqual({
      window_h: 24,
      calls: QUALITY_MIN_CALLS - 1,
      success_rate: null,
      p50_ms: null,
      p95_ms: null,
      as_of: '2026-09-15T00:00:00.000Z',
    });
  });

  it('returns real success_rate/p50_ms/p95_ms once calls meets QUALITY_MIN_CALLS', async () => {
    const redis = createFakeRedis({
      [`${QUALITY_KEY_PREFIX}weather.get_current`]: storedQuality({
        total_calls: QUALITY_MIN_CALLS,
      }),
    });

    const result = await buildToolQuality(redis as never, ['weather.get_current']);

    expect(result['weather.get_current']).toEqual({
      window_h: 24,
      calls: QUALITY_MIN_CALLS,
      success_rate: 98.5,
      p50_ms: 120,
      p95_ms: 340,
      as_of: '2026-09-15T00:00:00.000Z',
    });
  });

  it('does one MGET for the whole batch, never redis.keys()', async () => {
    const redis = createFakeRedis({
      [`${QUALITY_KEY_PREFIX}a.tool`]: storedQuality({ tool_id: 'a.tool' }),
    }) as unknown as { mget: jest.Mock; keys?: jest.Mock };
    redis.keys = jest.fn();

    await buildToolQuality(redis as never, ['a.tool', 'b.tool', 'c.tool']);

    expect(redis.mget).toHaveBeenCalledTimes(1);
    expect(redis.mget).toHaveBeenCalledWith(
      `${QUALITY_KEY_PREFIX}a.tool`,
      `${QUALITY_KEY_PREFIX}b.tool`,
      `${QUALITY_KEY_PREFIX}c.tool`,
    );
    expect(redis.keys).not.toHaveBeenCalled();
  });

  it('treats a corrupt stored value as no measurement rather than throwing', async () => {
    const redis = createFakeRedis({
      [`${QUALITY_KEY_PREFIX}broken.tool`]: 'not json',
    });

    const result = await buildToolQuality(redis as never, ['broken.tool']);

    expect(result['broken.tool']).toBeNull();
  });
});
