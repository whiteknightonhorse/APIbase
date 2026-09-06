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

import { providerCallStage } from '../../../src/pipeline/stages/provider-call.stage';
import { resolveAdapter } from '../../../src/adapters/registry';
import { createPipelineContext } from '../../../src/pipeline/types';
import { ProviderErrorCode } from '../../../src/types/provider';

const mockResolveAdapter = resolveAdapter as jest.Mock;

function makeCtx() {
  const ctx = createPipelineContext('req-1', 'POST', '/api/v1/tools/x/call', {}, {});
  ctx.toolId = 'test.tool';
  return ctx;
}

describe('providerCallStage', () => {
  beforeEach(() => {
    mockResolveAdapter.mockReset();
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
