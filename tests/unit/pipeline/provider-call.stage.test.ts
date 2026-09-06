// T-09b (2026-09-06): provider-call.stage.ts is the one place ALL adapters'
// call() results funnel through — this suite locks in that a thrown value
// this stage's own `error as ProviderError` cast can't actually guarantee
// the shape of (any adapter bug, not just BaseAdapter's own, now-fixed
// body-read-timeout defect — see base.adapter.test.ts's matching case)
// still comes out as a clean, string-typed PipelineError, never something
// that would crash execute.router.ts's `(result.error.error ||
// '').toUpperCase()` downstream. See AUTOPILOT-PROGRESS.md#T-09b for the
// live trace this defends against (loc.search, bare 500 instead of 504).

jest.mock('../../../src/adapters/registry', () => ({
  resolveAdapter: jest.fn(),
}));

// T-09b: provider-call.stage.ts now feeds genuine upstream failures into the
// SAME shared state machine the active/passive health jobs use
// (recordProbeResult) — mocked here so these tests never touch a real
// Prisma/Redis connection, matching tool-quality-passive.test.ts's pattern
// for the same shared function.
jest.mock('../../../src/jobs/provider-health.job', () => ({
  recordProbeResult: jest.fn().mockResolvedValue(undefined),
}));
// T-09b attempt 3 (ruling-2): recordProviderCallFailure now also gates on
// `provider_status.next_probe_at` (the same column applyPassiveDegradation
// uses) before writing — findUnique is a live jest.fn() per test so each
// case can control whether the provider is "due" (null / past timestamp) or
// not yet due (future timestamp), unlike the old static `{ __fake: 'prisma'
// }` stub which had no providerStatus at all.
let mockFindUnique: jest.Mock;
jest.mock('../../../src/services/prisma.service', () => ({
  getPrisma: jest.fn(() => ({
    providerStatus: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
  })),
}));

// Minimal fake redis supporting the NX/EX `set()` call
// recordProviderCallFailure's debounce guard uses (PASSIVE_CALL_FAILURE_
// DEBOUNCE_S) — reset per-test in beforeEach so one test's debounce key
// never leaks into the next (several tests below deliberately reuse the
// same provider, e.g. 'loc').
let fakeRedisStore: Map<string, unknown>;
function createFakeRedis() {
  return {
    async set(key: string, value: string, ..._rest: unknown[]) {
      if (fakeRedisStore.has(key)) return null; // NX: key already present
      fakeRedisStore.set(key, value);
      return 'OK';
    },
  };
}
jest.mock('../../../src/services/redis.service', () => ({
  getSharedRedis: jest.fn(() => createFakeRedis()),
}));

import { providerCallStage } from '../../../src/pipeline/stages/provider-call.stage';
import { resolveAdapter } from '../../../src/adapters/registry';
import { recordProbeResult } from '../../../src/jobs/provider-health.job';
import { createPipelineContext } from '../../../src/pipeline/types';
import { ProviderErrorCode } from '../../../src/types/provider';

const mockResolveAdapter = resolveAdapter as jest.Mock;
const mockedRecordProbeResult = recordProbeResult as jest.MockedFunction<typeof recordProbeResult>;

function makeCtx() {
  const ctx = createPipelineContext('req-1', 'POST', '/api/v1/tools/x/call', {}, {});
  ctx.toolId = 'test.tool';
  return ctx;
}

