/** T-0657: per-tool circuit breaker (Redis; fail-open; never writes provider_status). */
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
const store = new Map<string, string>();
let redisDown = false;
const fakeRedis = {
  async get(k: string) {
    if (redisDown) throw new Error('Connection is closed.');
    return store.get(k) ?? null;
  },
  async set(k: string, v: string) {
    if (redisDown) throw new Error('Connection is closed.');
    store.set(k, v);
    return 'OK';
  },
  async del(k: string) {
    if (redisDown) throw new Error('Connection is closed.');
    return store.delete(k) ? 1 : 0;
  },
};
jest.mock('../../src/services/redis.service', () => ({
  getSharedRedis: () => fakeRedis,
}));
jest.mock('../../src/adapters/registry', () => ({ resolveAdapter: jest.fn() }));
jest.mock('../../src/jobs/provider-health.job', () => ({
  recordProbeResult: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({
    tool: {
      findMany: async () => [
        { tool_id: 'demo.search', status: 'available', status_reason: null, price_usd: 0.01 },
      ],
    },
    providerStatus: { findUnique: async () => null },
  }),
}));
jest.mock('../../src/services/alternatives.service', () => ({
  getAlternativesForTool: async () => [],
  getCapabilityForTool: () => undefined,
}));

import { recordFailure, recordSuccess, isOpen } from '../../src/services/tool-breaker.service';
import { ProviderErrorCode } from '../../src/types/provider';
import { precheckToolCall } from '../../src/pipeline/precheck';
import { providerCallStage } from '../../src/pipeline/stages/provider-call.stage';
import { resolveAdapter } from '../../src/adapters/registry';
import { createPipelineContext } from '../../src/pipeline/types';

const T = 'demo.search';
const err = (code: string, httpStatus: number) => ({ code, httpStatus, provider: 'demo' });
const unavailable = () => err(ProviderErrorCode.UNAVAILABLE, 503);

beforeEach(() => {
  store.clear();
  redisDown = false;
});

describe('tool breaker (T-0657)', () => {
  it('three UNAVAILABLE failures open it; remaining seconds are reported', async () => {
    const now = 1_000_000;
    await recordFailure(T, unavailable(), now);
    await recordFailure(T, unavailable(), now);
    expect(await isOpen(T, now)).toBe(0);
    await recordFailure(T, unavailable(), now);
    expect(await isOpen(T, now)).toBe(60);
    expect(await isOpen(T, now + 61_000)).toBe(0);
  });

  it('a 422 INPUT_REJECTED never counts', async () => {
    for (let i = 0; i < 10; i++) {
      await recordFailure(T, err(ProviderErrorCode.INPUT_REJECTED, 422));
    }
    expect(await isOpen(T)).toBe(0);
    expect(store.size).toBe(0);
  });

  it('PROVIDER_AUTH 503 and TIMEOUT count; INVALID_RESPONSE counts only at 5xx', async () => {
    await recordFailure(T, err(ProviderErrorCode.PROVIDER_AUTH, 503), 1);
    await recordFailure(T, err(ProviderErrorCode.TIMEOUT, 504), 1);
    await recordFailure(T, err(ProviderErrorCode.INVALID_RESPONSE, 400), 1);
    expect(await isOpen(T, 1)).toBe(0);
    await recordFailure(T, err(ProviderErrorCode.INVALID_RESPONSE, 502), 1);
    expect(await isOpen(T, 1)).toBe(60);
  });

  it('one success closes it and resets the ladder', async () => {
    for (let i = 0; i < 3; i++) await recordFailure(T, unavailable(), 5);
    expect(await isOpen(T, 5)).toBeGreaterThan(0);
    await recordSuccess(T);
    expect(await isOpen(T, 5)).toBe(0);
    expect(store.has(`tool:breaker:${T}`)).toBe(false);
  });

  it('backoff doubles 60 -> 120 -> 240 -> 480 -> 600 (cap)', async () => {
    let now = 10_000_000;
    const seen: number[] = [];
    for (let round = 0; round < 5; round++) {
      await recordFailure(T, unavailable(), now); // after the first round: re-opens at once
      if (round === 0) {
        await recordFailure(T, unavailable(), now);
        await recordFailure(T, unavailable(), now);
      }
      seen.push(await isOpen(T, now));
      now += (seen[round] + 1) * 1000;
    }
    expect(seen).toEqual([60, 120, 240, 480, 600]);
  });

  it('Redis error -> closed (fail-open), recording never throws', async () => {
    redisDown = true;
    await expect(recordFailure(T, unavailable())).resolves.toBeUndefined();
    await expect(recordSuccess(T)).resolves.toBeUndefined();
    expect(await isOpen(T)).toBe(0);
  });
});

describe('breaker wiring (T-0657)', () => {
  const ctx = () => {
    const c = createPipelineContext('r1', 'POST', '/x', {}, {});
    c.toolId = T;
    return c;
  };
  const failing = {
    call: jest
      .fn()
      .mockRejectedValue({ ...unavailable(), message: 'boom', durationMs: 1, toolId: T }),
  };

  it('three failed PROVIDER_CALLs -> precheck answers 503 circuit_open before any payment', async () => {
    (resolveAdapter as jest.Mock).mockReturnValue(failing);
    expect(await precheckToolCall(T, {})).toBeNull();
    for (let i = 0; i < 3; i++) await providerCallStage.execute(ctx());
    const r = await precheckToolCall(T, {});
    expect(r).toMatchObject({
      code: 503,
      error: 'tool_unavailable',
      extra: { status_reason: 'circuit_open' },
    });
    expect(r?.retryAfter).toBeGreaterThan(0);
  });

  it('a 2xx PROVIDER_CALL closes the breaker', async () => {
    for (let i = 0; i < 3; i++) await recordFailure(T, unavailable());
    expect(await precheckToolCall(T, {})).not.toBeNull();
    (resolveAdapter as jest.Mock).mockReturnValue({
      call: jest.fn().mockResolvedValue({ status: 200, body: {}, durationMs: 1, byteLength: 2 }),
    });
    await providerCallStage.execute(ctx());
    expect(await precheckToolCall(T, {})).toBeNull();
  });
});
