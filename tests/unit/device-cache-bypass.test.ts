// Ф5 (2026-09-02): device.* tools must NEVER reach the shared Redis cache --
// see cache.stage.ts's doc comment for why a shared cache hit would bypass
// the per-agent connection-ownership check that lives in the provider-call
// stage (PROVIDER_CALL runs the adapter; a cache hit skips it entirely).

jest.mock('../../src/services/cache.service', () => ({
  generateCacheKey: jest.fn(() => 'mock-key'),
  getCache: jest.fn(),
  acquireLock: jest.fn(),
  waitForResult: jest.fn(),
}));

import { cacheStage } from '../../src/pipeline/stages/cache.stage';
import * as cacheService from '../../src/services/cache.service';
import type { PipelineContext } from '../../src/pipeline/types';

function makeCtx(toolId: string): PipelineContext {
  return {
    requestId: 'req_test',
    toolId,
    body: { device_id: 'shared-guessable-id' },
  } as unknown as PipelineContext;
}

describe('cache.stage.ts agent-scoped bypass (Ф5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('never touches Redis for device.state', async () => {
    const ctx = makeCtx('device.state');
    const result = await cacheStage.execute(ctx);

    expect(result.ok).toBe(true);
    expect(ctx.cacheHit).toBe(false);
    expect(ctx.isLockOwner).toBe(true);
    expect(cacheService.getCache).not.toHaveBeenCalled();
    expect(cacheService.acquireLock).not.toHaveBeenCalled();
  });

  it('never touches Redis for device.command', async () => {
    const ctx = makeCtx('device.command');
    await cacheStage.execute(ctx);

    expect(cacheService.getCache).not.toHaveBeenCalled();
  });

  it('never touches Redis for device.list', async () => {
    const ctx = makeCtx('device.list');
    await cacheStage.execute(ctx);

    expect(cacheService.getCache).not.toHaveBeenCalled();
  });

  it('still uses the shared cache for a public, non-device tool (regression check)', async () => {
    (cacheService.getCache as jest.Mock).mockResolvedValue(null);
    (cacheService.acquireLock as jest.Mock).mockResolvedValue(true);

    const ctx = makeCtx('weather.get_current');
    await cacheStage.execute(ctx);

    expect(cacheService.getCache).toHaveBeenCalledWith('mock-key');
  });
});