describe('providerCallStage', () => {
  beforeEach(() => {
    mockResolveAdapter.mockReset();
    mockedRecordProbeResult.mockClear();
    fakeRedisStore = new Map();
  });

  it('passes through a properly classified ProviderError unchanged', async () => {
    mockResolveAdapter.mockReturnValue({
      call: jest.fn().mockRejectedValue({
        code: ProviderErrorCode.TIMEOUT,
        httpStatus: 504,
        message: 'Provider call timed out after 10000ms',
        provider: 'test_provider',
        toolId: 'test.tool',
        durationMs: 10000,
      }),
    });

    const result = await providerCallStage.execute(makeCtx());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({
        code: 504,
        error: ProviderErrorCode.TIMEOUT,
        message: 'Provider call timed out after 10000ms',
        retryAfter: undefined,
      });
      expect(typeof result.error.error).toBe('string');
      expect(typeof result.error.code).toBe('number');
    }
  });

  // The exact defect this guards: a raw DOMException-shaped throw (numeric
  // `.code`, no `.httpStatus`) — what BaseAdapter's readResponseBody used to
  // let escape uncaught before this task's fix — must still degrade to a
  // clean, string-typed 502, not leak the numeric code into a field
  // execute.router.ts calls .toUpperCase() on.
  it('degrades a raw non-ProviderError throw (numeric .code, no .httpStatus) to a clean string-typed 502', async () => {
    const rawDomException = new DOMException(
      'The operation was aborted due to timeout',
      'TimeoutError',
    );
    mockResolveAdapter.mockReturnValue({
      call: jest.fn().mockRejectedValue(rawDomException),
    });

    const result = await providerCallStage.execute(makeCtx());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(502);
      expect(typeof result.error.code).toBe('number');
      expect(result.error.error).toBe('bad_gateway');
      expect(typeof result.error.error).toBe('string');
      // Would previously have been `.toUpperCase()`-crashed by
      // execute.router.ts if `.error` had come through as DOMException's
      // own numeric `.code` (23) instead of the 'bad_gateway' fallback.
      expect(() => result.error.error.toUpperCase()).not.toThrow();
    }
  });

  it('degrades a plain Error with no code/httpStatus at all to a clean string-typed 502', async () => {
    mockResolveAdapter.mockReturnValue({
      call: jest.fn().mockRejectedValue(new Error('boom')),
    });

    const result = await providerCallStage.execute(makeCtx());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(502);
      expect(result.error.error).toBe('bad_gateway');
      expect(result.error.message).toBe('boom');
    }
  });
});

