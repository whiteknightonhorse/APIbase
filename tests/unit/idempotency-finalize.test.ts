/**
 * Idempotency replay semantics (2026-09-01 follow-up).
 *
 * finalizeIdempotency() existed but was never called by any entry point —
 * fixing the header-name mismatch (previous pass) made setPending() actually
 * fire on every real request carrying a key, and with nothing ever closing
 * the record a legitimate retry within the 600s TTL got a PERMANENT 409
 * "in progress" instead of the intended cached-response replay. This proves
 * the three outcomes a replay must produce:
 *  - replay after success  -> cached response (not another live execution)
 *  - replay during execution -> 409 conflict (unchanged, already worked)
 *  - replay after failure  -> the cached failure, NOT a permanent 409
 */

jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Minimal fake Redis: only get/set are used by idempotency.service.ts.
function createFakeRedis() {
  const store = new Map<string, string>();
  return {
    async get(key: string): Promise<string | null> {
      return store.has(key) ? store.get(key)! : null;
    },
    async set(key: string, value: string, ..._args: unknown[]): Promise<'OK'> {
      store.set(key, value);
      return 'OK';
    },
  };
}

const fakeRedis = createFakeRedis();
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: async () => fakeRedis,
  getSharedRedis: () => fakeRedis,
}));

import {
  checkIdempotency,
  setPending,
  finalizePipelineIdempotency,
} from '../../src/services/idempotency.service';

describe('idempotency replay semantics', () => {
  const agentId = 'agent-1';

  it('replay after success returns the cached response, not a fresh conflict', async () => {
    const key = 'key-success';
    const executionId = 'exec-success';

    await setPending(agentId, key, executionId);
    // Pipeline ran to completion — the fix under test.
    await finalizePipelineIdempotency(
      { idempotencyKey: key, agentId, executionId, currentStage: 'RESPONSE' },
      'SUCCESS',
      200,
      JSON.stringify({ result: 'ok' }),
    );

    const replay = await checkIdempotency(agentId, key);
    expect(replay.action).toBe('return_cached');
    if (replay.action === 'return_cached') {
      expect(replay.statusCode).toBe(200);
      expect(JSON.parse(replay.body)).toEqual({ result: 'ok' });
    }
  });

  it('replay while still executing (no finalize yet) returns conflict', async () => {
    const key = 'key-inflight';
    await setPending(agentId, key, 'exec-inflight');

    const replay = await checkIdempotency(agentId, key);
    expect(replay.action).toBe('conflict');
  });

  it('replay after failure returns the cached failure, NOT a permanent conflict', async () => {
    const key = 'key-failure';
    const executionId = 'exec-failure';

    await setPending(agentId, key, executionId);
    await finalizePipelineIdempotency(
      { idempotencyKey: key, agentId, executionId, currentStage: 'ESCROW' },
      'FAILED',
      402,
      JSON.stringify({ error: 'payment_required' }),
    );

    const replay = await checkIdempotency(agentId, key);
    // The bug this fixes: without finalization this stays 'conflict' (409)
    // forever within the TTL. It must instead resolve to the cached outcome.
    expect(replay.action).toBe('return_cached');
    if (replay.action === 'return_cached') {
      expect(replay.statusCode).toBe(402);
    }
  });

  it('does NOT finalize (and so does not clobber a prior record) when this request never left the IDEMPOTENCY stage', async () => {
    const key = 'key-prior';
    // Simulate: a PRIOR request already succeeded and was finalized.
    await setPending(agentId, key, 'exec-prior');
    await finalizePipelineIdempotency(
      { idempotencyKey: key, agentId, executionId: 'exec-prior', currentStage: 'RESPONSE' },
      'SUCCESS',
      200,
      JSON.stringify({ result: 'prior' }),
    );

    // A second request presents the same key; IDEMPOTENCY stage itself
    // returns 'return_cached' and the pipeline never advances past it —
    // currentStage stays 'IDEMPOTENCY'. The entry point must not re-finalize.
    await finalizePipelineIdempotency(
      { idempotencyKey: key, agentId, executionId: 'exec-prior', currentStage: 'IDEMPOTENCY' },
      'FAILED',
      500,
      JSON.stringify({ error: 'should_not_overwrite' }),
    );

    const replay = await checkIdempotency(agentId, key);
    expect(replay.action).toBe('return_cached');
    if (replay.action === 'return_cached') {
      expect(replay.statusCode).toBe(200);
      expect(JSON.parse(replay.body)).toEqual({ result: 'prior' });
    }
  });

  it('no-ops when there is no idempotency key at all', async () => {
    // Must not throw even with agentId/executionId absent.
    await expect(finalizePipelineIdempotency({}, 'SUCCESS', 200, '{}')).resolves.toBeUndefined();
  });
});