// ---------------------------------------------------------------------------
// T-09b: a failed PROVIDER_CALL never reaches LEDGER_WRITE (pipeline.ts
// stops on first error), so execution_ledger never gets a row for it and
// tool-quality.job.ts's ledger-based passive detector is blind to it. This
// stage now feeds the SAME shared state machine (recordProbeResult) directly
// from the real failure — see provider-call.stage.ts's own doc comment for
// the full reasoning and the exact classification boundary.
// ---------------------------------------------------------------------------
describe('providerCallStage passive health signal (T-09b)', () => {
  beforeEach(() => {
    mockResolveAdapter.mockReset();
    mockedRecordProbeResult.mockClear();
    fakeRedisStore = new Map();
    // Default: never probed before (null) -> always due, matching
    // applyPassiveDegradation's own "null next_probe_at is always due" rule.
    // Individual gate tests below override this per-call.
    mockFindUnique = jest.fn().mockResolvedValue(null);
  });

  it('feeds FAIL_TRANSIENT for a classified TIMEOUT', async () => {
    mockResolveAdapter.mockReturnValue({
      call: jest.fn().mockRejectedValue({
        code: ProviderErrorCode.TIMEOUT,
        httpStatus: 504,
        message: 'Provider call timed out after 10000ms',
        provider: 'loc',
        toolId: 'loc.search',
        durationMs: 10000,
      }),
    });

    await providerCallStage.execute(makeCtx());

    expect(mockedRecordProbeResult).toHaveBeenCalledTimes(1);
    expect(mockedRecordProbeResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'loc',
      'passive',
      'FAIL_TRANSIENT',
      expect.objectContaining({ httpStatus: 504 }),
    );
  });

  it('feeds FAIL_TRANSIENT for a classified UNAVAILABLE (5xx/connection)', async () => {
    mockResolveAdapter.mockReturnValue({
      call: jest.fn().mockRejectedValue({
        code: ProviderErrorCode.UNAVAILABLE,
        httpStatus: 502,
        message: 'Provider returned 500',
        provider: 'nrc',
        toolId: 'nrc.reactor_history',
        durationMs: 500,
      }),
    });

    await providerCallStage.execute(makeCtx());

    expect(mockedRecordProbeResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'nrc',
      'passive',
      'FAIL_TRANSIENT',
      expect.anything(),
    );
  });

  // Attempt-2 fed this to FAIL_DETERMINISTIC and Fable rejected it
  // (ruling-2): a single WAF-triggered 403 from one bot's odd input — the
  // heartbeat's own traffic shape — must not pause the whole provider for
  // 24h off one request. BaseAdapter.call() already flags `probe:asap:
  // {provider}` on every ProviderError including this one; the active
  // probe's own probeAuth is the one place that gets to call a key dead.
  it('does NOT feed a health signal for PROVIDER_AUTH (401/402/403) — no more passive FAIL_DETERMINISTIC', async () => {
    mockResolveAdapter.mockReturnValue({
      call: jest.fn().mockRejectedValue({
        code: ProviderErrorCode.PROVIDER_AUTH,
        httpStatus: 503,
        message: 'Provider rejected our credentials (HTTP 403)',
        provider: 'nrc',
        toolId: 'nrc.annual_data',
        durationMs: 300,
      }),
    });

    await providerCallStage.execute(makeCtx());

    expect(mockedRecordProbeResult).not.toHaveBeenCalled();
  });

  it('does NOT feed a health signal for INPUT_REJECTED (422 — caller input, not upstream health)', async () => {
    mockResolveAdapter.mockReturnValue({
      call: jest.fn().mockRejectedValue({
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: 'Provider rejected the request',
        provider: 'cma',
        toolId: 'cma.search',
        durationMs: 100,
      }),
    });

    await providerCallStage.execute(makeCtx());

    expect(mockedRecordProbeResult).not.toHaveBeenCalled();
  });

  // The exact trap this task's review caught: a catalog/adapter tool_id
  // mismatch (or any other of our own bugs) throws INVALID_RESPONSE
  // ("Unsupported tool: ...") on every single call — feeding that into the
  // provider-level health signal would demote the WHOLE provider (e.g. cma)
  // even though its other, correctly-wired tools (cma.search) work fine.
  it('does NOT feed a health signal for INVALID_RESPONSE (our own catalog/adapter mismatch, not an upstream signal)', async () => {
    mockResolveAdapter.mockReturnValue({
      call: jest.fn().mockRejectedValue({
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'Unsupported tool: cma.artwork_search',
        provider: 'cma',
        toolId: 'cma.artwork_search',
        durationMs: 0,
      }),
    });

    await providerCallStage.execute(makeCtx());

    expect(mockedRecordProbeResult).not.toHaveBeenCalled();
  });

  it('does NOT feed a health signal for a raw unclassified error (no recognizable .code)', async () => {
    mockResolveAdapter.mockReturnValue({
      call: jest.fn().mockRejectedValue(new Error('boom')),
    });

    await providerCallStage.execute(makeCtx());

    expect(mockedRecordProbeResult).not.toHaveBeenCalled();
  });

  it('falls back to the toolId prefix as the provider when the error carries no .provider', async () => {
    const ctx = makeCtx();
    ctx.toolId = 'weather.forecast';
    mockResolveAdapter.mockReturnValue({
      call: jest.fn().mockRejectedValue({
        code: ProviderErrorCode.UNAVAILABLE,
        httpStatus: 502,
        message: 'Provider connection failed',
        toolId: 'weather.forecast',
        durationMs: 200,
      }),
    });

    await providerCallStage.execute(ctx);

    expect(mockedRecordProbeResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'weather',
      'passive',
      'FAIL_TRANSIENT',
      expect.anything(),
    );
  });

  it('debounces repeated failures for the same provider within the window — only the first calls recordProbeResult', async () => {
    mockResolveAdapter.mockReturnValue({
      call: jest.fn().mockRejectedValue({
        code: ProviderErrorCode.UNAVAILABLE,
        httpStatus: 502,
        message: 'Provider returned 500',
        provider: 'flakyco',
        toolId: 'flakyco.tool',
        durationMs: 500,
      }),
    });

    await providerCallStage.execute(makeCtx());
    await providerCallStage.execute(makeCtx());
    await providerCallStage.execute(makeCtx());

    // 3 failed requests, same provider, same debounce window -> 1 write.
    expect(mockedRecordProbeResult).toHaveBeenCalledTimes(1);
  });

  it('does not debounce ACROSS different providers', async () => {
    const err = (provider: string) => ({
      code: ProviderErrorCode.UNAVAILABLE,
      httpStatus: 502,
      message: 'Provider returned 500',
      provider,
      toolId: `${provider}.tool`,
      durationMs: 500,
    });
    mockResolveAdapter.mockReturnValueOnce({ call: jest.fn().mockRejectedValue(err('alpha')) });
    await providerCallStage.execute(makeCtx());
    mockResolveAdapter.mockReturnValueOnce({ call: jest.fn().mockRejectedValue(err('beta')) });
    await providerCallStage.execute(makeCtx());

    expect(mockedRecordProbeResult).toHaveBeenCalledTimes(2);
  });

  // F1 spacing gate (ruling-2): the debounce alone re-arms every
  // PASSIVE_CALL_FAILURE_DEBOUNCE_S (30s) regardless of the interval the
  // state machine's own last transition earned — attempt-2's simulation
  // showed a sustained outage walking HEALTHY -> DOWN's 24h backoff cap in
  // under 5 minutes of real traffic. The next_probe_at gate is what actually
  // enforces "at most once per adaptive interval".
  it('the next_probe_at gate BLOCKS a passive signal when the provider is not due yet', async () => {
    mockFindUnique.mockResolvedValue({ next_probe_at: new Date(Date.now() + 60_000) });
    mockResolveAdapter.mockReturnValue({
      call: jest.fn().mockRejectedValue({
        code: ProviderErrorCode.UNAVAILABLE,
        httpStatus: 502,
        message: 'Provider returned 500',
        provider: 'nrc',
        toolId: 'nrc.reactor_history',
        durationMs: 500,
      }),
    });

    await providerCallStage.execute(makeCtx());

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { provider: 'nrc' },
      select: { next_probe_at: true },
    });
    expect(mockedRecordProbeResult).not.toHaveBeenCalled();
  });

  it('the next_probe_at gate ALLOWS a passive signal once the earned interval has elapsed', async () => {
    mockFindUnique.mockResolvedValue({ next_probe_at: new Date(Date.now() - 60_000) });
    mockResolveAdapter.mockReturnValue({
      call: jest.fn().mockRejectedValue({
        code: ProviderErrorCode.UNAVAILABLE,
        httpStatus: 502,
        message: 'Provider returned 500',
        provider: 'nrc',
        toolId: 'nrc.reactor_history',
        durationMs: 500,
      }),
    });

    await providerCallStage.execute(makeCtx());

    expect(mockedRecordProbeResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'nrc',
      'passive',
      'FAIL_TRANSIENT',
      expect.anything(),
    );
  });

  it('the next_probe_at gate treats a never-probed provider (null row) as always due', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockResolveAdapter.mockReturnValue({
      call: jest.fn().mockRejectedValue({
        code: ProviderErrorCode.UNAVAILABLE,
        httpStatus: 502,
        message: 'Provider returned 500',
        provider: 'brandnew',
        toolId: 'brandnew.tool',
        durationMs: 500,
      }),
    });

    await providerCallStage.execute(makeCtx());

    expect(mockedRecordProbeResult).toHaveBeenCalledTimes(1);
  });

  it('never lets a recordProbeResult failure change the response returned to the client', async () => {
    mockedRecordProbeResult.mockRejectedValueOnce(new Error('db down'));
    mockResolveAdapter.mockReturnValue({
      call: jest.fn().mockRejectedValue({
        code: ProviderErrorCode.TIMEOUT,
        httpStatus: 504,
        message: 'Provider call timed out after 10000ms',
        provider: 'loc',
        toolId: 'loc.search',
        durationMs: 10000,
      }),
    });

    const result = await providerCallStage.execute(makeCtx());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(504);
      expect(result.error.error).toBe(ProviderErrorCode.TIMEOUT);
    }
  });
});
